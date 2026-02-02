-- =========================================================
-- We Bhuiyans Media Seed Data
-- Version: 003
-- Date: 2025-12-16
-- Description: Seed example album and photo for testing
-- =========================================================

-- =========================================================
-- NOTE: This script requires:
-- 1. An admin user already exists in auth.users and profiles
-- 2. The photo_albums and photos tables are created
-- 3. To update the admin_user_id below with a real admin UUID
-- =========================================================

-- =========================================================
-- GET ADMIN USER (or use placeholder)
-- =========================================================
-- This variable stores the admin user ID. Update with real admin UUID.

DO $$
DECLARE
    admin_user_id UUID;
    album_id UUID;
    photo_id UUID;
BEGIN
    -- Try to find an existing admin user
    SELECT id INTO admin_user_id
    FROM profiles
    WHERE role = 'admin'
    LIMIT 1;

    -- If no admin found, use a placeholder (will fail RLS if not valid)
    IF admin_user_id IS NULL THEN
        RAISE NOTICE '⚠️ No admin user found. Using placeholder UUID.';
        admin_user_id := '00000000-0000-0000-0000-000000000000';
    ELSE
        RAISE NOTICE '✅ Found admin user: %', admin_user_id;
    END IF;

    -- =========================================================
    -- SEED: Example Photo Album
    -- =========================================================
    
    INSERT INTO photo_albums (
        title,
        description,
        created_by
    )
    VALUES (
        'Family Gatherings',
        'Photos from various family gatherings, celebrations, and reunions.',
        admin_user_id
    )
    RETURNING id INTO album_id;

    RAISE NOTICE '✅ Created album: Family Gatherings (ID: %)', album_id;

    -- =========================================================
    -- SEED: Example Photo
    -- =========================================================
    -- This is a placeholder photo entry. Replace with a real Cloudinary URL.
    
    INSERT INTO photos (
        album_id,
        public_id,
        secure_url,
        width,
        height,
        format,
        caption,
        tags,
        uploaded_by
    )
    VALUES (
        album_id,
        'we-bhuiyans/placeholder_family_photo',
        'https://res.cloudinary.com/dbbylgyxe/image/upload/v1/we-bhuiyans/placeholder_family_photo.jpg',
        1920,
        1080,
        'jpg',
        'Example family photo - replace with real content',
        ARRAY['family', 'gathering', 'example'],
        admin_user_id
    )
    RETURNING id INTO photo_id;

    RAISE NOTICE '✅ Created photo: Example family photo (ID: %)', photo_id;

    -- =========================================================
    -- UPDATE: Set album cover photo
    -- =========================================================
    
    UPDATE photo_albums
    SET cover_photo_id = photo_id
    WHERE id = album_id;

    RAISE NOTICE '✅ Set album cover photo';

    -- =========================================================
    -- SUMMARY
    -- =========================================================
    RAISE NOTICE '=========================================';
    RAISE NOTICE '✅ Seed data created successfully!';
    RAISE NOTICE '   Album ID: %', album_id;
    RAISE NOTICE '   Photo ID: %', photo_id;
    RAISE NOTICE '=========================================';

END $$;

-- =========================================================
-- VERIFY SEED DATA
-- =========================================================

-- Show created albums
SELECT 
    id,
    title,
    description,
    created_at
FROM photo_albums
ORDER BY created_at DESC
LIMIT 5;

-- Show created photos
SELECT 
    id,
    album_id,
    public_id,
    caption,
    tags,
    created_at
FROM photos
ORDER BY created_at DESC
LIMIT 5;
