# Uganda Primary Reports (P1–P7) — Implemented

Status: **shipped in codebase** (migration `048`, API, admin/teacher UI, PDF report cards).

Hard gate: only schools with `school_type` in `{primary, both}`. Secondary-only schools get API `403 PRIMARY_NOT_ENABLED` and no Primary nav/routes.

---

## What was built

### Assessment model
| Band | Levels | Model |
|------|--------|--------|
| Lower primary | P1–P3 | Thematic assessment (themes × strands, levels 1–4) |
| Upper primary | P4–P7 | Subject CA + exams → weighted final % → D/C/P/F scale |
| National exit | P7 | PLE grades D1–F9, aggregate + division (1–4 / U) |

Defaults: CA 30% / exam 70% (configurable). Internal grade scale seeded on first setup (D/C/P/F). Themes and core subjects seeded; themes are configurable (not hard-limited to a fixed count).

Separate from A-Level and from CBC `continuous_assessments` (migration 019).

### Bulk / scale
- Bulk mark upserts use PostgreSQL `UNNEST` (CA, exams, thematic, PLE).
- `BULK_MARKS_LIMIT = 500` per request.
- Class PDF ZIP generation uses a semaphore (max 4 concurrent) and separate pool connections so large classes do not exhaust the DB pool.

---

## Backend

| Piece | Path |
|-------|------|
| Migration | `apps/api/migrations/048_primary_reports.sql` |
| Access gate | `apps/api/app/lib/primary_access.py` |
| Domain helpers | `apps/api/app/lib/primary_reports.py` |
| PDF (WeasyPrint) | `apps/api/app/lib/primary_pdf.py` |
| Services | `apps/api/app/services/primary/` (`setup`, `subjects`, `marks`, `recalc`, `results`, `ple`) |
| Router | `apps/api/app/routers/primary_reports.py` → `/api/schools/primary` |

### RBAC (`PermissionAction`)
| Action | Roles |
|--------|--------|
| `managePrimarySetup` | admin |
| `viewPrimaryResults` | admin, head_teacher |
| `enterPrimaryMarks` | admin, head_teacher, teacher |
| `managePLEResults` | admin, head_teacher |
| `generatePrimaryReports` | admin, head_teacher |

### Main endpoints
- `GET /overview`, `GET|POST|PATCH /setup`
- `GET /classes`, `GET /classes/{id}/roster`
- `GET|POST|PATCH|DELETE /subjects`, `POST /subjects/link-class`
- `GET /themes`
- `GET|POST /marks/ca`, `/marks/ca/bulk`
- `GET|POST /marks/exams`, `/marks/exams/bulk`, `/marks/exams/submit`, `/marks/exams/unlock`
- `GET|POST /marks/thematic`, `/marks/thematic/bulk`
- `GET /results/class/{id}`, `GET /results/student/{id}`
- `POST /results/comments`, `POST /results/positions`
- `GET|POST /ple`, `POST /ple/bulk`, `GET /ple/analytics`
- `POST /report-cards/generate?class_id=&term_id=&student_id=` → PDF or ZIP

Also: `GET /api/schools/settings/current-term` now includes `academicYearId` (needed for PLE).

---

## Frontend

### Admin (`school_type` primary|both + RBAC)
| Route | Purpose |
|-------|---------|
| `/dashboard/primary` | Overview + first-time ensure setup |
| `/dashboard/primary/setup` | Weights + grade scale |
| `/dashboard/primary/marks` | Upper-primary CA/exam bulk entry |
| `/dashboard/primary/marks/thematic` | P1–P3 thematic grid |
| `/dashboard/primary/results` | Class results + recalculate positions |
| `/dashboard/primary/results/[studentId]` | Student term detail + PDF |
| `/dashboard/primary/report-cards` | Class ZIP / single PDF |
| `/dashboard/primary/ple` | P7 PLE entry + division analytics |

Student profile **Results** tab shows primary term results for P1–P7 learners.

### Teacher
| Route | Purpose |
|-------|---------|
| `/teacher/primary/marks` | Same marks UI (thematic links stay under `/teacher/...`) |
| `/teacher/primary/marks/thematic` | Thematic grid |

Nav hides Primary for secondary-only schools (`filterNavGroupsBySchoolType` / `filterPortalNavGroupsBySchoolType`).

### Shared
- Types: `packages/shared/src/types/primary.ts`
- Helpers: `schoolOffersPrimary`, `isLowerPrimaryLevel`, `isUpperPrimaryLevel` in `packages/shared/src/constants/classes.ts`
- Client: `apps/web/src/lib/api/primary.ts`
- Hooks: `apps/web/src/hooks/usePrimary.ts`

---

## Ops notes
1. Run migration `048_primary_reports.sql`.
2. Ensure WeasyPrint system deps are available where PDF is generated (same as A-Level).
3. Set current term (with `academic_year_id`) before PLE entry.
4. Admin: open Primary → **Create primary setup** once per school.

## Explicit non-goals
- No changes to migrations 001–047, A-Level, or CBC continuous assessment modules.
- No Primary UI for `school_type === "secondary"`.
