import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../../services/prisma.js';
import { authRequired } from '../../security/authMiddleware.js';
import { jsonOk } from '../../../utils/responses.js';
import { parsePagination } from '../../support/pagination.js';
import { requireCourseRole } from '../../security/rbac.js';
import { generateUniqueCourseCode, isUrlSafeCourseCode, normalizeCourseCode } from '../../support/courseCodes.js';
import { getCourseBalance, getOrCreateUserAccount } from '../../support/billing.js';

export const coursesRouter = Router();

const createCourseSchema = z.object({
  title: z.string().min(1),
  code: z.string().trim().min(1).optional(),
  description: z.string().optional(),
});

const updateCourseSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

coursesRouter.post('/', authRequired, async (req, res, next) => {
  try {
    const body = createCourseSchema.parse(req.body);
    const desiredCode = body.code ? normalizeCourseCode(body.code) : undefined;
    if (desiredCode && !isUrlSafeCourseCode(desiredCode)) {
      return res.status(400).json({ error: { type: 'validation_error', message: 'Course code must be URL-safe' } });
    }
    const code = desiredCode
      ? desiredCode
      : await generateUniqueCourseCode(async (candidate) => {
          const existing = await prisma.course.findFirst({ where: { code: candidate } });
          return Boolean(existing);
        });
    if (desiredCode) {
      const existing = await prisma.course.findFirst({ where: { code } });
      if (existing) {
        return res.status(409).json({ error: { type: 'conflict', message: 'Course code already in use' } });
      }
    }
    const course = await prisma.$transaction(async (tx) => {
      const account = await getOrCreateUserAccount(req.auth!.user.id, tx);
      const created = await tx.course.create({
        data: {
          title: body.title,
          code,
          description: body.description,
          createdById: req.auth!.user.id,
          memberships: {
            create: { userId: req.auth!.user.id, role: 'OWNER' },
          },
        },
      });
      await tx.courseBilling.create({
        data: { courseId: created.id, accountId: account.id },
      });
      return created;
    });
    return jsonOk(res, { course }, 201);
  } catch (err) {
    next(err);
  }
});

coursesRouter.get('/', authRequired, async (req, res, next) => {
  try {
    const { limit, cursor } = parsePagination(req);
    const items = await prisma.courseMembership.findMany({
      where: { userId: req.auth!.user.id },
      include: { course: true },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    let nextCursor: string | null = null;
    if (items.length > limit) {
      const next = items.pop()!;
      nextCursor = next.id;
    }
    const courses = items.map((m) => ({ ...m.course, role: m.role }));
    return jsonOk(res, { items: courses, next_cursor: nextCursor });
  } catch (err) {
    next(err);
  }
});

coursesRouter.get('/:courseId', authRequired, requireCourseRole('courseId', ['OWNER', 'INSTRUCTOR', 'TA', 'STUDENT']), async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({ where: { id: req.params.courseId } });
    if (!course) return res.status(404).json({ error: { type: 'not_found', message: 'Course not found' } });
    return jsonOk(res, { course });
  } catch (err) {
    next(err);
  }
});

coursesRouter.patch('/:courseId', authRequired, requireCourseRole('courseId', ['OWNER']), async (req, res, next) => {
  try {
    const body = updateCourseSchema.parse(req.body);
    if (body.title === undefined && body.description === undefined) {
      return res.status(400).json({ error: { type: 'validation_error', message: 'No fields to update' } });
    }
    const course = await prisma.course.findUnique({ where: { id: req.params.courseId } });
    if (!course) return res.status(404).json({ error: { type: 'not_found', message: 'Course not found' } });

    const updated = await prisma.course.update({
      where: { id: req.params.courseId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });
    return jsonOk(res, { course: updated });
  } catch (err) {
    next(err);
  }
});

coursesRouter.get('/:courseId/billing', authRequired, requireCourseRole('courseId', ['OWNER', 'INSTRUCTOR', 'TA']), async (req, res, next) => {
  try {
    const billing = await getCourseBalance(req.params.courseId);
    if (!billing) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Course not found' } });
    }
    const now = new Date();
    const rates = await prisma.rateCard.findMany({
      where: {
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    return jsonOk(res, {
      courseId: req.params.courseId,
      accountId: billing.accountId,
      balance: {
        currency: billing.currency,
        balanceMicrodollars: Number(billing.balanceMicrodollars),
      },
      rates: rates.map((rate) => ({
        metric: rate.metric,
        unitPriceMicrodollars: Number(rate.unitPriceMicrodollars),
      })),
    });
  } catch (err) {
    next(err);
  }
});
