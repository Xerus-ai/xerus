// Execution Channel Router
// Routes agent responses to channel_messages so they appear in the inbox activity feed.
// Extracted from execution.service.ts to comply with the 400-line file limit.

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import type { PipelineContext } from './execution-pipeline.types';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { createChannelMessage } from '../company/company-workspace-db.service';
import { syncMessageToSandbox } from '../company/channel-execution.service';
import { escapeSQL, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';
import { logger } from '../../utils/logger';

const log = logger('ExecutionChannelRouter');

export async function routeAgentResponseToChannel(
    ctx: PipelineContext,
    provider: DaytonaProvider,
    sandboxService: SandboxService,
): Promise<void> {
    const responseText = ctx.responseText || ctx.responseChunks.join('');
    if (!responseText || !ctx.sandboxId) return;

    const agentSlug = ctx.agent?.slug || ctx.request.agentSlug;
    let targetChannel = ctx.request.context?.channel_slug as string | undefined;

    if (!targetChannel && (ctx.triggerType === 'schedule' || ctx.triggerType === 'task_assigned')) {
        try {
            const rows = await executeWorkspaceJsonQuery<{ channel_slug: string }>(
                provider, ctx.sandboxId,
                `SELECT channel_slug FROM channel_members WHERE agent_slug = '${escapeSQL(agentSlug)}' LIMIT 1`,
            );
            targetChannel = rows[0]?.channel_slug;
        } catch (err) {
            log.warn('Failed to resolve agent channel for autonomous post', {
                agent: agentSlug, error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    const shouldWriteChannel = targetChannel && (
        ctx.triggerType === 'channel_message' ||
        ctx.triggerType === 'schedule' ||
        ctx.triggerType === 'task_assigned'
    );

    if (!shouldWriteChannel || !targetChannel) return;

    log.info('Writing agent response to channel_messages', {
        channel: targetChannel, agent: agentSlug, trigger: ctx.triggerType,
        length: responseText.length,
    });

    await createChannelMessage(
        provider, ctx.sandboxId,
        targetChannel, 'agent', agentSlug,
        responseText, 'post', {},
    ).catch(err => log.warn('Failed to write agent response to channel_messages', {
        error: err instanceof Error ? err.message : String(err),
    }));

    const parts = targetChannel.split('--');
    if (parts.length === 2) {
        const channelTag = `${parts[0]}/${parts[1]}`;
        syncMessageToSandbox(sandboxService, ctx.request.userId, channelTag, {
            sender_type: 'agent',
            sender_slug: agentSlug,
            content: responseText,
            message_type: 'post',
            posted_at: new Date().toISOString(),
        }).catch(err => log.warn('Failed to sync agent response to posts.jsonl', {
            error: err instanceof Error ? err.message : String(err),
        }));
    }
}
