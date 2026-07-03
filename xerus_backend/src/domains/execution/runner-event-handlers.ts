// Runner Event Handlers
// Individual handler functions for runner events, extracted from runner-event-router.ts.
// Grouped: session lifecycle, DB writes, forwarding.

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { PipelineInvariantError } from './errors';
import { requireAgent } from './pipeline-guards';
import type { StreamEventType } from './types';
import type { HITLRequest } from './hitl/hitl.types';
import { runPostSessionMemoryIndexing } from './post-session-memory-indexer';
import { dispatchCrossChannelCoordination, dispatchMentionToAgent } from './coordination-router';
import { scheduleIncrementalPersist } from './session-record';
import { FILE_WRITE_TOOLS, syncFileChangeToNeon, emitFileChangedFromToolCall } from './file-change-handler';
import { ChannelNotFoundError, MentionParser } from '../inbox';
import { updateSdkSessionId } from '../conversations/workspace-db.service';
import { escapeSQL, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';
import {
    assertToolCallData,
    assertToolResultData,
    assertSessionStartedData,
    assertSessionEndedData,
    assertSessionCompletedData,
    assertCreditUsageData,
    assertCreateInboxItemData,
    assertAgentMessageData,
    assertHookLogData,
    assertSubagentFailureData,
    assertSandboxLifecycleData,
    assertPushNotificationData,
    assertDelegationRecordData,
    assertHitlRequestData,
} from './runner-event-router.guards';

export const EVENT_ROUTER_LOG_PREFIX = '[EventRouter]';
const log = logger('EventRouter');
const XERUS_MASTER_SLUG = 'xerus-master';
const mentionParser = new MentionParser();

const SANDBOX_ACTION_STATUS_MAP: Record<string, string> = {
    start: 'running', stop: 'paused', archive: 'archived', delete: 'stopped', restore: 'running',
};

// ---------------------------------------------------------------------------
// Session Lifecycle
// ---------------------------------------------------------------------------

export async function handleSessionStarted(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const evt = assertSessionStartedData(d);
    const runnerModel = evt.data?.model ?? null;

    if (runnerModel && ctx.agent) {
        ctx.agent.ai_model = runnerModel;
    }

    if (!ctx.stream.isClosed()) {
        ctx.stream.send('meta', {
            model: runnerModel || ctx.agent?.ai_model || 'unknown',
            agentSlug: evt.agent_slug || ctx.agent?.slug || '',
            agentName: ctx.agent?.name || evt.agent_slug || ctx.agent?.slug || '',
            startedAt: new Date().toISOString(),
        });
    }

    if (!evt.session_id) {
        log.warn('session_started: missing session_id in event data');
        logEvent('session_started', d);
        return;
    }
    if (!ctx.conversationId) {
        log.warn('session_started: sdk_session_id received but conversationId missing, cannot persist');
        logEvent('session_started', d);
        return;
    }
    if (ctx.sandboxId) {
        const provider = deps.sandboxService.getDaytonaProvider();
        await updateSdkSessionId(provider, ctx.sandboxId, ctx.conversationId, evt.session_id);

        const agentSlug = evt.agent_slug || ctx.agent?.slug;
        if (agentSlug) {
            const { executeWorkspaceQuery, escapeSQL } = await import('../conversations/workspace-db.helpers');
            executeWorkspaceQuery(provider, ctx.sandboxId,
                `UPDATE agents SET status = 'running', updated_at = '${new Date().toISOString()}' WHERE slug = '${escapeSQL(agentSlug)}'`,
            ).catch(err => log.warn('Failed to update agent status to running', { error: (err as Error).message }));
        }
    }
    logEvent('session_started', d);
}

export function handleSessionEnded(d: Record<string, unknown>, ctx: PipelineContext): void {
    const data = assertSessionEndedData(d);
    if (data.usage) {
        ctx.inputTokens += data.usage.input_tokens || 0;
        ctx.outputTokens += data.usage.output_tokens || 0;
    }
    ctx.agentSessionCount++;
}

export async function handleSessionCompleted(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const data = assertSessionCompletedData(d);
    ctx.status = 'completed';
    if (!ctx.responseText && ctx.responseChunks.length === 0 && data.summary) {
        ctx.responseText = data.summary;
    }
    if (ctx.sessionId) {
        await deps.db.query(
            `UPDATE execution_sessions SET status = 'completed', completed_at = NOW(), agent_response = COALESCE($2, agent_response) WHERE id = $1`,
            [ctx.sessionId, data.reason || data.summary || null],
        );
    }
    log.info('session_completed', { status: data.status, reason: data.reason });

    const agentSlug = ctx.agent?.slug;
    if (agentSlug && ctx.sandboxId) {
        const provider = deps.sandboxService.getDaytonaProvider();
        const { executeWorkspaceQuery, escapeSQL } = await import('../conversations/workspace-db.helpers');
        executeWorkspaceQuery(provider, ctx.sandboxId,
            `UPDATE agents SET status = 'idle', updated_at = '${new Date().toISOString()}' WHERE slug = '${escapeSQL(agentSlug)}'`,
        ).catch(err => log.warn('Failed to update agent status to idle', { error: (err as Error).message }));

        runPostSessionMemoryIndexing(ctx, deps)
            .catch(err => log.error('Post-session memory indexing failed', { agent_slug: agentSlug, error: (err as Error).message }));
    }
}

export function handleCreditUsage(d: Record<string, unknown>, ctx: PipelineContext): void {
    const data = assertCreditUsageData(d);
    if (data.credits_consumed && data.credits_consumed > 0) {
        ctx.creditsUsed += data.credits_consumed;
    }
}

// ---------------------------------------------------------------------------
// Tool Call Handling
// ---------------------------------------------------------------------------

export function handleToolCall(d: Record<string, unknown>, ctx: PipelineContext): void {
    ctx.toolCallCount++;
    emitFileChangedFromToolCall(d, ctx);
    const tc = assertToolCallData(d);
    const tcDetail = {
        call_id: tc.call_id || `tc-${ctx.toolCallCount}`,
        tool_name: tc.tool_name,
        arguments: tc.arguments,
        started_at: Date.now(),
    };
    ctx.toolCallDetails.push(tcDetail);
    ctx.toolCallMap.set(tcDetail.call_id, tcDetail);
    ctx.stream.send('tool_call' as StreamEventType, {
        toolName: tc.tool_name,
        arguments: tc.arguments ?? {},
        callId: tcDetail.call_id,
    });
}

export function handleToolResult(d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps): void {
    const tr = assertToolResultData(d);
    if (tr.call_id) {
        const entry = ctx.toolCallMap.get(tr.call_id);
        if (entry) {
            entry.result = tr.result;
            entry.success = tr.success ?? true;
            entry.duration_ms = Date.now() - entry.started_at;

            ctx.stream.send('tool_result' as StreamEventType, {
                callId: tr.call_id,
                result: tr.result,
                durationMs: entry.duration_ms,
                success: entry.success,
            });

            if (entry.success !== false && FILE_WRITE_TOOLS.has(entry.tool_name)) {
                syncFileChangeToNeon(entry, ctx)
                    .catch(err => log.warn('Neon sync failed (non-critical)', { error: (err as Error).message }));
            }
        }
    }
    scheduleIncrementalPersist(deps, ctx);
}

// ---------------------------------------------------------------------------
// DB Write Handlers
// ---------------------------------------------------------------------------

export async function handleCreateInboxItem(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const data = assertCreateInboxItemData(d);
    const subject = (data.content.length > 80 ? data.content.slice(0, 77) + '...' : data.content);
    const senderSlug = requireAgent(ctx).slug;

    if (!ctx.sandboxId) {
        throw new PipelineInvariantError(`${EVENT_ROUTER_LOG_PREFIX} create_inbox_item: sandboxId not set`);
    }

    const provider = deps.sandboxService.getDaytonaProvider();
    const now = new Date().toISOString();
    const metadata = JSON.stringify({ channel_id: data.channel || null, priority: data.priority });

    const sql = `
        INSERT INTO inbox_items (agent_slug, sender_slug, message_type, subject, content, metadata, priority, status, received_at)
        VALUES ('${escapeSQL(XERUS_MASTER_SLUG)}', '${escapeSQL(senderSlug)}', 'coordination', '${escapeSQL(subject)}', '${escapeSQL(data.content)}', '${escapeSQL(metadata)}', '${escapeSQL(data.priority || 'normal')}', 'unread', '${now}');
    `;

    await executeWorkspaceJsonQuery(provider, ctx.sandboxId, sql);
}

export async function handleAgentMessage(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const data = assertAgentMessageData(d);

    if (!deps.messageBridge) {
        throw new PipelineInvariantError(`${EVENT_ROUTER_LOG_PREFIX} agent_message: messageBridge not initialized`);
    }

    if (!ctx.sandboxId) {
        throw new PipelineInvariantError(`${EVENT_ROUTER_LOG_PREFIX} agent_message: sandboxId not set`);
    }
    const provider = deps.sandboxService.getDaytonaProvider();

    try {
        await deps.messageBridge.handleOutboundMessage(provider, ctx.sandboxId, ctx.request.userId, {
            agent_slug: data.agent_slug || '',
            project: data.project || '',
            channel: data.channel,
            content: data.content,
            message_type: data.message_type || 'chat',
            metadata: { ...(data.metadata ?? {}), execution_id: ctx.executionId },
        });
    } catch (err) {
        if (err instanceof ChannelNotFoundError) {
            log.warn('agent_message channel not found', { error: err.message });
            return;
        }
        throw err;
    }

    ctx.stream.send('agent_message' as StreamEventType, {
        from_agent: data.agent_slug || '',
        to_channel: data.channel || '',
        content: (data.content || '').slice(0, 200),
        message_type: data.message_type || 'chat',
    });

    const agentSlug = data.agent_slug || '';
    const mentions = mentionParser.parseMentions(data.content);
    for (const mention of mentions) {
        if (mention.target === agentSlug) continue;
        dispatchMentionToAgent(deps, ctx, agentSlug, mention.target, mention.message, data.project || '', data.channel)
            .catch(err => log.warn('agent_message mention dispatch failed', { target: mention.target, error: (err as Error).message }));
    }

    const metadata = data.metadata as Record<string, unknown> | undefined;
    const targetAgent = typeof metadata?.target_agent === 'string' ? metadata.target_agent : undefined;
    if (data.message_type === 'coordination' && targetAgent && targetAgent !== agentSlug) {
        const alreadyMentioned = mentions.some(m => m.target === targetAgent);
        if (!alreadyMentioned) {
            dispatchCrossChannelCoordination(deps, ctx, agentSlug, targetAgent, data.content, data.project || '', data.channel)
                .catch(err => log.warn('Cross-channel coordination dispatch failed', { target: targetAgent, error: (err as Error).message }));
        }
    }
}

export async function handleHookLog(
    d: Record<string, unknown>, ctx: PipelineContext, _deps: ResolvedExecutionDeps,
): Promise<void> {
    if (!ctx.sessionId) { logEvent('hook_log', d); return; }
    const data = assertHookLogData(d);
    log.info('hook_log', { hook_event: data.hook_event, agent_slug: requireAgent(ctx).slug, success: data.success, duration_ms: data.duration_ms });
}

export async function handleSubagentFailure(d: Record<string, unknown>, ctx: PipelineContext): Promise<void> {
    const data = assertSubagentFailureData(d);
    if (ctx.announceQueue) {
        ctx.announceQueue.enqueue({
            subagent_type: data.subagent_type || 'unknown',
            subagent_name: data.subagent_name || 'unknown',
            success: false,
            duration_ms: data.duration_ms || 0,
            summary: data.summary,
            error: data.error,
            queued_at: new Date(),
        });
        ctx.announceQueue.scheduleDrain();
    }
    logEvent('subagent_failure', d);
}

export async function handleSandboxLifecycle(d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps): Promise<void> {
    const data = assertSandboxLifecycleData(d);
    const status = SANDBOX_ACTION_STATUS_MAP[data.action];
    if (!status) { logEvent('sandbox_lifecycle', d); return; }
    await deps.db.query(
        `UPDATE workspaces SET sandbox_status = $2, sandbox_last_activity_at = NOW(), updated_at = NOW()
         WHERE sandbox_id = $1 AND user_id = $3`,
        [data.sandbox_id, status, ctx.request.userId],
    );
    deps.sandboxService.invalidateRegistryCache(ctx.request.userId);
}

// ---------------------------------------------------------------------------
// Forwarding Handlers
// ---------------------------------------------------------------------------

export function handlePushNotificationForward(d: Record<string, unknown>, ctx: PipelineContext): void {
    const data = assertPushNotificationData(d);
    ctx.stream.send('notification', {
        message: data.body || '',
        agent_slug: data.agent_slug || '',
        priority: 'medium',
    });
    logEvent('push_notification', d);
}

export function handleDelegationForward(d: Record<string, unknown>, ctx: PipelineContext): void {
    const data = assertDelegationRecordData(d);
    ctx.stream.send('delegation', {
        fromAgent: data.from_agent || '',
        toAgent: data.to_agent || '',
        task: data.task || '',
    });
    logEvent('delegation_record', d);
}

export async function handleHitlRequest(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    if (!ctx.sessionId) {
        throw new PipelineInvariantError(`${EVENT_ROUTER_LOG_PREFIX} hitl_request: sessionId not set -- pipeline invariant violated`);
    }

    const data = assertHitlRequestData(d);
    const agent = requireAgent(ctx);
    const request: HITLRequest = {
        execution_id: ctx.sessionId,
        agent_id: agent.id,
        agent_slug: data.agent_slug || agent.slug,
        user_id: ctx.request.userId,
        scenario: data.scenario || 'external_action',
        question: data.question,
        tool_name: data.tool_name,
        tool_input: data.tool_input || {},
        options: data.options,
        expanded_context: data.expanded_context,
        requires_auth: data.requires_auth,
        timeout_seconds: data.timeout_seconds,
        ui_hint: data.ui_hint,
        browser_url: data.browser_url,
        preview_url: data.preview_url,
        artifact_path: data.artifact_path,
    };

    await deps.hitlHandler.requestApproval(request);

    await deps.db.query(
        `UPDATE execution_sessions SET status = 'paused' WHERE id = $1::uuid`,
        [ctx.sessionId],
    );

    log.info('hitl_request', { scenario: request.scenario, tool_name: data.tool_name });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function logEvent(eventType: string, d: Record<string, unknown>): void {
    const agentSlug = d.agent_slug || '';
    const payload = d.data && typeof d.data === 'object' ? d.data : d;
    log.debug(eventType, { agent_slug: agentSlug, data: payload });
}
