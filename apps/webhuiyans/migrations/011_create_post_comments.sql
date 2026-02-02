-- =========================================================
-- We Bhuiyans Post Comments Migration
-- Version: 011
-- Date: 2025-12-18
-- Description: Create post_comments table for direct feedback
-- =========================================================

CREATE TABLE IF NOT EXISTS post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES member_posts(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    author_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE post_comments IS 'Direct, unmoderated comments on timeline posts';
COMMENT ON COLUMN post_comments.id IS 'Unique comment identifier';
COMMENT ON COLUMN post_comments.post_id IS 'Reference to the post';
COMMENT ON COLUMN post_comments.author_name IS 'Name of the commenter (required)';
COMMENT ON COLUMN post_comments.author_member_id IS 'Optional link to family member profile';
COMMENT ON COLUMN post_comments.content IS 'Comment text content';
COMMENT ON COLUMN post_comments.created_at IS 'When the comment was posted';

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_created_at ON post_comments(created_at ASC);

-- SUCCESS MESSAGE
DO $$
BEGIN
    RAISE NOTICE '✅ Post comments table created successfully';
END $$;
