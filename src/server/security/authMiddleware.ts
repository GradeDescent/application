import { NextFunction, Request, Response } from 'express';
import { verifyUserJwt } from '../../utils/jwt.js';
import { prisma } from '../../services/prisma.js';
import { sha256 } from '../../utils/crypto.js';

export interface AuthContext {
  user: { id: string; email: string };
  tokenType: 'user' | 'service';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const hdr = req.headers.authorization;
    if (!hdr || !hdr.startsWith('Bearer ')) return next();
    const token = hdr.slice('Bearer '.length).trim();

    // Try service token first (prefix optional)
    if (token.startsWith('st.')) {
      const tokenHash = sha256(token);
      const st = await prisma.serviceToken.findUnique({ where: { tokenHash } });
      if (st) {
        const user = await prisma.user.findUnique({ where: { id: st.createdById } });
        if (user) {
          req.auth = { user: { id: user.id, email: user.email }, tokenType: 'service' };
          return next();
        }
      }
    }

    // Otherwise user JWT
    const payload = await verifyUserJwt(token);
    if (payload) {
      req.auth = { user: { id: payload.sub!, email: payload.email! }, tokenType: 'user' };
    }
    return next();
  } catch {
    return next();
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: { type: 'auth_error', message: 'Unauthorized' } });
  next();
}

