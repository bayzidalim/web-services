-- =========================================================
-- Stories Table Migration
-- Version: 004
-- Date: 2025-12-16
-- Description: Create stories and story_images tables
-- =========================================================

-- Table: stories
CREATE TABLE IF NOT EXISTS stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT,
    language TEXT CHECK (language IN ('en', 'bn', 'mixed')),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published BOOLEAN NOT NULL DEFAULT TRUE
);

-- Table: story_images
CREATE TABLE IF NOT EXISTS story_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
    public_id TEXT NOT NULL,
    secure_url TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    caption TEXT
);

-- Indexes for stories
CREATE INDEX IF NOT EXISTS idx_stories_created_by ON stories(created_by);
CREATE INDEX IF NOT EXISTS idx_stories_published ON stories(published);
CREATE INDEX IF NOT EXISTS idx_stories_created_at ON stories(created_at DESC);

-- Indexes for story_images
CREATE INDEX IF NOT EXISTS idx_story_images_story_id ON story_images(story_id);
CREATE INDEX IF NOT EXISTS idx_story_images_public_id ON story_images(public_id);

-- Trigger to auto-update updated_at for stories
CREATE OR REPLACE FUNCTION update_story_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_story_updated_at ON stories;
CREATE TRIGGER set_story_updated_at BEFORE UPDATE ON stories FOR EACH ROW EXECUTE FUNCTION update_story_updated_at();

-- Success notice
DO $$
BEGIN
    RAISE NOTICE '✅ Stories tables created successfully';
END $$;
