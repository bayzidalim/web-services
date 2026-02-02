-- =========================================================
-- We Bhuiyans Member Profiles Migration
-- Version: 008
-- Date: 2025-12-18
-- Description: Create member_profiles table
-- =========================================================

CREATE TABLE IF NOT EXISTS member_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL UNIQUE REFERENCES family_members(id) ON DELETE CASCADE,
    bio TEXT,
    avatar_url TEXT,
    cover_url TEXT,
    visibility TEXT CHECK (visibility IN ('public', 'family')) DEFAULT 'family',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE member_profiles IS 'Social profile data for family members';
COMMENT ON COLUMN member_profiles.id IS 'Unique profile identifier';
COMMENT ON COLUMN member_profiles.member_id IS 'Reference to the family member';
COMMENT ON COLUMN member_profiles.bio IS 'Short biography/about section';
COMMENT ON COLUMN member_profiles.avatar_url IS 'URL to profile picture (1:1 aspect ratio)';
COMMENT ON COLUMN member_profiles.cover_url IS 'URL to cover image (16:9 aspect ratio)';
COMMENT ON COLUMN member_profiles.visibility IS 'Control who can see the profile (public or family only)';

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_member_profiles_member_id ON member_profiles(member_id);

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS set_member_profiles_updated_at ON member_profiles;
CREATE TRIGGER set_member_profiles_updated_at
    BEFORE UPDATE ON member_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- SUCCESS MESSAGE
DO $$
BEGIN
    RAISE NOTICE '✅ Member profiles table created successfully';
END $$;
