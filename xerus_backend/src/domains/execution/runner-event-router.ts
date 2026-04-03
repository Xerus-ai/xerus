// Runner Event Router
// Routes runner stdout events to backend services (DB writes, SSE, logging).

import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { requireAgent } from './pipeline-guards';
import { validateWorkspacePath } from '../../utils/path-validation';
import { STREAM_EVENT_TYPES, type StreamEventType, type RunnerEventType } from './types';
import type { HITLRequest, HITLScenario, UIHint } from './hitl/hitl.types';
import { handleMetadataSync } from './metadata-sync-router';
import { handleTriggerIndexing } from './indexing-event-handler';
import { ChannelNotFoundError, MentionParser } from '../inbox';
import { workspaceSSEBroadcaster } from '../drive';

const mentionParser = new MentionParser();

export const EVENT_ROUTER_LOG_PREFIX = '[EventRouter]';

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
        case 'tool_call':
            ctx.toolCallCount++;
            emitFileChangedFromToolCall(d, ctx);
            // Accumulate tool call details for structured persistence
            ctx.toolCallDetails.push({
                call_id: (d.callId || d.call_id || d.id) as string || `tc-${ctx.toolCallCount}`,
                tool_name: (d.toolName || d.tool_name || d.name || d.tool) as string || 'unknown',
                arguments: (d.arguments || d.input || d.tool_input) as Record<string, unknown> | undefined,
                started_at: Date.now(),
            });
            break;
        case 'tool_result': {
            // Match tool_result to its tool_call and record result + duration
            const callId = (d.callId || d.call_id) as string | undefined;
            if (callId) {
                const entry = ctx.toolCallDetails.find(tc => tc.call_id === callId);
                if (entry) {
                    entry.result = d.result;
                    entry.success = (d.success as boolean) ?? true;
                    entry.duration_ms = Date.now() - entry.started_at;
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
            // agent_runs table dropped — event should no longer be emitted by runner.
            // Log as warning so we notice if it still fires.
            console.warn(`${EVENT_ROUTER_LOG_PREFIX} update_agent_run: deprecated event still being emitted`);
            break;
        case 'sse_forward':
            handleSseForward(d, ctx);
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
            console.error(`${EVENT_ROUTER_LOG_PREFIX} error: code=${d.code || 'unknown'} message=${d.message || ''}`);
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
        case 'heartbeat_fired':
        case 'heartbeat_skipped':
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
        default:
            console.warn(`${EVENT_ROUTER_LOG_PREFIX} unknown event: ${eventType}`);
            break;
    }
}

function handleAgentOutput(d: Record<string, unknown>, ctx: PipelineContext): void {
    const text = extractTextFromAgentOutput(d);
    if (text.length > 0) {
        // Only emit if no sse_forward token events were already received for this text.
        // The runner's process-manager emits both sse_forward tokens (from stream_event
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
 *   2. d.content is an SDK message object with content blocks (assistant messages)
 *   3. d.content is an array of content blocks directly
 */
function extractTextFromAgentOutput(d: Record<string, unknown>): string {
    // Shape 1: plain string content
    if (typeof d.content === 'string') {
        return d.content;
    }

    // Shape 2: SDK message object with content blocks (e.g. { type: 'assistant', message: { content: [...] } })
    const content = d.content as Record<string, unknown> | undefined;
    if (content && typeof content === 'object') {
        // Direct content blocks array
        const blocks = Array.isArray(content)
            ? content
            : Array.isArray((content as Record<string, unknown>).content)
                ? (content as Record<string, unknown>).content as unknown[]
                : (content as Record<string, unknown>).message
                    ? ((content as Record<string, unknown>).message as Record<string, unknown>)?.content as unknown[] | undefined
                    : undefined;

        if (Array.isArray(blocks)) {
            const parts: string[] = [];
            for (const block of blocks) {
                if (typeof block === 'object' && block !== null) {
                    const b = block as Record<string, unknown>;
                    if (b.type === 'text' && typeof b.text === 'string') {
                        parts.push(b.text);
                    }
                }
            }
            return parts.join('');
        }
    }

    return '';
}

async function handleSessionStarted(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const sdkSessionId = d.session_id as string | undefined;
    const data = d.data as Record<string, unknown> | undefined;
    const runnerModel = typeof data?.model === 'string' ? data.model : null;
    const agentSlug = typeof d.agent_slug === 'string' ? d.agent_slug : null;

    // Capture real model from runner (runner reads config.json locally).
    // This replaces the old hydrateAgentFromSandbox Daytona HTTP call.
    if (runnerModel && ctx.agent) {
        ctx.agent.ai_model = runnerModel;
    }

    // Send meta SSE to frontend with real values from the runner
    if (!ctx.stream.isClosed()) {
        ctx.stream.send('meta', {
            model: runnerModel || ctx.agent?.ai_model || 'unknown',
            agentSlug: agentSlug || ctx.agent?.slug || '',
            agentName: agentSlug || ctx.agent?.slug || '',
            startedAt: new Date().toISOString(),
        });
    }

    if (!sdkSessionId) {
        console.warn(`${EVENT_ROUTER_LOG_PREFIX} session_started: missing session_id in event data`);
        logEvent('session_started', d);
        return;
    }
    if (!ctx.conversationId) {
        console.warn(`${EVENT_ROUTER_LOG_PREFIX} session_started: sdk_session_id received but ctx.conversationId is missing, cannot persist`);
        logEvent('session_started', d);
        return;
    }
    await deps.db.query(
        `UPDATE conversations SET sdk_session_id = $2 WHERE id = $1`,
        [ctx.conversationId, sdkSessionId],
    );
    logEvent('session_started', d);
}

function handleSessionEnded(d: Record<string, unknown>, ctx: PipelineContext): void {
    const usage = d.usage as Record<string, unknown> | undefined;
    if (usage) {
        const input = (usage.input_tokens as number) || 0;
        const output = (usage.output_tokens as number) || 0;
        ctx.inputTokens += input;
        ctx.outputTokens += output;
    }
    ctx.agentSessionCount++;
}

async function handleSessionCompleted(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const reason = d.reason as string || '';
    if (typeof d.status !== 'string') {
        console.warn(`${EVENT_ROUTER_LOG_PREFIX} session_completed: missing status field, defaulting to unknown`);
    }
    const status = (d.status as string) || 'unknown';
    const summary = d.summary as string || '';
    ctx.status = 'completed';
    // Only use summary as responseText if no streamed tokens were received.
    // Otherwise streamed chunks take precedence (joined in updateSessionRecord).
    if (!ctx.responseText && ctx.responseChunks.length === 0 && summary) {
        ctx.responseText = summary;
    }
    if (ctx.sessionId) {
        await deps.db.query(
            `UPDATE execution_sessions SET status = 'completed', completed_at = NOW(), agent_response = COALESCE($2, agent_response) WHERE id = $1`,
            [ctx.sessionId, reason || summary || null],
        );
    }
    console.log(`${EVENT_ROUTER_LOG_PREFIX} session_completed: status=${status} reason=${reason}`);
}

function handleCreditUsage(
    d: Record<string, unknown>, ctx: PipelineContext,
): void {
    const creditsConsumed = d.credits_consumed as number | undefined;
    if (creditsConsumed && creditsConsumed > 0) {
        ctx.creditsUsed += creditsConsumed;
    }
}

function handleSseForward(d: Record<string, unknown>, ctx: PipelineContext): void {
    const sseEvent = d.sse_event as string | undefined;
    if (sseEvent && VALID_SSE_FORWARD_EVENTS.has(sseEvent)) {
        ctx.stream.send(sseEvent as StreamEventType, d.payload, d.meta);
        const payload = d.payload as Record<string, unknown> | undefined;
        // Accumulate response text from token events for the final done summary
        if (sseEvent === 'token') {
            if (typeof payload?.text === 'string') {
                ctx.responseChunks.push(payload.text);
            }
        }
        // Accumulate reasoning text for structured persistence
        if (sseEvent === 'reasoning') {
            if (typeof payload?.thought === 'string') {
                ctx.thinkingChunks.push(payload.thought);
            }
        }
        // Track tool calls and results for metrics (these arrive as sse_forward,
        // not as raw 'tool_call'/'tool_result' event types)
        if (sseEvent === 'tool_call' && payload) {
            const callId = (payload.callId || payload.call_id) as string || `tc-${ctx.toolCallCount + 1}`;
            // Deduplicate: stream_event + assistant message can both emit tool_call for same callId
            if (!ctx.toolCallDetails.some(tc => tc.call_id === callId)) {
                ctx.toolCallCount++;
                ctx.toolCallDetails.push({
                    call_id: callId,
                    tool_name: (payload.toolName || payload.tool_name) as string || 'unknown',
                    arguments: payload.arguments as Record<string, unknown> | undefined,
                    started_at: Date.now(),
                });
            }
        }
        if (sseEvent === 'tool_result' && payload) {
            const callId = (payload.callId || payload.call_id) as string | undefined;
            if (callId) {
                const entry = ctx.toolCallDetails.find(tc => tc.call_id === callId);
                if (entry) {
                    entry.result = payload.result;
                    entry.success = (payload.success as boolean) ?? true;
                    entry.duration_ms = Date.now() - entry.started_at;
                }
            }
        }
    }
}

async function handleCreateInboxItem(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const channel = d.channel as string | undefined;
    const content = d.content as string | undefined;
    const priority = d.priority as string || 'normal';
    if (!content) {
        console.warn(`${EVENT_ROUTER_LOG_PREFIX} create_inbox_item: missing content`);
        return;
    }
    const title = (content.length > 80 ? content.slice(0, 77) + '...' : content);
    const summary = content.slice(0, 200);
    await deps.db.query(
        `INSERT INTO inbox_items (user_id, channel_id, agent_slug, title, summary, content, status, priority, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, 'delivered', $7, $8)`,
        [ctx.request.userId, channel || null, requireAgent(ctx).slug, title, summary, content, priority, JSON.stringify({})],
    );
}

async function handleAgentMessage(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const channelName = d.channel as string | undefined;
    const content = d.content as string | undefined;
    const agentSlug = d.agent_slug as string || '';
    const project = d.project as string || '';
    if (!channelName || !content) {
        console.warn(`${EVENT_ROUTER_LOG_PREFIX} agent_message: missing channel or content`);
        return;
    }

    if (!deps.messageBridge) {
        throw new Error(`${EVENT_ROUTER_LOG_PREFIX} agent_message: messageBridge not initialized`);
    }

    try {
        await deps.messageBridge.handleOutboundMessage(ctx.request.userId, {
            agent_slug: agentSlug,
            project,
            channel: channelName,
            content,
            message_type: (d.message_type as 'chat' | 'task_update' | 'status' | 'system') || 'chat',
            metadata: (d.metadata as Record<string, unknown>) || undefined,
        });
    } catch (err) {
        if (err instanceof ChannelNotFoundError) {
            console.warn(`${EVENT_ROUTER_LOG_PREFIX} agent_message: ${err.message}`);
            return;
        }
        throw err;
    }

    // Route @mentions to target agent sessions (best-effort, non-blocking)
    const mentions = mentionParser.parseMentions(content);
    for (const mention of mentions) {
        if (mention.target === agentSlug) continue; // skip self-mentions
        deps.messageBridge.dispatchMention(
            ctx.request.userId, agentSlug, mention.target, mention.message, project, channelName,
        ).catch(err => {
            console.warn(`${EVENT_ROUTER_LOG_PREFIX} agent_message: mention dispatch to @${mention.target} failed: ${(err as Error).message}`);
        });
    }
}

async function handleHookLog(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    if (!ctx.sessionId) { logEvent('hook_log', d); return; }
    const hookEvent = d.hook_event as string | undefined;
    if (!hookEvent) {
        console.warn(`${EVENT_ROUTER_LOG_PREFIX} hook_log: missing hook_event field`);
        return;
    }
    const durationMs = d.duration_ms as number || 0;
    const success = d.success as boolean ?? true;
    const error = d.error as string | undefined;
    await deps.db.query(
        `INSERT INTO hook_executions (execution_id, hook_event, agent_slug, user_id, payload, result, blocked, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            ctx.sessionId, hookEvent, requireAgent(ctx).slug, ctx.request.userId,
            JSON.stringify(d), JSON.stringify({ success, error }), !success, durationMs,
        ],
    );
}

async function handleSubagentFailure(d: Record<string, unknown>, ctx: PipelineContext): Promise<void> {
    if (typeof d.subagent_type !== 'string') {
        console.warn(`${EVENT_ROUTER_LOG_PREFIX} subagent_failure: missing subagent_type field, defaulting to unknown`);
    }
    if (ctx.announceQueue) {
        ctx.announceQueue.enqueue({
            subagent_type: (d.subagent_type as string) || 'unknown',
            subagent_name: (d.subagent_name as string) || (d.agent_slug as string) || 'unknown',
            success: false,
            duration_ms: (d.duration_ms as number) || 0,
            summary: d.summary as string | undefined,
            error: (d.error as string) || (d.message as string) || undefined,
            queued_at: new Date(),
        });
        ctx.announceQueue.scheduleDrain();
    }
    logEvent('subagent_failure', d);
}

async function handleSandboxLifecycle(d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps): Promise<void> {
    const sandboxId = d.sandbox_id as string | undefined;
    const action = d.action as string | undefined;
    if (!sandboxId || !action) {
        console.warn(`${EVENT_ROUTER_LOG_PREFIX} sandbox_lifecycle: missing sandbox_id or action`);
        return;
    }
    const status = SANDBOX_ACTION_STATUS_MAP[action];
    if (!status) { logEvent('sandbox_lifecycle', d); return; }
    await deps.db.query(
        `UPDATE workspaces SET sandbox_status = $2, sandbox_last_activity_at = NOW(), updated_at = NOW()
         WHERE sandbox_id = $1 AND user_id = $3`,
        [sandboxId, status, ctx.request.userId],
    );
    // Invalidate registry cache so getSandboxStatus() reads the fresh status
    deps.sandboxService.invalidateRegistryCache(ctx.request.userId);
}

function handlePushNotificationForward(d: Record<string, unknown>, ctx: PipelineContext): void {
    ctx.stream.send('notification', {
        message: (d.body as string) || '',
        agent_slug: (d.agent_slug as string) || '',
        priority: 'medium',
    });
    logEvent('push_notification', d);
}

function handleDelegationForward(d: Record<string, unknown>, ctx: PipelineContext): void {
    ctx.stream.send('delegation', {
        fromAgent: d.from_agent as string || d.agent_slug as string || '',
        toAgent: d.to_agent as string || d.subagent_type as string || '',
        task: d.task as string || '',
    });
    logEvent('delegation_record', d);
}

async function handleHitlRequest(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    if (!ctx.sessionId) {
        throw new Error(`${EVENT_ROUTER_LOG_PREFIX} hitl_request: sessionId not set — pipeline invariant violated`);
    }

    const question = d.question as string | undefined;
    const toolName = d.tool_name as string | undefined;

    if (!question || !toolName) {
        throw new Error(`${EVENT_ROUTER_LOG_PREFIX} hitl_request: missing required fields: question=${!!question} tool_name=${!!toolName}`);
    }

    const agent = requireAgent(ctx);
    const request: HITLRequest = {
        execution_id: ctx.sessionId,
        agent_id: agent.id,
        agent_slug: (d.agent_slug as string) || agent.slug,
        user_id: ctx.request.userId,
        scenario: (d.scenario as HITLScenario) || 'external_action',
        question,
        tool_name: toolName,
        tool_input: (d.tool_input ?? {}) as Record<string, unknown>,
        options: d.options as string[] | undefined,
        expanded_context: d.expanded_context as string | undefined,
        requires_auth: d.requires_auth as boolean | undefined,
        timeout_seconds: d.timeout_seconds as number | undefined,
        ui_hint: d.ui_hint as UIHint | undefined,
        browser_url: d.browser_url as string | undefined,
        preview_url: d.preview_url as string | undefined,
        artifact_path: d.artifact_path as string | undefined,
    };

    await deps.hitlHandler.requestApproval(request);

    await deps.db.query(
        `UPDATE execution_sessions SET status = 'paused' WHERE id = $1::uuid`,
        [ctx.sessionId],
    );

    console.log(`${EVENT_ROUTER_LOG_PREFIX} hitl_request: scenario=${request.scenario} tool=${toolName}`);
}

const FILE_WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

function emitFileChangedFromToolCall(d: Record<string, unknown>, ctx: PipelineContext): void {
    const toolName = (d.toolName || d.tool_name || d.name || d.tool) as string | undefined;
    if (!toolName || !FILE_WRITE_TOOLS.has(toolName)) {
        return;
    }

    const args = (d.arguments || d.input || d.tool_input) as Record<string, unknown> | undefined;
    const rawPath = (args?.file_path || args?.path || args?.notebook_path) as string | undefined;
    if (!rawPath) {
        return;
    }

    const pathResult = validateWorkspacePath(rawPath);
    if (!pathResult.valid) {
        return;
    }
    const normalized = pathResult.normalized;

    const action = toolName === 'Write' ? 'created' : 'modified';
    workspaceSSEBroadcaster.broadcastFileChanged(ctx.request.userId, {
        type: 'file_changed',
        path: normalized,
        action,
        timestamp: new Date().toISOString(),
    });
}

function logEvent(eventType: string, d: Record<string, unknown>): void {
    const agentSlug = d.agent_slug || '';
    // Log the original data payload (not the merged object which duplicates fields)
    const payload = d.data && typeof d.data === 'object' ? d.data : d;
    console.log(`${EVENT_ROUTER_LOG_PREFIX} ${eventType}: agent=${agentSlug} data=${JSON.stringify(payload)}`);
}
