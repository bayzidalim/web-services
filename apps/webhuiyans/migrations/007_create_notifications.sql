-- =========================================================
-- Notifications Table Migration
-- Version: 007
-- Date: 2025-12-16
-- Description: Create notifications table for admin alerts
-- =========================================================

-- Enum type for notification types
DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM ('guest_signup', 'story_submission', 'media_upload');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for quick admin queries
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- =========================================================
-- ENABLE ROW LEVEL SECURITY
-- =========================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- RLS POLICIES: Notifications
-- =========================================================

-- Admins can view all notifications
DROP POLICY IF EXISTS "Admins can view notifications" ON notifications;
CREATE POLICY "Admins can view notifications"
    ON notifications
    FOR SELECT
    TO authenticated
    USING (is_admin());

-- Admins can update notifications (mark as read)
DROP POLICY IF EXISTS "Admins can update notifications" ON notifications;
CREATE POLICY "Admins can update notifications"
    ON notifications
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Service role can insert (backend triggers)
DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;
CREATE POLICY "Service role can insert notifications"
    ON notifications
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- No delete policy - notifications are historical logs

-- =========================================================
-- GRANT PERMISSIONS
-- =========================================================

-- Authenticated users (restricted by RLS to admins)
GRANT SELECT, UPDATE ON notifications TO authenticated;

-- Service role gets full access (used by backend)
GRANT ALL ON notifications TO service_role;

-- =========================================================
-- SUCCESS MESSAGE
-- =========================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Notifications table and RLS policies created.';
END $$;
