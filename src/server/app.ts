import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { v1Router } from './routes/v1/index.js';
import { errorHandler } from './middleware/error.js';
import { rateLimitHeaders } from './middleware/rateLimit.js';
import { contentTypeGuard } from './middleware/contentType.js';
import { authenticate } from './security/authMiddleware.js';
import { idempotency } from './middleware/idempotency.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Set API-wide headers like rate limits (best-effort placeholder)
app.use(rateLimitHeaders());
app.use(contentTypeGuard());
app.use(authenticate);
app.use(idempotency());

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use('/v1', v1Router);

// Error handler must be last
app.use(errorHandler);
