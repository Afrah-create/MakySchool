# Teacher Attendance (GPS & Map)

Staff clock-in / clock-out via browser Geolocation, with optional school geofencing. Admins and head teachers see a daily roster and a live Leaflet map. Separate from [period-based student attendance](./attendance.md).

Status: **shipped** (migration `054`, API, teacher + admin UI).

## Architecture

```
Teacher phone (My check-in)          Admin dashboard
        │                                    │
        ▼                                    ▼
teacherAttendanceApi / useTeacherAttendance (React Query)
        │
        └── /api/schools/teacher-attendance  (+ /api/v1/…)
                    └── app/routers/teacher_attendance.py
                            ├── schools (lat/lng/radius)
                            ├── attendance_settings
                            ├── teacher_attendance
                            └── app/lib/geo.py (Haversine)
```

| Layer | Path |
|-------|------|
| Migration | `apps/api/migrations/054_teacher_attendance.sql` |
| Geo util | `apps/api/app/lib/geo.py` |
| Router | `apps/api/app/routers/teacher_attendance.py` |
| Mount | `apps/api/main.py` → `/api/schools/teacher-attendance` |
| Shared types | `packages/shared/src/types/teacher-attendance.ts` |
| Permissions | `viewTeacherAttendance`, `manageAttendanceSettings`, `manualMarkAttendance` |
| Web client | `apps/web/src/lib/api/teacherAttendance.ts` |
| Hooks | `apps/web/src/hooks/useTeacherAttendance.ts` |
| Map | `react-leaflet` + OpenStreetMap (no API key); assets in `apps/web/public/leaflet/` |

Auth: `require_tenant_with_subscription`. `school_id` always from the tenant context — never from the client body.

## Data model

### `schools` (added columns)
- `latitude`, `longitude` — school pin for the fence
- `attendance_radius_metres` — default **200**

### `attendance_settings` (one row per school)
| Field | Default | Meaning |
|-------|---------|---------|
| `clock_in_deadline` | `08:00` | After this → status `late` |
| `auto_absent_after` | `09:30` | Before this, no record → “not yet arrived”; after → count as absent |
| `enforce_geofence` | `true` | Reject clock-in outside radius |
| `allow_outside_fence` | `false` | Soft mode: allow clock-in but mark `outside_fence` |
| `radius_metres` | `NULL` | Override school radius when set |
| `notify_admin_on_late` | `false` | Reserved for SMS/notify (flag stored; wiring optional) |

### `teacher_attendance`
Unique `(school_id, teacher_id, attendance_date)`.

Statuses: `present` | `late` | `outside_fence` | `absent` | `partial`.

Clock-in/out store raw GPS (`lat`/`lng`/`accuracy`), server-calculated distance, and within-fence flags. Manual overrides set `is_manual`, `manual_reason`, `marked_by`.

Local times use **Africa/Kampala** for deadline and display formatting.

## Permissions

| Action | Roles | Used for |
|--------|-------|----------|
| (self) | Any non-learner staff | `POST /clock-in`, `/clock-out`, `GET /my-status` — **own user only** |
| `viewTeacherAttendance` | admin, head_teacher | Today list, history, map, settings GET, teacher detail |
| `manageAttendanceSettings` | admin | `PATCH /settings` |
| `manualMarkAttendance` | admin, head_teacher | `PATCH /manual` |

Teachers cannot clock in/out for another teacher. Distance is always computed server-side (`haversine_distance`); client-sent distance is ignored.

## API

Base: `/api/schools/teacher-attendance`

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/settings` | School location + rules |
| `PATCH` | `/settings` | Upsert location + rules |
| `POST` | `/clock-in` | Body: `latitude`, `longitude`, `accuracy_metres` |
| `POST` | `/clock-out` | Same body |
| `GET` | `/my-status` | Today + week/month stats + recent 5 days |
| `GET` | `/today` | All active teachers (left join); optional `?date=` |
| `GET` | `/history` | Filters: `teacher_id`, `date_from`, `date_to`, `status`, `page`, `limit` |
| `GET` | `/teacher/{teacherId}` | Month summary + records (`?month=YYYY-MM`) |
| `PATCH` | `/manual` | Manual present/late/absent + required reason |
| `GET` | `/map-data` | Pins for clocked-in teachers; polled every 60s |

### Clock-in error codes
| Code | HTTP | When |
|------|------|------|
| `ALREADY_CLOCKED_IN` | 409 | Second clock-in same day |
| `OUTSIDE_GEOFENCE` | 422 | Outside radius and soft-allow off — includes `distance_metres`, `allowed_metres` |
| `NOT_CLOCKED_IN` | 422 | Clock-out without clock-in |
| `ALREADY_CLOCKED_OUT` | 409 | Second clock-out |

If school lat/lng are unset, geofencing is **disabled** but clock-in still records GPS for reference.

## Frontend routes

| Portal | Route | Purpose |
|--------|-------|---------|
| Teacher | `/teacher/my-attendance` | Clock in/out (GPS). Kept separate from `/teacher/attendance` (class registers) |
| Admin | `/dashboard/teacher-attendance` | Today summary, list, map |
| Admin | `/dashboard/teacher-attendance/history` | Filterable history + CSV |
| Admin | `/dashboard/teacher-attendance/[teacherId]` | Heatmap + monthly stats |
| Admin | `/dashboard/settings/teacher-attendance` | Location (click map / device GPS) + rules |

Nav: school-admin “Teacher Attendance” (`viewTeacherAttendance`); settings child “Teacher attendance”; teacher “My check-in”; mobile tab “Check-in”.

Map components load with `next/dynamic` + `ssr: false`. Pin colours come from CSS variables at runtime (no hardcoded hex in UI chrome).

## How to verify

1. Apply migration `054` (`RUN_MIGRATIONS=true` or migrate script).
2. As admin: Settings → Teacher attendance → set lat/lng (click map or “Use my current location”) → radius 200 → save.
3. As teacher on a phone: My check-in → allow location → Clock in → see distance → Clock out → day complete.
4. Outside fence with enforce on → 422 toast with metres.
5. As admin: Teacher Attendance → present/late/absent cards → map pins + geofence circle → auto-refresh timestamp.
6. Manual mark → reason required → shows as manual in history/CSV.
7. Confirm student **Attendance Registry** still works unchanged.

## Out of scope (v1)

WebSockets (polling only), SMS on late (flag only), holidays calendar for heatmap, offline queue, native app.
