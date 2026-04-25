// Runner Event Router
// Routes runner stdout events to backend services (DB writes, SSE, logging).

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { requireAgent } from './pipeline-guards';
import { validateWorkspacePath } from '../../utils/path-validation';
import { STREAM_EVENT_TYPES, type StreamEventType, type RunnerEventType } from './types';
import type { HITLRequest } from './hitl/hitl.types';
import { handleMetadataSync } from './metadata-sync-router';
import { handleTriggerIndexing } from './indexing-event-handler';
import { ChannelNotFoundError, MentionParser } from '../inbox';
// triggerAgentExecution callback is wired via ResolvedExecutionDeps (no circular dep)
import { workspaceSSEBroadcaster, reverseSyncToDB } from '../drive';
import { updateSdkSessionId } from '../conversations/workspace-db.service';
import {
    assertToolCallData,
    assertToolResultData,
    assertSessionStartedData,
    assertSessionEndedData,
    assertSessionCompletedData,
    assertCreditUsageData,
    assertSseForwardData,
    assertCreateInboxItemData,
    assertAgentMessageData,
    assertHookLogData,
    assertSubagentFailureData,
    assertSandboxLifecycleData,
    assertPushNotificationData,
    assertDelegationRecordData,
    assertHitlRequestData,
    isTextContentBlock,
    resolveContentBlocks,
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
        // ----- CLI stream-json events (Claude Code --output-format stream-json) -----
        case 'user':
            // Echo of our input message — ignore
            break;

        case 'stream_event': {
            // Real-time streaming deltas from --include-partial-messages.
            // Claude CLI wraps Anthropic API streaming events inside an `event` field:
            //   {"type":"stream_event","event":{"type":"content_block_delta","delta":{...}}}
            const nestedEvent = d.event as Record<string, unknown> | undefined;
            if (!nestedEvent) break;

            const streamType = nestedEvent.type as string | undefined;
            const contentBlock = nestedEvent.content_block as Record<string, unknown> | undefined;
            const delta = nestedEvent.delta as Record<string, unknown> | undefined;

            if (streamType === 'content_block_delta' && delta) {
                if (delta.type === 'text_delta' && typeof delta.text === 'string') {
                    ctx.responseChunks.push(delta.text);
                    ctx.stream.send('token' as StreamEventType, { text: delta.text, tokenCount: 0 });
                } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                    ctx.thinkingChunks.push(delta.thinking);
                    ctx.stream.send('reasoning' as StreamEventType, { thought: delta.thinking });
                } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
                    // Tool input streaming — accumulate but don't send (tool_call sent on block_start)
                }
            } else if (streamType === 'content_block_start' && contentBlock) {
                if (contentBlock.type === 'tool_use') {
                    ctx.toolCallCount++;
                    const callId = (contentBlock.id as string) || `tc-${ctx.toolCallCount}`;
                    const toolName = (contentBlock.name as string) || 'unknown';
                    ctx.toolCallDetails.push({ call_id: callId, tool_name: toolName, arguments: {}, started_at: Date.now() });
                    ctx.toolCallMap.set(callId, ctx.toolCallDetails[ctx.toolCallDetails.length - 1]);
                    ctx.stream.send('tool_call' as StreamEventType, { toolName, arguments: {}, callId });
                }
            } else if (streamType === 'content_block_stop') {
                // Block finished — tool_result will come in the assistant message
            }
            break;
        }

        case 'system': {
            const subtype = d.subtype as string | undefined;
            if (subtype === 'init') {
                // Capture CLI session_id for --resume on next message
                const cliSessionId = d.session_id as string | undefined;
                if (cliSessionId && ctx.conversationId && ctx.sandboxId) {
                    const provider = deps.sandboxService.getDaytonaProvider();
                    await updateSdkSessionId(provider, ctx.sandboxId, ctx.conversationId, cliSessionId);
                    ctx.sdkSessionId = cliSessionId;
                }
                log.debug('CLI init', { model: d.model, tools_count: (d.tools as string[] | undefined)?.length });
            } else if (subtype === 'hook_started' || subtype === 'hook_response') {
                log.debug('CLI hook event', { hook_name: d.hook_name, subtype });
            } else {
                log.debug('CLI system event', { subtype });
            }
            break;
        }

        case 'assistant': {
            // Full assistant message with all content blocks.
            // With --include-partial-messages, text/thinking/tool_use blocks were
            // already streamed in real-time via stream_event deltas. Here we:
            // - Track text/thinking for persistence (ctx.responseText, ctx.thinkingChunks)
            //   but DON'T re-emit as SSE (prevents duplicate tokens on frontend)
            // - Emit tool_result SSE — only source for tool execution results
            // - Track tool_use for metrics if not already seen in stream_event
            const msg = d.message as Record<string, unknown> | undefined;
            if (msg) {
                const content = msg.content as Array<Record<string, unknown>> | undefined;
                if (content) {
                    for (const block of content) {
                        switch (block.type) {
                            case 'text': {
                                const text = block.text as string;
                                if (text) {
                                    ctx.responseText = text;
                                    // Only emit token SSE if stream_event didn't stream it
                                    if (ctx.responseChunks.length === 0) {
                                        ctx.responseChunks.push(text);
                                        ctx.stream.send('token' as StreamEventType, { text, tokenCount: ctx.outputTokens });
                                    }
                                }
                                break;
                            }
                            case 'tool_use': {
                                const callId = (block.id as string) || `tc-${ctx.toolCallCount + 1}`;
                                const toolName = (block.name as string) || 'unknown';
                                const args = (block.input as Record<string, unknown>) || {};
                                // Only emit if not already tracked by stream_event content_block_start
                                if (!ctx.toolCallMap.has(callId)) {
                                    ctx.toolCallCount++;
                                    ctx.toolCallDetails.push({ call_id: callId, tool_name: toolName, arguments: args, started_at: Date.now() });
                                    ctx.toolCallMap.set(callId, ctx.toolCallDetails[ctx.toolCallDetails.length - 1]);
                                    ctx.stream.send('tool_call' as StreamEventType, { toolName, arguments: args, callId });
                                } else {
                                    // Update arguments (stream_event only had empty args from block_start)
                                    const tracked = ctx.toolCallMap.get(callId)!;
                                    tracked.arguments = args;
                                }
                                break;
                            }
                            case 'tool_result': {
                                // Tool results are NOT in stream_event — always emit
                                const callId = (block.tool_use_id as string) || '';
                                const resultContent = block.content;
                                const resultText = typeof resultContent === 'string'
                                    ? resultContent
                                    : Array.isArray(resultContent)
                                        ? (resultContent as Array<{ type: string; text?: string }>).filter(b => b.type === 'text').map(b => b.text).join('\n')
                                        : '';
                                const tracked = ctx.toolCallMap.get(callId);
                                const durationMs = tracked ? Date.now() - tracked.started_at : 0;
                                if (tracked) { tracked.result = resultText; tracked.success = true; tracked.duration_ms = durationMs; }
                                ctx.stream.send('tool_result' as StreamEventType, { callId, result: resultText, durationMs, success: true });
                                break;
                            }
                            case 'thinking': {
                                const thought = (block.thinking as string) || (block.text as string) || '';
                                if (thought) {
                                    // Only emit reasoning SSE if stream_event didn't stream it
                                    if (ctx.thinkingChunks.length === 0) {
                                        ctx.thinkingChunks.push(thought);
                                        ctx.stream.send('reasoning' as StreamEventType, { thought });
                                    }
                                }
                                break;
                            }
                            default:
                                break;
                        }
                    }
                }
                // Track token usage
                const usage = msg.usage as Record<string, number> | undefined;
                if (usage) {
                    ctx.inputTokens += usage.input_tokens || 0;
                    ctx.outputTokens += usage.output_tokens || 0;
                }
            }
            break;
        }

        case 'result': {
            // CLI execution complete — map to session_ended
            const isError = d.is_error as boolean | undefined;
            const result = d.result as string | undefined;
            const sessionId = d.session_id as string | undefined;
            const totalCost = d.total_cost_usd as number | undefined;
            const numTurns = d.num_turns as number | undefined;

            if (result && !isError) {
                ctx.responseText = result;
            }
            if (totalCost) {
                ctx.creditsUsed = totalCost;
            }

            // Track usage from result event
            const usage = d.usage as Record<string, number> | undefined;
            if (usage) {
                ctx.inputTokens = usage.input_tokens || ctx.inputTokens;
                ctx.outputTokens = usage.output_tokens || ctx.outputTokens;
            }

            log.info('CLI result', {
                is_error: isError,
                num_turns: numTurns,
                cost_usd: totalCost,
                session_id: sessionId,
                duration_ms: d.duration_ms,
            });
            break;
        }

        default:
            log.warn('Unknown event type', { event_type: eventType });
            break;
    }
}

function handleAgentOutput(d: Record<string, unknown>, ctx: PipelineContext): void {
    const text = extractTextFromAgentOutput(d);
    if (text.length > 0) {
        // Only emit if no sse_forward token events were already received for this text.
        // The runner's stdout-emitter emits both sse_forward tokens (from stream_event
        // deltas or result messages) AND agent_output events for the same response text.
        // Emitting from both paths causes duplicate tokens on the frontend.
        if (ctx.responseChunks.length === 0) {
            ctx.responseChunks.push(text);
            ctx.stream.send('token' as StreamEventType, { text, tokenCount: 0 });
        }
    }
    logEvent('agent_output', d);
}

/**
 * Extract text from agent_output events.
 * Handles multiple shapes:
 *   1. d.content is a plain string (simple output)
 *   2. d.content is an array of content blocks directly
 *   3. d.content is an object with a `content` array (SDK message shape)
 *   4. d.content is an object with a `message.content` array (nested SDK shape)
 */
function extractTextFromAgentOutput(d: Record<string, unknown>): string {
    if (typeof d.content === 'string') {
        return d.content;
    }

    const blocks = resolveContentBlocks(d.content);
    if (!blocks) return '';

    const parts: string[] = [];
    for (const block of blocks) {
        if (isTextContentBlock(block)) {
            parts.push(block.text);
        }
    }
    return parts.join('');
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
            const { executeWorkspaceQuery } = await import('../conversations/workspace-db.helpers');
            executeWorkspaceQuery(provider, ctx.sandboxId,
                `UPDATE agents SET status = 'running', updated_at = '${new Date().toISOString()}' WHERE slug = '${agentSlug}'`,
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
        const { executeWorkspaceQuery } = await import('../conversations/workspace-db.helpers');
        executeWorkspaceQuery(provider, ctx.sandboxId,
            `UPDATE agents SET status = 'idle', updated_at = '${new Date().toISOString()}' WHERE slug = '${agentSlug}'`,
        ).catch(err => log.warn('Failed to update agent status to idle', { error: (err as Error).message }));
    }
}

function handleCreditUsage(d: Record<string, unknown>, ctx: PipelineContext): void {
    const data = assertCreditUsageData(d);
    if (data.credits_consumed && data.credits_consumed > 0) {
        ctx.creditsUsed += data.credits_consumed;
    }
}

async function handleSseForward(
    d: Record<string, unknown>,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
): Promise<void> {
    const fwd = assertSseForwardData(d);
    if (!VALID_SSE_FORWARD_EVENTS.has(fwd.sse_event)) return;

    // Live preview events: agent supplies port (and optionally url + label).
    // When only port is given, resolve the Daytona preview URL on the backend
    // so the agent doesn't have to hardcode the sandbox URL pattern.
    let payloadToForward: Record<string, unknown> | undefined = fwd.payload;
    if (fwd.sse_event === 'preview') {
        payloadToForward = await resolvePreviewPayload(fwd.payload, ctx, deps);
        if (!payloadToForward) return;
    }

    ctx.stream.send(fwd.sse_event as StreamEventType, payloadToForward, fwd.meta);
    const payload = fwd.payload;

    if (fwd.sse_event === 'token' && payload) {
        if (typeof payload.text === 'string') {
            ctx.responseChunks.push(payload.text);
        }
    }
    if (fwd.sse_event === 'reasoning' && payload) {
        if (typeof payload.thought === 'string') {
            ctx.thinkingChunks.push(payload.thought);
        }
    }
    // Track tool calls and results for metrics (these arrive as sse_forward,
    // not as raw 'tool_call'/'tool_result' event types)
    if (fwd.sse_event === 'tool_call' && payload) {
        const tc = assertToolCallData(payload);
        const callId = tc.call_id || `tc-${ctx.toolCallCount + 1}`;
        if (!ctx.toolCallMap.has(callId)) {
            ctx.toolCallCount++;
            const detail = {
                call_id: callId,
                tool_name: tc.tool_name,
                arguments: tc.arguments,
                started_at: Date.now(),
            };
            ctx.toolCallDetails.push(detail);
            ctx.toolCallMap.set(callId, detail);
        }
    }
    if (fwd.sse_event === 'tool_result' && payload) {
        const tr = assertToolResultData(payload);
        if (tr.call_id) {
            const entry = ctx.toolCallMap.get(tr.call_id);
            if (entry) {
                entry.result = tr.result;
                entry.success = tr.success ?? true;
                entry.duration_ms = Date.now() - entry.started_at;
            }
        }
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

        // Try live dispatch first; if target agent isn't running, trigger execution immediately
        deps.messageBridge.dispatchMention(
            ctx.request.userId, agentSlug, mention.target, mention.message, data.project || '', data.channel,
        ).then(async (dispatched) => {
            if (dispatched) return;

            // Target agent not running — fire their execution immediately
            const channelSlug = data.project && data.channel
                ? `${data.project}--${data.channel}`
                : data.channel;

            log.info('Mention target not running, triggering execution', {
                from: agentSlug, target: mention.target, channel: channelSlug,
            });

            if (deps.triggerAgentExecution) {
                await deps.triggerAgentExecution(
                    ctx.request.userId,
                    mention.target,
                    mention.message,
                    channelSlug,
                );
            } else {
                log.warn('triggerAgentExecution not wired, mention to offline agent dropped', {
                    target: mention.target,
                });
            }
        }).catch(err => {
            log.warn('agent_message mention dispatch failed', { target: mention.target, error: (err as Error).message });
        });
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

async function resolvePreviewPayload(
    payload: Record<string, unknown> | undefined,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
): Promise<Record<string, unknown> | undefined> {
    if (!payload || typeof payload !== 'object') return undefined;

    const port = typeof payload.port === 'number' ? payload.port : Number(payload.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        log.warn('preview event: invalid port', { port: payload.port });
        return undefined;
    }

    if (typeof payload.url === 'string' && payload.url.length > 0) {
        return { ...payload, port };
    }

    if (!ctx.sandboxId) {
        log.warn('preview event: no sandboxId on context, cannot resolve URL');
        return undefined;
    }

    try {
        const provider = deps.sandboxService.getDaytonaProvider();
        const url = await provider.getPreviewUrl(ctx.sandboxId, port);
        return { ...payload, port, url };
    } catch (err) {
        log.warn('preview event: failed to resolve Daytona URL', {
            port,
            error: (err as Error).message,
        });
        return undefined;
    }
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

const FILE_WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

// Regex patterns for paths that need Neon DB sync
const AGENT_CONFIG_PATTERN = /^agents\/([a-zA-Z0-9._-]+)\/config\.json$/;

/**
 * Sync agent file changes to Neon agent_registry.
 * Fires on Write/Edit of agents/{slug}/config.json.
 * This ensures Neon stays in sync when agents create other agents via native Write tool,
 * without requiring the agent to emit metadata_sync events manually.
 * Non-critical — errors are caught by the caller and logged as warnings.
 */
async function syncFileChangeToNeon(
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

function emitFileChangedFromToolCall(d: Record<string, unknown>, ctx: PipelineContext): void {
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
    if (!rawPath) {
        return;
    }

    const pathResult = validateWorkspacePath(rawPath);
    if (!pathResult.valid) {
        return;
    }

    const action = tc.tool_name === 'Write' ? 'created' : 'modified';
    workspaceSSEBroadcaster.broadcastFileChanged(ctx.request.userId, {
        type: 'file_changed',
        path: pathResult.normalized,
        action,
        timestamp: new Date().toISOString(),
    });
}

function logEvent(eventType: string, d: Record<string, unknown>): void {
    const agentSlug = d.agent_slug || '';
    const payload = d.data && typeof d.data === 'object' ? d.data : d;
    log.debug(eventType, { agent_slug: agentSlug, data: payload });
}
