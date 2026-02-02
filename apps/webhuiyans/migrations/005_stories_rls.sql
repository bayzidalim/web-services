-- =========================================================
-- Stories RLS Policies Migration
-- Version: 005
-- Date: 2025-12-16
-- Description: Row Level Security for stories and story_images tables
-- =========================================================

-- Helper function to check admin role (reuse if exists)
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on tables
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_images ENABLE ROW LEVEL SECURITY;

-- Policies for stories
-- Public can view published stories
DROP POLICY IF EXISTS "Public can view published stories" ON stories;
CREATE POLICY "Public can view published stories"
    ON stories
    FOR SELECT
    TO public
    USING (published = true);

-- Admins can insert stories
DROP POLICY IF EXISTS "Admins can insert stories" ON stories;
CREATE POLICY "Admins can insert stories"
    ON stories
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Admins can update stories
DROP POLICY IF EXISTS "Admins can update stories" ON stories;
CREATE POLICY "Admins can update stories"
    ON stories
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Admins can delete stories
DROP POLICY IF EXISTS "Admins can delete stories" ON stories;
CREATE POLICY "Admins can delete stories"
    ON stories
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- Policies for story_images
-- Public can view images of published stories
DROP POLICY IF EXISTS "Public can view story images" ON story_images;
CREATE POLICY "Public can view story images"
    ON story_images
    FOR SELECT
    TO public
    USING (EXISTS (SELECT 1 FROM stories WHERE stories.id = story_images.story_id AND stories.published = true));

-- Admins can insert images
DROP POLICY IF EXISTS "Admins can insert story images" ON story_images;
CREATE POLICY "Admins can insert story images"
    ON story_images
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Admins can update images
DROP POLICY IF EXISTS "Admins can update story images" ON story_images;
CREATE POLICY "Admins can update story images"
    ON story_images
    FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Admins can delete images
DROP POLICY IF EXISTS "Admins can delete story images" ON story_images;
CREATE POLICY "Admins can delete story images"
    ON story_images
    FOR DELETE
    TO authenticated
    USING (is_admin());

-- Grant permissions
GRANT SELECT ON stories TO anon;
GRANT SELECT ON story_images TO anon;
GRANT SELECT ON stories TO authenticated;
GRANT SELECT ON story_images TO authenticated;
GRANT ALL ON stories TO service_role;
GRANT ALL ON story_images TO service_role;

-- Success notice
DO $$
BEGIN
    RAISE NOTICE '✅ RLS policies for stories applied';
END $$;
