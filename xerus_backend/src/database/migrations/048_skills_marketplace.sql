-- Skills marketplace: add marketplace columns + make user_id nullable
-- user_id nullable is consistent with agents table (system entities have user_id = NULL)

-- Make user_id nullable for global/seeded marketplace skills
ALTER TABLE skills ALTER COLUMN user_id DROP NOT NULL;

-- Add marketplace columns
ALTER TABLE skills ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE skills ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS avatar_config VARCHAR(100);
ALTER TABLE skills ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0.0';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS file_count INTEGER DEFAULT 1;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS install_count INTEGER DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS author VARCHAR(255);
ALTER TABLE skills ADD COLUMN IF NOT EXISTS source_url VARCHAR(500);

-- GIN index for tag filtering
CREATE INDEX IF NOT EXISTS idx_skills_tags ON skills USING GIN(tags);
-- Category filtering
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
-- Marketplace browsing (published + global)
CREATE INDEX IF NOT EXISTS idx_skills_marketplace ON skills(is_published, is_global);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_skills_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_skills_updated_at ON skills;
CREATE TRIGGER trigger_skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW EXECUTE FUNCTION update_skills_updated_at();
