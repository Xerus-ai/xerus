// Platform MCP Operations Handlers — Tasks, Heartbeat, Session, Memory, Triggers, Outputs
// Handlers for: create_task, configure_heartbeat, pause/resume/get_session_state,
// query/write/analyze_memory, register/list/deregister_trigger, search_outputs
//
// Reference: platform-tool.schemas.ts (canonical schemas)

import fs from 'fs/promises';
import path from 'path';
import type { MetadataSyncFn } from './platform-mcp-handlers';
import { getWorkspacePath, fileExists, ensureDir } from './platform-mcp-utils';

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function handleCreateTask(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const channelId = args.channel_id as string;
    const title = args.title as string;
    const description = (args.description as string) || '';
    const priority = (args.priority as string) || 'medium';
    const assignedAgentIds = (args.assigned_agent_ids as string[]) || [];
    const subtasks = (args.subtasks as string[]) || [];
    const ws = getWorkspacePath();

    const parts = channelId.split('/');
    let beadsDir: string;
    if (parts.length >= 2) {
        beadsDir = path.join(ws, 'projects', parts[0], 'channels', parts[1], '.beads');
    } else {
        const projectsDir = path.join(ws, 'projects');
        if (!(await fileExists(projectsDir))) throw new Error(`Channel '${channelId}' not found.`);
        const domains = await fs.readdir(projectsDir, { withFileTypes: true });
        let found = false;
        beadsDir = '';
        for (const domain of domains) {
            if (!domain.isDirectory()) continue;
            const candidate = path.join(projectsDir, domain.name, 'channels', channelId, '.beads');
            if (await fileExists(candidate)) { beadsDir = candidate; found = true; break; }
        }
        if (!found) throw new Error(`Channel '${channelId}' not found.`);
    }

    await ensureDir(beadsDir);
    const issuesPath = path.join(beadsDir, 'issues.jsonl');
    const task = {
        id: `task-${Date.now()}`,
        channel_id: channelId,
        title, description, priority,
        assigned_agents: assignedAgentIds,
        subtasks: subtasks.map(s => ({ text: s, done: false })),
        status: 'open',
        created_at: new Date().toISOString(),
    };

    await fs.appendFile(issuesPath, JSON.stringify(task) + '\n');
    emitSync('task', 'create', task);
    return `Created task '${title}' (${task.id}) with priority ${priority}.`;
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

export async function handleConfigureHeartbeat(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const agentId = args.agent_id as string;
    const ws = getWorkspacePath();
    const hbPath = path.join(ws, 'agents', agentId, 'HEARTBEAT.md');

    if (!(await fileExists(path.join(ws, 'agents', agentId)))) {
        throw new Error(`Agent '${agentId}' does not exist.`);
    }

    const enabled = args.enabled !== false;
    const cron = (args.cron_expression as string) || '';
    const tz = (args.timezone as string) || '';
    const startHour = (args.active_hours_start as string) || '';
    const endHour = (args.active_hours_end as string) || '';
    const weekdaysOnly = (args.weekdays_only as boolean) || false;
    const prompt = (args.prompt as string) || '';

    const lines: string[] = [`# ${agentId} Heartbeat`, ''];
    lines.push('## Scheduled', '');
    if (!enabled) {
        lines.push('Heartbeat disabled.', '');
    } else {
        if (cron) lines.push(`Cron: ${cron}`);
        if (tz) lines.push(`Timezone: ${tz}`);
        if (startHour && endHour) lines.push(`Active Hours: ${startHour} - ${endHour}`);
        if (weekdaysOnly) lines.push('Weekdays Only: true');
        if (prompt) lines.push('', `Prompt: ${prompt}`);
        lines.push('');
    }
    lines.push('## Events', '');

    await fs.writeFile(hbPath, lines.join('\n'));

    emitSync('heartbeat', 'configure', {
        agent_id: agentId,
        enabled,
        cron_expression: cron || '0 */4 * * *',
        timezone: tz || 'UTC',
        active_hours_start: startHour || null,
        active_hours_end: endHour || null,
        weekdays_only: weekdaysOnly,
        prompt: prompt || null,
    });

    return `Configured heartbeat for '${agentId}'.${cron ? ` Schedule: ${cron}` : ''}`;
}

// ---------------------------------------------------------------------------
// Session Control (backend-dependent — emit metadata_sync)
// ---------------------------------------------------------------------------

export async function handlePauseExecution(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const sessionId = args.session_id as string;
    if (!sessionId) {
        throw new Error('pause_execution requires session_id');
    }
    const reason = (args.reason as string) || 'user_requested';
    const agentSlug = args.agent_slug as string | undefined;
    emitSync('session', 'pause', { session_id: sessionId, reason, agent_slug: agentSlug });
    return `Pause request submitted for session '${sessionId}'. Reason: ${reason}`;
}

export async function handleResumeExecution(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const sessionId = args.session_id as string;
    if (!sessionId) {
        throw new Error('resume_execution requires session_id');
    }
    const approved = args.approved as boolean;
    const feedback = (args.feedback as string) || '';
    emitSync('session', 'resume', { session_id: sessionId, approved, feedback });
    return approved
        ? `Resume approved for session '${sessionId}'.${feedback ? ` Feedback: ${feedback}` : ''}`
        : `Resume rejected for session '${sessionId}'.${feedback ? ` Feedback: ${feedback}` : ''}`;
}

export async function handleGetSessionState(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const sessionId = args.session_id as string;
    if (!sessionId) {
        throw new Error('get_session_state requires session_id');
    }
    emitSync('session', 'get_state', { session_id: sessionId });
    return JSON.stringify({ session_id: sessionId, message: 'State request routed to backend. Result will be provided via metadata_sync event.' });
}

// ---------------------------------------------------------------------------
// Memory Operations
// ---------------------------------------------------------------------------

export async function handleQueryMemory(args: Record<string, unknown>): Promise<string> {
    const query = ((args.query as string) || '').toLowerCase();
    const scope = args.scope as string | undefined;
    const ws = getWorkspacePath();
    const memDir = path.join(ws, '.memory');
    const results: Array<{ file: string; line: string }> = [];

    const searchDir = scope
        ? path.join(memDir, scope === 'company' ? 'company' : scope === 'agent' ? 'agents' : `projects`)
        : memDir;

    if (!(await fileExists(searchDir))) return JSON.stringify({ results: [], count: 0 });

    const files = await fs.readdir(searchDir, { recursive: true });
    for (const file of files) {
        const filePath = path.join(searchDir, String(file));
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.toLowerCase().includes(query)) {
                    results.push({ file: String(file), line: line.trim() });
                    if (results.length >= ((args.limit as number) || 10)) break;
                }
            }
        } catch { /* skip binary files */ }
        if (results.length >= ((args.limit as number) || 10)) break;
    }

    return JSON.stringify({ results, count: results.length }, null, 2);
}

export async function handleWriteMemory(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const content = args.content as string;
    const scope = args.scope as string;
    const scopeId = (args.scope_id as string) || '';
    const customPath = args.file_path as string | undefined;
    const ws = getWorkspacePath();

    let targetPath: string;
    if (customPath) {
        targetPath = path.join(ws, '.memory', customPath);
    } else {
        const scopeMap: Record<string, string> = {
            company: 'company',
            project: `projects/${scopeId}`,
            channel: `projects/${scopeId}`,
            agent: `agents/${scopeId}`,
        };
        const scopeDir = scopeMap[scope] || scope;
        targetPath = path.join(ws, '.memory', scopeDir, 'notes.md');
    }

    await ensureDir(path.dirname(targetPath));
    const timestamp = new Date().toISOString();
    await fs.appendFile(targetPath, `\n[${timestamp}] ${content}\n`);

    emitSync('memory', 'write', { scope, scope_id: scopeId, path: targetPath, content });
    return `Memory written to ${path.relative(ws, targetPath)}.`;
}

export async function handleAnalyzeMemoryPatterns(args: Record<string, unknown>): Promise<string> {
    const scope = (args.scope as string) || 'company';
    const ws = getWorkspacePath();
    const memDir = path.join(ws, '.memory');

    const searchDir = scope === 'company'
        ? path.join(memDir, 'company')
        : scope === 'agent'
            ? path.join(memDir, 'agents')
            : path.join(memDir, 'projects');

    if (!(await fileExists(searchDir))) {
        return JSON.stringify({ patterns: [], message: `No memories found for scope '${scope}'.` });
    }

    const files = await fs.readdir(searchDir, { recursive: true });
    const fileCount = files.length;
    let totalLines = 0;

    for (const file of files) {
        const filePath = path.join(searchDir, String(file));
        try {
            const stat = await fs.stat(filePath);
            if (!stat.isFile()) continue;
            const content = await fs.readFile(filePath, 'utf-8');
            totalLines += content.split('\n').length;
        } catch { /* skip */ }
    }

    return JSON.stringify({
        scope,
        file_count: fileCount,
        total_lines: totalLines,
        message: `Found ${fileCount} memory files with ${totalLines} lines in scope '${scope}'. Use query_memory for semantic search.`,
    }, null, 2);
}

// ---------------------------------------------------------------------------
// Trigger Management (backend-dependent — emit metadata_sync)
// ---------------------------------------------------------------------------

export async function handleRegisterTrigger(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const agentId = args.agent_id as string;
    const appSlug = args.app_slug as string;
    const eventType = args.event_type as string;
    const ws = getWorkspacePath();

    const hbPath = path.join(ws, 'agents', agentId, 'HEARTBEAT.md');
    if (await fileExists(hbPath)) {
        const content = await fs.readFile(hbPath, 'utf-8');
        const eventEntry = `- ${appSlug}.${eventType} (registered ${new Date().toISOString()})\n`;
        const updated = content.includes('## Events')
            ? content.replace('## Events\n', `## Events\n${eventEntry}`)
            : content + `\n## Events\n${eventEntry}`;
        await fs.writeFile(hbPath, updated);
    }

    emitSync('trigger', 'register', { agent_id: agentId, app_slug: appSlug, event_type: eventType });
    return `Trigger registered: ${appSlug}.${eventType} for agent '${agentId}'. Backend will provision the webhook endpoint.`;
}

export async function handleListTriggers(args: Record<string, unknown>): Promise<string> {
    const agentId = args.agent_id as string;
    const ws = getWorkspacePath();
    const hbPath = path.join(ws, 'agents', agentId, 'HEARTBEAT.md');

    if (!(await fileExists(hbPath))) return JSON.stringify({ triggers: [], count: 0 });

    const content = await fs.readFile(hbPath, 'utf-8');
    const eventsSection = content.split('## Events')[1] || '';
    const triggers = eventsSection.split('\n')
        .filter(line => line.startsWith('- '))
        .map(line => line.slice(2).trim());

    return JSON.stringify({ agent_id: agentId, triggers, count: triggers.length }, null, 2);
}

export async function handleDeregisterTrigger(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const triggerId = args.trigger_id as number;
    emitSync('trigger', 'deregister', { trigger_id: triggerId });
    return `Trigger ${triggerId} deregistration submitted.`;
}

// ---------------------------------------------------------------------------
// Output Registry
// ---------------------------------------------------------------------------

export async function handleSearchOutputs(args: Record<string, unknown>): Promise<string> {
    const ws = getWorkspacePath();
    const results: Array<{ path: string; name: string }> = [];
    const limit = (args.limit as number) || 20;

    const projectsDir = path.join(ws, 'projects');
    if (!(await fileExists(projectsDir))) return JSON.stringify({ outputs: [], count: 0 });

    const domains = await fs.readdir(projectsDir, { withFileTypes: true });
    for (const domain of domains) {
        if (!domain.isDirectory()) continue;
        const channelsDir = path.join(projectsDir, domain.name, 'channels');
        if (!(await fileExists(channelsDir))) continue;
        const channels = await fs.readdir(channelsDir, { withFileTypes: true });
        for (const channel of channels) {
            if (!channel.isDirectory()) continue;
            const outputDir = path.join(channelsDir, channel.name, 'output', 'deliverables');
            if (!(await fileExists(outputDir))) continue;
            const files = await fs.readdir(outputDir);
            for (const file of files) {
                results.push({
                    path: `projects/${domain.name}/channels/${channel.name}/output/deliverables/${file}`,
                    name: file,
                });
                if (results.length >= limit) break;
            }
            if (results.length >= limit) break;
        }
        if (results.length >= limit) break;
    }

    return JSON.stringify({ outputs: results, count: results.length }, null, 2);
}

// ---------------------------------------------------------------------------
// Session Completion
// ---------------------------------------------------------------------------

export async function handleCompleteSession(args: Record<string, unknown>, emitSync: MetadataSyncFn): Promise<string> {
    const reason = String(args.reason || '').replace(/[\n\r]/g, ' ').slice(0, 500);
    const validStatuses = ['success', 'failure', 'partial'];
    const status = validStatuses.includes(args.status as string) ? (args.status as string) : 'success';
    const summary = String(args.summary || '').replace(/[\n\r]/g, ' ').slice(0, 1000);

    // Emit session completion via metadata_sync (routed through runner event stream)
    emitSync('session', 'completed', { reason, status, summary });

    return JSON.stringify({
        acknowledged: true,
        status,
        reason: reason || 'Session completed',
        message: 'Session completion signal sent. The session will end shortly.',
    });
}
