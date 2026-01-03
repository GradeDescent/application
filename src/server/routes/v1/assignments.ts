import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../../services/prisma.js';
import { authRequired } from '../../security/authMiddleware.js';
import { jsonOk } from '../../../utils/responses.js';
import { parsePagination } from '../../support/pagination.js';
import { getCourseBalance, paymentRequiredPayload } from '../../support/billing.js';
import { createAssignmentPipeline, enforceBillingGate } from '../../support/pipelines.js';

type Role = 'OWNER' | 'INSTRUCTOR' | 'TA' | 'STUDENT';

const STAFF_ROLES: Role[] = ['OWNER', 'INSTRUCTOR', 'TA'];
const PUBLISH_ROLES: Role[] = ['OWNER', 'INSTRUCTOR'];

const statusEnum = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

const createAssignmentSchema = z.object({
  title: z.string().min(1),
  dueAt: z.string().datetime({ offset: true }).optional(),
  totalPoints: z.number().int().min(0),
  sourceTex: z.string().min(1),
});

const updateAssignmentSchema = z.object({
  title: z.string().min(1).optional(),
  dueAt: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
  totalPoints: z.number().int().min(0).optional(),
  sourceTex: z.string().min(1).optional(),
});

export const assignmentsRouter = Router({ mergeParams: true });

async function requireCourseRole(req: Request, res: Response, courseId: string, allowedRoles?: Role[]) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) {
    res.status(404).json({ error: { type: 'not_found', message: 'Course not found' } });
    return null;
  }

  const membership = await prisma.courseMembership.findUnique({
    where: { userId_courseId: { userId: req.auth!.user.id, courseId } },
    select: { role: true },
  });
  if (!membership) {
    res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(membership.role as Role)) {
    res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    return null;
  }
  return membership.role as Role;
}

assignmentsRouter.post('/', authRequired, async (req, res, next) => {
  try {
    const role = await requireCourseRole(req, res, req.params.courseId, STAFF_ROLES);
    if (!role) return;

    const body = createAssignmentSchema.parse(req.body);
    const gate = await enforceBillingGate(req.params.courseId);
    if (!gate.ok) {
      return res.status(gate.status).json(gate.body);
    }
    const assignment = await prisma.assignment.create({
      data: {
        courseId: req.params.courseId,
        title: body.title,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        totalPoints: body.totalPoints,
        sourceTex: body.sourceTex,
        createdById: req.auth!.user.id,
        status: 'DRAFT',
      },
    });
    const run = await createAssignmentPipeline({
      courseId: req.params.courseId,
      assignmentId: assignment.id,
      accountId: gate.accountId,
      createdByUserId: req.auth!.user.id,
    });
    if (!run.ok) {
      return res.status(run.status).json(run.body);
    }
    return jsonOk(res, { assignment }, 201);
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.get('/', authRequired, async (req, res, next) => {
  try {
    const role = await requireCourseRole(req, res, req.params.courseId);
    if (!role) return;

    const status = statusEnum.optional().parse(req.query.status);
    if (role === 'STUDENT' && status && status !== 'PUBLISHED') {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }

    const { limit, cursor } = parsePagination(req);
    const where: Record<string, unknown> = { courseId: req.params.courseId };
    if (status) {
      where.status = status;
    } else if (role === 'STUDENT') {
      where.status = 'PUBLISHED';
    } else {
      where.status = { not: 'ARCHIVED' };
    }

    const items = await prisma.assignment.findMany({
      where,
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const nextItem = items.pop()!;
      nextCursor = nextItem.id;
    }

    return jsonOk(res, { items, next_cursor: nextCursor });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.get('/:assignmentId', authRequired, async (req, res, next) => {
  try {
    const role = await requireCourseRole(req, res, req.params.courseId);
    if (!role) return;

    const assignment = await prisma.assignment.findFirst({
      where: { id: req.params.assignmentId, courseId: req.params.courseId },
    });
    if (!assignment) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Assignment not found' } });
    }
    if (role === 'STUDENT' && assignment.status !== 'PUBLISHED') {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    return jsonOk(res, { assignment });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.patch('/:assignmentId', authRequired, async (req, res, next) => {
  try {
    const role = await requireCourseRole(req, res, req.params.courseId, STAFF_ROLES);
    if (!role) return;

    const body = updateAssignmentSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (Object.prototype.hasOwnProperty.call(body, 'dueAt')) {
      if (body.dueAt === null) {
        data.dueAt = null;
      } else if (body.dueAt !== undefined) {
        data.dueAt = new Date(body.dueAt);
      }
    }
    if (body.totalPoints !== undefined) data.totalPoints = body.totalPoints;
    if (body.sourceTex !== undefined) data.sourceTex = body.sourceTex;
    if (!Object.keys(data).length) {
      return res.status(400).json({ error: { type: 'validation_error', message: 'No fields to update' } });
    }

    const existing = await prisma.assignment.findFirst({
      where: { id: req.params.assignmentId, courseId: req.params.courseId },
    });
    if (!existing) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Assignment not found' } });
    }
    const sourceTexChanged = body.sourceTex !== undefined && body.sourceTex !== existing.sourceTex;
    let gateAccountId: string | null = null;
    if (sourceTexChanged) {
      const gate = await enforceBillingGate(req.params.courseId);
      if (!gate.ok) {
        return res.status(gate.status).json(gate.body);
      }
      gateAccountId = gate.accountId;
    }

    const assignment = await prisma.assignment.update({
      where: { id: existing.id },
      data,
    });
    if (sourceTexChanged) {
      const run = await createAssignmentPipeline({
        courseId: req.params.courseId,
        assignmentId: assignment.id,
        accountId: gateAccountId ?? undefined,
        createdByUserId: req.auth!.user.id,
      });
      if (!run.ok) {
        return res.status(run.status).json(run.body);
      }
    }
    return jsonOk(res, { assignment });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.post('/:assignmentId/publish', authRequired, async (req, res, next) => {
  try {
    const role = await requireCourseRole(req, res, req.params.courseId, PUBLISH_ROLES);
    if (!role) return;

    const assignment = await prisma.assignment.findFirst({
      where: { id: req.params.assignmentId, courseId: req.params.courseId },
    });
    if (!assignment) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Assignment not found' } });
    }
    if (assignment.status === 'ARCHIVED') {
      return res.status(409).json({ error: { type: 'conflict', message: 'Assignment archived' } });
    }

    if (assignment.status === 'PUBLISHED' && assignment.publishedAt) {
      return jsonOk(res, { assignment });
    }

    const billing = await getCourseBalance(req.params.courseId);
    if (!billing) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Course not found' } });
    }
    if (billing.balanceMicrodollars < 0n) {
      return res.status(402).json(paymentRequiredPayload(billing.balanceMicrodollars));
    }

    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: assignment.publishedAt ?? new Date(),
      },
    });
    return jsonOk(res, { assignment: updated });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.post('/:assignmentId/unpublish', authRequired, async (req, res, next) => {
  try {
    const role = await requireCourseRole(req, res, req.params.courseId, PUBLISH_ROLES);
    if (!role) return;

    const assignment = await prisma.assignment.findFirst({
      where: { id: req.params.assignmentId, courseId: req.params.courseId },
    });
    if (!assignment) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Assignment not found' } });
    }
    if (assignment.status === 'ARCHIVED') {
      return res.status(409).json({ error: { type: 'conflict', message: 'Assignment archived' } });
    }

    if (assignment.status === 'DRAFT') {
      return jsonOk(res, { assignment });
    }

    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        status: 'DRAFT',
        publishedAt: null,
      },
    });
    return jsonOk(res, { assignment: updated });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.delete('/:assignmentId', authRequired, async (req, res, next) => {
  try {
    const role = await requireCourseRole(req, res, req.params.courseId, STAFF_ROLES);
    if (!role) return;

    const assignment = await prisma.assignment.findFirst({
      where: { id: req.params.assignmentId, courseId: req.params.courseId },
    });
    if (!assignment) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Assignment not found' } });
    }

    if (assignment.status === 'ARCHIVED') {
      return jsonOk(res, { assignment });
    }

    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: { status: 'ARCHIVED' },
    });
    return jsonOk(res, { assignment: updated });
  } catch (err) {
    next(err);
  }
});
