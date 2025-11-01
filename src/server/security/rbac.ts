import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../services/prisma.js';

type Role = 'OWNER' | 'INSTRUCTOR' | 'TA' | 'STUDENT';

export function requireCourseRole(courseIdParam: string, allowed: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: { type: 'auth_error', message: 'Unauthorized' } });
    const courseId = req.params[courseIdParam];
    const membership = await prisma.courseMembership.findUnique({
      where: { userId_courseId: { userId: auth.user.id, courseId } },
      select: { role: true },
    });
    if (!membership || !allowed.includes(membership.role as Role)) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    return next();
  };
}

