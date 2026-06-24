# MakySchool API - Quick Start

## ✅ What's Been Done

1. **Migrated from Express to FastAPI** with versioned routes (`/api/v1`)
2. **Integrated with Central Auth Service** (separate Supabase authentication)
3. **Two-database architecture**:
   - Auth DB (Supabase) - user authentication
   - School DB (PostgreSQL) - school data
4. **Preserved all migrations** from Express version
5. **Created `school_users` table** to link auth users to schools

## 📁 Project Structure

```
C:\Users\useru\Desktop\clau\
├── auth/                          # Central auth service (port 8000)
│   ├── Supabase authentication
│   └── JWT token issuance
│
└── makyschool/                    # School management (port 4000)
    └── apps/api/
        ├── app/
        │   ├── api/v1/endpoints/
        │   │   ├── auth.py        # Proxy to auth service
        │   │   ├── schools.py     # School CRUD
        │   │   ├── school_users.py # Link users to schools
        │   │   └── webhooks.py
        │   ├── core/config.py
        │   ├── db/
        │   │   ├── pool.py
        │   │   ├── migrate.py
        │   │   └── seed.py
        │   ├── middleware/
        │   └── utils/
        ├── migrations/             # SQL migrations
        ├── main.py
        └── requirements.txt
```

## 🚀 Setup & Run

### 1. Install Dependencies

```bash
cd C:\Users\useru\Desktop\clau\makyschool\apps\api
pip install -r requirements.txt
```

### 2. Configure Environment

Create `.env` at `C:\Users\useru\Desktop\clau\makyschool\.env`:

```env
# MakySchool PostgreSQL Database
DATABASE_URL=postgresql://user:password@localhost:5432/makyschool

# Auth Service Integration (MUST match auth service JWT_SECRET)
AUTH_SERVICE_URL=http://localhost:8000
AUTH_JWT_SECRET=your-jwt-secret-change-in-production
JWT_ALGORITHM=HS256

# API Configuration
APP_NAME=MakySchool API
PORT=4000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Features
SUBSCRIPTIONS_ENABLED=false
```

### 3. Run Migrations

```bash
cd C:\Users\useru\Desktop\clau\makyschool
npm run migrate
```

### 4. Start Services

```bash
# Terminal 1: Auth Service
cd C:\Users\useru\Desktop\clau\auth
python main.py
# Runs on http://localhost:8000

# Terminal 2: MakySchool API
cd C:\Users\useru\Desktop\clau\makyschool
npm run dev:api
# Runs on http://localhost:4000
```

## 📡 API Endpoints

### Auth (Proxied to Central Service)

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/auth/login` | Login user |
| `POST /api/v1/auth/verify-token` | Verify JWT |
| `GET /api/v1/auth/me` | Get user info |

### School Users (New!)

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/school-users/link-user` | Link auth user to school |
| `GET /api/v1/school-users/me/schools` | Get user's schools |

### Schools (Protected)

Require `Authorization: Bearer <token>` header:

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/schools/setup/status` | Setup status |
| `GET /api/v1/schools/classes` | List classes |
| `POST /api/v1/schools/classes` | Create class |
| `GET /api/v1/schools/subjects` | List subjects |
| `GET /api/v1/schools/teachers` | List teachers |
| `GET /api/v1/schools/students` | List students |

## 🔐 Authentication Flow

### 1. User Login

```bash
# Login via auth service
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'

# Returns JWT token
{
  "data": {
    "tokens": {
      "access_token": "eyJhbGc..."
    }
  }
}
```

### 2. Access School Data

```bash
# Use token to access MakySchool API
curl -X GET http://localhost:4000/api/v1/schools/classes \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "x-school-slug: greenfield-academy" \
  -H "x-school-id: 1"
```

### 3. Link User to School

```bash
# Link authenticated user to a school
curl -X POST http://localhost:4000/api/v1/school-users/link-user \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "auth_user_id": "uuid-from-auth-service",
    "role": "teacher",
    "first_name": "John",
    "last_name": "Doe"
  }'
```

## 📚 Documentation

- **Swagger UI**: http://localhost:4000/docs
- **ReDoc**: http://localhost:4000/redoc
- **Architecture**: See `ARCHITECTURE.md`
- **Full README**: See `apps/api/README.md`

## 🔄 Migration Notes

### Changed from Express

- ❌ Removed: Password hashing (handled by auth service)
- ❌ Removed: User signup/login logic
- ❌ Removed: JWT token creation
- ✅ Added: Token verification with auth service
- ✅ Added: `school_users` table for user-school mapping
- ✅ Added: API versioning (`/api/v1`)

### Old `users` Table

The old `users` table with `password_hash` is now deprecated. New approach:

- Users authenticate via **Central Auth Service** (Supabase)
- `school_users` table maps `auth_user_id` → school role
- No passwords stored in MakySchool database

## ⚠️ Important Notes

1. **JWT Secret**: `AUTH_JWT_SECRET` in MakySchool **MUST** match `JWT_SECRET` in auth service
2. **Two Services**: Both auth service (8000) and MakySchool API (4000) must run
3. **Headers**: School endpoints need `x-school-slug` and `x-school-id` headers
4. **CORS**: Update CORS_ORIGINS in both services if deploying

## 🐛 Troubleshooting

### "Invalid authentication credentials"
- Check `AUTH_JWT_SECRET` matches between services
- Verify token is valid: `POST /api/v1/auth/verify-token`

### "Auth service unavailable"
- Ensure auth service is running on port 8000
- Check `AUTH_SERVICE_URL` in config

### "Missing tenant context"
- Include `x-school-slug` and `x-school-id` headers
- Get school ID: `GET /api/v1/school-users/me/schools`

## 📞 Next Steps

1. ✅ Auth service running
2. ✅ MakySchool API migrated to FastAPI
3. ⏳ Update Next.js frontends to use `/api/v1` routes
4. ⏳ Migrate existing users to auth service
5. ⏳ Test full authentication flow
6. ⏳ Deploy to production

## 🎯 Testing

```bash
# Test auth service
curl http://localhost:8000/

# Test MakySchool API
curl http://localhost:4000/api/v1/health

# Full flow test
# 1. Login → get token
# 2. Verify token
# 3. Link user to school
# 4. Access school data
```
