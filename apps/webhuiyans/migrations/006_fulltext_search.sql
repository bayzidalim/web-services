-- =========================================================
-- Full‑Text Search Migration
-- Version: 006
-- Date: 2025-12-16
-- Description: Add tsvector columns and GIN indexes for unified search
-- =========================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------
-- family_members: add search_vector column
-- ---------------------------------------------------------
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(full_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(birth_year::text, '')), 'B')
  ) STORED;

-- Trigger to update search_vector on changes (in case of future non‑generated columns)
CREATE OR REPLACE FUNCTION family_members_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.full_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.birth_year::text, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS family_members_search_vector_update ON family_members;
CREATE TRIGGER family_members_search_vector_update
BEFORE INSERT OR UPDATE ON family_members
FOR EACH ROW EXECUTE FUNCTION family_members_search_vector_trigger();

-- GIN index for fast search
CREATE INDEX IF NOT EXISTS idx_family_members_search ON family_members USING GIN (search_vector);

-- ---------------------------------------------------------
-- stories: add search_vector column
-- ---------------------------------------------------------
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'B')
  ) STORED;

CREATE OR REPLACE FUNCTION stories_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stories_search_vector_update ON stories;
CREATE TRIGGER stories_search_vector_update
BEFORE INSERT OR UPDATE ON stories
FOR EACH ROW EXECUTE FUNCTION stories_search_vector_trigger();

CREATE INDEX IF NOT EXISTS idx_stories_search ON stories USING GIN (search_vector);

-- ---------------------------------------------------------
-- photos: add search_vector column for caption
-- ---------------------------------------------------------
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(caption, '')), 'A')
  ) STORED;

CREATE OR REPLACE FUNCTION photos_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('simple', coalesce(NEW.caption, '')), 'A');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photos_search_vector_update ON photos;
CREATE TRIGGER photos_search_vector_update
BEFORE INSERT OR UPDATE ON photos
FOR EACH ROW EXECUTE FUNCTION photos_search_vector_trigger();

CREATE INDEX IF NOT EXISTS idx_photos_search ON photos USING GIN (search_vector);

-- Success notice
DO $$
BEGIN
    RAISE NOTICE '✅ Full‑text search columns and indexes created.';
END $$;
