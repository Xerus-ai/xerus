// Daytona Agent Runner - Direct CLI Sessions
// Each agent gets its own Daytona session running the CLI directly.
// No cli-executor middleman: Backend -> Daytona Session "agent-{slug}" -> claude/codex (PERSISTENT)
// Backend sends messages via sendSessionCommandInput() to CLI's stdin.
// See: docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md Section 4

import { logger } from '../../../../utils/logger';
import { Sandbox } from '@daytonaio/sdk';
import { SANDBOX_CONFIG } from '../sandbox.config';
import type { RunnerEvent, ErrorEvent } from '../../../execution/runner/runner.types';
import { shellEscape } from '../../../../utils/shell-safety';
import { sleep } from '../sandbox.retry';
import { ClaudeCodeAdapter } from '../../../execution/runner/cli-adapters/claudecode';
import { CodexAdapter } from '../../../execution/runner/cli-adapters/codex';
import type { AdapterType, AgentConfig } from '../../../execution/runner/cli-adapters/types';
import { PersistentLogBuffer } from './persistent-log-buffer';

// Re-export PersistentLogBuffer for consumers that imported from this module
export { PersistentLogBuffer } from './persistent-log-buffer';

const log = logger('AgentSession');

const RECONNECT_MAX_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 2000;

// Transport-level synthetic event factory (v2 format)
function transportError(message: string, code: string, recoverable = false): ErrorEvent {
    return { event: 'error', message, code, recoverable };
}

export interface RunAgentInSandboxOptions {
    sandbox: Sandbox;
    config: RunnerConfig;
    prompt: string;
    openRouterApiKey?: string;
    abortSignal?: AbortSignal;
}

// Re-export RunnerConfig for external use
import type { RunnerConfig } from '../../../execution/runner/runner-config.types';
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
 * System prompts are passed via file to avoid shell escaping issues with newlines.
 */
function buildSessionCommand(
    envVars: Record<string, string>,
    agentOpts: AgentSessionOptions,
    systemPromptFilePath?: string,
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
        // system_prompt omitted — passed via file to avoid shellEscape newline rejection
        session_id: agentOpts.sessionId,
        cwd: SANDBOX_CONFIG.workspacePath,
    };

    const cliArgs = adapter.buildCommand('', agentConfig);

    // Inject per-agent env vars that hooks need (XERUS_AGENT_SLUG identifies the agent
    // to session-start.sh, task-context generation, and all other hook scripts).
    // Fail-fast: a blank slug would make every hook refuse to log activity (see
    // _lib.sh resolve_activity_agent) — surface the launch-path bug here instead of
    // spawning a CLI session with no identity.
    if (!agentOpts.agentSlug) {
        throw new Error(
            'buildSessionCommand: agentOpts.agentSlug is empty — refusing to launch a CLI ' +
            'session without an agent identity (hooks require XERUS_AGENT_SLUG).',
        );
    }
    const fullEnv: Record<string, string> = {
        ...envVars,
        XERUS_AGENT_SLUG: agentOpts.agentSlug,
    };

    // Build environment export prefix
    const envExports = Object.entries(fullEnv)
        .map(([k, v]) => `export ${k}=${shellEscape(v)}`)
        .join(' && ');

    const cliCommand = cliArgs.map(a => shellEscape(a)).join(' ');

    // Append system prompt from file using shell substitution.
    // The file contains multiline content that can't pass through shellEscape,
    // so we use $(cat file) inside double quotes to preserve newlines.
    const promptSuffix = systemPromptFilePath
        ? ` --append-system-prompt "$(cat ${shellEscape(systemPromptFilePath)})"`
        : '';

    return envExports
        ? `${envExports} && cd ${shellEscape(SANDBOX_CONFIG.workspacePath)} && exec ${cliCommand}${promptSuffix}`
        : `cd ${shellEscape(SANDBOX_CONFIG.workspacePath)} && exec ${cliCommand}${promptSuffix}`;
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
    log.debug('Deleting stale session', { session_name: sessionName });
    try {
        await sandbox.process.deleteSession(sessionName);
    } catch {
        // Session doesn't exist yet — expected on first run
    }
    const t1 = Date.now();

    log.debug('Creating session', { session_name: sessionName });
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

    // Write system prompt to a file in the sandbox to avoid shellEscape rejecting newlines.
    // Multiline system prompts (SOUL.md + CLAUDE.md) contain \n which shellEscape blocks.
    let systemPromptFilePath: string | undefined;
    if (agentOpts.systemPrompt) {
        systemPromptFilePath = `/tmp/xerus-prompt-${agentOpts.agentSlug}.md`;
        await sandbox.fs.uploadFile(
            Buffer.from(agentOpts.systemPrompt, 'utf-8'),
            systemPromptFilePath,
        );
    }

    const command = buildSessionCommand(envVars, agentOpts, systemPromptFilePath);

    const envKeys = Object.keys(envVars);
    log.info('Executing CLI', { adapter_type: agentOpts.adapterType, agent_slug: agentOpts.agentSlug, env_var_count: envKeys.length });
    const response = await sandbox.process.executeSessionCommand(sessionName, {
        command,
        runAsync: true,
    });
    const t3 = Date.now();
    log.debug('Daytona timing', { delete_ms: t1 - t0, create_ms: t2 - t1, exec_ms: t3 - t2, total_ms: t3 - t0 });

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
 * Send a message to the CLI's stdin.
 * For stream-json adapters (Claude Code): sends structured NDJSON.
 * For plain text adapters (Codex): sends raw text.
 */
export async function sendMessage(
    handle: SessionHandle,
    message: string,
): Promise<void> {
    // Format as stream-json NDJSON for Claude Code's --input-format stream-json
    const formatted = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: message },
    });
    await handle.sendInput(formatted + '\n');
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
