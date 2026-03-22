// Shared Execution Types
// Types used across execution and history domains.
// Extracted to break circular dependency: execution <-> history.

// -----------------------------------------------------------------------------
// Execution Status
// -----------------------------------------------------------------------------

export const EXECUTION_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

// -----------------------------------------------------------------------------
// Pause Types (used by HITL in execution, stored in history)
// -----------------------------------------------------------------------------

export type PauseReason = 'approval_required' | 'budget_exceeded' | 'error' | 'manual' | 'permission_denied' | 'intervention_required';
export type PauseResolution = 'approved' | 'rejected' | 'timeout' | 'cancelled';

// -----------------------------------------------------------------------------
// Coordination Modes (shared between execution and memory domains)
// -----------------------------------------------------------------------------

export const COORDINATION_MODES = ['sequential', 'parallel', 'hierarchical', 'consensus'] as const;

export type CoordinationMode = (typeof COORDINATION_MODES)[number];
