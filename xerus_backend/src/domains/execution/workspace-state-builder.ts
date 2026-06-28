// Workspace State Builder
// Queries workspace.db for channels, channel members, and task summaries.
// Injected into agent system prompts so orchestrators know the workspace topology.

import { executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { logger } from '../../utils/logger';

const log = logger('WorkspaceStateBuilder');

interface ChannelMemberRow {
    channel_slug: string;
    channel_name: string;
    domain_slug: string;
    agent_slug: string;
    agent_name: string;
    role: string;
}

interface TaskSummaryRow {
    project_slug: string;
    status: string;
    task_count: number;
}

export async function buildWorkspaceStateSummary(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<string> {
    try {
        const membersSql = `
            SELECT c.slug AS channel_slug, c.name AS channel_name, c.domain_slug,
                   cm.agent_slug, a.name AS agent_name, cm.role
            FROM channels c
            LEFT JOIN channel_members cm ON cm.channel_slug = c.slug
            LEFT JOIN agents a ON a.slug = cm.agent_slug
            ORDER BY c.domain_slug, c.slug, cm.role DESC
        `;
        const members = await executeWorkspaceJsonQuery<ChannelMemberRow>(provider, sandboxId, membersSql);

        const tasksSql = `
            SELECT project_slug, status, COUNT(*) AS task_count
            FROM tasks
            GROUP BY project_slug, status
            ORDER BY project_slug
        `;
        const taskSummary = await executeWorkspaceJsonQuery<TaskSummaryRow>(provider, sandboxId, tasksSql);

        if (members.length === 0 && taskSummary.length === 0) return '';

        const lines: string[] = [
            '== Workspace State (channels, agents, tasks) ==',
            '',
            'Use this to route tasks to the correct channel and assign the right agent.',
            '',
        ];

        const channelMap = new Map<string, { name: string; domain: string; agents: { slug: string; name: string; role: string }[] }>();
        for (const row of members) {
            if (!channelMap.has(row.channel_slug)) {
                channelMap.set(row.channel_slug, {
                    name: row.channel_name,
                    domain: row.domain_slug,
                    agents: [],
                });
            }
            if (row.agent_slug) {
                channelMap.get(row.channel_slug)!.agents.push({
                    slug: row.agent_slug,
                    name: row.agent_name || row.agent_slug,
                    role: row.role,
                });
            }
        }

        const tasksByChannel = new Map<string, Map<string, number>>();
        for (const row of taskSummary) {
            if (!tasksByChannel.has(row.project_slug)) {
                tasksByChannel.set(row.project_slug, new Map());
            }
            tasksByChannel.get(row.project_slug)!.set(row.status, row.task_count);
        }

        lines.push('Channels:');
        for (const [slug, info] of channelMap) {
            const agentList = info.agents.length > 0
                ? info.agents.map(a => `${a.name} (@${a.slug}, ${a.role})`).join(', ')
                : 'no agents assigned';
            const tasks = tasksByChannel.get(slug);
            const taskInfo = tasks
                ? ` | Tasks: ${[...tasks.entries()].map(([s, c]) => `${c} ${s}`).join(', ')}`
                : '';
            lines.push(`  #${slug} (${info.name}) [project: ${info.domain}] → ${agentList}${taskInfo}`);
        }

        const orphanTasks = [...tasksByChannel.entries()].filter(([slug]) => !channelMap.has(slug));
        if (orphanTasks.length > 0) {
            lines.push('');
            lines.push('Tasks in other boards:');
            for (const [slug, statuses] of orphanTasks) {
                const taskInfo = [...statuses.entries()].map(([s, c]) => `${c} ${s}`).join(', ');
                lines.push(`  ${slug}: ${taskInfo}`);
            }
        }

        lines.push('');
        lines.push('RULES:');
        lines.push('- When creating a task, ALWAYS set channel_id to the channel where the responsible agent works');
        lines.push('- ALWAYS set assigned_agent_ids to the agent(s) responsible for the task');
        lines.push('- If a channel exists for a topic, use it. Do NOT create tasks in the main board if a channel fits');
        lines.push('- Write detailed task descriptions — the agent receiving the task depends on this context');
        lines.push('');

        return lines.join('\n');
    } catch (err) {
        log.debug('Failed to build workspace state summary', {
            error: err instanceof Error ? err.message : String(err),
        });
        return '';
    }
}
