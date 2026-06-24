# MakySchool Two-Database Architecture

## Overview

MakySchool uses a **two-database architecture** with separate authentication and application databases:

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND APPS                             │
│  (Next.js - apps/web, apps/admin)                               │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  │ HTTP Requests
                  ▼
    ┌─────────────────────────────┐
    │     API Gateway/Router       │
    │    (Can be Caddy/Nginx)      │
    └─────────┬──────────┬─────────┘
              │          │
        Auth  │          │  School Data
        ┌─────▼──────┐   │
        │            │   │
    ┌───▼────────┐   │   │   ┌──────────────┐
    │  Central   │   │   └───▶ MakySchool   │
    │   Auth     │   │       │     API      │
    │  Service   │   │       │ (This API)   │
    │ :8000      │   │       │   :4000      │
    └────┬───────┘   │       └──────┬───────┘
         │           │              │
         │  Issues   │              │ Verifies
         │  JWT      │              │ JWT
         │           │              │
         ▼           │              ▼
  ┌────────────┐    │       ┌─────────────┐
  │  Supabase  │    │       │ PostgreSQL  │
  │   Auth DB  │    │       │ Schools DB  │
  │            │    │       │             │
  └────────────┘    │       └─────────────┘
         ▲          │              ▲
         └──────────┘              │
            User                   │
         Authentication     School Data
                            Classes, Subjects,
                            Teachers, Students
```

## Database 1: Central Auth (Supabase)

**Location**: `C:\Users\useru\Desktop\clau\auth`  
**Port**: 8000  
**Database**: Supabase (Hosted)

### Responsibilities
- User registration (`POST /api/v1/auth/signup`)
- User login (`POST /api/v1/auth/login`)
- Token issuance (JWT)
- Token verification (`POST /api/v1/auth/verify-token`)
- Password management (reset, update)
- MFA (Multi-factor authentication)
- Google OAuth integration

### Tables
- `auth.users` (Supabase managed)
- `nextfi_user_profiles` (Additional profile data)
- `organizations` (Multi-org support)
- `organization_members` (RBAC)

## Database 2: MakySchool PostgreSQL

**Location**: `C:\Users\useru\Desktop\clau\makyschool\apps\api`  
**Port**: 4000  
**Database**: PostgreSQL (Self-hosted or managed)

### Responsibilities
- School management
- Class/subject organization
- Teacher management
- Student enrollment
- Fee management
- Academic year configuration
- Subscription/billing

### Key Tables
- `schools` - School tenants
- `school_users` - **Links auth users to schools**
- `classes` - Class levels and streams
- `subjects` - Subject catalog
- `teachers` - Teacher data
- `students` - Student records
- `fees` - Fee structures

## Integration Flow

### 1. User Signup/Login

```
User → Frontend → Central Auth (/api/v1/auth/login)
                      ↓
                  Issues JWT token
                      ↓
                  Frontend stores token
```

### 2. Accessing School Data

```
User → Frontend (with JWT) → MakySchool API (/api/v1/schools/*)
                                   ↓
                          Verifies JWT with local secret
                          (or calls auth service)
                                   ↓
                          Queries PostgreSQL for school data
```

### 3. Linking Auth User to School

When a school admin wants to add a user:

```python
# 1. User signs up via auth service
POST /api/v1/auth/signup (Central Auth)
Response: { "user_id": "abc-123-def" }

# 2. School admin links user to school
POST /api/v1/school-users/link-user (MakySchool API)
Body: {
  "auth_user_id": "abc-123-def",
  "role": "teacher",
  "first_name": "John",
  "last_name": "Doe"
}

# 3. User can now access school data
GET /api/v1/schools/classes (with JWT token)
```

## Configuration

### Central Auth Service (.env)

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
JWT_SECRET=shared-secret-123
PORT=8000
```

### MakySchool API (.env)

```env
# MakySchool database
DATABASE_URL=postgresql://user:pass@localhost:5432/makyschool

# Auth service integration
AUTH_SERVICE_URL=http://localhost:8000
AUTH_JWT_SECRET=shared-secret-123  # MUST match auth service JWT_SECRET

PORT=4000
```

## Security

### JWT Token Structure

```json
{
  "sub": "user-id-from-supabase",
  "email": "user@example.com",
  "exp": 1234567890,
  "iat": 1234567890
}
```

### Token Verification Options

**Option 1: Local Verification (Fast)**
```python
# MakySchool API decodes JWT locally using shared secret
payload = jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"])
```

**Option 2: Service Verification (Secure)**
```python
# MakySchool API calls auth service to verify
response = httpx.post(
    f"{AUTH_SERVICE_URL}/api/v1/auth/verify-token",
    json={"access_token": token}
)
```

## Deployment

### Development

```bash
# Terminal 1: Start Auth Service
cd C:\Users\useru\Desktop\clau\auth
python main.py

# Terminal 2: Start MakySchool API
cd C:\Users\useru\Desktop\clau\makyschool\apps\api
python main.py
```

### Production

- **Auth Service**: Deploy to VPS/cloud (currently configured)
- **MakySchool API**: Deploy separately (Render, Railway, etc.)
- **Shared Secret**: Use same `JWT_SECRET` in both services
- **CORS**: Configure both services to allow frontend origins

## Migration from Old Architecture

### Old (Single Database)
- Auth + School data in same PostgreSQL
- Users table with password_hash
- Direct authentication in MakySchool API

### New (Two Databases)
- Auth in Supabase (via auth service)
- School data in PostgreSQL
- `school_users` table links auth IDs to schools
- MakySchool API verifies tokens, doesn't create them

### Migration Steps

1. ✅ Central auth service created (C:\Users\useru\Desktop\clau\auth)
2. ✅ MakySchool API updated to verify tokens
3. ✅ Added `school_users` table (migration 014)
4. ⏳ Migrate existing users to central auth
5. ⏳ Update frontend to use new auth flow
6. ⏳ Remove old `users` table password fields

## Benefits

✅ **Single Sign-On**: Users can access multiple products with one account  
✅ **Centralized Security**: Auth vulnerabilities fixed in one place  
✅ **Better Scalability**: Separate databases can scale independently  
✅ **Cleaner Separation**: Auth logic separate from business logic  
✅ **Flexible RBAC**: Users can have different roles in different schools
