import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../../services/prisma.js';
import { authRequired } from '../../security/authMiddleware.js';
import { jsonOk } from '../../../utils/responses.js';
import { parsePagination } from '../../support/pagination.js';
import {
  DEFAULT_CURRENCY,
  createLedgerEntry,
  createUsageCharge,
  getOrCreateUserAccount,
} from '../../support/billing.js';

const metricSchema = z.enum(['vision_page', 'grade_problem', 'split_tex']);

const checkoutSchema = z.object({
  accountId: z.string().min(1),
  amountMicrodollars: z.number().int().positive(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const chargeSchema = z.object({
  accountId: z.string().min(1),
  courseId: z.string().min(1),
  metric: metricSchema,
  quantity: z.number().int().positive(),
  relatedType: z.string().min(1),
  relatedId: z.string().min(1),
  meta: z.record(z.any()).optional(),
});

const billingRouter = Router();

function requireUserAuth(req: any, res: any) {
  if (req.auth?.tokenType !== 'user') {
    res.status(403).json({ error: { type: 'forbidden', message: 'User token required' } });
    return false;
  }
  return true;
}

async function requireAccountOwner(req: any, res: any, accountId: string) {
  if (!requireUserAuth(req, res)) return null;
  if (!req.auth) {
    res.status(401).json({ error: { type: 'auth_error', message: 'Unauthorized' } });
    return null;
  }
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.ownerUserId !== req.auth.user.id) {
    res.status(403).json({ error: { type: 'forbidden', message: 'Account access denied' } });
    return null;
  }
  return account;
}

billingRouter.get('/me', authRequired, async (req, res, next) => {
  try {
    if (!requireUserAuth(req, res)) return;
    if (!req.auth) {
      return res.status(401).json({ error: { type: 'auth_error', message: 'Unauthorized' } });
    }
    const account = await getOrCreateUserAccount(req.auth.user.id);
    const balance = await prisma.accountBalance.findUnique({ where: { accountId: account.id } });
    return jsonOk(res, {
      account: { id: account.id, type: account.type, name: account.name },
      balance: {
        currency: balance?.currency ?? DEFAULT_CURRENCY,
        balanceMicrodollars: Number(balance?.balanceMicrodollars ?? 0n),
      },
    });
  } catch (err) {
    next(err);
  }
});

billingRouter.get('/accounts/:accountId', authRequired, async (req, res, next) => {
  try {
    const account = await requireAccountOwner(req, res, req.params.accountId);
    if (!account) return;
    const balance = await prisma.accountBalance.findUnique({ where: { accountId: account.id } });
    return jsonOk(res, {
      account: { id: account.id, type: account.type, name: account.name },
      balance: {
        currency: balance?.currency ?? DEFAULT_CURRENCY,
        balanceMicrodollars: Number(balance?.balanceMicrodollars ?? 0n),
      },
    });
  } catch (err) {
    next(err);
  }
});

billingRouter.get('/accounts/:accountId/ledger', authRequired, async (req, res, next) => {
  try {
    const account = await requireAccountOwner(req, res, req.params.accountId);
    if (!account) return;
    const { limit, cursor } = parsePagination(req);
    const items = await prisma.ledgerEntry.findMany({
      where: { accountId: account.id },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    let nextCursor: string | null = null;
    if (items.length > limit) {
      const nextItem = items.pop()!;
      nextCursor = nextItem.id;
    }
    const payload = items.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amountMicrodollars: Number(entry.amountMicrodollars),
      meta: entry.meta ?? undefined,
      createdAt: entry.createdAt,
    }));
    return jsonOk(res, { items: payload, next_cursor: nextCursor });
  } catch (err) {
    next(err);
  }
});

billingRouter.get('/rates', async (_req, res, next) => {
  try {
    const now = new Date();
    const items = await prisma.rateCard.findMany({
      where: {
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    const payload = items.map((rate) => ({
      metric: rate.metric,
      unitPriceMicrodollars: Number(rate.unitPriceMicrodollars),
    }));
    return jsonOk(res, { items: payload });
  } catch (err) {
    next(err);
  }
});

billingRouter.post('/topups/checkout-session', authRequired, async (req, res, next) => {
  try {
    const body = checkoutSchema.parse(req.body);
    const account = await requireAccountOwner(req, res, body.accountId);
    if (!account) return;

    return res.status(501).json({
      error: {
        type: 'not_implemented',
        message: 'Checkout sessions are not configured yet.',
      },
    });
  } catch (err) {
    next(err);
  }
});

billingRouter.post('/webhook/stripe', async (req, res, next) => {
  try {
    const body = z
      .object({
        accountId: z.string().min(1),
        amountMicrodollars: z.number().int().positive(),
        idempotencyKey: z.string().min(1).optional(),
      })
      .parse(req.body);

    const account = await prisma.account.findUnique({ where: { id: body.accountId } });
    if (!account) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Account not found' } });
    }

    const { balance } = await createLedgerEntry({
      accountId: body.accountId,
      type: 'CREDIT',
      amountMicrodollars: body.amountMicrodollars,
      relatedType: 'topup',
      relatedId: body.idempotencyKey ?? null,
      idempotencyKey: body.idempotencyKey ?? null,
      meta: { source: 'stripe' },
    });

    return jsonOk(res, {
      received: true,
      balanceMicrodollars: Number(balance.balanceMicrodollars),
    });
  } catch (err) {
    next(err);
  }
});

billingRouter.post('/internal/charge', authRequired, async (req, res, next) => {
  try {
    if (req.auth?.tokenType !== 'service') {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Service token required' } });
    }
    const body = chargeSchema.parse(req.body);
    const account = await prisma.account.findUnique({ where: { id: body.accountId } });
    if (!account) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Account not found' } });
    }
    const idempotencyKey = req.header('Idempotency-Key') || undefined;
    const { balance, chargedMicrodollars, unitPriceMicrodollars } = await createUsageCharge({
      accountId: body.accountId,
      courseId: body.courseId,
      metric: body.metric,
      quantity: body.quantity,
      relatedType: body.relatedType,
      relatedId: body.relatedId,
      meta: body.meta ?? {},
      idempotencyKey,
    });

    return jsonOk(
      res,
      {
        chargedMicrodollars: Number(chargedMicrodollars),
        unitPriceMicrodollars: Number(unitPriceMicrodollars),
        balanceMicrodollars: Number(balance.balanceMicrodollars),
      },
      201,
    );
  } catch (err) {
    next(err);
  }
});

export { billingRouter };
