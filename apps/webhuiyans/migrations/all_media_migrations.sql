-- =========================================================
-- We Bhuiyans Media Database - Complete Migration
-- =========================================================
-- This file combines all media migrations for easy execution.
-- Run this in Supabase SQL Editor or via psql.
--
-- Order:
-- 1. Create tables (photo_albums, photos)
-- 2. Apply RLS policies
-- 3. Seed example data
-- =========================================================

-- =========================================================
-- PART 1: CREATE TABLES
-- =========================================================

-- Table: photo_albums
CREATE TABLE IF NOT EXISTS photo_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    cover_photo_id UUID,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE photo_albums IS 'Photo album containers for organizing family photos';

-- Indexes for photo_albums
CREATE INDEX IF NOT EXISTS idx_photo_albums_created_by ON photo_albums(created_by);
CREATE INDEX IF NOT EXISTS idx_photo_albums_created_at ON photo_albums(created_at DESC);

-- Table: photos
CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID REFERENCES photo_albums(id) ON DELETE SET NULL,
    public_id TEXT NOT NULL UNIQUE,
    secure_url TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    format TEXT NOT NULL,
    caption TEXT,
    tags TEXT[],
    uploaded_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE photos IS 'Individual photos with Cloudinary storage references';

-- Indexes for photos
CREATE INDEX IF NOT EXISTS idx_photos_album_id ON photos(album_id);
CREATE INDEX IF NOT EXISTS idx_photos_uploaded_by ON photos(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_public_id ON photos(public_id);
CREATE INDEX IF NOT EXISTS idx_photos_tags ON photos USING GIN(tags);

-- Foreign key for cover photo
ALTER TABLE photo_albums
DROP CONSTRAINT IF EXISTS fk_photo_albums_cover_photo;

ALTER TABLE photo_albums
ADD CONSTRAINT fk_photo_albums_cover_photo
FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL;

-- Auto-update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for photo_albums
DROP TRIGGER IF EXISTS set_photo_albums_updated_at ON photo_albums;
CREATE TRIGGER set_photo_albums_updated_at
    BEFORE UPDATE ON photo_albums
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for photos
DROP TRIGGER IF EXISTS set_photos_updated_at ON photos;
CREATE TRIGGER set_photos_updated_at
    BEFORE UPDATE ON photos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =========================================================
-- PART 2: ROW LEVEL SECURITY
-- =========================================================

-- Helper function to check admin role
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

-- Enable RLS
ALTER TABLE photo_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Policies for photo_albums
DROP POLICY IF EXISTS "Public can view albums" ON photo_albums;
CREATE POLICY "Public can view albums"
    ON photo_albums FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can insert albums" ON photo_albums;
CREATE POLICY "Admins can insert albums"
    ON photo_albums FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update albums" ON photo_albums;
CREATE POLICY "Admins can update albums"
    ON photo_albums FOR UPDATE TO authenticated
    USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete albums" ON photo_albums;
CREATE POLICY "Admins can delete albums"
    ON photo_albums FOR DELETE TO authenticated USING (is_admin());

-- Policies for photos
DROP POLICY IF EXISTS "Public can view photos" ON photos;
CREATE POLICY "Public can view photos"
    ON photos FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can insert photos" ON photos;
CREATE POLICY "Admins can insert photos"
    ON photos FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update photos" ON photos;
CREATE POLICY "Admins can update photos"
    ON photos FOR UPDATE TO authenticated
    USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete photos" ON photos;
CREATE POLICY "Admins can delete photos"
    ON photos FOR DELETE TO authenticated USING (is_admin());

-- Grant permissions
GRANT SELECT ON photo_albums TO anon;
GRANT SELECT ON photos TO anon;
GRANT SELECT ON photo_albums TO authenticated;
GRANT SELECT ON photos TO authenticated;
GRANT ALL ON photo_albums TO service_role;
GRANT ALL ON photos TO service_role;

-- =========================================================
-- PART 3: SEED DATA (Optional)
-- =========================================================
-- Uncomment the block below to seed example data.
-- Make sure an admin user exists in the profiles table.

/*
DO $$
DECLARE
    admin_user_id UUID;
    album_id UUID;
    photo_id UUID;
BEGIN
    SELECT id INTO admin_user_id FROM profiles WHERE role = 'admin' LIMIT 1;
    
    IF admin_user_id IS NULL THEN
        RAISE NOTICE 'No admin user found. Skipping seed data.';
        RETURN;
    END IF;

    INSERT INTO photo_albums (title, description, created_by)
    VALUES ('Family Gatherings', 'Photos from family gatherings.', admin_user_id)
    RETURNING id INTO album_id;

    INSERT INTO photos (album_id, public_id, secure_url, width, height, format, caption, tags, uploaded_by)
    VALUES (
        album_id,
        'we-bhuiyans/placeholder_family_photo',
        'https://res.cloudinary.com/dbbylgyxe/image/upload/v1/we-bhuiyans/placeholder_family_photo.jpg',
        1920, 1080, 'jpg',
        'Example family photo',
        ARRAY['family', 'example'],
        admin_user_id
    )
    RETURNING id INTO photo_id;

    UPDATE photo_albums SET cover_photo_id = photo_id WHERE id = album_id;

    RAISE NOTICE 'Seed data created: Album %, Photo %', album_id, photo_id;
END $$;
*/

-- =========================================================
-- VERIFICATION
-- =========================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=========================================';
    RAISE NOTICE '✅ MEDIA DATABASE MIGRATION COMPLETE';
    RAISE NOTICE '=========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  • photo_albums';
    RAISE NOTICE '  • photos';
    RAISE NOTICE '';
    RAISE NOTICE 'RLS Policies applied:';
    RAISE NOTICE '  • Public: SELECT only';
    RAISE NOTICE '  • Admin: ALL operations';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Verify tables in Supabase dashboard';
    RAISE NOTICE '  2. Uncomment seed data if needed';
    RAISE NOTICE '  3. Test with backend API';
    RAISE NOTICE '=========================================';
END $$;
