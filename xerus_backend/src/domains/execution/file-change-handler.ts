// File Change Handler
// Detects file writes from tool calls, broadcasts SSE events, and syncs to Neon.

import { logger } from '../../utils/logger';
import type { PipelineContext } from './execution-pipeline.types';
import { validateWorkspacePath } from '../../utils/path-validation';
import { assertToolCallData } from './runner-event-router.guards';
import { workspaceSSEBroadcaster, reverseSyncToDB } from '../drive';

const log = logger('FileChange');

const FILE_WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
const AGENT_CONFIG_PATTERN = /^agents\/([a-zA-Z0-9._-]+)\/config\.json$/;

export { FILE_WRITE_TOOLS };

export async function syncFileChangeToNeon(
    entry: { tool_name: string; arguments?: Record<string, unknown> },
    ctx: PipelineContext,
): Promise<void> {
    const args = entry.arguments;
    if (!args) return;

    const rawPath = typeof args.file_path === 'string' ? args.file_path
        : typeof args.path === 'string' ? args.path
        : undefined;
    if (!rawPath) return;

    const pathResult = validateWorkspacePath(rawPath);
    if (!pathResult.valid) return;

    const match = pathResult.normalized.match(AGENT_CONFIG_PATTERN);
    if (!match) return;

    const syncAction = entry.tool_name === 'Write' ? 'create' : 'update';
    await reverseSyncToDB(syncAction, pathResult.normalized, null, ctx.request.userId);
    log.debug('Neon agent_registry synced from tool_result', { path: pathResult.normalized, action: syncAction, user_id: ctx.request.userId });
}

export function emitFileChangedFromToolCall(d: Record<string, unknown>, ctx: PipelineContext): void {
    const tc = assertToolCallData(d);
    if (!tc.tool_name || !FILE_WRITE_TOOLS.has(tc.tool_name)) {
        return;
    }

    const args = tc.arguments;
    if (!args) return;

    const rawPath = typeof args.file_path === 'string' ? args.file_path
        : typeof args.path === 'string' ? args.path
        : typeof args.notebook_path === 'string' ? args.notebook_path
        : undefined;
    if (!rawPath) return;

    const pathResult = validateWorkspacePath(rawPath);
    if (!pathResult.valid) return;

    const action = tc.tool_name === 'Write' ? 'created' : 'modified';
    workspaceSSEBroadcaster.broadcastFileChanged(ctx.request.userId, {
        type: 'file_changed',
        path: pathResult.normalized,
        action,
        timestamp: new Date().toISOString(),
    });
}
