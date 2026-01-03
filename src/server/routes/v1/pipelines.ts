import { Request, Response, Router } from 'express';
import { prisma } from '../../../services/prisma.js';
import { authRequired } from '../../security/authMiddleware.js';
import { requireCourseRole } from '../../security/rbac.js';
import { jsonOk } from '../../../utils/responses.js';
import { createAssignmentPipeline, createSubmissionPipeline } from '../../support/pipelines.js';

type Role = 'OWNER' | 'INSTRUCTOR' | 'TA' | 'STUDENT';
const STAFF_ROLES: Role[] = ['OWNER', 'INSTRUCTOR', 'TA'];

export const pipelinesRouter = Router();

async function requireMembership(req: Request, res: Response, courseId: string) {
  const membership = await prisma.courseMembership.findUnique({
    where: { userId_courseId: { userId: req.auth!.user.id, courseId } },
    select: { role: true },
  });
  if (!membership) {
    res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    return null;
  }
  return membership.role as Role;
}

pipelinesRouter.get('/assignments/:assignmentId/pipelines', authRequired, async (req, res, next) => {
  try {
    const assignment = await prisma.assignment.findUnique({ where: { id: req.params.assignmentId } });
    if (!assignment) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Assignment not found' } });
    }
    const role = await requireMembership(req, res, assignment.courseId);
    if (!role) return;

    const runs = await prisma.pipelineRun.findMany({
      where: { assignmentId: assignment.id },
      orderBy: { createdAt: 'desc' },
    });
    return jsonOk(res, { items: runs });
  } catch (err) {
    next(err);
  }
});

pipelinesRouter.get('/submissions/:submissionId/pipelines', authRequired, async (req, res, next) => {
  try {
    const submission = await prisma.submission.findUnique({ where: { id: req.params.submissionId } });
    if (!submission) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Submission not found' } });
    }
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }

    const runs = await prisma.pipelineRun.findMany({
      where: { submissionId: submission.id },
      orderBy: { createdAt: 'desc' },
    });
    return jsonOk(res, { items: runs });
  } catch (err) {
    next(err);
  }
});

pipelinesRouter.get('/pipeline-runs/:runId', authRequired, async (req, res, next) => {
  try {
    const run = await prisma.pipelineRun.findUnique({ where: { id: req.params.runId } });
    if (!run) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Pipeline run not found' } });
    }
    const role = await requireMembership(req, res, run.courseId);
    if (!role) return;
    if (role === 'STUDENT' && run.submissionId) {
      const submission = await prisma.submission.findUnique({ where: { id: run.submissionId } });
      if (!submission || submission.userId !== req.auth!.user.id) {
        return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
      }
    }

    const steps = await prisma.pipelineStep.findMany({
      where: { runId: run.id },
      orderBy: { createdAt: 'asc' },
    });
    return jsonOk(res, { run, steps });
  } catch (err) {
    next(err);
  }
});

pipelinesRouter.get('/pipeline-steps/:stepId/events', authRequired, async (req, res, next) => {
  try {
    const step = await prisma.pipelineStep.findUnique({ where: { id: req.params.stepId } });
    if (!step) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Pipeline step not found' } });
    }
    const run = await prisma.pipelineRun.findUnique({ where: { id: step.runId } });
    if (!run) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Pipeline run not found' } });
    }
    const role = await requireMembership(req, res, run.courseId);
    if (!role || !STAFF_ROLES.includes(role)) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }

    const events = await prisma.pipelineStepEvent.findMany({
      where: { stepId: step.id },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return jsonOk(res, { items: events });
  } catch (err) {
    next(err);
  }
});

pipelinesRouter.post('/assignments/:assignmentId/rerun', authRequired, async (req, res, next) => {
  try {
    const assignment = await prisma.assignment.findUnique({ where: { id: req.params.assignmentId } });
    if (!assignment) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Assignment not found' } });
    }
    const role = await requireMembership(req, res, assignment.courseId);
    if (!role || !STAFF_ROLES.includes(role)) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }

    const run = await createAssignmentPipeline({
      courseId: assignment.courseId,
      assignmentId: assignment.id,
      createdByUserId: req.auth!.user.id,
    });
    if (!run.ok) {
      return res.status(run.status).json(run.body);
    }
    return jsonOk(res, { runId: run.runId }, 202);
  } catch (err) {
    next(err);
  }
});

pipelinesRouter.post('/submissions/:submissionId/rerun', authRequired, async (req, res, next) => {
  try {
    const submission = await prisma.submission.findUnique({ where: { id: req.params.submissionId } });
    if (!submission) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Submission not found' } });
    }
    const role = await requireMembership(req, res, submission.courseId);
    if (!role || !STAFF_ROLES.includes(role)) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }

    const artifactId = submission.primaryArtifactId;
    if (!artifactId) {
      return res.status(409).json({ error: { type: 'conflict', message: 'Submission has no primary artifact' } });
    }
    const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
    if (!artifact || (artifact.kind !== 'PDF' && artifact.kind !== 'TEX')) {
      return res.status(409).json({ error: { type: 'conflict', message: 'Submission artifact not ready' } });
    }

    const run = await createSubmissionPipeline({
      courseId: submission.courseId,
      assignmentId: submission.assignmentId,
      submissionId: submission.id,
      artifactKind: artifact.kind,
      artifactId: artifact.id,
      createdByUserId: req.auth!.user.id,
    });
    if (!run.ok) {
      return res.status(run.status).json(run.body);
    }
    return jsonOk(res, { runId: run.runId }, 202);
  } catch (err) {
    next(err);
  }
});

pipelinesRouter.post('/pipeline-runs/:runId/cancel', authRequired, async (req, res, next) => {
  try {
    const run = await prisma.pipelineRun.findUnique({ where: { id: req.params.runId } });
    if (!run) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Pipeline run not found' } });
    }
    const role = await requireMembership(req, res, run.courseId);
    if (!role || !STAFF_ROLES.includes(role)) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }

    await prisma.$transaction(async (tx) => {
      await tx.pipelineRun.update({
        where: { id: run.id },
        data: { status: 'CANCELED', finishedAt: new Date() },
      });
      await tx.pipelineStep.updateMany({
        where: { runId: run.id, status: { in: ['QUEUED', 'RUNNING'] } },
        data: { status: 'CANCELED', finishedAt: new Date() },
      });
    });

    return jsonOk(res, { canceled: true });
  } catch (err) {
    next(err);
  }
});

pipelinesRouter.post('/pipeline-steps/:stepId/retry', authRequired, async (req, res, next) => {
  try {
    const step = await prisma.pipelineStep.findUnique({ where: { id: req.params.stepId } });
    if (!step) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Pipeline step not found' } });
    }
    const run = await prisma.pipelineRun.findUnique({ where: { id: step.runId } });
    if (!run) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Pipeline run not found' } });
    }
    const role = await requireMembership(req, res, run.courseId);
    if (!role || !STAFF_ROLES.includes(role)) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (step.status !== 'FAILED') {
      return res.status(409).json({ error: { type: 'conflict', message: 'Step is not failed' } });
    }

    await prisma.pipelineStep.update({
      where: { id: step.id },
      data: { status: 'QUEUED', runAt: new Date(), errorMessage: null },
    });
    return jsonOk(res, { queued: true });
  } catch (err) {
    next(err);
  }
});
