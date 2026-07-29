# Teaching Plans & Subject Resources — Implemented

Status: **shipped in codebase** (migration `047`, API, teacher/admin/learner UI).

## What was built

### Feature 1 — Teaching plans
Teachers upload one active plan per class × subject × term (PDF/DOC/DOCX, max 50MB). Uploading again soft-deletes the previous plan and removes its storage object. Admins and head teachers can list/download school-wide and see a compliance summary. Students never see teaching plans.

### Feature 2 — Subject resources
Teachers upload learning materials (PDF, Office docs, video) for assigned classes/subjects. Resources start **unpublished**. Teachers control publish/unpublish, reorder, and bulk actions. Learners see only published resources for their current class; PDFs open/download; videos play in a modal with a longer-lived URL.

### Storage
- Uses existing `TenantStorageService` (Wasabi in production, local in development).
- Presigned PUT → client upload → confirm (file never proxied through the API in production).
- Local bridge: `PUT /api/schools/resources/local-upload?key=...` when `STORAGE_BACKEND=local`.
- Keys:
  - `schools/{school_id}/teaching-plans/{academic_year_id}/{term_id}/{teacher_id}/{uuid}.{ext}`
  - `schools/{school_id}/resources/{class_id}/{subject_id}/{uuid}.{ext}`
- Categories `teaching-plans` and `resources` added to `SCHOOL_STORAGE_CATEGORIES`.

---

## Backend

| Piece | Path |
|-------|------|
| Migration | `apps/api/migrations/047_teaching_plans_and_resources.sql` |
| Validation | `apps/api/app/lib/resource_validation.py` |
| Service | `apps/api/app/services/resources/teaching_and_resources.py` |
| Router | `apps/api/app/routers/resources.py` (mounted at `/api/schools/resources`) |
| Config | `MAX_TEACHING_PLAN_SIZE_MB`, `MAX_RESOURCE_DOC_SIZE_MB`, `MAX_RESOURCE_VIDEO_SIZE_MB`, `STORAGE_VIDEO_PRESIGNED_TTL_SECONDS` |

### Main endpoints

**Teaching plans**
- `POST /teaching-plans/upload-url` → `POST /teaching-plans/{id}/confirm`
- `GET /teaching-plans`, `GET /teaching-plans/{id}/download-url`
- `PATCH /teaching-plans/{id}` (title/description, teacher only)
- `DELETE /teaching-plans/{id}` (teacher only)
- `GET /teaching-plans/compliance?term_id=`

**Subject resources**
- `POST /subject-resources/upload-url` → `POST /subject-resources/{id}/confirm`
- `GET /subject-resources`, `GET /subject-resources/{id}/download-url`
- `PATCH /subject-resources/{id}`, `PATCH /…/visibility`, `PUT /…/reorder`
- `DELETE /subject-resources/{id}`

**Shared**
- `GET /terms` — current academic year terms for filters
- `PUT /local-upload` — local storage upload bridge

Permissions follow the product rules: teacher owns uploads; admin/head_teacher read teaching plans; learners only published class resources via `students.current_class_id`.

---

## Frontend

| Portal | Route | Component |
|--------|-------|-----------|
| Teacher | `/teacher/teaching-plans` | `TeacherTeachingPlansContent` |
| Teacher | `/teacher/resources` | `TeacherResourcesContent` |
| Admin | `/dashboard/teaching-plans` | `AdminTeachingPlansContent` |
| Learner | `/learner/resources` | `LearnerResourcesContent` |

Shared pieces: `FileDropZone`, `UploadProgressBar`, `ResourceTypeIcon`, `lib/api/resources.ts` (XHR upload with progress), `hooks/useResources.ts`.

Nav wired in `teacher-nav.ts`, `school-admin-nav.ts`, `learner-nav.ts`, plus mobile titles/menu prefixes.

UX: `SlideOver` uploads, `ConfirmDialog` for delete/unpublish, `useToast` success/error messages, responsive table/cards.

---

## How to verify

1. Restart API so migration `047` applies (`RUN_MIGRATIONS=true`).
2. As teacher: upload a teaching plan → list → download → replace → delete.
3. As teacher: upload a resource → remains unpublished → publish → learner sees it → unpublish → learner loses access.
4. As admin: open Teaching plans → compliance strip → download.
5. With `STORAGE_BACKEND=local`, confirm upload still works via local-upload bridge.
6. Confirm existing logo/stamp/photo uploads still work.

---

## Out of scope (v1)

Virus scanning, thumbnails/transcoding, drag-and-drop reorder library, admin uploading plans for teachers, file proxying through the API.
