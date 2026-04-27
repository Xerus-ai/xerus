// Execution Service (v2 - Thin Backend Router)
// 5-step pipeline: validate -> sandbox -> execute -> stream -> finalize
// See: docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md Section 10

import { randomUUID } from 'crypto';
import type { StreamSink } from './streaming/stream.handler';
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
    resolveAgentConfig,
    resolveAgentIdentity,
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

import { logger } from '../../utils/logger';
import { sendCommand } from '../sandbox-infra/sandbox';
import { resolveApiKey, type ResolvedKey } from './key-resolver.service';
import { handleExecutionError, cleanupExecution } from './execution-lifecycle';
import { buildSDKEnvironment, type UserCliKeys } from './sdk/sdk.config';
import type { SessionHandle } from '../sandbox-infra/sandbox/providers/daytona-runner';
import { skillSecretsService } from '../skills/secrets.service';
import { createAnnounceQueueService } from './queue/announce-queue.service';
import { createWorkspaceInboxWriter } from './queue/database-inbox-writer';
import { checkHookHealth } from '../sandbox-infra/sandbox/hook-health';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import { createChannelMessage } from '../company/company-workspace-db.service';
import { syncMessageToSandbox } from '../company/channel-execution.service';

const log = logger('ExecutionService');
// -----------------------------------------------------------------------------
// Cross-domain dependency injection (avoids importing from users domain)
// -----------------------------------------------------------------------------

export interface UserApiKeyLookup {
    get(userId: string, provider: 'anthropic' | 'openai'): Promise<string | null>;
}

let apiKeyLookup: UserApiKeyLookup | null = null;

export function setExecutionApiKeyLookup(lookup: UserApiKeyLookup): void {
    apiKeyLookup = lookup;
}

function getApiKeyLookup(): UserApiKeyLookup {
    if (!apiKeyLookup) throw new Error('Execution API key lookup not initialized');
    return apiKeyLookup;
}

interface ActiveExecution {
    handle: SessionHandle;
    agentSlug: string;
    stream: StreamSink;
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
        // Bind triggerAgentExecution callback so runner-event-router can trigger
        // execution for @mentioned agents without circular dep on ExecutionService
        const triggerAgentExecution = async (userId: string, agentSlug: string, message: string, channelSlug: string) => {
            const { triggerChannelExecution } = await import('../company/channel-execution.service');
            const provider = sandboxService.getProvider() as import('../sandbox-infra/sandbox/providers/daytona.provider').DaytonaProvider;
            const status = await sandboxService.getSandboxStatus(userId);
            if (!status.sandboxId || status.status !== 'running') return;
            await triggerChannelExecution(this, provider, status.sandboxId, userId, agentSlug, message, channelSlug);
        };

        return { sdkService, sandboxService, queueService, creditTracker, db, memorySearchIndex: memorySearchIndex ?? null, messageBridge: messageBridge ?? null, hitlHandler, activeStreamEmitter: activeStreamEmitter ?? null, triggerAgentExecution };
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
            sdkSessionId: null,
            responseText: '',
            responseChunks: [],
            creditsUsed: 0,
            keySource: null,
            subscriptionStatus: null,
            subscriptionPeriodEnd: null,
            agentSessionCount: 0,
            announceQueue: null,
            thinkingChunks: [],
            toolCallDetails: [],
            toolCallMap: new Map(),
            eventsFiltered: 0,
            setupReport: null,
            hookHealth: null,
            triggerType: triggerType || 'user_message',
        };

        // Track preflight promises for cleanup if early failure occurs
        let preSandbox: Promise<string> | null = null;
        let preApiKey: Promise<ResolvedKey> | null = null;
        let preCliKeys: Promise<UserCliKeys> | null = null;

        try {
            // -----------------------------------------------------------------
            // Preflight: fire independent work at T=0 (agent, API key, sandbox, CLI keys)
            // Skill secrets depend on sandbox being ready (workspace DB is on sandbox)
            // -----------------------------------------------------------------
            log.info('Preflight started', { execution_id: executionId, phase: 'agent+apikey+sandbox+clikeys' });
            stream.send('progress', { phase: 'sandbox', message: 'Preparing sandbox', percent: 10 });

            const preAgent = loadAgent(resolved, request.agentSlug, request.userId);
            preApiKey = resolveApiKey(request.userId, 'openrouter')
                .then(r => { log.debug('preApiKey resolved', { execution_id: executionId, duration_ms: Date.now() - startedAt }); return r; });
            preSandbox = ensureSandbox(resolved, ctx)
                .then(r => { log.debug('preSandbox resolved', { execution_id: executionId, duration_ms: Date.now() - startedAt }); return r; });
            // Fetch user's BYOK CLI keys (anthropic/openai) for sandbox env injection
            preCliKeys = this.resolveUserCliKeys(request.userId)
                .then(r => { log.debug('preCliKeys resolved', { execution_id: executionId, duration_ms: Date.now() - startedAt, has_anthropic: !!r.anthropicKey, has_openai: !!r.openaiKey }); return r; });

            // -----------------------------------------------------------------
            // Await agent first — needed for lane acquisition
            // -----------------------------------------------------------------
            const agentResult = await preAgent;
            ctx.agent = agentResult.agent;
            ctx.subscriptionStatus = agentResult.subscriptionStatus;
            ctx.subscriptionPeriodEnd = agentResult.subscriptionPeriodEnd;
            log.debug('preAgent resolved', { execution_id: executionId, duration_ms: Date.now() - startedAt });

            // Acquire execution lane (stale lanes cleaned periodically, not per-execution)
            const lane = await acquireExecutionLane(resolved, ctx, triggerType || 'user_message');
            ctx.laneId = lane.lane_id;
            log.debug('Lane acquired', { execution_id: executionId, duration_ms: Date.now() - startedAt, queued: lane.queued });

            // -----------------------------------------------------------------
            // Await sandbox + independent preflight, then resolve secrets from workspace DB
            // -----------------------------------------------------------------
            const [resolvedKey, sandboxId, userCliKeys] = await Promise.all([
                preApiKey,
                preSandbox,
                preCliKeys,
            ]);
            ctx.keySource = resolvedKey.source;
            ctx.sandboxId = sandboxId;
            log.debug('Preflight Promise.all resolved', { execution_id: executionId, duration_ms: Date.now() - startedAt });

            if (!ctx.sandboxId) {
                throw new Error('Sandbox not available after creation');
            }

            const daytonaProvider = resolved.sandboxService.getDaytonaProvider();

            // Resolve skill secrets from workspace SQLite DB (requires sandbox to be ready)
            const skillSecrets = await skillSecretsService.resolveAllSecrets(daytonaProvider, ctx.sandboxId);
            log.debug('preSecrets resolved', { execution_id: executionId, duration_ms: Date.now() - startedAt, secret_count: Object.keys(skillSecrets).length });

            // Build runner environment with the resolved API key + skill secrets + CLI BYOK keys
            const runnerEnvVars = buildSDKEnvironment(resolvedKey.apiKey, skillSecrets, userCliKeys);

            // Resolve conversation first to get sdk_session_id for --resume
            await reserveCredits(resolved, ctx);
            log.debug('Credits reserved', { execution_id: executionId, duration_ms: Date.now() - startedAt });

            const conversation = await resolveConversation(resolved, ctx);
            ctx.conversationId = conversation.id;
            ctx.sdkSessionId = conversation.sdkSessionId;
            log.debug('Conversation resolved', { execution_id: executionId, duration_ms: Date.now() - startedAt, has_sdk_session: !!ctx.sdkSessionId });

            // Resolve adapter_type, model, and agent identity from sandbox filesystem
            const agentForTracking = requireAgent(ctx);
            const [agentConfig, agentIdentity] = await Promise.all([
                resolveAgentConfig(resolved, ctx.sandboxId, agentForTracking.slug),
                resolveAgentIdentity(resolved, ctx.sandboxId, agentForTracking.slug),
            ]);
            agentForTracking.adapter_type = agentConfig.adapterType;
            if (agentConfig.model) agentForTracking.ai_model = agentConfig.model;
            log.debug('Agent resolved', { execution_id: executionId, duration_ms: Date.now() - startedAt, adapter_type: agentConfig.adapterType, model: agentConfig.model, has_identity: agentIdentity.length > 0 });

            // Create per-agent session (direct CLI, no cli-executor middleman)
            log.debug('Getting/creating agent session', { execution_id: executionId, duration_ms: Date.now() - startedAt, agent_slug: agentForTracking.slug });
            const handle = await resolved.sandboxService.getOrCreateRunner(
                request.userId, ctx.sandboxId, runnerEnvVars,
                agentForTracking.slug, agentConfig.adapterType, agentIdentity || undefined,
                agentConfig.model, ctx.sdkSessionId || undefined,
            );
            ctx.sessionHandle = handle;
            log.debug('Agent session ready', { execution_id: executionId, duration_ms: Date.now() - startedAt, session_id: handle.sessionId });

            this.activeExecutions.set(executionId, {
                handle,
                agentSlug: agentForTracking.slug,
                stream,
            });
            stream.send('progress', { phase: 'executing', message: 'Starting agent', percent: 20 });
            ctx.sessionId = await createSessionRecord(resolved, ctx);
            log.debug('Session record created', { execution_id: executionId, duration_ms: Date.now() - startedAt });
            // Meta event with agentName triggers streamingTurn creation on frontend.
            // Without agentName, all streaming events (token, tool_call, reasoning)
            // are silently dropped because streamingTurn is null.
            stream.send('meta', {
                conversationId: ctx.conversationId,
                agentSlug: agentForTracking.slug,
                agentName: agentForTracking.name || agentForTracking.slug,
            });
            ctx.status = 'running';

            // Register stream for HITL guidance events (keyed by sessionId since that's what HITL uses as execution_id)
            if (resolved.activeStreamEmitter) {
                resolved.activeStreamEmitter.register(ctx.sessionId, stream);
            }

            const inboxWriter = createWorkspaceInboxWriter(
                { writeFile: (sid, path, content) => daytonaProvider.writeFile(sid, path, content) },
                ctx.sandboxId,
                daytonaProvider,
            );
            ctx.announceQueue = createAnnounceQueueService(
                { inboxWriter },
                { user_id: request.userId, primary_channel_id: ctx.conversationId!, session_id: ctx.sessionId },
            );

            // Capture log buffer position BEFORE sending execute command.
            // This ensures streamEvents reads only events from THIS execution,
            // not replayed events from previous executions on the same runner.
            ctx.streamOffset = handle.logBuffer.position;

            log.debug('Sending execute command', { execution_id: executionId, duration_ms: Date.now() - startedAt, stream_offset: ctx.streamOffset });
            await sendExecuteCommand(handle, ctx);

            // Step 4: Stream events back to frontend via SSE
            log.info('Streaming runner events', { execution_id: executionId });
            await streamRunnerEvents(handle, ctx, resolved);
            log.info('Stream completed', { execution_id: executionId });

            // Channel message routing: write agent response to channel_messages
            // so it appears in the /inbox activity feed (not just /chat).
            const channelSlug = ctx.request.context?.channel_slug as string | undefined;
            if (ctx.triggerType === 'channel_message' && channelSlug && ctx.responseText && ctx.sandboxId) {
                const agentSlug = ctx.agent?.slug || ctx.request.agentSlug;
                log.info('Writing agent response to channel_messages', {
                    channel: channelSlug, agent: agentSlug, length: ctx.responseText.length,
                });

                // Join response chunks if responseText is empty but chunks exist
                const responseText = ctx.responseText || ctx.responseChunks.join('');
                if (responseText) {
                    await createChannelMessage(
                        daytonaProvider, ctx.sandboxId,
                        channelSlug, 'agent', agentSlug,
                        responseText, 'post', {},
                    ).catch(err => log.warn('Failed to write agent response to channel_messages', {
                        error: err instanceof Error ? err.message : String(err),
                    }));

                    // Also sync to posts.jsonl for agent IPC
                    const parts = channelSlug.split('--');
                    if (parts.length === 2) {
                        const channelTag = `${parts[0]}/${parts[1]}`;
                        syncMessageToSandbox(resolved.sandboxService, request.userId, channelTag, {
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
            }

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
            await handleExecutionError(this.deps, ctx, error);
        } finally {
            // If sandbox was preflight'd but pipeline failed before ctx.sandboxId was set,
            // the sandbox may still have resolved and incremented execution count.
            // Decrement it asynchronously to prevent stale count.
            if (!ctx.sandboxId && preSandbox) {
                preSandbox
                    .then(() => resolved.sandboxService.decrementExecutionCount(request.userId))
                    .catch((err: unknown) => {
                        log.warn('Preflight sandbox failed', { user_id: request.userId, error: (err as Error).message });
                    });
            }
            // Catch dangling preflight promises to prevent unhandled rejections
            if (preApiKey) preApiKey.catch(() => {});
            if (preCliKeys) preCliKeys.catch(() => {});
            this.activeExecutions.delete(executionId);
            cleanupExecution(resolved, ctx);
        }
    }

    /**
     * Resolve user's BYOK CLI keys (anthropic/openai) from user_api_keys table.
     * These are injected into sandbox env vars so CLI auth-detector sees 'api' billing.
     */
    private async resolveUserCliKeys(userId: string): Promise<UserCliKeys> {
        const lookup = getApiKeyLookup();
        const [anthropicKey, openaiKey] = await Promise.all([
            lookup.get(userId, 'anthropic'),
            lookup.get(userId, 'openai'),
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
            .catch(err => log.error('Failed to send interrupt', { error: (err as Error).message }));

        // Send stop event — do NOT close the stream (it belongs to the conversation, not the execution)
        if (!active.stream.isClosed()) {
            active.stream.send('stop', { reason: 'user_cancel' });
        }

        return true;
    }

}
