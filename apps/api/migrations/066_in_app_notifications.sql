-- In-app notifications: per-recipient rows, preferences, and SSE connection tracking.

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

CREATE TABLE IF NOT EXISTS notification_sse_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ping_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sse_connections_user
  ON notification_sse_connections (school_id, user_id);
