-- =========================================================
-- We Bhuiyans Post Reactions Migration
-- Version: 010
-- Date: 2025-12-18
-- Description: Create post_reactions table
-- =========================================================

CREATE TABLE IF NOT EXISTS post_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES member_posts(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('like', 'respect')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE post_reactions IS 'Anonymous reactions for timeline posts';
COMMENT ON COLUMN post_reactions.id IS 'Unique reaction identifier';
COMMENT ON COLUMN post_reactions.post_id IS 'Reference to the post';
COMMENT ON COLUMN post_reactions.type IS 'Type of reaction (like or respect)';
COMMENT ON COLUMN post_reactions.created_at IS 'When the reaction was given';

-- Index for faster aggregation
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id_type ON post_reactions(post_id, type);

-- SUCCESS MESSAGE
DO $$
BEGIN
    RAISE NOTICE '✅ Post reactions table created successfully';
END $$;
