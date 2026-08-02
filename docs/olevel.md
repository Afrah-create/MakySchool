# O-Level (NLSC CBC)

Internal termly grading for Uganda’s **New Lower Secondary Curriculum (NLSC CBC)** covering **S1–S4**. Schools configure a curriculum (grade scale, assessment weights, selection rules), open exam sessions for CA and end-of-term exams, enter marks, run a rule-driven grading engine, approve results, and generate progress-report PDFs.

This is **not** the old UCE D1–F9 / division system and **not** UNEB certification. Design input lives in the root `o-level.md` prompt; this document describes **what shipped**.

Status: **shipped** (migration `055`, API, admin + teacher UI). Learner portal results are out of scope for v1.

## Architecture

```
Academics → Subjects (school_subjects)     ← identity + teaching load / timetable
        │
        └── olevel_subjects (profile)     ← code, department, school_subject_id
                │
                ├── curricula (+ grade scale, categories, selection/promotion/report rules)
                ├── curriculum_subjects (compulsory|optional × applies_to_levels)
                ├── student_curriculum_enrollments (+ subject registrations)
                ├── olevel_exam_sessions (class × term × category × year — draft|open|closed)
                ├── olevel_marks + olevel_mark_submissions
                └── olevel_subject_results + olevel_student_results (comments / approve / PDF)

Pure engine: app/lib/grading_engine.py   ← zero curriculum-specific hardcoding
Rules always loaded from DB at runtime
```

| Layer | Path |
|-------|------|
| Migration | `apps/api/migrations/055_olevel_curriculum.sql` |
| Pure engine | `apps/api/app/lib/grading_engine.py` |
| Access helpers | `apps/api/app/lib/olevel_access.py` |
| PDF | `apps/api/app/lib/olevel_pdf.py` |
| Services | `apps/api/app/services/olevel/` |
| Router | `apps/api/app/routers/olevel.py` |
| Mount | `/api/schools/olevel` (+ `/api/v1/…`) |
| Shared types | `packages/shared/src/types/olevel.ts` |
| Class helpers | `O_LEVEL_CLASS_LEVELS`, `schoolOffersOLevel` |
| Web admin | `apps/web/src/app/(school-admin)/dashboard/olevel/` |
| Web teacher | `apps/web/src/app/(teacher)/teacher/olevel/` |
| API client / hooks | `apps/web/src/lib/api/olevel.ts`, `apps/web/src/hooks/useOLevel.ts` |

School gate: `school_type` in `secondary` | `both` (same family as A-Level). Primary-only schools do not see O-Level nav.

**Do not confuse with** `/api/schools/continuous-assessment` (migration `019`) — that is a separate generic CA feature. O-Level owns its own sessions and marks.

## Data model (high level)

### Curriculum hub
- `curricula` — one active NLSC CBC config per school (unique `school_id, name`)
- `curriculum_grade_scales` — A–E bands (points + % range); admin-editable
- `curriculum_assessment_categories` — e.g. CA 20% + EXAM 80%; weights must sum to 100
- `curriculum_selection_rules` — S1–S2 vs S3–S4 subject counts  
  - Uniqueness via `levels_key` text (e.g. `S1,S2`), **not** an expression index on `array_to_string` (PostgreSQL requires IMMUTABLE functions in index expressions)
- `curriculum_promotion_rules` — min pass grade letter, max failed compulsory/optional
- `curriculum_report_rules` — which PDF sections to show (`show_division_ranking` / `show_result_code` default **false**)

### Subjects
- `olevel_subjects` — school catalogue with `school_subject_id` bridge for teacher assignments
- `curriculum_subjects` — role (`compulsory` / `optional` / `co_curricular`) + `applies_to_levels`  
  - Unique `(curriculum_id, subject_id, subject_role)` so the same subject can be compulsory in S1–S2 and optional in S3–S4

### Runtime
- `olevel_exam_sessions` — unique `(school, class, term, category, year)`; status `draft` → `open` → `closed`
- `student_curriculum_enrollments` — one curriculum per student per academic year
- `student_subject_registrations` — compulsory + optionals validated against selection rules
- `olevel_marks` — raw score / absent per student × subject × session; grade/points stored when graded
- `olevel_mark_submissions` — per teacher × subject × session (`draft` / `submitted` / `unlocked`)
- `olevel_subject_results` / `olevel_student_results` — persisted pipeline output; reports never recompute from raw marks

## Exam session lifecycle

| Status | Teachers enter marks? |
|--------|------------------------|
| `draft` | No |
| `open` | Yes (assigned subjects only), until they **submit** |
| `closed` | No — results/reports still readable |

- Create as draft → **Open** (admin / HT)  
- **Close** blocked while any mark submission is not `submitted` (draft/unlocked rows listed in the 409)  
- Re-open closed → open supported for admin/HT via open endpoint  

Categories come from the curriculum (typically **CA** and **EXAM**), so a class can have one open CA session and one open EXAM session in the same term.

## Permissions

| Action | Roles | Used for |
|--------|-------|----------|
| `manageCurriculum` | `admin` | Setup wizard, subjects, replace rules |
| `viewCurriculum` | `admin`, `head_teacher` | Overview, read curriculum (teachers may read curriculum for grade preview when entering marks) |
| `manageExamSessions` | `admin`, `head_teacher` | Create/open/close sessions, unlock marks |
| `manageStudentSubjects` | `admin` | Enrollments + subject registration |
| `enterOLevelMarks` | `admin`, `head_teacher`, `teacher` | Mark grid; teachers scoped by teaching load |
| `viewOLevelResults` | `admin`, `head_teacher` | Grade class, rankings, results, comments |
| `generateOLevelReports` | `admin`, `head_teacher` | PDF / class ZIP |

Teachers see **only** subjects/classes from `teacher_class_assignments` joined through `olevel_subjects.school_subject_id` — enforced in the API, not only in the UI.

## Grading engine

`app/lib/grading_engine.py` is pure (no DB). The router/services load rules and call:

1. `calculate_category_percentages` — raw → % per category  
2. `calculate_weighted_score` — weighted average from category weights  
3. `grade_from_weighted_score` — first matching band by `min_percent`  
4. `select_counting_subjects` — all compulsory + top N optionals (`optional_to_count_in_result`)  
5. `calculate_totals` / `check_promotion` — points, averages, pass/fail vs promotion rules  
6. `run_grading_pipeline_data` — full preview/persist payload  

**Never** hardcode A/B/C/D/E, 20/80 weights, or subject names in the engine. Seed defaults live in `app/services/olevel/seed.py` only.

Default CBC seed (when `seedDefaults: true` on setup):

| Grade | Points | % range | Label |
|-------|--------|---------|-------|
| A | 5 | 80–100 | Exceptional |
| B | 4 | 65–79 | Outstanding |
| C | 3 | 50–64 | Satisfactory |
| D | 2 | 40–49 | Basic |
| E | 1 | 0–39 | Elementary |

Categories: CA 20%, EXAM 80%.  
Selection: S1–S2 → 11 compulsory + 1 optional; S3–S4 → 7 compulsory + 1–2 optional (2 count in result).  
Promotion: min grade **D**, max failed compulsory **0**, max failed optional **2**.

## Endpoints

Base: `/api/schools/olevel`.

| Area | Methods |
|------|---------|
| Overview / helpers | `GET /overview`, `GET /classes`, `GET /terms` |
| Curriculum | `POST /curriculum/setup`, `GET /curriculum`, `PATCH /curriculum/{id}`, `PUT …/grade-scale`, `…/assessment-categories`, `…/selection-rules`, `…/promotion-rules`, `…/report-rules` |
| Subjects | `GET` / `POST /subjects`, `PATCH /subjects/{id}`, curriculum assign `GET/POST/PATCH/DELETE …/curriculum/{id}/subjects` |
| Sessions | `GET` / `POST /exam-sessions`, `PATCH …/{id}`, `…/open`, `…/close` |
| Enrollments | `GET` / `POST /enrollments`, `POST …/bulk`, `POST …/bulk-subjects`, register/drop subjects |
| Marks | `GET /marks`, `POST /marks/bulk`, `POST …/{sessionId}/submit`, `…/unlock`, `GET …/submissions` |
| Grading | `POST /grade/class`, `POST /grade/student/{enrollmentId}`, `GET /grade/preview/{enrollmentId}` |
| Results | `POST /results/rankings`, `GET /results/class`, `GET /results/student/{id}`, `POST /results/comments`, `POST /results/approve` |
| Reports | `GET /report-cards/student` (PDF), `POST /report-cards/class` (ZIP) |
| Teacher | `GET /teacher/assignments` |

`school_id` always from `TenantCtx` — never from the request body. Bulk inserts use `UNNEST`.

## Frontend

| Route | Purpose |
|-------|---------|
| `/dashboard/olevel` | Overview / first-time CBC setup |
| `/dashboard/olevel/setup` | Edit scale, weights, selection rules, subjects, report flags |
| `/dashboard/olevel/exam-sessions` | Create / open / close; view submissions; unlock |
| `/dashboard/olevel/students` | Bulk enroll + subject registration |
| `/dashboard/olevel/results` | Run grading, rankings, approve, PDF |
| `/dashboard/olevel/marks` | Admin read-only mark review |
| `/teacher/olevel` | Open assignments for the teacher |
| `/teacher/olevel/marks` | Draft → submit (locked until unlock); live %/grade preview |

Nav is filtered with `schoolOffersOLevel` (secondary | both).

## Typical admin flow

1. **Set up O-Level** (seeds CBC defaults + subject catalogue linked to `school_subjects`).  
2. Review / edit setup (scale, weights, selection rules, report flags).  
3. **Students** — bulk enroll a class for the year; register compulsory + optionals.  
4. **Exam sessions** — create CA and EXAM sessions; open them.  
5. Teachers enter and submit marks.  
6. **Results** — Run grading → Calculate rankings → comments → Approve.  
7. Download student PDF or class ZIP.

## Invariants

1. One curriculum enrollment per student per academic year.  
2. One exam session per class / term / category / year.  
3. Selection-rule uniqueness is `(curriculum_id, levels_key)`.  
4. Teachers mark only assigned O-Level subjects while the session is **open** and submission is not `submitted`.  
5. After submit, only admin/HT unlock allows edits.  
6. Grading engine never persists; services persist `*_results`.  
7. PDFs honour `curriculum_report_rules` show flags.  
8. Do not modify Primary, A-Level, or continuous-assessment modules for O-Level work.

## Tests

```bash
cd apps/api && .venv/bin/python -m pytest tests/test_grading_engine.py -q
```

## Related

- Root prompt: `o-level.md`  
- A-Level (S5–S6): [alevel.md](./alevel.md)  
- Primary: [primary-implemented.md](./primary-implemented.md)  
- Class levels: `packages/shared/src/constants/classes.ts`
