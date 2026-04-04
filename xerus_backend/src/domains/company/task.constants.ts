// Task Domain Constants
// Workspace DB is source of truth. Statuses/priorities match workspace-schema.sql.

export const VALID_STATUSES = new Set(['open', 'in_progress', 'blocked', 'completed', 'cancelled']);
export const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
