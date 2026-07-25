MakySchool — A-Level Implementation Plan

Traditional UACE track. Termly internal grading tool. Not UNEB certification.

How the system flows end to end

Before the plan, here is the complete data journey so every phase has context:

Admin configures          Teacher enters          System computes
─────────────────         ──────────────          ───────────────
Subjects (PCM etc.)  →    Raw score 0–100   →    Grade (A/B/C/D/E/O/F)
Combinations         →    Per subject            Points (6/5/4/3/2/1/0)
Enroll students      →    Per term           →   Total points (max 20)
                                             →   Result code (1/2/6)
                                             →   Class ranking
                                             →   Term report card (PDF)
Phase 1 — Database foundation
1.1 Migration (next available number after inventory)

Six tables, all scoped by school_id.

alevel_subjects

Stores the school's A-Level subject catalogue. Every subject is either principal or subsidiary. General Paper is a subsidiary with a special is_gp = true flag so the system can treat its scoring differently. Each school configures their own subjects rather than sharing a global catalogue, keeping multi-tenancy clean.

Columns needed: id, school_id, name, code (3–5 chars, e.g. PHY), subject_type (enum: principal/subsidiary), is_gp (boolean, only true for GP), is_active, created_at, updated_at.

Unique constraint on (school_id, code) — a school cannot have two subjects with the same code.

alevel_combinations

Named subject groupings like PCM or HEL. Stores only the combination's identity — the actual subject membership lives in the junction table below.

Columns: id, school_id, name (e.g. "PCM"), label (e.g. "Physics, Chemistry, Mathematics"), category (enum: science/arts/business/technical), is_active, created_at.

Unique on (school_id, name).

alevel_combination_subjects

Junction table linking each combination to exactly 3 principal subjects. Enforced at the API layer (validation before insert), not by a DB-level check constraint, because PostgreSQL cannot easily count rows in a CHECK constraint.

Columns: id, school_id, combination_id (FK → alevel_combinations), subject_id (FK → alevel_subjects).

Unique on (combination_id, subject_id) — a subject cannot appear twice in one combination.

alevel_enrollments

The critical link: one row per student per academic year. Captures which combination they are doing and which subsidiary (Sub-Maths or ICT) they chose alongside mandatory GP.

Columns: id, school_id, student_id (FK → students), combination_id (FK → alevel_combinations), academic_year_id (FK → academic_years), class_id (FK → school_classes), subsidiary_subject_id (FK → alevel_subjects — must be subsidiary, not GP), is_active, created_at.

Unique on (school_id, student_id, academic_year_id) — one enrollment per student per year.

Indexes on: (school_id, class_id, academic_year_id) for class-level enrollment queries, (school_id, student_id) for student-level lookups.

alevel_grades

The core marks table. One row per student per subject per term. Stores both the raw score the teacher entered and the computed grade/points so reporting never recomputes — it reads stored values. This is important: if the grade boundary table ever changes, historical reports remain stable because they read stored grades, not recomputed ones.

Columns: id, school_id, student_id, subject_id, term_id, academic_year_id, class_id, raw_score (numeric 5,2, nullable), grade (text, nullable — A/B/C/D/E/O/F for principal, P/F for subsidiary), points (smallint, nullable), entered_by (FK → users), entered_at, updated_at.

Unique on (school_id, student_id, subject_id, term_id) — one grade row per student per subject per term. ON CONFLICT DO UPDATE is valid here because teachers can correct marks before the term is locked.

Indexes on: (school_id, class_id, term_id) for grade grid queries, (school_id, student_id, academic_year_id) for report card queries.

alevel_term_locks

Controls whether grades for a class-term can still be edited. Once a head teacher locks a term, the grade entry endpoint rejects updates.

Columns: id, school_id, class_id, term_id, academic_year_id, locked_at, locked_by (FK → users).

Unique on (school_id, class_id, term_id).

1.2 Schema design decisions worth noting

Why store computed grade and points? Because report cards must be stable. If you recompute on read, changing a grade boundary retroactively changes historical reports. Storing them at entry time is the correct approach for an exam records system.

Why no CA split? Traditional UACE is 100% exam-based. The raw_score is the full mark for the term. No weighting formula.

Why alevel_term_locks as a separate table? Keeps the grades table simple. A lock check is one EXISTS query on a separate table rather than a status column that complicates the grades upsert logic.

Phase 2 — Business logic library

Create apps/api/app/lib/alevel.py. Pure functions, no DB calls, imported by the router.

2.1 Grade boundary constants

Define these at module level as a named constant — not hardcoded in the function body — so they can be found and adjusted in one place if needed:

Principal subjects:

80–100 → A, 6 points
70–79 → B, 5 points
60–69 → C, 4 points
50–59 → D, 3 points
40–49 → E, 2 points
35–39 → O, 1 point
0–34 → F, 0 points

Subsidiary subjects (GP, Sub-Maths, ICT):

Score ≥ 35 → grade "P", 1 point
Score < 35 → grade "F", 0 points
2.2 Functions to implement

compute_grade(score, subject_type) → (grade, points)
Takes a raw percentage score (float, 0–100) and subject type string. Returns a tuple of the grade letter and integer points. Raises ValueError if score is outside 0–100 range. This is called once per grade entry and the result is stored — not called at report time.

compute_student_totals(grades) → dict
Takes a list of dicts, each containing subject_type, grade, points, is_gp. Returns:

principal_points_by_subject — list of (subject_name, points) for the 3 principals
best_principal_points — sum of the 3 principal subject points (if student took fewer than 3, sum what exists)
gp_points — 0 or 1 (from the GP subject)
subsidiary_points — 0 or 1 (from Sub-Maths or ICT)
total_points — sum of all three (max 20)
principal_pass_count — count of principal subjects where grade is A, B, C, D, or E (not O or F)
result_code — "1" if principal_pass_count ≥ 2, "2" if 1, "6" if 0

compute_result_code(principal_pass_count) → str
Isolated helper used by compute_student_totals. Returns "1", "2", or "6".

validate_score(score) → None
Raises ValueError with a human-readable message if score is not between 0 and 100 inclusive. Called before compute_grade.

2.3 Test coverage requirement

Before the router is built, write test cases in apps/api/tests/test_alevel.py covering:

Score of 80 → A, 6 points
Score of 79 → B, 5 points
Score of 35 → O for principal, P for subsidiary (same boundary, different handling)
Score of 34 → F for both types
Score of 0 → F, 0 points
Score of 100 → A, 6 points
compute_student_totals with 3 principal passes → result code "1"
compute_student_totals with 1 principal pass → result code "2"
compute_student_totals with all O/F grades → result code "6"

All tests must pass before Phase 3 begins.

Phase 3 — Backend router

Create apps/api/app/routers/alevel.py. Register via mount_v1_and_legacy(app, alevel_router, "/api/schools/alevel") in main.py, placed after the timetable mount.

3.1 Exam configuration endpoints (admin only)

GET /alevel/subjects
Returns all active subjects for the school. Optional subject_type filter. Includes is_gp flag. Used to populate combination and grade entry selectors.

POST /alevel/subjects
Creates a subject. Validates code uniqueness within school. Validates is_gp is only true when subject_type is subsidiary. Admin role only.

PATCH /alevel/subjects/{id}
Updates name, code, is_active. Validates code uniqueness if changed. Admin only. Cannot change subject_type after creation — if a school makes a mistake they deactivate and recreate.

GET /alevel/combinations
Returns combinations with their 3 principal subjects expanded via JOIN through the junction table. Active combinations only by default; optional include_inactive param for admin views.

POST /alevel/combinations
Creates a combination. Body must contain exactly 3 principal subject IDs — validate this count and validate each subject exists, belongs to this school, and is type principal. Creates the junction rows in the same transaction. Admin only.

PATCH /alevel/combinations/{id}
Updates name, label, category, is_active, and optionally replaces the subject list. If replacing subjects, delete existing junction rows and insert new ones in the same transaction. Validate exactly 3 principals. Admin only.

GET /alevel/enrollments
Returns student enrollments with student name, learner ID, combination name, subsidiary subject name, and class. Filter by class_id and/or academic_year_id. Sorted by student name.

POST /alevel/enrollments
Enrolls a single student. Validates: student exists in school and is active, combination exists and is active, subsidiary subject is type subsidiary and not GP, no existing active enrollment for this student+year. Admin only.

POST /alevel/enrollments/bulk
Enrolls multiple students at once. Body: list of entries all sharing the same class_id, academic_year_id, combination_id, subsidiary_subject_id, and a list of student_ids. Validate each student individually before any inserts. Use a single unnest INSERT. Skip students already enrolled and return a report of how many were enrolled vs skipped. Admin only.

PATCH /alevel/enrollments/{id}
Update combination, subsidiary subject choice, or is_active. Cannot change student or academic year. Admin only.

POST /alevel/terms/{term_id}/lock
Locks grade entry for a class-term. Body: class_id, academic_year_id. Inserts a row in alevel_term_locks. Idempotent — if already locked, return 200 without error. Head teacher and admin roles.

DELETE /alevel/terms/{term_id}/lock
Unlocks a previously locked term. Same body. Admin only — head teacher cannot self-unlock, only admin can override. This creates an audit trail because the grades table records entered_by on every update.

3.2 Grade entry endpoints (teacher + admin)

GET /alevel/grades
Required params: class_id, term_id, academic_year_id.

This is the most complex query in the module. It must return a student × subject grid in one response:

Fetch all active enrollments for this class+year → gives the student list and their combinations
Derive each student's full subject set: 3 principals from their combination + GP + their subsidiary
Fetch all existing grades for these students in this term
Pivot the result: return a list of students, each with a grades object keyed by subject_id containing raw_score, grade, points
Include the full subject list for the class as a separate top-level key so the frontend can build columns
Include a is_locked boolean derived from alevel_term_locks

Teachers: validate they are assigned to this class via teacher_class_assignments before returning data.

POST /alevel/grades/bulk
Upserts grades for an entire class-term in one call.

Required body fields: class_id, term_id, academic_year_id, and entries — array of objects each with student_id, subject_id, raw_score.

Processing logic:

Check alevel_term_locks — if locked, return 423 LOCKED with a clear message
Validate the teacher owns this class (if role is teacher)
For each entry, call compute_grade(raw_score, subject_type) to get grade and points — fetch subject types in one query before the loop, not inside it
Use a single unnest-based INSERT ... ON CONFLICT (school_id, student_id, subject_id, term_id) DO UPDATE SET raw_score, grade, points, entered_by, updated_at
Return count of rows upserted

The unnest must pass parallel arrays: student_ids, subject_ids, raw_scores, grades, points_values, entered_by. All computed before the DB call.

GET /alevel/grades/student/{student_id}
Param: academic_year_id. Returns all terms in that year with their grades for this student, plus computed totals from compute_student_totals() for each term. Used by the student detail view and report card generation.

3.3 Results and reporting endpoints

GET /alevel/results
Required: class_id, term_id, academic_year_id.

Returns one row per student with: student name, learner ID, combination name, grade per principal subject, GP grade, subsidiary grade, total points, principal pass count, result code, and class rank (computed by ordering by total_points DESC, then by name for ties).

This endpoint reads stored grades — no recomputation. Fast, deterministic. Admin and head_teacher roles.

GET /alevel/results/summary
Same filters as above but returns class-level aggregates: student count, average total points, percentage with result code 1 (full certificate eligible), percentage with 2+ principal passes, subject-level pass rates (for each subject, what % of students got A–E). Used by the analytics section of the results page.

GET /alevel/report-card/{student_id}
Params: term_id, academic_year_id. Returns the full data payload needed to render a student's A-Level term report card: student personal details, class, combination, term, all subject grades with descriptors, totals, result code, class rank, head teacher comment field (nullable), and class teacher comment field (nullable). Does not generate the PDF itself — that is a separate step.

POST /alevel/report-card/{student_id}/comment
Saves head teacher or class teacher comment for a student's term report card. Stored in a comments JSONB column on a new alevel_report_metadata table (id, school_id, student_id, term_id, class_teacher_comment, head_teacher_comment, approved_by, approved_at). Upserts on (school_id, student_id, term_id).

POST /alevel/report-cards/generate
Body: class_id, term_id, academic_year_id. Generates PDFs for all students in the class. Calls the existing PDF infrastructure in apps/api/app/lib/ — look at how the fees receipt PDF is built and replicate that pattern. Returns a zip URL or a list of individual PDF URLs depending on what the existing storage infrastructure supports. Admin and head_teacher only.

Phase 4 — Shared types

Add packages/shared/src/types/alevel.ts. Export from packages/shared/src/types/index.ts.

Types needed — every field must match the exact API response shape:

ALevelSubjectType — 'principal' | 'subsidiary'
ALevelSubject — all columns from alevel_subjects, camelCased
ALevelCombination — includes principals: ALevelSubject[]
ALevelEnrollment — includes expanded student, combination, and subsidiary names
ALevelGradeCell — { rawScore: number | null; grade: string | null; points: number | null }
ALevelStudentGradeRow — student info + grades: { [subjectId: string]: ALevelGradeCell }
ALevelClassGradeResponse — { subjects: ALevelSubject[]; students: ALevelStudentGradeRow[]; isLocked: boolean }
ALevelStudentResult — student info + combination + per-subject grades + totals + resultCode + rank
ALevelResultsResponse — { students: ALevelStudentResult[]; summary?: ALevelResultsSummary }
ALevelResultsSummary — class average, pass rates, subject-level stats
BulkGradeEntry — { studentId: string; subjectId: string; rawScore: number }
BulkGradePayload — classId, termId, academicYearId, entries array
ALevelReportCardData — full payload for report rendering
ALevelCommentPayload — classTeacherComment, headTeacherComment
Phase 5 — Frontend: Exam configuration

Route group: (school-admin)/dashboard/alevel/setup/

5.1 Setup layout

Create a layout file for /dashboard/alevel/setup/ that renders a sub-navigation tab bar with four tabs: Subjects, Combinations, Enrollments, and a back link to the main A-Level area. The layout wraps all setup pages.

5.2 Subjects page (/setup/subjects)

Table view: Name, code, type badge (Principal = blue, Subsidiary = slate), GP chip (shown only if is_gp = true), active toggle (PATCH on change, optimistic update).

Add/edit slide-over: Name input, code input (auto-uppercase on change, max 5 chars), subject type radio (Principal / Subsidiary), GP checkbox (only enabled and visible when Subsidiary is selected — hide for Principal). Submit calls POST or PATCH. Invalidates subject list on success.

Validation shown inline: code must be unique (show error from API), name required, cannot mark a Principal subject as GP.

5.3 Combinations page (/setup/combinations)

Table view: Name pill, label text, category badge (Science = emerald, Arts = amber, Business = blue, Technical = slate), subject pills showing the 3 principals, active toggle.

Add/edit slide-over: Name input, label input, category dropdown, and a principal subjects multi-select. The multi-select shows only active principal subjects. As subjects are selected, show them as removable chips. Show a counter "X of 3 selected" that turns red if not exactly 3. Disable the submit button unless exactly 3 are selected.

5.4 Enrollments page (/setup/enrollments)

Filters: Academic year selector, class selector. These are required — show a prompt to select both before rendering the table.

Table view: Student name, learner ID, combination name, subsidiary subject name (styled differently from combination), active status.

Single enroll: A button opens a slide-over. Student dropdown (shows students in the selected class not yet enrolled this year), combination dropdown, subsidiary dropdown (shows active subsidiary subjects excluding GP — GP is always included automatically). Submit calls POST enrollment.

Bulk enroll slide-over: Select combination and subsidiary first. Then show a checklist of all unenrolled students in the class. Select all / deselect all toggle. Shows count selected. Submit calls bulk endpoint. After success, show a summary: "N students enrolled, M already had enrollments and were skipped."

Phase 6 — Frontend: Grade entry

Route: (school-admin)/dashboard/alevel/grades

Also accessible to teachers via the teacher portal at (teacher)/teacher/alevel/grades — same component, different route group, same hook.

6.1 Controls bar

Three selectors: academic year, class (filtered to S5/S6 only — A-Level classes), term. All three required before the grid renders. Persist selections in URL search params so refreshing the page restores the view.

Show a lock badge next to the term selector if the term is locked — "Locked by [name] on [date]". Lock/unlock button visible to admin and head teacher only.

6.2 Grade grid

This is the centrepiece of the module. Design it carefully.

Column structure: First column is student name + learner ID (sticky, does not scroll). Then one column per subject in this order: the 3 principals from their combination (alphabetically by subject code), then General Paper, then their subsidiary. Last column is a read-only "Total" showing points and result code badge.

Because students in one class may have different combinations, handle column display as the union of all subjects needed by any student in the class. For a student who does not take a particular column's subject, render that cell as a muted dash and make it non-editable.

Score input per cell:

Number input, 0–100
On change, immediately compute the grade letter and points using client-side logic mirroring the Python boundaries — display below the input in small muted text (e.g. "B · 5 pts")
The input border turns emerald for A–E (pass), amber for O (subsidiary pass), rose for F (fail)
Tab key moves to the next cell (same student, next subject) then next student

Totals column: Updates live as scores change. Shows total points (e.g. "17 / 20"), principal pass count (e.g. "3P"), and result code badge. This gives teachers instant feedback.

Bulk actions header: Above the grid, a row of quick-action buttons: "Clear all" (resets unsaved changes), "Save all" (triggers bulk submit). Number of unsaved changes shown as a badge on Save: "Save 23 changes".

State management:
Store all scores in one flat object: { [studentId:subjectId]: number | null }. Derive unsaved changes by diffing against the server data from useQuery. Do not use individual useState per cell — that causes 300 re-renders on "Mark all" actions.

On save: collect only cells that have changed (diff against server state), build the entries array in one pass, POST the bulk payload. On success, the query invalidates and refetches, resetting the diff baseline.

Loading state: Skeleton grid showing the expected number of rows and columns — not a full-page spinner. Skeleton columns match the subject count.

Empty states:

No students enrolled: "No A-Level students enrolled in this class for this year" + link to enrollment setup
Term locked: show the full grid read-only with a banner at top
6.3 Grade entry for teachers

The teacher portal version uses the same grid component but:

Only shows classes and **subjects** the teacher is assigned to
Never shows other teachers’ marks
**Save draft** while the exam is open and they have not submitted
**Submit marks** locks their sheet until admin / head teacher **unlocks** them for resubmit
Admin / head teacher grade page is view-only + unlock list (they do not enter marks)
Phase 7 — Frontend: Results and report cards
7.1 Results page (/dashboard/alevel/results)

Controls: academic year, class, term. Persist in URL params.

Results table columns: Rank, student name, learner ID, combination pill, then one column per subject (abbreviated code), GP, subsidiary, total points, result code badge.

Result code badge styling:

Code 1 → emerald background "Certificate Eligible"
Code 2 → amber background "Partial Pass"
Code 6 → muted background "Incomplete"

Summary cards above the table (use the existing StatPill pattern from the reference files you uploaded): Total students, Average points, Certificate eligible (count + %), 3 Principal passes (count + %), 2 Principal passes (count + %).

Subject pass rate section below the table: A small table showing for each subject: subject name, number of students who sat it, pass rate (A–E), average points. Sorted by pass rate descending.

CSV export: Client-side. Build a CSV string from the results data. Columns: rank, name, learner ID, combination, each subject grade, total points, result code. Trigger a download using a Blob URL. No API call.

Print view: A @media print stylesheet that hides controls, export button, and sidebar — leaving only the results table and summary. Accessible via the browser print command.

7.2 Report card page (/dashboard/alevel/report-cards)

Controls: academic year, class, term. Then a student selector (dropdown or searchable list).

Single report card preview: Renders the report card layout as an HTML component — not a PDF preview — so comments can be edited in place before generating the PDF.

Report card layout should include:

School name, logo, stamp (from the schools table — your existing setup stores these)
Academic year, term, class, combination name
Student name, learner ID, photo if available
Subject grades table: subject name, raw score, grade, points, descriptor (Distinction / Very Good / Credit / Pass / Minimum Pass / Subsidiary Pass / Fail)
Total points row, principal pass count, result code
Class rank ("5th out of 42")
Class teacher comment (editable textarea that auto-saves via the comment endpoint)
Head teacher comment (editable only by head_teacher role)
Approval section: "Approved by [head teacher name] on [date]" — or "Pending approval"

Approve button: Visible to head_teacher only. Calls the comment/approve endpoint. Sets approved_by and approved_at. Once approved, comments are locked.

Generate PDF button: Calls POST /alevel/report-cards/generate for the single student. Shows a loading spinner. On success, opens the PDF in a new tab or triggers download depending on what the storage layer returns.

Bulk generate: On the class-level view (before selecting a student), a "Generate All PDFs" button that calls the bulk generate endpoint for the whole class. Shows a progress indicator.

Phase 8 — Navigation and routing
8.1 School admin nav additions

In school-admin-nav.ts, add an "A-Level" group with these items. Check whether an Academic group already exists — if so, add A-Level items there rather than creating a duplicate group.

Items:

Grades → /dashboard/alevel/grades — GraduationCap icon
Results → /dashboard/alevel/results — BarChart3 icon
Report Cards → /dashboard/alevel/report-cards — FileText icon
Setup → /dashboard/alevel/setup/subjects (links to first setup tab) — Settings icon, admin role only
8.2 Teacher nav additions

In teacher-nav.ts, add under Teaching:

A-Level Grades → /teacher/alevel/grades — GraduationCap icon
8.3 Teacher route group

Create apps/web/src/app/(teacher)/teacher/alevel/grades/page.tsx. This page imports and renders the same grade grid component used in the admin route, but wraps it with teacher-specific access control (only shows that teacher's assigned classes).

Phase 9 — Performance requirements

The grade entry bulk save must handle a class of 60 students × 5 subjects = 300 grade rows in under 1 second end to end.

Ensure these constraints are met:

Backend: The bulk upsert uses a single unnest-based INSERT. Subject types are fetched in one query before grade computation — not one query per subject. The entire operation is one transaction. No Python loops that make DB calls.

Frontend: All 300 cell values live in one flat state object. The diff to find changed cells is one Object.entries() pass. The payload is built in one map. One fetch call. No batching.

Report generation: PDFs are generated server-side using the existing PDF library. For bulk generation of 40+ students, use asyncio.gather to build all PDFs concurrently rather than sequentially.

Delivery sequence
Step	What	Done when
1	Migration runs cleanly	Tables exist in DB, confirmed via psql or Supabase dashboard
2	alevel.py functions + all tests pass	pytest green on all grade boundary cases
3	Router registered, all routes in /api/docs	API restarts without error
4	Shared types added, typecheck passes	npm run typecheck clean across all workspaces
5	API client and hooks written	Typecheck still clean
6	Subjects CRUD works end to end	Can create PHY, confirm in table
7	Combinations CRUD works	Can create PCM with 3 subjects
8	Enrollments work	Can enroll a student, verify in DB
9	Grade grid renders and saves	Enter scores, see grade letters, save succeeds
10	Term lock/unlock works	Lock blocks save, unlock re-enables
11	Results page renders correctly	Ranking and result codes correct
12	Report card preview renders	Comments saveable, approval works
13	PDF generation works	PDF opens with correct data
14	Nav links resolve	All routes load without 404