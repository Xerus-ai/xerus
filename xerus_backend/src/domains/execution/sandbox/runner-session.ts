// Runner Session Management
// Manages persistent runner process sessions inside Daytona sandboxes.
// Extracted from SandboxService to keep file sizes under 400 lines.

import type { DaytonaProvider } from './providers/daytona.provider';
import type { SessionHandle } from './providers';
import { sendCommand, createRunnerSession } from './providers';
import type { SandboxSession } from './sandbox.types';

// Skip health check if runner was used within this window (avoids Daytona HTTP round-trip)
const HEALTH_CHECK_GRACE_MS = 30_000;

// Timeout for the entire getOrCreateRunner flow (getSandboxInstance + createRunnerSession)
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
 * Get or create a runner session for a user's sandbox.
 * Reuses existing session if healthy and env vars unchanged.
 */
export async function getOrCreateRunnerSession(
    session: SandboxSession,
    sandboxId: string,
    envVars: Record<string, string>,
    provider: DaytonaProvider,
): Promise<SessionHandle> {
    const userId = session.userId;

    if (session.runnerHandle) {
        const envChanged = !envVarsEqual(session.runnerEnvVars, envVars);
        if (envChanged) {
            console.log(`[RunnerSession] Env vars changed for user ${userId}, restarting runner`);
            session.runnerHandle = undefined;
            session.runnerEnvVars = undefined;
        } else {
            // Skip health check if runner was used recently (saves ~50-150ms Daytona HTTP round-trip)
            const lastUsed = session.runnerHandle.lastUsedAt ?? 0;
            const withinGrace = (Date.now() - lastUsed) < HEALTH_CHECK_GRACE_MS;
            console.log(`[RunnerSession] Existing handle for user ${userId}, withinGrace=${withinGrace}, lastUsed=${Date.now() - lastUsed}ms ago`);
            const healthy = withinGrace || await checkRunnerHealth(session.runnerHandle);
            if (healthy) {
                session.runnerHandle.lastUsedAt = Date.now();
                console.log(`[RunnerSession] Reusing existing runner for user ${userId}${withinGrace ? ' (grace)' : ''}`);
                return session.runnerHandle;
            }
            console.log(`[RunnerSession] Health check failed for user ${userId}, creating new runner`);
            session.runnerHandle = undefined;
            session.runnerEnvVars = undefined;
        }
    } else {
        console.log(`[RunnerSession] No existing handle for user ${userId}, creating new runner`);
    }

    const t0 = Date.now();
    console.log(`[RunnerSession] Calling getSandboxInstance for ${sandboxId}`);
    const sandbox = await withTimeout(
        provider.getSandboxInstance(sandboxId),
        DAYTONA_CALL_TIMEOUT_MS,
        `getSandboxInstance(${sandboxId})`,
    );
    console.log(`[RunnerSession] getSandboxInstance: ${Date.now() - t0}ms`);

    console.log(`[RunnerSession] Calling createRunnerSession for ${sandboxId}`);
    const handle = await withTimeout(
        createRunnerSession(sandbox, envVars),
        RUNNER_CREATION_TIMEOUT_MS,
        `createRunnerSession(${sandboxId})`,
    );
    handle.lastUsedAt = Date.now();
    session.runnerHandle = handle;
    session.runnerEnvVars = { ...envVars };
    console.log(`[RunnerSession] Created new runner for user ${userId} (total: ${Date.now() - t0}ms)`);
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
