import { Request } from 'express';

export function parsePagination(req: Request) {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  return { limit, cursor };
}

