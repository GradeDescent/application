import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../services/prisma.js';

export const DEFAULT_CURRENCY = 'USD';

type BillingMetric = 'vision_page' | 'grade_problem' | 'split_tex';
type LedgerEntryType = 'CREDIT' | 'CHARGE' | 'REFUND' | 'ADJUSTMENT';

function toBigInt(value: number | bigint) {
  return typeof value === 'bigint' ? value : BigInt(value);
}

export async function getOrCreateUserAccount(
  userId: string,
  tx: Prisma.TransactionClient | PrismaClient = prisma,
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const name = user?.name || user?.email || 'User';

  const account = await tx.account.upsert({
    where: { type_ownerUserId: { type: 'USER', ownerUserId: userId } },
    update: {},
    create: { type: 'USER', ownerUserId: userId, name },
  });

  await tx.accountBalance.upsert({
    where: { accountId: account.id },
    update: {},
    create: { accountId: account.id, currency: DEFAULT_CURRENCY, balanceMicrodollars: 0n },
  });

  return account;
}

export async function resolveCourseBillingAccount(
  courseId: string,
  tx: Prisma.TransactionClient | PrismaClient = prisma,
) {
  const existing = await tx.courseBilling.findUnique({ where: { courseId } });
  if (existing) {
    const account = await tx.account.findUnique({ where: { id: existing.accountId } });
    return account ? { account, courseBilling: existing } : null;
  }

  const course = await tx.course.findUnique({ where: { id: courseId } });
  if (!course) return null;

  const account = await getOrCreateUserAccount(course.createdById, tx);
  const courseBilling = await tx.courseBilling.upsert({
    where: { courseId },
    update: {},
    create: { courseId, accountId: account.id },
  });

  return { account, courseBilling };
}

export async function getCourseBalance(courseId: string, tx = prisma) {
  const resolved = await resolveCourseBillingAccount(courseId, tx);
  if (!resolved) return null;
  const balance = await tx.accountBalance.upsert({
    where: { accountId: resolved.account.id },
    update: {},
    create: {
      accountId: resolved.account.id,
      currency: DEFAULT_CURRENCY,
      balanceMicrodollars: 0n,
    },
  });

  return {
    accountId: resolved.account.id,
    currency: balance.currency,
    balanceMicrodollars: balance.balanceMicrodollars,
  };
}

export async function createLedgerEntry(params: {
  accountId: string;
  currency?: string;
  type: LedgerEntryType;
  amountMicrodollars: bigint | number;
  relatedType?: string | null;
  relatedId?: string | null;
  idempotencyKey?: string | null;
  meta?: Record<string, unknown> | null;
}) {
  const currency = params.currency ?? DEFAULT_CURRENCY;
  const amount = toBigInt(params.amountMicrodollars);
  const delta =
    params.type === 'CHARGE'
      ? -amount
      : params.type === 'CREDIT' || params.type === 'REFUND'
        ? amount
        : amount;

  return prisma.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.create({
      data: {
        accountId: params.accountId,
        currency,
        type: params.type,
        amountMicrodollars: amount,
        relatedType: params.relatedType ?? undefined,
        relatedId: params.relatedId ?? undefined,
        idempotencyKey: params.idempotencyKey ?? undefined,
        meta: (params.meta ?? undefined) as Prisma.InputJsonValue,
      },
    });

    const balance = await tx.accountBalance.upsert({
      where: { accountId: params.accountId },
      update: {
        currency,
        balanceMicrodollars: { increment: delta },
      },
      create: {
        accountId: params.accountId,
        currency,
        balanceMicrodollars: delta,
      },
    });

    return { entry, balance };
  });
}

export async function getActiveRate(metric: BillingMetric) {
  const now = new Date();
  return prisma.rateCard.findFirst({
    where: {
      metric,
      active: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
}

export async function createUsageCharge(params: {
  accountId: string;
  courseId: string;
  metric: BillingMetric;
  quantity: number;
  relatedType?: string;
  relatedId?: string;
  meta?: Record<string, unknown>;
  idempotencyKey?: string | null;
}) {
  const rate = await getActiveRate(params.metric);
  if (!rate) {
    const err = new Error(`No active rate for metric ${params.metric}`);
    (err as any).status = 400;
    (err as any).type = 'validation_error';
    throw err;
  }
  const unitPrice = rate.unitPriceMicrodollars;
  const cost = BigInt(params.quantity) * unitPrice;

  return prisma.$transaction(async (tx) => {
    await tx.usageEvent.create({
      data: {
        accountId: params.accountId,
        courseId: params.courseId,
        metric: params.metric,
        quantity: params.quantity,
        unitPriceMicrodollars: unitPrice,
        costMicrodollars: cost,
        assignmentId: params.meta?.assignmentId as string | undefined,
        submissionId: params.meta?.submissionId as string | undefined,
        evaluationId: params.meta?.evaluationId as string | undefined,
        pipelineRunId: params.meta?.pipelineRunId as string | undefined,
        pipelineStepId: params.meta?.pipelineStepId as string | undefined,
        meta: (params.meta ?? undefined) as Prisma.InputJsonValue,
      },
    });

    const entry = await tx.ledgerEntry.create({
      data: {
        accountId: params.accountId,
        currency: DEFAULT_CURRENCY,
        type: 'CHARGE',
        amountMicrodollars: cost,
        relatedType: params.relatedType ?? undefined,
        relatedId: params.relatedId ?? undefined,
        idempotencyKey: params.idempotencyKey ?? undefined,
        meta: {
          metric: params.metric,
          quantity: params.quantity,
          unitPriceMicrodollars: Number(unitPrice),
          ...(params.meta ?? {}),
        } as Prisma.InputJsonValue,
      },
    });

    const balance = await tx.accountBalance.upsert({
      where: { accountId: params.accountId },
      update: {
        currency: DEFAULT_CURRENCY,
        balanceMicrodollars: { increment: -cost },
      },
      create: {
        accountId: params.accountId,
        currency: DEFAULT_CURRENCY,
        balanceMicrodollars: -cost,
      },
    });

    return { entry, balance, unitPriceMicrodollars: unitPrice, chargedMicrodollars: cost };
  });
}

export function paymentRequiredPayload(balanceMicrodollars: bigint) {
  return {
    error: {
      type: 'payment_required',
      message: 'Course balance is negative; top up to start processing.',
      fields: { balanceMicrodollars: Number(balanceMicrodollars) },
    },
  };
}
