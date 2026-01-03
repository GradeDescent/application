import { request } from './helpers/http';
import { vi, beforeAll, afterEach, describe, expect, it } from 'vitest';

// Set env for JWT
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/gradedescent_test';

// In-memory fakes for Prisma models we touch
type User = { id: string; email: string; name?: string | null; passwordHash?: string | null };
type Course = { id: string; title: string; code?: string | null; description?: string | null; createdById: string };
type CourseMembership = { id: string; userId: string; courseId: string; role: 'OWNER' | 'INSTRUCTOR' | 'TA' | 'STUDENT'; createdAt?: Date };
type AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type Assignment = {
  id: string;
  courseId: string;
  title: string;
  dueAt?: Date | null;
  totalPoints: number;
  sourceTex: string;
  status: AssignmentStatus;
  createdById: string;
  createdAt?: Date;
  updatedAt?: Date;
  publishedAt?: Date | null;
};
type SubmissionStatus = 'UPLOADING' | 'SUBMITTED' | 'PROCESSING' | 'READY' | 'FAILED';
type Submission = {
  id: string;
  assignmentId: string;
  courseId: string;
  userId: string;
  number: number;
  status: SubmissionStatus;
  primaryArtifactId?: string | null;
  canonicalTexArtifactId?: string | null;
  createdAt?: Date;
  submittedAt?: Date | null;
  errorMessage?: string | null;
};
type ArtifactKind = 'PDF' | 'TEX';
type ArtifactStorage = 'S3' | 'DB';
type ArtifactOrigin = 'UPLOAD' | 'DERIVED';
type Artifact = {
  id: string;
  submissionId: string;
  kind: ArtifactKind;
  origin: ArtifactOrigin;
  storage: ArtifactStorage;
  sha256?: string | null;
  sizeBytes?: number | null;
  contentType?: string | null;
  s3Bucket?: string | null;
  s3Key?: string | null;
  texBody?: string | null;
  createdAt?: Date;
};
type EvaluationStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
type Evaluation = {
  id: string;
  submissionId: string;
  status: EvaluationStatus;
  model?: string | null;
  scorePoints?: number | null;
  scoreOutOf?: number | null;
  result?: any;
  createdAt?: Date;
  completedAt?: Date | null;
  errorMessage?: string | null;
};
type IdempotencyKey = { key: string; userId?: string | null; method: string; path: string; statusCode?: number | null; responseBody?: any; lockedAt?: Date | null };
type MagicLinkToken = { id: string; userId?: string | null; email: string; token: string; expiresAt: Date; consumedAt?: Date | null; createdAt?: Date };
type AccountType = 'USER' | 'ORG';
type Account = { id: string; type: AccountType; ownerUserId?: string | null; name?: string | null; createdAt?: Date; updatedAt?: Date };
type CourseBilling = { courseId: string; accountId: string; createdAt?: Date };
type AccountBalance = { accountId: string; currency: string; balanceMicrodollars: bigint; updatedAt?: Date };
type LedgerEntryType = 'CREDIT' | 'CHARGE' | 'REFUND' | 'ADJUSTMENT';
type LedgerEntry = {
  id: string;
  accountId: string;
  currency: string;
  type: LedgerEntryType;
  amountMicrodollars: bigint;
  relatedType?: string | null;
  relatedId?: string | null;
  idempotencyKey?: string | null;
  meta?: any;
  createdAt?: Date;
};
type BillingMetric = 'vision_page' | 'grade_problem' | 'split_tex';
type RateCard = {
  id: string;
  metric: BillingMetric;
  unitPriceMicrodollars: bigint;
  active: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  meta?: any;
};
type UsageEvent = {
  id: string;
  accountId: string;
  courseId: string;
  metric: BillingMetric;
  quantity: number;
  unitPriceMicrodollars: bigint;
  costMicrodollars: bigint;
  assignmentId?: string | null;
  submissionId?: string | null;
  evaluationId?: string | null;
  pipelineRunId?: string | null;
  pipelineStepId?: string | null;
  meta?: any;
  createdAt?: Date;
};
type PipelineStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
type PipelineStepStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'CANCELED';
type PipelineRun = {
  id: string;
  pipeline: 'ASSIGNMENT_PROCESS' | 'SUBMISSION_PROCESS';
  courseId: string;
  accountId: string;
  assignmentId?: string | null;
  submissionId?: string | null;
  evaluationId?: string | null;
  status: PipelineStatus;
  createdByUserId?: string | null;
  createdByService?: string | null;
  idempotencyKey?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  errorMessage?: string | null;
  meta?: any;
  createdAt?: Date;
  updatedAt?: Date;
};
type PipelineStep = {
  id: string;
  runId: string;
  name: string;
  status: PipelineStepStatus;
  runAt: Date;
  priority: number;
  attempt: number;
  maxAttempts: number;
  lockedBy?: string | null;
  lockedUntil?: Date | null;
  heartbeatAt?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  errorMessage?: string | null;
  meta?: any;
  createdAt?: Date;
  updatedAt?: Date;
};
type PipelineStepEvent = {
  id: number;
  stepId: string;
  level: string;
  message: string;
  meta?: any;
  createdAt?: Date;
};
type PipelineStepArtifact = { stepId: string; artifactId: string; direction: string };
type AssignmentProblem = { id: string; assignmentId: string; problemIndex: number };
type SubmissionProblem = { id: string; submissionId: string; problemIndex: number };
type ProblemEvaluation = { id: string; evaluationId: string; submissionProblemId: string; assignmentProblemId?: string | null };

const db = {
  users: new Map<string, User>(),
  usersByEmail: new Map<string, string>(),
  courses: new Map<string, Course>(),
  memberships: new Map<string, CourseMembership>(),
  assignments: new Map<string, Assignment>(),
  submissions: new Map<string, Submission>(),
  artifacts: new Map<string, Artifact>(),
  evaluations: new Map<string, Evaluation>(),
  idempotency: new Map<string, IdempotencyKey>(),
  magicTokens: new Map<string, MagicLinkToken>(),
  accounts: new Map<string, Account>(),
  courseBilling: new Map<string, CourseBilling>(),
  accountBalances: new Map<string, AccountBalance>(),
  ledgerEntries: new Map<string, LedgerEntry>(),
  rateCards: new Map<string, RateCard>(),
  usageEvents: new Map<string, UsageEvent>(),
  pipelineRuns: new Map<string, PipelineRun>(),
  pipelineSteps: new Map<string, PipelineStep>(),
  pipelineStepEvents: new Map<number, PipelineStepEvent>(),
  pipelineStepArtifacts: new Map<string, PipelineStepArtifact>(),
  assignmentProblems: new Map<string, AssignmentProblem>(),
  submissionProblems: new Map<string, SubmissionProblem>(),
  problemEvaluations: new Map<string, ProblemEvaluation>(),
};

let idSeq = 1;
const cuid = () => `id_${idSeq++}`;

// Prisma mock implementing only used calls
const prismaMock = {
  user: {
    findUnique: vi.fn(async ({ where }: any) => {
      if (where?.email) {
        const id = db.usersByEmail.get(where.email);
        if (!id) return null;
        return db.users.get(id) || null;
      }
      if (where?.id) return db.users.get(where.id) || null;
      return null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => {
      const u = await prismaMock.user.findUnique({ where });
      if (!u) throw new Error('Not found');
      return u;
    }),
    create: vi.fn(async ({ data }: any) => {
      const id = cuid();
      const u: User = { id, email: data.email, name: data.name ?? null, passwordHash: data.passwordHash ?? null };
      db.users.set(id, u);
      db.usersByEmail.set(u.email, id);
      return u;
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existing = await prismaMock.user.findUnique({ where });
      if (existing) {
        const u = { ...existing, ...update };
        db.users.set(existing.id, u);
        return u;
      }
      return prismaMock.user.create({ data: create });
    }),
  },
  course: {
    create: vi.fn(async ({ data }: any) => {
      const id = cuid();
      const c: Course = { id, title: data.title, code: data.code ?? null, description: data.description ?? null, createdById: data.createdById };
      db.courses.set(id, c);
      if (data.memberships?.create) {
        const mId = cuid();
        const cr = data.memberships.create;
        const m: CourseMembership = { id: mId, userId: cr.userId, courseId: id, role: cr.role };
        db.memberships.set(`${m.userId}:${m.courseId}`, m);
      }
      return c;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      if (!where?.code) return null;
      return Array.from(db.courses.values()).find((course) => course.code === where.code) || null;
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      if (!where?.id) return null;
      return db.courses.get(where.id) || null;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const existing = db.courses.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data } as Course;
      db.courses.set(where.id, updated);
      return updated;
    }),
  },
  courseMembership: {
    findUnique: vi.fn(async ({ where }: any) => {
      const key = `${where.userId_courseId.userId}:${where.userId_courseId.courseId}`;
      return db.memberships.get(key) || null;
    }),
    findMany: vi.fn(async ({ where, include, take, cursor, orderBy }: any) => {
      // very rough pagination by m.id not strictly increasing but ok for tests
      const arr = Array.from(db.memberships.values()).filter((m) => m.userId === where.userId);
      arr.sort((a, b) => (a.id < b.id ? -1 : 1));
      let start = 0;
      if (cursor) {
        const idx = arr.findIndex((m) => m.id === cursor.id);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const page = typeof take === 'number' ? arr.slice(start, start + take) : arr;
      if (include?.course) {
        return page.map((m) => ({ ...m, course: db.courses.get(m.courseId)! }));
      }
      return page;
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const key = `${where.userId_courseId.userId}:${where.userId_courseId.courseId}`;
      const existing = db.memberships.get(key);
      if (existing) {
        const m = { ...existing, ...update } as CourseMembership;
        db.memberships.set(key, m);
        return m;
      }
      const id = cuid();
      const m = { id, ...create } as CourseMembership;
      db.memberships.set(key, m);
      return m;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const key = `${where.userId_courseId.userId}:${where.userId_courseId.courseId}`;
      const existing = db.memberships.get(key);
      if (!existing) throw new Error('not found');
      const m = { ...existing, ...data } as CourseMembership;
      db.memberships.set(key, m);
      return m;
    }),
    delete: vi.fn(async ({ where }: any) => {
      const key = `${where.userId_courseId.userId}:${where.userId_courseId.courseId}`;
      db.memberships.delete(key);
      return { deleted: true } as any;
    }),
  },
  assignment: {
    create: vi.fn(async ({ data }: any) => {
      const id = cuid();
      const now = new Date();
      const row: Assignment = {
        id,
        courseId: data.courseId,
        title: data.title,
        dueAt: data.dueAt ?? null,
        totalPoints: data.totalPoints,
        sourceTex: data.sourceTex,
        status: data.status ?? 'DRAFT',
        createdById: data.createdById,
        createdAt: now,
        updatedAt: now,
        publishedAt: data.publishedAt ?? null,
      };
      db.assignments.set(id, row);
      return row;
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      if (!where?.id) return null;
      return db.assignments.get(where.id) || null;
    }),
    findMany: vi.fn(async ({ where, take, cursor, orderBy }: any) => {
      let arr = Array.from(db.assignments.values()).filter((a) => a.courseId === where.courseId);
      if (where.status) {
        if (typeof where.status === 'string') {
          arr = arr.filter((a) => a.status === where.status);
        } else if (where.status?.not) {
          arr = arr.filter((a) => a.status !== where.status.not);
        }
      }
      if (orderBy?.id) {
        arr.sort((a, b) => (a.id < b.id ? -1 : 1));
      }
      let start = 0;
      if (cursor) {
        const idx = arr.findIndex((a) => a.id === cursor.id);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const page = typeof take === 'number' ? arr.slice(start, start + take) : arr;
      return page;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      const row = db.assignments.get(where.id);
      if (!row) return null;
      if (where.courseId && row.courseId !== where.courseId) return null;
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = db.assignments.get(where.id);
      if (!row) throw new Error('not found');
      const updated = { ...row, ...data, updatedAt: new Date() } as Assignment;
      db.assignments.set(where.id, updated);
      return updated;
    }),
  },
  submission: {
    create: vi.fn(async ({ data }: any) => {
      const id = cuid();
      const now = new Date();
      const row: Submission = {
        id,
        assignmentId: data.assignmentId,
        courseId: data.courseId,
        userId: data.userId,
        number: data.number,
        status: data.status ?? 'UPLOADING',
        primaryArtifactId: data.primaryArtifactId ?? null,
        canonicalTexArtifactId: data.canonicalTexArtifactId ?? null,
        createdAt: now,
        submittedAt: data.submittedAt ?? null,
        errorMessage: data.errorMessage ?? null,
      };
      db.submissions.set(id, row);
      return row;
    }),
    findFirst: vi.fn(async ({ where, orderBy }: any) => {
      let arr = Array.from(db.submissions.values());
      if (where?.assignmentId) arr = arr.filter((s) => s.assignmentId === where.assignmentId);
      if (where?.userId) arr = arr.filter((s) => s.userId === where.userId);
      if (where?.status) arr = arr.filter((s) => s.status === where.status);
      if (orderBy?.createdAt) {
        arr.sort((a, b) => (a.createdAt! < b.createdAt! ? -1 : 1));
      } else if (orderBy?.id) {
        arr.sort((a, b) => (a.id < b.id ? -1 : 1));
      }
      return arr[0] ?? null;
    }),
    findMany: vi.fn(async ({ where, take, cursor, orderBy, include }: any) => {
      let arr = Array.from(db.submissions.values());
      if (where?.assignmentId) arr = arr.filter((s) => s.assignmentId === where.assignmentId);
      if (where?.userId) arr = arr.filter((s) => s.userId === where.userId);
      if (orderBy?.id) arr.sort((a, b) => (a.id < b.id ? -1 : 1));
      let start = 0;
      if (cursor) {
        const idx = arr.findIndex((s) => s.id === cursor.id);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const page = typeof take === 'number' ? arr.slice(start, start + take) : arr;
      if (include?.user) {
        return page.map((submission) => ({
          ...submission,
          user: db.users.get(submission.userId) || null,
        }));
      }
      return page;
    }),
    aggregate: vi.fn(async ({ where }: any) => {
      const arr = Array.from(db.submissions.values()).filter((s) => s.assignmentId === where.assignmentId && s.userId === where.userId);
      const max = arr.reduce((acc, s) => Math.max(acc, s.number), 0);
      return { _max: { number: arr.length ? max : null } };
    }),
    findUnique: vi.fn(async ({ where, include }: any) => {
      const row = db.submissions.get(where.id) || null;
      if (!row) return null;
      if (include?.user) {
        return { ...row, user: db.users.get(row.userId) || null };
      }
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = db.submissions.get(where.id);
      if (!row) throw new Error('not found');
      const updated = { ...row, ...data } as Submission;
      db.submissions.set(where.id, updated);
      return updated;
    }),
    delete: vi.fn(async ({ where }: any) => {
      const row = db.submissions.get(where.id);
      if (!row) throw new Error('not found');
      db.submissions.delete(where.id);
      return row;
    }),
  },
  artifact: {
    create: vi.fn(async ({ data }: any) => {
      const id = cuid();
      const now = new Date();
      const row: Artifact = {
        id,
        submissionId: data.submissionId,
        kind: data.kind,
        origin: data.origin,
        storage: data.storage,
        sha256: data.sha256 ?? null,
        sizeBytes: data.sizeBytes ?? null,
        contentType: data.contentType ?? null,
        s3Bucket: data.s3Bucket ?? null,
        s3Key: data.s3Key ?? null,
        texBody: data.texBody ?? null,
        createdAt: now,
      };
      db.artifacts.set(id, row);
      return row;
    }),
    findMany: vi.fn(async ({ where }: any) => {
      return Array.from(db.artifacts.values()).filter((a) => a.submissionId === where.submissionId);
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      const row = db.artifacts.get(where.id);
      if (!row) return null;
      if (where.submissionId && row.submissionId !== where.submissionId) return null;
      return row;
    }),
    findUnique: vi.fn(async ({ where }: any) => db.artifacts.get(where.id) || null),
    update: vi.fn(async ({ where, data }: any) => {
      const row = db.artifacts.get(where.id);
      if (!row) throw new Error('not found');
      const updated = { ...row, ...data } as Artifact;
      db.artifacts.set(where.id, updated);
      return updated;
    }),
    delete: vi.fn(async ({ where }: any) => {
      const row = db.artifacts.get(where.id);
      if (!row) throw new Error('not found');
      db.artifacts.delete(where.id);
      return row;
    }),
  },
  evaluation: {
    create: vi.fn(async ({ data }: any) => {
      const id = cuid();
      const now = new Date();
      const row: Evaluation = {
        id,
        submissionId: data.submissionId,
        status: data.status ?? 'QUEUED',
        model: data.model ?? null,
        scorePoints: data.scorePoints ?? null,
        scoreOutOf: data.scoreOutOf ?? null,
        result: data.result ?? null,
        createdAt: now,
        completedAt: data.completedAt ?? null,
        errorMessage: data.errorMessage ?? null,
      };
      db.evaluations.set(id, row);
      return row;
    }),
    findMany: vi.fn(async ({ where }: any) => {
      return Array.from(db.evaluations.values()).filter((e) => e.submissionId === where.submissionId);
    }),
    findUnique: vi.fn(async ({ where }: any) => db.evaluations.get(where.id) || null),
  },
  idempotencyKey: {
    findUnique: vi.fn(async ({ where }: any) => db.idempotency.get(where.key) || null),
    create: vi.fn(async ({ data }: any) => {
      const rec: IdempotencyKey = { key: data.key, userId: data.userId ?? null, method: data.method, path: data.path, lockedAt: new Date() };
      db.idempotency.set(rec.key, rec);
      return rec;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const rec = db.idempotency.get(where.key);
      if (!rec) throw new Error('not found');
      Object.assign(rec, data);
      db.idempotency.set(where.key, rec);
      return rec;
    }),
  },
  serviceToken: {
    findUnique: vi.fn(async () => null),
  },
  magicLinkToken: {
    findUnique: vi.fn(async ({ where }: any) => {
      if (where?.token) return db.magicTokens.get(where.token) || null;
      return null;
    }),
    create: vi.fn(async ({ data }: any) => {
      const id = cuid();
      const row: MagicLinkToken = { id, userId: data.userId ?? null, email: data.email, token: data.token, expiresAt: data.expiresAt, consumedAt: null, createdAt: new Date() };
      db.magicTokens.set(row.token, row);
      return row as any;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = db.magicTokens.get(where.token);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      db.magicTokens.set(where.token, row);
      return row;
    }),
  },
  account: {
    findUnique: vi.fn(async ({ where }: any) => {
      if (where?.id) return db.accounts.get(where.id) || null;
      if (where?.type_ownerUserId) {
        return (
          Array.from(db.accounts.values()).find(
            (account) =>
              account.type === where.type_ownerUserId.type &&
              account.ownerUserId === where.type_ownerUserId.ownerUserId,
          ) || null
        );
      }
      return null;
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existing = await prismaMock.account.findUnique({ where });
      if (existing) {
        const row = { ...existing, ...update, updatedAt: new Date() } as Account;
        db.accounts.set(existing.id, row);
        return row;
      }
      const id = create.id ?? cuid();
      const row: Account = {
        id,
        type: create.type,
        ownerUserId: create.ownerUserId ?? null,
        name: create.name ?? null,
        createdAt: create.createdAt ?? new Date(),
        updatedAt: create.updatedAt ?? new Date(),
      };
      db.accounts.set(id, row);
      return row;
    }),
  },
  accountBalance: {
    findUnique: vi.fn(async ({ where }: any) => {
      return db.accountBalances.get(where.accountId) || null;
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existing = db.accountBalances.get(where.accountId);
      if (existing) {
        const increment = update?.balanceMicrodollars?.increment ?? 0n;
        const nextBalance =
          update?.balanceMicrodollars === undefined
            ? existing.balanceMicrodollars
            : update.balanceMicrodollars.increment !== undefined
              ? existing.balanceMicrodollars + increment
              : update.balanceMicrodollars;
        const row: AccountBalance = {
          ...existing,
          currency: update?.currency ?? existing.currency,
          balanceMicrodollars: nextBalance,
          updatedAt: new Date(),
        };
        db.accountBalances.set(where.accountId, row);
        return row;
      }
      const row: AccountBalance = {
        accountId: create.accountId,
        currency: create.currency,
        balanceMicrodollars: create.balanceMicrodollars ?? 0n,
        updatedAt: new Date(),
      };
      db.accountBalances.set(where.accountId, row);
      return row;
    }),
  },
  courseBilling: {
    findUnique: vi.fn(async ({ where }: any) => db.courseBilling.get(where.courseId) || null),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existing = db.courseBilling.get(where.courseId);
      if (existing) {
        const row: CourseBilling = { ...existing, ...update };
        db.courseBilling.set(where.courseId, row);
        return row;
      }
      const row: CourseBilling = { courseId: create.courseId, accountId: create.accountId, createdAt: new Date() };
      db.courseBilling.set(where.courseId, row);
      return row;
    }),
    create: vi.fn(async ({ data }: any) => {
      const row: CourseBilling = { courseId: data.courseId, accountId: data.accountId, createdAt: new Date() };
      db.courseBilling.set(row.courseId, row);
      return row;
    }),
  },
  ledgerEntry: {
    create: vi.fn(async ({ data }: any) => {
      const id = data.id ?? cuid();
      const row: LedgerEntry = {
        id,
        accountId: data.accountId,
        currency: data.currency,
        type: data.type,
        amountMicrodollars: data.amountMicrodollars,
        relatedType: data.relatedType ?? null,
        relatedId: data.relatedId ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
        meta: data.meta ?? null,
        createdAt: new Date(),
      };
      db.ledgerEntries.set(id, row);
      return row;
    }),
    findMany: vi.fn(async ({ where, take, cursor, skip }: any) => {
      let items = Array.from(db.ledgerEntries.values()).filter((entry) => entry.accountId === where.accountId);
      items = items.sort((a, b) => a.id.localeCompare(b.id));
      if (cursor?.id) {
        const index = items.findIndex((entry) => entry.id === cursor.id);
        if (index >= 0) items = items.slice(index + (skip ?? 0));
      }
      return take ? items.slice(0, take) : items;
    }),
  },
  rateCard: {
    create: vi.fn(async ({ data }: any) => {
      const id = data.id ?? cuid();
      const row: RateCard = {
        id,
        metric: data.metric,
        unitPriceMicrodollars: data.unitPriceMicrodollars,
        active: data.active ?? true,
        effectiveFrom: data.effectiveFrom ?? new Date(),
        effectiveTo: data.effectiveTo ?? null,
        meta: data.meta ?? null,
      };
      db.rateCards.set(id, row);
      return row;
    }),
    findFirst: vi.fn(async ({ where, orderBy }: any) => {
      const now = new Date();
      let items = Array.from(db.rateCards.values()).filter((rate) => {
        if (where?.metric && rate.metric !== where.metric) return false;
        if (where?.active !== undefined && rate.active !== where.active) return false;
        if (where?.effectiveFrom?.lte && rate.effectiveFrom > where.effectiveFrom.lte) return false;
        if (where?.OR) {
          const ok = where.OR.some((clause: any) => {
            if (clause.effectiveTo === null) return rate.effectiveTo === null;
            if (clause.effectiveTo?.gt) return rate.effectiveTo && rate.effectiveTo > clause.effectiveTo.gt;
            return false;
          });
          if (!ok) return false;
        }
        if (where?.effectiveTo === null && rate.effectiveTo !== null) return false;
        return true;
      });
      if (orderBy?.effectiveFrom) {
        items = items.sort((a, b) => {
          return orderBy.effectiveFrom === 'desc'
            ? b.effectiveFrom.getTime() - a.effectiveFrom.getTime()
            : a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
        });
      }
      return items[0] || null;
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      const now = new Date();
      let items = Array.from(db.rateCards.values()).filter((rate) => {
        if (where?.active !== undefined && rate.active !== where.active) return false;
        if (where?.effectiveFrom?.lte && rate.effectiveFrom > where.effectiveFrom.lte) return false;
        if (where?.OR) {
          const ok = where.OR.some((clause: any) => {
            if (clause.effectiveTo === null) return rate.effectiveTo === null;
            if (clause.effectiveTo?.gt) return rate.effectiveTo && rate.effectiveTo > clause.effectiveTo.gt;
            return false;
          });
          if (!ok) return false;
        }
        return true;
      });
      if (orderBy?.effectiveFrom) {
        items = items.sort((a, b) => {
          return orderBy.effectiveFrom === 'desc'
            ? b.effectiveFrom.getTime() - a.effectiveFrom.getTime()
            : a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
        });
      }
      return items;
    }),
  },
  usageEvent: {
    create: vi.fn(async ({ data }: any) => {
      const id = data.id ?? cuid();
      const row: UsageEvent = {
        id,
        accountId: data.accountId,
        courseId: data.courseId,
        metric: data.metric,
        quantity: data.quantity,
        unitPriceMicrodollars: data.unitPriceMicrodollars,
        costMicrodollars: data.costMicrodollars,
        assignmentId: data.assignmentId ?? null,
        submissionId: data.submissionId ?? null,
        evaluationId: data.evaluationId ?? null,
        pipelineRunId: data.pipelineRunId ?? null,
        pipelineStepId: data.pipelineStepId ?? null,
        meta: data.meta ?? null,
        createdAt: new Date(),
      };
      db.usageEvents.set(id, row);
      return row;
    }),
  },
  pipelineRun: {
    create: vi.fn(async ({ data }: any) => {
      const id = data.id ?? cuid();
      const row: PipelineRun = {
        id,
        pipeline: data.pipeline,
        courseId: data.courseId,
        accountId: data.accountId,
        assignmentId: data.assignmentId ?? null,
        submissionId: data.submissionId ?? null,
        evaluationId: data.evaluationId ?? null,
        status: data.status,
        createdByUserId: data.createdByUserId ?? null,
        createdByService: data.createdByService ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
        startedAt: data.startedAt ?? null,
        finishedAt: data.finishedAt ?? null,
        errorMessage: data.errorMessage ?? null,
        meta: data.meta ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.pipelineRuns.set(id, row);
      return row;
    }),
    findUnique: vi.fn(async ({ where }: any) => db.pipelineRuns.get(where.id) || null),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let items = Array.from(db.pipelineRuns.values());
      if (where?.assignmentId) items = items.filter((row) => row.assignmentId === where.assignmentId);
      if (where?.submissionId) items = items.filter((row) => row.submissionId === where.submissionId);
      if (orderBy?.createdAt === 'desc') {
        items.sort((a, b) => (a.createdAt! < b.createdAt! ? 1 : -1));
      }
      return items;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = db.pipelineRuns.get(where.id);
      if (!row) throw new Error('not found');
      const updated = { ...row, ...data, updatedAt: new Date() } as PipelineRun;
      db.pipelineRuns.set(where.id, updated);
      return updated;
    }),
  },
  pipelineStep: {
    createMany: vi.fn(async ({ data }: any) => {
      for (const row of data) {
        const id = row.id ?? cuid();
        db.pipelineSteps.set(id, {
          id,
          runId: row.runId,
          name: row.name,
          status: row.status,
          runAt: row.runAt ?? new Date(),
          priority: row.priority ?? 0,
          attempt: row.attempt ?? 0,
          maxAttempts: row.maxAttempts ?? 3,
          meta: row.meta ?? {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return { count: data.length };
    }),
    create: vi.fn(async ({ data }: any) => {
      const id = data.id ?? cuid();
      const row: PipelineStep = {
        id,
        runId: data.runId,
        name: data.name,
        status: data.status,
        runAt: data.runAt ?? new Date(),
        priority: data.priority ?? 0,
        attempt: data.attempt ?? 0,
        maxAttempts: data.maxAttempts ?? 3,
        meta: data.meta ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.pipelineSteps.set(id, row);
      return row;
    }),
    findUnique: vi.fn(async ({ where }: any) => db.pipelineSteps.get(where.id) || null),
    findMany: vi.fn(async ({ where }: any) => {
      let items = Array.from(db.pipelineSteps.values());
      if (where?.runId) items = items.filter((row) => row.runId === where.runId);
      return items;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = db.pipelineSteps.get(where.id);
      if (!row) throw new Error('not found');
      const updated = { ...row, ...data, updatedAt: new Date() } as PipelineStep;
      db.pipelineSteps.set(where.id, updated);
      return updated;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const items = Array.from(db.pipelineSteps.values()).filter((row) => row.runId === where.runId);
      for (const row of items) {
        const updated = { ...row, ...data, updatedAt: new Date() } as PipelineStep;
        db.pipelineSteps.set(row.id, updated);
      }
      return { count: items.length };
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existing = db.pipelineSteps.get(where.id);
      if (existing) {
        const updated = { ...existing, ...update, updatedAt: new Date() } as PipelineStep;
        db.pipelineSteps.set(where.id, updated);
        return updated;
      }
      return prismaMock.pipelineStep.create({ data: create });
    }),
  },
  pipelineStepEvent: {
    findMany: vi.fn(async ({ where }: any) => {
      return Array.from(db.pipelineStepEvents.values()).filter((row) => row.stepId === where.stepId);
    }),
  },
  pipelineStepArtifact: {
    create: vi.fn(async ({ data }: any) => {
      const key = `${data.stepId}:${data.artifactId}:${data.direction}`;
      const row: PipelineStepArtifact = { stepId: data.stepId, artifactId: data.artifactId, direction: data.direction };
      db.pipelineStepArtifacts.set(key, row);
      return row;
    }),
  },
  assignmentProblem: {
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const key = `${where.assignmentId_problemIndex.assignmentId}:${where.assignmentId_problemIndex.problemIndex}`;
      const existing = db.assignmentProblems.get(key);
      if (existing) {
        const updated = { ...existing, ...update } as AssignmentProblem;
        db.assignmentProblems.set(key, updated);
        return updated;
      }
      const row: AssignmentProblem = {
        id: create.id ?? cuid(),
        assignmentId: create.assignmentId,
        problemIndex: create.problemIndex,
      };
      db.assignmentProblems.set(key, row);
      return row;
    }),
    count: vi.fn(async ({ where }: any) => {
      return Array.from(db.assignmentProblems.values()).filter((row) => row.assignmentId === where.assignmentId).length;
    }),
  },
  submissionProblem: {
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const key = `${where.submissionId_problemIndex.submissionId}:${where.submissionId_problemIndex.problemIndex}`;
      const existing = db.submissionProblems.get(key);
      if (existing) {
        const updated = { ...existing, ...update } as SubmissionProblem;
        db.submissionProblems.set(key, updated);
        return updated;
      }
      const row: SubmissionProblem = {
        id: create.id ?? cuid(),
        submissionId: create.submissionId,
        problemIndex: create.problemIndex,
      };
      db.submissionProblems.set(key, row);
      return row;
    }),
    findMany: vi.fn(async ({ where }: any) => {
      return Array.from(db.submissionProblems.values()).filter((row) => row.submissionId === where.submissionId);
    }),
  },
  problemEvaluation: {
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const key = `${where.evaluationId_submissionProblemId.evaluationId}:${where.evaluationId_submissionProblemId.submissionProblemId}`;
      const existing = db.problemEvaluations.get(key);
      if (existing) {
        const updated = { ...existing, ...update } as ProblemEvaluation;
        db.problemEvaluations.set(key, updated);
        return updated;
      }
      const row: ProblemEvaluation = {
        id: create.id ?? cuid(),
        evaluationId: create.evaluationId,
        submissionProblemId: create.submissionProblemId,
        assignmentProblemId: create.assignmentProblemId ?? null,
      };
      db.problemEvaluations.set(key, row);
      return row;
    }),
    findMany: vi.fn(async ({ where }: any) => {
      return Array.from(db.problemEvaluations.values()).filter((row) => row.evaluationId === where.evaluationId);
    }),
  },
  $transaction: vi.fn(async (input: any) => {
    if (typeof input === 'function') {
      return input(prismaMock);
    }
    if (Array.isArray(input)) {
      return Promise.all(input);
    }
    return input;
  }),
};

// We will stub Prisma and certain helpers after importing modules
let app: any;

beforeAll(async () => {
  // Build output is generated by pretest. Patch the Prisma instance used by built app
  const prismaMod: any = await import('../dist/services/prisma.js');
  const p = prismaMod.prisma;
  // assign model namespaces
  p.user = prismaMock.user;
  p.course = prismaMock.course;
  p.courseMembership = prismaMock.courseMembership;
  p.assignment = prismaMock.assignment;
  p.submission = prismaMock.submission;
  p.artifact = prismaMock.artifact;
  p.evaluation = prismaMock.evaluation;
  p.idempotencyKey = prismaMock.idempotencyKey;
  p.serviceToken = prismaMock.serviceToken;
  p.magicLinkToken = prismaMock.magicLinkToken;
  p.account = prismaMock.account;
  p.accountBalance = prismaMock.accountBalance;
  p.courseBilling = prismaMock.courseBilling;
  p.ledgerEntry = prismaMock.ledgerEntry;
  p.rateCard = prismaMock.rateCard;
  p.usageEvent = prismaMock.usageEvent;
  p.pipelineRun = prismaMock.pipelineRun;
  p.pipelineStep = prismaMock.pipelineStep;
  p.pipelineStepEvent = prismaMock.pipelineStepEvent;
  p.pipelineStepArtifact = prismaMock.pipelineStepArtifact;
  p.assignmentProblem = prismaMock.assignmentProblem;
  p.submissionProblem = prismaMock.submissionProblem;
  p.problemEvaluation = prismaMock.problemEvaluation;
  p.$transaction = prismaMock.$transaction;

  // Stub JWT verification used by authenticate middleware
  const jwtMod: any = await import('../dist/utils/jwt.js');
  vi.spyOn(jwtMod, 'verifyUserJwt').mockImplementation(async (token: string) => {
    if (token.startsWith('valid.')) {
      const id = token.slice('valid.'.length);
      return { sub: id, email: `${id}@example.com` } as any;
    }
    return null;
  });

  const mod = await import('../dist/server/app.js');
  app = mod.app;
});

afterEach(() => {
  // reset per-test state where needed
});

describe('API v1', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('Content-Type guard rejects non-JSON for POST', async () => {
    const res = await request(app).post('/v1/auth/password/login').send('email=a');
    expect(res.status).toBe(415);
    expect(res.body.error?.type).toBe('unsupported_media_type');
  });

  describe('Auth: password register/login', () => {
    it('registers a new user', async () => {
      const res = await request(app)
        .post('/v1/auth/password/register')
        .set('Content-Type', 'application/json')
        .send({ email: 'alice@example.com', password: 'password123', name: 'Alice' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user?.email).toBe('alice@example.com');
    });

    it('conflict on duplicate registration', async () => {
      // first create
      await request(app)
        .post('/v1/auth/password/register')
        .set('Content-Type', 'application/json')
        .send({ email: 'bob@example.com', password: 'password123' });
      // second should 409
      const res = await request(app)
        .post('/v1/auth/password/register')
        .set('Content-Type', 'application/json')
        .send({ email: 'bob@example.com', password: 'password123' });
      expect(res.status).toBe(409);
    });

    it('login fails with invalid credentials', async () => {
      // user exists with some hash
      const id = cuid();
      const u: User = { id, email: 'carol@example.com', passwordHash: '$2a$10$hash' } as any;
      db.users.set(id, u);
      db.usersByEmail.set(u.email, id);
      const res = await request(app)
        .post('/v1/auth/password/login')
        .set('Content-Type', 'application/json')
        .send({ email: 'carol@example.com', password: 'wrongpass' });
      expect(res.status).toBe(401);
      expect(res.body.error?.type).toBe('auth_error');
    });
  });

  describe('Auth: magic links', () => {
    it('requests magic link without leaking existence', async () => {
      const res = await request(app)
        .post('/v1/auth/magic/request')
        .set('Content-Type', 'application/json')
        .send({ email: 'ml@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/link was sent/i);
      // Token is persisted in mock DB
      const tokens = Array.from((db as any).magicTokens.values()) as any[];
      expect(tokens.some((t) => t.email === 'ml@example.com')).toBe(true);
    });

    it('verifies a stored magic token, then blocks reuse and expiry', async () => {
      // create token
      await request(app)
        .post('/v1/auth/magic/request')
        .set('Content-Type', 'application/json')
        .send({ email: 'flow@example.com' });
      const row = Array.from((db as any).magicTokens.values()).find((t: any) => t.email === 'flow@example.com')!;

      // verify success
      const ok = await request(app)
        .post('/v1/auth/magic/verify')
        .set('Content-Type', 'application/json')
        .send({ token: row.token });
      expect(ok.status).toBe(200);
      expect(ok.body.token).toBeTruthy();

      // second verify fails (consumed)
      const again = await request(app)
        .post('/v1/auth/magic/verify')
        .set('Content-Type', 'application/json')
        .send({ token: row.token });
      expect(again.status).toBe(400);
      expect(again.body.error?.type).toBe('validation_error');

      // expire another token and expect 400
      await request(app)
        .post('/v1/auth/magic/request')
        .set('Content-Type', 'application/json')
        .send({ email: 'expired@example.com' });
      const exp = Array.from((db as any).magicTokens.values()).find((t: any) => t.email === 'expired@example.com')!;
      exp.expiresAt = new Date(Date.now() - 60_000); // in the past
      const expiredRes = await request(app)
        .post('/v1/auth/magic/verify')
        .set('Content-Type', 'application/json')
        .send({ token: exp.token });
      expect(expiredRes.status).toBe(400);
      expect(expiredRes.body.error?.type).toBe('validation_error');
    });
  });

  describe('Users', () => {
    it('GET /v1/users/me requires auth', async () => {
      const res = await request(app).get('/v1/users/me');
      expect(res.status).toBe(401);
    });

    it('GET /v1/users/me returns current user', async () => {
      // Seed user
      const uId = 'user_me';
      const u: User = { id: uId, email: `${uId}@example.com` } as any;
      db.users.set(uId, u);
      const res = await request(app).get('/v1/users/me').set('Authorization', `Bearer valid.${uId}`);
      expect(res.status).toBe(200);
      expect(res.body.user?.id).toBe(uId);
    });
  });

  describe('Courses', () => {
    it('POST /v1/courses creates course and OWNER membership', async () => {
      const uid = 'creator1';
      db.users.set(uid, { id: uid, email: 'creator1@example.com' });
      const res = await request(app)
        .post('/v1/courses')
        .set('Authorization', `Bearer valid.${uid}`)
        .set('Content-Type', 'application/json')
        .send({ title: 'Intro to Testing', code: 'TEST101' });
      expect(res.status).toBe(201);
      expect(res.body.course?.title).toBe('Intro to Testing');
      expect(res.body.course?.code).toBe('test101');
    });

    it('POST /v1/courses rejects duplicate course codes', async () => {
      const uid = 'creator2';
      db.users.set(uid, { id: uid, email: 'creator2@example.com' });

      const first = await request(app)
        .post('/v1/courses')
        .set('Authorization', `Bearer valid.${uid}`)
        .set('Content-Type', 'application/json')
        .send({ title: 'Course A', code: 'CODE1' });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/v1/courses')
        .set('Authorization', `Bearer valid.${uid}`)
        .set('Content-Type', 'application/json')
        .send({ title: 'Course B', code: 'CODE1' });
      expect(second.status).toBe(409);
      expect(second.body.error?.type).toBe('conflict');
    });

    it('POST /v1/courses generates a course code when omitted', async () => {
      const uid = 'creator3';
      db.users.set(uid, { id: uid, email: 'creator3@example.com' });

      const res = await request(app)
        .post('/v1/courses')
        .set('Authorization', `Bearer valid.${uid}`)
        .set('Content-Type', 'application/json')
        .send({ title: 'No Code Course' });
      expect(res.status).toBe(201);
      expect(typeof res.body.course?.code).toBe('string');
      expect(res.body.course?.code?.length).toBeGreaterThan(0);
    });

    it('POST /v1/courses rejects non-url-safe course codes', async () => {
      const uid = 'creator4';
      db.users.set(uid, { id: uid, email: 'creator4@example.com' });

      const res = await request(app)
        .post('/v1/courses')
        .set('Authorization', `Bearer valid.${uid}`)
        .set('Content-Type', 'application/json')
        .send({ title: 'Bad Code Course', code: 'Bad Code!' });
      expect(res.status).toBe(400);
      expect(res.body.error?.type).toBe('validation_error');
    });

    it('GET /v1/courses lists user courses with pagination', async () => {
      const uid = 'member1';
      db.users.set(uid, { id: uid, email: 'member1@example.com' });
      // seed two courses with memberships
      const c1 = await prismaMock.course.create({ data: { title: 'C1', createdById: uid } });
      const c2 = await prismaMock.course.create({ data: { title: 'C2', createdById: uid } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: uid, courseId: c1.id } }, create: { userId: uid, courseId: c1.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: uid, courseId: c2.id } }, create: { userId: uid, courseId: c2.id, role: 'TA' }, update: { role: 'TA' } });

      const res = await request(app).get('/v1/courses?limit=1').set('Authorization', `Bearer valid.${uid}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBe(1);
      const next = res.body.next_cursor;
      if (next) {
        const res2 = await request(app).get(`/v1/courses?limit=1&cursor=${encodeURIComponent(next)}`).set('Authorization', `Bearer valid.${uid}`);
        expect(res2.status).toBe(200);
        expect(Array.isArray(res2.body.items)).toBe(true);
      }
    });

    it('GET /v1/courses/:id requires membership and returns course', async () => {
      const uid = 'reader1';
      db.users.set(uid, { id: uid, email: 'reader1@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Secured C', createdById: uid } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: uid, courseId: course.id } }, create: { userId: uid, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });
      const res = await request(app).get(`/v1/courses/${course.id}`).set('Authorization', `Bearer valid.${uid}`);
      expect(res.status).toBe(200);
      expect(res.body.course?.id).toBe(course.id);
    });

    it('GET /v1/courses/:id returns 403 without membership', async () => {
      const uid = 'nomember1';
      db.users.set(uid, { id: uid, email: 'nomember1@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Secured D', createdById: uid } });
      const res = await request(app).get(`/v1/courses/${course.id}`).set('Authorization', `Bearer valid.${uid}x`); // invalid token → no auth
      expect(res.status).toBe(403); // no membership
    });

    it('PATCH /v1/courses/:id allows owners to update title/description', async () => {
      const uid = 'owner-update';
      db.users.set(uid, { id: uid, email: 'owner-update@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Old Title', createdById: uid, description: 'Old desc' } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: uid, courseId: course.id } },
        create: { userId: uid, courseId: course.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });

      const res = await request(app)
        .patch(`/v1/courses/${course.id}`)
        .set('Authorization', `Bearer valid.${uid}`)
        .set('Content-Type', 'application/json')
        .send({ title: 'New Title', description: 'New desc' });
      expect(res.status).toBe(200);
      expect(res.body.course?.title).toBe('New Title');
      expect(res.body.course?.description).toBe('New desc');
    });
  });

  describe('Memberships', () => {
    it('owners/instructors can manage members; others forbidden', async () => {
      const owner = 'owner1';
      const student = 'student1';
      db.users.set(owner, { id: owner, email: 'owner1@example.com' });
      db.users.set(student, { id: student, email: 'student1@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Manage 101', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });

      // Student cannot list members (needs TA+)
      const listForbidden = await request(app)
        .get(`/v1/memberships/${course.id}/members`)
        .set('Authorization', `Bearer valid.${student}`);
      expect(listForbidden.status).toBe(403);

      // Owner can list
      const listOk = await request(app)
        .get(`/v1/memberships/${course.id}/members`)
        .set('Authorization', `Bearer valid.${owner}`);
      expect(listOk.status).toBe(200);
      expect(Array.isArray(listOk.body.items)).toBe(true);

      // Owner can promote (requires membership record)
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: student, courseId: course.id } },
        create: { userId: student, courseId: course.id, role: 'STUDENT' },
        update: { role: 'STUDENT' },
      });
      const putRes = await request(app)
        .put(`/v1/memberships/${course.id}/members/${student}`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json')
        .send({ role: 'TA' });
      expect(putRes.status).toBe(200);

      // Owner can delete
      const delRes = await request(app)
        .delete(`/v1/memberships/${course.id}/members/${student}`)
        .set('Authorization', `Bearer valid.${owner}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);
    });

    it('students can join with course code and only as STUDENT', async () => {
      const owner = 'owner-join';
      const student = 'student-join';
      db.users.set(owner, { id: owner, email: 'owner-join@example.com' });
      db.users.set(student, { id: student, email: 'student-join@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Join 101', createdById: owner, code: 'join-code' } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: owner, courseId: course.id } },
        create: { userId: owner, courseId: course.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });

      const joinRes = await request(app)
        .post(`/v1/memberships/${course.id}/members`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ courseCode: 'join-code', role: 'TA' });
      expect(joinRes.status).toBe(201);
      expect(joinRes.body.membership?.role).toBe('STUDENT');

      const badCode = await request(app)
        .post(`/v1/memberships/${course.id}/members`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ courseCode: 'wrong' });
      expect(badCode.status).toBe(403);
    });

    it('students can join by course code without course id', async () => {
      const owner = 'owner-join2';
      const student = 'student-join2';
      db.users.set(owner, { id: owner, email: 'owner-join2@example.com' });
      db.users.set(student, { id: student, email: 'student-join2@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Join 102', createdById: owner, code: 'join-102' } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: owner, courseId: course.id } },
        create: { userId: owner, courseId: course.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });

      const joinRes = await request(app)
        .post('/v1/memberships/join')
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ courseCode: 'join-102' });
      expect(joinRes.status).toBe(201);
      expect(joinRes.body.membership?.role).toBe('STUDENT');
    });

    it('rejects non-url-safe course codes when joining', async () => {
      const student = 'student-join3';
      db.users.set(student, { id: student, email: 'student-join3@example.com' });

      const res = await request(app)
        .post('/v1/memberships/join')
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ courseCode: 'bad code!' });
      expect(res.status).toBe(400);
      expect(res.body.error?.type).toBe('validation_error');
    });

    it('instructors can only grant TA or STUDENT roles', async () => {
      const owner = 'owner-roles';
      const instructor = 'inst-roles';
      const target = 'student-roles';
      db.users.set(owner, { id: owner, email: 'owner-roles@example.com' });
      db.users.set(instructor, { id: instructor, email: 'inst-roles@example.com' });
      db.users.set(target, { id: target, email: 'student-roles@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Roles 101', createdById: owner, code: 'roles-code' } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: owner, courseId: course.id } },
        create: { userId: owner, courseId: course.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: instructor, courseId: course.id } },
        create: { userId: instructor, courseId: course.id, role: 'INSTRUCTOR' },
        update: { role: 'INSTRUCTOR' },
      });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: target, courseId: course.id } },
        create: { userId: target, courseId: course.id, role: 'STUDENT' },
        update: { role: 'STUDENT' },
      });

      const promote = await request(app)
        .put(`/v1/memberships/${course.id}/members/${target}`)
        .set('Authorization', `Bearer valid.${instructor}`)
        .set('Content-Type', 'application/json')
        .send({ role: 'TA' });
      expect(promote.status).toBe(200);

      const blocked = await request(app)
        .put(`/v1/memberships/${course.id}/members/${target}`)
        .set('Authorization', `Bearer valid.${instructor}`)
        .set('Content-Type', 'application/json')
        .send({ role: 'INSTRUCTOR' });
      expect(blocked.status).toBe(403);
    });

    it('owners cannot promote someone to OWNER via PUT', async () => {
      const owner = 'owner-owner';
      const target = 'target-owner';
      db.users.set(owner, { id: owner, email: 'owner-owner@example.com' });
      db.users.set(target, { id: target, email: 'target-owner@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Owner 101', createdById: owner, code: 'owner-code' } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: owner, courseId: course.id } },
        create: { userId: owner, courseId: course.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: target, courseId: course.id } },
        create: { userId: target, courseId: course.id, role: 'STUDENT' },
        update: { role: 'STUDENT' },
      });

      const blocked = await request(app)
        .put(`/v1/memberships/${course.id}/members/${target}`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json')
        .send({ role: 'OWNER' });
      expect(blocked.status).toBe(403);
    });
  });

  describe('Assignments', () => {
    it('staff can create assignments; students cannot', async () => {
      const owner = 'assign_owner';
      const student = 'assign_student';
      db.users.set(owner, { id: owner, email: 'assign_owner@example.com' });
      db.users.set(student, { id: student, email: 'assign_student@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Assign 101', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: student, courseId: course.id } }, create: { userId: student, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });

      const createRes = await request(app)
        .post(`/v1/courses/${course.id}/assignments`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json')
        .send({ title: 'HW1', totalPoints: 10, sourceTex: '\\n' });
      expect(createRes.status).toBe(201);
      expect(createRes.body.assignment?.status).toBe('DRAFT');

      const forbidden = await request(app)
        .post(`/v1/courses/${course.id}/assignments`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ title: 'HW1', totalPoints: 10, sourceTex: 'x' });
      expect(forbidden.status).toBe(403);
    });

    it('lists and fetches assignments with role-based visibility', async () => {
      const owner = 'assign_owner2';
      const student = 'assign_student2';
      db.users.set(owner, { id: owner, email: 'assign_owner2@example.com' });
      db.users.set(student, { id: student, email: 'assign_student2@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Assign 102', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: student, courseId: course.id } }, create: { userId: student, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });

      const draft = await prismaMock.assignment.create({ data: { courseId: course.id, title: 'Draft', totalPoints: 5, sourceTex: 'x', createdById: owner, status: 'DRAFT' } });
      const published = await prismaMock.assignment.create({ data: { courseId: course.id, title: 'Published', totalPoints: 10, sourceTex: 'y', createdById: owner, status: 'PUBLISHED', publishedAt: new Date() } });
      await prismaMock.assignment.create({ data: { courseId: course.id, title: 'Archived', totalPoints: 10, sourceTex: 'z', createdById: owner, status: 'ARCHIVED' } });

      const staffList = await request(app).get(`/v1/courses/${course.id}/assignments`).set('Authorization', `Bearer valid.${owner}`);
      expect(staffList.status).toBe(200);
      expect(staffList.body.items?.some((a: Assignment) => a.status === 'ARCHIVED')).toBe(false);

      const studentList = await request(app).get(`/v1/courses/${course.id}/assignments`).set('Authorization', `Bearer valid.${student}`);
      expect(studentList.status).toBe(200);
      expect(studentList.body.items?.length).toBe(1);
      expect(studentList.body.items?.[0].id).toBe(published.id);

      const studentDraft = await request(app)
        .get(`/v1/courses/${course.id}/assignments/${draft.id}`)
        .set('Authorization', `Bearer valid.${student}`);
      expect(studentDraft.status).toBe(403);

      const studentPublished = await request(app)
        .get(`/v1/courses/${course.id}/assignments/${published.id}`)
        .set('Authorization', `Bearer valid.${student}`);
      expect(studentPublished.status).toBe(200);

      const studentStatusForbidden = await request(app)
        .get(`/v1/courses/${course.id}/assignments?status=DRAFT`)
        .set('Authorization', `Bearer valid.${student}`);
      expect(studentStatusForbidden.status).toBe(403);
    });

    it('publishes, unpublishes, and archives assignments', async () => {
      const owner = 'assign_owner3';
      db.users.set(owner, { id: owner, email: 'assign_owner3@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Assign 103', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });

      const draft = await prismaMock.assignment.create({ data: { courseId: course.id, title: 'HW2', totalPoints: 20, sourceTex: 'a', createdById: owner, status: 'DRAFT' } });

      const publish = await request(app)
        .post(`/v1/courses/${course.id}/assignments/${draft.id}/publish`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json');
      expect(publish.status).toBe(200);
      expect(publish.body.assignment?.status).toBe('PUBLISHED');
      expect(publish.body.assignment?.publishedAt).toBeTruthy();

      const unpublish = await request(app)
        .post(`/v1/courses/${course.id}/assignments/${draft.id}/unpublish`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json');
      expect(unpublish.status).toBe(200);
      expect(unpublish.body.assignment?.status).toBe('DRAFT');
      expect(unpublish.body.assignment?.publishedAt).toBe(null);

      const archive = await request(app)
        .delete(`/v1/courses/${course.id}/assignments/${draft.id}`)
        .set('Authorization', `Bearer valid.${owner}`);
      expect(archive.status).toBe(200);
      expect(archive.body.assignment?.status).toBe('ARCHIVED');

      const publishArchived = await request(app)
        .post(`/v1/courses/${course.id}/assignments/${draft.id}/publish`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json');
      expect(publishArchived.status).toBe(409);
    });
  });

  describe('Idempotency', () => {
    it('replays stored response for same Idempotency-Key', async () => {
      const uid = 'idem1';
      db.users.set(uid, { id: uid, email: 'idem1@example.com' });
      const key = 'idem-key-123';

      const first = await request(app)
        .post('/v1/courses')
        .set('Authorization', `Bearer valid.${uid}`)
        .set('Idempotency-Key', key)
        .set('Content-Type', 'application/json')
        .send({ title: 'Idem', code: 'ID1' });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/v1/courses')
        .set('Authorization', `Bearer valid.${uid}`)
        .set('Idempotency-Key', key)
        .set('Content-Type', 'application/json')
        .send({ title: 'Idem', code: 'ID1' });
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
    });
  });

  describe('Submissions', () => {
    it('students can create submissions for published assignments', async () => {
      const owner = 'sub_owner';
      const student = 'sub_student';
      db.users.set(owner, { id: owner, email: 'sub_owner@example.com' });
      db.users.set(student, { id: student, email: 'sub_student@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Sub 101', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: student, courseId: course.id } }, create: { userId: student, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });
      const assignment = await prismaMock.assignment.create({
        data: { courseId: course.id, title: 'HW', totalPoints: 10, sourceTex: 'x', createdById: owner, status: 'PUBLISHED', publishedAt: new Date() },
      });

      const res = await request(app)
        .post(`/v1/assignments/${assignment.id}/submissions`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.submission?.status).toBe('UPLOADING');
      expect(res.body.submission?.number).toBe(1);
    });

    it('staff can list all submissions; students see only their own', async () => {
      const owner = 'sub_owner2';
      const studentA = 'sub_studentA';
      const studentB = 'sub_studentB';
      db.users.set(owner, { id: owner, email: 'sub_owner2@example.com' });
      db.users.set(studentA, { id: studentA, email: 'sub_studentA@example.com' });
      db.users.set(studentB, { id: studentB, email: 'sub_studentB@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Sub 102', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: studentA, courseId: course.id } }, create: { userId: studentA, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: studentB, courseId: course.id } }, create: { userId: studentB, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });
      const assignment = await prismaMock.assignment.create({
        data: { courseId: course.id, title: 'HW', totalPoints: 10, sourceTex: 'x', createdById: owner, status: 'PUBLISHED', publishedAt: new Date() },
      });
      await prismaMock.submission.create({ data: { assignmentId: assignment.id, courseId: course.id, userId: studentA, number: 1, status: 'UPLOADING' } });
      await prismaMock.submission.create({ data: { assignmentId: assignment.id, courseId: course.id, userId: studentB, number: 1, status: 'UPLOADING' } });

      const staffList = await request(app)
        .get(`/v1/assignments/${assignment.id}/submissions`)
        .set('Authorization', `Bearer valid.${owner}`);
      expect(staffList.status).toBe(200);
      expect(staffList.body.items?.length).toBe(2);

      const studentList = await request(app)
        .get(`/v1/assignments/${assignment.id}/submissions`)
        .set('Authorization', `Bearer valid.${studentA}`);
      expect(studentList.status).toBe(200);
      expect(studentList.body.items?.length).toBe(1);
      expect(studentList.body.items?.[0].userId).toBe(studentA);
    });

    it('submits TeX and exposes evaluations for staff', async () => {
      const owner = 'sub_owner3';
      const student = 'sub_student3';
      db.users.set(owner, { id: owner, email: 'sub_owner3@example.com' });
      db.users.set(student, { id: student, email: 'sub_student3@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Sub 103', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: student, courseId: course.id } }, create: { userId: student, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });
      const assignment = await prismaMock.assignment.create({
        data: { courseId: course.id, title: 'HW', totalPoints: 10, sourceTex: 'x', createdById: owner, status: 'PUBLISHED', publishedAt: new Date() },
      });
      const submission = await prismaMock.submission.create({ data: { assignmentId: assignment.id, courseId: course.id, userId: student, number: 1, status: 'UPLOADING' } });

      const texRes = await request(app)
        .post(`/v1/submissions/${submission.id}/artifacts/tex`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ texBody: '\\n' });
      expect(texRes.status).toBe(201);

      const submitRes = await request(app)
        .post(`/v1/submissions/${submission.id}/submit`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ primaryArtifactId: texRes.body.artifact.id });
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.submission?.status).toBe('READY');

      const evalRes = await request(app)
        .post(`/v1/submissions/${submission.id}/evaluations`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json')
        .send({});
      expect(evalRes.status).toBe(202);
      expect(evalRes.body.evaluation?.status).toBe('QUEUED');

      const evalList = await request(app)
        .get(`/v1/submissions/${submission.id}/evaluations`)
        .set('Authorization', `Bearer valid.${student}`);
      expect(evalList.status).toBe(200);
      expect(Array.isArray(evalList.body.items)).toBe(true);
    });

    it('handles PDF artifact presign + complete flow', async () => {
      const owner = 'sub_owner4';
      const student = 'sub_student4';
      db.users.set(owner, { id: owner, email: 'sub_owner4@example.com' });
      db.users.set(student, { id: student, email: 'sub_student4@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Sub 104', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: student, courseId: course.id } }, create: { userId: student, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });
      const assignment = await prismaMock.assignment.create({
        data: { courseId: course.id, title: 'HW', totalPoints: 10, sourceTex: 'x', createdById: owner, status: 'PUBLISHED', publishedAt: new Date() },
      });
      const submission = await prismaMock.submission.create({ data: { assignmentId: assignment.id, courseId: course.id, userId: student, number: 1, status: 'UPLOADING' } });

      const presign = await request(app)
        .post(`/v1/submissions/${submission.id}/artifacts/pdf/presign`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ contentType: 'application/pdf' });
      expect(presign.status).toBe(201);
      expect(presign.body.artifactId).toBeTruthy();

      const complete = await request(app)
        .post(`/v1/artifacts/${presign.body.artifactId}/complete`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ sha256: 'abc123', sizeBytes: 123 });
      expect(complete.status).toBe(200);
      expect(complete.body.artifact?.sha256).toBe('abc123');
    });

    it('rejects submit twice and prevents changes after submit', async () => {
      const owner = 'sub_owner5';
      const student = 'sub_student5';
      db.users.set(owner, { id: owner, email: 'sub_owner5@example.com' });
      db.users.set(student, { id: student, email: 'sub_student5@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Sub 105', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: student, courseId: course.id } }, create: { userId: student, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });
      const assignment = await prismaMock.assignment.create({
        data: { courseId: course.id, title: 'HW', totalPoints: 10, sourceTex: 'x', createdById: owner, status: 'PUBLISHED', publishedAt: new Date() },
      });
      const submission = await prismaMock.submission.create({ data: { assignmentId: assignment.id, courseId: course.id, userId: student, number: 1, status: 'UPLOADING' } });

      const texRes = await request(app)
        .post(`/v1/submissions/${submission.id}/artifacts/tex`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ texBody: '\\n' });
      expect(texRes.status).toBe(201);

      const submitRes = await request(app)
        .post(`/v1/submissions/${submission.id}/submit`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ primaryArtifactId: texRes.body.artifact.id });
      expect(submitRes.status).toBe(200);

      const submitAgain = await request(app)
        .post(`/v1/submissions/${submission.id}/submit`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ primaryArtifactId: texRes.body.artifact.id });
      expect(submitAgain.status).toBe(409);

      const deleteAfterSubmit = await request(app)
        .delete(`/v1/submissions/${submission.id}`)
        .set('Authorization', `Bearer valid.${student}`);
      expect(deleteAfterSubmit.status).toBe(409);

      const texAfterSubmit = await request(app)
        .post(`/v1/submissions/${submission.id}/artifacts/tex`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ texBody: 'later' });
      expect(texAfterSubmit.status).toBe(409);
    });

    it('prevents students from accessing other submissions or evaluations', async () => {
      const owner = 'sub_owner6';
      const studentA = 'sub_student6a';
      const studentB = 'sub_student6b';
      db.users.set(owner, { id: owner, email: 'sub_owner6@example.com' });
      db.users.set(studentA, { id: studentA, email: 'sub_student6a@example.com' });
      db.users.set(studentB, { id: studentB, email: 'sub_student6b@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Sub 106', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: studentA, courseId: course.id } }, create: { userId: studentA, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: studentB, courseId: course.id } }, create: { userId: studentB, courseId: course.id, role: 'STUDENT' }, update: { role: 'STUDENT' } });
      const assignment = await prismaMock.assignment.create({
        data: { courseId: course.id, title: 'HW', totalPoints: 10, sourceTex: 'x', createdById: owner, status: 'PUBLISHED', publishedAt: new Date() },
      });
      const submission = await prismaMock.submission.create({ data: { assignmentId: assignment.id, courseId: course.id, userId: studentA, number: 1, status: 'UPLOADING' } });
      const artifact = await prismaMock.artifact.create({
        data: { submissionId: submission.id, kind: 'TEX', origin: 'UPLOAD', storage: 'DB', texBody: 'x', contentType: 'text/plain' },
      });
      const evaluation = await prismaMock.evaluation.create({ data: { submissionId: submission.id, status: 'QUEUED', model: 'default' } });

      const getSubmission = await request(app)
        .get(`/v1/submissions/${submission.id}`)
        .set('Authorization', `Bearer valid.${studentB}`);
      expect(getSubmission.status).toBe(403);

      const listArtifacts = await request(app)
        .get(`/v1/submissions/${submission.id}/artifacts`)
        .set('Authorization', `Bearer valid.${studentB}`);
      expect(listArtifacts.status).toBe(403);

      const getArtifact = await request(app)
        .get(`/v1/artifacts/${artifact.id}`)
        .set('Authorization', `Bearer valid.${studentB}`);
      expect(getArtifact.status).toBe(403);

      const getBody = await request(app)
        .get(`/v1/artifacts/${artifact.id}/body`)
        .set('Authorization', `Bearer valid.${studentB}`);
      expect(getBody.status).toBe(403);

      const listEvals = await request(app)
        .get(`/v1/submissions/${submission.id}/evaluations`)
        .set('Authorization', `Bearer valid.${studentB}`);
      expect(listEvals.status).toBe(403);

      const getEval = await request(app)
        .get(`/v1/evaluations/${evaluation.id}`)
        .set('Authorization', `Bearer valid.${studentB}`);
      expect(getEval.status).toBe(403);

      const createEval = await request(app)
        .post(`/v1/submissions/${submission.id}/evaluations`)
        .set('Authorization', `Bearer valid.${studentB}`)
        .set('Content-Type', 'application/json')
        .send({});
      expect(createEval.status).toBe(403);
    });
  });

  describe('Billing', () => {
    it('GET /v1/billing/me returns account and zero balance', async () => {
      const userId = 'billing-user';
      const res = await request(app)
        .get('/v1/billing/me')
        .set('Authorization', `Bearer valid.${userId}`);
      expect(res.status).toBe(200);
      expect(res.body.account?.type).toBe('USER');
      expect(res.body.balance?.balanceMicrodollars).toBe(0);
    });

    it('GET /v1/billing/rates returns active rates', async () => {
      await prismaMock.rateCard.create({
        data: { metric: 'vision_page', unitPriceMicrodollars: 5000n, active: true, effectiveFrom: new Date() },
      });
      await prismaMock.rateCard.create({
        data: { metric: 'split_tex', unitPriceMicrodollars: 10000n, active: true, effectiveFrom: new Date() },
      });
      await prismaMock.rateCard.create({
        data: { metric: 'grade_problem', unitPriceMicrodollars: 3000n, active: false, effectiveFrom: new Date() },
      });

      const res = await request(app).get('/v1/billing/rates');
      expect(res.status).toBe(200);
      const metrics = res.body.items?.map((item: any) => item.metric) || [];
      expect(metrics).toContain('vision_page');
      expect(metrics).toContain('split_tex');
      expect(metrics).not.toContain('grade_problem');
    });

    it('GET /v1/courses/:courseId/billing returns balance for staff', async () => {
      const owner = 'billing-owner';
      const course = await prismaMock.course.create({ data: { title: 'Billing 101', createdById: owner } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: owner, courseId: course.id } },
        create: { userId: owner, courseId: course.id, role: 'TA' },
        update: { role: 'TA' },
      });
      const account = await prismaMock.account.upsert({
        where: { type_ownerUserId: { type: 'USER', ownerUserId: owner } },
        create: { type: 'USER', ownerUserId: owner, name: 'Owner' },
        update: {},
      });
      await prismaMock.accountBalance.upsert({
        where: { accountId: account.id },
        create: { accountId: account.id, currency: 'USD', balanceMicrodollars: 250000n },
        update: {},
      });
      await prismaMock.courseBilling.create({ data: { courseId: course.id, accountId: account.id } });

      const res = await request(app)
        .get(`/v1/courses/${course.id}/billing`)
        .set('Authorization', `Bearer valid.${owner}`);
      expect(res.status).toBe(200);
      expect(res.body.accountId).toBe(account.id);
      expect(res.body.balance?.balanceMicrodollars).toBe(250000);
    });

    it('blocks publishing when balance is negative', async () => {
      const owner = 'billing-owner-2';
      const course = await prismaMock.course.create({ data: { title: 'Billing 201', createdById: owner } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: owner, courseId: course.id } },
        create: { userId: owner, courseId: course.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
      const assignment = await prismaMock.assignment.create({
        data: { courseId: course.id, title: 'HW', totalPoints: 10, sourceTex: 'x', createdById: owner, status: 'DRAFT' },
      });
      const account = await prismaMock.account.upsert({
        where: { type_ownerUserId: { type: 'USER', ownerUserId: owner } },
        create: { type: 'USER', ownerUserId: owner, name: 'Owner' },
        update: {},
      });
      await prismaMock.accountBalance.upsert({
        where: { accountId: account.id },
        create: { accountId: account.id, currency: 'USD', balanceMicrodollars: -1n },
        update: { balanceMicrodollars: -1n },
      });
      await prismaMock.courseBilling.create({ data: { courseId: course.id, accountId: account.id } });

      const res = await request(app)
        .post(`/v1/courses/${course.id}/assignments/${assignment.id}/publish`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(402);
      expect(res.body.error?.type).toBe('payment_required');
      const stored = db.assignments.get(assignment.id);
      expect(stored?.status).toBe('DRAFT');
    });

    it('blocks submission when balance is negative', async () => {
      const student = 'billing-student';
      const course = await prismaMock.course.create({ data: { title: 'Billing 301', createdById: student } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: student, courseId: course.id } },
        create: { userId: student, courseId: course.id, role: 'STUDENT' },
        update: { role: 'STUDENT' },
      });
      const submission = await prismaMock.submission.create({
        data: { assignmentId: 'a1', courseId: course.id, userId: student, number: 1, status: 'UPLOADING' },
      });
      const artifact = await prismaMock.artifact.create({
        data: {
          submissionId: submission.id,
          kind: 'TEX',
          origin: 'UPLOAD',
          storage: 'DB',
          texBody: 'x',
        },
      });
      const account = await prismaMock.account.upsert({
        where: { type_ownerUserId: { type: 'USER', ownerUserId: student } },
        create: { type: 'USER', ownerUserId: student, name: 'Student' },
        update: {},
      });
      await prismaMock.accountBalance.upsert({
        where: { accountId: account.id },
        create: { accountId: account.id, currency: 'USD', balanceMicrodollars: -10n },
        update: { balanceMicrodollars: -10n },
      });
      await prismaMock.courseBilling.create({ data: { courseId: course.id, accountId: account.id } });

      const res = await request(app)
        .post(`/v1/submissions/${submission.id}/submit`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ primaryArtifactId: artifact.id });
      expect(res.status).toBe(402);
      expect(res.body.error?.type).toBe('payment_required');
      const stored = db.submissions.get(submission.id);
      expect(stored?.status).toBe('UPLOADING');
    });

    it('blocks evaluations when balance is negative', async () => {
      const owner = 'billing-owner-3';
      const course = await prismaMock.course.create({ data: { title: 'Billing 401', createdById: owner } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: owner, courseId: course.id } },
        create: { userId: owner, courseId: course.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
      const submission = await prismaMock.submission.create({
        data: {
          assignmentId: 'a2',
          courseId: course.id,
          userId: owner,
          number: 1,
          status: 'READY',
          canonicalTexArtifactId: 'art-1',
        },
      });
      const account = await prismaMock.account.upsert({
        where: { type_ownerUserId: { type: 'USER', ownerUserId: owner } },
        create: { type: 'USER', ownerUserId: owner, name: 'Owner' },
        update: {},
      });
      await prismaMock.accountBalance.upsert({
        where: { accountId: account.id },
        create: { accountId: account.id, currency: 'USD', balanceMicrodollars: -50n },
        update: { balanceMicrodollars: -50n },
      });
      await prismaMock.courseBilling.create({ data: { courseId: course.id, accountId: account.id } });

      const res = await request(app)
        .post(`/v1/submissions/${submission.id}/evaluations`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json')
        .send({});
      expect(res.status).toBe(402);
      expect(res.body.error?.type).toBe('payment_required');
    });
  });

  describe('Pipelines', () => {
    it('creates assignment pipeline on assignment create', async () => {
      const owner = 'pipe_owner';
      db.users.set(owner, { id: owner, email: 'pipe_owner@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Pipe 101', createdById: owner } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: owner, courseId: course.id } },
        create: { userId: owner, courseId: course.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
      const account = await prismaMock.account.upsert({
        where: { type_ownerUserId: { type: 'USER', ownerUserId: owner } },
        create: { type: 'USER', ownerUserId: owner, name: 'Owner' },
        update: {},
      });
      await prismaMock.accountBalance.upsert({
        where: { accountId: account.id },
        create: { accountId: account.id, currency: 'USD', balanceMicrodollars: 10n },
        update: {},
      });
      await prismaMock.courseBilling.create({ data: { courseId: course.id, accountId: account.id } });

      const res = await request(app)
        .post(`/v1/courses/${course.id}/assignments`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json')
        .send({ title: 'Pipe HW', totalPoints: 5, sourceTex: 'x' });
      expect(res.status).toBe(201);
      expect(db.pipelineRuns.size).toBeGreaterThan(0);
    });

    it('creates submission pipeline on submit', async () => {
      const student = 'pipe_student';
      db.users.set(student, { id: student, email: 'pipe_student@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Pipe 201', createdById: student } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: student, courseId: course.id } },
        create: { userId: student, courseId: course.id, role: 'STUDENT' },
        update: { role: 'STUDENT' },
      });
      const assignment = await prismaMock.assignment.create({
        data: { courseId: course.id, title: 'HW', totalPoints: 10, sourceTex: 'x', createdById: student, status: 'PUBLISHED', publishedAt: new Date() },
      });
      const submission = await prismaMock.submission.create({
        data: { assignmentId: assignment.id, courseId: course.id, userId: student, number: 1, status: 'UPLOADING' },
      });
      const artifact = await prismaMock.artifact.create({
        data: { submissionId: submission.id, kind: 'TEX', origin: 'UPLOAD', storage: 'DB', texBody: 'x', contentType: 'text/plain' },
      });
      const account = await prismaMock.account.upsert({
        where: { type_ownerUserId: { type: 'USER', ownerUserId: student } },
        create: { type: 'USER', ownerUserId: student, name: 'Student' },
        update: {},
      });
      await prismaMock.accountBalance.upsert({
        where: { accountId: account.id },
        create: { accountId: account.id, currency: 'USD', balanceMicrodollars: 10n },
        update: {},
      });
      await prismaMock.courseBilling.create({ data: { courseId: course.id, accountId: account.id } });

      const res = await request(app)
        .post(`/v1/submissions/${submission.id}/submit`)
        .set('Authorization', `Bearer valid.${student}`)
        .set('Content-Type', 'application/json')
        .send({ primaryArtifactId: artifact.id });
      expect(res.status).toBe(200);
      expect(db.pipelineRuns.size).toBeGreaterThan(0);
    });

    it('lists assignment pipelines for staff', async () => {
      const owner = 'pipe_owner2';
      db.users.set(owner, { id: owner, email: 'pipe_owner2@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Pipe 301', createdById: owner } });
      const assignment = await prismaMock.assignment.create({ data: { courseId: course.id, title: 'HW', totalPoints: 1, sourceTex: 'x', createdById: owner, status: 'DRAFT' } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: owner, courseId: course.id } },
        create: { userId: owner, courseId: course.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
      await prismaMock.pipelineRun.create({
        data: {
          pipeline: 'ASSIGNMENT_PROCESS',
          courseId: course.id,
          accountId: 'acct_1',
          assignmentId: assignment.id,
          status: 'QUEUED',
        },
      });

      const res = await request(app)
        .get(`/v1/assignments/${assignment.id}/pipelines`)
        .set('Authorization', `Bearer valid.${owner}`);
      expect(res.status).toBe(200);
      expect(res.body.items?.length).toBe(1);
    });

    it('lists submission pipelines for owner', async () => {
      const student = 'pipe_student2';
      db.users.set(student, { id: student, email: 'pipe_student2@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Pipe 401', createdById: student } });
      const submission = await prismaMock.submission.create({
        data: { assignmentId: 'a1', courseId: course.id, userId: student, number: 1, status: 'UPLOADING' },
      });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: student, courseId: course.id } },
        create: { userId: student, courseId: course.id, role: 'STUDENT' },
        update: { role: 'STUDENT' },
      });
      await prismaMock.pipelineRun.create({
        data: {
          pipeline: 'SUBMISSION_PROCESS',
          courseId: course.id,
          accountId: 'acct_2',
          submissionId: submission.id,
          status: 'QUEUED',
        },
      });

      const res = await request(app)
        .get(`/v1/submissions/${submission.id}/pipelines`)
        .set('Authorization', `Bearer valid.${student}`);
      expect(res.status).toBe(200);
      expect(res.body.items?.length).toBe(1);
    });

    it('returns pipeline run with steps', async () => {
      const owner = 'pipe_owner3';
      db.users.set(owner, { id: owner, email: 'pipe_owner3@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Pipe 501', createdById: owner } });
      await prismaMock.courseMembership.upsert({
        where: { userId_courseId: { userId: owner, courseId: course.id } },
        create: { userId: owner, courseId: course.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
      const run = await prismaMock.pipelineRun.create({
        data: {
          pipeline: 'ASSIGNMENT_PROCESS',
          courseId: course.id,
          accountId: 'acct_3',
          status: 'QUEUED',
        },
      });
      await prismaMock.pipelineStep.create({
        data: { runId: run.id, name: 'ASSIGNMENT_TEX_NORMALIZE', status: 'QUEUED' },
      });

      const res = await request(app)
        .get(`/v1/pipeline-runs/${run.id}`)
        .set('Authorization', `Bearer valid.${owner}`);
      expect(res.status).toBe(200);
      expect(res.body.steps?.length).toBe(1);
    });
  });
});
