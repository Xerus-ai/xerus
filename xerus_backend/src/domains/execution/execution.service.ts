// Execution Service (v2 - Thin Backend Router)
// 5-step pipeline: validate -> sandbox -> execute -> stream -> finalize
// See: docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md Section 10

import { randomUUID } from 'crypto';
import type { StreamingResponse } from './streaming/stream.handler';
import {
    loadAgent,
    acquireExecutionLane,
    reserveCredits,
    ensureSandbox,
    sendExecuteCommand,
    streamRunnerEvents,
    createSessionRecord,
    finalizeCredits,
    updateSessionRecord,
    buildSummary,
    resolveConversation,
    LOG_PREFIX,
} from './execution-pipeline';
import { requireAgent } from './pipeline-guards';

export type {
    ExecutionServiceDeps,
    ResolvedExecutionDeps,
    ExecutionDatabase,
    AgentRow,
    StartExecutionOptions,
    PipelineContext,
} from './execution-pipeline';

import type {
    ExecutionServiceDeps,
    ResolvedExecutionDeps,
    PipelineContext,
    StartExecutionOptions,
} from './execution-pipeline';

import { sendCommand } from './sandbox';
import { DomainError } from '../../utils/errors';
import { resolveApiKey, type ResolvedKey } from './key-resolver.service';
import { buildSDKEnvironment, type UserCliKeys } from './sdk/sdk.config';
import type { SessionHandle } from './sandbox/providers/daytona-runner';
import { skillSecretsService } from '../skills/secrets.service';
import { createAnnounceQueueService } from './queue/announce-queue.service';
import { createWorkspaceInboxWriter } from './queue/database-inbox-writer';
import { checkHookHealth } from './sandbox/hook-health';
import { SANDBOX_CONFIG } from './sandbox/sandbox.config';
// TECH DEBT: Cross-domain import. Should use interface injection.
// See: docs/planning/execution/sqlite-neon-sync.md#cross-domain-dependencies
import { apiKeyService } from '../users/api-key-service';

interface ActiveExecution {
    handle: SessionHandle;
    agentSlug: string;
    stream: StreamingResponse;
}

export class ExecutionService {
    private readonly deps: ExecutionServiceDeps;
    private readonly activeExecutions = new Map<string, ActiveExecution>();

    constructor(deps: ExecutionServiceDeps) {
        this.deps = deps;
    }

    private resolveDeps(): ResolvedExecutionDeps {
        const { sdkService, sandboxService, queueService, creditTracker, db, memorySearchIndex, messageBridge, hitlHandler, activeStreamEmitter } = this.deps;
        if (!sdkService || !sandboxService || !queueService || !creditTracker) {
            throw new Error(
                'ExecutionService runtime deps not initialized. '
                + 'sdkService, sandboxService, queueService, and creditTracker must be set before execution.',
            );
        }
        if (!hitlHandler) {
            throw new Error(
                'ExecutionService runtime deps not initialized. hitlHandler must be set before execution.',
            );
        }
        return { sdkService, sandboxService, queueService, creditTracker, db, memorySearchIndex: memorySearchIndex ?? null, messageBridge: messageBridge ?? null, hitlHandler, activeStreamEmitter: activeStreamEmitter ?? null };
    }

    async startExecution(options: StartExecutionOptions): Promise<void> {
        const resolved = this.resolveDeps();
        const { request, stream, triggerType } = options;
        const executionId = randomUUID();
        stream.setExecutionId(executionId);
        const startedAt = Date.now();

        const ctx: PipelineContext = {
            executionId,
            stream,
            request,
            agent: null,
            sandboxId: null,
            sessionHandle: null,
            laneId: null,
            startedAt,
            sessionId: '',
            inputTokens: 0,
            outputTokens: 0,
            toolCallCount: 0,
            status: 'pending',
            streamOffset: 0,
            conversationId: request.conversationId ?? null,
            responseText: '',
            responseChunks: [],
            creditsUsed: 0,
            keySource: null,
            agentSessionCount: 0,
            announceQueue: null,
            thinkingChunks: [],
            toolCallDetails: [],
            eventsFiltered: 0,
            setupReport: null,
            hookHealth: null,
            triggerType: triggerType || 'user_message',
        };

        // Track preflight promises for cleanup if early failure occurs
        let preSandbox: Promise<string> | null = null;
        let preApiKey: Promise<ResolvedKey> | null = null;
        let preSecrets: Promise<Record<string, string>> | null = null;
        let preCliKeys: Promise<UserCliKeys> | null = null;

        try {
            // -----------------------------------------------------------------
            // Preflight: fire all independent work at T=0 (all need only userId)
            // -----------------------------------------------------------------
            const tag = `${LOG_PREFIX} [${executionId.slice(0,8)}]`;
            const T = () => `T+${Date.now() - startedAt}ms`;
            console.log(`${tag} ${T()} Preflight: agent + API key + sandbox + skills + CLI keys`);
            stream.send('progress', { phase: 'sandbox', message: 'Preparing sandbox', percent: 10 });

            const preAgent = loadAgent(resolved, request.agentSlug, request.userId);
            preApiKey = resolveApiKey(request.userId, 'openrouter')
                .then(r => { console.log(`${tag} ${T()} preApiKey resolved`); return r; });
            preSandbox = ensureSandbox(resolved, ctx)
                .then(r => { console.log(`${tag} ${T()} preSandbox resolved`); return r; });
            preSecrets = skillSecretsService.resolveAllSecrets(request.userId)
                .then(r => { console.log(`${tag} ${T()} preSecrets resolved (${Object.keys(r).length} keys)`); return r; });
            // Fetch user's BYOK CLI keys (anthropic/openai) for sandbox env injection
            preCliKeys = this.resolveUserCliKeys(request.userId)
                .then(r => { console.log(`${tag} ${T()} preCliKeys resolved (anthropic=${!!r.anthropicKey}, openai=${!!r.openaiKey})`); return r; });

            // -----------------------------------------------------------------
            // Await agent first — needed for lane acquisition
            // -----------------------------------------------------------------
            ctx.agent = await preAgent;
            console.log(`${tag} ${T()} preAgent resolved`);

            // Acquire execution lane (stale lanes cleaned periodically, not per-execution)
            const lane = await acquireExecutionLane(resolved, ctx, triggerType || 'user_message');
            ctx.laneId = lane.lane_id;
            console.log(`${tag} ${T()} lane acquired (queued=${lane.queued})`);

            // -----------------------------------------------------------------
            // Await remaining preflight (started at T=0, likely settled by now)
            // -----------------------------------------------------------------
            const [resolvedKey, sandboxId, skillSecrets, userCliKeys] = await Promise.all([
                preApiKey,
                preSandbox,
                preSecrets,
                preCliKeys,
            ]);
            ctx.keySource = resolvedKey.source;
            ctx.sandboxId = sandboxId;
            console.log(`${tag} ${T()} Promise.all resolved`);

            if (!ctx.sandboxId) {
                throw new Error('Sandbox not available after creation');
            }

            const daytonaProvider = resolved.sandboxService.getDaytonaProvider();

            // Build runner environment with the resolved API key + skill secrets + CLI BYOK keys
            const runnerEnvVars = buildSDKEnvironment(resolvedKey.apiKey, skillSecrets, userCliKeys);

            console.log(`${tag} ${T()} Getting/creating runner`);
            const handle = await resolved.sandboxService.getOrCreateRunner(
                request.userId, ctx.sandboxId, runnerEnvVars,
            );
            ctx.sessionHandle = handle;
            console.log(`${tag} ${T()} Runner ready, sessionId=${handle.sessionId}`);

            // Track active execution so cancelExecution() can send interrupt
            const agentForTracking = requireAgent(ctx);
            this.activeExecutions.set(executionId, {
                handle,
                agentSlug: agentForTracking.slug,
                stream,
            });

            // Runner reads agents/{slug}/config.json locally (microseconds).
            // No scaffold check or hydrate needed — workspace-health syncs agent
            // files on sandbox create/resume, and syncConfigToWorkspace keeps
            // config.json updated on agent edits. Meta SSE is deferred to
            // session_started event (runner emits the real model).

            await reserveCredits(resolved, ctx);
            console.log(`${tag} ${T()} Credits reserved`);

            ctx.conversationId = await resolveConversation(resolved, ctx);
            console.log(`${tag} ${T()} Conversation resolved`);
            stream.send('progress', { phase: 'executing', message: 'Starting agent', percent: 20 });
            ctx.sessionId = await createSessionRecord(resolved, ctx);
            console.log(`${tag} ${T()} Session record created`);
            stream.send('meta', { conversationId: ctx.conversationId });
            ctx.status = 'running';

            // Register stream for HITL guidance events (keyed by sessionId since that's what HITL uses as execution_id)
            if (resolved.activeStreamEmitter) {
                resolved.activeStreamEmitter.register(ctx.sessionId, stream);
            }

            const inboxWriter = createWorkspaceInboxWriter(
                { writeFile: (sid, path, content) => daytonaProvider.writeFile(sid, path, content) },
                ctx.sandboxId,
                resolved.db,
                request.userId,
            );
            ctx.announceQueue = createAnnounceQueueService(
                { inboxWriter },
                { user_id: request.userId, primary_channel_id: ctx.conversationId!, session_id: ctx.sessionId },
            );

            // Capture log buffer position BEFORE sending execute command.
            // This ensures streamEvents reads only events from THIS execution,
            // not replayed events from previous executions on the same runner.
            ctx.streamOffset = handle.logBuffer.position;

            console.log(`${tag} ${T()} Sending execute command, streamOffset=${ctx.streamOffset}`);
            await sendExecuteCommand(handle, ctx);

            // Step 4: Stream events back to frontend via SSE
            console.log(`${LOG_PREFIX} [${executionId.slice(0,8)}] Streaming runner events...`);
            await streamRunnerEvents(handle, ctx, resolved);
            console.log(`${LOG_PREFIX} [${executionId.slice(0,8)}] Stream completed`);

            // Drain any queued subagent announcements before finalizing
            if (ctx.announceQueue && ctx.announceQueue.getQueueSize() > 0) {
                await ctx.announceQueue.drain();
            }

            // Step 5: Track usage + deduct credits
            ctx.status = 'completed';
            await finalizeCredits(resolved, ctx);

            // Step 5b: Shell hook health check (non-blocking)
            if (ctx.sandboxId) {
                ctx.hookHealth = await checkHookHealth(
                    ctx.sandboxId,
                    SANDBOX_CONFIG.workspacePath,
                    ctx.startedAt,
                    { executeCommand: (sid, cmd) => daytonaProvider.executeCommand(sid, cmd) },
                );
            }

            await updateSessionRecord(resolved, ctx);

            const summary = buildSummary(ctx);
            stream.sendDone(ctx.responseText || undefined, summary, {
                runId: null,
                requestId: ctx.executionId,
                traceId: ctx.executionId,
                responseTimeMs: Date.now() - startedAt,
            }, { databaseUpdated: true, conversationId: ctx.conversationId });

        } catch (error) {
            ctx.status = 'failed';
            await this.handleExecutionError(ctx, error);
        } finally {
            // If sandbox was preflight'd but pipeline failed before ctx.sandboxId was set,
            // the sandbox may still have resolved and incremented execution count.
            // Decrement it asynchronously to prevent stale count.
            if (!ctx.sandboxId && preSandbox) {
                preSandbox
                    .then(() => resolved.sandboxService.decrementExecutionCount(request.userId))
                    .catch((err: unknown) => {
                        console.warn(`${LOG_PREFIX} Preflight sandbox failed for ${request.userId}: ${(err as Error).message}`);
                    });
            }
            // Catch dangling preflight promises to prevent unhandled rejections
            if (preApiKey) preApiKey.catch(() => {});
            if (preSecrets) preSecrets.catch(() => {});
            if (preCliKeys) preCliKeys.catch(() => {});
            this.activeExecutions.delete(executionId);
            this.cleanup(resolved, ctx);
        }
    }

    /**
     * Resolve user's BYOK CLI keys (anthropic/openai) from user_api_keys table.
     * These are injected into sandbox env vars so CLI auth-detector sees 'api' billing.
     */
    private async resolveUserCliKeys(userId: string): Promise<UserCliKeys> {
        const [anthropicKey, openaiKey] = await Promise.all([
            apiKeyService.get(userId, 'anthropic'),
            apiKeyService.get(userId, 'openai'),
        ]);
        return {
            anthropicKey: anthropicKey || undefined,
            openaiKey: openaiKey || undefined,
        };
    }

    /**
     * Send HITL response to runner for a paused execution.
     * Called by POST /:id/respond route after DB state is updated.
     */
    async respondToHitl(executionId: string, pauseId: string, approved: boolean, feedback?: string): Promise<boolean> {
        const active = this.activeExecutions.get(executionId);
        if (!active) {
            return false;
        }

        await sendCommand(active.handle, {
            type: 'hitl_response',
            pause_id: pauseId,
            approved,
            feedback,
        });

        return true;
    }

    cancelExecution(executionId: string): boolean {
        const active = this.activeExecutions.get(executionId);
        if (!active) {
            return false;
        }

        // Send interrupt command to the runner process.
        // The runner's processManager.interruptAgent() aborts the SDK query.
        sendCommand(active.handle, { type: 'interrupt', agent_slug: active.agentSlug })
            .catch(err => console.error(`${LOG_PREFIX} Failed to send interrupt: ${(err as Error).message}`));

        // Send stop event — do NOT close the stream (it belongs to the conversation, not the execution)
        if (!active.stream.isClosed()) {
            active.stream.send('stop', { reason: 'user_cancel' });
        }

        return true;
    }

    private async handleExecutionError(ctx: PipelineContext, error: unknown): Promise<void> {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`${LOG_PREFIX} Execution ${ctx.executionId} failed:`, err.message);

        if (ctx.sessionId) {
            try {
                await this.deps.db.query(
                    `UPDATE execution_sessions SET status = 'failed', agent_response = $2, completed_at = NOW() WHERE id = $1`,
                    [ctx.sessionId, ctx.responseText || null],
                );
            } catch (dbErr) {
                // Cleanup errors are intentionally caught and logged, not re-thrown.
                // Re-throwing here would mask the original execution error.
                console.error(
                    `${LOG_PREFIX} Failed to update session ${ctx.sessionId}: ${(dbErr as Error).message}`,
                );
            }
        } else if (ctx.conversationId && ctx.conversationId !== ctx.request.conversationId) {
            // Conversation was created by this execution but session record was never inserted.
            // Delete the orphan to avoid ghost conversations in the sidebar.
            try {
                await this.deps.db.query(
                    `DELETE FROM conversations WHERE id = $1 AND message_count = 0`,
                    [ctx.conversationId],
                );
            } catch (dbErr) {
                console.error(
                    `${LOG_PREFIX} Failed to clean up orphaned conversation ${ctx.conversationId}: ${(dbErr as Error).message}`,
                );
            }
        }

        if (!ctx.stream.isClosed()) {
            // Sanitize: only expose error details for known DomainError types.
            // Unknown errors get a generic message to prevent leaking internals.
            const sanitizedError = err instanceof DomainError
                ? err
                : new Error('An internal error occurred');
            ctx.stream.sendError(sanitizedError, {
                requestId: ctx.executionId,
                traceId: ctx.executionId,
                responseTimeMs: Date.now() - ctx.startedAt,
            });
        }
    }

    private cleanup(resolved: ResolvedExecutionDeps, ctx: PipelineContext): void {
        // Runner persists between executions. Don't send 'done'.
        // Runner is killed when sandbox pauses/stops (scheduler handles this).

        // Unregister stream from HITL emitter
        if (ctx.sessionId && resolved.activeStreamEmitter) {
            resolved.activeStreamEmitter.unregister(ctx.sessionId);
        }

        if (ctx.laneId) {
            try {
                resolved.queueService.release(ctx.laneId);
            } catch (releaseErr) {
                // Cleanup errors are intentionally caught and logged, not re-thrown.
                // Re-throwing here would mask the original execution error.
                console.error(
                    `${LOG_PREFIX} Failed to release lane ${ctx.laneId}: ${(releaseErr as Error).message}`,
                );
            }
        }

        if (ctx.sandboxId) {
            resolved.sandboxService.decrementExecutionCount(ctx.request.userId);
        }

        resolved.creditTracker.resetContext();

        if (ctx.announceQueue) {
            ctx.announceQueue.dispose();
        }

        // Stream belongs to the conversation (long-lived SSE), NOT this execution.
        // Do NOT close it here — the GET /stream route manages stream lifecycle.
    }
}
