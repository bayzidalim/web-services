-- =========================================================
-- We Bhuiyans Member Posts Migration
-- Version: 009
-- Date: 2025-12-18
-- Description: Create member_posts table for timeline
-- =========================================================

CREATE TABLE IF NOT EXISTS member_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    content TEXT,
    media_urls JSONB DEFAULT '[]'::jsonb,
    created_by UUID NOT NULL, -- References auth.users
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE member_posts IS 'Timeline posts for family members';
COMMENT ON COLUMN member_posts.id IS 'Unique post identifier';
COMMENT ON COLUMN member_posts.member_id IS 'Member this post belongs to';
COMMENT ON COLUMN member_posts.content IS 'Post text content';
COMMENT ON COLUMN member_posts.media_urls IS 'JSON array of media URLs (images/videos)';
COMMENT ON COLUMN member_posts.created_by IS 'Admin user who created the post';
COMMENT ON COLUMN member_posts.created_at IS 'Post creation timestamp';

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_member_posts_member_id ON member_posts(member_id);
CREATE INDEX IF NOT EXISTS idx_member_posts_created_at ON member_posts(created_at DESC);

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS set_member_posts_updated_at ON member_posts;
CREATE TRIGGER set_member_posts_updated_at
    BEFORE UPDATE ON member_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- SUCCESS MESSAGE
DO $$
BEGIN
    RAISE NOTICE '✅ Member posts table created successfully';
END $$;
