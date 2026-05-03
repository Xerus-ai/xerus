// Runner Event Router
// Routes runner stdout events to backend services (DB writes, SSE, logging).

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { requireAgent } from './pipeline-guards';
import { STREAM_EVENT_TYPES, type RunnerEventType, type StreamEventType } from './types';
import type { HITLRequest } from './hitl/hitl.types';
import { handleMetadataSync } from './metadata-sync-router';
import { handleTriggerIndexing } from './indexing-event-handler';
import { handleCliStreamEvent } from './cli-stream-router';
import { dispatchCrossChannelCoordination, dispatchMentionToAgent } from './coordination-router';
import { handleSseForward, handleAgentOutput } from './sse-forward-handler';
import { FILE_WRITE_TOOLS, syncFileChangeToNeon, emitFileChangedFromToolCall } from './file-change-handler';
import { ChannelNotFoundError, MentionParser } from '../inbox';
import { updateSdkSessionId } from '../conversations/workspace-db.service';
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

const mentionParser = new MentionParser();

export const EVENT_ROUTER_LOG_PREFIX = '[EventRouter]';
const log = logger('EventRouter');

// Canonical allowlist: only events the frontend knows how to handle (from STREAM_EVENT_TYPES)
export const VALID_SSE_FORWARD_EVENTS: ReadonlySet<string> = new Set(STREAM_EVENT_TYPES);

const SANDBOX_ACTION_STATUS_MAP: Record<string, string> = {
    start: 'running', stop: 'paused', archive: 'archived', delete: 'stopped', restore: 'running',
};


/**
 * Merge raw.data into root level for consistent field access.
 * StdoutEmitter wraps all payloads in a `data` field; handlers expect fields at root.
 */
function extractData(raw: Record<string, unknown>): Record<string, unknown> {
    const data = raw.data as Record<string, unknown> | undefined;
    return data && typeof data === 'object' ? { ...raw, ...data } : raw;
}

export async function routeEventToBackend(
    eventType: RunnerEventType | string,
    raw: Record<string, unknown>,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
): Promise<void> {
    const d = extractData(raw);

    switch (eventType) {
        // ----- Category A: Existing handlers -----
        case 'tool_call': {
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
            break;
        }
        case 'tool_result': {
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

                    // Sync to Neon AFTER write succeeds (not on tool_call)
                    // Prevents phantom agent_registry entries from failed writes
                    if (entry.success !== false && FILE_WRITE_TOOLS.has(entry.tool_name)) {
                        syncFileChangeToNeon(entry, ctx)
                            .catch(err => log.warn('Neon sync failed (non-critical)', { error: (err as Error).message }));
                    }
                }
            }
            break;
        }
        case 'session_ended':
        case 'done':
            handleSessionEnded(d, ctx);
            break;
        case 'session_completed':
            await handleSessionCompleted(d, ctx, deps);
            break;
        case 'credit_usage':
            handleCreditUsage(d, ctx);
            break;
        case 'update_agent_run':
            // agent_runs table dropped -- event should no longer be emitted by runner.
            // Log as warning so we notice if it still fires.
            log.warn('update_agent_run: deprecated event still being emitted');
            break;
        case 'sse_forward':
            await handleSseForward(d, ctx, deps);
            break;
        case 'metadata_sync':
            await handleMetadataSync(d, ctx, deps);
            break;

        // ----- Category B: DB write handlers -----
        case 'create_inbox_item':
            await handleCreateInboxItem(d, ctx, deps);
            break;
        case 'agent_message':
            await handleAgentMessage(d, ctx, deps);
            break;
        case 'hook_log':
            await handleHookLog(d, ctx, deps);
            break;
        case 'subagent_failure':
            await handleSubagentFailure(d, ctx);
            break;
        case 'sandbox_lifecycle':
            await handleSandboxLifecycle(d, ctx, deps);
            break;

        // ----- Category C: Structured log handlers -----
        case 'error':
            log.error('Runner error event', { code: d.code || 'unknown', message: d.message || '' });
            break;
        case 'agent_output':
            handleAgentOutput(d, ctx);
            break;
        case 'trigger_indexing':
            await handleTriggerIndexing(d, ctx, deps);
            break;
        case 'session_started':
            await handleSessionStarted(d, ctx, deps);
            break;
        case 'session_analytics':
        case 'health':
        case 'sessions':
        case 'credit_check':
        case 'ace_reflection':
        case 'skill_suggestion':
        case 'scaffold_complete':
            logEvent(eventType, d);
            break;
        case 'push_notification':
            handlePushNotificationForward(d, ctx);
            break;
        case 'delegation_record':
            handleDelegationForward(d, ctx);
            break;
        case 'hitl_request':
            await handleHitlRequest(d, ctx, deps);
            break;
        // ----- CLI stream-json events — delegated to cli-stream-router.ts -----
        case 'user':
        case 'stream_event':
        case 'system':
        case 'assistant':
        case 'result': {
            const handled = await handleCliStreamEvent(eventType, d, ctx, deps);
            if (!handled) log.warn('CLI stream handler returned false', { event_type: eventType });
            break;
        }

        default:
            log.warn('Unknown event type', { event_type: eventType });
            break;
    }
}

async function handleSessionStarted(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const evt = assertSessionStartedData(d);
    const runnerModel = evt.data?.model ?? null;

    // Capture real model from runner (runner reads config.json locally).
    if (runnerModel && ctx.agent) {
        ctx.agent.ai_model = runnerModel;
    }

    // Send meta SSE to frontend with real values from the runner
    if (!ctx.stream.isClosed()) {
        ctx.stream.send('meta', {
            model: runnerModel || ctx.agent?.ai_model || 'unknown',
            agentSlug: evt.agent_slug || ctx.agent?.slug || '',
            agentName: evt.agent_slug || ctx.agent?.slug || '',
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

        // Update agent status to 'running' in workspace.db so frontend shows online count
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

function handleSessionEnded(d: Record<string, unknown>, ctx: PipelineContext): void {
    const data = assertSessionEndedData(d);
    if (data.usage) {
        ctx.inputTokens += data.usage.input_tokens || 0;
        ctx.outputTokens += data.usage.output_tokens || 0;
    }
    ctx.agentSessionCount++;
}

async function handleSessionCompleted(
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

    // Update agent status back to 'idle' in workspace.db
    const agentSlug = ctx.agent?.slug;
    if (agentSlug && ctx.sandboxId) {
        const provider = deps.sandboxService.getDaytonaProvider();
        const { executeWorkspaceQuery, escapeSQL } = await import('../conversations/workspace-db.helpers');
        executeWorkspaceQuery(provider, ctx.sandboxId,
            `UPDATE agents SET status = 'idle', updated_at = '${new Date().toISOString()}' WHERE slug = '${escapeSQL(agentSlug)}'`,
        ).catch(err => log.warn('Failed to update agent status to idle', { error: (err as Error).message }));

        // Trigger memory indexing for files changed during this session
        handleTriggerIndexing({ agent_slug: agentSlug, scope: 'session' }, ctx, deps)
            .catch(err => log.warn('Post-session memory indexing failed (non-critical)', { error: (err as Error).message }));
    }
}

function handleCreditUsage(d: Record<string, unknown>, ctx: PipelineContext): void {
    const data = assertCreditUsageData(d);
    if (data.credits_consumed && data.credits_consumed > 0) {
        ctx.creditsUsed += data.credits_consumed;
    }
}

async function handleCreateInboxItem(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const data = assertCreateInboxItemData(d);
    const title = (data.content.length > 80 ? data.content.slice(0, 77) + '...' : data.content);
    const summary = data.content.slice(0, 200);
    await deps.db.query(
        `INSERT INTO inbox_items (user_id, channel_id, agent_slug, title, summary, content, status, priority, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, 'delivered', $7, $8)`,
        [ctx.request.userId, data.channel || null, requireAgent(ctx).slug, title, summary, data.content, data.priority, JSON.stringify({})],
    );
}

async function handleAgentMessage(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const data = assertAgentMessageData(d);

    if (!deps.messageBridge) {
        throw new Error(`${EVENT_ROUTER_LOG_PREFIX} agent_message: messageBridge not initialized`);
    }

    if (!ctx.sandboxId) {
        throw new Error(`${EVENT_ROUTER_LOG_PREFIX} agent_message: sandboxId not set`);
    }
    const provider = deps.sandboxService.getDaytonaProvider();

    try {
        await deps.messageBridge.handleOutboundMessage(provider, ctx.sandboxId, ctx.request.userId, {
            agent_slug: data.agent_slug || '',
            project: data.project || '',
            channel: data.channel,
            content: data.content,
            message_type: data.message_type || 'chat',
            // Tag every agent-emitted channel message with its execution_id so
            // the frontend "View work" button can open the step-level timeline
            // via GET /execute/:id/status.
            metadata: { ...(data.metadata ?? {}), execution_id: ctx.executionId },
        });
    } catch (err) {
        if (err instanceof ChannelNotFoundError) {
            log.warn('agent_message channel not found', { error: err.message });
            return;
        }
        throw err;
    }

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

async function handleHookLog(
    d: Record<string, unknown>, ctx: PipelineContext, _deps: ResolvedExecutionDeps,
): Promise<void> {
    if (!ctx.sessionId) { logEvent('hook_log', d); return; }
    const data = assertHookLogData(d);
    log.info('hook_log', { hook_event: data.hook_event, agent_slug: requireAgent(ctx).slug, success: data.success, duration_ms: data.duration_ms });
}

async function handleSubagentFailure(d: Record<string, unknown>, ctx: PipelineContext): Promise<void> {
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

async function handleSandboxLifecycle(d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps): Promise<void> {
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

function handlePushNotificationForward(d: Record<string, unknown>, ctx: PipelineContext): void {
    const data = assertPushNotificationData(d);
    ctx.stream.send('notification', {
        message: data.body || '',
        agent_slug: data.agent_slug || '',
        priority: 'medium',
    });
    logEvent('push_notification', d);
}

function handleDelegationForward(d: Record<string, unknown>, ctx: PipelineContext): void {
    const data = assertDelegationRecordData(d);
    ctx.stream.send('delegation', {
        fromAgent: data.from_agent || '',
        toAgent: data.to_agent || '',
        task: data.task || '',
    });
    logEvent('delegation_record', d);
}

async function handleHitlRequest(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    if (!ctx.sessionId) {
        throw new Error(`${EVENT_ROUTER_LOG_PREFIX} hitl_request: sessionId not set -- pipeline invariant violated`);
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

function logEvent(eventType: string, d: Record<string, unknown>): void {
    const agentSlug = d.agent_slug || '';
    const payload = d.data && typeof d.data === 'object' ? d.data : d;
    log.debug(eventType, { agent_slug: agentSlug, data: payload });
}
