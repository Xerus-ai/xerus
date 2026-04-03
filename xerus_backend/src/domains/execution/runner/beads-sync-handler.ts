// Beads Task Sync Handler
// Detects bd close/update in Bash tool calls for logging/observability.
// Tasks now live in workspace.db — the beads tool writes there directly.
// No metadata_sync emission needed; this handler logs task lifecycle events only.

import type { StdoutEmitter } from './stdout-emitter';

interface BeadsSyncContext {
    agentSlug: string;
    workspacePath: string;
}

/**
 * Detect bd close/update in a Bash command and log the event.
 * Workspace DB is the source of truth for tasks — the beads tool writes
 * to both workspace.db and .beads/issues.jsonl natively. No Neon sync needed.
 */
export async function handleBeadsSync(
    ctx: BeadsSyncContext,
    emitter: StdoutEmitter,
    bashCmd: string,
): Promise<void> {
    // Fast string check before regex (avoid regex engine for 99% of calls)
    if (!bashCmd.includes('bd ')) return;

    const bdCloseMatch = bashCmd.match(/bd\s+close\s+([^\s;"&|]+)/);
    const bdUpdateMatch = bashCmd.match(/bd\s+update\s+([^\s;"&|]+)\s+--status\s+(\S+)/);

    if (!bdCloseMatch && !bdUpdateMatch) return;

    const taskId = bdCloseMatch ? bdCloseMatch[1] : bdUpdateMatch![1];
    const newStatus = bdCloseMatch ? 'closed' : bdUpdateMatch![2];

    // Validate task ID format (security: prevent path traversal)
    if (!/^[a-zA-Z0-9._-]+$/.test(taskId)) return;

    // Log for observability — workspace DB handles persistence natively
    emitter.hookLog(
        'PostToolUse',
        ctx.agentSlug,
        0,
        true,
        `Task ${taskId} detected (${newStatus}) — workspace DB is source of truth`,
    );
}
