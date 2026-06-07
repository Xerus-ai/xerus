// Scaffold Complete Handler
// Handles the scaffold_complete event from the runner when a new agent is created.
// Updates workspace agent status. workspace.db registration handled by scaffold-sync-hook.

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import type { StreamEventType } from './types';

const log = logger('ScaffoldComplete');

interface ScaffoldCompleteData {
    agent_slug: string;
    agent_name?: string;
    agent_type?: string;
}

function assertScaffoldData(d: Record<string, unknown>): ScaffoldCompleteData {
    const slug = d.agent_slug ?? d.slug;
    if (typeof slug !== 'string' || !slug) {
        throw new Error('scaffold_complete: agent_slug is required');
    }
    return {
        agent_slug: slug,
        agent_name: typeof d.agent_name === 'string' ? d.agent_name : typeof d.name === 'string' ? d.name : undefined,
        agent_type: typeof d.agent_type === 'string' ? d.agent_type : 'private',
    };
}

export async function handleScaffoldComplete(
    d: Record<string, unknown>,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
): Promise<void> {
    let data: ScaffoldCompleteData;
    try {
        data = assertScaffoldData(d);
    } catch (err) {
        log.warn('scaffold_complete: invalid event data', { error: (err as Error).message });
        return;
    }

    const userId = ctx.request.userId;

    // Agent registration in workspace.db is handled by the scaffold-sync-hook
    // on the sandbox. Here we just update the agent's status to 'idle'.
    log.info('Agent scaffold complete', { slug: data.agent_slug, user_id: userId });

    // Update workspace.db agent status
    try {
        const provider = deps.sandboxService.getDaytonaProvider();
        if (ctx.sandboxId) {
            const { executeWorkspaceQuery, escapeSQL } = await import('../conversations/workspace-db.helpers');
            await executeWorkspaceQuery(provider, ctx.sandboxId,
                `UPDATE agents SET status = 'idle', updated_at = '${new Date().toISOString()}' WHERE slug = '${escapeSQL(data.agent_slug)}'`,
            );
        }
    } catch (err) {
        log.warn('Failed to update workspace agent status', { slug: data.agent_slug, error: (err as Error).message });
    }

    ctx.stream.send('agent_created' as StreamEventType, {
        slug: data.agent_slug,
        name: data.agent_name || data.agent_slug,
        agentType: data.agent_type || 'private',
    });
}
