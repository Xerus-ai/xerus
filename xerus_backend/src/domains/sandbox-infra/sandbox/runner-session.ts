// Runner Session Management
// Manages persistent CLI sessions per agent inside Daytona sandboxes.
// Each agent gets its own Daytona session (agent-{slug}) running the CLI directly.
// Extracted from SandboxService to keep file sizes under 400 lines.

import { logger } from '../../../utils/logger';
import type { DaytonaProvider } from './providers/daytona.provider';
import type { SessionHandle, AgentSessionOptions } from './providers';
import { createAgentSession } from './providers';
import type { SandboxSession } from './sandbox.types';
import type { AdapterType } from '../../execution/runner/cli-adapters/types';

const log = logger('RunnerSession');

// Skip health check if runner was used within this window (avoids Daytona HTTP round-trip)
const HEALTH_CHECK_GRACE_MS = 30_000;

// Timeout for the entire getOrCreateRunner flow (getSandboxInstance + createAgentSession)
const RUNNER_CREATION_TIMEOUT_MS = 30_000;

// Timeout for individual Daytona API calls (getSandboxInstance)
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
    systemPrompt?: string,
): Promise<SessionHandle> {
    const userId = session.userId;
    const slug = agentSlug || 'default';
    const adapter: AdapterType = adapterType || 'claudecode';

    // Check per-agent session cache
    const existing = session.agentSessions.get(slug);
    if (existing) {
        const envChanged = !envVarsEqual(existing.envVars, envVars);
        if (envChanged) {
            log.info('Env vars changed, restarting session', { agent_slug: slug, user_id: userId });
            session.agentSessions.delete(slug);
        } else {
            const lastUsed = existing.handle.lastUsedAt ?? 0;
            const withinGrace = (Date.now() - lastUsed) < HEALTH_CHECK_GRACE_MS;
            log.debug('Existing session found', { agent_slug: slug, user_id: userId, within_grace: withinGrace, last_used_ms_ago: Date.now() - lastUsed });
            const healthy = withinGrace || checkRunnerHealth(existing.handle);
            if (healthy) {
                existing.handle.lastUsedAt = Date.now();
                log.debug('Reusing existing session', { agent_slug: slug, grace: withinGrace });
                return existing.handle;
            }
            log.info('Health check failed (process exited), creating new session', { agent_slug: slug, user_id: userId });
            session.agentSessions.delete(slug);
        }
    } else {
        log.debug('No existing session, creating new', { agent_slug: slug, user_id: userId });
    }

    // Also check legacy runnerHandle for backward compat
    if (!agentSlug && session.runnerHandle) {
        const envChanged = !envVarsEqual(session.runnerEnvVars, envVars);
        if (!envChanged) {
            const lastUsed = session.runnerHandle.lastUsedAt ?? 0;
            const withinGrace = (Date.now() - lastUsed) < HEALTH_CHECK_GRACE_MS;
            const healthy = withinGrace || checkRunnerHealth(session.runnerHandle);
            if (healthy) {
                session.runnerHandle.lastUsedAt = Date.now();
                return session.runnerHandle;
            }
        }
        session.runnerHandle = undefined;
        session.runnerEnvVars = undefined;
    }

    const t0 = Date.now();
    log.debug('Calling getSandboxInstance', { sandbox_id: sandboxId });
    const sandbox = await withTimeout(
        provider.getSandboxInstance(sandboxId),
        DAYTONA_CALL_TIMEOUT_MS,
        `getSandboxInstance(${sandboxId})`,
    );
    log.debug('getSandboxInstance complete', { duration_ms: Date.now() - t0 });

    const agentOpts: AgentSessionOptions = {
        agentSlug: slug,
        adapterType: adapter,
        systemPrompt,
    };

    log.info('Creating session', { adapter, agent_slug: slug, sandbox_id: sandboxId });
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

    log.info('Created new session', { adapter, agent_slug: slug, user_id: userId, total_ms: Date.now() - t0 });
    return handle;
}

/**
 * Check if the CLI process is still alive by inspecting the log buffer stream state.
 * The PersistentLogBuffer closes when its underlying Daytona log stream ends
 * (process exit, stream error). If not closed, the process is alive and accepting stdin.
 *
 * Previous approach (sending {"type":"health"} to stdin) doesn't work with persistent
 * Claude CLI sessions — Claude's stream-json input only handles "user" and
 * "control_request" message types and ignores unknown types.
 */
function checkRunnerHealth(handle: SessionHandle): boolean {
    if (handle.logBuffer.isStreamClosed) {
        log.debug('Health check: log stream closed (process exited)');
        return false;
    }
    return true;
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
