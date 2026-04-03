// Runner Session Management
// Manages persistent CLI sessions per agent inside Daytona sandboxes.
// Each agent gets its own Daytona session (agent-{slug}) running the CLI directly.
// Extracted from SandboxService to keep file sizes under 400 lines.

import type { DaytonaProvider } from './providers/daytona.provider';
import type { SessionHandle, AgentSessionOptions } from './providers';
import { sendCommand, createAgentSession } from './providers';
import type { SandboxSession } from './sandbox.types';
import type { AdapterType } from '../../execution/runner/cli-adapters/types';

// Skip health check if runner was used within this window (avoids Daytona HTTP round-trip)
const HEALTH_CHECK_GRACE_MS = 30_000;

// Timeout for the entire getOrCreateRunner flow (getSandboxInstance + createAgentSession)
const RUNNER_CREATION_TIMEOUT_MS = 30_000;

// Timeout for individual Daytona API calls (sendCommand for health check)
const DAYTONA_CALL_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
        promise.then(
            (val) => { clearTimeout(timer); resolve(val); },
            (err) => { clearTimeout(timer); reject(err); },
        );
    });
}

/**
 * Get or create a CLI session for a specific agent in a user's sandbox.
 * Reuses existing session if healthy and env vars unchanged.
 * Each agent gets its own Daytona session (agent-{slug}).
 */
export async function getOrCreateRunnerSession(
    session: SandboxSession,
    sandboxId: string,
    envVars: Record<string, string>,
    provider: DaytonaProvider,
    agentSlug?: string,
    adapterType?: AdapterType,
): Promise<SessionHandle> {
    const userId = session.userId;
    const slug = agentSlug || 'default';
    const adapter: AdapterType = adapterType || 'claudecode';

    // Check per-agent session cache
    const existing = session.agentSessions.get(slug);
    if (existing) {
        const envChanged = !envVarsEqual(existing.envVars, envVars);
        if (envChanged) {
            console.log(`[RunnerSession] Env vars changed for agent ${slug} (user ${userId}), restarting session`);
            session.agentSessions.delete(slug);
        } else {
            const lastUsed = existing.handle.lastUsedAt ?? 0;
            const withinGrace = (Date.now() - lastUsed) < HEALTH_CHECK_GRACE_MS;
            console.log(`[RunnerSession] Existing session for agent ${slug} (user ${userId}), withinGrace=${withinGrace}, lastUsed=${Date.now() - lastUsed}ms ago`);
            const healthy = withinGrace || await checkRunnerHealth(existing.handle);
            if (healthy) {
                existing.handle.lastUsedAt = Date.now();
                console.log(`[RunnerSession] Reusing existing session for agent ${slug}${withinGrace ? ' (grace)' : ''}`);
                return existing.handle;
            }
            console.log(`[RunnerSession] Health check failed for agent ${slug} (user ${userId}), creating new session`);
            session.agentSessions.delete(slug);
        }
    } else {
        console.log(`[RunnerSession] No existing session for agent ${slug} (user ${userId}), creating new`);
    }

    // Also check legacy runnerHandle for backward compat
    if (!agentSlug && session.runnerHandle) {
        const envChanged = !envVarsEqual(session.runnerEnvVars, envVars);
        if (!envChanged) {
            const lastUsed = session.runnerHandle.lastUsedAt ?? 0;
            const withinGrace = (Date.now() - lastUsed) < HEALTH_CHECK_GRACE_MS;
            const healthy = withinGrace || await checkRunnerHealth(session.runnerHandle);
            if (healthy) {
                session.runnerHandle.lastUsedAt = Date.now();
                return session.runnerHandle;
            }
        }
        session.runnerHandle = undefined;
        session.runnerEnvVars = undefined;
    }

    const t0 = Date.now();
    console.log(`[RunnerSession] Calling getSandboxInstance for ${sandboxId}`);
    const sandbox = await withTimeout(
        provider.getSandboxInstance(sandboxId),
        DAYTONA_CALL_TIMEOUT_MS,
        `getSandboxInstance(${sandboxId})`,
    );
    console.log(`[RunnerSession] getSandboxInstance: ${Date.now() - t0}ms`);

    const agentOpts: AgentSessionOptions = {
        agentSlug: slug,
        adapterType: adapter,
    };

    console.log(`[RunnerSession] Creating ${adapter} session for agent ${slug} in sandbox ${sandboxId}`);
    const handle = await withTimeout(
        createAgentSession(sandbox, envVars, agentOpts),
        RUNNER_CREATION_TIMEOUT_MS,
        `createAgentSession(${sandboxId}, ${slug})`,
    );
    handle.lastUsedAt = Date.now();

    // Cache in per-agent map
    session.agentSessions.set(slug, { handle, envVars: { ...envVars } });

    // Also set legacy handle for backward compat
    session.runnerHandle = handle;
    session.runnerEnvVars = { ...envVars };

    console.log(`[RunnerSession] Created new ${adapter} session for agent ${slug} (user ${userId}, total: ${Date.now() - t0}ms)`);
    return handle;
}

async function checkRunnerHealth(handle: SessionHandle): Promise<boolean> {
    const HEALTH_TIMEOUT_MS = 5000;
    const startPos = handle.logBuffer.position;

    try {
        await withTimeout(
            sendCommand(handle, { type: 'health' }),
            DAYTONA_CALL_TIMEOUT_MS,
            'sendCommand(health)',
        );
    } catch (err) {
        console.log(`[RunnerSession] Health check sendCommand failed: ${(err as Error).message}`);
        return false;
    }

    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    let pos = startPos;
    while (Date.now() < deadline) {
        const event = handle.logBuffer.peek(pos);
        if (event === undefined) {
            await new Promise(r => setTimeout(r, 50));
            continue;
        }
        if (event === null) {
            return false;
        }
        if (event.event === 'health') {
            return (event as { status: string }).status === 'ok';
        }
        pos++;
    }

    console.log(`[RunnerSession] Health check timed out (no health event within ${HEALTH_TIMEOUT_MS}ms)`);
    return false;
}

/**
 * Shallow compare two env var records.
 * Treats undefined as empty ({}).
 */
function envVarsEqual(
    a: Record<string, string> | undefined,
    b: Record<string, string> | undefined,
): boolean {
    const aObj = a || {};
    const bObj = b || {};
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
        if (aObj[key] !== bObj[key]) return false;
    }
    return true;
}
