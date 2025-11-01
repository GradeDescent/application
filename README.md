GradeDescent Backend API

Overview
- Node.js + TypeScript + Express API
- PostgreSQL via Prisma ORM
- Auth via JWT (password or magic link). Social logins stubs included.
- RBAC via course memberships (owner, instructor, ta, student)
- API base: `https://api.gradedescent.com/v1`

Getting Started
- Copy `.env.example` to `.env` and set `DATABASE_URL` and `JWT_SECRET`.
- Install dependencies: `npm install`
- Create DB and run migrations: `npx prisma migrate dev`
- Generate client: `npx prisma generate`
- Start dev server: `npm run dev`

Conventions
- Auth: `Authorization: Bearer <JWT>` or service tokens `Bearer st.<...>`
- Content-Type: `application/json`
- Pagination: `?limit=50&cursor=...` → `{ items, next_cursor }`
- Idempotency: send `Idempotency-Key` on mutating requests; stored outcomes are replayed
- Errors: `{ "error": { "type": "validation_error", "message": "...", "fields": { ... } } }`
- Timestamps: RFC3339 UTC strings
- Rate limits: `X-RateLimit-Limit`, `X-RateLimit-Remaining` headers (placeholder)

Data Model (Prisma)
- User, OAuthAccount, Course, CourseMembership (Role enum), MagicLinkToken, IdempotencyKey, ServiceToken.

Key Endpoints
- `POST /v1/auth/password/register` { email, password, name? }
- `POST /v1/auth/password/login` { email, password }
- `POST /v1/auth/magic/request` { email }
- `POST /v1/auth/magic/verify` { token }
- `GET /v1/users/me`
- `POST /v1/courses` { title, code?, description? } (becomes OWNER)
- `GET /v1/courses` (courses for current user)
- `GET /v1/courses/:courseId` (requires membership)
- `GET/POST/PUT/DELETE /v1/memberships/:courseId/members` (manage members; owner/instructor)

RBAC
- Enforced via `requireCourseRole()` middleware against `CourseMembership`.

Notes
- Real rate limiting and email providers should be wired in production (Redis, SES/SendGrid).
- OAuth routes are placeholders; integrate via OAuth library or provider SDKs.

