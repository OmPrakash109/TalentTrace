import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import apiRouter from './routes/index.js';

dotenv.config(); // Load environment variables early

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Core middlewares for API ergonomics and security basics
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static UI and uploaded files
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount versionless API router under /api
app.use('/api', apiRouter);

// Lightweight uptime probe for health checks
app.get('/health', (_req, res) => {
	res.status(200).json({ status: 'ok' });
});

// Redirect site root to the dashboard UI
app.get('/', (_req, res) => {
  res.redirect('/public/');
});

// 404 for any route not handled above
app.use((req, res, _next) => {
	res.status(404).json({ error: 'Not found' });
});

// Centralized error handler to avoid leaking stack traces to clients
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
	res.status(500).json({ error: err?.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;

// Connect to MongoDB but start the server regardless to keep UI accessible
(async () => {
	await connectDB();
	app.listen(PORT, () => {
		// eslint-disable-next-line no-console
		console.log(`TalentTrace server running on port ${PORT}`);
	});
})();


