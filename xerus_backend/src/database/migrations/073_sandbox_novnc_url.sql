-- Migration: Add sandbox_novnc_url column to workspaces
-- Stores the noVNC preview URL for browser access via port 6080

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS sandbox_novnc_url TEXT;

COMMENT ON COLUMN workspaces.sandbox_novnc_url IS 'noVNC URL for browser access via port 6080 preview link. Set at sandbox creation, cleared on kill.';
