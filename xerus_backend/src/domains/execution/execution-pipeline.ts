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

import { logger } from '../../utils/logger';
import { STREAM_EVENT_TYPES, StreamEventType } from './types';
import { DEFAULT_MODEL } from '../agents/types';
import type { SubscriptionStatus } from '../users/types';
import type { TriggerType } from './queue/execution-lane.types';
import {
    SDKExecutionError,
} from './errors';
import { routeEventWithResilience, createResilienceState } from './event-resilience';
import { AgentAlreadyRunningError, QueueFullError } from './queue/execution-queue.errors';
import { sendMessage, streamEvents } from '../sandbox-infra/sandbox';
import type { SessionHandle } from '../sandbox-infra/sandbox';
import { createHealthGuard, type HealthGuard } from './execution-health-guard';
import {
    getConversation,
    createConversation as createWorkspaceConversation,
} from '../conversations/workspace-db.service';
import { findAgentBySlug } from '../agents/agent-workspace-db.service';

// Extracted billing/subscription modules
export { reserveCredits } from './subscription-guard';
export { finalizeCredits } from './credit-finalization';
// Extracted session record management
export { createSessionRecord, updateSessionRecord, buildSummary } from './session-record';
// Extracted agent config/identity resolution
export { resolveAgentConfig, resolveAdapterType, resolveAgentIdentity } from './agent-config-resolver';
export type { ResolvedAgentConfig } from './agent-config-resolver';

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

export interface LoadAgentResult {
    agent: AgentRow;
    subscriptionStatus: SubscriptionStatus | null;
    subscriptionPeriodEnd: Date | null;
}

/**
 * loadAgent validates the agent exists in workspace.db and fetches subscription info.
 *
 * IMPORTANT: This must be called AFTER ensureSandbox() — the workspace.db query
 * requires a running sandbox. The caller (execution.service.ts) ensures this ordering.
 */
export async function loadAgent(
    deps: ResolvedExecutionDeps,
    agentSlug: string,
    userId: string,
    sandboxId: string,
): Promise<LoadAgentResult> {
    const provider = deps.sandboxService.getDaytonaProvider();

    // Parallel: workspace.db agent check, workspaces, and subscription lookups are independent
    const [agentRow, wsResult, subResult] = await Promise.all([
        findAgentBySlug(provider, sandboxId, agentSlug),
        deps.db.query<{ id: string }>(
            `SELECT id::text FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        ),
        deps.db.query<{ subscription_status: SubscriptionStatus | null; subscription_current_period_end: Date | null }>(
            'SELECT subscription_status, subscription_current_period_end FROM users WHERE user_id = $1',
            [userId],
        ),
    ]);
    if (wsResult.rows.length === 0) {
        throw new SDKExecutionError(`No workspace found for user ${userId} — agent cannot run without a workspace`);
    }
    const workspaceId = wsResult.rows[0].id;

    if (!agentRow) {
        throw new SDKExecutionError(`Agent '${agentSlug}' not found in workspace for user '${userId}'`);
    }

    const subRow = subResult.rows[0];

    // Agent metadata (name, ai_model, etc.) lives in config.json on the workspace filesystem.
    // The runner reads config.json locally and reports the real model via session_started event,
    // which updates ctx.agent.ai_model in handleSessionStarted.
    // Defaults here are overridden by the runner — they are NOT fabricated stubs.
    // adapter_type defaults to 'claudecode' — resolved from config.json by resolveAdapterType().
    return {
        agent: {
            id: agentRow.rowid,
            name: agentRow.slug,
            slug: agentRow.slug,
            description: '',
            ai_model: DEFAULT_MODEL,
            thinking_level: 'medium',
            autonomy_level: 'supervised',
            adapter_type: 'claudecode',
            primary_use_case: '',
            workspace_id: workspaceId,
            user_id: userId,
        },
        subscriptionStatus: subRow?.subscription_status ?? null,
        subscriptionPeriodEnd: subRow?.subscription_current_period_end ?? null,
    };
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
    // Resilience: routeEventWithResilience tracks consecutive non-fatal handler
    // failures across iterations. Fatal invariants re-throw; non-fatal errors are
    // logged + degraded into a 'notification' until MAX_CONSECUTIVE_HANDLER_ERRORS.
    const resilience = createResilienceState();

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
            // SSE stream closed (frontend disconnected). Break the event loop on the
            // backend side. The runner process keeps running intentionally — if the
            // user reconnects, they'll see the completed result via conversation reload.
            // stdin-based interrupts don't work (Claude Code ignores unknown types).
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
        // Only reset health guard on events from THIS agent's execution.
        // Transport/system events (health probe responses) prove the runner
        // process is alive but NOT that the agent is making progress.
        // Without this filter, a stuck LLM call keeps the health guard happy
        // via probe responses while the agent produces no output.
        // Check both agent_slug (new style) and agent (RunnerEventBase) fields.
        const isSystemEvent = eventSlug === '_transport'
            || raw.agent === '_transport'
            || eventType === 'health';
        if (healthGuard && !isSystemEvent) healthGuard.recordActivity();

        await routeEventWithResilience(eventType, raw, ctx, deps, resilience);

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


