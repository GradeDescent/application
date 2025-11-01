import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../services/prisma.js';

const METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function idempotency() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header('Idempotency-Key');
    if (!key || !METHODS.has(req.method)) return next();

    const userId = req.auth?.user.id;

    try {
      const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
      if (existing) {
        if (existing.responseBody && existing.statusCode) {
          res.status(existing.statusCode).json(existing.responseBody as any);
          return;
        }
        // In progress or no stored response yet
        res.setHeader('Retry-After', '1');
        res.status(409).json({ error: { type: 'conflict', message: 'Request in progress' } });
        return;
      }

      await prisma.idempotencyKey.create({
        data: {
          key,
          userId,
          method: req.method,
          path: req.path,
          lockedAt: new Date(),
        },
      });

      // Hook into response to persist the outcome
      const originalJson = res.json.bind(res);
      res.json = ((body: any) => {
        const statusCode = res.statusCode || 200;
        prisma.idempotencyKey
          .update({ where: { key }, data: { responseBody: body as any, statusCode } })
          .catch(() => undefined);
        return originalJson(body);
      }) as any;
      next();
    } catch (err) {
      next(err);
    }
  };
}

