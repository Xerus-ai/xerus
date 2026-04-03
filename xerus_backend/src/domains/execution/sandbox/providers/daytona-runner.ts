// Daytona Agent Runner - Direct CLI Sessions
// Each agent gets its own Daytona session running the CLI directly.
// No cli-executor middleman: Backend -> Daytona Session "agent-{slug}" -> claude/codex (PERSISTENT)
// Backend sends messages via sendSessionCommandInput() to CLI's stdin.
// See: docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md Section 4

import { setMaxListeners } from 'events';
import { Sandbox } from '@daytonaio/sdk';
import { SANDBOX_CONFIG } from '../sandbox.config';
import { RunnerEvent, ErrorEvent, AgentOutputEvent } from '../../runner/runner.types';
import { shellEscape } from '../../../../utils/shell-safety';
import { sleep } from '../sandbox.retry';
import { ClaudeCodeAdapter } from '../../runner/cli-adapters/claudecode';
import { CodexAdapter } from '../../runner/cli-adapters/codex';
import type { AdapterType, AgentConfig } from '../../runner/cli-adapters/types';

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

// Re-export RunnerConfig for external use
import type { RunnerConfig } from '../../runner/runner-config.types';
export type { RunnerConfig };

export interface AgentSessionOptions {
    agentSlug: string;
    adapterType: AdapterType;
    sessionId?: string;
    model?: string;
    autonomyLevel?: string;
    maxBudgetUsd?: number;
    allowedTools?: string[];
    systemPrompt?: string;
}

export interface SessionHandle {
    sessionId: string;
    commandId: string;
    agentSlug: string;
    sendInput(data: string): Promise<void>;
    streamLogs(
        onStdout: (chunk: string) => void,
        onStderr: (chunk: string) => void,
    ): Promise<void>;
    logBuffer: PersistentLogBuffer;
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
        this.lineBuffer += chunk;
        const lines = this.lineBuffer.split('\n');
        this.lineBuffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            this.pushLine(trimmed);
        }
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

    private trimIfNeeded(): void {
        if (this.buffer.length > MAX_BUFFER_SIZE) {
            const trimCount = Math.floor(this.buffer.length / 2);
            this.buffer = this.buffer.slice(trimCount);
            this.trimOffset += trimCount;
        }
    }

    private toPhysical(logicalPos: number): number {
        return logicalPos - this.trimOffset;
    }

    peek(pos: number): RunnerEvent | null | undefined {
        const physical = this.toPhysical(pos);
        if (physical < 0) return undefined;
        if (physical < this.buffer.length) return this.buffer[physical];
        if (this.closed) return null;
        return undefined;
    }

    async *readFrom(offset: number, abortSignal?: AbortSignal): AsyncGenerator<RunnerEvent> {
        if (abortSignal) {
            try { setMaxListeners(50, abortSignal); } catch { /* Node < 19 fallback */ }
        }
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

// Adapter instances (reused across sessions)
const adapters = {
    claudecode: new ClaudeCodeAdapter(),
    codex: new CodexAdapter(),
} as const;

/**
 * Build the session name for a given agent slug.
 */
function agentSessionName(agentSlug: string): string {
    return `agent-${agentSlug}`;
}

/**
 * Build the CLI command string for a Daytona session.
 * Combines env exports + CLI args into a single shell command.
 */
function buildSessionCommand(
    envVars: Record<string, string>,
    agentOpts: AgentSessionOptions,
): string {
    const adapter = adapters[agentOpts.adapterType];

    const agentConfig: AgentConfig = {
        slug: agentOpts.agentSlug,
        adapter_type: agentOpts.adapterType,
        role: 'agent',
        autonomy_level: agentOpts.autonomyLevel || 'autonomous',
        model: agentOpts.model,
        max_budget_usd: agentOpts.maxBudgetUsd,
        allowed_tools: agentOpts.allowedTools,
        system_prompt: agentOpts.systemPrompt,
        session_id: agentOpts.sessionId,
        cwd: SANDBOX_CONFIG.workspacePath,
    };

    const cliArgs = adapter.buildCommand('', agentConfig);

    // Build environment export prefix
    const envExports = Object.entries(envVars)
        .map(([k, v]) => `export ${k}=${shellEscape(v)}`)
        .join(' && ');

    const cliCommand = cliArgs.map(a => shellEscape(a)).join(' ');

    return envExports
        ? `${envExports} && cd ${shellEscape(SANDBOX_CONFIG.workspacePath)} && exec ${cliCommand}`
        : `cd ${shellEscape(SANDBOX_CONFIG.workspacePath)} && exec ${cliCommand}`;
}

/**
 * Create a Daytona session for a specific agent, running the CLI directly.
 * Session name: "agent-{slug}"
 * The CLI runs persistently; backend sends messages via sendSessionCommandInput().
 */
export async function createAgentSession(
    sandbox: Sandbox,
    envVars: Record<string, string>,
    agentOpts: AgentSessionOptions,
): Promise<SessionHandle> {
    const sessionName = agentSessionName(agentOpts.agentSlug);
    const t0 = Date.now();

    // Delete any stale session from previous runs.
    // Stale sessions have dead pipes that cause "failed to open input pipe" errors.
    console.log(`[AgentSession] Deleting stale session '${sessionName}'...`);
    try {
        await sandbox.process.deleteSession(sessionName);
    } catch {
        // Session doesn't exist yet — expected on first run
    }
    const t1 = Date.now();

    console.log(`[AgentSession] Creating session '${sessionName}'...`);
    await sandbox.process.createSession(sessionName);
    const t2 = Date.now();

    // Write Codex config.toml to sandbox if needed (platform billing, no BYOK).
    // buildSDKEnvironment() stores the OpenRouter key in ANTHROPIC_AUTH_TOKEN.
    // When no OPENAI_API_KEY is set (no BYOK), Codex needs config.toml for OpenRouter routing.
    const openRouterKey = envVars.ANTHROPIC_AUTH_TOKEN;
    if (agentOpts.adapterType === 'codex' && openRouterKey && !envVars.OPENAI_API_KEY) {
        const codexHome = '/home/daytona/.codex';
        const configToml = `model_provider = "openrouter"\napi_key = "${openRouterKey}"\n`;
        await sandbox.process.executeCommand(`mkdir -p ${codexHome}`);
        await sandbox.fs.uploadFile(Buffer.from(configToml, 'utf-8'), `${codexHome}/config.toml`);
    }

    const command = buildSessionCommand(envVars, agentOpts);

    const envKeys = Object.keys(envVars);
    console.log(`[AgentSession] Executing ${agentOpts.adapterType} for ${agentOpts.agentSlug} with ${envKeys.length} env vars`);
    const response = await sandbox.process.executeSessionCommand(sessionName, {
        command,
        runAsync: true,
    });
    const t3 = Date.now();
    console.log(`[AgentSession] Daytona timing: delete=${t1 - t0}ms, create=${t2 - t1}ms, exec=${t3 - t2}ms, total=${t3 - t0}ms`);

    const commandId = response.cmdId || '';
    if (!commandId) {
        throw new Error(`Session command for ${sessionName} returned no command ID`);
    }

    const streamLogsFn = async (
        onStdout: (chunk: string) => void,
        onStderr: (chunk: string) => void,
    ): Promise<void> => {
        await sandbox.process.getSessionCommandLogs(
            sessionName,
            commandId,
            onStdout,
            onStderr,
        );
    };

    const logBuffer = new PersistentLogBuffer();
    logBuffer.start(streamLogsFn);

    return {
        sessionId: sessionName,
        commandId,
        agentSlug: agentOpts.agentSlug,
        async sendInput(data: string): Promise<void> {
            await sandbox.process.sendSessionCommandInput(sessionName, commandId, data);
        },
        streamLogs: streamLogsFn,
        logBuffer,
    };
}

/**
 * Send a JSON command to the CLI via stdin.
 * For Claude: messages are piped as plain text (Claude reads from stdin).
 * For structured commands (interrupt, health): JSON lines.
 */
export async function sendCommand(
    handle: SessionHandle,
    command: { type: string; [key: string]: unknown },
): Promise<void> {
    await handle.sendInput(JSON.stringify(command) + '\n');
}

/**
 * Send a plain text message to the CLI's stdin.
 * Used for interactive Claude sessions where the prompt goes to stdin.
 */
export async function sendMessage(
    handle: SessionHandle,
    message: string,
): Promise<void> {
    await handle.sendInput(message + '\n');
}

/**
 * Stream runner events from the persistent log buffer.
 * Reads from the given offset so reused runners skip old events.
 */
export async function* streamEvents(
    handle: SessionHandle,
    abortSignal?: AbortSignal,
    startOffset?: number,
): AsyncGenerator<RunnerEvent> {
    const offset = startOffset ?? handle.logBuffer.position;
    yield* handle.logBuffer.readFrom(offset, abortSignal);
}

// Keep backward-compatible export name for runner-session.ts
export const createRunnerSession = createAgentSession;

/**
 * Run an agent in the sandbox using Daytona Sessions API.
 * Creates a session, sends the initial message, and streams events.
 */
export async function* runAgentInSandbox(
    options: RunAgentInSandboxOptions,
): AsyncGenerator<RunnerEvent> {
    const { sandbox, config, prompt, openRouterApiKey, abortSignal } = options;

    if (abortSignal?.aborted) {
        yield transportError('Execution cancelled before start', 'CANCELLED');
        return;
    }

    const envVars: Record<string, string> = {};

    if (openRouterApiKey) {
        envVars.ANTHROPIC_BASE_URL = 'https://openrouter.ai/api';
        envVars.ANTHROPIC_AUTH_TOKEN = openRouterApiKey;
        envVars.ANTHROPIC_API_KEY = '';
    }

    const agentOpts: AgentSessionOptions = {
        agentSlug: config.agentSlug,
        adapterType: 'claudecode',
        model: config.model,
    };

    let handle: SessionHandle;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
        try {
            handle = await createAgentSession(sandbox, envVars, agentOpts);
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
        yield transportError(`Failed to create agent session: ${lastError.message}`, 'SESSION_CREATE_FAILED');
        return;
    }

    // Send initial message to Claude's stdin
    await sendMessage(handle!, prompt);

    yield* streamEvents(handle!, abortSignal);
}
