# Attendance

Period-based class registers for Ugandan schools. Teachers mark one **timetable period** at a time; day- and term-level views are aggregations of those rows. Parent SMS goes through the shared [MakyReach](./makyreach.md) client.

## Architecture

```
Teacher / Admin UI (apps/web)
    └── attendanceApi / useAttendance (React Query)
            └── /api/schools/attendance  (+ /api/v1/…)
                    └── app/routers/attendance.py
                            ├── timetable_periods (who teaches what when)
                            ├── attendance (marks)
                            └── attendance_notifications (SMS outbox)
                                    └── app/services/makyreach (optional SMS)
```

| Layer | Path |
|-------|------|
| Router | `apps/api/app/routers/attendance.py` |
| Mount | `apps/api/main.py` → `mount_v1_and_legacy(..., "/api/schools/attendance")` |
| Shared types | `packages/shared/src/types/attendance.ts` |
| Web client | `apps/web/src/lib/api/attendance.ts` |
| Hooks | `apps/web/src/hooks/useAttendance.ts` |
| UI | `apps/web/src/components/attendance/`, teacher/admin/learner pages below |

Auth on every route: `require_tenant_with_subscription` → `(school_id, actor)`.

## Data model

| Migration | What it does |
|-----------|----------------|
| `032_create_attendance.sql` | Creates `attendance` (`present` / `absent` / `late`) |
| `033_link_attendance.sql` | Adds `timetable_period_id`; unique `(timetable_period_id, student_id, date)` |
| `034_fix_attendance_constraints.sql` | Removes class-day uniqueness so multiple periods per day are allowed |
| `035_attendance_notifications.sql` | Outbox table + dedup index for parent SMS |

**Invariant:** one mark per student per timetable period per date. There is **no** “one mark per class per day” write path.

## Roles

| Role set | Roles | Can |
|----------|-------|-----|
| Allowed | `teacher`, `admin`, `head_teacher` | View registers, summaries, monthly |
| Admin | `admin`, `head_teacher` | Admin overview; daily view by `class_id` |
| Teacher write | `teacher` only | `POST /bulk` |
| Dossier | above + `learner` / `student` | Own student dossier (learners via linked student) |

Teachers may only read/write periods where `timetable_periods.teacher_id` matches the actor.

## Endpoints

Base: `/api/schools/attendance` (same handlers under `/api/v1/schools/attendance`).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/timetable?date=` | Teacher’s periods for that weekday + `alreadySubmitted` |
| `GET` | `/?term_id&date&timetable_slot_id` | Daily roster for a period (teachers) |
| `GET` | `/?term_id&date&class_id` | Daily roster by class (admins; read-only) |
| `POST` | `/bulk` | Submit period register (**locked after success**) |
| `GET` | `/monthly?class_id&term_id&month=` | Month matrix |
| `GET` | `/summary?student_id&term_id` | Term summary + risk |
| `GET` | `/students/{id}?term_id&…` | Full dossier |
| `POST` | `/students/{id}/notify` | Parent SMS (MakyReach) |
| `GET` | `/admin/overview?term_id&date_from&date_to&class_id?` | School KPIs |

### Bulk submit contract

```json
{
  "timetable_period_id": "uuid",
  "term_id": "uuid",
  "date": "YYYY-MM-DD",
  "entries": [
    { "student_id": "uuid", "status": "present|absent|late", "notes": null }
  ]
}
```

- Future dates rejected (Africa/Kampala).
- Single `INSERT … SELECT FROM unnest(...)`.
- Second submit for the same period + date → **409 `ALREADY_SUBMITTED`**. There is no PATCH/DELETE.

**Naming:** UI/shared types use `timetableSlotId`; API body uses `timetable_period_id`; some GET queries use `timetable_slot_id`. The client maps these in `attendanceApi`.

## Parent notification

1. Resolve primary guardian phone (`student_guardians.is_primary`).
2. Build message (`period_absent` | `day_absent` | `manual`, or custom text).
3. Dedup against `attendance_notifications` → 409 `ALREADY_NOTIFIED` if already logged.
4. If MakyReach is configured, `send_sms(...)`; else mark row `skipped`.
5. Persist status: `sent` | `failed` | `skipped`.

UI: `NotifyParentPanel` → `useNotifyParent`. See [MakyReach](./makyreach.md) for credentials and phone normalization.

## Frontend routes

| Audience | Route | Page |
|----------|-------|------|
| Teacher | `/teacher/attendance` | Take register |
| Teacher | `/teacher/attendance/history` | Monthly history |
| Admin | `/dashboard/attendance` | Registry + overview |
| Learner | `/learner/attendance` | Own dossier |

Draft marks before submit are stored in `localStorage` under `makyschool:attendance-draft:{slotId}:{date}`.

## Day-level metrics

Derived from period rows, e.g.:

- Day counts as **absent** only if every marked period that day is absent.
- **Partial** when the day mixes present/late and absent.

Risk bands (dossier): `critical` (consecutive absences ≥ 3 or rate &lt; 70%), `at_risk` (&lt; 80%), `watch` (&lt; 90%), else `ok`.

## Gotchas

1. **Only teachers can submit.** Admins/head teachers view; they do not `POST /bulk`.
2. **Lock is permanent.** Treat 409 as success-already-done, not a soft failure to retry.
3. Bulk does **not** re-check that each `student_id` belongs to the period’s class (FK is to `students` only). Callers must send the roster from the daily GET.
4. Admin GET without a period can surface duplicate student rows when multiple periods were marked that day.
5. DB `trigger_type` includes `chronic`, but the notify API does not expose it.
6. Biometric attendance is **not** this module — see `apps/api/app/bio/README.md` and `MakySchool_Biometrics_Documentation.md`.

## Related

- Timetable periods: `apps/api/app/routers/timetable.py`
- MakyReach SMS: [makyreach.md](./makyreach.md)
- OpenAPI (dev): `http://localhost:4000/api/docs`
