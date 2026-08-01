# MakySchool — Teacher Attendance with GPS & Interactive Map
## Cursor Prompt · End-to-End Implementation

---

## Read before writing any code

1. Read `apps/api/migrations/` — read every migration file. Know all existing tables especially `users`, `schools`, `teacher_class_assignments`.
2. Read `apps/api/app/routers/teachers.py` — match existing route patterns, error formats, and permission checks exactly.
3. Read `apps/api/app/lib/permissions.py` — use existing `can()` and `require_permission()`.
4. Read `apps/web/src/app/(school-admin)/dashboard/` — match existing page patterns.
5. Read `apps/web/src/app/(teacher)/` — understand existing teacher portal structure.
6. Read `apps/web/src/components/ui/` — reuse Toast, ConfirmDialog, existing components.
7. Read `apps/web/src/app/globals.css` — CSS variable utilities only. No hardcoded hex.
8. Read `packages/shared/src/` — extend existing types and permissions.

Do not write a single line of code until all eight are read.

---

## Context

Teachers record their attendance via the web app on their smartphone. The browser Geolocation API captures GPS coordinates at check-in and check-out time. The system validates that the teacher is within a configurable radius of the school (geofencing). Admin sees a dashboard with attendance records and an interactive Leaflet.js map showing where each attendance was recorded.

**Core behaviour:**
- Teachers clock in and clock out via their portal
- GPS coordinates captured at each action via browser Geolocation API
- Geofencing: clock-in rejected if teacher is outside the configured school radius
- Admin and head teacher see daily attendance list and interactive map
- Map shows a pin per teacher per day — colour-coded by status
- Map auto-refreshes every 60 seconds
- No app install required — works in any modern mobile browser

---

## Migration: `030_teacher_attendance.sql`

Create `apps/api/migrations/030_teacher_attendance.sql`. Fully idempotent.

```sql
-- ── School location (set during setup or settings) ────────────────────────────
ALTER TABLE schools ADD COLUMN IF NOT EXISTS
  latitude NUMERIC(10, 7);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS
  longitude NUMERIC(10, 7);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS
  attendance_radius_metres INT NOT NULL DEFAULT 200;
-- attendance_radius_metres: max distance from school for valid check-in

-- ── Teacher attendance records ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Clock in
  clock_in_at     TIMESTAMPTZ,
  clock_in_lat    NUMERIC(10, 7),
  clock_in_lng    NUMERIC(10, 7),
  clock_in_accuracy_metres NUMERIC(8, 2),  -- browser GPS accuracy
  clock_in_distance_metres NUMERIC(8, 2),  -- calculated distance from school
  clock_in_within_fence    BOOLEAN,        -- true if within radius

  -- Clock out
  clock_out_at    TIMESTAMPTZ,
  clock_out_lat   NUMERIC(10, 7),
  clock_out_lng   NUMERIC(10, 7),
  clock_out_accuracy_metres NUMERIC(8, 2),
  clock_out_distance_metres NUMERIC(8, 2),
  clock_out_within_fence    BOOLEAN,

  -- Computed
  duration_minutes INT,                    -- clock_out - clock_in in minutes
  status          TEXT NOT NULL DEFAULT 'absent'
                    CHECK (status IN (
                      'present',       -- clocked in within fence
                      'late',          -- clocked in after late_threshold
                      'outside_fence', -- clocked in but outside geofence
                      'absent',        -- no clock-in recorded
                      'partial'        -- clocked in but no clock-out by end of day
                    )),

  -- Override (admin can manually mark attendance)
  is_manual       BOOLEAN NOT NULL DEFAULT false,
  manual_reason   TEXT,
  marked_by       UUID REFERENCES users(id),

  -- Device info
  user_agent      TEXT,
  ip_address      TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (school_id, teacher_id, attendance_date)
);

-- ── Attendance settings per school ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  -- Time teachers must clock in by to be 'present' (not 'late')
  clock_in_deadline     TIME NOT NULL DEFAULT '08:00:00',
  -- Time after which system auto-marks absent (end of school day)
  auto_absent_after     TIME NOT NULL DEFAULT '09:30:00',
  -- Enforce geofence: reject clock-in if outside radius
  enforce_geofence      BOOLEAN NOT NULL DEFAULT true,
  -- Allow clock-in outside fence but mark as 'outside_fence' (softer)
  allow_outside_fence   BOOLEAN NOT NULL DEFAULT false,
  -- Radius override per school (if NULL, use schools.attendance_radius_metres)
  radius_metres         INT,
  -- Whether to send SMS to admin when a teacher is late
  notify_admin_on_late  BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ta_school_date   ON teacher_attendance(school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_ta_teacher_date  ON teacher_attendance(teacher_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_ta_status        ON teacher_attendance(status);
CREATE INDEX IF NOT EXISTS idx_ta_clock_in      ON teacher_attendance(clock_in_at);
```

---

## Haversine distance calculation utility

Create `apps/api/app/lib/geo.py`:

```python
import math

def haversine_distance(
    lat1: float, lng1: float,
    lat2: float, lng2: float,
) -> float:
    """
    Calculate distance in metres between two GPS coordinates.
    Uses the Haversine formula.
    """
    R = 6_371_000  # Earth radius in metres
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def is_within_fence(
    teacher_lat: float,
    teacher_lng: float,
    school_lat: float,
    school_lng: float,
    radius_metres: int,
) -> tuple[bool, float]:
    """
    Returns (within_fence: bool, distance_metres: float).
    """
    distance = haversine_distance(teacher_lat, teacher_lng, school_lat, school_lng)
    return distance <= radius_metres, round(distance, 2)
```

---

## API routes

Create `apps/api/app/routers/teacher_attendance.py`. Mount at `/api/schools/teacher-attendance`. All routes require `requireTenantAuth`. `school_id` always from `Depends(get_tenant_and_user)`.

---

### Settings routes

#### `GET /api/schools/teacher-attendance/settings`
Permission: `viewAllStaff`.

Returns school's attendance settings plus school location:
```json
{
  "school_location": {
    "latitude": 0.3152,
    "longitude": 32.5816,
    "radius_metres": 200,
    "is_configured": true
  },
  "settings": {
    "clock_in_deadline": "08:00",
    "auto_absent_after": "09:30",
    "enforce_geofence": true,
    "allow_outside_fence": false,
    "notify_admin_on_late": false
  }
}
```

If school has no latitude/longitude configured: `"is_configured": false`. Teacher clock-in will work but geofencing is disabled.

#### `PATCH /api/schools/teacher-attendance/settings`
Permission: `manageSchool` (admin only).

Body:
```typescript
{
  // School location
  latitude?: number;
  longitude?: number;
  radius_metres?: number;
  // Attendance settings
  clock_in_deadline?: string;      // "HH:MM" format
  auto_absent_after?: string;
  enforce_geofence?: boolean;
  allow_outside_fence?: boolean;
  notify_admin_on_late?: boolean;
}
```

Updates both `schools` table (lat/lng/radius) and `attendance_settings` table. Creates `attendance_settings` row if it does not exist (upsert).

---

### Clock-in / Clock-out routes

#### `POST /api/schools/teacher-attendance/clock-in`
Permission: JWT sub must match a teacher in this school. Any role can clock in for themselves only. A teacher cannot clock in for another teacher.

Body:
```typescript
{
  latitude: number;       // required — from browser Geolocation API
  longitude: number;      // required
  accuracy_metres: number; // required — browser GPS accuracy
}
```

Logic:
1. Check teacher has not already clocked in today:
```sql
SELECT id, clock_in_at FROM teacher_attendance
WHERE teacher_id = $1 AND attendance_date = CURRENT_DATE AND school_id = $2
```
If `clock_in_at IS NOT NULL` → return 409:
```json
{ "error": "You have already clocked in today at 07:52 AM.", "code": "ALREADY_CLOCKED_IN" }
```

2. Fetch school location and settings:
```sql
SELECT s.latitude, s.longitude, s.attendance_radius_metres,
       ats.enforce_geofence, ats.allow_outside_fence,
       ats.clock_in_deadline
FROM schools s
LEFT JOIN attendance_settings ats ON ats.school_id = s.id
WHERE s.id = $1
```

3. If school has coordinates configured → calculate distance using `haversine_distance()`. Determine `within_fence`.

4. If `enforce_geofence = true` and `within_fence = false` and `allow_outside_fence = false`:
Return 422:
```json
{
  "error": "You are too far from school. You must be within 200 metres to clock in. Your current distance: 847 metres.",
  "code": "OUTSIDE_GEOFENCE",
  "distance_metres": 847,
  "allowed_metres": 200
}
```

5. Determine status:
- If current time > `clock_in_deadline` → `status = 'late'`
- If `within_fence = false` and `allow_outside_fence = true` → `status = 'outside_fence'`
- Otherwise → `status = 'present'`

6. Upsert into `teacher_attendance`:
```sql
INSERT INTO teacher_attendance (
  school_id, teacher_id, attendance_date,
  clock_in_at, clock_in_lat, clock_in_lng,
  clock_in_accuracy_metres, clock_in_distance_metres,
  clock_in_within_fence, status,
  user_agent, ip_address
) VALUES (...)
ON CONFLICT (school_id, teacher_id, attendance_date)
DO UPDATE SET
  clock_in_at = EXCLUDED.clock_in_at,
  clock_in_lat = EXCLUDED.clock_in_lat,
  ...
  status = EXCLUDED.status,
  updated_at = NOW()
```

7. Return:
```json
{
  "message": "Clocked in successfully at 07:48 AM.",
  "status": "present",
  "clock_in_at": "2026-07-05T07:48:32Z",
  "distance_metres": 45.3,
  "within_fence": true,
  "is_late": false
}
```

If `status = 'late'`:
```json
{
  "message": "Clocked in at 08:23 AM. You are 23 minutes late.",
  "status": "late",
  ...
}
```

---

#### `POST /api/schools/teacher-attendance/clock-out`
Permission: Same as clock-in — teacher clocks out themselves only.

Body: Same as clock-in (`latitude`, `longitude`, `accuracy_metres`).

Logic:
1. Fetch today's attendance record. If no clock-in → return 422: `"You have not clocked in today. Please clock in first."`
2. If already clocked out → return 409: `"You have already clocked out today at 03:45 PM."`
3. Calculate distance from school.
4. Calculate `duration_minutes = (NOW() - clock_in_at) in minutes`
5. Update record with clock-out fields and `duration_minutes`
6. Return:
```json
{
  "message": "Clocked out at 03:52 PM. Duration: 8 hours 4 minutes.",
  "clock_out_at": "2026-07-05T15:52:00Z",
  "duration_minutes": 484,
  "distance_metres": 38.1
}
```

---

#### `GET /api/schools/teacher-attendance/my-status`
Permission: Any authenticated user — returns only their own status.

Returns today's attendance record for the current user:
```json
{
  "today": {
    "date": "2026-07-05",
    "status": "present",
    "clock_in_at": "2026-07-05T07:48:32Z",
    "clock_out_at": null,
    "duration_minutes": null,
    "clock_in_distance_metres": 45.3,
    "is_clocked_in": true,
    "is_clocked_out": false
  },
  "this_week": {
    "present": 3,
    "late": 1,
    "absent": 0
  },
  "this_month": {
    "present": 18,
    "late": 2,
    "absent": 1,
    "attendance_percent": 90.5
  }
}
```

If no record today → `"today": null` and `"is_clocked_in": false`.

---

### Admin attendance routes

#### `GET /api/schools/teacher-attendance/today`
Permission: `viewAllStaff`.

Returns all teachers with today's attendance status:
```json
{
  "date": "2026-07-05",
  "summary": {
    "total_teachers": 18,
    "present": 12,
    "late": 2,
    "absent": 4,
    "not_yet_arrived": 0,
    "attendance_rate": 77.8
  },
  "teachers": [
    {
      "teacher_id": "uuid",
      "full_name": "Mary Nakato",
      "email": "mary@school.ug",
      "photo_url": null,
      "status": "present",
      "clock_in_at": "2026-07-05T07:48:32Z",
      "clock_out_at": null,
      "clock_in_distance_metres": 45.3,
      "clock_in_lat": 0.3151,
      "clock_in_lng": 32.5817,
      "duration_minutes": null,
      "is_manual": false
    },
    {
      "teacher_id": "uuid",
      "full_name": "John Ssali",
      "status": "absent",
      "clock_in_at": null,
      "clock_out_at": null,
      "clock_in_lat": null,
      "clock_in_lng": null
    }
  ]
}
```

**Important:** Include ALL active teachers even if they have no record today — left join with users table. Teachers with no record show `status: 'absent'`.

Left join pattern:
```sql
SELECT
  u.id AS teacher_id,
  u.full_name,
  u.email,
  u.photo_url,
  COALESCE(ta.status, 'absent') AS status,
  ta.clock_in_at,
  ta.clock_out_at,
  ta.clock_in_lat,
  ta.clock_in_lng,
  ta.clock_in_distance_metres,
  ta.duration_minutes,
  ta.is_manual
FROM users u
LEFT JOIN teacher_attendance ta
  ON ta.teacher_id = u.id
  AND ta.school_id = $1
  AND ta.attendance_date = CURRENT_DATE
WHERE u.school_id = $1
  AND u.role = 'teacher'
  AND u.is_active = true
ORDER BY u.full_name ASC
```

---

#### `GET /api/schools/teacher-attendance/history`
Permission: `viewAllStaff`.

Query params: `?teacher_id=`, `?date_from=`, `?date_to=`, `?status=`, `?page=1`, `?limit=30`

Returns paginated attendance history with summary stats.

---

#### `GET /api/schools/teacher-attendance/teacher/:teacherId`
Permission: `viewAllStaff`.

Returns full attendance history for one teacher with monthly summary:
```json
{
  "teacher": { "full_name": "Mary Nakato", "email": "..." },
  "month_summary": {
    "month": "July 2026",
    "working_days": 22,
    "present": 18,
    "late": 2,
    "absent": 2,
    "attendance_percent": 90.9
  },
  "records": [...]
}
```

---

#### `PATCH /api/schools/teacher-attendance/manual`
Permission: `manageUsers` (admin and head teacher).

Admin manually marks a teacher's attendance. Used when a teacher forgot to clock in or was on official duty off-site.

Body:
```typescript
{
  teacher_id: string;
  date: string;          // ISO date YYYY-MM-DD
  status: 'present' | 'late' | 'absent';
  reason: string;        // required — reason for manual entry
  clock_in_time?: string; // "HH:MM" — optional
  clock_out_time?: string;
}
```

Upsert into `teacher_attendance` with `is_manual = true`, `marked_by = req.user.id`.

Return: `"Mary Nakato has been manually marked as present for 5 July 2026."`

---

#### `GET /api/schools/teacher-attendance/map-data`
Permission: `viewAllStaff`.

Returns today's attendance with coordinates for map rendering. Only includes teachers who have clocked in (have lat/lng):

```json
{
  "date": "2026-07-05",
  "school_location": {
    "latitude": 0.3152,
    "longitude": 32.5816,
    "radius_metres": 200,
    "name": "Bukhariy Islamic Secondary School"
  },
  "pins": [
    {
      "teacher_id": "uuid",
      "full_name": "Mary Nakato",
      "initials": "MN",
      "status": "present",
      "clock_in_at": "07:48 AM",
      "clock_out_at": null,
      "latitude": 0.3151,
      "longitude": 32.5817,
      "distance_metres": 45.3,
      "within_fence": true
    }
  ],
  "absent_teachers": [
    { "teacher_id": "uuid", "full_name": "John Ssali" }
  ]
}
```

This endpoint is polled every 60 seconds by the admin map page.

---

## Frontend — Teacher portal

### `/teacher/attendance` — Teacher clock-in page

This is the primary page a teacher opens on their phone every morning.

**Page design — mobile-first, large touch targets:**

Full-page layout optimised for one-handed phone use. No sidebar visible on mobile (uses bottom nav).

**State 1 — Not clocked in today:**

```
┌─────────────────────────────┐
│  Good morning, Mary 👋       │
│  Friday, 5 July 2026        │
│                             │
│  ┌─────────────────────┐    │
│  │   📍 Getting your    │    │
│  │   location...       │    │
│  └─────────────────────┘    │
│                             │
│  ┌─────────────────────┐    │
│  │                     │    │
│  │   CLOCK IN          │    │  ← Large button, accent colour
│  │                     │    │
│  └─────────────────────┘    │
│                             │
│  School opens at 8:00 AM    │
└─────────────────────────────┘
```

**State 2 — GPS acquiring:**
Button shows spinner and "Getting your location..." text. Disabled until GPS is acquired.

**State 3 — GPS acquired, ready to clock in:**
Show distance from school: `📍 You are 45 metres from school` in green.
If outside fence: `📍 You are 847 metres from school — too far` in red.

**State 4 — Clocked in:**

```
┌─────────────────────────────┐
│  ✅ Clocked in               │
│  07:48 AM · On time         │
│                             │
│  Duration: 2h 14m           │
│                             │
│  📍 45m from school          │
│                             │
│  ┌─────────────────────┐    │
│  │   CLOCK OUT         │    │  ← Red/danger style button
│  └─────────────────────┘    │
└─────────────────────────────┘
```

**State 5 — Both clocked in and out:**

```
┌─────────────────────────────┐
│  ✅ Day complete              │
│                             │
│  Clock in:  07:48 AM        │
│  Clock out: 03:52 PM        │
│  Duration:  8h 4m           │
│                             │
│  See you tomorrow!          │
└─────────────────────────────┘
```

**GPS error state:**
If browser denies location permission:
```
┌─────────────────────────────┐
│  📍 Location access denied  │
│                             │
│  To clock in, please allow  │
│  location access in your    │
│  browser settings.          │
│                             │
│  [How to enable location]   │  ← link to instructions
└─────────────────────────────┘
```

**Implementation (`AttendanceClock.tsx`):**

```typescript
// GPS flow
useEffect(() => {
  if (!navigator.geolocation) {
    setGpsError('Your browser does not support location services.');
    return;
  }
  setGpsStatus('acquiring');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      setGpsStatus('ready');
    },
    (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        setGpsError('Location access denied. Please enable location in browser settings.');
      } else if (error.code === error.TIMEOUT) {
        setGpsError('Location timed out. Please try again.');
      } else {
        setGpsError('Could not get your location. Please try again.');
      }
      setGpsStatus('error');
    },
    {
      enableHighAccuracy: true,   // use GPS, not just WiFi triangulation
      timeout: 15000,             // 15 second timeout
      maximumAge: 30000,          // accept cached position up to 30 seconds old
    }
  );
}, []);

const handleClockIn = async () => {
  if (!coords) return;
  setIsSubmitting(true);
  try {
    const res = await apiClient.post('/api/schools/teacher-attendance/clock-in', {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy_metres: coords.accuracy,
    });
    toast.success(res.message);
    mutate('/api/schools/teacher-attendance/my-status');
  } catch (err) {
    if (err.code === 'OUTSIDE_GEOFENCE') {
      toast.error(`You are ${err.distance_metres}m from school. Must be within ${err.allowed_metres}m.`);
    } else {
      toast.error(err.error || 'Clock-in failed. Please try again.');
    }
  } finally {
    setIsSubmitting(false);
  }
};
```

**Mini attendance history** below the clock widget (last 5 days):

| Date | Status | Clock In | Clock Out | Duration |
|---|---|---|---|---|
| Fri 5 Jul | Present ✅ | 07:48 | — | — |
| Thu 4 Jul | Late 🕐 | 08:23 | 15:52 | 7h 29m |
| Wed 3 Jul | Present ✅ | 07:51 | 15:48 | 7h 57m |

---

## Frontend — Admin dashboard

### `/dashboard/teacher-attendance` — Admin attendance hub

**Page header:** "Teacher Attendance" + subtitle "Daily attendance tracking with GPS verification" + date display (today's date, large)

**Summary stats row (5 cards):**
- Present — count + percentage (green)
- Late — count (amber)
- Absent — count (red)
- Not yet arrived — count (muted, teachers who haven't clocked in but it's before auto_absent_after time)
- Attendance rate — percentage (colour-coded: green >85%, amber 70-85%, red <70%)

**Two-panel layout on desktop:**
- Left panel (60%): Teachers list
- Right panel (40%): Interactive map

On mobile: tabs — "List" | "Map"

---

### Teachers list panel

**Filter row:** Status filter tabs (All | Present | Late | Absent | Outside fence) + Search by name

**Teacher list:**

Each row:
```
┌──────────────────────────────────────────────────────┐
│ [Avatar] Mary Nakato          ● Present              │
│          P3A, P3B · Mathematics      07:48 AM        │
│          📍 45m from school          Clocked out: —  │
└──────────────────────────────────────────────────────┘
```

Status indicators:
- Present: green dot + "Present"
- Late: amber dot + "Late · 23 min"
- Absent: red dot + "Absent"
- Outside fence: orange dot + "Outside fence"
- Not yet: grey dot + "Not yet arrived"

**Manual mark button** per row (admin only, `<CanDo action="manageUsers">`): opens `<ManualMarkDialog />`.

**Export button:** "Export CSV" — client-side CSV of the filtered list with all columns.

---

### Interactive map panel — `TeacherAttendanceMap.tsx`

**Map library:** Leaflet.js via `react-leaflet`. Install: `npm install react-leaflet leaflet @types/leaflet` in `apps/web`.

**Map initialisation:**
```typescript
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';

// Centre map on school location initially
// If no school location configured: centre on Uganda (1.3733° N, 32.2903° E), zoom 7
const defaultCenter = schoolLocation
  ? [schoolLocation.latitude, schoolLocation.longitude]
  : [1.3733, 32.2903];
```

**Map tiles:** OpenStreetMap (free, no API key):
```typescript
<TileLayer
  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution='© OpenStreetMap contributors'
/>
```

**School location marker:**
- Large blue pin icon (school building)
- Popup: school name + "School location"
- Blue semi-transparent circle showing the geofence radius

```typescript
// Geofence circle
<Circle
  center={[schoolLocation.latitude, schoolLocation.longitude]}
  radius={schoolLocation.radius_metres}
  color="#4F6EF7"
  fillColor="#4F6EF7"
  fillOpacity={0.08}
  weight={2}
/>
```

**Teacher pins — custom colour-coded icons:**

Create custom Leaflet icons using CSS (no external icon library needed):

```typescript
const createTeacherIcon = (status: string, initials: string) => {
  const colors = {
    present: '#065F46',       // green
    late: '#92400E',          // amber
    outside_fence: '#9A3412', // orange
    absent: '#991B1B',        // red
  };
  const bg = colors[status] || '#6B7280';

  return L.divIcon({
    className: '',
    html: `
      <div style="
        background: ${bg};
        color: white;
        width: 36px;
        height: 36px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="transform: rotate(45deg); font-size: 11px; font-weight: 700;">
          ${initials}
        </span>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};
```

**Teacher marker popups:**
```
Mary Nakato
Status: Present ✅
Clocked in: 07:48 AM
Distance from school: 45m
Clock out: —
```

**Auto-refresh every 60 seconds:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    mutate('/api/schools/teacher-attendance/map-data');
  }, 60_000);
  return () => clearInterval(interval);
}, []);
```

Show last-updated timestamp below map: "Last updated: 08:14 AM · Auto-refreshes every minute"

**Map controls:**
- Zoom in/out (built into Leaflet)
- "Centre on school" button (custom control, top right)
- "Fit all pins" button — zooms to show all teacher pins

**Absent teachers list** below the map:
Small muted list: "4 teachers not yet arrived: John Ssali, Alice Among, ..."

---

### `/dashboard/teacher-attendance/history` — Attendance History

**Filter row:** Date range (from/to) | Teacher select | Status filter | Export CSV

**History table:**

| Date | Teacher | Clock In | Clock Out | Duration | Distance | Status | Manual |
|---|---|---|---|---|---|---|---|
| 5 Jul | Mary Nakato | 07:48 AM | 03:52 PM | 8h 4m | 45m | Present ✅ | — |
| 5 Jul | John Ssali | 08:23 AM | — | — | 12m | Late 🕐 | — |
| 4 Jul | Alice Among | — | — | — | — | Absent ❌ | ✓ (Principal's meeting) |

**Per-teacher view** (click a teacher's name): Opens `/dashboard/teacher-attendance/[teacherId]`

---

### `/dashboard/teacher-attendance/[teacherId]` — Teacher attendance detail

**Header:** Teacher name, photo, role, assigned classes.

**Monthly calendar heatmap:**
Show a simple calendar grid for the current month. Each day is a coloured square:
- Green: present
- Amber: late
- Red: absent
- Grey: weekend/holiday
- White: future

```typescript
// Simple calendar grid component — no external library
// Just a CSS grid of 7 columns (Mon-Sun)
// Each cell is a 32x32 coloured square with the date number
```

**Monthly stats card:**
- Working days this month: 22
- Present: 18 (81.8%)
- Late: 2 (9.1%)
- Absent: 2 (9.1%)
- Average clock-in time: 07:51 AM
- Average duration: 7h 52m

**Records table:** Full history with all fields.

**"Manual entry" button** (admin only): Opens `<ManualMarkDialog />` pre-filled with this teacher.

---

### `ManualMarkDialog.tsx`

Modal. `max-w-md`.

Content:
- Teacher name (read-only display)
- Date picker (default today)
- Status radio: Present | Late | Absent
- Clock-in time (shown if Present or Late)
- Clock-out time (optional)
- Reason textarea (required) — "Reason for manual entry"
- Warning banner: `AlertTriangle` + "Manual entries override GPS attendance records."

Buttons: "Cancel" | "Save manual entry" (accent).

On confirm: PATCH `/api/schools/teacher-attendance/manual`.
Toast: "Mary Nakato marked as Present for 5 July 2026 (manual entry)."

---

### Settings page integration

Add to `/dashboard/settings` (or `/dashboard/settings/attendance` — wherever settings live):

**"Attendance Settings" section:**

**School location subsection:**
- "Set school location" — two options:
  1. Manual entry: Latitude input + Longitude input
  2. Use my current location: button that calls `navigator.geolocation.getCurrentPosition()` and populates the fields
- Radius metres input (default 200, range 50–2000)
- Map preview: small embedded Leaflet map showing the pin and radius circle (same component as admin map but smaller and non-interactive beyond clicking to set location)

**Attendance rules subsection:**
- Clock-in deadline time picker (default 08:00)
- Auto-absent after time picker (default 09:30)
- Enforce geofence toggle (default on)
- Allow outside-fence check-in toggle (shows/hides when geofence is on) — "Allow check-in but mark as 'Outside fence'"
- Notify admin on late toggle

**"Click to set school location" map feature:**
When admin clicks on the small settings map, lat/lng fields auto-populate with the clicked coordinates. Makes it easy to set the exact school gate location.

```typescript
// In settings map component
<MapContainer onClick={(e) => {
  setLatitude(e.latlng.lat);
  setLongitude(e.latlng.lng);
}} ...>
```

---

### Add to teacher portal sidebar navigation

```typescript
{ label: 'My Attendance', href: '/teacher/attendance', icon: 'ClockIcon' }
```

### Add to school admin sidebar navigation

```typescript
{ label: 'Teacher Attendance', href: '/dashboard/teacher-attendance', icon: 'MapPin', requiredAction: 'viewAllStaff' }
```

---

## RBAC additions

Add to `packages/shared/src/constants/rbac.ts` and mirror in `apps/api/app/lib/permissions.py`:

```typescript
// Add to CAN
manageAttendanceSettings: ['admin'],
viewTeacherAttendance:    ['admin', 'head_teacher'],
manualMarkAttendance:     ['admin', 'head_teacher'],
```

Teachers can only call clock-in, clock-out, and my-status on their own record. Enforced at API level: `req.user.sub` must match the teacher_id being acted on.

---

## Install `react-leaflet` in `apps/web`

Add to `apps/web/package.json` dependencies:
```json
"leaflet": "^1.9.4",
"react-leaflet": "^4.2.1",
"@types/leaflet": "^1.9.8"
```

Import Leaflet CSS in `apps/web/src/app/layout.tsx` or the map component:
```typescript
import 'leaflet/dist/leaflet.css';
```

**Fix Leaflet default icon issue in Next.js** (known issue — marker icons break in SSR):
```typescript
// In TeacherAttendanceMap.tsx — at the top, before any Leaflet usage
import L from 'leaflet';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
});
```

Copy Leaflet marker images to `apps/web/public/leaflet/`. These files are in `node_modules/leaflet/dist/images/`.

**Dynamic import for SSR:** Map components must be loaded with `next/dynamic` and `ssr: false` since Leaflet requires `window`:
```typescript
const TeacherAttendanceMap = dynamic(
  () => import('@/components/school-admin/attendance/TeacherAttendanceMap'),
  { ssr: false, loading: () => <MapSkeleton /> }
);
```

---

## Constraints

1. `school_id` never from client — always from `req.schoolId` / `Depends(get_tenant_and_user)`.
2. A teacher can only clock in/out for themselves — API enforces `req.user.sub === teacher_id`.
3. GPS coordinates are stored as received from the browser — never modified or rounded server-side.
4. Haversine distance calculated server-side — never trust client-sent distance values.
5. `is_manual = true` records must always have `manual_reason` and `marked_by`.
6. Map must load with `ssr: false` — Leaflet requires browser environment.
7. No Google Maps, no Mapbox — use Leaflet + OpenStreetMap only. No API keys.
8. Auto-refresh is client-side polling every 60 seconds — no WebSockets.
9. If school has no location configured, geofencing is disabled but clock-in still works — records lat/lng for reference.
10. No hardcoded hex colours — CSS variable utilities only.
11. All pages: loading skeleton, empty state, error state.
12. Do not modify migrations 001–029. Only add 030.
13. `react-leaflet` components must use dynamic import with `ssr: false`.

---

## Deliverable checklist

- [ ] Migration 030 runs clean via `npm run migrate`
- [ ] `schools` table has `latitude`, `longitude`, `attendance_radius_metres` columns
- [ ] `PATCH /api/schools/teacher-attendance/settings` saves school location and rules
- [ ] `POST /api/schools/teacher-attendance/clock-in` captures GPS and validates geofence
- [ ] Clock-in outside geofence returns 422 with distance and allowed distance
- [ ] Clock-in after deadline sets status `late` with minutes-late message
- [ ] Clock-in when already clocked in returns 409 with time of original clock-in
- [ ] `POST /api/schools/teacher-attendance/clock-out` records clock-out and duration
- [ ] `GET /api/schools/teacher-attendance/my-status` returns today + weekly + monthly stats
- [ ] `GET /api/schools/teacher-attendance/today` includes ALL teachers (absent shown with no coords)
- [ ] `GET /api/schools/teacher-attendance/map-data` returns pins with lat/lng for clocked-in teachers
- [ ] `PATCH /api/schools/teacher-attendance/manual` creates/updates with `is_manual = true`
- [ ] Teacher portal `/teacher/attendance` shows clock-in button with GPS acquisition flow
- [ ] GPS permission denied shows error with instructions
- [ ] Clock-in button disabled until GPS acquired
- [ ] Distance from school shown before clock-in
- [ ] Clock-in success shows time and on-time/late status
- [ ] Clock-out shows duration in hours and minutes
- [ ] Admin `/dashboard/teacher-attendance` shows 5 summary stat cards
- [ ] Teachers list shows all teachers with correct status colours
- [ ] Leaflet map renders with OpenStreetMap tiles (no API key)
- [ ] School location shown as blue pin with geofence circle
- [ ] Teacher pins are colour-coded by status with initials
- [ ] Teacher popup shows name, status, clock-in time, distance
- [ ] Map auto-refreshes every 60 seconds with last-updated timestamp
- [ ] "Centre on school" button recentres the map
- [ ] Map loaded with `ssr: false` dynamic import
- [ ] Settings page allows admin to set school location manually or via GPS button
- [ ] Click-to-set-location works on settings map
- [ ] History page shows filterable table of all attendance records
- [ ] Teacher detail page shows monthly calendar heatmap and stats
- [ ] Manual mark dialog saves with reason and shows in history
- [ ] Export CSV works on history page
- [ ] `react-leaflet` marker icon fix applied (no broken image icons)
- [ ] Leaflet CSS imported correctly
- [ ] No hardcoded hex values in any new file