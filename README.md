# MakySchool

MakySchool is a multi-tenant school management platform built for Ugandan schools. School tenants run on `apps/web` (`school.makylegacy.com` + `*.school.makylegacy.com`). Platform operators use `apps/admin` (`myschool.makylegacy.com`) to provision schools. The public marketing site lives in `apps/marketing` (`makyschool.com`). All frontends share one **FastAPI** backend in `apps/api`.

The codebase is a monorepo: three Next.js frontends, a Python API, and shared packages for types, UI, and constants. The previous Express API is preserved read-only in `apps/api-backup/` for reference during the migration.

## Repository layout

```
MakySchool/
├── apps/
│   ├── admin/          Next.js 16 platform console (school provisioning)
│   ├── api/            FastAPI REST API (asyncpg), migrations, uploads
│   ├── api-backup/     Legacy Express API (reference only, not deployed)
│   ├── marketing/      Next.js 16 public marketing site
│   └── web/            Next.js 16 tenant app (school admin, teacher, bursar, learner)
├── packages/
│   ├── shared/         Shared types, constants, env loader
│   └── ui/             Shared design system, BrandLogo, dashboard shell
├── infrastructure/
│   └── caddy/          Reverse proxy for local subdomain routing
├── .env.example        Copy to .env at the repo root
└── package.json        Workspace scripts (dev, migrate, seed, build)
```

Legacy database tables from the original single-school product live in `apps/api/migrations/schema.sql`. That file is reference-only and is not executed by the migration runner. Executable migrations are numbered SQL files in `apps/api/migrations/`.

## Architecture

### Runtime split

| Layer | Technology | Port (local) | Production domain |
|-------|------------|--------------|-------------------|
| Tenant web | Next.js 16, React 19, Tailwind 4 | 3000 | `school.makylegacy.com`, `*.school.makylegacy.com` |
| Platform admin | Next.js 16 | 3001 | `myschool.makylegacy.com` |
| Marketing | Next.js 16 | 3002 | `makyschool.com` |
| API | FastAPI, Python 3.12–3.14, asyncpg | 4000 | Render (or similar) |
| Database | PostgreSQL (Supabase) | — | — |

Each frontend proxies `/api/*` to the API via `next.config.ts` rewrites. This keeps cookies same-origin and avoids CORS issues.

### Express → FastAPI migration

The production API moved from Express (`apps/api-backup/`) to FastAPI (`apps/api/`). The new backend:

- Uses **asyncpg** with a request-scoped connection (`ContextVar`) so handlers on the same request share one DB connection safely.
- Keeps **parity** with the Express route surface so existing Next.js clients work without URL changes.
- Runs migrations and seeding through Python (`app/db/migrate.py`, `app/db/seed.py`) using the same SQL files as before.
- Authenticates tenants and superadmins **locally** (`users.password_hash` + bcrypt, JWT cookies). A planned central auth-service integration (`014_auth_service_integration.sql`) is skipped and not active.

See `apps/api/README.md` for API-specific setup (venv, WeasyPrint, OpenAPI docs).

### API versioning

Every router is mounted **twice** via `mount_v1_and_legacy` in `apps/api/main.py`:

| Style | Example | Use |
|-------|---------|-----|
| Legacy (default for frontends) | `/api/schools/classes` | Existing Next.js apps, cookies, rewrites |
| Versioned | `/api/v1/schools/classes` | New integrations, external clients, forward-compatible contracts |

Both paths hit the same handlers. Prefer `/api/v1/*` for new consumers; legacy `/api/*` remains supported for backward compatibility.

OpenAPI docs (development only): `http://localhost:4000/api/docs`

### FastAPI backend layout

```
apps/api/
├── main.py                 # App factory, CORS, dual-mount, lifespan
├── requirements.txt
├── migrations/             # Numbered SQL migrations
├── uploads/                # School logos, stamps (served at /uploads/*)
└── app/
    ├── config.py           # Pydantic settings (reads repo-root .env)
    ├── db/                 # asyncpg pool, migrate, seed
    ├── middleware/         # auth, tenant, subscription guard, errors
    ├── routers/            # auth, setup, classes, subjects, users, teachers,
    │                       # students, fees, billing, superadmin, webhooks
    ├── lib/                # JWT, passwords, permissions, uploads, PDF helpers
    └── services/           # subscriptions, makypay, platform settings
```

`redirect_slashes=False` avoids 307 redirects on collection routes (e.g. `POST /api/schools/classes`).

### Multi-tenancy

Tenants are identified by school slug, not by separate databases.

1. **Subdomain routing.** In production, `greenfield-academy.school.makylegacy.com` resolves the tenant `greenfield-academy`. Reserved subdomains (`www`, `api`, `admin`, `app`, `myschool`) are ignored.

2. **Local development.** Plain `localhost` has no subdomain. Set `DEV_TENANT_SLUG` in `.env` to simulate a tenant, or use `schoolslug.localhost` with the Caddy config in `infrastructure/caddy/`.

3. **Tenant headers.** Next.js middleware reads the host (or JWT claims on localhost) and forwards `x-school-slug` and `x-school-id` on every request. The API tenant middleware resolves slug to `schools.id` and caches the mapping.

4. **Row isolation.** School-scoped queries filter on `school_id`. Tenant routes run only after auth confirms a valid JWT for that school.

### Role-based portals inside `apps/web`

School-side users share one tenant app but are organized by role portal:

| Portal | Route group | URLs | Roles |
|--------|-------------|------|-------|
| Public auth | `(public)/` | `/login`, `/auth/change-password` | Unauthenticated |
| School admin | `(school-admin)/` | `/dashboard/*` | `admin`, `head_teacher` |
| Bursar | `(bursar)/` | `/bursar/*` | `bursar` |
| Teacher | `(teacher)/` | `/teacher/*` | `teacher` |
| Learner | `(learner)/` | `/learner/*` | `learner` |

Source layout:

```
apps/web/src/
├── app/(public)/           # shared login & password change
├── app/(school-admin)/     # school management dashboard
├── app/(bursar)/           # fees-focused bursar portal
├── app/(teacher)/          # teacher portal (scaffolded)
├── app/(learner)/          # learner portal (scaffolded)
├── components/school-admin/
├── components/layout/school-admin/
├── components/layout/shared/
└── lib/roles/              # nav config, portal guards, post-login routing
```

Middleware and layout guards redirect each role to its home path after login. RBAC permission keys live in `packages/shared/src/constants/rbac.ts` and are enforced in API handlers.

### Two deployable apps (+ marketing)

| Portal | App | URL | Who uses it |
|--------|-----|-----|-------------|
| Platform admin | `apps/admin` | `myschool.makylegacy.com` (`/login`, `/dashboard`, `/schools/*`) | Platform operators |
| School admin | `apps/web` | `{slug}.school.makylegacy.com` (`/dashboard/*`) | `admin`, `head_teacher` |
| Bursar | `apps/web` | `/bursar/dashboard` | `bursar` |
| Teacher | `apps/web` | `/teacher/dashboard` | `teacher` |
| Learner | `apps/web` | `/learner/dashboard` | `learner` |
| Setup wizard | `apps/web` | `/dashboard/setup` | New school admins |
| Marketing | `apps/marketing` | `makyschool.com` | Public |

Platform login uses `POST /api/superadmin/auth/login`. Tenant login uses `POST /api/auth/login` with `x-makyschool-client-app: tenant` and rejects platform administrator emails.

### School provisioning and onboarding

Superadmins create schools from the dashboard slide-over (`POST /api/superadmin/schools`). The API:

- Inserts a `schools` row with `status = 'setup'` and a unique slug
- Creates the first admin user with a random temporary password (`is_temp_password = true`)
- Returns credentials for handoff to the school

When that admin signs in:

1. **Change password** (`/auth/change-password`) if `is_temp_password` is set. JWT carries `mustChangePassword`.
2. **Setup wizard** (`/dashboard/setup`) until profile, academic year, and grading scale are saved and `setup_completed_at` is set on the school.
3. **Dashboard** (`/dashboard`) for ongoing work (classes, subjects, teachers, students, fees, etc.).

Next.js middleware enforces this sequence. The JWT is refreshed when setup completes so `setupCompleted` is true in the token.

### Subscriptions and billing

Term-based billing via SchoolPay / MakyPay is wired in the schema and API but turned off by default. Set both of these in `.env` to enable it:

```
SUBSCRIPTIONS_ENABLED=true
NEXT_PUBLIC_SUBSCRIPTIONS_ENABLED=true
```

When disabled, the subscription guard on the API is skipped, billing UI is hidden, and no payment lockout overlay is shown. Webhook endpoints at `/api/webhooks/schoolpay` and `/api/webhooks/makypay` remain for when integration goes live.

## API reference

All paths below exist at both `/api/...` and `/api/v1/...` unless noted.

Public routes (no tenant context):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check with DB probe |
| POST | `/api/auth/login` | Tenant school login |
| POST | `/api/superadmin/auth/login` | Platform admin login |
| POST | `/api/auth/logout` | Clear session cookies |
| POST | `/api/auth/change-password` | First-login / forced password change |
| POST | `/api/auth/forgot-password` | Request reset email |
| POST | `/api/auth/reset-password` | Complete password reset |
| GET | `/api/auth/school/:slug` | School preview for login page |
| POST | `/api/superadmin/auth/*` | Superadmin session helpers |
| GET/POST | `/api/superadmin/schools` | List and provision schools |
| GET/PATCH | `/api/superadmin/settings` | Platform settings |
| POST | `/api/webhooks/schoolpay` | SchoolPay webhook (HMAC verified) |
| POST | `/api/webhooks/makypay` | MakyPay webhook (HMAC verified) |

Tenant routes (require `x-school-slug`, valid JWT, active subscription when billing is on):

| Method | Path | Purpose |
|--------|------|---------|
| GET/PATCH | `/api/schools/setup/*` | Setup wizard status and saves |
| GET/POST/DELETE | `/api/schools/classes` | Class levels and streams |
| GET/POST | `/api/schools/subjects` | Subject catalogue and class assignments |
| GET/POST/PATCH/DELETE | `/api/schools/users` | School user accounts |
| GET/POST/PATCH | `/api/schools/teachers` | Teacher profiles and assignments |
| GET/POST/PATCH | `/api/schools/students` | Student records |
| GET/POST/PATCH | `/api/schools/fees/*` | Fee structures, payments, receipts (PDF), SMS |
| GET/POST | `/api/schools/billing/*` | Subscription billing (when enabled) |

Uploaded logos and stamps are stored under `apps/api/uploads/` and served at `/uploads/*`.

## Web application structure

**Tenant app** (`apps/web/src/app/`):

- `(public)/` — auth pages (`/login`, `/auth/change-password`)
- `(school-admin)/dashboard/` — school admin area after onboarding
- `(bursar)/` — bursar fees portal
- `page.tsx` — landing page; shows tenant subdomain when resolved from host

**Platform admin** (`apps/admin/src/app/`):

- `/login` — platform administrator sign-in
- `/dashboard` — school list and provisioning
- `/schools/[id]` — school detail

**Marketing** (`apps/marketing/src/app/`):

- Public pages: features, solutions, pricing, contact, SEO landing content

Client components fetch through `apiClient` in `src/lib/api/client.ts`, which attaches tenant headers and sends cookies. Server components use `apiFetch` with headers injected by middleware.

Key client providers:

- `TenantSchoolProvider` — school record and setup status for dashboard pages
- `AuthProvider` — login form state

The setup wizard (`WizardShell` + step components) saves each step to the API and drafts progress in `localStorage` keyed by school ID.

## Shared packages

`@makyschool/shared` exports:

- TypeScript types (`SchoolRecord`, `ClassWithDetails`, JWT payloads, etc.)
- Constants (`TENANT_HEADERS`, cookie names, class levels, Uganda term names, RBAC permissions)
- `loadMonorepoEnv()` — reads root `.env` and optional `.env.local`

`@makyschool/ui` exports the shared design system, including `BrandLogo` (`/makyschool-logo.jpeg`).

All frontends import from `@makyschool/shared` and `@makyschool/ui` so cookie names, header names, types, and UI stay aligned.

## Database

PostgreSQL with **asyncpg** connection pooling (`apps/api/app/db/pool.py`). Connection string comes from `DATABASE_URL` in the root `.env`.

Migrations run automatically when the API starts in development. In production, run manually or on deploy:

```bash
npm run migrate
```

Numbered migrations through `015_*` cover multi-tenancy, setup flow, academic structure, RBAC users, teachers, students, fees, subscriptions, and platform settings. Migration `014_auth_service_integration.sql` is **skipped** (unused; incompatible with the current UUID schema).

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
- **Marketing** — `NEXT_PUBLIC_SITE_URL`
- **API** — `PORT`, `API_INTERNAL_URL`, `CORS_ORIGIN` (comma-separated origins), `PLATFORM_APP_URL`, `ENVIRONMENT`
- **Database** — `DATABASE_URL` (URL-encode special characters in passwords)
- **Auth** — `TENANT_JWT_SECRET` must match between API and Next.js middleware; `SUPERADMIN_JWT_SECRET` for platform sessions
- **Local tenant** — `DEV_TENANT_SLUG` when testing without subdomains

`TENANT_JWT_SECRET` is required for middleware to verify tenant sessions. If it is missing or wrong, protected routes redirect to login in a loop.

## Local development

Requirements: Node 20.9+, Python 3.12+ (3.12–3.14 supported), PostgreSQL (or Supabase project), npm. Caddy is bundled automatically (`scripts/ensure-caddy.sh` on `npm install` / `npm run dev`).

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and secrets

npm install

# Python API virtualenv (first time)
cd apps/api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ../..

npm run migrate
npm run seed
npm run dev
```

`npm run dev` starts Caddy (:8080), tenant web (:3000), platform admin (:3001), and API (:4000). **Use Caddy as the browser entry point** — it mirrors production subdomain routing.

| URL | App |
|-----|-----|
| `http://localhost:8080` | Tenant web (root) |
| `http://<school-slug>.localhost:8080` | Tenant web (school subdomain) |
| `http://myschool.localhost:8080` | Platform admin |

Marketing runs separately: `npm run dev:marketing` (port 3002).

Set `API_INTERNAL_URL=http://localhost:4000` in `.env` for local dev (never point at Render while running locally).

Direct ports (`:3000`, `:3001`) still work for debugging but skip Caddy hostname routing.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Caddy + API + tenant web + platform admin |
| `npm run dev:caddy` | Caddy reverse proxy only (:8080) |
| `npm run dev:admin` | Platform admin only (port 3001) |
| `npm run dev:api` | FastAPI only (port 4000, uses `.venv` if present) |
| `npm run dev:web` | Tenant Next.js only |
| `npm run dev:marketing` | Marketing site only (port 3002) |
| `npm run migrate` | Apply pending SQL migrations |
| `npm run seed` | Create or verify superadmin account |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | TypeScript check across workspaces |
| `npm run lint` | ESLint across workspaces |

## Deployment notes

Deploy four services:

| Service | Host | Root directory |
|---------|------|----------------|
| API | Render (or similar) | repo root — start command runs uvicorn from `apps/api` |
| Tenant web | Vercel | `apps/web` |
| Platform admin | Vercel | `apps/admin` |
| Marketing | Vercel | `apps/marketing` |

Set `API_INTERNAL_URL` on all Vercel projects to the API URL. Set `CORS_ORIGIN` on the API to all frontend origins (comma-separated). Set `PLATFORM_APP_URL=https://myschool.makylegacy.com` on the API.

Tenant Vercel domains: `school.makylegacy.com`, `*.school.makylegacy.com`. Admin Vercel domain: `myschool.makylegacy.com`. Marketing: `makyschool.com`.

File uploads persist on the API filesystem. Mount a volume at `apps/api/uploads` or plan object storage if you scale beyond a single node.

Run `npm run migrate` on deploy after releases that include new migration files.

## What is not built yet

- Full teacher and learner portal experiences (routes exist; dashboard depth is limited)
- Biometric attendance (`apps/api/app/bio/` — scaffold only, routes not mounted)
- SchoolPay / MakyPay payment flow end-to-end (schema and webhooks exist; feature flag keeps billing off)
- Full use of legacy tables in `schema.sql` (gamification, assessments, timetables, etc.)

## License

Private repository. All rights reserved by Makylegacy Enterprise.
