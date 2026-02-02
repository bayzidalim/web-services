-- =========================================================
-- We Bhuiyans Migration
-- Version: 013
-- Date: 2025-12-18
-- Description: Add is_seed column for test data management
-- =========================================================

-- Add is_seed to platform_members
ALTER TABLE platform_members 
ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT FALSE;

-- Add is_seed to member_posts
ALTER TABLE member_posts 
ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT FALSE;

-- Add is_seed to post_comments
ALTER TABLE post_comments 
ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT FALSE;

-- Index for faster cleanup
CREATE INDEX IF NOT EXISTS idx_platform_members_is_seed ON platform_members(is_seed);
CREATE INDEX IF NOT EXISTS idx_member_posts_is_seed ON member_posts(is_seed);
