# Uganda Primary Reports (P1–P7) — Implemented

Status: **shipped** (migrations `048`–`050`, exam workflow aligned with A-Level + UNEB aggregates).

Hard gates:
- Primary: `school_type ∈ {primary, both}` → else `403 PRIMARY_NOT_ENABLED`
- A-Level: `school_type ∈ {secondary, both}` → else `403 ALEVEL_NOT_ENABLED` (nav + API)

---

## Mental model (keep it simple)

| Layer | What it is |
|-------|------------|
| **Subjects** | Full catalogue (ENG/MATH/SCI/SST + RE/LOC/CAPE…). Flag `isPleSubject` on the four aggregate cores. |
| **Exam** | One sitting (BOT/MID/EOT) for a class × term × type, with an explicit **subject scope**. |
| **Marks** | Teachers enter only subjects they teach ∩ exam subjects; submit/unlock like A-Level. |
| **CA** | Separate continuous assessment. Does **not** block exam submit. Weights apply when blending CA + EOT on a term report — not on every exam. |

---

## Workflow (upper primary P4–P7)

1. **Setup** — Grading weights + **ranking mode**:
   - `ple_points` (default): percent → D1–F9 → aggregate = sum of points on PLE subjects (4–36) → Division 1–U
   - `percent`: average % → D/C/P/F
2. **Install default subjects** — LIT/NUM for P1–P3 + cores for P4–P7; link to Teaching load.
3. **Exam types** — BOT / MID / EOT (and custom).
4. **Exams** — Admin picks class, type, and **which subjects** (defaults to the four aggregate cores). Open for teachers.
5. **Marks** — Teachers save only changed cells; submit when done. Admin unlocks for re-entry.
6. **Results** — Per-exam aggregate / division / position (lower aggregate ranks higher).

Lower primary (P1–P3) still uses thematic assessment grids.

---

## Backend

| Piece | Path |
|-------|------|
| Migrations | `048_primary_reports.sql`, `049_primary_exams.sql`, `050_primary_exam_subjects.sql` |
| Access | `primary_access.py`, `primary_exam_access.py` |
| Exams | `services/primary/exams.py` |
| Recalc | `recalculate_exam_results` — PLE points or percent |
| Router | `/api/schools/primary` |

### Key endpoints
- `POST /subjects/install-defaults`, `POST /subjects`
- `PATCH /setup` — `aggregate_mode`: `ple_points` \| `percent`
- `GET|POST|PATCH|DELETE /exam-types`
- `GET|POST /exams` — body may include `subject_ids` (default = PLE cores)
- `GET /exams/{id}/grades` — scoped to exam subjects
- `POST /exams/{id}/grades/bulk` — teacher only; skips never-saved empty cells
- `POST /exams/{id}/submit` / unlock
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
| `/dashboard/primary/setup` | Weights, ranking mode, install subjects |
| `/dashboard/primary/exam-types` | Exam type CRUD |
| `/dashboard/primary/exams` | Create with subject picker / open / close |
| `/dashboard/primary/grades` | Admin view + unlock |
| `/teacher/primary/grades` | Teacher enter + submit |
| `/dashboard/primary/results` | Aggregate, division, positions |
| `/dashboard/primary/marks/thematic` | P1–P3 thematic |

---

## Ops
1. Apply `048` → `049` → `050`.
2. Primary Setup → Install default subjects → Teaching load.
3. Create exam types → create exam (confirm subject chips) → open.
4. Teachers enter marks on open exams only.
