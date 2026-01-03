# GradeDescent API v1 – Routes Documentation

Base URL
- Local: `http://localhost:${PORT-3000}/v1`
- Prod: `https://api.gradedescent.com/v1`

Conventions
- Auth: `Authorization: Bearer <JWT>` (user) or `Bearer st.<service-token>`
- Content-Type: `application/json` for `POST/PUT/PATCH`
- Idempotency: include `Idempotency-Key: <uuid>` on mutating requests to make them safe to retry
- Pagination: `?limit=50&cursor=<id>` → `{ items, next_cursor }`
- Errors: `{ "error": { "type": "...", "message": "...", "fields?": { ... } } }`
- Timestamps: ISO8601/RFC3339 UTC strings

Health
- GET `/health`
  - Auth: not required
  - Response: `{ ok: true, uptime: <number> }`

Root
- GET `/v1/`
  - Auth: not required
  - Response: `{ name: "GradeDescent API", version: "v1" }`

Authentication
- POST `/auth/password/register`
  - Auth: not required
  - Body: `{ email: string, password: string(min 8), name?: string }`
  - Success 200: `{ token: string, user: User }`
  - 409: `{ error: { type: "conflict", message: "Email already registered" } }`
  - Notes: Returns a signed JWT for immediate use.
  - Example:
    ```bash
    curl -X POST $BASE/auth/password/register \
      -H 'Content-Type: application/json' \
      -d '{"email":"ada@example.com","password":"hunter2!","name":"Ada"}'
    ```

- POST `/auth/password/login`
  - Auth: not required
  - Body: `{ email: string, password: string(min 8) }`
  - Success 200: `{ token: string, user: User }`
  - 401: `{ error: { type: "auth_error", message: "Invalid credentials" } }`

- POST `/auth/magic/request`
  - Auth: not required
  - Body: `{ email: string }`
  - Success 200: `{ message: "If the email exists, a link was sent." }`
  - Notes: Sends a magic sign-in link to the email on file.

- POST `/auth/magic/verify`
  - Auth: not required
  - Body: `{ token: string }` (from email link)
  - Success 200: `{ token: string, user: User }`
  - 400: `{ error: { type: "validation_error", message: "Invalid token" | "Token expired" } }`

- GET `/auth/oauth/:provider/start` and `/auth/oauth/:provider/callback`
  - Auth: not required
  - Both return 501 Not Implemented: `{ error: { type: "not_implemented", ... } }`

Users
- GET `/users/me`
  - Auth: required
  - Headers: `Authorization: Bearer <JWT>`
  - Success 200: `{ user: User }`
  - 401: `{ error: { type: "auth_error", message: "Unauthorized" } }`

Courses
- POST `/courses`
  - Auth: required
  - Headers: `Authorization: Bearer <JWT>`, `Content-Type: application/json`, optional `Idempotency-Key`
  - Body: `{ title: string, code?: string, description?: string }`
  - Success 201: `{ course: Course }` (creator is added as `OWNER`)
  - 415 if wrong content-type, 401 if no auth
  - Example:
    ```bash
    curl -X POST $BASE/courses \
      -H "Authorization: Bearer $JWT" \
      -H 'Content-Type: application/json' \
      -H 'Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000' \
      -d '{"title":"CS101","code":"CS101","description":"Intro"}'
    ```

- GET `/courses`
  - Auth: required
  - Query: `limit?` (1..100, default 50), `cursor?` (opaque id)
  - Success 200: `{ items: (CourseWithRole)[], next_cursor: string|null }`
    - `CourseWithRole = Course & { role: "OWNER" | "INSTRUCTOR" | "TA" | "STUDENT" }`

- GET `/courses/:courseId`
  - Auth: required
  - Roles: any membership (`OWNER`, `INSTRUCTOR`, `TA`, `STUDENT`)
  - Success 200: `{ course: Course }`
  - 404: `{ error: { type: "not_found", message: "Course not found" } }`
  - 403 if no membership

Course Billing
- GET `/courses/:courseId/billing`
  - Auth: required
  - Roles: `OWNER`, `INSTRUCTOR`, `TA`
  - Success 200:
    ```json
    {
      "courseId": "c_...",
      "accountId": "acct_...",
      "balance": { "currency": "USD", "balanceMicrodollars": 0 },
      "rates": [{ "metric": "vision_page", "unitPriceMicrodollars": 5000 }]
    }
    ```
  - 403 forbidden, 404 not found

Billing
- GET `/billing/me`
  - Auth: required (user token)
  - Success 200: `{ account, balance }`

- GET `/billing/accounts/:accountId`
  - Auth: required (owner)
  - Success 200: `{ account, balance }`

- GET `/billing/accounts/:accountId/ledger`
  - Auth: required (owner)
  - Query: `limit?`, `cursor?`
  - Success 200: `{ items, next_cursor }`

- GET `/billing/rates`
  - Auth: optional
  - Success 200: `{ items: [{ metric, unitPriceMicrodollars }] }`

- POST `/billing/topups/checkout-session`
  - Auth: required (owner)
  - Body: `{ accountId, amountMicrodollars, successUrl, cancelUrl }`
  - Response: 501 not implemented

- POST `/billing/webhook/stripe`
  - Auth: not required (webhook)
  - Body: `{ accountId, amountMicrodollars, idempotencyKey? }`
  - Success 200: `{ received: true, balanceMicrodollars }`

- POST `/billing/internal/charge`
  - Auth: required (service token)
  - Headers: optional `Idempotency-Key`
  - Body: `{ accountId, courseId, metric, quantity, relatedType, relatedId, meta? }`
  - Success 201: `{ chargedMicrodollars, unitPriceMicrodollars, balanceMicrodollars }`

Memberships
- GET `/memberships/:courseId/members`
  - Auth: required
  - Roles: `OWNER`, `INSTRUCTOR`, or `TA`
  - Success 200: `{ items: CourseMembershipWithUser[] }`
    - `CourseMembershipWithUser = { id, userId, courseId, role, createdAt, user: { id, email, name } }`

- POST `/memberships/:courseId/members`
  - Auth: required
  - Roles: `OWNER` or `INSTRUCTOR`
  - Headers: `Content-Type: application/json`, optional `Idempotency-Key`
  - Body: `{ userId: string, role: "OWNER"|"INSTRUCTOR"|"TA"|"STUDENT" }`
  - Success 201: `{ membership: CourseMembership }`

- PUT `/memberships/:courseId/members/:userId`
  - Auth: required
  - Roles: `OWNER` or `INSTRUCTOR`
  - Headers: `Content-Type: application/json`
  - Body: `{ role: "OWNER"|"INSTRUCTOR"|"TA"|"STUDENT" }`
  - Success 200: `{ membership: CourseMembership }`

- DELETE `/memberships/:courseId/members/:userId`
  - Auth: required
  - Roles: `OWNER` or `INSTRUCTOR`
  - Success 200: `{ deleted: true }`

Assignments
- POST `/courses/:courseId/assignments`
  - Auth: required
  - Roles: `OWNER`, `INSTRUCTOR`, `TA`
  - Headers: `Content-Type: application/json`, optional `Idempotency-Key`
  - Body: `{ title: string, dueAt?: string(RFC3339), totalPoints: number, sourceTex: string }`
  - Success 201: `{ assignment: Assignment }` (status defaults to `DRAFT`)
  - 400 validation_error, 403 forbidden, 404 course not found, 415 wrong content-type

- GET `/courses/:courseId/assignments`
  - Auth: required
  - Roles: any membership
  - Query: `status?` (`DRAFT`|`PUBLISHED`|`ARCHIVED`), `limit?` (1..100), `cursor?`
  - Success 200: `{ items: Assignment[], next_cursor: string|null }`
  - Notes:
    - Students see only `PUBLISHED` (and cannot request other statuses).
    - Staff default to all non-archived assignments.

- GET `/courses/:courseId/assignments/:assignmentId`
  - Auth: required
  - Roles: any membership
  - Success 200: `{ assignment: Assignment }`
  - 403 if student requests non-published assignment
  - 404 if assignment or course not found

- PATCH `/courses/:courseId/assignments/:assignmentId`
  - Auth: required
  - Roles: `OWNER`, `INSTRUCTOR`, `TA`
  - Headers: `Content-Type: application/json`, optional `Idempotency-Key`
  - Body: any subset of `{ title?: string, dueAt?: string|null, totalPoints?: number, sourceTex?: string }`
  - Success 200: `{ assignment: Assignment }`
  - 400 validation_error, 403 forbidden, 404 not found, 415 wrong content-type

- POST `/courses/:courseId/assignments/:assignmentId/publish`
  - Auth: required
  - Roles: `OWNER`, `INSTRUCTOR`
  - Headers: optional `Idempotency-Key`
  - Success 200: `{ assignment: Assignment }` (status `PUBLISHED`, `publishedAt` set)
  - 402 payment_required if balance is negative
  - 403 forbidden, 404 not found, 409 if archived

- POST `/courses/:courseId/assignments/:assignmentId/unpublish`
  - Auth: required
  - Roles: `OWNER`, `INSTRUCTOR`
  - Headers: optional `Idempotency-Key`
  - Success 200: `{ assignment: Assignment }` (status `DRAFT`, `publishedAt` cleared)
  - 403 forbidden, 404 not found, 409 if archived

- DELETE `/courses/:courseId/assignments/:assignmentId`
  - Auth: required
  - Roles: `OWNER`, `INSTRUCTOR`, `TA`
  - Success 200: `{ assignment: Assignment }` (status `ARCHIVED`)
  - 403 forbidden, 404 not found

Submissions
- POST `/assignments/:assignmentId/submissions`
  - Auth: required
  - Roles: student enrolled in the course
  - Headers: optional `Idempotency-Key`
  - Body: `{}` (recommended)
  - Success 201: `{ submission: Submission }`
  - Notes: returns an existing `UPLOADING` submission for the student if one already exists.

- GET `/assignments/:assignmentId/submissions`
  - Auth: required
  - Roles: any membership
  - Query: `userId?=me|<userId>` (staff only for arbitrary userId), `limit?`, `cursor?`
  - Success 200: `{ items: Submission[], next_cursor: string|null }`
  - Notes: students only see their own submissions.

- GET `/submissions/:submissionId`
  - Auth: required
  - Roles: owner student or staff
  - Success 200: `{ submission: Submission }`

- POST `/submissions/:submissionId/submit`
  - Auth: required
  - Roles: owner student or staff
  - Headers: `Content-Type: application/json`, optional `Idempotency-Key`
  - Body: `{ primaryArtifactId: string }`
  - Success 200: `{ submission: Submission }`
  - 402 payment_required if balance is negative
  - 400 validation_error (missing/invalid primaryArtifactId, artifact not owned by submission)
  - 409 conflict (already submitted)

- DELETE `/submissions/:submissionId`
  - Auth: required
  - Roles: owner student or staff
  - Success 200: `{ deleted: true }`
  - 409 conflict if status is not `UPLOADING`

Artifacts
- GET `/submissions/:submissionId/artifacts`
  - Auth: required
  - Roles: owner student or staff
  - Success 200: `{ items: Artifact[] }` (texBody omitted)

- POST `/submissions/:submissionId/artifacts/tex`
  - Auth: required
  - Roles: owner student or staff
  - Headers: `Content-Type: application/json`, optional `Idempotency-Key`
  - Body: `{ texBody: string, contentType?: "application/x-tex"|"text/plain" }`
  - Success 201: `{ artifact: Artifact }`
  - 409 conflict if submission is not `UPLOADING`

- POST `/submissions/:submissionId/artifacts/pdf/presign`
  - Auth: required
  - Roles: owner student or staff
  - Headers: `Content-Type: application/json`, optional `Idempotency-Key`
  - Body: `{ contentType: "application/pdf", filename?: string, sizeBytes?: number }`
  - Success 201: `{ artifactId: string, upload: { url, method, headers, expiresAt } }`
  - 409 conflict if submission is not `UPLOADING`

- POST `/artifacts/:artifactId/complete`
  - Auth: required
  - Roles: owner student or staff
  - Headers: `Content-Type: application/json`, optional `Idempotency-Key`
  - Body: `{ sha256: string, sizeBytes: number }`
  - Success 200: `{ artifact: Artifact }`
  - 409 conflict if already completed or submission not `UPLOADING`

- GET `/artifacts/:artifactId`
  - Auth: required
  - Roles: owner student or staff
  - Success 200: `{ artifact: Artifact }` (texBody omitted)

- GET `/artifacts/:artifactId/body`
  - Auth: required
  - Roles: owner student or staff
  - Success 200: `{ texBody: string }`
  - 400 validation_error if artifact is not TeX

- GET `/artifacts/:artifactId/download`
  - Auth: required
  - Roles: owner student or staff
  - Success 200: `{ url: string, expiresAt: string }`
  - 400 validation_error if artifact is not PDF

- DELETE `/artifacts/:artifactId`
  - Auth: required
  - Roles: owner student or staff
  - Success 200: `{ deleted: true }`
  - 409 conflict if submission is not `UPLOADING`

Evaluations
- GET `/submissions/:submissionId/evaluations`
  - Auth: required
  - Roles: owner student or staff
  - Success 200: `{ items: Evaluation[] }`

- POST `/submissions/:submissionId/evaluations`
  - Auth: required
  - Roles: staff
  - Headers: `Content-Type: application/json`, optional `Idempotency-Key`
  - Body: `{ model?: string }`
  - Success 202: `{ evaluation: Evaluation }`
  - 402 payment_required if balance is negative
  - 409 conflict if canonical TeX does not exist

- GET `/evaluations/:evaluationId`
  - Auth: required
  - Roles: owner student or staff
  - Success 200: `{ evaluation: Evaluation }`

Recommended Client Flows
- TeX submission flow
  - POST `/assignments/:id/submissions` → `submissionId`
  - POST `/submissions/:id/artifacts/tex` → `artifactId`
  - POST `/submissions/:id/submit` with `{ primaryArtifactId: artifactId }`
  - Poll `GET /submissions/:id` or `GET /submissions/:id/evaluations`

- PDF submission flow (S3)
  - POST `/assignments/:id/submissions` → `submissionId`
  - POST `/submissions/:id/artifacts/pdf/presign` → `{ artifactId, upload }`
  - Client `PUT` to `upload.url`
  - POST `/artifacts/:artifactId/complete` with `{ sha256, sizeBytes }`
  - POST `/submissions/:id/submit` with `{ primaryArtifactId: artifactId }`
  - Poll `GET /submissions/:id` or `GET /submissions/:id/evaluations`

Data Shapes
- User
  - `{ id: string, email: string, name?: string, pictureUrl?: string, createdAt: string, updatedAt: string }`
  - Note: Some endpoints may include additional fields present in the DB row (e.g., `emailVerifiedAt`). Frontends should ignore unknown fields.
- Course
  - `{ id: string, title: string, code?: string, description?: string, createdAt: string, updatedAt: string, createdById: string }`
- CourseMembership
  - `{ id: string, userId: string, courseId: string, role: "OWNER"|"INSTRUCTOR"|"TA"|"STUDENT", createdAt: string }`
- Assignment
  - `{ id: string, courseId: string, title: string, dueAt?: string, totalPoints: number, sourceTex: string, status: "DRAFT"|"PUBLISHED"|"ARCHIVED", createdById: string, createdAt: string, updatedAt: string, publishedAt?: string }`
- Submission
  - `{ id: string, assignmentId: string, courseId: string, userId: string, number: number, status: "UPLOADING"|"SUBMITTED"|"PROCESSING"|"READY"|"FAILED", primaryArtifactId?: string, canonicalTexArtifactId?: string, createdAt: string, submittedAt?: string, errorMessage?: string|null }`
- Artifact
  - `{ id: string, submissionId: string, kind: "PDF"|"TEX", origin: "UPLOAD"|"DERIVED", storage: "S3"|"DB", sha256?: string, sizeBytes?: number, contentType?: string, createdAt: string, s3?: { bucket: string, key: string } }`
- Evaluation
  - `{ id: string, submissionId: string, status: "QUEUED"|"RUNNING"|"COMPLETED"|"FAILED", model?: string, score?: { points: number, outOf: number }, result?: object, createdAt: string, completedAt?: string, errorMessage?: string|null }`

Error Behavior & Status Codes
- 400: Validation errors from request body/query (includes `error.fields` map)
- 401: Missing/invalid auth → `{ error: { type: "auth_error", message: "Unauthorized" } }`
- 403: Authenticated but insufficient role → `{ error: { type: "forbidden" } }`
- 404: Resource not found → `{ error: { type: "not_found" } }`
- 409: Idempotency conflict (request in progress) → header `Retry-After: 1`
- 415: Unsupported media type when JSON content-type is required
- 500: Unhandled error → `{ error: { type: "internal_error" } }`

Headers of Note
- `Authorization: Bearer <token>` — required for protected routes
- `Content-Type: application/json` — required for `POST/PUT/PATCH`
- `Idempotency-Key: <uuid>` — optional on mutating requests to enable safe retries
- `X-RateLimit-Limit` and `X-RateLimit-Remaining` — informational

JWT Details (for client storage)
- Algorithm: HS256
- Audience: `gradedescent:user`
- Issuer: `gradedescent`
- Expires: 7 days

Quick cURL Smoke Test
```bash
BASE=${BASE:-http://localhost:3000/v1}
# Register
JWT=$(curl -s -X POST "$BASE/auth/password/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"passw0rd!"}' | jq -r .token)
# Me
curl -s "$BASE/users/me" -H "Authorization: Bearer $JWT" | jq
```

Notes
- OAuth endpoints are placeholders and return 501; integrate a provider before using.
- Email delivery in dev uses the stub in `services/email` (configure for prod).
- Real rate limiting should be enforced upstream (e.g., CDN/Redis).
