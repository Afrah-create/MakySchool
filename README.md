# MakySchool

MakySchool is a multi-tenant school management platform built for Ugandan schools. A single deployment hosts many schools. Each school gets its own subdomain, isolated data, and an admin dashboard for day-to-day configuration. Platform operators use a separate superadmin console to provision schools and monitor subscription status.

The codebase is a Node.js monorepo: a Next.js frontend, an Express API, and a shared package for types and constants used by both.

## Repository layout

```
MakySchool/
├── apps/
│   ├── api/          Express REST API, migrations, file uploads
│   └── web/          Next.js 16 app (tenant UI, superadmin UI, auth)
├── packages/
│   └── shared/       Shared types, constants, env loader
├── infrastructure/
│   └── caddy/        Example reverse proxy config for local subdomains
├── .env.example      Copy to .env at the repo root
└── package.json      Workspace scripts (dev, migrate, seed, build)
```

Legacy database tables from the original single-school product live in `apps/api/migrations/schema.sql`. That file is reference-only and is not executed by the migration runner. Executable migrations are numbered SQL files in `apps/api/migrations/`.

## Architecture

### Runtime split

| Layer | Technology | Port (local) |
|-------|------------|--------------|
| Web | Next.js 16, React 19, Tailwind 4 | 3000 |
| API | Express 5, TypeScript | 4000 |
| Database | PostgreSQL (Supabase in production) | — |

The browser talks to Next.js on port 3000. API routes under `/api/*` are rewritten by `next.config.ts` to the Express server. This keeps cookies same-origin and avoids CORS issues during development.

### Multi-tenancy

Tenants are identified by school slug, not by separate databases.

1. **Subdomain routing.** In production, `greenfield-academy.makyschool.com` resolves the tenant `greenfield-academy`. Reserved subdomains (`www`, `api`, `admin`, `app`) are ignored.

2. **Local development.** Plain `localhost` has no subdomain. Set `DEV_TENANT_SLUG` in `.env` to simulate a tenant, or use `schoolslug.localhost` with the Caddy config in `infrastructure/caddy/`.

3. **Tenant headers.** Next.js middleware reads the host (or JWT claims on localhost) and forwards `x-school-slug` and `x-school-id` on every request. The API `tenantMiddleware` resolves slug to `schools.id` and caches the mapping for five minutes.

4. **Row isolation.** School-scoped queries filter on `school_id`. Tenant routes run only after `requireTenantAuth` confirms a valid JWT for that school.

### Two portals, one login page

`/login` handles both account types. The API checks `super_admins` first, then school `users`. Successful superadmin login sets `superadmin_*` cookies and redirects to `/superadmin/dashboard`. School admin login sets `tenant_*` cookies and follows the onboarding path below.

| Portal | URL prefix | Who uses it |
|--------|------------|-------------|
| Superadmin | `/superadmin/*` | Platform operators |
| School admin | `/dashboard/*` | School administrators |
| Setup wizard | `/dashboard/setup` | New schools (no sidebar) |

### School provisioning and onboarding

Superadmins create schools from the dashboard slide-over (`POST /api/superadmin/schools`). The API:

- Inserts a `schools` row with `status = 'setup'` and a unique slug
- Creates the first admin user with a random temporary password (`is_temp_password = true`)
- Returns credentials for handoff to the school

When that admin signs in:

1. **Change password** (`/auth/change-password`) if `is_temp_password` is set. JWT carries `mustChangePassword`.
2. **Setup wizard** (`/dashboard/setup`) until profile, academic year, and grading scale are saved and `setup_completed_at` is set on the school.
3. **Dashboard** (`/dashboard`) for ongoing work (classes, subjects, etc.).

Next.js middleware enforces this sequence. The JWT is refreshed when setup completes so `setupCompleted` is true in the token.

### Subscriptions and billing

Term-based billing via SchoolPay is wired in the schema and API but turned off by default. Set both of these in `.env` to enable it:

```
SUBSCRIPTIONS_ENABLED=true
NEXT_PUBLIC_SUBSCRIPTIONS_ENABLED=true
```

When disabled, the subscription guard on the API is skipped, billing UI is hidden, and no payment lockout overlay is shown. The webhook endpoint at `/api/webhooks/schoolpay` remains for when integration goes live.

## API reference

Public routes (no tenant context):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | Superadmin or school login |
| POST | `/api/auth/logout` | Clear session cookies |
| POST | `/api/auth/change-password` | First-login password change |
| POST | `/api/superadmin/auth/*` | Superadmin session helpers |
| GET/POST | `/api/superadmin/schools` | List and provision schools |
| POST | `/api/webhooks/schoolpay` | Payment webhook (HMAC verified) |

Tenant routes (require `x-school-slug`, valid JWT, active subscription when billing is on):

| Method | Path | Purpose |
|--------|------|---------|
| GET/PATCH | `/api/schools/setup/*` | Setup wizard status and saves |
| GET/POST/DELETE | `/api/schools/classes` | Class levels and streams |
| GET/POST | `/api/schools/subjects` | Subject catalogue |
| POST/DELETE | `/api/schools/classes/:id/subjects` | Link subjects to a class |

Uploaded logos and stamps are stored under `apps/api/uploads/` and served at `/uploads/*`.

## Web application structure

Route groups under `apps/web/src/app/`:

- `(platform)/` — shared auth pages (`/login`, `/auth/change-password`)
- `(tenant)/dashboard/` — school admin area after onboarding
- `superadmin/` — platform console
- `page.tsx` — landing page; shows tenant subdomain when resolved from host

Client components fetch through `apiClient` in `src/lib/api/client.ts`, which attaches tenant headers and sends cookies. Server components use `apiFetch` with headers injected by middleware.

Key client providers:

- `TenantSchoolProvider` — school record and setup status for dashboard pages
- `AuthProvider` — login form state

The setup wizard (`WizardShell` + step components) saves each step to the API and drafts progress in `localStorage` keyed by school ID.

## Shared package

`@makyschool/shared` exports:

- TypeScript types (`SchoolRecord`, `ClassWithDetails`, JWT payloads, etc.)
- Constants (`TENANT_HEADERS`, cookie names, class levels, Uganda term names)
- `loadMonorepoEnv()` — reads root `.env` and optional `.env.local`

Both apps import from here so cookie names, header names, and types stay aligned.

## Database

PostgreSQL with `pg` connection pooling (`apps/api/src/db/pool.ts`). Connection string comes from `DATABASE_URL` in the root `.env`.

Migrations run automatically when the API starts in development (`NODE_ENV !== 'production'`). In production, set `RUN_MIGRATIONS=true` on deploy or run manually:

```bash
npm run migrate
```

Current migration files:

| File | What it does |
|------|--------------|
| `001_multi_tenant_shift.sql` | Super admins table, school SaaS columns, subscription tables, slug backfill |
| `002_setup_flow_columns.sql` | `setup_completed_at`, `is_temp_password`, `setup_completed` |

Seed the platform superadmin:

```bash
npm run seed
```

Credentials come from `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` in `.env`. The seed is idempotent; use `SUPERADMIN_FORCE_RESET=true` to rotate the password.

## Environment variables

All configuration lives in a single `.env` at the repository root. Copy `.env.example` and fill in values. Optional overrides go in `.env.local` (gitignored).

Important groups:

- **Next.js** — `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL` (use `/api` for same-origin proxy)
- **API** — `PORT`, `API_INTERNAL_URL`, `CORS_ORIGIN`
- **Database** — `DATABASE_URL` (URL-encode special characters in passwords)
- **Auth** — `TENANT_JWT_SECRET` must match between API and Next.js middleware; `SUPERADMIN_JWT_SECRET` for platform sessions
- **Local tenant** — `DEV_TENANT_SLUG` when testing without subdomains

`TENANT_JWT_SECRET` is required for middleware to verify tenant sessions. If it is missing or wrong, protected routes redirect to login in a loop.

## Local development

Requirements: Node 20.9+, PostgreSQL (or Supabase project), npm.

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and secrets

npm install
npm run migrate
npm run seed
npm run dev
```

`npm run dev` starts both the API (port 4000) and Next.js (port 3000) via `concurrently`.

Open `http://localhost:3000/login` for the unified login. Superadmin goes to `/superadmin/dashboard`. For a provisioned school, set `DEV_TENANT_SLUG` to that school's slug or log in with the school slug field on the login form.

### Subdomain testing with Caddy

The sample `infrastructure/caddy/Caddyfile` proxies `*.localhost` to Next.js and sets `X-School-Slug` from the subdomain label. Run Caddy alongside the dev servers if you want hostname-based tenancy without `DEV_TENANT_SLUG`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | API + web in watch mode |
| `npm run dev:api` | API only |
| `npm run dev:web` | Next.js only |
| `npm run migrate` | Apply pending SQL migrations |
| `npm run seed` | Create or verify superadmin account |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | TypeScript check across workspaces |
| `npm run lint` | ESLint across workspaces |

## Deployment notes

Run the API and Next.js as separate processes. Point `API_INTERNAL_URL` at the API service so Next.js rewrites work in production. Set strong values for both JWT secrets and superadmin credentials before going live.

File uploads persist on the API filesystem. Mount a volume at `apps/api/uploads` or plan object storage if you scale beyond a single node.

Set `RUN_MIGRATIONS=true` on the first API boot after a release that includes new migration files.

## What is not built yet

- Teacher and student management in the tenant dashboard (provisioned users exist in the database from the legacy schema but the UI is not wired)
- School profile editing after setup completes
- SchoolPay payment flow end-to-end (schema and webhook stub exist; feature flag keeps billing off)
- Full use of legacy tables in `schema.sql` (gamification, assessments, timetables, etc.) — the current product surface is provisioning, setup, and class/subject structure

## License

Private repository. All rights reserved by Makylegacy Enterprise.
