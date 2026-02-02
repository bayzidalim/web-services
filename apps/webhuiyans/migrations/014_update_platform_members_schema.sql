-- =========================================================
-- We Bhuiyans Auth Schema Update
-- Version: 014
-- Date: 2025-12-18
-- Description: Update platform_members for new auth requirements
-- =========================================================

-- 1. Add is_admin column
ALTER TABLE platform_members ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. Update Role Check Constraint
-- We need to drop the old one and add a new one that includes 'member'
ALTER TABLE platform_members DROP CONSTRAINT IF EXISTS platform_members_role_check;
ALTER TABLE platform_members ADD CONSTRAINT platform_members_role_check 
    CHECK (role IN ('admin', 'member', 'family', 'outsider', 'historian', 'guest'));

-- 3. Update Status Check Constraint
-- We need to include 'active'
ALTER TABLE platform_members DROP CONSTRAINT IF EXISTS platform_members_status_check;
ALTER TABLE platform_members ADD CONSTRAINT platform_members_status_check 
    CHECK (status IN ('active', 'pending', 'approved', 'rejected', 'suspended'));

-- 4. Migrate existing data if necessary (optional safeguard)
-- If we had data, we might want to map 'family' -> 'member' or similar. 
-- For now, we assume fresh or compatible data.

-- SUCCESS MESSAGE
DO $$
BEGIN
    RAISE NOTICE '✅ Platform members schema updated successfully';
END $$;
