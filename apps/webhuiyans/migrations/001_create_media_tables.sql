-- =========================================================
-- We Bhuiyans Media Database Migration
-- Version: 001
-- Date: 2025-12-16
-- Description: Create photo_albums and photos tables
-- =========================================================

-- =========================================================
-- TABLE: photo_albums
-- =========================================================
-- Stores photo album metadata. Albums are optional containers
-- for organizing photos.

CREATE TABLE IF NOT EXISTS photo_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    cover_photo_id UUID, -- Will be foreign key after photos table exists
    created_by UUID NOT NULL, -- References auth.users
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE photo_albums IS 'Photo album containers for organizing family photos';
COMMENT ON COLUMN photo_albums.id IS 'Unique album identifier';
COMMENT ON COLUMN photo_albums.title IS 'Album title (required)';
COMMENT ON COLUMN photo_albums.description IS 'Optional album description';
COMMENT ON COLUMN photo_albums.cover_photo_id IS 'Optional cover photo reference';
COMMENT ON COLUMN photo_albums.created_by IS 'Admin user who created the album';
COMMENT ON COLUMN photo_albums.created_at IS 'Album creation timestamp';
COMMENT ON COLUMN photo_albums.updated_at IS 'Last update timestamp';

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_photo_albums_created_by ON photo_albums(created_by);
CREATE INDEX IF NOT EXISTS idx_photo_albums_created_at ON photo_albums(created_at DESC);

-- =========================================================
-- TABLE: photos
-- =========================================================
-- Stores individual photo metadata. Photos may belong to an
-- album or exist independently. Cloudinary handles actual file storage.

CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID REFERENCES photo_albums(id) ON DELETE SET NULL,
    public_id TEXT NOT NULL UNIQUE, -- Cloudinary public_id
    secure_url TEXT NOT NULL, -- Cloudinary secure URL
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    format TEXT NOT NULL,
    caption TEXT,
    tags TEXT[], -- Array of tags for organization
    uploaded_by UUID NOT NULL, -- References auth.users
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE photos IS 'Individual photos with Cloudinary storage references';
COMMENT ON COLUMN photos.id IS 'Unique photo identifier';
COMMENT ON COLUMN photos.album_id IS 'Optional album reference (null = standalone photo)';
COMMENT ON COLUMN photos.public_id IS 'Cloudinary public_id for image operations';
COMMENT ON COLUMN photos.secure_url IS 'Cloudinary HTTPS URL for display';
COMMENT ON COLUMN photos.width IS 'Image width in pixels';
COMMENT ON COLUMN photos.height IS 'Image height in pixels';
COMMENT ON COLUMN photos.format IS 'Image format (jpg, png, webp, etc.)';
COMMENT ON COLUMN photos.caption IS 'Optional photo caption/description';
COMMENT ON COLUMN photos.tags IS 'Array of tags for categorization';
COMMENT ON COLUMN photos.uploaded_by IS 'Admin user who uploaded the photo';
COMMENT ON COLUMN photos.created_at IS 'Upload timestamp';
COMMENT ON COLUMN photos.updated_at IS 'Last update timestamp';

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_photos_album_id ON photos(album_id);
CREATE INDEX IF NOT EXISTS idx_photos_uploaded_by ON photos(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_public_id ON photos(public_id);
CREATE INDEX IF NOT EXISTS idx_photos_tags ON photos USING GIN(tags);

-- =========================================================
-- FOREIGN KEY: photo_albums.cover_photo_id
-- =========================================================
-- Add foreign key after photos table exists

ALTER TABLE photo_albums
ADD CONSTRAINT fk_photo_albums_cover_photo
FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL;

-- =========================================================
-- TRIGGERS: Auto-update updated_at
-- =========================================================

-- Function to update timestamps
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
-- SUCCESS MESSAGE
-- =========================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Media tables created successfully: photo_albums, photos';
END $$;
