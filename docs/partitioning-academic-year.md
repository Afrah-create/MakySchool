# Partition prep runbook (Phase 5) — do not run unattended

High-volume tables prepared with `academic_year_id` (migration 064):

- `attendance`
- `fee_payments`

Earlier year-scoped tables (062+): `teacher_class_assignments`, fee structures dual-write, timetable rows, class history.

## Goal

Zero-downtime conversion of hot tables to declarative partitioning by `academic_year_id` (or year RANGE), so current-year queries prune partitions.

## Safe procedure (per table)

1. **Inventory** — row counts, FK dependents, indexes, and max downtime budget.
2. **Create** `*_partitioned` parent + one partition per existing `academic_years` row (+ `DEFAULT` partition for null/orphan years).
3. **Batch copy** — `INSERT … SELECT` in chunks of 10k–50k ordered by primary key; verify counts and checksum samples.
4. **Dual-write trigger** — AFTER INSERT/UPDATE/DELETE on the live table mirrors to the partitioned table until cutover.
5. **Swap** — in one transaction: rename live → `*_legacy`, rename partitioned → live name; recreate FKs/views; drop dual-write trigger.
6. **Validate** — `EXPLAIN (ANALYZE, BUFFERS)` on current-year attendance/fee queries must show only the current partition scanned.
7. **Hold** `*_legacy` for one retention cycle, then drop after backup confirmation.

## Rollover integration (after swap)

When creating a new academic year, create the matching partition:

```sql
CREATE TABLE attendance_y_<year_id_short>
  PARTITION OF attendance FOR VALUES IN ('<academic_year_uuid>');
```

Wire this into year creation / rollover commit only after the live table is partitioned.

## Explicit non-goals for now

- Do **not** swap production tables without a rehearsal on a restored snapshot.
- Do **not** partition inside a multi-hour lock or under peak exam/fee traffic.
- Matviews (065) already provide multi-year analytics without requiring partitions.

## Rollback

Keep `*_legacy` until verification. Re-swap names and restore FKs if partition pruning or dual-write drift is detected.
