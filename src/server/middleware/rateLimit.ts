import { NextFunction, Request, Response } from 'express';

// Lightweight header-only rate limit helper.
// Implement real limits in an edge/gateway later (e.g., Cloudflare/NGINX/Redis).
export function rateLimitHeaders(limit = Number(process.env.RATE_LIMIT_PER_MINUTE || 100)) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-RateLimit-Limit', String(limit));
    // Not tracking per-user counters here; placeholder shows remaining as limit
    res.setHeader('X-RateLimit-Remaining', String(limit));
    next();
  };
}

