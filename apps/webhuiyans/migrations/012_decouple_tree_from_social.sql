-- =========================================================
-- We Bhuiyans Decoupling Migration
-- Version: 012
-- Date: 2025-12-18
-- Description: Decouple Family Tree from Social Platform
-- =========================================================

-- 1. Create platform_members table
CREATE TABLE IF NOT EXISTS platform_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE, -- References auth.users from Supabase
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('admin', 'family', 'outsider', 'historian', 'guest')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    claimed_tree_person_id UUID, -- Optional reference to Tree (historical person), NO FK
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Modify existing social tables to link to platform_members instead of family_members

-- Update member_profiles (Social Profiles)
-- First, drop the FK to family_members
ALTER TABLE member_profiles DROP CONSTRAINT IF EXISTS member_profiles_member_id_fkey;
-- Rename column to clarify it's a platform member
ALTER TABLE member_profiles RENAME COLUMN member_id TO platform_member_id;
-- Add new FK to platform_members
ALTER TABLE member_profiles ADD CONSTRAINT member_profiles_platform_member_id_fkey 
    FOREIGN KEY (platform_member_id) REFERENCES platform_members(id) ON DELETE CASCADE;

-- Update member_posts (Social Posts)
-- Drop old FK to family_members
ALTER TABLE member_posts DROP CONSTRAINT IF EXISTS member_posts_member_id_fkey;
-- Rename column
ALTER TABLE member_posts RENAME COLUMN member_id TO platform_member_id;
-- Add new FK to platform_members
ALTER TABLE member_posts ADD CONSTRAINT member_posts_platform_member_id_fkey 
    FOREIGN KEY (platform_member_id) REFERENCES platform_members(id) ON DELETE CASCADE;

-- Update post_comments
-- Drop old FK to family_members
ALTER TABLE post_comments DROP CONSTRAINT IF EXISTS post_comments_author_member_id_fkey;
-- Rename column
ALTER TABLE post_comments RENAME COLUMN author_member_id TO author_platform_member_id;
-- Add new FK to platform_members (nullable as per requirements "or anonymous")
ALTER TABLE post_comments ADD CONSTRAINT post_comments_author_platform_member_id_fkey 
    FOREIGN KEY (author_platform_member_id) REFERENCES platform_members(id) ON DELETE SET NULL;

-- 3. Trigger for platform_members updated_at
DROP TRIGGER IF EXISTS set_platform_members_updated_at ON platform_members;
CREATE TRIGGER set_platform_members_updated_at
    BEFORE UPDATE ON platform_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Initial sync: Create platform_members for existing auth users if they don't exist
-- Note: This depends on auth.users being accessible or being handled in code.
-- For now, we leave the tables empty or let the admin create them.

-- SUCCESS MESSAGE
DO $$
BEGIN
    RAISE NOTICE '✅ Decoupling migration completed successfully';
END $$;
