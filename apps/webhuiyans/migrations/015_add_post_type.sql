-- =========================================================
-- We Bhuiyans Migration
-- Version: 015
-- Date: 2025-12-19
-- Description: Add post_type to member_posts
-- =========================================================

-- Add post_type column with check constraint
ALTER TABLE member_posts 
ADD COLUMN IF NOT EXISTS post_type TEXT CHECK (post_type IN ('update', 'memory', 'announcement')) DEFAULT 'update';

COMMENT ON COLUMN member_posts.post_type IS 'Type of post: update, memory, or announcement';

-- SUCCESS MESSAGE
DO $$
BEGIN
    RAISE NOTICE '✅ Added post_type column to member_posts';
END $$;
