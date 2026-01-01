import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../../services/prisma.js';
import { authRequired } from '../../security/authMiddleware.js';
import { jsonOk } from '../../../utils/responses.js';
import { parsePagination } from '../../support/pagination.js';

type Role = 'OWNER' | 'INSTRUCTOR' | 'TA' | 'STUDENT';

const STAFF_ROLES: Role[] = ['OWNER', 'INSTRUCTOR', 'TA'];

const createTexArtifactSchema = z.object({
  texBody: z.string().min(1),
  contentType: z.enum(['application/x-tex', 'text/plain']).optional(),
});

const presignPdfSchema = z.object({
  contentType: z.literal('application/pdf'),
  filename: z.string().min(1).optional(),
  sizeBytes: z.number().int().positive().optional(),
});

const completeArtifactSchema = z.object({
  sha256: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

const submitSchema = z.object({
  primaryArtifactId: z.string().min(1),
});

const createEvaluationSchema = z.object({
  model: z.string().min(1).optional(),
});

export const submissionsRouter = Router();

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

async function loadAssignment(req: Request, res: Response, assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) {
    res.status(404).json({ error: { type: 'not_found', message: 'Assignment not found' } });
    return null;
  }
  return assignment;
}

async function loadSubmission(req: Request, res: Response, submissionId: string) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) {
    res.status(404).json({ error: { type: 'not_found', message: 'Submission not found' } });
    return null;
  }
  return submission;
}

function stripTexBody<T extends { texBody?: string | null }>(artifact: T) {
  const { texBody, ...rest } = artifact;
  return rest;
}

submissionsRouter.post('/assignments/:assignmentId/submissions', authRequired, async (req, res, next) => {
  try {
    const assignment = await loadAssignment(req, res, req.params.assignmentId);
    if (!assignment) return;
    const role = await requireMembership(req, res, assignment.courseId);
    if (!role) return;
    if (role !== 'STUDENT') {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (assignment.status !== 'PUBLISHED') {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Assignment not published' } });
    }

    const existing = await prisma.submission.findFirst({
      where: { assignmentId: assignment.id, userId: req.auth!.user.id, status: 'UPLOADING' },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return jsonOk(res, { submission: existing });
    }

    const maxNumber = await prisma.submission.aggregate({
      where: { assignmentId: assignment.id, userId: req.auth!.user.id },
      _max: { number: true },
    });
    const number = (maxNumber._max.number ?? 0) + 1;

    const submission = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        courseId: assignment.courseId,
        userId: req.auth!.user.id,
        number,
        status: 'UPLOADING',
      },
    });
    return jsonOk(res, { submission }, 201);
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get('/assignments/:assignmentId/submissions', authRequired, async (req, res, next) => {
  try {
    const assignment = await loadAssignment(req, res, req.params.assignmentId);
    if (!assignment) return;
    const role = await requireMembership(req, res, assignment.courseId);
    if (!role) return;

    const { limit, cursor } = parsePagination(req);
    let userIdFilter: string | undefined;
    if (role === 'STUDENT') {
      userIdFilter = req.auth!.user.id;
    } else if (typeof req.query.userId === 'string') {
      userIdFilter = req.query.userId === 'me' ? req.auth!.user.id : req.query.userId;
    }

    const items = await prisma.submission.findMany({
      where: {
        assignmentId: assignment.id,
        ...(userIdFilter ? { userId: userIdFilter } : {}),
      },
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

submissionsRouter.get('/submissions/:submissionId', authRequired, async (req, res, next) => {
  try {
    const submission = await loadSubmission(req, res, req.params.submissionId);
    if (!submission) return;
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    return jsonOk(res, { submission });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.post('/submissions/:submissionId/submit', authRequired, async (req, res, next) => {
  try {
    const submission = await loadSubmission(req, res, req.params.submissionId);
    if (!submission) return;
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (submission.status !== 'UPLOADING') {
      return res.status(409).json({ error: { type: 'conflict', message: 'Submission already finalized' } });
    }

    const body = submitSchema.parse(req.body);
    const artifact = await prisma.artifact.findFirst({
      where: { id: body.primaryArtifactId, submissionId: submission.id },
    });
    if (!artifact) {
      return res.status(400).json({ error: { type: 'validation_error', message: 'Invalid primaryArtifactId' } });
    }

    if (artifact.kind === 'PDF') {
      if (!artifact.sha256 || !artifact.sizeBytes) {
        return res.status(400).json({ error: { type: 'validation_error', message: 'Primary PDF not completed' } });
      }
    } else if (!artifact.texBody) {
      return res.status(400).json({ error: { type: 'validation_error', message: 'Primary TeX missing' } });
    }

    const nextStatus = artifact.kind === 'TEX' ? 'READY' : 'PROCESSING';
    const updateData: Record<string, unknown> = {
      primaryArtifactId: artifact.id,
      submittedAt: new Date(),
      status: nextStatus,
    };
    if (artifact.kind === 'TEX') {
      updateData.canonicalTexArtifactId = artifact.id;
    }

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: updateData,
    });
    return jsonOk(res, { submission: updated });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.delete('/submissions/:submissionId', authRequired, async (req, res, next) => {
  try {
    const submission = await loadSubmission(req, res, req.params.submissionId);
    if (!submission) return;
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (submission.status !== 'UPLOADING') {
      return res.status(409).json({ error: { type: 'conflict', message: 'Submission already finalized' } });
    }
    await prisma.submission.delete({ where: { id: submission.id } });
    return jsonOk(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get('/submissions/:submissionId/artifacts', authRequired, async (req, res, next) => {
  try {
    const submission = await loadSubmission(req, res, req.params.submissionId);
    if (!submission) return;
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }

    const items = await prisma.artifact.findMany({ where: { submissionId: submission.id } });
    return jsonOk(res, { items: items.map(stripTexBody) });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.post('/submissions/:submissionId/artifacts/tex', authRequired, async (req, res, next) => {
  try {
    const submission = await loadSubmission(req, res, req.params.submissionId);
    if (!submission) return;
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (submission.status !== 'UPLOADING') {
      return res.status(409).json({ error: { type: 'conflict', message: 'Submission already finalized' } });
    }

    const body = createTexArtifactSchema.parse(req.body);
    const artifact = await prisma.artifact.create({
      data: {
        submissionId: submission.id,
        kind: 'TEX',
        origin: 'UPLOAD',
        storage: 'DB',
        texBody: body.texBody,
        contentType: body.contentType ?? 'application/x-tex',
      },
    });
    return jsonOk(res, { artifact: stripTexBody(artifact) }, 201);
  } catch (err) {
    next(err);
  }
});

submissionsRouter.post('/submissions/:submissionId/artifacts/pdf/presign', authRequired, async (req, res, next) => {
  try {
    const submission = await loadSubmission(req, res, req.params.submissionId);
    if (!submission) return;
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (submission.status !== 'UPLOADING') {
      return res.status(409).json({ error: { type: 'conflict', message: 'Submission already finalized' } });
    }

    const body = presignPdfSchema.parse(req.body);
    const key = `submissions/${submission.id}/${Date.now()}.pdf`;
    const bucket = process.env.S3_UPLOAD_BUCKET || 'gradedescent-uploads';

    const artifact = await prisma.artifact.create({
      data: {
        submissionId: submission.id,
        kind: 'PDF',
        origin: 'UPLOAD',
        storage: 'S3',
        contentType: body.contentType,
        s3Bucket: bucket,
        s3Key: key,
      },
    });

    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const baseUrl = process.env.S3_UPLOAD_BASE_URL || 'https://example.invalid/uploads';

    return jsonOk(
      res,
      {
        artifactId: artifact.id,
        upload: {
          url: `${baseUrl}/${encodeURIComponent(key)}`,
          method: 'PUT',
          headers: { 'Content-Type': body.contentType },
          expiresAt: expiresAt.toISOString(),
        },
      },
      201,
    );
  } catch (err) {
    next(err);
  }
});

submissionsRouter.post('/artifacts/:artifactId/complete', authRequired, async (req, res, next) => {
  try {
    const body = completeArtifactSchema.parse(req.body);
    const artifact = await prisma.artifact.findUnique({ where: { id: req.params.artifactId } });
    if (!artifact) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Artifact not found' } });
    }
    const submission = await prisma.submission.findUnique({ where: { id: artifact.submissionId } });
    if (!submission) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Submission not found' } });
    }
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (submission.status !== 'UPLOADING') {
      return res.status(409).json({ error: { type: 'conflict', message: 'Submission already finalized' } });
    }
    if (artifact.kind !== 'PDF' || artifact.storage !== 'S3') {
      return res.status(400).json({ error: { type: 'validation_error', message: 'Artifact is not a PDF upload' } });
    }
    if (artifact.sha256) {
      return res.status(409).json({ error: { type: 'conflict', message: 'Artifact already completed' } });
    }

    const updated = await prisma.artifact.update({
      where: { id: artifact.id },
      data: { sha256: body.sha256, sizeBytes: body.sizeBytes },
    });
    return jsonOk(res, { artifact: stripTexBody(updated) });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get('/artifacts/:artifactId', authRequired, async (req, res, next) => {
  try {
    const artifact = await prisma.artifact.findUnique({ where: { id: req.params.artifactId } });
    if (!artifact) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Artifact not found' } });
    }
    const submission = await prisma.submission.findUnique({ where: { id: artifact.submissionId } });
    if (!submission) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Submission not found' } });
    }
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    return jsonOk(res, { artifact: stripTexBody(artifact) });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get('/artifacts/:artifactId/body', authRequired, async (req, res, next) => {
  try {
    const artifact = await prisma.artifact.findUnique({ where: { id: req.params.artifactId } });
    if (!artifact) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Artifact not found' } });
    }
    const submission = await prisma.submission.findUnique({ where: { id: artifact.submissionId } });
    if (!submission) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Submission not found' } });
    }
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (artifact.kind !== 'TEX' || artifact.storage !== 'DB') {
      return res.status(400).json({ error: { type: 'validation_error', message: 'Artifact is not TeX' } });
    }
    return jsonOk(res, { texBody: artifact.texBody });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get('/artifacts/:artifactId/download', authRequired, async (req, res, next) => {
  try {
    const artifact = await prisma.artifact.findUnique({ where: { id: req.params.artifactId } });
    if (!artifact) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Artifact not found' } });
    }
    const submission = await prisma.submission.findUnique({ where: { id: artifact.submissionId } });
    if (!submission) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Submission not found' } });
    }
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (artifact.kind !== 'PDF' || artifact.storage !== 'S3') {
      return res.status(400).json({ error: { type: 'validation_error', message: 'Artifact is not a PDF' } });
    }

    const baseUrl = process.env.S3_DOWNLOAD_BASE_URL || 'https://example.invalid/downloads';
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    return jsonOk(res, { url: `${baseUrl}/${encodeURIComponent(artifact.s3Key || artifact.id)}`, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.delete('/artifacts/:artifactId', authRequired, async (req, res, next) => {
  try {
    const artifact = await prisma.artifact.findUnique({ where: { id: req.params.artifactId } });
    if (!artifact) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Artifact not found' } });
    }
    const submission = await prisma.submission.findUnique({ where: { id: artifact.submissionId } });
    if (!submission) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Submission not found' } });
    }
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (submission.status !== 'UPLOADING') {
      return res.status(409).json({ error: { type: 'conflict', message: 'Submission already finalized' } });
    }
    await prisma.artifact.delete({ where: { id: artifact.id } });
    return jsonOk(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get('/submissions/:submissionId/evaluations', authRequired, async (req, res, next) => {
  try {
    const submission = await loadSubmission(req, res, req.params.submissionId);
    if (!submission) return;
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }

    const items = await prisma.evaluation.findMany({
      where: { submissionId: submission.id },
      orderBy: { createdAt: 'asc' },
    });
    return jsonOk(res, { items });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.post('/submissions/:submissionId/evaluations', authRequired, async (req, res, next) => {
  try {
    const submission = await loadSubmission(req, res, req.params.submissionId);
    if (!submission) return;
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (!STAFF_ROLES.includes(role)) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    if (!submission.canonicalTexArtifactId) {
      return res.status(409).json({ error: { type: 'conflict', message: 'Canonical TeX not ready' } });
    }

    const body = createEvaluationSchema.parse(req.body ?? {});
    const evaluation = await prisma.evaluation.create({
      data: {
        submissionId: submission.id,
        status: 'QUEUED',
        model: body.model ?? 'default',
      },
    });
    return jsonOk(res, { evaluation }, 202);
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get('/evaluations/:evaluationId', authRequired, async (req, res, next) => {
  try {
    const evaluation = await prisma.evaluation.findUnique({ where: { id: req.params.evaluationId } });
    if (!evaluation) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Evaluation not found' } });
    }
    const submission = await prisma.submission.findUnique({ where: { id: evaluation.submissionId } });
    if (!submission) {
      return res.status(404).json({ error: { type: 'not_found', message: 'Submission not found' } });
    }
    const role = await requireMembership(req, res, submission.courseId);
    if (!role) return;
    if (role === 'STUDENT' && submission.userId !== req.auth!.user.id) {
      return res.status(403).json({ error: { type: 'forbidden', message: 'Insufficient role' } });
    }
    return jsonOk(res, { evaluation });
  } catch (err) {
    next(err);
  }
});
