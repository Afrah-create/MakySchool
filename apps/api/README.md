# MakySchool FastAPI Backend

FastAPI backend for MakySchool multi-tenant school management platform.

## Architecture

```
┌─────────────────┐
│  Central Auth   │  (Supabase - port 8000)
│   Service API   │  Handles: signup, login, passwords
└────────┬────────┘
         │ JWT tokens
         ▼
┌─────────────────┐
│  MakySchool API │  (PostgreSQL - port 4000)
│   (This API)    │  Handles: schools, classes, subjects, etc.
└─────────────────┘
```

- **Central Auth Service**: C:\Users\useru\Desktop\clau\auth (port 8000)
  - Manages user authentication with Supabase
  - Issues JWT tokens
  - Handles signup/login/password reset

- **MakySchool API**: This API (port 4000)
  - Manages school data in separate PostgreSQL
  - Verifies JWT tokens from auth service
  - Maps auth users to school roles via `school_users` table

## Project Structure

```
apps/api/
├── app/
│   ├── api/
│   │   └── v1/                 # API version 1
│   │       ├── endpoints/      # Route handlers
│   │       │   ├── auth.py
│   │       │   ├── superadmin.py
│   │       │   ├── schools.py
│   │       │   ├── webhooks.py
│   │       │   └── health.py
│   │       └── api.py          # V1 router aggregator
│   ├── core/
│   │   └── config.py           # Settings & configuration
│   ├── db/
│   │   └── pool.py             # PostgreSQL connection pool
│   ├── middleware/
│   │   ├── auth.py             # JWT authentication
│   │   └── tenant.py           # Multi-tenancy helpers
│   └── utils/
│       └── auth.py             # Password hashing & JWT
├── migrations/                 # SQL migrations (preserved)
├── uploads/                    # File uploads directory
├── main.py                     # Application entry point
└── requirements.txt            # Python dependencies
```

## API Versioning

All routes are versioned under `/api/v1`:

- `/api/v1/health` - Health check
- `/api/v1/auth/*` - Authentication endpoints
- `/api/v1/superadmin/*` - Platform admin endpoints
- `/api/v1/schools/*` - Tenant school endpoints
- `/api/v1/webhooks/*` - Payment webhooks

Future versions can be added as `/api/v2`, `/api/v3`, etc.

## Setup

### 1. Install Python Dependencies

```bash
cd apps/api
pip install -r requirements.txt
```

### 2. Configure Environment

Ensure `.env` at repo root has:

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
TENANT_JWT_SECRET=your-tenant-secret
SUPERADMIN_JWT_SECRET=your-superadmin-secret
PORT=4000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

### 3. Run Migrations

Migrations are auto-run in development. For production:

```bash
python -c "from app.db.migrate import migrate; import asyncio; asyncio.run(migrate())"
```

### 4. Start Server

```bash
# Development (with auto-reload)
python main.py

# Or with uvicorn
uvicorn main:app --reload --port 4000
```

## API Endpoints

### Public Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/auth/login` | Tenant login |
| POST | `/api/v1/auth/change-password` | Change password |
| POST | `/api/v1/auth/forgot-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password |
| GET | `/api/v1/auth/school?slug=X` | Get school preview |
| POST | `/api/v1/auth/logout` | Logout |

### Superadmin Routes (require Bearer token)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/superadmin/auth/login` | Superadmin login |
| GET | `/api/v1/superadmin/auth/me` | Get current admin |
| POST | `/api/v1/superadmin/auth/logout` | Logout |
| GET | `/api/v1/superadmin/schools` | List all schools |
| GET | `/api/v1/superadmin/schools/{id}` | Get school details |
| POST | `/api/v1/superadmin/schools` | Create school |
| PATCH | `/api/v1/superadmin/schools/{id}` | Update school |
| DELETE | `/api/v1/superadmin/schools/{id}` | Delete school |
| GET | `/api/v1/superadmin/admins` | List admins |
| POST | `/api/v1/superadmin/admins` | Create admin |
| GET | `/api/v1/superadmin/subscriptions` | List subscriptions |
| PATCH | `/api/v1/superadmin/subscriptions` | Update subscription |
| GET | `/api/v1/superadmin/settings` | Get platform settings |
| POST | `/api/v1/superadmin/settings` | Update setting |

### Tenant Routes (require Bearer token + tenant headers)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/schools/setup/status` | Get setup status |
| PATCH | `/api/v1/schools/setup/profile` | Save setup profile |
| POST | `/api/v1/schools/setup/complete` | Complete setup |
| GET | `/api/v1/schools/classes` | List classes |
| POST | `/api/v1/schools/classes` | Create class |
| DELETE | `/api/v1/schools/classes/{id}` | Delete class |
| GET | `/api/v1/schools/subjects` | List subjects |
| POST | `/api/v1/schools/subjects` | Create subject |
| GET | `/api/v1/schools/teachers` | List teachers |
| GET | `/api/v1/schools/students` | List students |
| GET | `/api/v1/schools/users` | List users |
| GET | `/api/v1/schools/billing` | Get billing info |
| GET | `/api/v1/schools/fees` | List fees |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/webhooks/schoolpay` | SchoolPay webhook |
| POST | `/api/v1/webhooks/makypay` | MakyPay webhook |

## Authentication

### Tenant Auth

```python
from fastapi import Depends
from app.middleware.auth import get_current_user

@router.get("/protected")
async def protected_route(user = Depends(get_current_user)):
    return {"userId": user["userId"]}
```

### Superadmin Auth

```python
from app.middleware.auth import get_current_superadmin

@router.get("/admin-only")
async def admin_route(admin = Depends(get_current_superadmin)):
    return {"adminId": admin["adminId"]}
```

### Multi-tenancy

Tenant routes require headers:
- `x-school-slug`: School identifier
- `x-school-id`: School database ID

```python
from app.middleware.tenant import get_school_id

school_id = get_school_id(request)
```

## Development

### API Documentation

FastAPI auto-generates docs:
- Swagger UI: `http://localhost:4000/docs`
- ReDoc: `http://localhost:4000/redoc`

### Database Queries

```python
from app.db.pool import get_db_cursor

# Read
with get_db_cursor() as cursor:
    cursor.execute("SELECT * FROM schools WHERE id = %s", (school_id,))
    school = cursor.fetchone()

# Write
with get_db_cursor(commit=True) as cursor:
    cursor.execute("INSERT INTO schools (name) VALUES (%s)", (name,))
```

## Migration from Express

The Express API (`apps/api-backup`) has been replaced with this FastAPI implementation:

- All routes converted to FastAPI endpoints
- JWT auth preserved (same secrets)
- Database schema unchanged
- Migrations preserved in `migrations/`
- Multi-tenancy logic maintained

## Next Steps

1. Test all endpoints with existing Next.js frontends
2. Update frontend API clients if needed (URLs now have `/v1`)
3. Implement remaining webhook logic
4. Add database migration runner script
5. Deploy to production

## License

Private repository - Makylegacy Enterprise
