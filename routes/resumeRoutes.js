import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadResume, scoreResume, getAllResumes, getResumeById, getShortlisted, deleteResume } from '../controllers/resumeController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')}`)
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname)) return cb(null, true);
    return cb(new Error('Only PDF files are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

const router = Router();

router.post('/upload-resume', upload.single('resume'), uploadResume);
router.post('/score-resume', scoreResume);
router.get('/resumes', getAllResumes);
router.get('/resumes/:id', getResumeById);
router.get('/shortlisted', getShortlisted);
router.delete('/resumes/:id', deleteResume);

export default router;


