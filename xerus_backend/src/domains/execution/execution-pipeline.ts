// Execution Pipeline Steps (v2 - Thin Backend Router)
// Simplified from 14 steps to 5:
// 1. Validate agent + auth + credits
// 2. Ensure sandbox is awake
// 3. Send execute command to runner via Sessions API
// 4. Stream events back to frontend via SSE
// 5. Track usage + deduct credits on completion
//
// Removed: prompt assembly, context building, Module CLAUDE.md generation,
// hook metadata, workspace preparation. Runner handles all of that.
// See: docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md Section 10

import { randomUUID } from 'crypto';
import { BillingType, ExecutionSummary, STREAM_EVENT_TYPES, StreamEventType, type AdapterType } from './types';
import { SANDBOX_CONFIG } from './sandbox/sandbox.config';
import { DEFAULT_MODEL } from '../agents/types';
import { query } from '../../database/connection';
import type { TriggerType } from './queue/execution-lane.types';
import {
    SDKExecutionError,
} from './errors';
import { AgentAlreadyRunningError, QueueFullError } from './queue/execution-queue.errors';
import { sendCommand, sendMessage, streamEvents } from './sandbox';
import type { SessionHandle } from './sandbox';
import { routeEventToBackend } from './runner-event-router';

type PersistedToolIcon = 'read' | 'write' | 'search' | 'bash' | 'web' | 'think' | 'agent' | 'skill' | 'task' | 'question';

type PersistedMessagePart =
    | { id: string; type: 'text'; text: string }
    | { id: string; type: 'reasoning'; text: string }
    | {
        id: string;
        type: 'tool';
        callId: string;
        name: string;
        state: 'done' | 'error';
        icon: PersistedToolIcon;
        args?: Record<string, unknown>;
        result?: unknown;
        target?: string;
        durationMs?: number;
    };

function resolveToolIcon(name: string): PersistedToolIcon {
    const lowerName = name.toLowerCase();
    if (lowerName === 'agent' || lowerName === 'task') return 'agent';
    if (lowerName === 'skill') return 'skill';
    if (lowerName === 'todowrite') return 'task';
    if (lowerName === 'askuserquestion') return 'question';
    if (lowerName.includes('read') || lowerName.includes('glob') || lowerName.includes('grep')) return 'read';
    if (lowerName.includes('write') || lowerName.includes('edit') || lowerName.includes('notebook')) return 'write';
    if (lowerName.includes('bash') || lowerName.includes('exec') || lowerName.includes('command')) return 'bash';
    if (lowerName.includes('web') || lowerName.includes('fetch')) return 'web';
    if (lowerName.includes('search') || lowerName.includes('toolsearch')) return 'search';
    if (lowerName.includes('think') || lowerName.includes('plan') || lowerName.includes('reason')) return 'think';
    return 'search';
}

export type {
    ExecutionServiceDeps,
    ResolvedExecutionDeps,
    ExecutionDatabase,
    AgentRow,
    StartExecutionOptions,
    PipelineContext,
} from './execution-pipeline.types';

import type {
    ResolvedExecutionDeps,
    AgentRow,
    PipelineContext,
} from './execution-pipeline.types';

// Re-export pipeline guard so callers importing from execution-pipeline still work
export { requireAgent } from './pipeline-guards';
import { requireAgent } from './pipeline-guards';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Timeout for waiting in queue when another execution is running */
const QUEUE_WAIT_TIMEOUT_MS = 120_000; // 2 minutes
/** Timeout for sandbox creation / wake-up */
const SANDBOX_CREATION_TIMEOUT_MS = 120_000; // 2 minutes

export const LOG_PREFIX = '[ExecutionPipeline]';

// -----------------------------------------------------------------------------
// Step 1: Validate Agent + Auth
// -----------------------------------------------------------------------------

export async function loadAgent(
    deps: ResolvedExecutionDeps,
    agentSlug: string,
    userId: string,
): Promise<AgentRow> {
    // Parallel: agent_registry and workspaces lookups are independent (both need only userId/slug)
    const [registryResult, wsResult] = await Promise.all([
        deps.db.query<{ id: number; slug: string; user_id: string | null; agent_type: string }>(
            `SELECT id, slug, user_id, agent_type FROM agent_registry
             WHERE slug = $1 AND (user_id = $2 OR user_id IS NULL OR agent_type = 'public')`,
            [agentSlug, userId],
        ),
        deps.db.query<{ id: string }>(
            `SELECT id::text FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        ),
    ]);
    if (wsResult.rows.length === 0) {
        throw new SDKExecutionError(`No workspace found for user ${userId} — agent cannot run without a workspace`);
    }
    const workspaceId = wsResult.rows[0].id;
    const entry = registryResult.rows[0];

    if (!entry) {
        throw new SDKExecutionError(`Agent '${agentSlug}' not found in registry for user '${userId}'`);
    }

    // agent_registry is a thin table (id, slug, user_id, agent_type).
    // Agent metadata (name, ai_model, etc.) lives in config.json on the workspace filesystem.
    // The runner reads config.json locally and reports the real model via session_started event,
    // which updates ctx.agent.ai_model in handleSessionStarted.
    // Defaults here are overridden by the runner — they are NOT fabricated stubs.
    // adapter_type defaults to 'claudecode' — resolved from config.json by resolveAdapterType().
    return {
        id: entry.id,
        name: entry.slug,
        slug: entry.slug,
        description: '',
        ai_model: DEFAULT_MODEL,
        thinking_level: 'medium',
        autonomy_level: 'supervised',
        adapter_type: 'claudecode',
        primary_use_case: '',
        workspace_id: workspaceId,
        user_id: entry.user_id || userId,
    };
}

/**
 * Read agent's adapter_type from config.json on the sandbox filesystem.
 * Falls back to 'claudecode' if config is missing or unreadable.
 * Must be called after sandbox is available (sandboxId resolved).
 */
export async function resolveAdapterType(
    deps: ResolvedExecutionDeps,
    sandboxId: string,
    agentSlug: string,
): Promise<AdapterType> {
    try {
        const configPath = `${SANDBOX_CONFIG.workspacePath}/agents/${agentSlug}/config.json`;
        const raw = await deps.sandboxService.getDaytonaProvider().readFile(sandboxId, configPath);
        const config = JSON.parse(raw) as { adapter_type?: string };
        if (config.adapter_type === 'codex') return 'codex';
    } catch {
        // Config not found or unreadable — use default
    }
    return 'claudecode';
}

export async function acquireExecutionLane(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
    triggerType: TriggerType,
): Promise<{ lane_id: string; queued: boolean }> {
    const userId = ctx.request.userId;
    const agentSlug = ctx.request.agentSlug;

    // Atomically check running state and enqueue in a single step.
    // isAgentRunning is checked BEFORE enqueue so we know if we need to wait.
    // Both calls are synchronous and run in the same event-loop tick,
    // so no TOCTOU race is possible in single-threaded Node.js.
    const queued = deps.queueService.isAgentRunning(userId, agentSlug);

    let requestId: string;
    try {
        const enqueueResult = deps.queueService.enqueue({
            user_id: userId,
            agent_slug: agentSlug,
            trigger_type: triggerType,
            prompt: ctx.request.task,
            coordination_mode: ctx.request.coordinationMode,
        });
        requestId = enqueueResult.request_id;
    } catch (err) {
        if (err instanceof AgentAlreadyRunningError) {
            throw new SDKExecutionError('This agent already has a pending message. Please wait for it to complete.');
        }
        if (err instanceof QueueFullError) {
            throw new SDKExecutionError('Execution queue is full. Please try again later.');
        }
        throw err;
    }

    if (queued) {
        ctx.stream.send('progress', { phase: 'queued', message: 'Message queued — waiting for current execution to finish', percent: 5 });

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), QUEUE_WAIT_TIMEOUT_MS);
        try {
            await deps.queueService.waitForAgentAvailable(userId, agentSlug, ac.signal);
        } catch {
            throw new SDKExecutionError('Timed out waiting for agent to become available');
        } finally {
            clearTimeout(timer);
        }
    }

    const lane = deps.queueService.acquireRequest(userId, requestId);
    if (!lane) {
        throw new SDKExecutionError('No execution lane available');
    }

    return { lane_id: lane.lane_id, queued };
}

// -----------------------------------------------------------------------------
// Step 2: Reserve Credits
// -----------------------------------------------------------------------------

export async function reserveCredits(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<void> {
    // BYOK users use their own API key — skip credit reservation
    if (ctx.keySource === 'byok') {
        return;
    }

    // Conservative estimate: assume worst-case (opus-level) token usage.
    // The real model lives in sandbox config.json (runner reads it locally).
    // finalizeCredits uses actual token counts from the runner, so over-reservation
    // here is safe — excess is refunded.
    const estimatedTokens = estimateExecutionTokens(ctx.request.task);

    const estimate = deps.sdkService.estimateCreditsConservative(estimatedTokens);

    const hasCredits = await deps.creditTracker.checkCredits(
        ctx.request.userId,
        estimate.estimatedCredits,
    );

    if (!hasCredits) {
        throw new SDKExecutionError('Insufficient credits for execution');
    }
}

// -----------------------------------------------------------------------------
// Step 3: Ensure Sandbox
// -----------------------------------------------------------------------------

export async function ensureSandbox(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<string> {
    const sandbox = await deps.sandboxService.getOrCreateSandbox({
        userId: ctx.request.userId,
        template: undefined,
        timeoutMs: SANDBOX_CREATION_TIMEOUT_MS,
    });

    ctx.setupReport = sandbox.setupReport ?? null;
    deps.sandboxService.incrementExecutionCount(ctx.request.userId);
    return sandbox.sandboxId;
}

// -----------------------------------------------------------------------------
// Step 4: Send Execute Command + Stream Events
// -----------------------------------------------------------------------------

export async function sendExecuteCommand(
    handle: SessionHandle,
    ctx: PipelineContext,
): Promise<void> {
    // CLI runs directly (no cli-executor middleman).
    // Send the user's message as plain text to the CLI's stdin.
    // Claude/Codex in interactive mode read from stdin.
    const prompt = ctx.request.context
        ? `${ctx.request.task}\n\nContext:\n${ctx.request.context}`
        : ctx.request.task;
    await sendMessage(handle, prompt);
}

export async function streamRunnerEvents(
    handle: SessionHandle,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
    abortSignal?: AbortSignal,
): Promise<void> {
    // No wall-clock timeout. Agents run until completion.
    // Protection against stuck agents: runner idle watchdog (5 min without SDK messages)
    // Protection against cost runaway: credit system (reserveCredits / finalizeCredits)
    await processEventStream(handle, ctx, deps, abortSignal);
}

/** Timeout for receiving the first event from the runner after sending execute command. */
const FIRST_EVENT_TIMEOUT_MS = 30_000;

async function processEventStream(
    handle: SessionHandle,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
    abortSignal?: AbortSignal,
): Promise<void> {
    // The runner is a persistent process shared by all agents in the sandbox.
    // Multiple agents can execute concurrently (e.g. inbox watcher triggers master
    // while a domain agent is running). Their events interleave in the shared
    // PersistentLogBuffer. Filter by agent_slug so each pipeline only processes
    // events belonging to its agent — prevents identity leakage across streams.
    const expectedSlug = requireAgent(ctx).slug;
    let eventsProcessed = 0;

    // Safety: abort if no events arrive within FIRST_EVENT_TIMEOUT_MS.
    // This catches cases where the runner process crashed silently or the SDK never starts.
    const firstEventAc = new AbortController();
    const combinedSignal = abortSignal
        ? AbortSignal.any([abortSignal, firstEventAc.signal])
        : firstEventAc.signal;
    const firstEventTimer = setTimeout(() => {
        if (eventsProcessed === 0) {
            console.error(`${LOG_PREFIX} No events received from runner within ${FIRST_EVENT_TIMEOUT_MS}ms — runner may have crashed`);
            firstEventAc.abort();
        }
    }, FIRST_EVENT_TIMEOUT_MS);

    for await (const event of streamEvents(handle, combinedSignal, ctx.streamOffset)) {
        if (eventsProcessed === 0) clearTimeout(firstEventTimer);
        if (ctx.stream.isClosed()) {
            await sendCommand(handle, { type: 'interrupt', agent_slug: expectedSlug });
            break;
        }

        const raw = event as unknown as Record<string, unknown>;
        const eventType = typeof raw.event === 'string' && raw.event ? raw.event : null;

        // Events without a recognized event field are untyped runner output (e.g. raw SDK stdout).
        // Log for debugging but never forward to the frontend.
        if (!eventType) {
            console.warn(`${LOG_PREFIX} Untyped runner event (no event field), skipping:`, JSON.stringify(raw).slice(0, 200));
            continue;
        }

        // Filter out events from other agents running concurrently in the same sandbox.
        // Transport-level events (agent_slug = '_transport') are always accepted.
        // Events without agent_slug are accepted for backward compatibility.
        const eventSlug = (raw.agent_slug || (raw.data as Record<string, unknown> | undefined)?.agent_slug) as string | undefined;
        if (eventSlug && eventSlug !== '_transport' && eventSlug !== expectedSlug) {
            if (ctx.eventsFiltered < 5) {
                console.warn(`${LOG_PREFIX} Filtered event: type=${eventType} slug=${eventSlug} expected=${expectedSlug}`);
            }
            ctx.eventsFiltered++;
            continue;
        }

        eventsProcessed++;

        await routeEventToBackend(eventType, raw, ctx, deps);

        // sse_forward events are already sent by handleSseForward (token, tool_call, tool_result, reasoning)
        // agent_output is raw SDK data translated by the runner into typed sse_forward events
        // Only forward events that are: (a) in STREAM_EVENT_TYPES and (b) not internal runner events
        if (eventType !== 'sse_forward' && eventType !== 'agent_output'
            && (STREAM_EVENT_TYPES as readonly string[]).includes(eventType)) {
            ctx.stream.send(eventType as StreamEventType, raw.content || raw.data, raw.meta);
        }

        // Runner is a persistent process — it stays alive after the session ends.
        // Break the loop so the pipeline can finalize credits and close the stream.
        if (eventType === 'session_ended' || eventType === 'session_completed') {
            break;
        }

        // Fatal runner errors (AGENT_NOT_FOUND, CONFIG_LOAD_ERROR, WORKSPACE_INIT_ERROR, EXECUTION_ERROR)
        // indicate the execute command failed. Break to avoid hanging until timeout.
        if (eventType === 'error') {
            const data = raw.data as Record<string, unknown> | undefined;
            const code = data?.code as string || '';
            console.error(`${LOG_PREFIX} Fatal runner error: code=${code} — breaking stream loop`);
            break;
        }
    }

    clearTimeout(firstEventTimer);
    console.log(`${LOG_PREFIX} ${expectedSlug}: ${eventsProcessed} events processed, ${ctx.eventsFiltered} filtered (slug mismatch)`);
}

// -----------------------------------------------------------------------------
// Step 5: Track Usage + Finalize
// -----------------------------------------------------------------------------

export async function createSessionRecord(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<string> {
    const agent = requireAgent(ctx);
    const sessionId = randomUUID();

    await deps.db.query(
        `INSERT INTO execution_sessions (id, workspace_id, agent_slug, sandbox_id, status, trigger_type, conversation_id, user_prompt, key_source, started_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [sessionId, agent.workspace_id, agent.slug, ctx.sandboxId, 'running', ctx.triggerType, ctx.conversationId, ctx.request.task, ctx.keySource],
    );

    deps.creditTracker.setSessionId(sessionId);
    deps.creditTracker.setAgentSlug(agent.slug);

    return sessionId;
}

export async function finalizeCredits(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<{ total_credits_deducted: number }> {
    if (!ctx.sessionId) {
        throw new SDKExecutionError('Cannot finalize credits: sessionId is missing (pipeline invariant violated)');
    }

    // BYOK users: track usage for analytics but skip credit deduction
    if (ctx.keySource === 'byok') {
        const usage = await deps.creditTracker.getSessionUsage(ctx.sessionId);
        console.log(
            `${LOG_PREFIX} BYOK execution ${ctx.executionId}: ${usage.total_input_tokens + usage.total_output_tokens} tokens tracked (no credits deducted)`,
        );
        return { total_credits_deducted: 0 };
    }

    // Platform key users: deduct credits as usual
    const result = await deps.creditTracker.finalizeSession(
        ctx.request.userId,
        ctx.sessionId,
    );

    return { total_credits_deducted: result.total_credits_deducted };
}

export async function updateSessionRecord(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<void> {
    if (!ctx.sessionId) {
        throw new SDKExecutionError('Cannot update session: sessionId is missing (pipeline invariant violated)');
    }

    // Join accumulated response chunks into final responseText (avoids O(n^2) string concat during streaming)
    if (ctx.responseChunks.length > 0 && !ctx.responseText) {
        ctx.responseText = ctx.responseChunks.join('');
    }

    // Build structured metadata for rich history reload
    const thinkingText = ctx.thinkingChunks.length > 0 ? ctx.thinkingChunks.join('\n') : null;
    const parts: PersistedMessagePart[] = [];

    if (thinkingText) {
        parts.push({
            id: 'reasoning-final',
            type: 'reasoning',
            text: thinkingText,
        });
    }

    for (const toolCall of ctx.toolCallDetails) {
        parts.push({
            id: `tool-${toolCall.call_id}`,
            type: 'tool',
            callId: toolCall.call_id,
            name: toolCall.tool_name,
            state: toolCall.success === false ? 'error' : 'done',
            icon: resolveToolIcon(toolCall.tool_name),
            args: toolCall.arguments,
            result: toolCall.result,
            target: toolCall.arguments ? String(Object.values(toolCall.arguments)[0] ?? '') : undefined,
            durationMs: toolCall.duration_ms,
        });
    }

    if (ctx.responseText) {
        parts.push({
            id: 'text-final',
            type: 'text',
            text: ctx.responseText,
        });
    }

    const messageMetadata = parts.length > 0 || ctx.toolCallDetails.length > 0
        ? JSON.stringify({ parts, tool_calls: ctx.toolCallDetails })
        : null;

    await deps.db.query(
        `UPDATE execution_sessions
         SET status = $2, input_tokens = $3, output_tokens = $4,
             credits_used = $5, agent_response = $6, thinking = $7, message_metadata = $8,
             setup_report = $9, events_filtered = $10, hook_health = $11,
             completed_at = NOW()
         WHERE id = $1`,
        [ctx.sessionId, ctx.status, ctx.inputTokens, ctx.outputTokens, ctx.creditsUsed,
         ctx.responseText || null, thinkingText, messageMetadata,
         ctx.setupReport ? JSON.stringify(ctx.setupReport) : null, ctx.eventsFiltered,
         ctx.hookHealth ? JSON.stringify(ctx.hookHealth) : null],
    );

    // Message count is non-critical — don't fail the session if it errors
    if (ctx.conversationId) {
        try {
            await incrementMessageCount(ctx.conversationId);
        } catch (err) {
            console.error(
                `${LOG_PREFIX} Failed to increment message count for ${ctx.conversationId}: ${(err as Error).message}`,
            );
        }
    }
}

export function buildSummary(ctx: PipelineContext): ExecutionSummary {
    return {
        totalTokens: ctx.inputTokens + ctx.outputTokens,
        durationMs: Date.now() - ctx.startedAt,
        toolCalls: ctx.toolCallCount,
        agentsUsed: Math.max(ctx.agentSessionCount, 1),
        billingType: ctx.keySource as BillingType | undefined,
    };
}

// -----------------------------------------------------------------------------
// Conversation Helpers (inlined from deleted history domain)
// -----------------------------------------------------------------------------

async function createConversation(
    userId: string,
    agentSlug: string | null,
    title: string,
): Promise<{ id: string }> {
    const result = await query<{ id: string }>(
        `INSERT INTO conversations (user_id, agent_slug, title)
         VALUES ($1, $2, $3) RETURNING id`,
        [userId, agentSlug, title],
    );
    return result.rows[0];
}

async function incrementMessageCount(conversationId: string): Promise<void> {
    await query(
        `UPDATE conversations
         SET message_count = message_count + 1, last_message_at = NOW()
         WHERE id = $1`,
        [conversationId],
    );
}

// -----------------------------------------------------------------------------
// Conversation Resolution
// If conversationId is provided, verify it exists. Otherwise create one.
// -----------------------------------------------------------------------------

export interface ResolvedConversation {
    id: string;
    sdkSessionId: string | null;
}

export async function resolveConversation(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<ResolvedConversation> {
    const { userId, agentSlug, conversationId, task } = ctx.request;

    if (conversationId) {
        // Verify the conversation exists and fetch sdk_session_id for resume
        const result = await deps.db.query<{ id: string; sdk_session_id: string | null }>(
            `SELECT id, sdk_session_id FROM conversations WHERE id = $1 AND user_id = $2`,
            [conversationId, userId],
        );
        if (result.rows.length > 0) {
            return {
                id: conversationId,
                sdkSessionId: result.rows[0].sdk_session_id,
            };
        }
        throw new SDKExecutionError(`Conversation ${conversationId} not found or access denied`);
    }

    // Create new conversation with title from first ~60 chars of task
    const title = task.length > 60 ? task.slice(0, 57) + '...' : task;
    const conv = await createConversation(userId, agentSlug, title);
    return { id: conv.id, sdkSessionId: null };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function estimateExecutionTokens(task: string): number {
    // Conservative: always assume opus-level usage for pre-reservation.
    // Real usage is tracked by the runner and reconciled in finalizeCredits.
    const baseTokens = 10000;
    const taskTokens = Math.ceil(task.length / 4);
    return baseTokens + taskTokens;
}
