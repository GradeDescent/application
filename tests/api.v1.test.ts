import { request } from './helpers/http';
import { vi, beforeAll, afterEach, describe, expect, it } from 'vitest';

// Set env for JWT
process.env.JWT_SECRET = 'test-secret';

// In-memory fakes for Prisma models we touch
type User = { id: string; email: string; name?: string | null; passwordHash?: string | null };
type Course = { id: string; title: string; code?: string | null; description?: string | null; createdById: string };
type CourseMembership = { id: string; userId: string; courseId: string; role: 'OWNER' | 'INSTRUCTOR' | 'TA' | 'STUDENT'; createdAt?: Date };
type IdempotencyKey = { key: string; userId?: string | null; method: string; path: string; statusCode?: number | null; responseBody?: any; lockedAt?: Date | null };

const db = {
  users: new Map<string, User>(),
  usersByEmail: new Map<string, string>(),
  courses: new Map<string, Course>(),
  memberships: new Map<string, CourseMembership>(),
  idempotency: new Map<string, IdempotencyKey>(),
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
  p.idempotencyKey = prismaMock.idempotencyKey;
  p.serviceToken = prismaMock.serviceToken;

  // Stub magic link service functions to avoid side effects
  const authSvc: any = await import('../dist/services/auth.js');
  vi.spyOn(authSvc, 'createMagicToken').mockResolvedValue({ token: 'ml.test', userId: 'u_ml', expiresAt: new Date().toISOString() });
  vi.spyOn(authSvc, 'consumeMagicToken').mockResolvedValue({ id: 'u_ml', email: 'ml@example.com' });

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
    });

    it('verifies magic token and returns JWT', async () => {
      const res = await request(app)
        .post('/v1/auth/magic/verify')
        .set('Content-Type', 'application/json')
        .send({ token: 'ml.abcdefghijkl' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user?.email).toBe('ml@example.com');
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
});
