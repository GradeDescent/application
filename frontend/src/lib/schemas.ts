import { z } from 'zod';

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  pictureUrl: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const courseSchema = z.object({
  id: z.string(),
  title: z.string(),
  code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  createdById: z.string().optional(),
  role: z.enum(['OWNER', 'INSTRUCTOR', 'TA', 'STUDENT']).optional(),
});

export const assignmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  dueAt: z.string().nullable().optional(),
  totalPoints: z.number(),
  sourceTex: z.string(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  createdById: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  publishedAt: z.string().nullable().optional(),
});

export const submissionSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  courseId: z.string(),
  userId: z.string(),
  number: z.number(),
  status: z.enum(['UPLOADING', 'SUBMITTED', 'PROCESSING', 'READY', 'FAILED']),
  primaryArtifactId: z.string().nullable().optional(),
  canonicalTexArtifactId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  submittedAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  user: z
    .object({
      id: z.string(),
      email: z.string().email(),
      name: z.string().nullable().optional(),
    })
    .optional(),
});

export const artifactSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  kind: z.enum(['PDF', 'TEX']),
  origin: z.enum(['UPLOAD', 'DERIVED']),
  storage: z.enum(['S3', 'DB']),
  sha256: z.string().nullable().optional(),
  sizeBytes: z.number().nullable().optional(),
  contentType: z.string().nullable().optional(),
  s3Bucket: z.string().nullable().optional(),
  s3Key: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

export const evaluationSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']),
  model: z.string().nullable().optional(),
  scorePoints: z.number().nullable().optional(),
  scoreOutOf: z.number().nullable().optional(),
  result: z.any().optional(),
  createdAt: z.string().optional(),
  completedAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

export const courseMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  courseId: z.string(),
  role: z.enum(['OWNER', 'INSTRUCTOR', 'TA', 'STUDENT']),
  createdAt: z.string().optional(),
  user: z
    .object({
      id: z.string(),
      email: z.string().email(),
      name: z.string().nullable().optional(),
    })
    .optional(),
});

export type User = z.infer<typeof userSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Evaluation = z.infer<typeof evaluationSchema>;
export type CourseMember = z.infer<typeof courseMemberSchema>;
