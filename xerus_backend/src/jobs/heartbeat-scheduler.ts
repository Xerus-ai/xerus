// Heartbeat Scheduler Job
// Starts and stops the heartbeat runner service during server lifecycle.
// Wires dispatchFn (creates execution_sessions with trigger_type='heartbeat')
// and snapshotFn (pre-fetches data via SnapshotService before scheduled runs).

import { randomUUID } from 'crypto';
import { heartbeatRunnerService } from '../domains/heartbeat/heartbeat-runner.service';
import { heartbeatConfigService } from '../domains/heartbeat/heartbeat-config.service';
import { snapshotService } from '../domains/heartbeat/snapshot/snapshot.service';
import type { HeartbeatDispatchFn, HeartbeatSnapshotFn } from '../domains/heartbeat/heartbeat-runner.service';
import type { SandboxService } from '../domains/execution/sandbox/sandbox.service';
import type { ExecutionDatabase } from '../domains/execution/execution-pipeline.types';
import { SANDBOX_CONFIG } from '../domains/execution/sandbox/sandbox.config';
import { SDK_CONFIG } from '../domains/execution/sdk/sdk.config';
import { sendCommand, streamEvents } from '../domains/execution/sandbox';
import { validateSlug } from '../shared/slugify';

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 600_000; // 10 minutes

function createDispatchFn(sandboxService: SandboxService, db: ExecutionDatabase): HeartbeatDispatchFn {
    return async (request) => {
        const sessionId = randomUUID();

        // Look up workspace_id for this user
        const wsResult = await db.query<{ id: string }>(
            'SELECT id::text FROM workspaces WHERE user_id = $1 LIMIT 1',
            [request.user_id],
        );
        if (wsResult.rows.length === 0) {
            throw new Error(`No workspace found for user ${request.user_id}`);
        }
        const workspaceId = wsResult.rows[0].id;

        // Look up agent slug from registry (needed for INSERT and sandbox commands)
        const agentResult = await db.query<{ slug: string }>(
            'SELECT slug FROM agent_registry WHERE id = $1',
            [request.agent_id],
        );
        if (agentResult.rows.length === 0) {
            throw new Error(`Agent ${request.agent_id} not found in registry`);
        }
        const agentSlug = agentResult.rows[0].slug;
        validateSlug(agentSlug, 'agent slug');

        // Look up sandbox for this user
        const status = await sandboxService.getSandboxStatus(request.user_id);
        if (status.status !== 'running' || !status.sandboxId) {
            throw new Error(`No running sandbox for user ${request.user_id}`);
        }

        // Create execution_sessions record with trigger_type='heartbeat'
        await db.query(
            `INSERT INTO execution_sessions
             (id, workspace_id, agent_slug, sandbox_id, status, trigger_type, user_prompt, started_at, created_at)
             VALUES ($1, $2, $3, $4, 'running', 'heartbeat', $5, NOW(), NOW())`,
            [
                sessionId,
                workspaceId,
                agentSlug,
                status.sandboxId,
                `Heartbeat execution (run=${request.run_id}, trigger=${request.trigger_type})`,
            ],
        );

        // Read HEARTBEAT.md content to use as the heartbeat prompt
        const provider = sandboxService.getDaytonaProvider();
        let heartbeatPrompt = `Heartbeat trigger: ${request.trigger_type}`;
        try {
            const heartbeatMdPath = `${SANDBOX_CONFIG.workspacePath}/agents/${agentSlug}/HEARTBEAT.md`;
            const content = await provider.readFile(status.sandboxId, heartbeatMdPath);
            if (content) {
                heartbeatPrompt = content;
            }
        } catch (err: unknown) {
            const errObj = err as { code?: string; message?: string };
            const code = errObj?.code;
            const msg = errObj?.message || '';
            const isNotFound = code === 'ENOENT' || code === 'NOT_FOUND'
                || msg.includes('not found') || msg.includes('ENOENT') || msg.includes('no such file');
            if (isNotFound) {
                // HEARTBEAT.md does not exist; use default prompt
            } else {
                throw err;
            }
        }

        // Send execute command to runner via sandbox
        const envVars: Record<string, string> = {};
        const handle = await sandboxService.getOrCreateRunner(
            request.user_id, status.sandboxId, envVars,
        );

        // Capture log buffer position before sending command so we read all events
        const startOffset = handle.logBuffer.position;

        await sendCommand(handle, {
            type: 'execute',
            agent_slug: agentSlug,
            content: heartbeatPrompt,
            context: { trigger_type: request.trigger_type, run_id: request.run_id },
            config: {
                model: SDK_CONFIG.defaultModel,
                tools: SDK_CONFIG.defaultAllowedTools,
            },
        });

        // Stream events until session completes or timeout fires.
        // Mirrors the pattern in execution-pipeline.ts streamRunnerEvents().
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), DEFAULT_HEARTBEAT_TIMEOUT_MS);

        let tokensUsed = 0;
        let outcome: 'success' | 'failure' | 'timeout' = 'success';

        try {
            for await (const event of streamEvents(handle, ac.signal, startOffset)) {
                const raw = event as unknown as Record<string, unknown>;
                const eventType = typeof raw.event === 'string' ? raw.event : '';

                // Extract token usage from session_ended events
                if (eventType === 'session_ended') {
                    const data = raw.data as Record<string, unknown> | undefined;
                    const usage = data?.usage as Record<string, number> | undefined;
                    if (usage) {
                        tokensUsed = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
                    }
                    break;
                }

                if (eventType === 'session_completed') {
                    break;
                }

                // Fatal runner errors — stop waiting
                if (eventType === 'error') {
                    const data = raw.data as Record<string, unknown> | undefined;
                    const errMsg = String(data?.message || 'unknown error');
                    console.error(`[Heartbeat] Runner error during heartbeat ${request.run_id}: ${errMsg}`);
                    outcome = 'failure';
                    break;
                }
            }

            // If the loop exited because of abort (timeout), mark as timeout
            if (ac.signal.aborted) {
                console.warn(`[Heartbeat] Heartbeat ${request.run_id} timed out after ${DEFAULT_HEARTBEAT_TIMEOUT_MS / 1000}s`);
                outcome = 'timeout';
            }
        } finally {
            clearTimeout(timer);

            // Send interrupt to stop the agent in the sandbox if it did not
            // complete normally. Without this the agent keeps running after
            // timeout/error, burning credits indefinitely.
            if (outcome !== 'success') {
                try {
                    await sendCommand(handle, { type: 'interrupt', agent_slug: agentSlug });
                } catch (interruptErr) {
                    console.warn(
                        `[Heartbeat] Failed to send interrupt for ${agentSlug}:`,
                        interruptErr instanceof Error ? interruptErr.message : interruptErr,
                    );
                }
            }
        }

        // Update execution_sessions with actual outcome
        const finalStatus = outcome === 'success' ? 'completed' : 'failed';
        await db.query(
            `UPDATE execution_sessions SET status = $2, completed_at = NOW() WHERE id = $1`,
            [sessionId, finalStatus],
        );

        return {
            execution_id: sessionId,
            tokens_used: tokensUsed,
            outcome,
        };
    };
}

function createSnapshotFn(sandboxService: SandboxService, db: ExecutionDatabase): HeartbeatSnapshotFn {
    return async (request) => {
        const status = await sandboxService.getSandboxStatus(request.user_id);
        if (status.status !== 'running' || !status.sandboxId) {
            throw new Error(`No running sandbox for user ${request.user_id} (snapshot skipped)`);
        }

        const provider = sandboxService.getDaytonaProvider();

        // Look up agent slug from DB (no fallback - fail-fast if not found)
        const agentResult = await db.query<{ slug: string }>(
            'SELECT slug FROM agent_registry WHERE id = $1',
            [request.agent_id],
        );
        if (agentResult.rows.length === 0) {
            throw new Error(`Agent ${request.agent_id} not found in registry (snapshot)`);
        }
        const agentSlug = agentResult.rows[0].slug;
        validateSlug(agentSlug, 'agent slug');

        const sandboxFs = await provider.createFileSystem(status.sandboxId);
        const agentWorkspacePath = `${SANDBOX_CONFIG.workspacePath}/agents/${agentSlug}`;

        await snapshotService.runSnapshot(
            request.agent_id,
            agentSlug,
            agentWorkspacePath,
            sandboxFs,
        );
    };
}

export function startHeartbeatSchedulerJob(
    sandboxService: SandboxService,
    db: ExecutionDatabase,
): void {
    heartbeatConfigService.setStaggerUpdateCallback((agentId, offsetMs) => {
        heartbeatRunnerService.updateStaggerOffset(agentId, offsetMs);
    });

    const dispatchFn = createDispatchFn(sandboxService, db);
    const snapshotFn = createSnapshotFn(sandboxService, db);

    heartbeatRunnerService.start(dispatchFn, snapshotFn).catch((err) => {
        console.error('[Heartbeat] Failed to start scheduler:', err instanceof Error ? err.message : err);
    });

    console.log('[Jobs] Heartbeat scheduler started');
}

