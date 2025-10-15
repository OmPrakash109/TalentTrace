import fs from 'fs/promises';
import axios from 'axios';
import Resume from '../models/Resume.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
    let score, justification;
    let source = 'unknown';

    // Skip Gemini for now - use improved heuristic scoring directly
    const googleApiKey = process.env.GOOGLE_API_KEY;
    // eslint-disable-next-line no-console
    console.log('Using improved heuristic scoring (Gemini API not accessible)');

    // Secondary path: external endpoint if configured
    if ((score == null || justification == null) && endpoint) {
      try {
        const response = await axios.post(endpoint, { resumeText, jobDescription }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
        ({ score, justification } = response?.data || {});
        if (typeof score === 'number' && typeof justification === 'string') {
          source = 'endpoint';
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('External LLM endpoint failed, falling back', e?.message || e);
      }
    }

    // Final fallback: improved heuristic scoring
    if (score == null || justification == null) {
      const jd = (jobDescription || '').toLowerCase();
      const resumeLower = (resumeText || '').toLowerCase();
      
      // Extract key skills/technologies from JD
      const techKeywords = ['javascript', 'python', 'java', 'react', 'node', 'mongodb', 'sql', 'aws', 'azure', 'docker', 'kubernetes', 'git', 'html', 'css', 'express', 'angular', 'vue', 'typescript', 'php', 'c++', 'c#', '.net', 'spring', 'django', 'flask', 'mysql', 'postgresql', 'redis', 'elasticsearch', 'kafka', 'microservices', 'api', 'rest', 'graphql', 'machine learning', 'ai', 'data science', 'analytics', 'cybersecurity', 'automation', 'cloud', 'devops', 'agile', 'scrum'];
      
      // Extract experience indicators
      const expKeywords = ['senior', 'lead', 'principal', 'architect', 'manager', 'director', 'years', 'experience', 'expert', 'advanced', 'professional'];
      
      // Count matches
      const techMatches = techKeywords.filter(tech => 
        jd.includes(tech) && resumeLower.includes(tech)
      ).length;
      
      const expMatches = expKeywords.filter(exp => 
        jd.includes(exp) && resumeLower.includes(exp)
      ).length;
      
      // Calculate score based on matches and resume quality indicators
      let baseScore = 0;
      
      // Technical skills match (0-60 points)
      const totalTechInJD = techKeywords.filter(tech => jd.includes(tech)).length;
      if (totalTechInJD > 0) {
        baseScore += Math.round((techMatches / totalTechInJD) * 60);
      }
      
      // Experience level match (0-25 points)
      const totalExpInJD = expKeywords.filter(exp => jd.includes(exp)).length;
      if (totalExpInJD > 0) {
        baseScore += Math.round((expMatches / totalExpInJD) * 25);
      }
      
      // Resume quality indicators (0-15 points)
      if (resumeLower.includes('bachelor') || resumeLower.includes('master') || resumeLower.includes('degree')) baseScore += 5;
      if (resumeLower.includes('project') || resumeLower.includes('portfolio')) baseScore += 5;
      if (resumeLower.includes('certification') || resumeLower.includes('certified')) baseScore += 5;
      
      score = Math.min(baseScore, 100);
      justification = `Heuristic analysis: ${techMatches}/${totalTechInJD} technical skills match, ${expMatches}/${totalExpInJD} experience indicators match. Resume shows ${baseScore >= 70 ? 'strong' : baseScore >= 40 ? 'moderate' : 'basic'} alignment with job requirements.`;
      source = 'heuristic';
    }

    if (typeof score !== 'number' || score < 0 || score > 100 || typeof justification !== 'string') {
      return res.status(502).json({ error: 'Invalid response from scoring service' });
    }

    resume.matchScore = score;
    resume.justification = `${justification}${source ? ` (source: ${source})` : ''}`;
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


