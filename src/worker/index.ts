import { prisma } from '../services/prisma.js';
import { createUsageCharge } from '../server/support/billing.js';

type StepResult =
  | { status: 'SUCCEEDED' }
  | { status: 'REQUEUE'; runAt: Date; errorMessage?: string }
  | { status: 'FAILED'; errorMessage: string };

const LEASE_SECONDS = 30;
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;
const LOOP_DELAY_MS = 1000;

async function claimNextStep() {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    WITH next_step AS (
      SELECT id
      FROM "PipelineStep"
      WHERE status = 'QUEUED' AND "runAt" <= now()
      ORDER BY priority DESC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "PipelineStep"
    SET status = 'RUNNING',
        attempt = attempt + 1,
        locked_by = $1,
        locked_until = now() + ($2 || ' seconds')::interval,
        heartbeat_at = now(),
        started_at = COALESCE(started_at, now()),
        updated_at = now()
    WHERE id IN (SELECT id FROM next_step)
    RETURNING *;
  `, WORKER_ID, LEASE_SECONDS);

  const step = rows[0];
  if (!step) return null;

  await prisma.pipelineRun.update({
    where: { id: step.runId },
    data: { status: 'RUNNING', startedAt: step.started_at ?? new Date() },
  });
  return step;
}

async function requeueExpiredLeases() {
  await prisma.$executeRawUnsafe(`
    UPDATE "PipelineStep"
    SET status = 'QUEUED',
        locked_by = NULL,
        locked_until = NULL,
        heartbeat_at = NULL,
        updated_at = now()
    WHERE status = 'RUNNING' AND locked_until < now();
  `);
}

async function finalizeRunIfDone(runId: string) {
  const steps = await prisma.pipelineStep.findMany({
    where: { runId },
    select: { status: true },
  });
  if (steps.some((step) => step.status === 'QUEUED' || step.status === 'RUNNING')) return;
  const failed = steps.some((step) => step.status === 'FAILED');
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: failed ? 'FAILED' : 'SUCCEEDED',
      finishedAt: new Date(),
    },
  });
}

async function handleStep(step: any): Promise<StepResult> {
  const run = await prisma.pipelineRun.findUnique({ where: { id: step.runId } });
  if (!run) return { status: 'FAILED', errorMessage: 'Pipeline run missing' };

  switch (step.name) {
    case 'ASSIGNMENT_TEX_NORMALIZE':
      return { status: 'SUCCEEDED' };
    case 'ASSIGNMENT_SPLIT_TEX': {
      if (!run.assignmentId) return { status: 'FAILED', errorMessage: 'Missing assignmentId' };
      await prisma.assignmentProblem.upsert({
        where: { assignmentId_problemIndex: { assignmentId: run.assignmentId, problemIndex: 1 } },
        create: { assignmentId: run.assignmentId, problemIndex: 1, title: 'Problem 1' },
        update: {},
      });
      await createUsageCharge({
        accountId: run.accountId,
        courseId: run.courseId,
        metric: 'split_tex',
        quantity: 1,
        relatedType: 'pipeline_step',
        relatedId: step.id,
        meta: { pipelineRunId: run.id, pipelineStepId: step.id },
        idempotencyKey: `charge:step:${step.id}`,
      });
      return { status: 'SUCCEEDED' };
    }
    case 'PDF_RASTERIZE':
      return { status: 'SUCCEEDED' };
    case 'PDF_TO_TEX': {
      await createUsageCharge({
        accountId: run.accountId,
        courseId: run.courseId,
        metric: 'vision_page',
        quantity: Number(step.meta?.pageCount ?? 1),
        relatedType: 'pipeline_step',
        relatedId: step.id,
        meta: { pipelineRunId: run.id, pipelineStepId: step.id },
        idempotencyKey: `charge:step:${step.id}`,
      });
      return { status: 'SUCCEEDED' };
    }
    case 'TEX_NORMALIZE': {
      if (!run.submissionId) return { status: 'SUCCEEDED' };
      const submission = await prisma.submission.findUnique({ where: { id: run.submissionId } });
      if (!submission) return { status: 'FAILED', errorMessage: 'Submission missing' };
      if (submission.canonicalTexArtifactId) return { status: 'SUCCEEDED' };
      const artifactId = submission.primaryArtifactId;
      let texBody = '% placeholder';
      if (artifactId) {
        const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
        if (artifact?.texBody) texBody = artifact.texBody;
      }
      const canonical = await prisma.artifact.create({
        data: {
          submissionId: submission.id,
          kind: 'TEX',
          origin: 'DERIVED',
          storage: 'DB',
          texBody,
          contentType: 'text/plain',
        },
      });
      await prisma.submission.update({
        where: { id: submission.id },
        data: { canonicalTexArtifactId: canonical.id },
      });
      return { status: 'SUCCEEDED' };
    }
    case 'SUBMISSION_SPLIT_TEX': {
      if (!run.submissionId) return { status: 'FAILED', errorMessage: 'Missing submissionId' };
      await prisma.submissionProblem.upsert({
        where: { submissionId_problemIndex: { submissionId: run.submissionId, problemIndex: 1 } },
        create: { submissionId: run.submissionId, problemIndex: 1 },
        update: {},
      });
      await createUsageCharge({
        accountId: run.accountId,
        courseId: run.courseId,
        metric: 'split_tex',
        quantity: 1,
        relatedType: 'pipeline_step',
        relatedId: step.id,
        meta: { pipelineRunId: run.id, pipelineStepId: step.id },
        idempotencyKey: `charge:step:${step.id}`,
      });
      return { status: 'SUCCEEDED' };
    }
    case 'ENSURE_ASSIGNMENT_READY': {
      if (!run.assignmentId || !run.submissionId) {
        return { status: 'FAILED', errorMessage: 'Missing assignment/submission' };
      }
      const count = await prisma.assignmentProblem.count({ where: { assignmentId: run.assignmentId } });
      if (!count) {
        return { status: 'REQUEUE', runAt: new Date(Date.now() + 10_000), errorMessage: 'Assignment not ready' };
      }
      const submissionProblems = await prisma.submissionProblem.findMany({
        where: { submissionId: run.submissionId },
        orderBy: { problemIndex: 'asc' },
      });
      const evaluation = await prisma.evaluation.create({
        data: { submissionId: run.submissionId, status: 'QUEUED', model: 'default' },
      });
      await prisma.pipelineRun.update({
        where: { id: run.id },
        data: { evaluationId: evaluation.id },
      });
      for (const problem of submissionProblems) {
        const stepId = `${run.id}_EVALUATE_PROBLEM_${problem.id}`;
        await prisma.pipelineStep.upsert({
          where: { id: stepId },
          create: {
            id: stepId,
            runId: run.id,
            name: 'EVALUATE_PROBLEM',
            status: 'QUEUED',
            runAt: new Date(),
            meta: {
              submissionProblemId: problem.id,
              evaluationId: evaluation.id,
              problemIndex: problem.problemIndex,
            },
          },
          update: {},
        });
      }
      await prisma.pipelineStep.upsert({
        where: { id: `${run.id}_AGGREGATE_EVALUATION` },
        create: {
          id: `${run.id}_AGGREGATE_EVALUATION`,
          runId: run.id,
          name: 'AGGREGATE_EVALUATION',
          status: 'QUEUED',
          runAt: new Date(Date.now() + 1_000),
          meta: { evaluationId: evaluation.id },
        },
        update: {},
      });
      return { status: 'SUCCEEDED' };
    }
    case 'EVALUATE_PROBLEM': {
      const evaluationId = step.meta?.evaluationId;
      const submissionProblemId = step.meta?.submissionProblemId;
      if (!evaluationId || !submissionProblemId) {
        return { status: 'FAILED', errorMessage: 'Missing evaluation metadata' };
      }
      await prisma.problemEvaluation.upsert({
        where: { evaluationId_submissionProblemId: { evaluationId, submissionProblemId } },
        create: { evaluationId, submissionProblemId, score: 0, evaluationJson: {} },
        update: {},
      });
      await createUsageCharge({
        accountId: run.accountId,
        courseId: run.courseId,
        metric: 'grade_problem',
        quantity: 1,
        relatedType: 'pipeline_step',
        relatedId: step.id,
        meta: { pipelineRunId: run.id, pipelineStepId: step.id },
        idempotencyKey: `charge:step:${step.id}`,
      });
      return { status: 'SUCCEEDED' };
    }
    case 'AGGREGATE_EVALUATION': {
      const evaluationId = step.meta?.evaluationId ?? run.evaluationId;
      if (!evaluationId) return { status: 'FAILED', errorMessage: 'Missing evaluationId' };
      const evaluations = await prisma.problemEvaluation.findMany({
        where: { evaluationId },
        select: { score: true },
      });
      const total = evaluations.reduce((sum, item) => sum + (item.score ?? 0), 0);
      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: {
          status: 'COMPLETED',
          scorePoints: Math.round(total),
          scoreOutOf: evaluations.length || 0,
          completedAt: new Date(),
        },
      });
      return { status: 'SUCCEEDED' };
    }
    default:
      return { status: 'SUCCEEDED' };
  }
}

async function processStep(step: any) {
  let result: StepResult;
  try {
    result = await handleStep(step);
  } catch (err: any) {
    result = { status: 'FAILED', errorMessage: err?.message || 'Step failed' };
  }

  if (result.status === 'REQUEUE') {
    await prisma.pipelineStep.update({
      where: { id: step.id },
      data: {
        status: 'QUEUED',
        runAt: result.runAt,
        lockedBy: null,
        lockedUntil: null,
        heartbeatAt: null,
        errorMessage: result.errorMessage ?? null,
      },
    });
    return;
  }

  if (result.status === 'FAILED') {
    const attempts = step.attempt ?? 1;
    if (attempts < step.maxAttempts) {
      const delay = Math.min(60, 5 * Math.pow(2, attempts - 1));
      await prisma.pipelineStep.update({
        where: { id: step.id },
        data: {
          status: 'QUEUED',
          runAt: new Date(Date.now() + delay * 1000),
          lockedBy: null,
          lockedUntil: null,
          heartbeatAt: null,
          errorMessage: result.errorMessage,
        },
      });
      return;
    }
    await prisma.pipelineStep.update({
      where: { id: step.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: result.errorMessage,
      },
    });
    await finalizeRunIfDone(step.runId);
    return;
  }

  await prisma.pipelineStep.update({
    where: { id: step.id },
    data: {
      status: 'SUCCEEDED',
      finishedAt: new Date(),
      lockedBy: null,
      lockedUntil: null,
      heartbeatAt: null,
      errorMessage: null,
    },
  });
  await finalizeRunIfDone(step.runId);
}

async function loop() {
  await requeueExpiredLeases();
  const step = await claimNextStep();
  if (step) {
    await processStep(step);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, LOOP_DELAY_MS));
}

async function main() {
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    await loop();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
