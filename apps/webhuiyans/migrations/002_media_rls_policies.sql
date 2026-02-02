-- =========================================================
-- We Bhuiyans Media Row Level Security Policies
-- Version: 002
-- Date: 2025-12-16
-- Description: Enable RLS with public read, admin write
-- =========================================================

-- =========================================================
-- HELPER FUNCTION: Check if user is admin
-- =========================================================
-- This function checks if the current authenticated user
-- has the 'admin' role in the profiles table.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_admin() IS 'Returns true if current user has admin role';

-- =========================================================
-- ENABLE ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE photo_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- POLICIES: photo_albums
-- =========================================================

-- Public can view all albums
DROP POLICY IF EXISTS "Public can view albums" ON photo_albums;
CREATE POLICY "Public can view albums"
    ON photo_albums
    FOR SELECT
    TO public
    USING (true);

-- Admins can insert albums
DROP POLICY IF EXISTS "Admins can insert albums" ON photo_albums;
CREATE POLICY "Admins can insert albums"
    ON photo_albums
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Admins can update albums
DROP POLICY IF EXISTS "Admins can update albums" ON photo_albums;
CREATE POLICY "Admins can update albums"
    ON photo_albums
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Admins can delete albums
DROP POLICY IF EXISTS "Admins can delete albums" ON photo_albums;
CREATE POLICY "Admins can delete albums"
    ON photo_albums
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- =========================================================
-- POLICIES: photos
-- =========================================================

-- Public can view all photos
DROP POLICY IF EXISTS "Public can view photos" ON photos;
CREATE POLICY "Public can view photos"
    ON photos
    FOR SELECT
    TO public
    USING (true);

-- Admins can insert photos
DROP POLICY IF EXISTS "Admins can insert photos" ON photos;
CREATE POLICY "Admins can insert photos"
    ON photos
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Admins can update photos
DROP POLICY IF EXISTS "Admins can update photos" ON photos;
CREATE POLICY "Admins can update photos"
    ON photos
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Admins can delete photos
DROP POLICY IF EXISTS "Admins can delete photos" ON photos;
CREATE POLICY "Admins can delete photos"
    ON photos
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- =========================================================
-- GRANT PERMISSIONS
-- =========================================================
-- Grant necessary permissions to roles

-- Anon role (unauthenticated visitors)
GRANT SELECT ON photo_albums TO anon;
GRANT SELECT ON photos TO anon;

-- Authenticated role (logged in users)
GRANT SELECT ON photo_albums TO authenticated;
GRANT SELECT ON photos TO authenticated;

-- Service role gets full access (used by backend)
GRANT ALL ON photo_albums TO service_role;
GRANT ALL ON photos TO service_role;

-- =========================================================
-- SUCCESS MESSAGE
-- =========================================================
DO $$
BEGIN
    RAISE NOTICE '✅ RLS policies applied: Public read, Admin write';
END $$;
