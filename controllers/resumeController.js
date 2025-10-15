import fs from 'fs/promises';
import axios from 'axios';
import Resume from '../models/Resume.js';

// Helpers extract candidate metadata from raw PDF text.
// These are heuristic and intentionally conservative to avoid noisy results.

function extractCandidateName(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const first = lines[0];
    if (first.length <= 80 && !/^email:?/i.test(first) && !/^phone:?/i.test(first)) {
      return first;
    }
  }
  const nameMatch = text.match(/(?:^|\n)\s*Name\s*:\s*(.+)/i);
  return nameMatch ? nameMatch[1].split(/\r?\n/)[0].trim() : undefined;
}

function extractEmail(text) {
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch ? emailMatch[0] : undefined;
}

function extractPhone(text) {
  const phoneMatch = text.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}/);
  return phoneMatch ? phoneMatch[0] : undefined;
}

function extractSkills(text) {
  const section = /skills?\s*:\s*([\s\S]*?)(?:\n\s*\n|\n\w+\s*:|$)/i.exec(text);
  if (section && section[1]) {
    return section[1]
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return [];
}

// Accepts a PDF upload, extracts text, derives basic fields, and stores a Resume
export async function uploadResume(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const fileBuffer = await fs.readFile(file.path);

    // Try primary parser, then fall back to an alternate build if needed
    let pdfText = '';
    try {
      const mod = await import('pdf-parse');
      const pdfParse = mod.default || mod;
      const pdfData = await pdfParse(fileBuffer);
      pdfText = (pdfData.text || '').trim();
    } catch (primaryErr) {
      try {
        const modAlt = await import('pdf-parse-fixed');
        const pdfParseAlt = modAlt.default || modAlt;
        const pdfDataAlt = await pdfParseAlt(fileBuffer);
        pdfText = (pdfDataAlt.text || '').trim();
      } catch (fallbackErr) {
        // eslint-disable-next-line no-console
        console.error('PDF parsing failed', { primary: primaryErr?.message, fallback: fallbackErr?.message });
      }
    }

    if (!pdfText) {
      return res.status(422).json({ error: 'Unable to extract text from PDF' });
    }

    const candidateName = extractCandidateName(pdfText);
    const email = extractEmail(pdfText);
    const phone = extractPhone(pdfText);
    const skills = extractSkills(pdfText);

    const resume = new Resume({
      candidateName,
      email,
      phone,
      skills,
      pdfText,
      fileName: file.originalname
    });

    await resume.save();

    return res.status(201).json({ id: resume._id, message: 'Resume uploaded and parsed successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to process resume' });
  }
}

// Calls an external scoring endpoint to produce a matchScore and justification
export async function scoreResume(req, res) {
  try {
    const { resumeId, jobDescription } = req.body || {};

    if (!resumeId || !jobDescription || typeof jobDescription !== 'string' || !jobDescription.trim()) {
      return res.status(400).json({ error: 'resumeId and jobDescription are required' });
    }

    const resume = await Resume.findById(resumeId);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const resumeText = resume.pdfText || '';
    if (!resumeText) {
      return res.status(400).json({ error: 'Resume has no extracted text to score' });
    }

    const endpoint = process.env.LLM_ENDPOINT;
    if (!endpoint) {
      return res.status(500).json({ error: 'LLM_ENDPOINT is not configured on the server' });
    }

    const response = await axios.post(endpoint, {
      resumeText,
      jobDescription
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const { score, justification } = response?.data || {};
    if (typeof score !== 'number' || score < 0 || score > 100 || typeof justification !== 'string') {
      return res.status(502).json({ error: 'Invalid response from scoring service' });
    }

    resume.matchScore = score;
    resume.justification = justification;
    await resume.save();

    return res.status(200).json(resume);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to score resume' });
  }
}

// List all resumes sorted by score (desc) and recency
export async function getAllResumes(_req, res) {
  try {
    const items = await Resume.find({}).sort({ matchScore: -1, createdAt: -1 });
    return res.status(200).json(items);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch resumes' });
  }
}

// Fetch a single resume by ID
export async function getResumeById(req, res) {
  try {
    const { id } = req.params;
    const item = await Resume.findById(id);
    if (!item) return res.status(404).json({ error: 'Resume not found' });
    return res.status(200).json(item);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch resume' });
  }
}

// Return resumes above a threshold (>= 7)
export async function getShortlisted(_req, res) {
  try {
    const items = await Resume.find({ matchScore: { $gte: 7 } }).sort({ matchScore: -1, createdAt: -1 });
    return res.status(200).json(items);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch shortlisted resumes' });
  }
}

// Delete a resume by ID (and optionally remove associated file when stored)
export async function deleteResume(req, res) {
  try {
    const { id } = req.params;
    const item = await Resume.findById(id);
    if (!item) return res.status(404).json({ error: 'Resume not found' });

    // Attempt to remove associated PDF if stored name is recoverable
    // We stored only original fileName earlier; if you later add stored filename, delete here.
    // Keeping deletion best-effort so API remains robust.

    await item.deleteOne();
    return res.status(200).json({ message: 'Resume deleted' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete resume' });
  }
}


