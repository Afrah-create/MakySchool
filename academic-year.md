Read this entire document before planning anything

You are implementing a year-end academic rollover system and long-term performance strategy for MakySchool. This is not a single feature — it is a collection of interdependent systems that must be built in a specific sequence. Your first task is to audit the codebase and produce a phased implementation plan. Do not write any implementation code until the plan is approved.

Step 0 — Mandatory codebase audit before planning

Read every one of the following and report findings before producing the plan:

Database layer — read every migration file in apps/api/migrations/ and answer:

Does teacher_class_assignments have an academic_year_id column? If not, flag it — this is a critical gap
Does timetable_periods have an academic_year_id column or is it only scoped by term_id?
Does fee_structures have a year column — is it academic_year (integer) or academic_year_id (UUID FK)?
Do students have graduation_year and graduation_class columns?
Does any table store data without either term_id or academic_year_id scoping — if so list them
What is the current highest migration number?

Backend — read these files in full:

apps/api/app/routers/students.py — note how student class assignment and promotion currently works if at all
apps/api/app/routers/classes.py — note how classes and streams are managed
apps/api/app/routers/fees.py — note how fee structures are created and whether any copy/rollover logic exists
apps/api/app/routers/timetable.py — note the full timetable data model
apps/api/app/routers/teachers.py — note how teacher assignments are stored and queried
apps/api/app/routers/overview.py — note what the dashboard analytics currently compute and how

Frontend — read these files:

apps/web/src/app/(school-admin)/dashboard/ — list every route folder and page
apps/web/src/lib/roles/school-admin-nav.ts — note the full navigation structure
apps/web/src/app/(school-admin)/dashboard/settings/ — list all settings pages

Shared — read:

packages/shared/src/types/index.ts — list all exported types
packages/shared/src/constants/rbac.ts — list all permission actions

Report all discrepancies — any table referenced in a router that does not exist in migrations, any column used in a query that is not in the schema, any frontend page that calls an endpoint that does not exist. These must be resolved before planning begins.

What this system is and why it matters

MakySchool will be used by schools for many years. Without a proper year-end system, at the end of each academic year administrators face a painful manual process: re-entering all class structures, reassigning all teachers, recreating all fee structures, manually moving every student to their new class, and setting up the timetable from scratch. This takes days and introduces errors.

The solution has two parts that must be built together:

Part 1 — Year-end rollover system: A guided wizard that carries forward all configuration from the previous year and handles student promotion, graduation, and repetition automatically. Admins make decisions once and the system does the work.

Part 2 — Long-term performance architecture: Database and application changes that ensure the system remains fast and reliable as data accumulates over many years without ever deleting historical records.

Both parts are non-destructive. Historical data is never deleted. Old records are preserved exactly as they were. New year data is created in new rows linked to the new academic year.

Part 1 — Year-end rollover system
What the rollover does

The rollover takes all configuration from year N and creates equivalent configuration for year N+1. It then moves students to their new classes based on their results and admin decisions. It does this in a single guided wizard with six steps, all committed in one database transaction at the end.

The six rollover steps in detail

Step 1 — Create new academic year and terms

The admin inputs the new year number. The system pre-fills three term date ranges by taking last year's term dates and adding exactly 52 weeks. Admin adjusts the dates if needed. On confirm, the system creates one academic_years row and three terms rows.

This is the foundation everything else depends on. Nothing in steps 2–6 can run without the new academic year existing first.

Step 2 — Student promotion decisions

This is the most complex step. The system analyses every currently active student and makes a provisional promotion decision for each one based on their academic results and the curriculum's promotion rules.

Three possible outcomes per student:

Promoted — student moves to the next class level (S1 → S2, S2 → S3, etc.)
Repeated — student stays in the same class for another year
Graduated — student has completed S4 (O-Level) or S6 (A-Level) and leaves the school's active rolls

The system shows a preview table with every student, their current class, their proposed outcome, and the reason. Admin can override any individual decision before confirming. Bulk actions: "Approve all promotions", "Override selected to repeat".

On confirm, the system:

Creates new student_class_history rows for promoted students linking them to their new class in the new year
Updates students.current_class_id for each student
For graduated students, sets a graduation status without deleting the student record
Does not touch any historical records from the previous year

Step 3 — Roll forward teacher assignments

All teacher-to-class-to-subject assignments from the current year are shown in a review table. Because classes shift (S1A becomes S2A, S2B becomes S3B), the system must intelligently map old class assignments to their equivalent new-year classes.

The mapping logic: for each teacher assignment where the class level increases by one, find the corresponding class at the new level with the same stream letter. Example: teacher assigned to S2A for Mathematics becomes assigned to S3A for Mathematics in the new year.

Admin reviews this mapping and can:

Approve individual assignments
Remove assignments for teachers who have left
Add new assignments for new teachers
Change subject assignments

On confirm, new teacher_class_assignments rows are created for the new academic year. Old rows are preserved.

Step 4 — Roll forward fee structures

All active fee structures from the current year are shown with their line items and totals. Admin can:

Keep amounts the same
Apply a percentage increase to all items at once (e.g. "increase all fees by 10%")
Edit individual item amounts
Add new line items
Remove line items that no longer apply

The system creates new fee_structures rows with new fee_structure_items for the new academic year. The old year's structures are preserved and locked.

Step 5 — Roll forward timetable

The full timetable from the current term (or the most recently completed term) is shown. Because classes have shifted levels, the system maps old class timetable slots to their new-year equivalents using the same level-shift logic as teacher assignments.

Admin reviews and confirms. New timetable_periods rows are created for the first term of the new year. Admin can modify the timetable in detail after the rollover via the existing timetable management interface.

Step 6 — Review and confirm

A summary screen showing exactly what will be created:

New academic year: [name]
Students promoted: N
Students repeated: N
Students graduated: N
Teacher assignments created: N
Fee structures created: N with M total line items
Timetable periods created: N

A single "Confirm and start new year" button. This triggers a single database transaction that commits all of the above atomically. If any part fails, nothing is committed and the admin sees an error with the specific failure reason.

After successful commit, a rollover log entry is written recording who performed the rollover, when, and all counts.

What the rollover does NOT do
Does not delete any historical data
Does not modify any records from the previous year
Does not automatically re-enroll students in O-Level or A-Level curriculum — that is done separately in those modules after the rollover
Does not generate new invoices — fee structures are created but invoice generation for the new year happens when the bursar is ready, following the existing assign flow
Does not lock the previous year — previous year data remains fully readable and reportable
Part 2 — Long-term performance architecture
Problem statement

As MakySchool accumulates years of data, these tables will grow very large:

attendance — potentially millions of rows (students × school days × periods)
olevel_marks — hundreds of thousands of rows per year
fee_payments — tens of thousands per year
olevel_subject_results and olevel_student_results — thousands per year

Without architectural preparation, queries will slow down as data accumulates even with good indexes. The solution is a combination of partitioning, materialized views, and query optimisation — all implemented proactively before the data becomes large.

Academic year scoping audit and fixes

Before any performance work, every table that stores transactional data must be scoped to an academic year. This means having either a direct academic_year_id FK column or a chain of FKs that reaches an academic year (e.g. via term_id → terms.academic_year_id).

Based on the audit in Step 0, identify and fix any tables that lack year scoping. The fix is always additive — add the column, backfill it from the related term or structure, never delete data.

If teacher_class_assignments lacks academic_year_id, this is a critical fix that must happen before the rollover system is built, because the rollover depends on being able to create year-scoped assignments.

Table partitioning

The four high-volume tables (attendance, olevel_marks, fee_payments, olevel_subject_results) must be converted to partitioned tables using PostgreSQL's declarative partitioning by academic_year_id.

The approach:

Create a new partitioned version of each table
Copy existing data into the correct partition
Swap the table name atomically
Create partitions for the current year and all future years as part of the year-start rollover

Each new academic year created via the rollover wizard automatically creates the corresponding partitions on these four tables. This is done in the same transaction as the academic year record creation.

The benefit: queries for the current year scan only the current year's partition regardless of how many years of historical data exist. A query for this term's attendance does not touch 5 years of historical attendance data.

Materialized views for dashboard analytics

The school admin dashboard currently computes analytics by running aggregation queries against raw tables. As data grows, these queries become slow. Replace them with materialized views that are computed once and cached.

Three materialized views to create:

mv_school_annual_summary — one row per school per academic year. Contains: enrolled student count, average academic performance (from olevel_student_results), fee collection rate (from fee_payments vs student_fee_accounts), average attendance rate (from attendance). Refreshed nightly via a background job and also on-demand when admin opens the dashboard.

mv_class_term_summary — one row per class per term. Contains: student count, marks submission completion rate, average subject performance, fee collection rate for that class. Used by the class-level analytics views.

mv_subject_performance_trend — one row per subject per term per class. Contains: average score, pass rate, grade distribution. Used by the subject analytics charts. Allows the system to show multi-year performance trends without running complex queries.

Each materialized view has a corresponding REFRESH MATERIALIZED VIEW CONCURRENTLY call that runs:

Nightly via a scheduled background job (implement using Python's asyncio scheduled tasks within the existing FastAPI lifespan, not an external cron)
On-demand via an admin endpoint POST /api/schools/analytics/refresh
Automatically after bulk mark entry, bulk fee payment recording, or bulk attendance submission
Query optimisation for the current codebase

Independent of partitioning, several query patterns in the existing routers need optimisation before data grows. Cursor should identify these during the audit and flag them in the plan:

Things to look for:

Any endpoint that runs N+1 queries (one query per student in a loop)
Any dashboard query that does a full table scan without using indexes
Any analytics query that recomputes the same aggregation on every request
Any query that joins more than 4 tables without intermediate materialisation

For each one found, the plan should describe the specific optimisation — replacing loops with unnest, adding missing indexes, moving heavy computation to the materialized views.

Connection pooling verification

Verify that the DATABASE_URL in the production .env uses Supabase's connection pooler endpoint (port 6543, transaction mode) rather than the direct PostgreSQL connection (port 5432). If it uses port 5432, flag this as a critical production issue — as concurrent school count grows, direct connections will exhaust PostgreSQL's connection limit and cause outages.

Document the correct connection string format in apps/api/README.md.

Data retention settings

Add a school-level configuration table that controls how historical data is presented in the UI. This does not delete data — it controls UI visibility:

Active years — shown everywhere in the UI as normal
Reference years — shown in dedicated "History" views, not in primary navigation
Archive years — accessible only via explicit search, clearly labelled as archived

Default settings: current year and previous 2 years are active, years 3–5 are reference, years 6+ are archive. Schools can adjust these thresholds.

The UI already shows class selectors, term selectors, and student lists throughout the app. These selectors must respect the retention settings — they default to the current year and require explicit navigation to access historical data. This prevents accidental modification of historical records and keeps the UI uncluttered.

New migration requirements

Based on the above, the following migrations are needed. Cursor determines the exact numbers after the audit:

Migration A — Academic year scoping fixes
Adds academic_year_id to any tables identified in the audit as missing it. Backfills from related term records. This migration must be verified before any other migration in this set.

Migration B — Rollover infrastructure
Creates academic_year_rollover_log table. Adds graduation_year and graduation_class to students if not already present. Adds any student status columns needed for tracking graduated vs active vs transferred students.

Migration C — Data retention settings
Creates school_data_retention_settings table with school_id PK, hot_years, warm_years, archive_after_years columns and sensible defaults.

Migration D — Partitioning
Converts the four high-volume tables to partitioned tables. This is the most complex migration and must be done carefully — it involves creating new partitioned tables, migrating data, and swapping table names. Must be done in a maintenance window or with zero-downtime migration technique (create new, copy data, swap, drop old).

Migration E — Materialized views
Creates the three materialized views with their refresh functions. These are the last to be created since they depend on all other migrations being complete.

New API endpoints required
Rollover endpoints (admin only)

GET /api/schools/rollover/preview — Returns a full preview of what a rollover would do without committing anything. Shows student promotion decisions, teacher assignment mappings, fee structure copies, timetable copy counts. This is what the wizard reads at each step.

POST /api/schools/rollover/student-decisions — Admin submits their student promotion decisions (promote, repeat, graduate per student). Stored temporarily in a rollover session table until the final commit.

POST /api/schools/rollover/execute — Executes the full rollover in a single transaction using the decisions stored in the session. Returns success with counts or failure with the specific error.

GET /api/schools/rollover/history — Lists all previous rollovers with their audit logs.

Analytics endpoints

POST /api/schools/analytics/refresh — Manually triggers a refresh of all materialized views for this school. Admin only. Returns time taken.

GET /api/schools/analytics/annual-summary — Reads from mv_school_annual_summary. Returns multi-year trend data for the admin dashboard.

GET /api/schools/analytics/class-trends — Reads from mv_class_term_summary. Returns class-level performance over multiple terms.

Settings endpoints

GET /api/schools/settings/data-retention — Returns current retention settings.

PATCH /api/schools/settings/data-retention — Updates retention settings. Admin only.

New frontend pages and components required
Rollover wizard — /dashboard/settings/year-rollover

A multi-step full-page wizard. Not a slide-over — this is a significant operation that deserves full-page real estate.

Step indicator at the top showing all 6 steps. Each step has a back button (does not undo DB changes since nothing is committed until step 6). Each step shows a loading skeleton while data is fetching, a clear data table or form in the active state, and validation errors inline.

The wizard must be interruptible — if the admin closes it mid-way, their decisions are saved in local state (or a server-side session) so they can resume. Show a "Resume rollover" banner on the dashboard if a rollover is in progress.

Multi-year dashboard analytics — extend /dashboard

Extend the existing dashboard to show multi-year trend charts reading from the materialized views. Add a year selector that allows admin to compare the current year against previous years. Charts needed:

Enrollment trend (students per year as a bar chart)
Fee collection rate trend (percentage per year as a line chart)
Academic performance trend (average score per year per subject grouping)
Attendance rate trend (average per year)

These charts read from mv_school_annual_summary and render with recharts following the existing chart patterns in the codebase.

Archive access — /dashboard/archive

A dedicated page for accessing data from reference and archive years. Clearly labelled "Historical Records". Year selector showing all years beyond the active threshold. Read-only views of students, results, attendance, and fees for selected historical year. No edit actions available on archived data.

Data retention settings — /dashboard/settings/data-retention

A simple settings page with sliders or number inputs for the three retention thresholds. Preview of which years fall into which category based on current settings. Save button.

Phasing recommendation for Cursor to follow

Cursor must implement this in exactly this sequence. Do not start a later phase until the earlier phase is verified working end to end.

**Status (Aug 2026):** Phases 1–4 and Phase 6 (retention/archive UI) are implemented end-to-end. Phase 5 (live table partition swap) is prepared only — year columns + indexes exist; follow `docs/partitioning-academic-year.md` for a rehearsed zero-downtime cutover. Do not swap production tables without a snapshot rehearsal.

Phase 1 — Foundation fixes (implement first, everything else depends on this)

Academic year scoping audit and fixes. Add academic_year_id to any tables missing it. Verify teacher_class_assignments is properly year-scoped. Write the rollover log migration. Add graduation fields to students. Verify the production database connection uses the pooled endpoint. This phase has no frontend changes — it is purely backend and database.

Done when: every transactional table has verified academic year scoping. All migrations run cleanly on a populated database.

Phase 2 — Student promotion and graduation system

The promotion preview endpoint and the student status tracking system. No full rollover yet — just the ability to look at a year's results and produce a list of promotion decisions. The frontend for this phase is a standalone student promotion page under settings, not yet the full wizard.

Done when: admin can view a promotion preview for the current year's students, override individual decisions, and confirm — which updates student class assignments and creates class history records for the new year.

Phase 3 — Full rollover wizard

All six rollover steps combined into the wizard UI. The teacher assignment rollover, fee structure rollover, and timetable rollover backend endpoints. The atomic commit transaction. The rollover audit log.

Done when: a complete year-end rollover can be performed from start to finish via the wizard. All historical data from the previous year remains intact and queryable.

Phase 4 — Materialized views and dashboard analytics

Create the three materialized views. Add the refresh background job. Extend the dashboard with multi-year trend charts. Add the manual refresh endpoint.

Done when: the dashboard loads historical trend data from materialized views. Refreshing takes under 5 seconds for a school with 3 years of data.

Phase 5 — Table partitioning

Convert the four high-volume tables to partitioned tables. This is the most operationally risky phase and must be done with a tested rollback plan. The rollover wizard is updated to create new partitions as part of year creation.

Done when: the four tables are partitioned. EXPLAIN ANALYZE on a current-year attendance query shows partition pruning — it scans only the current year's partition.

Phase 6 — Data retention UI and archive access

Data retention settings page. Archive access page. Update all class/term/student selectors across the app to respect retention settings and default to the current active year.

Done when: selectors throughout the app default to the current year. Historical data is accessible via the dedicated archive page. Admin can configure retention thresholds.

Constraints that apply throughout all phases

Never delete historical data. Every migration is additive only. If a rollback is needed it adds compensating rows, not deletions.

Every new table has school_id for multi-tenancy. Every query filters by school_id from TenantCtx, never from the request body.

Bulk operations use unnest. No Python loops that make individual DB calls per student or per record.

The rollover transaction is atomic. Either everything for the new year is created or nothing is. Partial rollovers that leave the database in an inconsistent state are not acceptable.

The wizard is interruptible but the final commit is not. Once the admin clicks confirm on step 6, the transaction runs to completion or rolls back completely — there is no pause midway through execution.

Materialized view refreshes use CONCURRENTLY so they do not lock the tables during refresh. This means the view must have a unique index — create one on each view.

Partition migration must be zero-downtime. The technique is: create new partitioned table with a different name, copy data in batches, create a trigger on the old table to dual-write, swap names atomically, remove the trigger. Do not take the API offline.

All new frontend pages follow the existing patterns: skeleton loading states, empty states, error states. No blank content areas while loading.

The rollover wizard must show a clear warning before step 6: "This action cannot be undone. The new academic year will be created and students will be moved to their new classes. Historical data from the previous year will not be affected."