You are a senior full-stack engineer working on MakySchool. Before writing a single line of code, you must thoroughly audit the existing fees implementation and produce a detailed, repo-specific implementation plan. Do not implement anything yet. The output of this task is a plan document only.

Step 1 — Codebase audit

Read every one of the following and report your findings in full:

Database layer

Read all migration files in apps/api/migrations/ that contain the word "fee" in their filename or content. For each one, report: the migration number, what tables it creates or modifies, every column on those tables including types and constraints, and every foreign key relationship. Pay specific attention to fee_structures, student_fee_accounts, fee_payments, invoices, and invoice_items.

Backend

Read apps/api/app/routers/fees.py in full. For every endpoint, report: HTTP method, path, what query params or body it accepts, what SQL it runs or what logic it executes, what it returns, and which roles are allowed. Note whether any endpoint currently creates or reads a fee_structures row, and what columns it writes.

Read apps/api/app/lib/ and report any fee-related helper files found there and what they contain.

Shared types

Read packages/shared/src/types/ and report every type related to fees — field names, field types, and which API responses they map to.

Frontend

List every file under apps/web/src/app/(school-admin)/dashboard/fees/ and apps/web/src/(bursar)/. Read each page file and component file found. For each, report: what data it fetches, what form fields it renders, what API endpoints it calls, and what the user flow is.

Read apps/web/src/lib/api/fees.ts and apps/web/src/hooks/useFees.ts (or equivalent filenames — search if the names differ). Report every function and hook exported.

Read apps/web/src/lib/roles/school-admin-nav.ts and report where fees appears in the navigation.

Patterns to note

While reading, note the exact patterns used for: bulk SQL inserts, role checking, response shape, error shape, slide-over/modal form patterns in existing pages, how other multi-item forms work (if any exist — check invoices or any form with dynamic line items). These patterns must be replicated exactly in the implementation.

Step 2 — Gap analysis

After the audit, answer these questions explicitly based on what you found:

What columns does fee_structures currently have? Is there a single amount column or already a reference to items?
Does a fee_structure_items table (or equivalent) already exist in any migration?
Does invoice_items already exist? If yes, what columns does it have and is it currently being populated when invoices are generated?
When the admin creates a fee structure today, what exactly happens — what rows are written to which tables with what values?
When invoices are generated, what is the current logic — does it copy the single amount or does it already reference items?
Does the frontend fee structure form currently have any concept of line items, or is it a single amount input?
Are there any existing fee structure records in a seed file that would need to be migrated?
What is the next available migration number?
Is there any locking mechanism on fee structures once invoices are generated, or can the structure be freely edited at any time?
Do student_fee_accounts link to fee_structures directly, or to invoices, or both?
Step 3 — Produce the implementation plan

Based entirely on what you found in Steps 1 and 2, write a detailed implementation plan covering these areas. Every decision in the plan must reference something you actually found in the codebase — no assumptions, no greenfield designs.

Plan section A — Migration

Specify:

The exact migration filename and number
Whether fee_structure_items needs to be created from scratch or already partially exists
Every column needed on fee_structure_items with exact PostgreSQL types, constraints, and defaults — inferred from how similar tables in the schema are structured
Whether fee_structures.amount should be kept, deprecated, or made a computed value — and why, based on what queries currently read it
The backfill strategy for existing fee_structures rows — exactly what SQL inserts a default item row for each existing structure so no data is lost
Any indexes needed based on the query patterns you observed in the router
Whether any existing constraints need to change
Plan section B — Backend changes

Specify for each endpoint that needs to change or be added:

The exact HTTP method and path, matching the existing router's URL conventions exactly
What the request body or query params look like, with field names matching your shared type conventions
What SQL it runs — describe the logic precisely, referencing actual table and column names from the schema
What validation is needed and where (Pydantic model vs business logic check vs DB constraint)
What the response shape looks like, matching the {"data": ...} convention
Which roles are allowed, using the exact role strings found in the codebase
Whether any existing endpoints need to change their SQL to JOIN through fee_structure_items instead of reading fee_structures.amount directly

Specifically address:

Create fee structure (header only, no items yet)
Add item to structure
Edit item
Delete item (with lock check)
Reorder items
Get structure with items expanded
List structures for a class/term
Whether invoice generation needs to change and if so exactly how
Plan section C — Shared types

List every new or modified TypeScript type needed, with all field names and types written out. Reference existing type conventions found in the shared package.

Plan section D — Frontend changes

For each page or component that needs to change or be created:

Exact file path
What it currently does (from your audit) vs what it needs to do
The user flow step by step
What form fields are needed
What API calls it makes
What loading, empty, and error states it needs, following the patterns found in existing pages

Specifically address:

The fee structure creation/edit form — how it transitions from a single amount input to a header + dynamic line items UI
The line items editor — how items are added, edited, reordered, and deleted inline
The lock behavior — what the UI shows once a structure has invoices generated against it
Whether the bursar view needs any changes to reflect multi-item structures on invoices and receipts
Plan section E — Data integrity rules

State explicitly:

When a fee structure is locked (no more item edits allowed) and what triggers the lock
What happens to existing student fee accounts if a structure's items are edited before locking
Whether optional items are in scope for this implementation or deferred
Whether different student categories (day/boarding) with different amounts are in scope or deferred
The exact behavior when invoice generation is triggered — which tables get rows, in what order, with what values derived from which source columns
Plan section F — Implementation order

List the exact sequence of steps, where each step has a clear done condition. The sequence must respect dependencies — for example, the migration must be verified before any backend code is written against it, and types must be verified before frontend code is written.

Output format

Structure your output as a markdown document with clear headings for each section. Under each heading, be specific and concrete — reference actual table names, column names, file paths, function names, and role strings found in the codebase. Do not use placeholder names. Do not describe what you would do if you found something — describe what the plan is based on what you actually found.

If you find anything ambiguous or contradictory in the existing code — for example, a column referenced in the router that does not exist in any migration, or a type that does not match the API response — flag it explicitly as a discrepancy and propose how to resolve it before implementationContext you must read before writing anything

You are implementing a fees module refinement for MakySchool. The audit has already been done and the plan is confirmed. Your job is to implement exactly what the plan describes — no new design decisions, no alternative approaches. Every pattern must match the existing codebase exactly.

Stack: FastAPI + asyncpg, PostgreSQL, Next.js 16, React 19, Tailwind CSS v4, TypeScript.

Auth pattern: TenantCtx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)], unpacked as school_id, actor = ctx. Use fees_actor_id(actor) from fees_shared.py for all write operations — not actor["sub"] directly. Role checks via _require_permission(actor, "manageFees") or "viewFees".

Response shape: Always {"data": ...}. Errors: {"error": "...", "code": "...", "fields": {...}}.

Bulk SQL: Always use unnest-based single-statement inserts — never loop individual inserts.

Money: All amounts are BIGINT UGX integers. Never floats.

Types location: apps/web/src/lib/fees/types.ts — not the shared package.

Frontend patterns: Use the existing AddInvoicePanel and AddOtherIncomePanel as the reference for dynamic line item forms. Use useApiSWR and apiClient — not React Query. Use @makyschool/ui Modal, Button, Input components. Money display via formatUGX, parsing via parseUGXInput.

Step 0 — Before touching any file

Confirm the following by reading the actual files:

Read apps/api/migrations/ — confirm the highest existing number and that 044_fee_structure_items.sql does not yet exist
Read apps/api/app/routers/fees.py — note the exact import of fees_actor_id and _require_permission and how they are called
Read apps/api/app/services/fees/invoices.py — note the exact signature of create_invoices_for_fee_structure and what arguments it currently receives
Read apps/api/app/routers/fees_shared.py — note every helper function exported
Read apps/web/src/lib/fees/types.ts — note the exact current shape of FeeStructure
Read apps/web/src/components/fees/AddInvoicePanel.tsx — note exactly how the dynamic line items array is managed in state and how the items are submitted
Read apps/web/src/components/fees/AddOtherIncomePanel.tsx — note the same
Read apps/web/src/components/fees/AddFeeStructurePanel.tsx — note the exact current form fields and submit logic
Read apps/web/src/components/fees/FeeStructuresContent.tsx — note what columns the table renders and what actions exist
Read apps/web/src/components/fees/AssignFeeStructureDialog.tsx — note the full current flow

Report what you find for each. Do not proceed until all ten are confirmed.

Step 1 — Migration

File: apps/api/migrations/044_fee_structure_items.sql

1a. Create the items table

Model this exactly on invoice_items and other_income_items from migration 027. The table must have:

id — UUID primary key, gen_random_uuid()
school_id — UUID NOT NULL, FK → schools ON DELETE CASCADE
fee_structure_id — UUID NOT NULL, FK → fee_structures ON DELETE CASCADE
account_id — UUID nullable, FK → accounts ON DELETE SET NULL
description — TEXT NOT NULL
amount — BIGINT NOT NULL CHECK (amount > 0)
sort_order — INT NOT NULL DEFAULT 0
is_optional — BOOLEAN NOT NULL DEFAULT false (stored, not used in v1 logic)
created_at — TIMESTAMPTZ DEFAULT now()
updated_at — TIMESTAMPTZ DEFAULT now()

Two indexes: one on (fee_structure_id), one on (school_id).

1b. Add lock columns to fee_structures
sql
ALTER TABLE fee_structures
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_reason TEXT;
1c. Backfill existing structures

For every existing fee_structures row that has amount > 0 and no matching rows in fee_structure_items, insert one item row using the structure's description as the item description (falling back to 'School fees' if description is null or empty). This must be idempotent — re-running must not create duplicates.

sql
INSERT INTO fee_structure_items
  (school_id, fee_structure_id, description, amount, sort_order)
SELECT
  fs.school_id,
  fs.id,
  COALESCE(NULLIF(TRIM(fs.description), ''), 'School fees'),
  fs.amount,
  0
FROM fee_structures fs
WHERE NOT EXISTS (
  SELECT 1 FROM fee_structure_items i
  WHERE i.fee_structure_id = fs.id
)
AND fs.amount > 0;
1d. Do not drop fee_structures.amount

Keep it as a maintained denormalized total. It is still read by list queries, assign, sync-accounts, and analytics. The application keeps it accurate after every item mutation.

Verify the migration runs cleanly on both an empty database and a database with existing fee structure rows before proceeding to Step 2.

Step 2 — Backend helpers
2a. New helpers in apps/api/app/routers/fees_shared.py

Add these three functions. Do not modify existing functions in this file.

async def structure_is_locked(conn, structure_id: uuid.UUID) -> bool

Returns True if fee_structures.locked_at IS NOT NULL for this structure. Use a single fetchval.

async def recompute_structure_amount(conn, structure_id: uuid.UUID, school_id: uuid.UUID) -> int

Runs SELECT COALESCE(SUM(amount), 0) FROM fee_structure_items WHERE fee_structure_id = $1 AND school_id = $2. Then updates fee_structures SET amount = $result, updated_at = now() WHERE id = $1. Returns the new total as an integer.

async def load_structure_with_items(conn, school_id: uuid.UUID, structure_id: uuid.UUID) -> dict | None

Fetches the fee_structures row and all its fee_structure_items in two queries. Returns a dict with all structure fields plus items: list[dict] sorted by sort_order then created_at, and locked: bool derived from locked_at IS NOT NULL. Returns None if the structure does not belong to this school.

2b. New Pydantic models in apps/api/app/routers/fees.py

Add these models. Mirror the naming convention of existing models in that file.

python
class FeeStructureItemInput(BaseModel):
    description: str
    amount: int  # BIGINT UGX, must be > 0
    account_id: uuid.UUID | None = None
    sort_order: int = 0

class CreateFeeStructureBody(BaseModel):
    class_id: uuid.UUID
    term_name: str
    academic_year: int
    description: str | None = None
    items: list[FeeStructureItemInput]  # required, min 1 item

    @field_validator("items")
    @classmethod
    def items_not_empty(cls, v):
        if not v:
            raise ValueError("At least one fee item is required")
        if len(v) > 50:
            raise ValueError("Maximum 50 items per structure")
        return v

class AddFeeStructureItemBody(BaseModel):
    description: str
    amount: int
    account_id: uuid.UUID | None = None
    sort_order: int = 0

class UpdateFeeStructureItemBody(BaseModel):
    description: str | None = None
    amount: int | None = None
    account_id: uuid.UUID | None = None
    sort_order: int | None = None

class ReorderFeeStructureItemsBody(BaseModel):
    item_ids: list[uuid.UUID]  # all item IDs in desired order

class UpdateFeeStructureHeaderBody(BaseModel):
    description: str | None = None
    is_active: bool | None = None
    # amount is NOT accepted — it is derived from items
Step 3 — Backend endpoints

All endpoints go in apps/api/app/routers/fees.py. Add them in this order.

3a. Replace POST /structures (create with items)

Replace the existing single-amount create endpoint entirely. The new version:

Calls _require_permission(actor, "manageFees")
Validates at least 1 item in body
Checks no existing structure for (school_id, class_id, term_name, academic_year) — same conflict logic as before, return 409 with existing id if conflict
In one transaction:
INSERT the fee_structures row with amount = SUM(body.items[*].amount) computed in Python before the insert
Bulk INSERT all items using unnest with parallel arrays: school_id[], fee_structure_id[], description[], amount[], account_id[], sort_order[]. Use $1::uuid[], $2::text[] etc. pattern
Returns the full structure with items via load_structure_with_items

Bulk unnest pattern for items (required — no loops):

Pass parallel arrays to a single INSERT statement:

sql
INSERT INTO fee_structure_items
  (school_id, fee_structure_id, description, amount, account_id, sort_order)
SELECT $1, $2, unnest($3::text[]), unnest($4::bigint[]),
       unnest($5::uuid[]), unnest($6::int[])

Where $3 through $6 are Python lists built from body.items before the query call.

3b. New GET /structures/{structure_id}
Calls _require_permission(actor, "viewFees")
Calls load_structure_with_items(conn, school_id, structure_id)
Returns 404 if not found, otherwise {"data": result}
3c. Replace PATCH /structures/{id} (header only)

Update only description and is_active. If the client sends amount, ignore it silently — amount is derived. No lock check required for header edits. Returns updated structure without items (keep it light — list view only needs header).

3d. New POST /structures/{structure_id}/items (add one item)
_require_permission(actor, "manageFees")
Check structure_is_locked — if True, raise 422 with code STRUCTURE_LOCKED and message "This fee structure is locked because invoices have been generated. No changes can be made."
INSERT one row into fee_structure_items
Call recompute_structure_amount in same transaction
Return {"data": new_item_dict}
3e. New POST /structures/{structure_id}/items/bulk (add multiple items at once)

Same lock check as above. Body: list[FeeStructureItemInput], max 50. Uses the same unnest pattern as the create endpoint. Recomputes amount after. Returns {"data": {"added": count, "items": [...]}}.

This is the primary path for adding items — the single-item endpoint exists for convenience only.

3f. New PATCH /structures/{structure_id}/items/{item_id}
Lock check — reject if locked
Validate item belongs to this school and structure
Update only fields present in body (COALESCE pattern)
Recompute structure amount if amount was changed
Return updated item
3g. New DELETE /structures/{structure_id}/items/{item_id}
Lock check — reject if locked
Check item count — if only 1 item remains, reject with 422 code LAST_ITEM and message "Cannot delete the last fee item. A fee structure must have at least one item."
DELETE the item
Recompute structure amount
Return {"data": {"deleted": true}}
3h. New PUT /structures/{structure_id}/items/reorder
Lock check — reject if locked
Body: item_ids: list[uuid.UUID] — all item IDs for this structure in desired order
Validate all provided IDs belong to this structure and school
Update sort_order for each: use unnest to set sort_order = position in one statement
sql
UPDATE fee_structure_items AS i
SET sort_order = r.pos, updated_at = now()
FROM unnest($1::uuid[], $2::int[]) AS r(id, pos)
WHERE i.id = r.id AND i.school_id = $3

Where $2 is [0, 1, 2, ...] positional integers built from the order of item_ids.

Return {"data": {"reordered": true}}
3i. Modify POST /structures/{id}/assign

After successful account and invoice creation:

Change invoice generation to use items — described in Step 4
Set the lock: UPDATE fee_structures SET locked_at = now(), locked_reason = 'Invoices generated' WHERE id = $1
Everything in one transaction — if invoice creation fails, lock is not set
3j. Keep POST /structures/{id}/sync-accounts unchanged

It reads fs.amount which is now a maintained aggregate. No changes needed. Add a comment: "Reads denormalized amount from fee_structures — kept in sync by item mutations."

Step 4 — Change invoice generation

File: apps/api/app/services/fees/invoices.py

4a. Modify create_invoices_for_fee_structure

Change the function signature. Instead of accepting a single amount: int, add a parameter items: list[dict]. Each dict has description, amount, account_id (nullable), sort_order.

If called from assign, the caller first fetches items via:

sql
SELECT description, account_id, amount, sort_order
FROM fee_structure_items
WHERE fee_structure_id = $1 AND school_id = $2
ORDER BY sort_order, created_at

Then passes them into the function.

Inside the function, for each student invoice:

INSERT one invoices row with total_amount = SUM(items[*].amount)
Bulk INSERT all invoice_items rows using unnest — one row per structure item per student

The unnest for invoice_items must handle all students × all items efficiently. Build it as: for each student, generate N item rows, collect all rows across all students into flat parallel arrays, then one INSERT for all of them.

Fallback: If items is empty (should not happen post-backfill but be defensive), fall back to the old single-line behavior using fs.amount and description 'School fees'. Log a warning.

4b. Update the caller in fees.py

In the assign endpoint, before calling create_invoices_for_fee_structure:

python
items = await conn.fetch(
    """
    SELECT description, account_id, amount, sort_order
    FROM fee_structure_items
    WHERE fee_structure_id = $1 AND school_id = $2
    ORDER BY sort_order, created_at
    """,
    structure_id, school_id,
)
items_list = [dict(r) for r in items]

Then pass items_list into the function.

Step 5 — Shared types

File: apps/web/src/lib/fees/types.ts

Add these types without removing anything that currently exists:

typescript
export type FeeStructureItem = {
  id: string;
  feeStructureId: string;
  description: string;
  amount: number; // UGX integer
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  sortOrder: number;
  isOptional: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FeeStructureDetail = FeeStructure & {
  items: FeeStructureItem[];
  locked: boolean;
  lockedAt: string | null;
};

export type FeeStructureItemInput = {
  description: string;
  amount: number;
  accountId?: string | null;
  sortOrder?: number;
};

export type CreateFeeStructurePayload = {
  classId: string;
  termName: string;
  academicYear: number;
  description?: string;
  items: FeeStructureItemInput[];
};

export type AddFeeStructureItemPayload = FeeStructureItemInput;

export type UpdateFeeStructureItemPayload = Partial<FeeStructureItemInput>;

export type BulkAddFeeStructureItemsPayload = {
  items: FeeStructureItemInput[];
};

export type ReorderFeeStructureItemsPayload = {
  itemIds: string[];
};

Also extend the existing FeeStructure type to add:

typescript
locked?: boolean;
lockedAt?: string | null;
itemCount?: number;
items?: FeeStructureItem[]; // present on detail fetch only
Step 6 — Frontend: API client functions

File: wherever the fees API client functions live (confirm exact path in Step 0).

Add these functions following the exact same pattern as existing fees API calls:

getFeeStructure(structureId) — GET /schools/fees/structures/{id}
createFeeStructure(payload: CreateFeeStructurePayload) — POST /schools/fees/structures
addFeeStructureItem(structureId, item: AddFeeStructureItemPayload) — POST /schools/fees/structures/{id}/items
addFeeStructureItemsBulk(structureId, payload: BulkAddFeeStructureItemsPayload) — POST /schools/fees/structures/{id}/items/bulk
updateFeeStructureItem(structureId, itemId, payload: UpdateFeeStructureItemPayload) — PATCH /schools/fees/structures/{id}/items/{itemId}
deleteFeeStructureItem(structureId, itemId) — DELETE /schools/fees/structures/{id}/items/{itemId}
reorderFeeStructureItems(structureId, payload: ReorderFeeStructureItemsPayload) — PUT /schools/fees/structures/{id}/items/reorder
Step 7 — Frontend: Replace AddFeeStructurePanel

File: apps/web/src/components/fees/AddFeeStructurePanel.tsx

Replace the current single-amount form entirely. The new form has two sections:

Section 1 — Structure header:

Class selector (same as current)
Term name selector (drop down of the terms)
Academic year input (drop down)
Description input (optional, same as current — this is the header description, not an item description)

Section 2 — Fee items (dynamic line items):

Model this exactly on how AddInvoicePanel or AddOtherIncomePanel manages its items array — read those files first and replicate the same local state pattern.

Each item row has:

Description text input (e.g. "Tuition", "Development Fund", "PTA Levy")
Amount input using parseUGXInput on change and formatUGX for display
Optional account selector (dropdown of income accounts from existing accounts endpoint — check how AddInvoicePanel fetches these)
Remove button (trash icon, disabled if only one row remains)
Drag handle for reordering (use a simple up/down arrow approach — no drag library needed unless one already exists in the project)

Below the items: an "Add item" button that appends a new empty row.

Live total: Show a summary row at the bottom of the items section: "Total: UGX X,XXX,XXX" — sum of all valid item amounts in real time.

Preset suggestions: Show a row of quick-add chips above the items list for common Ugandan school fee types: Tuition, Meals, Development Fund, PTA Levy, Medical, ICT Levy, Book Fund, Examination Fee, Uniform. Clicking a chip appends a new item row with that description pre-filled and the amount input focused.

Validation (client-side before submit):

At least one item required
Each item must have a non-empty description
Each item must have an amount > 0
Show inline error below the offending row

Submit: Calls createFeeStructure with the full payload including items array. On success, close the panel and mutate/revalidate the structures list. Show a success toast. On error, display the API error message inline.

State management: Store items as a local array of objects with a client-side key (use crypto.randomUUID() or a counter) for stable React keys. Do not use the array index as the key. This matches how the existing invoice panel manages items — verify and replicate exactly.

Step 8 — Frontend: New EditFeeStructurePanel

File: apps/web/src/components/fees/EditFeeStructurePanel.tsx

This panel opens when admin clicks Edit on an existing structure.

On open: Fetches getFeeStructure(structureId) to get the full detail including items.

If unlocked:

Header fields (description, is_active) are editable — PATCH /structures/{id} on save
Items table is fully editable: edit description/amount inline, delete items (last item delete disabled), add new items, reorder with up/down buttons
Each inline edit calls the individual item endpoint immediately on blur (not on panel save) — same "autosave per line" pattern if that is how existing panels work, otherwise collect changes and save on panel save. Check the existing pattern in AddInvoicePanel and match it
"Add items in bulk" button opens a secondary form with multiple rows at once, submits via the bulk endpoint

If locked:

Show a banner: "This structure is locked. Invoices have been generated and no changes can be made to fee items."
All item fields rendered as read-only text
Header fields (description only, not is_active or amount) remain editable — locking should not prevent renaming the structure
Assign button still available to add more students who were not yet assigned

Loading state: Skeleton rows matching the expected items count while fetching.

Empty items state (should not happen post-backfill): Show a message and an "Add first item" button.

Step 9 — Frontend: Update FeeStructuresContent

File: apps/web/src/components/fees/FeeStructuresContent.tsx

Changes to the existing table:

Amount column: label stays "Total Amount", value stays the same (it is still fs.amount, now just computed from items)
New "Items" column: shows item count as a badge, e.g. "3 items". Click opens EditFeeStructurePanel
New "Status" column: shows a lock badge ("Locked") in amber if locked_at is not null, otherwise shows "Active" or "Inactive" from is_active
Actions column: "Edit" button opens EditFeeStructurePanel. "Assign" button remains. Add "View detail" if not already present
The existing "Add structure" button now opens the new AddFeeStructurePanel

No changes to pagination, filtering, or sorting logic.

Step 10 — Frontend: Update AssignFeeStructureDialog

File: apps/web/src/components/fees/AssignFeeStructureDialog.tsx

Before submitting:

Fetch the structure detail if not already loaded to show the fee breakdown to the admin before they confirm: "Assigning will create invoices with the following line items: [list]"
Show the item breakdown in the confirmation modal: description, amount per item, total
The assign call itself does not change — it still calls POST /structures/{id}/assign
After successful assign, the structure will be returned as locked from the API. Refresh the structures list so the lock badge appears immediately
Step 11 — Frontend: Update AddInvoicePanel structure selection

File: apps/web/src/components/fees/AddInvoicePanel.tsx

When the user selects a fee structure from the structure dropdown:

Currently: copies the single structure.amount as one invoice line item.

New behavior: fetch getFeeStructure(selectedStructureId) to get the full detail with items. Then map each fee_structure_items row to an invoice line item, pre-populating: description from item.description, amount from item.amount, account_id from item.account_id. Replace all existing invoice lines with these structure-derived lines. The user can then add, edit, or remove lines before saving the invoice.

If the structure fetch fails, fall back to the single-amount behavior with a warning toast.

Performance requirements

Bulk item creation: 50 items per structure in one unnest INSERT — single round-trip.

Invoice generation for bulk assign: If assigning to 200 students with 5 fee items each = 1,000 invoice_item rows. These must be inserted in one unnest INSERT across all students, not looped per student. Build flat parallel arrays across all student-invoice pairs before the INSERT call.

Frontend item list: Up to 50 items rendered as controlled inputs. Do not use individual useState per item — store the entire items array in one state object and update immutably. This avoids 50 individual re-renders on "clear all" actions.

Delivery sequence

Complete and verify each step before moving to the next:

Step	Done when
1	Migration 044 runs cleanly; every existing structure has ≥1 item in fee_structure_items; locked_at column exists
2	Helper functions pass manual testing via curl or pytest
3	All new endpoints appear in /api/docs; item CRUD works; lock correctly blocks edits
4	Assign creates multi-line invoices; structure is locked after assign; invoice_items has one row per fee structure item per student
5	TypeScript compiles with no errors after type additions
6	API client functions compile and make correct requests
7	Add structure form creates with multiple items; preset chips work; live total correct
8	Edit panel shows items; inline edits save; locked state shows banner and disables edits
9	Structures table shows item count and lock badge
10	Assign dialog shows item breakdown before confirming
11	Selecting a structure in invoice panel fills all line items
12	Regression: existing payments, waive, outstanding balance, receipt PDF all still work
Conventions to enforce
Never loop DB inserts — always unnest
fees_actor_id(actor) not actor["sub"] for write operations
Lock check before every item mutation — return 422 with code STRUCTURE_LOCKED
Last item check before delete — return 422 with code LAST_ITEM
All amounts BIGINT — never float, never string
formatUGX for all money display — never raw number rendering
No drag-and-drop library unless one already exists in the project — use up/down buttons
Preset chip list for common Ugandan school fee types on the create form
Read-only mode on locked structures — never hide the data, just disable the inputs
Skeleton placeholders matching the item count while loading — never blank content begins.