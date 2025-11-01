import { Router } from 'express';
import { authRequired } from '../../security/authMiddleware.js';
import { prisma } from '../../../services/prisma.js';
import { jsonOk } from '../../../utils/responses.js';

export const usersRouter = Router();

usersRouter.get('/me', authRequired, async (req, res, next) => {
  try {
    const me = await prisma.user.findUnique({ where: { id: req.auth!.user.id } });
    return jsonOk(res, { user: me });
  } catch (err) {
    next(err);
  }
});

