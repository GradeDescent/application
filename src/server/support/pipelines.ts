import { prisma } from '../../services/prisma.js';
import { getCourseBalance, paymentRequiredPayload } from './billing.js';

type PipelineName = 'ASSIGNMENT_PROCESS' | 'SUBMISSION_PROCESS';
type PipelineStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
type PipelineStepStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'CANCELED';

type CreatePipelineResult =
  | { ok: true; runId: string }
  | { ok: false; status: number; body: { error: { type: string; message: string; fields?: Record<string, unknown> } } };

type BillingGateResult =
  | { ok: true; accountId: string }
  | { ok: false; status: number; body: { error: { type: string; message: string; fields?: Record<string, unknown> } } };

const ASSIGNMENT_STEPS = ['ASSIGNMENT_TEX_NORMALIZE', 'ASSIGNMENT_SPLIT_TEX'];
const SUBMISSION_COMMON_STEPS = ['SUBMISSION_SPLIT_TEX', 'ENSURE_ASSIGNMENT_READY'];
const PDF_STEPS = ['PDF_RASTERIZE', 'PDF_TO_TEX', 'TEX_NORMALIZE'];
const TEX_STEPS = ['TEX_NORMALIZE'];

function buildError(status: number, type: string, message: string, fields?: Record<string, unknown>) {
  return { ok: false as const, status, body: { error: { type, message, ...(fields ? { fields } : {}) } } };
}

export async function enforceBillingGate(courseId: string): Promise<BillingGateResult> {
  const billing = await getCourseBalance(courseId);
  if (!billing) {
    return buildError(404, 'not_found', 'Course not found');
  }
  if (billing.balanceMicrodollars < 0n) {
    return { ok: false, status: 402, body: paymentRequiredPayload(billing.balanceMicrodollars) as any };
  }
  return { ok: true, accountId: billing.accountId };
}

export async function createAssignmentPipeline(params: {
  courseId: string;
  assignmentId: string;
  accountId?: string;
  createdByUserId?: string;
  createdByService?: string;
  idempotencyKey?: string;
}): Promise<CreatePipelineResult> {
  const gate = params.accountId
    ? ({ ok: true as const, accountId: params.accountId } satisfies BillingGateResult)
    : await enforceBillingGate(params.courseId);
  if (!gate.ok) return gate;

  const now = new Date();
  const steps = ASSIGNMENT_STEPS.map((name) => ({
    id: undefined,
    name,
    status: 'QUEUED' as PipelineStepStatus,
    runAt: now,
    priority: 0,
    attempt: 0,
    maxAttempts: 3,
    meta: {},
  }));

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.pipelineRun.create({
      data: {
        pipeline: 'ASSIGNMENT_PROCESS',
        courseId: params.courseId,
        accountId: gate.accountId,
        assignmentId: params.assignmentId,
        status: 'QUEUED' as PipelineStatus,
        createdByUserId: params.createdByUserId,
        createdByService: params.createdByService,
        idempotencyKey: params.idempotencyKey,
        meta: {},
      },
    });

    await tx.pipelineStep.createMany({
      data: steps.map((step) => ({
        runId: created.id,
        name: step.name,
        status: step.status,
        runAt: step.runAt,
        priority: step.priority,
        attempt: step.attempt,
        maxAttempts: step.maxAttempts,
        meta: step.meta,
      })),
    });

    return created;
  });

  return { ok: true, runId: run.id };
}

export async function createSubmissionPipeline(params: {
  courseId: string;
  assignmentId: string;
  submissionId: string;
  artifactKind: 'PDF' | 'TEX';
  artifactId?: string;
  accountId?: string;
  createdByUserId?: string;
  createdByService?: string;
  idempotencyKey?: string;
}): Promise<CreatePipelineResult> {
  const gate = params.accountId
    ? ({ ok: true as const, accountId: params.accountId } satisfies BillingGateResult)
    : await enforceBillingGate(params.courseId);
  if (!gate.ok) return gate;

  const now = new Date();
  const steps = [
    ...(params.artifactKind === 'PDF' ? PDF_STEPS : TEX_STEPS),
    ...SUBMISSION_COMMON_STEPS,
  ];

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.pipelineRun.create({
      data: {
        pipeline: 'SUBMISSION_PROCESS',
        courseId: params.courseId,
        accountId: gate.accountId,
        assignmentId: params.assignmentId,
        submissionId: params.submissionId,
        status: 'QUEUED' as PipelineStatus,
        createdByUserId: params.createdByUserId,
        createdByService: params.createdByService,
        idempotencyKey: params.idempotencyKey,
        meta: {
          artifactKind: params.artifactKind,
          artifactId: params.artifactId,
        },
      },
    });

    await tx.pipelineStep.createMany({
      data: steps.map((name) => ({
        runId: created.id,
        name,
        status: 'QUEUED' as PipelineStepStatus,
        runAt: now,
        priority: 0,
        attempt: 0,
        maxAttempts: name === 'ENSURE_ASSIGNMENT_READY' ? 20 : 3,
        meta: {},
      })),
    });

    return created;
  });

  return { ok: true, runId: run.id };
}
