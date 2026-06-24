# MakySchool Architecture - Simplified

## Clear Separation

```
┌─────────────────────────────────────────────┐
│           Frontend (Next.js)                │
└──────────────┬──────────────────────────────┘
               │
               ├── Auth requests ──────────────┐
               │                               │
               │                               ▼
               │                    ┌──────────────────┐
               │                    │  Auth Service    │
               │                    │  (port 8000)     │
               │                    │  - Signup        │
               │                    │  - Login         │
               │                    │  - Passwords     │
               │                    │  - JWT tokens    │
               │                    └──────────────────┘
               │                               │
               │                               ▼
               │                    ┌──────────────────┐
               │                    │  Supabase Auth   │
               │                    └──────────────────┘
               │
               └── Everything else ────────────┐
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │ MakySchool API   │
                                    │  (port 4000)     │
                                    │  - Schools       │
                                    │  - Classes       │
                                    │  - Subjects      │
                                    │  - Teachers      │
                                    │  - Students      │
                                    │  - Fees          │
                                    └──────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │   PostgreSQL     │
                                    │  (School Data)   │
                                    └──────────────────┘
```

## What Goes Where

### Auth Service (http://localhost:8000) - HANDLES:
- ✅ User signup
- ✅ User login
- ✅ Password reset
- ✅ Password update
- ✅ JWT token issuance
- ✅ Token verification
- ✅ MFA
- ✅ OAuth (Google)

### MakySchool API (http://localhost:4000) - HANDLES:
- ✅ Schools CRUD
- ✅ Classes management
- ✅ Subjects management
- ✅ Teachers data
- ✅ Students data
- ✅ Fees management
- ✅ Academic years
- ✅ Subscriptions
- ✅ Setup wizard
- ✅ **Verifies JWT tokens** (doesn't create them)

## How It Works

### 1. User Signs Up
```
Frontend → Auth Service (POST /api/v1/auth/signup)
Response: { user_id, email }
```

### 2. User Logs In
```
Frontend → Auth Service (POST /api/v1/auth/login)
Response: { access_token, refresh_token }
Frontend stores token
```

### 3. User Accesses School Data
```
Frontend → MakySchool API (GET /api/v1/schools/classes)
Headers: { Authorization: "Bearer <token>" }

MakySchool API:
  1. Decodes JWT locally (same secret as auth service)
  2. Extracts user email from token
  3. Returns school data
```

## Configuration

### Auth Service uses:
- Supabase for user storage
- Issues JWT with secret: `JWT_SECRET`

### MakySchool API uses:
- PostgreSQL for school data
- Verifies JWT with same secret: `AUTH_JWT_SECRET` (must match auth's JWT_SECRET)

## Simple Flow

```
User → Login (Auth Service) → Get Token
     → Access Data (MakySchool API with Token) → Get School Info
```

That's it! Auth service = authentication only. MakySchool API = everything else.
