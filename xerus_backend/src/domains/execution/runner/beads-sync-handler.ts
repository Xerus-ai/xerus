// Beads Task Sync Handler
// Detects bd close/update in Bash tool calls and emits metadata_sync
// so the backend DB + frontend Kanban stay in sync with workspace .beads/.
//
// Extracted from runtime-hook-factory.ts for <400 line compliance.

import fs from 'fs/promises';
import path from 'path';
import type { StdoutEmitter } from './stdout-emitter';

interface BeadsSyncContext {
    agentSlug: string;
    workspacePath: string;
}

/**
 * Detect bd close/update in a Bash command and emit metadata_sync if found.
 * Reads the agent's CLAUDE.md to resolve the channel, then reads the updated
 * task from channel .beads/issues.jsonl.
 *
 * Also scans all channel boards if the primary channel lookup fails,
 * to handle cross-channel task assignments.
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

    try {
        // Resolve channel from cached .channel-path (written by session-start.sh)
        // Falls back to CLAUDE.md parsing if cache doesn't exist
        let channelTag = '';
        const cachedPath = path.join(ctx.workspacePath, 'agents', ctx.agentSlug, '.channel-path');
        try {
            const cached = (await fs.readFile(cachedPath, 'utf-8')).trim();
            const match = cached.match(/projects\/([^/]+)\/channels\/([^/]+)/);
            if (match) channelTag = `${match[1]}/${match[2]}`;
        } catch {
            // Fall back to CLAUDE.md parsing
            try {
                const claudePath = path.join(ctx.workspacePath, 'agents', ctx.agentSlug, 'CLAUDE.md');
                const content = await fs.readFile(claudePath, 'utf-8');
                const match = content.match(/Primary:\s*projects\/([^/\s]+)\/channels\/([^/\s]+)/);
                if (match) channelTag = `${match[1]}/${match[2]}`;
            } catch { /* no CLAUDE.md */ }
        }

        // Try to find the task in the resolved channel or scan all channels
        const taskData = await findTask(ctx.workspacePath, channelTag, taskId);

        if (taskData) {
            // Validate resolved path stays within workspace
            const resolvedChannel = taskData._channelTag || channelTag;

            emitter.emit({
                event: 'metadata_sync',
                agent_slug: ctx.agentSlug,
                data: {
                    entity: 'task',
                    action: bdCloseMatch ? 'close' : 'update',
                    payload: {
                        id: taskId,
                        channel_id: resolvedChannel,
                        title: taskData.title ?? '',
                        description: taskData.description ?? '',
                        status: newStatus,
                        priority: taskData.priority ?? 'medium',
                        assigned_agents: taskData.assigned_agents ?? [],
                        subtasks: taskData.subtasks ?? [],
                    },
                },
            });
            emitter.hookLog('PostToolUse', ctx.agentSlug, 0, true, `Synced task ${taskId} (${newStatus})`);
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emitter.hookLog('PostToolUse', ctx.agentSlug, 0, false, `Task sync failed: ${msg}`);
    }
}

/**
 * Find a task by ID, first in the specified channel, then scanning all channels.
 */
async function findTask(
    workspacePath: string,
    channelTag: string,
    taskId: string,
): Promise<Record<string, unknown> | null> {
    // Try specified channel first
    if (channelTag) {
        const parts = channelTag.split('/');
        const issuesPath = path.join(workspacePath, 'projects', parts[0], 'channels', parts[1], '.beads', 'issues.jsonl');
        const resolved = path.resolve(issuesPath);
        if (!resolved.startsWith(path.resolve(workspacePath) + path.sep)) return null;

        const found = await searchIssuesFile(issuesPath, taskId);
        if (found) {
            found._channelTag = channelTag;
            return found;
        }
    }

    // Scan all channels (for cross-channel assignments)
    try {
        const projectsDir = path.join(workspacePath, 'projects');
        const domains = await fs.readdir(projectsDir).catch(() => [] as string[]);
        for (const domain of domains) {
            const channelsDir = path.join(projectsDir, domain, 'channels');
            const channels = await fs.readdir(channelsDir).catch(() => [] as string[]);
            for (const channel of channels) {
                const issuesPath = path.join(channelsDir, channel, '.beads', 'issues.jsonl');
                const found = await searchIssuesFile(issuesPath, taskId);
                if (found) {
                    found._channelTag = `${domain}/${channel}`;
                    return found;
                }
            }
        }
    } catch { /* scan failed */ }

    return null;
}

async function searchIssuesFile(
    issuesPath: string,
    taskId: string,
): Promise<Record<string, unknown> | null> {
    try {
        const content = await fs.readFile(issuesPath, 'utf-8');
        for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
                const entry = JSON.parse(line) as Record<string, unknown>;
                if (entry.id === taskId) return entry;
            } catch { continue; }
        }
    } catch { /* file doesn't exist */ }
    return null;
}
