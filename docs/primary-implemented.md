# Uganda Primary Reports (P1–P7) — Implemented

Status: **shipped** (migrations `048` + `049`, exam workflow aligned with A-Level).

Hard gates:
- Primary: `school_type ∈ {primary, both}` → else `403 PRIMARY_NOT_ENABLED`
- A-Level: `school_type ∈ {secondary, both}` → else `403 ALEVEL_NOT_ENABLED` (nav + API)

---

## Workflow (upper primary P4–P7)

1. **Setup** — Admin creates grading setup, then **Install default subjects** (LIT/NUM for P1–P3 + core P4–P7). Subjects are upserted into `school_subjects` and linked to P-classes so **Teaching load** can assign teachers. Admin may add any extra subject.
2. **Exam types** — Admin manages BOT / MID / EOT (and custom types).
3. **Exams** — Admin creates an exam for class × term × type and opens it.
4. **Marks** — **Teachers only** enter scores for subjects they teach (via teaching load → `primary_subjects.school_subject_id`). They submit when done.
5. **Unlock** — Admin/HT unlocks a teacher submission to allow re-entry.
6. **Grading** — Each exam is graded on its own scores (percent → D/C/P/F). **No averaging across exams.** CA remains separate.

Lower primary (P1–P3) still uses thematic assessment grids.

---

## Backend

| Piece | Path |
|-------|------|
| Migrations | `048_primary_reports.sql`, `049_primary_exams.sql` |
| Access | `primary_access.py`, `primary_exam_access.py` |
| Exams service | `services/primary/exams.py` |
| Subjects install | `services/primary/subjects.py` → `install_default_subjects` |
| Recalc (per exam) | `recalculate_exam_results` in `services/primary/recalc.py` |
| Router | `/api/schools/primary` |

### Key endpoints
- `POST /subjects/install-defaults`, `POST /subjects` (custom)
- `GET|POST|PATCH|DELETE /exam-types`
- `GET|POST /exams`, `POST /exams/{id}/open|close`, `DELETE /exams/{id}`
- `GET /exams/{id}/grades`
- `POST /exams/{id}/grades/bulk` — **teacher only**
- `POST /exams/{id}/submit` — **teacher only**
- `POST /exams/{id}/submissions/{teacherId}/unlock` — admin/HT
- Legacy `POST /marks/exams/bulk` → `410 USE_EXAM_GRADES`

### RBAC
| Action | Roles |
|--------|--------|
| `managePrimarySetup` | admin |
| `viewPrimaryResults` | admin, head_teacher |
| `enterPrimaryMarks` | **teacher** only |
| `managePLEResults` | admin, head_teacher |
| `generatePrimaryReports` | admin, head_teacher |

---

## Frontend

| Route | Role |
|-------|------|
| `/dashboard/primary/setup` | Install subjects, weights, add subjects |
| `/dashboard/primary/exam-types` | Exam type CRUD |
| `/dashboard/primary/exams` | Create / open / close |
| `/dashboard/primary/grades` | Admin view + unlock |
| `/teacher/primary/grades` | Teacher enter + submit |
| `/dashboard/primary/marks/thematic` | P1–P3 thematic (unchanged) |

Nav hides Primary or A-Level based on `schoolOffersPrimary` / `schoolOffersALevel`.

---

## Ops
1. Apply `048` then `049`.
2. Primary Setup → Install default subjects → Teaching load assignments.
3. Create exam types (seeded on first list) → create & open exams.
4. Teachers enter marks on open exams only.
