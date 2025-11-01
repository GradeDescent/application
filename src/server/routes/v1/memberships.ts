import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../../services/prisma.js';
import { authRequired } from '../../security/authMiddleware.js';
import { requireCourseRole } from '../../security/rbac.js';
import { jsonOk } from '../../../utils/responses.js';

export const membershipsRouter = Router();

const roleEnum = z.enum(['OWNER', 'INSTRUCTOR', 'TA', 'STUDENT']);

membershipsRouter.get('/:courseId/members', authRequired, requireCourseRole('courseId', ['OWNER', 'INSTRUCTOR', 'TA']), async (req, res, next) => {
  try {
    const members = await prisma.courseMembership.findMany({
      where: { courseId: req.params.courseId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return jsonOk(res, { items: members });
  } catch (err) {
    next(err);
  }
});

const upsertMemberSchema = z.object({ userId: z.string().min(1), role: roleEnum });

membershipsRouter.post('/:courseId/members', authRequired, requireCourseRole('courseId', ['OWNER', 'INSTRUCTOR']), async (req, res, next) => {
  try {
    const body = upsertMemberSchema.parse(req.body);
    const membership = await prisma.courseMembership.upsert({
      where: { userId_courseId: { userId: body.userId, courseId: req.params.courseId } },
      create: { userId: body.userId, courseId: req.params.courseId, role: body.role },
      update: { role: body.role },
    });
    return jsonOk(res, { membership }, 201);
  } catch (err) {
    next(err);
  }
});

membershipsRouter.put('/:courseId/members/:userId', authRequired, requireCourseRole('courseId', ['OWNER', 'INSTRUCTOR']), async (req, res, next) => {
  try {
    const role = roleEnum.parse(req.body.role);
    const membership = await prisma.courseMembership.update({
      where: { userId_courseId: { userId: req.params.userId, courseId: req.params.courseId } },
      data: { role },
    });
    return jsonOk(res, { membership });
  } catch (err) {
    next(err);
  }
});

membershipsRouter.delete('/:courseId/members/:userId', authRequired, requireCourseRole('courseId', ['OWNER', 'INSTRUCTOR']), async (req, res, next) => {
  try {
    await prisma.courseMembership.delete({ where: { userId_courseId: { userId: req.params.userId, courseId: req.params.courseId } } });
    return jsonOk(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

