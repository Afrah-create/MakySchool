MakySchool — In-App Notification Module: Implementation
Your first task — audit before planning or implementing

Read every one of the following before writing a single line of code. Report findings for each item before proceeding.

Database layer:
Read all migration files in apps/api/migrations/. Answer:

Does any notifications table already exist in any migration?
Does any notification_preferences or similar table exist?
What is the highest migration number currently?
Does users table have any notification-related columns?
Does any existing table have webhook or event trigger patterns?

Backend:
Read these files in full and note the exact patterns:

apps/api/app/routers/attendance.py — note where bulk save happens, what data is available at save time
apps/api/app/routers/alevel.py — note where mark submission happens
apps/api/app/routers/primary_reports.py — note mark submission and unlock patterns
apps/api/app/routers/olevel.py — note exam session open and mark submission patterns
apps/api/app/routers/resources.py — note where resource publish and teaching plan confirm happen
apps/api/app/routers/fees.py — note where invoice generation and payment recording happen
apps/api/main.py — note the lifespan function and how background tasks are currently managed
apps/api/app/middleware/auth.py — note how user identity is resolved from JWT
apps/api/app/db/pool.py — note how DB connections are obtained outside of request context

Frontend:
Read these files and note exact patterns:

apps/web/src/lib/api/client.ts — note exactly how API calls are made and how headers are attached
apps/web/src/components/layout/school-admin/ — list all files, note where the top navigation bar is rendered and how it is structured
apps/web/src/components/layout/shared/ — list all files
apps/web/src/app/(teacher)/teacher/ — note the layout file
apps/web/src/app/(bursar)/ — note the layout file
apps/web/src/app/(learner)/ — note the layout file
Any existing drawer or slide-over component in apps/web/src/components/ui/ — note the exact component name and props

Report discrepancies: Any endpoint that should trigger a notification but whose file does not exist yet, flag it. Any layout that does not have a clear top navigation bar, flag it.

What you are building

A real-time in-app notification system that:

Delivers notifications instantly to online users via Server-Sent Events (SSE)
Falls back gracefully for offline users — they see notifications when they next open the app
Provides a bell icon with unread count badge in every role's navigation bar
Provides a notification drawer that opens on bell click showing recent notifications with mark-as-read
Provides a dedicated notifications page with full history, filtering, and archive capability
Respects role-based notification routing — each notification type goes only to the correct roles
Is extensible — adding a new notification type in the future requires only adding a new event call, not modifying the notification infrastructure
Why SSE not WebSockets

SSE is the correct choice for this use case. Notifications are server-to-client only — the client never sends data back through the notification channel. SSE is simpler to implement, works through standard HTTP, is natively supported by FastAPI via StreamingResponse, does not require a separate WebSocket server, and handles reconnection automatically in the browser. WebSockets add complexity with no benefit here.

Why not polling

Polling (repeatedly calling GET /notifications every N seconds) wastes server resources and introduces latency. With SSE, the server pushes events the instant they occur. The difference between polling every 30 seconds and SSE is the difference between a user waiting up to 30 seconds to see a notification and seeing it within 1 second.

Database migration

Create the next available migration after your highest current number.

Table: notifications

One row per notification per recipient. Each triggering event creates one row per intended recipient — not one row shared across recipients.

sql
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  resource_type   TEXT,
  resource_id     UUID,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  read_at         TIMESTAMPTZ,
  is_archived     BOOLEAN NOT NULL DEFAULT false,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications (school_id, recipient_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (school_id, recipient_id, is_archived)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_resource
  ON notifications (school_id, resource_type, resource_id);

Column explanations:

type — a string identifying what happened. Use a consistent naming convention: {actor_role}.{action}.{resource}. Examples: teacher.submitted.marks, admin.opened.exam_session, teacher.uploaded.teaching_plan, teacher.submitted.attendance, admin.created.invoice, admin.recorded.payment. This convention makes it easy to filter, group, and add new types without schema changes.

actor_id — who triggered the event. Nullable because some events are system-generated with no human actor.

resource_type — what kind of resource this notification is about. Examples: exam_session, teaching_plan, attendance_register, invoice, subject_resource, marks_submission. Used for deep linking — the frontend uses this to know where to navigate when the notification is clicked.

resource_id — the UUID of the specific resource. Combined with resource_type, this allows the frontend to construct the correct deep link URL.

metadata — flexible JSONB for any additional context the frontend needs to render the notification richly. Examples: class name, subject name, student count, amount in UGX. This avoids having to re-fetch related records just to display the notification.

Table: notification_preferences

Per-user per-type opt-in/opt-out. Defaults to all enabled — only stores rows where the user has changed a preference.

sql
CREATE TABLE IF NOT EXISTS notification_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  in_app_enabled  BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, type)
);
Table: notification_sse_connections

Tracks active SSE connections so the server knows which users are currently online and can push to them. Cleaned up on disconnect and periodically by a background job.

sql
CREATE TABLE IF NOT EXISTS notification_sse_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ping_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sse_connections_user
  ON notification_sse_connections (school_id, user_id);
Backend implementation
New file: apps/api/app/lib/notifications.py

This is the core notification library. Every other part of the system that wants to send a notification calls functions from this file. The routing logic, recipient resolution, and SSE delivery all live here. No other file contains notification logic.

Function: async def notify(conn, event_type, actor_id, school_id, recipients, title, body, resource_type=None, resource_id=None, metadata=None)

The single entry point for creating notifications. All other notification functions call this.

Steps:

Filter recipients by checking notification_preferences — skip any recipient who has opted out of this event type
Bulk insert one notifications row per recipient using unnest — single SQL statement regardless of recipient count
For each recipient who has an active SSE connection (check notification_sse_connections), push the notification to their event stream immediately
Return the count of notifications created

Function: async def notify_role(conn, event_type, actor_id, school_id, role, title, body, resource_type=None, resource_id=None, metadata=None)

Convenience wrapper that resolves all users with a given role in the school, then calls notify. Use this when notifying all admins, all teachers, etc.

Fetches recipients: SELECT id FROM users WHERE school_id = $1 AND role = $2 AND is_active = true

Function: async def notify_user(conn, event_type, actor_id, school_id, user_id, title, body, resource_type=None, resource_id=None, metadata=None)

Convenience wrapper for notifying one specific user.

Function: async def push_sse_event(user_id, event_data)

Looks up the in-memory SSE queue for the user and pushes the event. The queue is a global dictionary in this module: _sse_queues: dict[str, asyncio.Queue] = {}. When a user connects via SSE, their queue is registered here. When they disconnect, it is removed. This is the only in-memory state in the notification system.

SSE queue management functions:

register_sse_queue(user_id, queue) — called when SSE connection opens
unregister_sse_queue(user_id) — called when SSE connection closes
get_sse_queue(user_id) — returns the queue or None if user is not connected
New file: apps/api/app/routers/notifications.py

Mount in main.py via mount_v1_and_legacy(app, notifications_router, "/api/schools/notifications").

GET /notifications/stream — SSE endpoint

This is the real-time connection endpoint. The browser connects once and keeps the connection open. The server sends events as they happen.

Implementation:

Authenticate the user from the request (read the JWT from cookie using extract_tenant_access_token from middleware/auth.py — do not use Depends(require_tenant_with_subscription) because SSE connections are long-lived and the subscription dependency may timeout)
Create an asyncio.Queue for this user
Register the queue via register_sse_queue(user_id, queue)
Insert a row in notification_sse_connections
Return a StreamingResponse with media_type="text/event-stream" that:
Sends an initial connected event with the unread count
Loops waiting on queue.get() with a 30-second timeout
On timeout, sends a ping event (keeps connection alive through proxies and load balancers)
On receiving a notification from the queue, formats it as SSE and yields it
On client disconnect (GeneratorExit or asyncio.CancelledError), unregisters the queue and deletes the SSE connection row

SSE event format:

event: notification
data: {"id": "...", "type": "...", "title": "...", "body": "...", "resourceType": "...", "resourceId": "...", "metadata": {...}, "createdAt": "..."}

event: ping
data: {"timestamp": "..."}

event: unread_count
data: {"count": 5}

GET /notifications — list notifications

Query params: limit (default 20, max 50), offset (default 0), is_read (optional boolean filter), is_archived (default false), type (optional filter).

Returns paginated notifications for the authenticated user ordered by created_at DESC. Reads from the notifications table — not the SSE queues.

Response: {"data": {"notifications": [...], "total": N, "unread_count": N}}

GET /notifications/unread-count — lightweight count endpoint

Returns just {"data": {"count": N}}. Used on initial page load before the SSE connection is established. Fast — single COUNT query with the unread index.

PATCH /notifications/{id}/read — mark one as read

Sets is_read = true, read_at = now(). Validates notification belongs to this user. Returns updated notification.

PATCH /notifications/read-all — mark all as read

Bulk update: UPDATE notifications SET is_read = true, read_at = now() WHERE recipient_id = $1 AND is_read = false. Returns count updated.

PATCH /notifications/{id}/archive — archive one notification

Sets is_archived = true, archived_at = now(). Only already-read notifications can be archived — return 422 if not yet read.

PATCH /notifications/archive-read — archive all read notifications

Bulk archives all is_read = true AND is_archived = false notifications for this user. Returns count archived.

DELETE /notifications/{id} — delete one notification

Hard delete. User can only delete their own notifications.

GET /notifications/preferences — get user preferences

Returns all notification type preferences for this user.

PATCH /notifications/preferences — update preferences

Body: { preferences: [{ type: string, in_app_enabled: boolean }] }. Upserts using unnest.

Notification event definitions

Create apps/api/app/lib/notification_events.py. This file defines all notification types as constants and provides typed helper functions for each event. Every place in the codebase that triggers a notification calls one of these helpers — nothing calls notify() directly except these helpers.

Define these notification types and their helpers:

Mark submission events:

teacher.submitted.alevel_marks — called when teacher submits A-Level marks for a subject. Notifies: all admin and head_teacher roles. Title: "{teacher name} submitted A-Level marks". Body: "{subject name} marks for {class name} have been submitted and are ready for review." Metadata: {teacher_name, subject_name, class_name, exam_session_id}. Resource: exam_session, the session ID.

teacher.submitted.olevel_marks — same pattern for O-Level. Notifies admin and head_teacher.

teacher.submitted.primary_marks — same pattern for primary marks.

admin.opened.exam_session — called when admin opens an exam session for mark entry. Notifies: all teachers assigned to subjects in the relevant class via teacher_class_assignments. Title: "Exam session opened for mark entry". Body: "{session title} is now open. Please enter and submit your marks before {term end date}." Metadata: {session_title, class_name, term_name, category_name, max_marks}. Resource: exam_session.

admin.unlocked.marks — called when admin unlocks a teacher's mark submission. Notifies: the specific teacher whose marks were unlocked. Title: "Your marks have been unlocked". Body: "Your {subject name} marks for {class name} have been unlocked for correction. Reason: {reason}." Metadata: {subject_name, class_name, reason}.

Attendance events:

teacher.submitted.attendance — called when teacher submits attendance for a period. Notifies: admin and head_teacher. Title: "{teacher name} submitted attendance". Body: "Attendance for {class name} — {subject name}, Period {N} on {date} has been submitted." Metadata: {teacher_name, class_name, subject_name, period_number, date, student_count}. Resource: attendance_period, the timetable period ID.

Teaching plan events:

teacher.uploaded.teaching_plan — called when teacher confirms a teaching plan upload. Notifies: admin and head_teacher. Title: "{teacher name} uploaded a teaching plan". Body: "A teaching plan for {subject name} — {class name}, {term name} has been uploaded." Metadata: {teacher_name, subject_name, class_name, term_name, file_name}. Resource: teaching_plan, the plan ID.

Resource events:

teacher.published.resource — called when teacher publishes a subject resource. Notifies: all students currently enrolled in the relevant class. Title: "New resource available". Body: "{teacher name} has shared a new resource: {resource title} for {subject name}." Metadata: {teacher_name, resource_title, subject_name, resource_type, class_name}. Resource: subject_resource, the resource ID.

Fee events:

admin.created.invoice — called when invoices are generated for students. Creates one notification per student. Title: "New fee invoice". Body: "An invoice of UGX {amount} has been created for {term name} {academic year}. Please ensure payment is made before the deadline." Metadata: {amount_ugx, term_name, academic_year, due_date, invoice_number}. Resource: invoice, the invoice ID.

admin.recorded.payment — called when a fee payment is recorded. Notifies the specific student. Title: "Payment received". Body: "A payment of UGX {amount} has been recorded on your account. Your current balance is UGX {balance}." Metadata: {amount_ugx, balance_ugx, payment_method, receipt_number}. Resource: fee_payment, the payment ID.

admin.waived.fee — called when a fee is waived. Notifies the specific student. Title: "Fee waived". Body: "UGX {amount} has been waived on your account by the school." Metadata: {amount_ugx, reason}.

Report card events:

admin.generated.report_card — called when report cards are generated for a class. Notifies each student whose report was generated. Title: "Your report card is ready". Body: "Your {term name} report card has been generated and is available for download." Metadata: {term_name, academic_year}. Resource: report_card, enrollment ID.

Wiring notifications into existing routers

After implementing the notification library and router, add notification calls to these existing endpoints. In each case, add the notification call after the main operation succeeds — never before, never in a way that could cause the main operation to fail if the notification fails.

Wrap every notification call in a try/except so a notification failure never rolls back the main transaction:

python
try:
    await notify_teacher_submitted_marks(conn, actor_id=actor_id, school_id=school_id, ...)
except Exception as e:
    logger.warning("Notification failed: %s", e)
    # Do not raise — notification failure must not fail the main operation

In attendance.py — POST /bulk endpoint: After successful attendance bulk insert and before returning the response, call notify_attendance_submitted.

In alevel.py — mark submission endpoint: After successful status update to submitted, call notify_alevel_marks_submitted.

In alevel.py — exam session open endpoint: After setting status to open, call notify_exam_session_opened. This requires fetching all teachers assigned to subjects in this class via teacher_class_assignments and notifying each one.

In alevel.py — unlock endpoint: After setting submission status to unlocked, call notify_marks_unlocked targeting the specific teacher.

In olevel.py — same three patterns as A-Level.

In primary_reports.py — mark submission and unlock patterns.

In resources.py — confirm upload endpoint for teaching plans: After setting status to active, call notify_teaching_plan_uploaded.

In resources.py — visibility endpoint for subject resources: When is_published changes from false to true, call notify_resource_published. Fetch all students in the class via student_class_history where left_at IS NULL.

In fees.py — assign endpoint: After invoices are created, call notify_invoices_created for each student who received an invoice.

In fees.py — payment recording endpoint: After payment is recorded, call notify_payment_recorded for the student.

In fees.py — waive endpoint: After waive is recorded, call notify_fee_waived for the student.

In report card generation endpoints (alevel, olevel, primary): After PDFs are generated, call notify_report_card_ready for each student.

Frontend implementation
New file: apps/web/src/lib/api/notifications.ts

API client functions following the exact same pattern as existing API client files. Functions for every endpoint above.

Also export: createNotificationSSEConnection(onNotification, onUnreadCount, onConnect) — a function that opens an SSE connection and wires up the event handlers. Returns a cleanup function that closes the connection. This abstraction means no component needs to know about EventSource directly.

New file: apps/web/src/hooks/useNotifications.ts

useNotifications() — fetches paginated notifications using the existing data fetching pattern. Accepts filter params.

useUnreadCount() — fetches the unread count once on mount. Lightweight.

useNotificationSSE() — the real-time hook. Opens an SSE connection on mount and closes it on unmount. Maintains local state: unreadCount (number), latestNotification (the most recent notification received). On receiving an SSE notification event, increments the unread count and stores the latest notification. On receiving an unread_count event, sets the count directly. Exposes: { unreadCount, latestNotification }.

This hook is called once in each role's root layout — not in every component. It provides its values via a React context so the bell icon and drawer can read them without prop drilling.

New file: apps/web/src/contexts/NotificationContext.tsx

A React context that provides notification state to all components in a role's layout:

typescript
type NotificationContextValue = {
  unreadCount: number;
  latestNotification: Notification | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => void;
};

NotificationProvider wraps each role layout. It calls useNotificationSSE() internally and provides the state to children.

New component: apps/web/src/components/notifications/NotificationBell.tsx

The bell icon that sits in the navigation bar of every role portal.

Visual design:

A bell icon (use Bell from lucide-react)
When unreadCount > 0: a badge overlaid on the top-right of the bell. Badge shows the count as a number. If count > 99, show "99+". Badge is a small circle with a red or primary background
When unreadCount === 0: plain bell, no badge
On click: opens the NotificationDrawer
The bell has a subtle animation (a brief ring/shake) when latestNotification changes — use a CSS keyframe animation triggered by a state change

Reads unreadCount and latestNotification from NotificationContext.

New component: apps/web/src/components/notifications/NotificationDrawer.tsx

A slide-in panel from the right side. Not a modal — it does not block the rest of the UI. The user can continue using the app with the drawer open.

Drawer header:

Title: "Notifications"
Unread count: "5 unread" in muted text
"Mark all as read" button — only visible when unread count > 0
Close button (X)

Drawer body:

List of the 20 most recent non-archived notifications
Each notification item shows:
A type-specific icon (different icon per notification type — use lucide-react icons: FileCheck for marks, CalendarCheck for attendance, Upload for uploads, Receipt for invoices, CreditCard for payments, BookOpen for resources)
Title in semibold
Body in muted text, truncated to 2 lines
Relative timestamp ("2 minutes ago", "Yesterday", "3 days ago") — use a simple relative time formatter
Unread indicator: a small colored dot on the left edge for unread notifications
On hover: shows a "Mark as read" button and a "View" button
Clicking a notification: marks it as read and navigates to the relevant resource using resource_type and resource_id to construct the URL

Deep link URL construction — create a helper function getNotificationUrl(resourceType, resourceId, metadata) that returns the correct app URL:

exam_session → /dashboard/alevel/grades?sessionId={resourceId} (or olevel equivalent based on metadata)
teaching_plan → /dashboard/teaching-plans?planId={resourceId}
attendance_period → /dashboard/attendance
invoice → /bursar/invoices/{resourceId} or /learner/fees depending on recipient role
subject_resource → /learner/resources?resourceId={resourceId}
fee_payment → /bursar/payments or /learner/fees
report_card → /dashboard/results/{resourceId}

Drawer footer:

"View all notifications" link → navigates to the full notifications page
"Archive all read" button

Loading state: Skeleton list items matching the notification item shape while fetching.

Empty state: Bell illustration (or the Bell icon large and muted), "You're all caught up" heading, "No new notifications" body text.

New component: apps/web/src/components/notifications/NotificationItem.tsx

A single notification row used in both the drawer and the full page. Extracted as a shared component so both views render consistently.

Props: notification object, onRead, onArchive, compact (boolean — drawer uses compact=true, full page uses compact=false).

In compact mode: 2-line body truncation, smaller padding, no archive button.
In full mode: full body text, larger padding, both mark-as-read and archive buttons visible.

New page: apps/web/src/app/(school-admin)/dashboard/notifications/page.tsx

The full notifications page. Also create equivalent pages for other role portals at:

(teacher)/teacher/notifications/page.tsx
(bursar)/bursar/notifications/page.tsx
(learner)/learner/notifications/page.tsx

All four pages use the same component — create apps/web/src/components/notifications/NotificationsPage.tsx and import it in each route.

Page layout:

Header: "Notifications" title, subtitle showing total unread count.

Filter bar:

Tabs: "All" | "Unread" | "Archived"
Type filter dropdown: "All types" | "Marks" | "Attendance" | "Resources" | "Fees" | "Reports"
"Mark all as read" button (disabled when no unread)
"Archive all read" button (disabled when no read unarchived)

Notification list:

Uses NotificationItem with compact=false
Infinite scroll or pagination (use whatever pagination pattern exists in other list pages in the codebase — match it exactly)
Group notifications by date: "Today", "Yesterday", "This week", "Earlier"
Within each group, ordered newest first

Empty states:

Unread tab empty: "No unread notifications. You're all caught up."
Archived tab empty: "No archived notifications."
All tab empty: "No notifications yet."

Loading: skeleton list matching the notification item shape.

Wiring the bell into navigation layouts

Find the navigation bar component for each role portal. Add NotificationBell to the right side of the nav bar, before the user menu/profile button.

For each role layout file:

Wrap the layout content with NotificationProvider
Add NotificationBell to the nav bar
Render NotificationDrawer at the layout level (not inside the bell) so it is positioned relative to the full page, not relative to the bell button

Add notifications link to each role's nav config:

School admin nav: "Notifications" → /dashboard/notifications, Bell icon
Teacher nav: "Notifications" → /teacher/notifications, Bell icon
Bursar nav: "Notifications" → /bursar/notifications, Bell icon
Learner nav: "Notifications" → /learner/notifications, Bell icon
Notification content and copy guidelines

Every notification must follow this pattern:

Title: Short, action-focused, under 60 characters. States what happened. "John Doe submitted Biology marks" not "Marks submission".

Body: One to two sentences. Gives enough context to understand without navigating away. Includes the key details: names, amounts, class, term. "Biology marks for S3A have been submitted and are ready for review. 42 students marked."

Metadata: Include everything the frontend needs to render rich content and construct deep links without making additional API calls. Class name, subject name, amounts, counts, dates.

Performance requirements

SSE connections: The server must handle one persistent SSE connection per logged-in user. For a school with 100 concurrent users, that is 100 open HTTP connections. FastAPI with uvicorn handles this well — asyncio keeps SSE connections open without blocking threads. Do not use threading for SSE — use asyncio generators exclusively.

Notification creation: The bulk insert uses unnest. Creating 200 notifications (e.g. notifying all students in a school when invoices are generated) must complete in one SQL statement, not a loop.

SSE fan-out: After the bulk insert, push to SSE queues in parallel using asyncio.gather. Do not push sequentially.

In-memory queue cleanup: A background task runs every 5 minutes and removes any SSE connection records from the database where last_ping_at is older than 2 minutes — these represent disconnected clients whose cleanup was not triggered properly.

Unread count query: Uses the partial index idx_notifications_unread — must complete in under 10ms for a user with 10,000 total notifications.

Delivery sequence

Complete and verify in this exact order:

Step	Done when
Migration runs cleanly	All three tables exist, confirmed in DB
notifications.py library functions	Unit test: create notification for 3 users inserts 3 rows in one SQL call
notification_events.py helpers	Each helper calls notify with correct recipients and metadata
Notifications router — CRUD endpoints	All REST endpoints return correct responses, Postman or curl verified
SSE endpoint	Browser can connect, receives ping every 30 seconds, receives events on notification insert
NotificationContext and useNotificationSSE	Console log shows unread count updating in real time
NotificationBell with badge	Badge shows correct count, updates in real time without page refresh
NotificationDrawer	Opens on bell click, lists notifications, mark as read works, deep links navigate correctly
Wire attendance notification	Submit attendance → admin sees notification within 1 second
Wire mark submission notifications	Teacher submits marks → admin sees notification within 1 second
Wire exam session open notification	Admin opens session → assigned teachers see notification within 1 second
Wire teaching plan notification	Teacher confirms upload → admin sees notification within 1 second
Wire resource published notification	Teacher publishes resource → enrolled students see notification within 1 second
Wire fee notifications	Invoice created → student sees notification; payment recorded → student sees notification
Full notifications page	All tabs, filters, and archive actions work
Navigation wired for all roles	Bell appears in admin, teacher, bursar, learner nav bars
Notification preferences	User can opt out of specific types, opted-out users do not receive those notifications
Constraints throughout

Never let a notification failure fail the main operation. Always wrap notification calls in try/except and log the error without re-raising.

Never create notifications synchronously in the main request path if it requires fetching large lists of recipients. If notifying more than 50 users, use asyncio.create_task to run the notification creation as a background task after the response is sent.

SSE connections must handle client disconnection gracefully. The generator must catch GeneratorExit and asyncio.CancelledError and clean up the queue registration and database record.

The in-memory SSE queue dictionary is process-local. If the API runs with multiple workers (multiple uvicorn processes), SSE will not work across workers. For single-process deployment (one uvicorn worker, which is the current setup), this is fine. Document this limitation clearly in apps/api/README.md — if the API is ever scaled to multiple workers, a Redis pub/sub layer must replace the in-memory queues.

Do not use Record<K, V> in TSX files — use mapped types { [K in Type]: V }.

All notification text is in English. Do not hardcode Ugandan shilling formatting — use the existing formatUGX utility.

Every new component needs loading skeleton, empty state, and error state following existing patterns.