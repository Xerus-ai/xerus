-- Migration: Add 'intervention_required' to execution_pause_states reason CHECK constraint
-- Supports browser CAPTCHA, payment, 2FA, content approval, and generic intervention scenarios

-- Drop existing CHECK constraint and recreate with new value
ALTER TABLE execution_pause_states
    DROP CONSTRAINT IF EXISTS pause_states_reason_check;

ALTER TABLE execution_pause_states
    ADD CONSTRAINT pause_states_reason_check
    CHECK (reason IN ('approval_required', 'budget_exceeded', 'error', 'manual', 'permission_denied', 'intervention_required'));

COMMENT ON COLUMN execution_pause_states.reason IS 'approval_required, budget_exceeded, error, manual, permission_denied, intervention_required';
