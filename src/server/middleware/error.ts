import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'root';
      fields[key] = issue.message;
    }
    return res.status(400).json({ error: { type: 'validation_error', message: 'Validation failed', fields } });
  }
  if (typeof err === 'object' && err && 'status' in (err as any)) {
    const e = err as any;
    return res.status(e.status || 500).json({ error: { type: e.type || 'error', message: e.message || 'Error' } });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: { type: 'internal_error', message: 'Something went wrong' } });
}

