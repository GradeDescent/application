# GradeDescent Frontend

Self-hosted GradeDescent web app built with Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui, TanStack Query, Zod, and KaTeX.

## Requirements
- Node.js 20+
- GradeDescent backend running locally

## Quick start
```bash
cp .env.local.example .env.local
npm install
npm run dev
```

App runs at http://localhost:3001 by default.

## Configuration
Environment variables are read by Next.js at build/runtime.

- `API_ORIGIN` (default `http://localhost:3000`)
- `API_V1_PATH` (default `/v1`)

The frontend calls `/api/v1/...` in the browser. Next.js rewrites those requests to `${API_ORIGIN}${API_V1_PATH}` to avoid CORS issues.

## Features
- JWT auth (stored in localStorage; TODO to migrate to httpOnly cookies).
- Courses list + create.
- Assignments list + detail with TeX rendering.
- Submission widget supporting TeX and PDF upload flows.
- Polling for submission/evaluation status.

## Notes
- PDF upload uses presigned PUT URLs. The current client includes a TODO to compute SHA256 for `/artifacts/:id/complete`.
- Evaluation results render summary + items when provided by the backend.

## Lint
```bash
npm run lint
```

## Favicon build
Favicons are generated from `public/icon.svg` with a solid `#e4dfda` background.

```bash
npm run favicon:build
```
