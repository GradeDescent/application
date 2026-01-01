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
    findMany: vi.fn(async ({ where, take, cursor, orderBy }: any) => {
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
      return page;
    }),
    aggregate: vi.fn(async ({ where }: any) => {
      const arr = Array.from(db.submissions.values()).filter((s) => s.assignmentId === where.assignmentId && s.userId === where.userId);
      const max = arr.reduce((acc, s) => Math.max(acc, s.number), 0);
      return { _max: { number: arr.length ? max : null } };
    }),
    findUnique: vi.fn(async ({ where }: any) => db.submissions.get(where.id) || null),
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
  });

  describe('Memberships', () => {
    it('owners/instructors can manage members; others forbidden', async () => {
      const owner = 'owner1';
      const student = 'student1';
      db.users.set(owner, { id: owner, email: 'owner1@example.com' });
      db.users.set(student, { id: student, email: 'student1@example.com' });
      const course = await prismaMock.course.create({ data: { title: 'Manage 101', createdById: owner } });
      await prismaMock.courseMembership.upsert({ where: { userId_courseId: { userId: owner, courseId: course.id } }, create: { userId: owner, courseId: course.id, role: 'OWNER' }, update: { role: 'OWNER' } });

      // Add member as OWNER
      const addRes = await request(app)
        .post(`/v1/memberships/${course.id}/members`)
        .set('Authorization', `Bearer valid.${owner}`)
        .set('Content-Type', 'application/json')
        .send({ userId: student, role: 'STUDENT' });
      expect(addRes.status).toBe(201);

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

      // Owner can promote
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
});
