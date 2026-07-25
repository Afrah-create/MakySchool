Good. I now have everything confirmed from official sources. Here is the prompt.

MakySchool — Traditional UACE A-Level Module: Complete Implementation Prompt
Grounding facts — burn these into every decision

These are confirmed UNEB rules. Do not deviate from them in any business logic you write.

Principal grade scale (A–F):

Grade	Points	Classification
A	6	Principal pass
B	5	Principal pass
C	4	Principal pass
D	3	Principal pass
E	2	Principal pass (minimum)
O	1	Subsidiary pass only
F	0	Fail

Subsidiary subjects (General Paper, Sub-Mathematics, ICT): graded pass/fail only. Any grade from D1 through P8 = 1 point. F9 = 0 points.

Point totals: 3 principal subjects × max 6 = 18. GP (1) + Sub-Maths or ICT (1) = 2. Grand maximum = 20.

Result codes:

Result 1 — UACE certificate awarded. Requires at least 2 principal passes (grades A–E) across the best 3 principal subjects.
Result 2 — Partial results. Fewer than 2 principal passes. No full certificate.
Result 6 — Absent/incomplete. Not graded.

Scope of this system: This is a termly internal grading tool for schools, not UNEB certification. Teachers enter scores per subject per student per term. The system computes letter grades, points, totals, and result codes for internal progress tracking and term report cards. Schools will use UNEB's official results for final certification. Do not over-engineer toward UNEB certification machinery.

No CA weighting at A-Level. Unlike O-Level (20% CA + 80% end-of-cycle), the traditional A-Level is 100% exam-based. Do not add CA percentage splits. The score a teacher enters is the full mark for that assessment period.

Architecture rules — match existing codebase exactly
Auth: TenantCtx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)], unpacked as school_id, actor = ctx. Role from actor["role"], user ID from uuid.UUID(str(actor["sub"])).
DB: conn: asyncpg.Connection = Depends(get_db)
Responses: always {"data": ...}. Errors: {"error": "...", "code": "..."}
Router registration: mount_v1_and_legacy(app, alevel_router, "/api/schools/alevel") in main.py
Role checks: inline if actor["role"] not in (...) — no decorator
Bulk SQL: always use unnest-based single-statement inserts — never loop individual inserts
Migration number: check the highest existing migration number first and use the next available one — do not assume it is 039
Shared types: add to packages/shared/src/types/ and export from the index
Frontend route group: apps/web/src/app/(school-admin)/dashboard/alevel/
Nav: add to school-admin-nav.ts under Academic group
Step 0 — Mandatory inventory

Read and report the contents of each before writing a single line:

All files in apps/api/migrations/ — report highest number
apps/api/app/routers/ — list all files, confirm no alevel.py exists
packages/shared/src/types/index.ts — note all current exports
apps/web/src/lib/roles/school-admin-nav.ts — note the Academic group structure
apps/web/src/app/(school-admin)/dashboard/ — list existing route folders
apps/api/main.py — find where school routers are mounted, note the last one

Do not proceed until all six are reported.

Step 1 — Migration

Create the migration file at the next available number (confirmed from inventory).

The schema needs these tables — all scoped to school_id for multi-tenancy:

alevel_subjects — the school's A-Level subject catalogue. Columns: id, school_id, name, code (e.g. "PHY", "HIST"), subject_type (enum: principal, subsidiary), is_gp (boolean — marks General Paper specifically), is_active, created_at, updated_at. Unique constraint on (school_id, code).

alevel_combinations — named subject combinations (e.g. PCM, HEL). Columns: id, school_id, name (e.g. "PCM"), label (e.g. "Physics, Chemistry, Mathematics"), category (enum: science, arts, business, technical), is_active, created_at. Unique on (school_id, name).

alevel_combination_subjects — junction linking combinations to their principal subjects. Columns: id, combination_id, subject_id, school_id. A combination has exactly 3 principal subjects. Unique on (combination_id, subject_id).

alevel_enrollments — links a student to a combination for an academic year. Columns: id, school_id, student_id (FK → students), combination_id (FK → alevel_combinations), academic_year_id (FK → academic_years), subsidiary_subject_id (FK → alevel_subjects — the Sub-Maths or ICT choice), class_id (FK → school_classes), is_active, created_at. Unique on (school_id, student_id, academic_year_id) — one enrollment per student per year.

alevel_grades — the core score entry table. Columns: id, school_id, student_id (FK → students), subject_id (FK → alevel_subjects), term_id (FK → terms), academic_year_id (FK → academic_years), class_id (FK → school_classes), raw_score (numeric 5,2, nullable — the mark entered by teacher), grade (text, nullable — computed A/B/C/D/E/O/F), points (smallint, nullable — computed from grade), entered_by (FK → users), entered_at, updated_at. Unique on (school_id, student_id, subject_id, term_id) — one grade per student per subject per term.

Add indexes on: (school_id, class_id, term_id) for class-level queries, (school_id, student_id, academic_year_id) for student report queries.

No RLS — tenant isolation is handled at the API layer via school_id filters on every query, consistent with the rest of the codebase.

Step 2 — Business logic library

Create apps/api/app/lib/alevel.py. This file contains pure functions with no DB calls — it is imported by the router.

Grade boundaries — a teacher enters a raw percentage score (0–100). The system computes the letter grade using these UNEB-aligned bands for principal subjects:

Score range	Grade	Points
80–100	A	6
70–79	B	5
60–69	C	4
50–59	D	3
40–49	E	2
35–39	O	1
0–34	F	0

For subsidiary subjects (GP, Sub-Maths, ICT): any score ≥ 35 = pass (1 point), below 35 = fail (0 points). The grade stored is either "P" (pass) or "F" (fail) for subsidiaries.

Functions to implement:

compute_grade(score: float, subject_type: str) -> tuple[str, int] — returns (grade_letter, points) given a raw score and whether the subject is principal or subsidiary.

compute_student_totals(grades: list[dict]) -> dict — receives a list of grade dicts, each containing subject_type, grade, points, is_gp. Returns: best_principal_points (sum of top 3 principal points), gp_points (0 or 1), subsidiary_points (0 or 1, from Sub-Maths or ICT), total_points (sum of all three), principal_pass_count (count of principal subjects with grade A–E), result_code (string "1", "2", or "6").

compute_result_code(principal_pass_count: int) -> str — returns "1" if 2 or more principal passes, "2" if 1 principal pass, "6" if 0.

Note on score bands: These are standard internal bands. UNEB's actual paper-by-paper award rules (e.g. "at worst C3 in one paper with distinctions in remaining three") apply to multi-paper subjects at the national exam level — your system receives a single term mark per subject, so compute from the single score only. Make the score bands configurable at the top of the file as a module-level constant so they can be adjusted without touching logic.

Step 3 — Backend router

Create apps/api/app/routers/alevel.py. Register it in main.py immediately after the timetable or analytics mount, following the existing pattern.

Subjects endpoints

GET /alevel/subjects — list all A-Level subjects for the school. Filter by optional subject_type query param. Allowed roles: admin, head_teacher, teacher.

POST /alevel/subjects — create a subject. Body: name, code, subject_type, is_gp. Validates code uniqueness within school. Allowed: admin only.

PATCH /alevel/subjects/{id} — update name, code, is_active. Allowed: admin only.

Combinations endpoints

GET /alevel/combinations — list combinations with their principal subjects expanded (join through junction table). Allowed: admin, head_teacher, teacher.

POST /alevel/combinations — create combination. Body: name, label, category, and a list of exactly 3 principal subject IDs. Validates all 3 subjects exist and are type principal. Allowed: admin only.

PATCH /alevel/combinations/{id} — update name, label, category, is_active, subject list. Allowed: admin only.

Enrollments endpoints

GET /alevel/enrollments — list enrollments with student name, combination name, subsidiary subject, academic year. Filter by optional class_id, academic_year_id. Allowed: admin, head_teacher.

POST /alevel/enrollments — enroll a student. Body: student_id, combination_id, academic_year_id, subsidiary_subject_id, class_id. Validates: student exists in school, combination exists, subsidiary subject is type subsidiary and not GP, no duplicate enrollment for that student+year. Allowed: admin only.

PATCH /alevel/enrollments/{id} — update combination, subsidiary subject, or is_active. Allowed: admin only.

POST /alevel/enrollments/bulk — enroll multiple students at once using unnest. Body: list of enrollment objects, all sharing the same academic_year_id and class_id. Validates uniqueness before inserting. Allowed: admin only.

Grade entry endpoints

GET /alevel/grades — fetch grades for a class in a term. Required query params: class_id, term_id. Returns a student × subject grid: list of students, each with their grades per subject including raw_score, grade letter, and points. Subjects are the union of their enrolled combination's principals + GP + their subsidiary. Allowed: admin, head_teacher, teacher (teachers see only classes they are assigned to via teacher_class_assignments).

POST /alevel/grades/bulk — bulk upsert grades for a class-term. Body: class_id, term_id, academic_year_id, and a list of entries each with student_id, subject_id, raw_score. For each entry, call compute_grade() from alevel.py and store the computed grade and points alongside the raw score. Use a single unnest-based INSERT ... ON CONFLICT DO UPDATE. Allowed: teacher (for their assigned classes only), admin.

GET /alevel/grades/student/{student_id} — full grade history for one student across all terms in an academic year. Query param: academic_year_id. Returns grades grouped by term, with totals computed by compute_student_totals(). Allowed: admin, head_teacher, teacher.

Results/summary endpoint

GET /alevel/results — term-level summary for a class. Required: class_id, term_id, academic_year_id. Returns one row per student: name, combination, total points, principal pass count, result code. Sorted by total points descending (class ranking). Allowed: admin, head_teacher.

Step 4 — Shared types

Add packages/shared/src/types/alevel.ts. Export from the shared index.

Types needed:

ALevelSubjectType — union of 'principal' | 'subsidiary'
ALevelSubject — id, schoolId, name, code, subjectType, isGp, isActive
ALevelCombination — id, schoolId, name, label, category, isActive, principals (array of ALevelSubject)
ALevelEnrollment — id, studentId, studentName, combinationId, combinationName, subsidiarySubjectId, subsidiarySubjectName, academicYearId, classId, isActive
ALevelGradeEntry — studentId, subjectId, rawScore (number | null), grade (string | null), points (number | null)
ALevelStudentGradeRow — studentId, studentName, learnerId, grades (record of subjectId → ALevelGradeEntry)
ALevelClassGradeResponse — classId, termId, subjects (array of ALevelSubject), students (array of ALevelStudentGradeRow)
ALevelStudentResult — studentId, studentName, combinationName, totalPoints, principalPassCount, resultCode, rank
ALevelResultsResponse — classId, termId, students (array of ALevelStudentResult)
BulkGradeEntry — studentId, subjectId, rawScore
BulkGradePayload — classId, termId, academicYearId, entries (array of BulkGradeEntry)
Step 5 — API client and hooks

Create apps/web/src/lib/api/alevel.ts. Follow the exact same pattern as the existing attendance.ts client file.

Functions: getSubjects(params?), createSubject(body), updateSubject(id, body), getCombinations(), createCombination(body), updateCombination(id, body), getEnrollments(params?), createEnrollment(body), bulkEnroll(body), getClassGrades(classId, termId), saveGradesBulk(payload), getStudentGrades(studentId, academicYearId), getResults(classId, termId, academicYearId).

Create apps/web/src/hooks/useALevel.ts. One useQuery hook per GET function, one useMutation per write function. Query keys must be structured as ['alevel', resource, ...params]. All mutations must invalidate the relevant query keys on success. Use placeholderData: keepPreviousData on the class grades query so the grid does not flash when switching classes or terms.

Step 6 — Frontend pages

All pages live under apps/web/src/app/(school-admin)/dashboard/alevel/. Allowed roles: admin, head_teacher. All pages use the (school-admin) layout — do not create a new layout wrapper.

Setup pages — /dashboard/alevel/setup/

These are one-time configuration pages. Accessible only to admin role.

Subjects page (/dashboard/alevel/setup/subjects): A table listing all A-Level subjects with name, code, type badge (Principal / Subsidiary), GP flag, and active toggle. Add subject button opens a slide-over form with name, code, subject type selector, and GP checkbox (only enabled when type is Subsidiary). Editing opens same form pre-filled.

Combinations page (/dashboard/alevel/setup/combinations): A table listing combinations with name, label, category badge, and the 3 principal subjects listed inline. Add combination button opens a form with name, label, category dropdown, and a multi-select of exactly 3 principal subjects (disable subjects already at 3 — show error if user tries to submit with ≠ 3). Show a pill for each selected subject.

Enrollments page (/dashboard/alevel/setup/enrollments): Filter by class and academic year. Table shows student name, learner ID, combination, subsidiary subject, and an active toggle. Bulk enroll button opens a slide-over: select class, academic year, combination, subsidiary subject, then a multi-select checklist of students in that class not yet enrolled. Submit calls the bulk endpoint.

Grade entry page — /dashboard/alevel/grades

This is the primary daily-use page for academic staff.

Controls: class selector, term selector, academic year selector. These three determine what data loads.

Grade grid: A spreadsheet-style table. Rows = students (sorted by name). Columns = subjects (principals from their combination + GP + subsidiary). Each cell contains a number input (0–100). Below the score, show the computed grade letter and points in small muted text — compute this live on the client using the same grade boundary logic so teachers see immediate feedback without saving.

While loading: show a skeleton grid matching the expected dimensions. If no students are enrolled in A-Level for this class, show an empty state with a link to the enrollments setup page.

Saving: A single "Save Grades" button at the bottom. On click, collect all score entries into the bulk payload and POST in one call. Show a spinner on the button. On success, invalidate and refetch. On error, show a toast with the error message.

Performance note: The grid may have 60 students × 5 subjects = 300 cells. Do not use individual controlled inputs with individual state keys — store all scores in a single flat object keyed by ${studentId}:${subjectId}. Build the payload in one Object.entries() pass immediately before the API call.

Results page — /dashboard/alevel/results

Controls: class selector, term selector, academic year selector.

A ranked table showing: rank (#), student name, learner ID, combination name, points per principal subject (columns), GP points, subsidiary points, total points, principal pass count, and result code badge. Result code 1 = emerald badge "Certificate". Result code 2 = amber badge "Partial". Result code 6 = muted badge "Incomplete".

Include a summary row at the bottom: class average total points, percentage with result code 1 (full certificate), percentage with at least 2 principal passes.

Loading: skeleton rows. Empty: "No results recorded for this class and term yet."

Export button: downloads the results table as CSV. Build the CSV on the client from the query data — no backend endpoint needed for this.

Navigation

In school-admin-nav.ts, add an "A-Level" group (or add items to the existing Academic group — check what exists) with these links: Setup → Subjects, Setup → Combinations, Setup → Enrollments, Grades, Results. Use BookOpen or GraduationCap from lucide-react for the group icon, matching the style of existing groups.

Step 7 — Seed data (development only)

Create apps/api/app/db/seed_alevel.py — a standalone script, not run on startup, that inserts a standard set of A-Level subjects and combinations for the development tenant. This is for testing only. Include:

Subjects: Physics (PHY), Chemistry (CHE), Mathematics (MAT), Biology (BIO), Geography (GEO), History (HIST), Economics (ECO), Literature in English (LIT), Entrepreneurship (ENT), Divinity (DIV), General Paper (GP, subsidiary, is_gp=true), Subsidiary Mathematics (SMA, subsidiary), ICT/Computer Studies (ICT, subsidiary).

Combinations: PCM (Physics, Chemistry, Mathematics — science), PCB (Physics, Chemistry, Biology — science), HEL (History, Economics, Literature — arts), HEG (History, Economics, Geography — arts), ECG (Economics, Chemistry, Geography — business).

Delivery order

Complete and verify each step before moving to the next:

Migration — run it, confirm clean
alevel.py lib — write unit tests for compute_grade and compute_student_totals inline as doctest or a test file; confirm all grade boundaries correct
Router — restart API, confirm all routes appear in /api/docs
Shared types — npm run typecheck passes
API client and hooks — typecheck passes
Setup pages — subjects and combinations CRUD works end to end
Enrollments page — bulk enrollment works
Grades page — grid renders, saves correctly, live grade preview works
Results page — ranking correct, result codes correct, CSV export works
Nav — all links resolve
Conventions — enforce throughout
Never use Record<K, V> in TSX files — use { [K in Type]: V } mapped types
Never loop DB inserts — always unnest bulk
All SQL uses parameterized queries — no string interpolation of user input
isPending not isLoading (React Query v5)
Skeleton placeholders matching final layout shape — never blank content areas
Every new endpoint follows the {"data": ...} response shape
Role checks inline with actor["role"] comparisons
Do not modify the existing grading_scales table — it belongs to O-Level