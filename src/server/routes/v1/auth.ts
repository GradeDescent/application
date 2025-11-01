import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../../services/prisma.js';
import { hashPassword, verifyPassword } from '../../../utils/crypto.js';
import { signUserJwt } from '../../../utils/jwt.js';
import { jsonOk } from '../../../utils/responses.js';
import { createMagicToken, consumeMagicToken } from '../../../services/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

authRouter.post('/password/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return res.status(409).json({ error: { type: 'conflict', message: 'Email already registered' } });
    }
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({ data: { email: body.email, passwordHash, name: body.name } });
    const token = await signUserJwt({ id: user.id, email: user.email });
    return jsonOk(res, { token, user });
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

authRouter.post('/password/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: { type: 'auth_error', message: 'Invalid credentials' } });
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: { type: 'auth_error', message: 'Invalid credentials' } });
    }
    const token = await signUserJwt({ id: user.id, email: user.email });
    return jsonOk(res, { token, user });
  } catch (err) {
    next(err);
  }
});

const magicRequestSchema = z.object({ email: z.string().email() });

authRouter.post('/magic/request', async (req, res, next) => {
  try {
    const { email } = magicRequestSchema.parse(req.body);
    await createMagicToken(email);
    return jsonOk(res, { message: 'If the email exists, a link was sent.' });
  } catch (err) {
    next(err);
  }
});

const magicVerifySchema = z.object({ token: z.string().min(10) });

authRouter.post('/magic/verify', async (req, res, next) => {
  try {
    const { token } = magicVerifySchema.parse(req.body);
    const user = await consumeMagicToken(token);
    const jwt = await signUserJwt({ id: user.id, email: user.email });
    return jsonOk(res, { token: jwt, user });
  } catch (err) {
    next(err);
  }
});

// Placeholders for social auth routes
authRouter.get('/oauth/:provider/start', (_req, res) => {
  res.status(501).json({ error: { type: 'not_implemented', message: 'OAuth start not implemented' } });
});

authRouter.get('/oauth/:provider/callback', (_req, res) => {
  res.status(501).json({ error: { type: 'not_implemented', message: 'OAuth callback not implemented' } });
});

