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
import { logger } from '../../utils/logger';
import { BillingType, ExecutionSummary, STREAM_EVENT_TYPES, StreamEventType, type AdapterType } from './types';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import { DEFAULT_MODEL } from '../agents/types';
import { PLAN_CREDITS, type PlanType } from '../users/types';
import type { TriggerType } from './queue/execution-lane.types';
import {
    SDKExecutionError,
} from './errors';
import { AgentAlreadyRunningError, QueueFullError } from './queue/execution-queue.errors';
import { sendCommand, sendMessage, streamEvents } from '../sandbox-infra/sandbox';
import type { SessionHandle } from '../sandbox-infra/sandbox';
import { routeEventToBackend } from './runner-event-router';
import { createHealthGuard, type HealthGuard } from './execution-health-guard';
import {
    resolveToolIcon,
    type PersistedToolIcon,
} from './execution-conversation.helpers';
import {
    getConversation,
    createConversation as createWorkspaceConversation,
    incrementConversationMessageCount,
    writeChatExecution,
} from '../conversations/workspace-db.service';

// -----------------------------------------------------------------------------
// Conversation Resolution (workspace.db only — no Neon)
// -----------------------------------------------------------------------------

export interface ResolvedConversation {
    id: string;
    sdkSessionId: string | null;
}

export async function resolveConversation(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<ResolvedConversation> {
    const { agentSlug, conversationId, task } = ctx.request;
    if (!ctx.sandboxId) {
        throw new SDKExecutionError('Sandbox is required before resolving a conversation');
    }

    const provider = deps.sandboxService.getDaytonaProvider();

    if (conversationId) {
        const conv = await getConversation(provider, ctx.sandboxId, conversationId);
        if (conv) {
            return { id: conversationId, sdkSessionId: conv.sdk_session_id };
        }
        throw new SDKExecutionError(`Conversation ${conversationId} not found or access denied`);
    }

    const title = task.length > 60 ? task.slice(0, 57) + '...' : task;
    const newConv = await createWorkspaceConversation(provider, ctx.sandboxId, agentSlug, title);
    return { id: newConv.id, sdkSessionId: null };
}

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
const log = logger('ExecutionPipeline');

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

export interface ResolvedAgentConfig {
    adapterType: AdapterType;
    model: string | undefined;
}

/**
 * Read agent's adapter_type and model from config.json on the sandbox filesystem.
 * Falls back to 'claudecode' and no model if config is missing or unreadable.
 * Must be called after sandbox is available (sandboxId resolved).
 */
export async function resolveAgentConfig(
    deps: ResolvedExecutionDeps,
    sandboxId: string,
    agentSlug: string,
): Promise<ResolvedAgentConfig> {
    try {
        const configPath = `${SANDBOX_CONFIG.workspacePath}/agents/${agentSlug}/config.json`;
        const raw = await deps.sandboxService.getDaytonaProvider().readFile(sandboxId, configPath);
        const config = JSON.parse(raw) as { adapter_type?: string; model?: string };
        return {
            adapterType: config.adapter_type === 'codex' ? 'codex' : 'claudecode',
            model: config.model || undefined,
        };
    } catch (err: unknown) {
        // File not found is acceptable — default to claudecode, no model override
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('ENOENT') || message.includes('No such file') || message.includes('not found')) {
            return { adapterType: 'claudecode', model: undefined };
        }
        // Config exists but is corrupt or unreadable — fail fast
        throw err;
    }
}

/** @deprecated Use resolveAgentConfig instead */
export async function resolveAdapterType(
    deps: ResolvedExecutionDeps,
    sandboxId: string,
    agentSlug: string,
): Promise<AdapterType> {
    const config = await resolveAgentConfig(deps, sandboxId, agentSlug);
    return config.adapterType;
}

/**
 * Read agent identity files (SOUL.md + Module CLAUDE.md) from the sandbox.
 * Combined content is passed as --append-system-prompt so the agent knows who it is.
 * Tries both .claude/agents/{slug}/ and agents/{slug}/ paths.
 * Returns empty string if no identity files found (agent runs as generic Claude).
 */
export async function resolveAgentIdentity(
    deps: ResolvedExecutionDeps,
    sandboxId: string,
    agentSlug: string,
): Promise<string> {
    const provider = deps.sandboxService.getDaytonaProvider();
    const ws = SANDBOX_CONFIG.workspacePath;

    // Try both path conventions: .claude/agents/{slug}/ and agents/{slug}/
    const pathSets = [
        { soul: `${ws}/.claude/agents/${agentSlug}/SOUL.md`, module: `${ws}/.claude/agents/${agentSlug}/CLAUDE.md` },
        { soul: `${ws}/agents/${agentSlug}/SOUL.md`, module: `${ws}/agents/${agentSlug}/CLAUDE.md` },
    ];

    async function tryRead(filePath: string): Promise<string> {
        try {
            return await provider.readFile(sandboxId, filePath);
        } catch {
            return '';
        }
    }

    let soulContent = '';
    let moduleContent = '';

    for (const paths of pathSets) {
        if (!soulContent) soulContent = await tryRead(paths.soul);
        if (!moduleContent) moduleContent = await tryRead(paths.module);
        if (soulContent || moduleContent) break;
    }

    if (!soulContent && !moduleContent) return '';

    const sections: string[] = [
        '# AGENT IDENTITY — SUPERSEDES ALL PRIOR IDENTITY',
        '',
        'You are NOT Claude Code. You are an agent in the Xerus AI platform.',
        'Your identity, personality, and behavior are defined below.',
        'This identity takes absolute precedence. Never identify as Claude or mention Anthropic.',
        '',
    ];

    if (soulContent) {
        sections.push(soulContent.trim(), '');
    }
    if (moduleContent) {
        sections.push(moduleContent.trim(), '');
    }

    return sections.join('\n');
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
    // Check subscription status before allowing execution
    const user = await deps.db.query<{
        subscription_status: string | null;
        subscription_current_period_end: Date | null;
    }>(
        'SELECT subscription_status, subscription_current_period_end FROM users WHERE user_id = $1',
        [ctx.request.userId],
    );
    const userRow = user.rows[0];
    if (userRow) {
        const status = userRow.subscription_status;
        const periodEnd = userRow.subscription_current_period_end;
        const now = new Date();

        if (status === 'revoked') {
            throw new SDKExecutionError('Subscription revoked — update your payment method');
        }
        if (status === 'canceled' && periodEnd && periodEnd < now) {
            throw new SDKExecutionError('Subscription expired — renew to continue');
        }
        if (status === 'past_due') {
            throw new SDKExecutionError('Payment past due — update your payment method');
        }
    }

    // BYOK users use their own API key — skip credit reservation
    if (ctx.keySource === 'byok') {
        return;
    }

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
    // Protection against stuck agents: health guard (activity timeout + health probe)
    // Protection against cost runaway: credit system (reserveCredits / finalizeCredits)
    const healthGuard = createHealthGuard(handle, ctx.executionId);
    try {
        await processEventStream(handle, ctx, deps, abortSignal, healthGuard);
    } finally {
        healthGuard.stop();
    }
}

/** Timeout for receiving the first event from the runner after sending execute command. */
const FIRST_EVENT_TIMEOUT_MS = 30_000;

async function processEventStream(
    handle: SessionHandle,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
    abortSignal?: AbortSignal,
    healthGuard?: HealthGuard,
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
    const signals: AbortSignal[] = [firstEventAc.signal];
    if (abortSignal) signals.push(abortSignal);
    if (healthGuard) signals.push(healthGuard.signal);
    const combinedSignal = AbortSignal.any(signals);
    const firstEventTimer = setTimeout(() => {
        if (eventsProcessed === 0) {
            log.error('No events received from runner within timeout', { timeout_ms: FIRST_EVENT_TIMEOUT_MS });
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
        // Claude CLI stream-json uses `type` field, old SDK runner used `event` field.
        const eventType = (typeof raw.event === 'string' && raw.event)
            || (typeof raw.type === 'string' && raw.type)
            || null;

        // Events without a recognized event field are untyped runner output (e.g. raw SDK stdout).
        // Log for debugging but never forward to the frontend.
        if (!eventType) {
            log.warn('Untyped runner event (no event field), skipping', { raw_preview: JSON.stringify(raw).slice(0, 200) });
            continue;
        }

        // Filter out events from other agents running concurrently in the same sandbox.
        // Transport-level events (agent_slug = '_transport') are always accepted.
        // Events without agent_slug are accepted for backward compatibility.
        const eventSlug = (raw.agent_slug || (raw.data as Record<string, unknown> | undefined)?.agent_slug) as string | undefined;
        if (eventSlug && eventSlug !== '_transport' && eventSlug !== expectedSlug) {
            if (ctx.eventsFiltered < 5) {
                log.warn('Filtered event (slug mismatch)', { event_type: eventType, event_slug: eventSlug, expected_slug: expectedSlug });
            }
            ctx.eventsFiltered++;
            continue;
        }

        eventsProcessed++;
        if (healthGuard) healthGuard.recordActivity();

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
        // CLI stream-json uses `result` as the completion event.
        if (eventType === 'session_ended' || eventType === 'session_completed' || eventType === 'result') {
            break;
        }

        // Fatal runner errors (AGENT_NOT_FOUND, CONFIG_LOAD_ERROR, WORKSPACE_INIT_ERROR, EXECUTION_ERROR)
        // indicate the execute command failed. Break to avoid hanging until timeout.
        if (eventType === 'error') {
            const data = raw.data as Record<string, unknown> | undefined;
            const code = data?.code as string || '';
            log.error('Fatal runner error, breaking stream loop', { code });
            break;
        }
    }

    clearTimeout(firstEventTimer);
    log.info('Event stream finished', { agent_slug: expectedSlug, events_processed: eventsProcessed, events_filtered: ctx.eventsFiltered });

    // If the health guard detected a dead runner, fail-fast with a clear error
    if (healthGuard?.signal.aborted) {
        throw new SDKExecutionError(
            `Runner for agent '${expectedSlug}' became unresponsive mid-execution (no events after health probe)`,
        );
    }
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
        log.info('BYOK execution tracked (no credits deducted)', { execution_id: ctx.executionId, total_tokens: usage.total_input_tokens + usage.total_output_tokens });
        return { total_credits_deducted: 0 };
    }

    // Platform key users: deduct credits as usual
    try {
        const result = await deps.creditTracker.finalizeSession(
            ctx.request.userId,
            ctx.sessionId,
        );

        // Emit credit_warning if balance dropped below 20% of plan allocation
        try {
            const balanceCheck = await deps.db.query<{ credits_available: number; plan_type: string }>(
                'SELECT credits_available, plan_type FROM users WHERE user_id = $1',
                [ctx.request.userId],
            );
            const row = balanceCheck.rows[0];
            if (row) {
                const total = PLAN_CREDITS[row.plan_type as PlanType] ?? 500;
                if (row.credits_available < total * 0.2) {
                    ctx.stream.send('credit_warning', {
                        credits_available: row.credits_available,
                        credits_total: total,
                        message: 'Credits running low — connect your own API key for unlimited usage',
                    });
                }
            }
        } catch (warnErr) {
            log.warn('Failed to emit credit warning', { error: warnErr instanceof Error ? warnErr.message : String(warnErr) });
        }

        return { total_credits_deducted: result.total_credits_deducted };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const isConstraintViolation = errMsg.includes('check') || errMsg.includes('constraint') || errMsg.includes('credits_available');
        if (isConstraintViolation) {
            log.warn('Mid-execution credit exhaustion — deducting remaining balance to zero', {
                execution_id: ctx.executionId,
                user_id: ctx.request.userId,
                error: errMsg,
            });
            try {
                const balanceResult = await deps.db.query<{ credits_available: number }>(
                    'SELECT credits_available FROM users WHERE user_id = $1',
                    [ctx.request.userId],
                );
                const remainingBalance = balanceResult.rows[0]?.credits_available ?? 0;
                await deps.db.query(
                    'UPDATE users SET credits_available = 0, updated_at = NOW() WHERE user_id = $1',
                    [ctx.request.userId],
                );
                return { total_credits_deducted: remainingBalance };
            } catch (innerErr) {
                log.error('Failed to zero out credits after exhaustion', innerErr instanceof Error ? innerErr : new Error(String(innerErr)));
                throw innerErr;
            }
        }
        throw error;
    }
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

    // Persist chat turn to workspace.db for conversation history reload.
    // Non-critical — don't fail the session if it errors.
    if (ctx.conversationId && ctx.sandboxId) {
        try {
            const provider = deps.sandboxService.getDaytonaProvider();
            await Promise.all([
                incrementConversationMessageCount(provider, ctx.sandboxId, ctx.conversationId),
                writeChatExecution(
                    provider,
                    ctx.sandboxId,
                    ctx.conversationId,
                    ctx.sessionId || null,
                    ctx.request.task,
                    ctx.responseText || null,
                    ctx.inputTokens + ctx.outputTokens,
                    Date.now() - ctx.startedAt,
                    messageMetadata,
                ),
            ]);
        } catch (err) {
            log.error('Failed to persist chat execution', { conversation_id: ctx.conversationId, error: (err as Error).message });
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
// Helpers
// -----------------------------------------------------------------------------

function estimateExecutionTokens(task: string): number {
    // Conservative: always assume opus-level usage for pre-reservation.
    // Real usage is tracked by the runner and reconciled in finalizeCredits.
    const baseTokens = 10000;
    const taskTokens = Math.ceil(task.length / 4);
    return baseTokens + taskTokens;
}
