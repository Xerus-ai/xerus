// Daytona Agent Runner - Sessions API Transport
// Uses Daytona Sessions API (createSession + sendSessionCommandInput + getSessionCommandLogs)
// Replaces codeInterpreter.runCode() for bidirectional communication
// See: docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md Section 4

import { setMaxListeners } from 'events';
import { Sandbox } from '@daytonaio/sdk';
import { SANDBOX_CONFIG } from '../sandbox.config';
import { RunnerConfig, RunnerEvent, ErrorEvent, AgentOutputEvent, RUNNER_ENV } from '../../runner/runner.types';
import { shellEscape } from '../../../../utils/shell-safety';
import { sleep } from '../sandbox.retry';

const SESSION_ID = 'agent-runner';
const RECONNECT_MAX_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 2000;

// Transport-level synthetic event factories (v2 format)
function transportError(message: string, code: string, recoverable = false): ErrorEvent {
    return { event: 'error', message, code, recoverable };
}

function transportOutput(message: string, phase: string): AgentOutputEvent {
    return {
        event: 'agent_output',
        agent: '_transport',
        session_id: '_transport',
        data: { type: phase, message },
    };
}

export interface RunAgentInSandboxOptions {
    sandbox: Sandbox;
    config: RunnerConfig;
    prompt: string;
    openRouterApiKey?: string;
    abortSignal?: AbortSignal;
}

export interface SessionHandle {
    sessionId: string;
    commandId: string;
    sendInput(data: string): Promise<void>;
    streamLogs(
        onStdout: (chunk: string) => void,
        onStderr: (chunk: string) => void,
    ): Promise<void>;
    logBuffer: PersistentLogBuffer;
    // Timestamp of last successful use (for health check grace period)
    lastUsedAt?: number;
}

/**
 * Max buffer entries before trimming old events.
 * At ~200 bytes/event average, 50K entries ~ 10MB.
 * Trim removes the first half when exceeded.
 */
const MAX_BUFFER_SIZE = 50_000;

/**
 * Max lineBuffer size (bytes) before force-flushing as transport output.
 * Protects against malformed streams that never send a newline.
 * 1MB accommodates large tool_result payloads while capping memory.
 */
const MAX_LINE_BUFFER_SIZE = 1_048_576;

/**
 * Persistent log buffer - started once per runner handle.
 * Buffers all stdout events so subsequent executions can read
 * from their start position without replaying old events.
 *
 * When the buffer exceeds MAX_BUFFER_SIZE, entries from the front
 * are trimmed and a `trimOffset` tracks the logical-to-physical
 * index mapping so callers' offsets remain valid.
 */
export class PersistentLogBuffer {
    private buffer: (RunnerEvent | null)[] = [];
    private trimOffset = 0;
    private waiters: (() => void)[] = [];
    private closed = false;
    private lineBuffer = '';

    start(streamLogs: SessionHandle['streamLogs']): void {
        streamLogs(
            (chunk) => this.onStdout(chunk),
            (chunk) => this.onStderr(chunk),
        ).then(() => {
            this.close();
        }).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            this.buffer.push(transportError(
                `Log stream failed: ${message}`, 'STREAM_ERROR', true,
            ));
            this.close();
        });
    }

    /** Logical position (accounts for trimmed entries). */
    get position(): number {
        return this.trimOffset + this.buffer.length;
    }

    /** Parse a complete line as JSON or wrap as transport output. */
    private pushLine(line: string): void {
        try {
            this.buffer.push(JSON.parse(line) as RunnerEvent);
        } catch {
            this.buffer.push(transportOutput(line, 'stdout'));
        }
    }

    private onStdout(chunk: string): void {
        // Daytona's getSessionCommandLogs delivers stdout in arbitrary chunks
        // that may not align with newline boundaries. Buffer partial lines so
        // large JSON payloads (e.g. tool_result with ls output) are not split
        // across chunks and misrouted as agent_output.
        this.lineBuffer += chunk;
        const lines = this.lineBuffer.split('\n');
        // Last element is either empty (chunk ended with \n) or incomplete
        this.lineBuffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            this.pushLine(trimmed);
        }
        // Force-flush if lineBuffer grows beyond limit (malformed stream without newlines)
        if (this.lineBuffer.length > MAX_LINE_BUFFER_SIZE) {
            const overflow = this.lineBuffer.trim();
            if (overflow) this.pushLine(overflow);
            this.lineBuffer = '';
        }
        this.trimIfNeeded();
        this.notifyAll();
    }

    private onStderr(chunk: string): void {
        const trimmed = chunk.trim();
        if (trimmed) {
            this.buffer.push(transportOutput(trimmed, 'stderr'));
            this.trimIfNeeded();
            this.notifyAll();
        }
    }

    private close(): void {
        if (this.closed) return;
        // Flush any remaining partial line before closing
        const remaining = this.lineBuffer.trim();
        if (remaining) {
            this.pushLine(remaining);
            this.lineBuffer = '';
        }
        this.closed = true;
        this.buffer.push(null);
        this.notifyAll();
    }

    private notifyAll(): void {
        const fns = this.waiters;
        this.waiters = [];
        for (const fn of fns) fn();
    }

    /**
     * Trim the front half of the buffer when it exceeds MAX_BUFFER_SIZE.
     * Adjusts trimOffset so logical positions remain stable.
     */
    private trimIfNeeded(): void {
        if (this.buffer.length > MAX_BUFFER_SIZE) {
            const trimCount = Math.floor(this.buffer.length / 2);
            this.buffer = this.buffer.slice(trimCount);
            this.trimOffset += trimCount;
        }
    }

    /** Convert logical position to physical buffer index. */
    private toPhysical(logicalPos: number): number {
        return logicalPos - this.trimOffset;
    }

    /**
     * Synchronous peek at a specific buffer position (logical).
     * Returns the event at `pos`, null if buffer is closed, or undefined if not yet available.
     */
    peek(pos: number): RunnerEvent | null | undefined {
        const physical = this.toPhysical(pos);
        if (physical < 0) {
            // Position was trimmed — treat as consumed
            return undefined;
        }
        if (physical < this.buffer.length) {
            return this.buffer[physical];
        }
        if (this.closed) {
            return null;
        }
        return undefined;
    }

    async *readFrom(offset: number, abortSignal?: AbortSignal): AsyncGenerator<RunnerEvent> {
        // Multiple concurrent readers (scaffold check + event stream) each add abort
        // listeners in the wait loop. Increase limit to prevent MaxListenersExceededWarning.
        if (abortSignal) {
            try { setMaxListeners(50, abortSignal); } catch { /* Node < 19 fallback */ }
        }
        // If offset was trimmed, skip ahead to earliest available
        let pos = Math.max(offset, this.trimOffset);
        while (true) {
            const physical = this.toPhysical(pos);
            if (physical >= 0 && physical < this.buffer.length) {
                const ev = this.buffer[physical];
                pos++;
                if (ev === null) return;
                yield ev;
            } else if (this.closed) {
                return;
            } else {
                if (abortSignal?.aborted) return;
                await new Promise<void>((resolve) => {
                    this.waiters.push(resolve);
                    abortSignal?.addEventListener('abort', () => resolve(), { once: true });
                });
                if (abortSignal?.aborted) return;
            }
        }
    }
}

/**
 * Create a Daytona session and start the runner process.
 * Returns a handle for sending input and streaming output.
 */
export async function createRunnerSession(
    sandbox: Sandbox,
    envVars: Record<string, string>,
): Promise<SessionHandle> {
    const t0 = Date.now();

    // Delete any stale session from previous runs, then create fresh.
    // Stale sessions have dead pipes that cause "failed to open input pipe" errors.
    console.log(`[RunnerSession] Deleting stale session '${SESSION_ID}'...`);
    try {
        await sandbox.process.deleteSession(SESSION_ID);
    } catch {
        // Session doesn't exist yet — expected on first run
    }
    const t1 = Date.now();
    console.log(`[RunnerSession] deleteSession: ${t1 - t0}ms`);

    console.log(`[RunnerSession] Creating session '${SESSION_ID}'...`);
    await sandbox.process.createSession(SESSION_ID);
    const t2 = Date.now();
    console.log(`[RunnerSession] createSession: ${t2 - t1}ms`);

    // Build environment export command
    const envExports = Object.entries(envVars)
        .map(([k, v]) => `export ${k}=${shellEscape(v)}`)
        .join(' && ');

    const runnerDir = SANDBOX_CONFIG.runnerDir;
    const command = envExports
        ? `${envExports} && exec node ${runnerDir}/agent-runner.js`
        : `exec node ${runnerDir}/agent-runner.js`;

    const envKeys = Object.keys(envVars);
    console.log(`[RunnerSession] Executing runner command with ${envKeys.length} env vars: ${envKeys.join(', ')}`);
    const response = await sandbox.process.executeSessionCommand(SESSION_ID, {
        command,
        runAsync: true,
    });
    const t3 = Date.now();
    console.log(`[RunnerSession] Daytona timing: deleteSession=${t1 - t0}ms, createSession=${t2 - t1}ms, executeCommand=${t3 - t2}ms, total=${t3 - t0}ms`);

    const commandId = response.cmdId || '';
    if (!commandId) {
        throw new Error('Session command returned no command ID');
    }

    const streamLogsFn = async (
        onStdout: (chunk: string) => void,
        onStderr: (chunk: string) => void,
    ): Promise<void> => {
        await sandbox.process.getSessionCommandLogs(
            SESSION_ID,
            commandId,
            onStdout,
            onStderr,
        );
    };

    const logBuffer = new PersistentLogBuffer();
    logBuffer.start(streamLogsFn);

    return {
        sessionId: SESSION_ID,
        commandId,
        async sendInput(data: string): Promise<void> {
            await sandbox.process.sendSessionCommandInput(SESSION_ID, commandId, data);
        },
        streamLogs: streamLogsFn,
        logBuffer,
    };
}

/**
 * Send a JSON command to the runner via stdin.
 */
export async function sendCommand(
    handle: SessionHandle,
    command: { type: string; [key: string]: unknown },
): Promise<void> {
    await handle.sendInput(JSON.stringify(command) + '\n');
}

/**
 * Stream runner events from the persistent log buffer.
 * Reads from the given offset so reused runners skip old events.
 * @param startOffset - Position in the log buffer to start reading from.
 *   Captured BEFORE sendExecuteCommand so all events from this execution are included.
 */
export async function* streamEvents(
    handle: SessionHandle,
    abortSignal?: AbortSignal,
    startOffset?: number,
): AsyncGenerator<RunnerEvent> {
    const offset = startOffset ?? handle.logBuffer.position;
    yield* handle.logBuffer.readFrom(offset, abortSignal);
}

/**
 * Run an agent in the sandbox using Daytona Sessions API.
 * Creates a session, sends the initial message, and streams events.
 * Supports bidirectional communication via sendCommand().
 */
export async function* runAgentInSandbox(
    options: RunAgentInSandboxOptions,
): AsyncGenerator<RunnerEvent> {
    const { sandbox, config, prompt, openRouterApiKey, abortSignal } = options;

    if (abortSignal?.aborted) {
        yield transportError('Execution cancelled before start', 'CANCELLED');
        return;
    }

    // Build environment variables for the runner
    const envVars: Record<string, string> = {
        [RUNNER_ENV.CONFIG]: JSON.stringify(config),
    };

    if (openRouterApiKey) {
        envVars[RUNNER_ENV.ANTHROPIC_BASE_URL] = 'https://openrouter.ai/api';
        envVars[RUNNER_ENV.ANTHROPIC_AUTH_TOKEN] = openRouterApiKey;
        envVars[RUNNER_ENV.ANTHROPIC_API_KEY] = '';
    }

    let handle: SessionHandle;
    let lastError: Error | null = null;

    // Create session with reconnect logic (sandbox may be waking from sleep)
    for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
        try {
            handle = await createRunnerSession(sandbox, envVars);
            lastError = null;
            break;
        } catch (error) {
            lastError = error as Error;
            if (attempt < RECONNECT_MAX_ATTEMPTS) {
                const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                await sleep(delay);
            }
        }
    }

    if (lastError) {
        yield transportError(`Failed to create runner session: ${lastError.message}`, 'SESSION_CREATE_FAILED');
        return;
    }

    // Send initial message to runner
    await sendCommand(handle!, { type: 'message', content: prompt });

    // Stream events back
    yield* streamEvents(handle!, abortSignal);
}

