// Task Domain Constants
// Extracted from task.routes.ts for file size compliance

export const VALID_STATUSES = new Set(['todo', 'in_progress', 'done', 'needs_approval']);
export const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);

// DB status -> sandbox status mapping (frontend uses todo/in_progress/done, agent uses open/in_progress/done)
export const DB_TO_SANDBOX_STATUS: Record<string, string> = {
    todo: 'open',
    in_progress: 'in_progress',
    done: 'closed',
    needs_approval: 'needs_approval',
};

// Sandbox status -> DB status mapping (agent uses open/in_progress/closed/blocked)
export const SANDBOX_TO_DB_STATUS: Record<string, string> = {
    open: 'todo',
    in_progress: 'in_progress',
    closed: 'done',
    blocked: 'todo',
};
