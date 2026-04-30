-- Add sandbox_plan column to workspaces table.
-- Tracks what resource tier the sandbox was last sized at.
-- Drift between users.plan_type and workspaces.sandbox_plan triggers frontend resize/recreate modal.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS sandbox_plan VARCHAR(20);

UPDATE workspaces SET sandbox_plan = u.plan_type
FROM users u
WHERE workspaces.user_id = u.user_id
  AND workspaces.sandbox_id IS NOT NULL
  AND workspaces.sandbox_plan IS NULL;
