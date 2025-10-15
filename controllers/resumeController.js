import fs from 'fs/promises';
import Resume from '../models/Resume.js';

export async function uploadResume(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let textContent = '';
    if (file.mimetype === 'application/pdf') {
      const mod = await import('pdf-parse');
      const pdfParse = mod.default || mod;
      const fileBuffer = await fs.readFile(file.path);
      const pdfData = await pdfParse(fileBuffer);
      textContent = pdfData.text || '';
    }

    const resume = await Resume.create({
      originalFilename: file.originalname,
      storedFilename: file.filename,
      textContent,
      parsedAt: textContent ? new Date() : undefined,
      mimeType: file.mimetype,
      sizeBytes: file.size
    });

    return res.status(201).json({ id: resume._id, textLength: textContent.length });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to process resume' });
  }
}

export async function listResumes(_req, res) {
  const items = await Resume.find({}).sort({ createdAt: -1 }).limit(50);
  res.json(items.map(r => ({
    id: r._id,
    originalFilename: r.originalFilename,
    uploadedAt: r.createdAt,
    sizeBytes: r.sizeBytes,
    hasText: Boolean(r.textContent && r.textContent.length > 0)
  })));
}


