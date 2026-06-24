# MakySchool FastAPI - Final Setup

## ✅ What's Done

Migrated MakySchool from **Express to FastAPI** with clean auth separation:

- **Auth Service** (port 8000) - Handles ONLY authentication
- **MakySchool API** (port 4000) - Handles ONLY school data

## 📁 Structure

```
C:\Users\useru\Desktop\clau\
├── auth/                    # Auth service (separate project)
│   └── Handles: signup, login, passwords, JWT
│
└── makyschool/
    └── apps/api/           # This API
        ├── app/
        │   ├── api/v1/endpoints/
        │   │   ├── health.py
        │   │   ├── auth.py      # Info only
        │   │   ├── users.py     # Link users to schools
        │   │   ├── schools.py   # School CRUD
        │   │   └── webhooks.py
        │   ├── middleware/auth.py  # Verifies JWT
        │   └── db/pool.py
        └── migrations/
```

## 🚀 Quick Start

### 1. Install

```bash
cd C:\Users\useru\Desktop\clau\makyschool\apps\api
pip install -r requirements.txt
```

### 2. Configure `.env`

At `C:\Users\useru\Desktop\clau\makyschool\.env`:

```env
# PostgreSQL for school data
DATABASE_URL=postgresql://user:pass@localhost:5432/makyschool

# Auth integration (MUST match auth service JWT_SECRET)
AUTH_SERVICE_URL=http://localhost:8000
AUTH_JWT_SECRET=your-jwt-secret-from-auth-service

PORT=4000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

### 3. Run

```bash
# Terminal 1: Auth Service
cd C:\Users\useru\Desktop\clau\auth
python main.py
# → http://localhost:8000

# Terminal 2: MakySchool API
cd C:\Users\useru\Desktop\clau\makyschool
npm run dev:api
# → http://localhost:4000
```

## 📡 API Endpoints

### Auth (handled by auth service - port 8000)
Clients call auth service directly:

- `POST /api/v1/auth/signup` - Register
- `POST /api/v1/auth/login` - Login (returns JWT)
- `POST /api/v1/auth/verify-token` - Verify JWT
- `GET /api/v1/auth/me` - Get user info

### School Data (this API - port 4000)
Require `Authorization: Bearer <token>`:

- `GET /api/v1/schools/classes` - List classes
- `POST /api/v1/schools/classes` - Create class
- `GET /api/v1/schools/subjects` - List subjects
- `GET /api/v1/schools/teachers` - List teachers
- `GET /api/v1/schools/students` - List students
- `GET /api/v1/schools/setup/status` - Setup status

## 🔐 Authentication Flow

```bash
# 1. Login via auth service
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "pass123"}'

# Response: { "data": { "tokens": { "access_token": "eyJ..." }}}

# 2. Use token to access school data
curl -X GET http://localhost:4000/api/v1/schools/classes \
  -H "Authorization: Bearer eyJ..." \
  -H "x-school-slug: my-school" \
  -H "x-school-id: 1"
```

## 🔑 Key Points

1. **Auth service issues JWT tokens** with shared secret
2. **MakySchool API verifies JWT** using same secret
3. **Frontend calls both APIs**:
   - Auth service for login/signup
   - MakySchool API for school data
4. **No passwords in MakySchool database** - all auth in Supabase

## 📚 Docs

- **Swagger**: http://localhost:4000/docs
- **Architecture**: See `SIMPLE_ARCHITECTURE.md`

## ✅ Done

- ✅ Express → FastAPI migration
- ✅ API versioning (`/api/v1`)
- ✅ Auth service integration
- ✅ JWT verification
- ✅ All migrations preserved
- ✅ School data endpoints working

Auth = auth service. Everything else = this API. Simple! 🎉
