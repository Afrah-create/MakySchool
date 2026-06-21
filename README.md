# MakySchool

MakySchool is a multi-tenant school management platform built for Ugandan schools. School tenants run on `apps/web` (`school.makylegacy.com` + `*.school.makylegacy.com`). Platform operators use `apps/admin` (`myschool.makylegacy.com`) to provision schools. All frontends share one Express API.

The codebase is a Node.js monorepo: two Next.js frontends, an Express API, and shared packages for types, UI, and constants.

## Repository layout

```
MakySchool/
├── apps/
│   ├── admin/        Next.js 16 platform console (school provisioning)
│   ├── api/          Express REST API, migrations, file uploads
│   └── web/          Next.js 16 tenant app (school admin UI, auth)
├── packages/
│   ├── shared/       Shared types, constants, env loader
│   └── ui/           Shared design system and dashboard shell
├── infrastructure/
│   └── caddy/        Example reverse proxy config for local subdomains
├── .env.example      Copy to .env at the repo root
└── package.json      Workspace scripts (dev, migrate, seed, build)
```

Legacy database tables from the original single-school product live in `apps/api/migrations/schema.sql`. That file is reference-only and is not executed by the migration runner. Executable migrations are numbered SQL files in `apps/api/migrations/`.

## Architecture

### Runtime split

| Layer | Technology | Port (local) | Production domain |
|-------|------------|--------------|-------------------|
| Tenant web | Next.js 16, React 19, Tailwind 4 | 3000 | `school.makylegacy.com`, `*.school.makylegacy.com` |
| Platform admin | Next.js 16 | 3001 | `myschool.makylegacy.com` |
| API | Express 5, TypeScript | 4000 | Render (or similar) |
| Database | PostgreSQL (Supabase) | — | — |

Each frontend proxies `/api/*` to Express via `next.config.ts` rewrites. This keeps cookies same-origin and avoids CORS issues.

### Multi-tenancy

Tenants are identified by school slug, not by separate databases.

1. **Subdomain routing.** In production, `greenfield-academy.school.makylegacy.com` resolves the tenant `greenfield-academy`. Reserved subdomains (`www`, `api`, `admin`, `app`, `myschool`) are ignored.

2. **Local development.** Plain `localhost` has no subdomain. Set `DEV_TENANT_SLUG` in `.env` to simulate a tenant, or use `schoolslug.localhost` with the Caddy config in `infrastructure/caddy/`.

3. **Tenant headers.** Next.js middleware reads the host (or JWT claims on localhost) and forwards `x-school-slug` and `x-school-id` on every request. The API `tenantMiddleware` resolves slug to `schools.id` and caches the mapping for five minutes.

4. **Row isolation.** School-scoped queries filter on `school_id`. Tenant routes run only after `requireTenantAuth` confirms a valid JWT for that school.

### Two portals, separate apps

| Portal | App | URL | Who uses it |
|--------|-----|-----|-------------|
| Platform admin | `apps/admin` | `myschool.makylegacy.com` (`/login`, `/dashboard`, `/schools/*`) | Platform operators |
| School admin | `apps/web` | `{slug}.school.makylegacy.com` (`/login`, `/dashboard/*`) | School administrators |
| Setup wizard | `apps/web` | `/dashboard/setup` | New schools (no sidebar) |

Platform login uses `POST /api/superadmin/auth/login`. Tenant login uses `POST /api/auth/login` with `x-makyschool-client-app: tenant` and rejects platform administrator emails.

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
| POST | `/api/auth/login` | Tenant school login |
| POST | `/api/superadmin/auth/login` | Platform admin login |
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

**Tenant app** (`apps/web/src/app/`):

- `(platform)/` — auth pages (`/login`, `/auth/change-password`)
- `(tenant)/dashboard/` — school admin area after onboarding
- `page.tsx` — landing page; shows tenant subdomain when resolved from host

**Platform admin** (`apps/admin/src/app/`):

- `/login` — platform administrator sign-in
- `/dashboard` — school list and provisioning
- `/schools/[id]` — school detail

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

Both frontends import from `@makyschool/shared` and `@makyschool/ui` so cookie names, header names, types, and UI stay aligned.

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

- **Tenant web** — `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PLATFORM_APP_URL`, `NEXT_PUBLIC_API_URL`
- **Platform admin** — `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_TENANT_APP_URL`, `SUPERADMIN_JWT_SECRET`
- **API** — `PORT`, `API_INTERNAL_URL`, `CORS_ORIGIN` (comma-separated origins), `PLATFORM_APP_URL`
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

`npm run dev` starts the tenant web (3000), platform admin (3001), and API (4000) via `concurrently`.

- Tenant login: `http://localhost:3000/login`
- Platform admin: `http://localhost:3001/login`
- For a provisioned school on localhost, set `DEV_TENANT_SLUG` or use the school slug field on the login form.

### Subdomain testing with Caddy

The sample `infrastructure/caddy/Caddyfile` proxies `*.localhost` to Next.js and sets `X-School-Slug` from the subdomain label. Run Caddy alongside the dev servers if you want hostname-based tenancy without `DEV_TENANT_SLUG`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | API + tenant web + platform admin |
| `npm run dev:admin` | Platform admin only (port 3001) |
| `npm run dev:api` | API only |
| `npm run dev:web` | Next.js only |
| `npm run migrate` | Apply pending SQL migrations |
| `npm run seed` | Create or verify superadmin account |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | TypeScript check across workspaces |
| `npm run lint` | ESLint across workspaces |

## Deployment notes

Deploy three services:

| Service | Host | Root directory |
|---------|------|----------------|
| API | Render (or similar) | repo root |
| Tenant web | Vercel | `apps/web` |
| Platform admin | Vercel | `apps/admin` |

Set `API_INTERNAL_URL` on both Vercel projects to the API URL. Set `CORS_ORIGIN` on the API to both frontend origins (comma-separated). Set `PLATFORM_APP_URL=https://myschool.makylegacy.com` on the API.

Tenant Vercel domains: `school.makylegacy.com`, `*.school.makylegacy.com`. Admin Vercel domain: `myschool.makylegacy.com`.

File uploads persist on the API filesystem. Mount a volume at `apps/api/uploads` or plan object storage if you scale beyond a single node.

Set `RUN_MIGRATIONS=true` on the first API boot after a release that includes new migration files.

## What is not built yet

- Teacher and student management in the tenant dashboard (provisioned users exist in the database from the legacy schema but the UI is not wired)
- School profile editing after setup completes
- SchoolPay payment flow end-to-end (schema and webhook stub exist; feature flag keeps billing off)
- Full use of legacy tables in `schema.sql` (gamification, assessments, timetables, etc.) — the current product surface is provisioning, setup, and class/subject structure

## License

Private repository. All rights reserved by Makylegacy Enterprise.
