// Cross-Channel Coordination Router
// Handles agent-to-agent coordination messages and @mention dispatching.

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';

const log = logger('CoordinationRouter');

export async function dispatchCrossChannelCoordination(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
    fromAgent: string,
    targetAgent: string,
    content: string,
    project: string,
    channel: string,
): Promise<void> {
    if (!deps.messageBridge) throw new Error('coordination: messageBridge not initialized');
    if (!ctx.sandboxId) throw new Error('coordination: sandboxId not set');

    const dispatched = await deps.messageBridge.trySendToAgent(
        ctx.request.userId, targetAgent, project, channel, fromAgent, content,
    );

    if (!dispatched && deps.triggerAgentExecution) {
        const channelSlug = project && channel ? `${project}--${channel}` : channel;
        log.info('Cross-channel target not running, triggering execution', { from: fromAgent, target: targetAgent, channel: channelSlug });
        await deps.triggerAgentExecution(ctx.request.userId, targetAgent, content, channelSlug);
    }
}

export async function dispatchMentionToAgent(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
    fromAgent: string,
    targetSlug: string,
    message: string,
    project: string,
    channel: string,
): Promise<void> {
    if (!deps.messageBridge) return;

    const dispatched = await deps.messageBridge.dispatchMention(
        ctx.request.userId, fromAgent, targetSlug, message, project, channel,
    );

    if (!dispatched) {
        const channelSlug = project && channel ? `${project}--${channel}` : channel;
        log.info('Mention target not running, triggering execution', {
            from: fromAgent, target: targetSlug, channel: channelSlug,
        });

        if (deps.triggerAgentExecution) {
            await deps.triggerAgentExecution(ctx.request.userId, targetSlug, message, channelSlug);
        } else {
            log.warn('triggerAgentExecution not wired, mention to offline agent dropped', { target: targetSlug });
        }
    }
}
