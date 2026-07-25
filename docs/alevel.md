# A-Level (Traditional UACE)

Termly **internal** grading for Advanced-level (S5 / S6) students: subject catalogue profiles, combinations, enrollments, score entry, and computed points / result codes.

This is **not** UNEB certification machinery. Teachers enter a term score (0–100) per subject; the system maps scores to letter grades and UACE-style points for progress tracking.

Product / UNEB grounding rules used when building the module live in the root `A-level.md` prompt. This document describes **what shipped** and how to extend it.

## Architecture

```
Academics → Subjects (school_subjects)     ← identity + class links / timetable
        │
        └── alevel_subjects (profile)     ← code, principal|subsidiary, is_gp
                │
                ├── alevel_combinations (+ combination_subjects, exactly 3 principals)
                ├── alevel_enrollments (student × academic year)
                ├── alevel_grades (student × subject × term)
                ├── alevel_term_locks (close exam for class × term)
                └── alevel_report_metadata (comments + approval)

Pure logic: app/lib/alevel.py
Configurable: alevel_grade_bands + alevel_config.subsidiary_pass_threshold

Historical grades are frozen — changing the scale only affects new entries.
No row in alevel_term_locks ⇒ exam is open for that class-term.
```

| Layer | Path |
|-------|------|
| Migrations | `039_alevel.sql`, `040_alevel_subject_catalog.sql`, `041_alevel_locks_and_reports.sql` |
| Pure logic | `apps/api/app/lib/alevel.py` (+ `apps/api/tests/test_alevel.py`) |
| Access helpers | `apps/api/app/lib/alevel_access.py` |
| PDF | `apps/api/app/lib/alevel_pdf.py` |
| Router | `apps/api/app/routers/alevel.py` |
| Mount | `/api/schools/alevel` (+ `/api/v1/…`) |
| Seed | `apps/api/app/db/seed_alevel.py` → `npm run seed:alevel -- --school <slug>` |
| Shared types | `packages/shared/src/types/alevel.ts` |
| Web client / hooks | `apps/web/src/lib/api/alevel.ts`, `apps/web/src/hooks/useALevel.ts` |
| UI | `apps/web/src/app/(school-admin)/dashboard/alevel/` |
| Teacher UI | `/teacher/alevel/grades` |
| Components | `apps/web/src/components/alevel/` |

## Concerns split (important)

| Concern | Owner |
|---------|--------|
| Subject **name** / school catalogue | `school_subjects` — Academics → Subjects |
| Class linking, teaching load, timetable | `school_class_subjects` + existing academic modules |
| UACE semantics (code, principal/subsidiary, GP) | `alevel_subjects` via `school_subject_id` |
| Which principals a student takes | Combination + enrollment |
| Term scores | `alevel_grades` |

**Do not** create a parallel name catalogue. Creating an A-Level profile either links an existing `school_subjects` row or creates one, then inserts the profile. Deleting a catalogue subject that still has an A-Level profile returns **409 `SUBJECT_HAS_ALEVEL_PROFILE`**.

## S5 / S6 only

Combinations apply at Advanced level:

- Constants: `A_LEVEL_CLASS_LEVELS = ("S5", "S6")` in `apps/api/app/lib/classes.py` and `packages/shared/src/constants/classes.ts`
- `GET /alevel/classes` returns only those classes
- Enroll / bulk enroll reject other levels with **400 `NOT_ALEVEL_CLASS`**

## Permissions

| Action (RBAC) | Roles | Used for |
|---------------|-------|----------|
| `manageALevel` | `admin` | Setup (subjects, combinations, enrollments, grading scale), reopen exams |
| `viewALevel` | `admin`, `head_teacher` | Results, report cards, close exams, grading scale read |
| `enterALevelGrades` | `admin`, `head_teacher`, `teacher` | Grade entry (teachers: assigned subjects only, open exam) |

API enforces inline role sets (`MANAGE_ROLES` / `VIEW_ROLES` / `GRADE_ROLES`) in `alevel.py`. Nav: `apps/web/src/lib/roles/school-admin-nav.ts` under Academic → A-Level.

## Data model (039 + 040)

| Table | Purpose |
|-------|---------|
| `alevel_subjects` | Profile: `school_subject_id`, `code`, `subject_type`, `is_gp`, `is_active` |
| `alevel_combinations` | e.g. PCM / HEG; `category` ∈ science, arts, business, technical |
| `alevel_combination_subjects` | Exactly 3 principal subjects per combo (enforced in API) |
| `alevel_enrollments` | One row per `(school, student, academic_year)` |
| `alevel_grades` | One row per `(school, student, subject, term)` — stores raw + frozen letter/points |
| `alevel_grade_bands` | Optional per-school principal score bands |
| `alevel_config` | `subsidiary_pass_threshold` (default 35) |
| `alevel_term_locks` | Closes grade entry for `(school, class, term)` |
| `alevel_report_metadata` | Class/HT comments + approval per student-term |

## Grading logic

Pure functions in `app/lib/alevel.py` — **no DB**. Defaults when a school has no custom bands:

| Score ≥ | Grade | Points |
|---------|-------|--------|
| 80 | A | 6 |
| 70 | B | 5 |
| 60 | C | 4 |
| 50 | D | 3 |
| 40 | E | 2 (minimum principal pass) |
| 35 | O | 1 |
| 0 | F | 0 |

Subsidiary (GP, Sub-Maths, ICT): pass/fail vs threshold → `P`/1 or `F`/0.

**Totals** (`compute_student_totals`): best 3 principals by points + GP (capped at 1) + one non-GP subsidiary (capped at 1) → max **20**.

**Result codes:** `1` (≥2 principal passes A–E), `2` (exactly one), `6` (none / incomplete).

Admin UI can override bands and subsidiary threshold under **A-Level → Grading scale**. Empty `alevel_grade_bands` falls back to the defaults above. Changing the scale **does not** rewrite existing `alevel_grades` rows.

## Exam lifecycle & grading workflow

The "exam" is the act of entering and finalising a term's marks for a class. There is no separate exam entity — an exam is **open** for a `(class, term)` while no matching row exists in `alevel_term_locks`, and **closed** once one does.

```
Open exam (no lock)                 Closed exam (locked)
──────────────────                  ────────────────────
teachers + admins enter marks   →   grade entry rejected (HTTP 423 EXAM_LOCKED)
grades computed & stored            stored grades stay frozen
                                    results & report cards still readable
        ▲                                   │
        └──────── admin "Reopen" ◀──────────┘
```

### Who can do what

| Step | Actor | Rule |
|------|-------|------|
| Enter / edit marks | teacher | Only subjects they teach in that class (`teacher_class_assignments.subject_id` → `school_subjects` → `alevel_subjects.school_subject_id`) **and** only while the exam is open |
| Enter / edit marks | admin, head teacher | Any subject while the exam is open |
| Close exam | admin, head teacher | Locks `(class, term)` — blocks further entry |
| Reopen exam | admin only | Deletes the lock; head teachers cannot self-reopen |
| Approve report card | admin, head teacher | Freezes comments for that student-term |

`GET /grades` returns `isOpen` / `isLocked`, the locker's name/time, and (for teachers) `editableSubjectIds`. The grid renders non-editable cells read-only; the teacher portal at `/teacher/alevel/grades` reuses the same component with `portal="teacher"` and hides the lock controls.

### How a mark becomes a grade

1. Teacher types a raw score (0–100) per applicable subject. Applicable = the student's 3 combination principals + General Paper + their chosen subsidiary.
2. On save, only **changed** cells are sent (`POST /grades/bulk`). Each score is graded with the school's *current* bands/threshold via `compute_grade`, and the raw score + letter + points are stored together.
3. `null` raw score clears the cell. Response reports `{ saved, cleared, skipped }` (`skipped` = subjects the actor may not grade).
4. Because letter/points are stored at entry time, a later scale change only affects **new** entries — historical results and report cards remain stable.

### Results & report cards

- `GET /results` ranks the class by total points and attaches a `summary` (student count, average points, certificate-eligible %, 2+/3 principal passes, per-subject sat/pass-rate/avg).
- `GET /report-card/{id}` builds one student's term report: subjects with grade descriptors, totals, class position/size, comments, and approval state.
- `POST /report-card/{id}/comment` saves class/head-teacher comments and optionally approves (locks comments).
- `POST /report-cards/generate` renders WeasyPrint PDFs — base64 for one student, or a base64 zip for the whole class.

## Endpoints

Base: `/api/schools/alevel`.

| Area | Methods |
|------|---------|
| Classes / terms | `GET /classes`, `GET /terms` |
| Grading scale | `GET` / `PUT /grading-scale` |
| Subjects | `GET` / `POST /subjects`, `PATCH` / `DELETE /subjects/{id}` |
| Combinations | `GET` / `POST /combinations`, `PATCH` / `DELETE /combinations/{id}` |
| Enrollments | `GET` / `POST /enrollments`, `POST /enrollments/bulk`, `PATCH /enrollments/{id}`, `POST /enrollments/bulk-update`, `DELETE /enrollments/{id}` |
| Grades | `GET /grades`, `POST /grades/bulk`, `GET /grades/student/{id}` |
| Exam lock | `POST` / `DELETE /terms/{term_id}/lock` |
| Results | `GET /results` (includes `summary`) |
| Report cards | `GET /report-card/{id}`, `POST /report-card/{id}/comment`, `POST /report-cards/generate` |

### Enrollment filters (`GET /enrollments`)

`academic_year_id`, `class_id`, `combination_id`, `category`, `search` (name or learner ID).

### Bulk enroll (`POST /enrollments/bulk`)

Assigns many students to **one** combination (+ optional subsidiary) for a year/class. Response:

```json
{ "enrolled": 12, "skipped": 2, "invalid": 0 }
```

Already-enrolled students for that year are **skipped** (not an error). Cap: 300 students per request.

### Grade bulk (`POST /grades/bulk`)

Requires an **open** exam (no term lock) — otherwise **423**. Teachers may only submit subjects linked via teaching load (`teacher_class_assignments` → catalogue → `alevel_subjects`). Entries with `rawScore: null` clear the cell. Non-null scores are graded via the *current* school scale and stored; later scale changes leave those rows alone.

Response: `{ "saved", "cleared", "skipped" }`.

## Frontend pages

| Route | Purpose |
|-------|---------|
| `/dashboard/alevel/grades` | Score grid, live grade preview, close/reopen exam, diff save |
| `/dashboard/alevel/results` | Ranked results, class summary, subject pass rates, CSV |
| `/dashboard/alevel/report-cards` | Preview, comments, approve, PDF / class zip |
| `/dashboard/alevel/setup/subjects` | Attach A-Level profiles to catalogue subjects |
| `/dashboard/alevel/setup/combinations` | Build 3-subject combinations |
| `/dashboard/alevel/setup/enrollments` | Filters + single/bulk enroll + bulk update |
| `/dashboard/alevel/setup/grading` | Editable bands + frozen-grade warning |
| `/teacher/alevel/grades` | Teacher portal — assigned subjects only |

Toasts use `useToast()` from `apps/web/src/providers/ToastProvider.tsx` on all of these pages.

## Seed

```bash
# From repo root — school must already exist
npm run seed:alevel -- --school your-school-slug
# or: SEED_SCHOOL_SLUG=your-school-slug npm run seed:alevel
```

Idempotent: upserts catalogue subjects, A-Level profiles, common combinations (PCM, PCB, BCM, HEG, HEL, HED, EGM), and UNEB default bands if none exist.

## Invariants

1. One A-Level profile per catalogue subject per school.
2. Combinations require exactly **3 distinct principal** subjects.
3. One enrollment per student per academic year.
4. One grade per student / subject / term.
5. Enrollments and class pickers are S5/S6 only.
6. Subject **names** change only via Academics → Subjects; A-Level edit updates code/type/GP/active only.
7. Stored grades/points are never recomputed when the scale changes.
8. Teachers grade only assigned class-subjects while the exam is open.

## Tests

```bash
cd apps/api && .venv/bin/python -m pytest tests/test_alevel.py -q
```

## Related

- Original UNEB / product prompt: root `A-level.md`
- Class levels: `packages/shared/src/constants/classes.ts`
- Subject catalogue CRUD: `apps/api/app/routers/subjects.py`
