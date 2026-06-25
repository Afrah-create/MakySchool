# MakySchool FastAPI API

Production FastAPI backend with Express parity from `apps/api-backup`.

## Quick start

```bash
cd apps/api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# From repo root:
npm run dev:api
```

API: `http://localhost:4000`  
Docs (dev): `http://localhost:4000/api/docs`

## Routes

All endpoints are mounted at **legacy** paths (`/api/...`) and **versioned** paths (`/api/v1/...`).

| Area | Legacy prefix |
|------|----------------|
| Health | `/api/health` |
| Auth | `/api/auth` |
| Schools | `/api/schools/*` |
| Superadmin | `/api/superadmin/*` |
| Webhooks | `/api/webhooks/*` |

## Environment

Uses repo-root `.env` (see `.env.example`). Required: `DATABASE_URL`, `TENANT_JWT_SECRET`, `SUPERADMIN_JWT_SECRET`.

### Rate limiting (Redis)

The API uses **slowapi** with a **fixed-window** counter stored in Redis (default). Limits apply per IP (auth routes), per school (PDF/SMS/import), and per authenticated user (catch-all middleware).

| Variable | Default | Purpose |
|----------|---------|---------|
| `REDIS_URL` | _(empty)_ | Redis connection string, e.g. `redis://localhost:6379/0` |
| `RATE_LIMIT_ENABLED` | `true` | Set `false` to disable all rate limits |
| `RATE_LIMIT_STRATEGY` | `fixed-window` | `fixed-window`, `moving-window`, or `sliding-window-counter` |
| `RATE_LIMIT_KEY_PREFIX` | `makyschool:rl` | Namespace for Redis keys |

If Redis is unreachable at API startup, rate limiting is disabled for that process (requests still succeed).

#### Local Redis with Docker

From the repo root:

```bash
docker compose -f docker-compose.redis.yml up -d
```

Add to `.env`:

```env
REDIS_URL=redis://localhost:6379/0
RATE_LIMIT_ENABLED=true
RATE_LIMIT_STRATEGY=fixed-window
```

Restart the API (`npm run dev:api`). On startup you should see a log line like:

`Rate limiting enabled (strategy=fixed-window, redis=localhost:6379/0, ...)`

Verify Redis:

```bash
docker compose -f docker-compose.redis.yml exec redis redis-cli ping
# PONG
```

Inspect rate-limit keys (after hitting a limited route):

```bash
docker compose -f docker-compose.redis.yml exec redis redis-cli --scan --pattern 'makyschool:rl*'
```

Stop Redis when done:

```bash
docker compose -f docker-compose.redis.yml down
```

#### Production / managed Redis

Use your provider’s URL (Upstash, ElastiCache, Redis Cloud, etc.):

```env
REDIS_URL=rediss://:PASSWORD@your-host:6379/0
```

Use `rediss://` for TLS. Pick a dedicated database index (`/0`, `/1`, …) if the instance is shared. No manual schema or migrations are required — slowapi creates keys on first request.

## Migrations

```bash
npm run migrate
npm run seed
```

Migration `014_auth_service_integration.sql` is skipped (unused; incompatible with UUID schema).

## PDF receipts

Fee receipt PDFs use WeasyPrint (`pip install weasyprint`). On Linux you may need system packages: `libpango-1.0-0`, `libcairo2`, `libgdk-pixbuf-2.0-0`.

## Biometrics

Scaffold only: `app/bio/` (Phase 2).
