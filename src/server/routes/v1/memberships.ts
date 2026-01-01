import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../../services/prisma.js';
import { authRequired } from '../../security/authMiddleware.js';
import { requireCourseRole } from '../../security/rbac.js';
import { jsonOk } from '../../../utils/responses.js';

export const membershipsRouter = Router();

const roleEnum = z.enum(['OWNER', 'INSTRUCTOR', 'TA', 'STUDENT']);

const joinCourseSchema = z.object({
  courseCode: z.string().min(1),
});

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

membershipsRouter.post('/:courseId/members', authRequired, async (req, res, next) => {
  try {
    const body = joinCourseSchema.parse(req.body);
    const course = await prisma.course.findUnique({ where: { id: req.params.courseId } });
    if (!course) return res.status(404).json({ error: { type: 'not_found', message: 'Course not found' } });
    if (course.code !== body.courseCode.trim().toLowerCase()) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Invalid course code' } });
    }

    const membership = await prisma.courseMembership.upsert({
      where: { userId_courseId: { userId: req.auth!.user.id, courseId: req.params.courseId } },
      create: { userId: req.auth!.user.id, courseId: req.params.courseId, role: 'STUDENT' },
      update: { role: 'STUDENT' },
    });
    return jsonOk(res, { membership }, 201);
  } catch (err) {
    next(err);
  }
});

membershipsRouter.put('/:courseId/members/:userId', authRequired, requireCourseRole('courseId', ['OWNER', 'INSTRUCTOR']), async (req, res, next) => {
  try {
    const role = roleEnum.parse(req.body.role);
    const requester = await prisma.courseMembership.findUnique({
      where: { userId_courseId: { userId: req.auth!.user.id, courseId: req.params.courseId } },
      select: { role: true },
    });
    if (!requester) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (requester.role === 'INSTRUCTOR') {
      if (role !== 'TA' && role !== 'STUDENT') {
        return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
      }
    } else if (requester.role === 'OWNER') {
      if (role === 'OWNER') {
        return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
      }
    } else {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
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
