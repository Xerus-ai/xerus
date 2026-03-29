// CLI Executor
// Persistent process on sandbox that spawns CLI subprocesses (Claude Code / Codex)
// Drop-in replacement for agent-runner.ts (SDK-based execution)
// Protocol: stdin JSON commands -> stdout JSON events (unchanged from v2)
// Reference: Ductor executor.py, Paperclip execute.ts, 9to5 runner.ts

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import readline from 'readline';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

import { StdinParser } from './stdin-parser';
import type { ExecuteCommand, InterruptCommand } from './stdin-parser';
import { StdoutEmitter } from './stdout-emitter';
import { ProcessRegistry } from './process-registry';
import { ClaudeCodeAdapter } from './cli-adapters/claudecode';
import { CodexAdapter } from './cli-adapters/codex';
import { parseClaudeStreamLine, parseCodexStreamLine, clearAccumulator } from './stream-parser';
import { detectAuthForAdapter } from './auth-detector';
import type { CLIAdapter, AdapterType, AgentConfig, AgentRole } from './cli-adapters/types';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const WORKSPACE_ROOT = process.env.XERUS_WORKSPACE_ROOT || '/home/daytona/workspace';
const AGENTS_DIR = join(WORKSPACE_ROOT, 'agents');
const POLICIES_DIR = join(WORKSPACE_ROOT, 'shared', 'policies');

// -----------------------------------------------------------------------------
// Global State
// -----------------------------------------------------------------------------

const adapters: Record<AdapterType, CLIAdapter> = {
    claudecode: new ClaudeCodeAdapter(),
    codex: new CodexAdapter(),
};

const stdinParser = new StdinParser();
const emitter = new StdoutEmitter();
const registry = new ProcessRegistry();
const startTime = Date.now();

// -----------------------------------------------------------------------------
// Agent Config Loader (Async with Caching)
// -----------------------------------------------------------------------------

// Cache for agent configs: slug -> { config, timestamp }
const configCache = new Map<string, { config: AgentConfig; timestamp: number }>();
const CONFIG_CACHE_TTL_MS = 60_000; // 1 minute TTL

// Cache for role policies: role -> policy text
const policyCache = new Map<string, string>();

// -----------------------------------------------------------------------------
// Role Policy Loader
// -----------------------------------------------------------------------------

async function loadRolePolicies(role: AgentRole): Promise<string> {
    // Check cache
    const cached = policyCache.get(role);
    if (cached) return cached;

    const policyFiles = [
        'ROLE_CAPABILITIES.md',
        'TOOL_AUTHORIZATION.md',
        'DELEGATION_POLICY.md',
    ];

    const sections: string[] = [];

    for (const file of policyFiles) {
        const filePath = join(POLICIES_DIR, file);
        try {
            const content = await readFile(filePath, 'utf-8');
            sections.push(content);
        } catch {
            // Policy file not found - skip silently
        }
    }

    if (sections.length === 0) {
        return '';
    }

    // Build role-specific policy section
    const policy = `
## Your Role: ${role.toUpperCase()}

${sections.join('\n\n---\n\n')}

**You MUST follow these policies. Violations will be logged and may result in task termination.**
`;

    policyCache.set(role, policy);
    return policy;
}

async function loadAgentConfig(agentSlug: string): Promise<AgentConfig> {
    const configPath = join(AGENTS_DIR, agentSlug, 'config.json');

    // Check cache first
    const cached = configCache.get(agentSlug);
    const now = Date.now();
    if (cached && now - cached.timestamp < CONFIG_CACHE_TTL_MS) {
        return cached.config;
    }

    // Validate file exists (fast sync check)
    if (!existsSync(configPath)) {
        throw new Error(`Agent config not found: ${configPath}`);
    }

    // Async file read (non-blocking)
    const content = await readFile(configPath, 'utf-8');
    const raw = JSON.parse(content);

    const config: AgentConfig = {
        slug: agentSlug,
        model: raw.model || raw.ai_model,
        adapter_type: (raw.adapter_type as AdapterType) || 'claudecode',
        role: (raw.role as AgentRole) || 'specialist',
        autonomy_level: raw.autonomy_level || 'supervised',
        thinking_level: raw.thinking_level,
        max_budget_usd: raw.max_budget_usd,
        allowed_tools: raw.allowed_tools,
        system_prompt: raw.system_prompt,
        cwd: WORKSPACE_ROOT,
    };

    // Update cache
    configCache.set(agentSlug, { config, timestamp: now });

    return config;
}

// -----------------------------------------------------------------------------
// Execute Command Handler
// -----------------------------------------------------------------------------

async function handleExecute(cmd: ExecuteCommand): Promise<void> {
    const agentSlug = cmd.agent_slug;
    const prompt = cmd.content;

    if (!agentSlug || !prompt) {
        emitter.error('execute requires agent_slug and content', 'INVALID_COMMAND', agentSlug);
        return;
    }

    // Load agent config from filesystem (source of truth) - async with caching
    let config: AgentConfig;
    try {
        config = await loadAgentConfig(agentSlug);
    } catch (err) {
        emitter.error(
            `Failed to load agent config: ${(err as Error).message}`,
            'CONFIG_LOAD_ERROR',
            agentSlug,
        );
        return;
    }

    // Override with command-level config
    if (cmd.config?.model) config.model = cmd.config.model as string;
    if (cmd.config?.system_prompt) config.system_prompt = cmd.config.system_prompt as string;
    if (cmd.config?.cwd) config.cwd = cmd.config.cwd as string;

    // Load and inject role policies into system prompt
    const rolePolicies = await loadRolePolicies(config.role);
    if (rolePolicies) {
        config.system_prompt = config.system_prompt
            ? `${config.system_prompt}\n\n${rolePolicies}`
            : rolePolicies;
    }

    const adapter = adapters[config.adapter_type];
    if (!adapter) {
        emitter.error(
            `Unknown adapter type: ${config.adapter_type}`,
            'UNKNOWN_ADAPTER',
            agentSlug,
        );
        return;
    }

    // Detect auth for this adapter
    const authResult = await detectAuthForAdapter(config.adapter_type);

    // No auth and no platform key → cannot execute
    if (!authResult.authenticated && !process.env.OPENROUTER_API_KEY) {
        emitter.error(
            'No CLI authentication found and no platform API key available',
            'AUTH_REQUIRED',
            agentSlug,
        );
        return;
    }

    const sessionId = randomUUID();
    const cliArgs = adapter.buildCommand(prompt, { ...config, session_id: sessionId });

    // Emit session_started (same event shape as SDK runner)
    emitter.sessionStarted(
        agentSlug,
        sessionId,
        config.model || 'default',
        config.cwd || WORKSPACE_ROOT,
    );

    const executeStart = Date.now();

    // Build environment for the CLI subprocess
    const env: Record<string, string> = { ...process.env as Record<string, string> };

    // Inject OpenRouter for platform billing when user has no CLI auth
    if (authResult.billingType === 'platform' && process.env.OPENROUTER_API_KEY) {
        if (config.adapter_type === 'claudecode') {
            env.ANTHROPIC_BASE_URL = 'https://openrouter.ai/api';
            env.ANTHROPIC_API_KEY = process.env.OPENROUTER_API_KEY;
        } else {
            env.OPENAI_BASE_URL = 'https://openrouter.ai/api/v1';
            env.OPENAI_API_KEY = process.env.OPENROUTER_API_KEY;
        }
    }

    // Spawn CLI subprocess
    const proc = spawn(cliArgs[0], cliArgs.slice(1), {
        cwd: config.cwd || WORKSPACE_ROOT,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    registry.register(agentSlug, sessionId, proc, config.adapter_type);

    // For adapters that accept prompt via stdin (Codex)
    if (adapter.promptViaStdin && proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
    }

    // Select parser function based on adapter type
    const parseFn = config.adapter_type === 'claudecode'
        ? parseClaudeStreamLine
        : parseCodexStreamLine;

    // Parse stdout NDJSON line by line
    const rl = readline.createInterface({ input: proc.stdout!, terminal: false });
    // Register readline interface so it can be closed if process is superseded
    registry.setReadline(agentSlug, rl);
    rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        parseFn(trimmed, emitter, agentSlug, sessionId);
    });

    // Capture stderr for error reporting
    const stderrChunks: string[] = [];
    proc.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk.toString());
    });

    // Wait for process exit
    const exitCode = await new Promise<number | null>((resolve) => {
        proc.on('exit', (code) => resolve(code));
        proc.on('error', (err) => {
            emitter.error(
                `CLI process error: ${err.message}`,
                'EXECUTION_ERROR',
                agentSlug,
            );
            resolve(1);
        });
    });

    const durationMs = Date.now() - executeStart;
    const success = exitCode === 0;

    if (!success && stderrChunks.length > 0) {
        emitter.error(
            stderrChunks.join('').slice(0, 1000),
            'CLI_EXIT_ERROR',
            agentSlug,
        );
    }

    // Clean up token accumulator
    clearAccumulator(sessionId);

    // Emit session_ended (same event shape as SDK runner)
    emitter.sessionEnded(agentSlug, sessionId, success, durationMs);
}

// -----------------------------------------------------------------------------
// Other Command Handlers
// -----------------------------------------------------------------------------

function handleInterrupt(cmd: InterruptCommand): void {
    const agentSlug = cmd.agent_slug;
    if (!agentSlug) return;

    const interrupted = registry.interrupt(agentSlug);
    if (!interrupted) {
        emitter.error('No running process to interrupt', 'NOT_FOUND', agentSlug);
    }
}

function handleHitlResponse(cmd: Record<string, unknown>): void {
    // HITL: write user's response to the CLI process stdin
    // Claude Code waits on stdin for permission decisions in default mode
    const approved = cmd.approved as boolean;
    const feedback = cmd.feedback as string | undefined;
    const pauseId = cmd.pause_id as string | undefined;
    const agentSlug = cmd.agent_slug as string | undefined;
    const response = approved ? (feedback || 'yes') : 'no';

    // If pause_id is provided, target the specific agent session
    if (agentSlug) {
        const tracked = registry.findProcess(agentSlug);
        if (tracked && tracked.sessionId === pauseId) {
            if (registry.writeStdin(agentSlug, response + '\n')) {
                return;
            }
        } else if (tracked && !pauseId) {
            // Fallback: no pause_id but agent_slug specified - write to that agent
            if (registry.writeStdin(agentSlug, response + '\n')) {
                return;
            }
        }
        emitter.error(
            `No matching session for agent ${agentSlug}${pauseId ? ` with pause_id ${pauseId}` : ''}`,
            'NOT_FOUND',
            agentSlug,
        );
        return;
    }

    // Legacy fallback: no agent_slug, find any active process
    const active = registry.getActive();
    for (const entry of active) {
        // If pause_id is provided, match against session_id
        if (pauseId && entry.sessionId !== pauseId) {
            continue;
        }
        if (registry.writeStdin(entry.agentSlug, response + '\n')) {
            return;
        }
    }

    emitter.error('No active process to send HITL response to', 'NOT_FOUND');
}

function handleHealth(): void {
    const uptimeMs = Date.now() - startTime;
    emitter.health(uptimeMs, registry.getActive().length);
}

function handleListSessions(): void {
    emitter.sessionsList(
        registry.getActive().map(a => ({
            agent_slug: a.agentSlug,
            session_id: a.sessionId,
            started_at: new Date(a.startedAt).toISOString(),
            status: 'active' as const,
        })),
    );
}

// -----------------------------------------------------------------------------
// Main Entry Point
// -----------------------------------------------------------------------------

stdinParser.on('command', async (cmd: { type: string; [key: string]: unknown }) => {
    try {
        switch (cmd.type) {
            case 'execute':
                await handleExecute(cmd as unknown as ExecuteCommand);
                break;
            case 'interrupt':
                handleInterrupt(cmd as unknown as InterruptCommand);
                break;
            case 'hitl_response':
                handleHitlResponse(cmd as Record<string, unknown>);
                break;
            case 'health':
                handleHealth();
                break;
            case 'list_sessions':
                handleListSessions();
                break;
            case 'heartbeat':
                // Heartbeats now handled by 9to5 daemon, not the runner
                emitter.error('Heartbeats are handled by 9to5 daemon', 'UNSUPPORTED_COMMAND');
                break;
            case 'done':
                // No-op: sessions end when CLI process exits
                break;
            default:
                emitter.error(`Unknown command: ${cmd.type}`, 'UNSUPPORTED_COMMAND');
        }
    } catch (err) {
        emitter.error(
            `Command handler failed: ${(err as Error).message}`,
            'HANDLER_ERROR',
        );
    }
});

stdinParser.on('error', (err: Error) => {
    emitter.error(`Stdin parse error: ${err.message}`, 'STDIN_ERROR');
});

stdinParser.on('close', () => {
    registry.killAll().then(() => process.exit(0));
});

// Start processing stdin and signal readiness
stdinParser.start();
emitter.health(0, 0);
console.error('[cli-executor] Ready — CLI-native execution bridge');
