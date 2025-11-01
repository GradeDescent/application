import { NextFunction, Request, Response } from 'express';

export function contentTypeGuard() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const ct = req.headers['content-type'] || '';
      if (!ct.toString().includes('application/json')) {
        return res.status(415).json({ error: { type: 'unsupported_media_type', message: 'Use application/json' } });
      }
    }
    res.type('application/json');
    next();
  };
}

