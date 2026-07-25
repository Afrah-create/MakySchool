# A-Level (Traditional UACE)

Termly **internal** grading for Advanced-level (S5 / S6) students: subject catalogue profiles, combinations, enrollments, **multiple exams per term**, score entry, and computed points / result codes.

This is **not** UNEB certification machinery. Teachers enter a score (0–100) per subject **per exam**; the system maps scores to letter grades and UACE-style points for progress tracking.

Product / UNEB grounding rules used when building the module live in the root `A-level.md` prompt. This document describes **what shipped** and how to extend it.

## Architecture

```
Academics → Subjects (school_subjects)     ← identity + class links / timetable
        │
        └── alevel_subjects (profile)     ← code, principal|subsidiary, is_gp
                │
                ├── alevel_combinations (+ combination_subjects, exactly 3 principals)
                ├── alevel_enrollments (student × academic year)
                ├── alevel_exam_types (BOT / Mid / EOT / custom — school catalogue)
                ├── alevel_exams (class × term × type — draft|open|closed)
                ├── alevel_grades (student × subject × exam)
                ├── alevel_mark_submissions (teacher × exam — submit / unlock)
                └── alevel_report_metadata (comments + approval per student × exam)

Pure logic: app/lib/alevel.py
Configurable: alevel_grade_bands + alevel_config.subsidiary_pass_threshold

Historical grades are frozen — changing the scale only affects new entries.
Subjects on reports come from each student’s combination (not from the exam).
```

| Layer | Path |
|-------|------|
| Migrations | `039`–`043` (`043_alevel_mark_submissions.sql`) |
| Pure logic | `apps/api/app/lib/alevel.py` |
| Access helpers | `apps/api/app/lib/alevel_access.py` |
| PDF | `apps/api/app/lib/alevel_pdf.py` |
| Router | `apps/api/app/routers/alevel.py` |
| Shared types | `packages/shared/src/types/alevel.ts` |
| Web | `apps/web/src/app/(school-admin)/dashboard/alevel/` |
| Teacher | `/teacher/alevel/grades` |

## Exam model (multiple per term)

```
Exam type (reusable)          Exam (instance)              Grades
─────────────────────         ────────────────             ──────
Beginning of Term / BOT  →    S5 East · Term 2 · Mid  →   one mark per
Mid Term / MID                status: draft|open|closed     student×subject
End of Term / EOT                                           for that exam
(+ school custom types)
```

**Unique exam:** `(school, class, term, exam_type)` — e.g. Mid and End of Term in the same term are both allowed; two Mid Terms for the same class/term are not.

**Lifecycle**

| Status | Teachers enter marks? |
|--------|------------------------|
| `draft` | No |
| `open` | Yes (assigned subjects only), until they **submit** |
| `closed` | No — results/reports still readable |

- Open draft → open: admin or head teacher  
- Close open → closed: admin or head teacher  
- Reopen closed → open: **admin only**  
- Delete exam: only if it has **no grades**

**Teacher submit / unlock**

1. Teacher saves draft marks for assigned subjects on an **open** exam.  
2. Teacher **submits** → their marks for that exam are locked (no further edits).  
3. Admin / head teacher **unlock** that teacher → they may edit and submit again.  
4. Teachers never see other teachers’ subject columns or marks.  
5. Admin / HT see the full grid **read-only**; they do not enter or edit marks.

**Subjects are not on the exam.** Applicable cells = each student’s 3 combination principals + GP + chosen subsidiary. Report cards list only that student’s subjects.

## Permissions

| Action | Roles | Used for |
|--------|-------|----------|
| `manageALevel` | `admin` | Setup, exam types, create/edit/delete exams, reopen closed |
| `viewALevel` | `admin`, `head_teacher` | Exams, view grades, unlock teachers, results, reports |
| `enterALevelGrades` | `teacher` | Draft + submit marks on **open** exams (own subjects) |

## Grading logic

Defaults (override under **Grading scale**):

| Score ≥ | Grade | Points |
|---------|-------|--------|
| 80 | A | 6 |
| 70 | B | 5 |
| 60 | C | 4 |
| 50 | D | 3 |
| 40 | E | 2 |
| 35 | O | 1 |
| 0 | F | 0 |

Subsidiary: pass/fail vs threshold → `P`/1 or `F`/0.  
Totals: best 3 principals + GP + one non-GP subsidiary (max 20).  
Result codes: `1` (≥2 principal passes), `2` (one), `6` (none).  
Stored letter/points are **never** recomputed when the scale changes.

## Endpoints

Base: `/api/schools/alevel`.

| Area | Methods |
|------|---------|
| Exam types | `GET` / `POST /exam-types`, `PATCH` / `DELETE /exam-types/{id}` |
| Exams | `GET` / `POST /exams`, `PATCH` / `DELETE /exams/{id}`, `POST …/open`, `POST …/close` |
| Grades | `GET /grades?exam_id=`, `POST /grades/bulk` `{ examId, entries }` (teachers only) |
| Submit / unlock | `POST /exams/{id}/submit`, `GET …/submissions`, `POST …/submissions/{teacherId}/unlock` |
| Results | `GET /results?exam_id=` (+ `summary`) |
| Report cards | `GET` / `POST comment` / `POST generate` — all `exam_id` |

`GET /exams` includes progress: `studentCount`, `applicableCells`, `gradedCells` (enrollment-aware).

## Frontend

| Route | Purpose |
|-------|---------|
| `/dashboard/alevel/exams` | Create / open / close / delete exams |
| `/dashboard/alevel/setup/exam-types` | BOT / Mid / EOT (+ custom) |
| `/dashboard/alevel/grades` | View-only grid + unlock submitted teachers |
| `/dashboard/alevel/results` | Per-exam ranked results + summary |
| `/dashboard/alevel/report-cards` | Per-exam preview, comments, PDF |
| `/teacher/alevel/grades` | Own subjects: draft → submit (locked until unlock) |

## Invariants

1. One A-Level profile per catalogue subject per school.  
2. Combinations require exactly **3** principal subjects.  
3. One enrollment per student per academic year.  
4. One grade per student / subject / **exam**.  
5. One exam per class / term / exam type.  
6. Teachers grade only assigned subjects while the exam is **open** and they have not submitted.  
7. After submit, only admin/HT unlock allows resubmit.  
8. Report subjects vary by student combination.

## Tests

```bash
cd apps/api && .venv/bin/python -m pytest tests/test_alevel.py -q
```

## Related

- Root prompt: `A-level.md`  
- Class levels: `packages/shared/src/constants/classes.ts`
