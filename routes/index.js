import { Router } from 'express';
import resumeRoutes from './resumeRoutes.js';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ service: 'talentrace', status: 'running' });
});

router.use('/resumes', resumeRoutes);

export default router;


