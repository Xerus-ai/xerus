// Daytona Sandbox Provider - SDK runs INSIDE sandbox
// Uses Sessions API for bidirectional communication
// See: docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md

import { logger } from '../../../../utils/logger';
import { Daytona, Sandbox } from '@daytonaio/sdk';
import { SandboxProvider, ProviderSandbox, CreateProviderSandboxOptions, ProviderSandboxStatus, ProviderCapabilities } from './sandbox-provider.interface';
import { SANDBOX_CONFIG } from '../sandbox.config';
import { withRetry } from '../sandbox.retry';
import { SandboxNotFoundError, SandboxPreviewError, UnknownSandboxStateError } from '../../../execution/errors';
import { SandboxState } from '../../../execution/types';
import { RunnerConfig, RunnerEvent } from '../../../execution/runner/runner.types';
import { runAgentInSandbox, sendCommand, sendMessage, streamEvents, createAgentSession } from './daytona-runner';
import type { AgentSessionOptions } from './daytona-runner';
import { createDaytonaFileSystem } from './daytona-filesystem';
import type { SandboxFileSystem } from '../../workspace/workspace.manager';

const log = logger('DaytonaProvider');

// The sandbox image sets LC_ALL=en_US.UTF-8 but the locale isn't generated.
// Bash emits "setlocale: LC_ALL: cannot change locale" on every command startup.
// Daytona merges stdout+stderr, so this warning corrupts command output.
const LOCALE_WARNING_RE = /^\/usr\/bin\/bash: warning: setlocale: .*\n?/gm;
function stripLocaleWarnings(raw: string): string {
    return raw.replace(LOCALE_WARNING_RE, '');
}

export interface DaytonaCreateOptions extends CreateProviderSandboxOptions {
    snapshot?: string;
    autoStopInterval?: number;
    autoArchiveInterval?: number;
    autoDeleteInterval?: number;
    volumeName?: string;
    volumeMountPath?: string;
}

export interface RunAgentOptions {
    sandboxId: string;
    config: RunnerConfig;
    prompt: string;
    openRouterApiKey?: string;
    abortSignal?: AbortSignal;
}

export interface RunAgentResult {
    events: AsyncGenerator<RunnerEvent>;
    sendMessage(content: string): Promise<void>;
    interrupt(): Promise<void>;
    end(): Promise<void>;
}

// Cached sandbox entry with timestamp for TTL eviction
interface CachedSandbox {
    sandbox: Sandbox;
    cachedAt: number;
}

// Cache TTL: 30 minutes (sandboxes not accessed for 30min are evicted from cache)
const CACHE_TTL_MS = 30 * 60 * 1000;

export class DaytonaProvider implements SandboxProvider {
    readonly name = 'daytona';
    readonly capabilities: ProviderCapabilities = {
        supportsPause: true, // via stop()
        supportsResume: true, // via start()
        supportsTimeout: true,
        maxLifetimeMs: 7 * 24 * 60 * 60 * 1000, // 7 days (with auto-archive)
    };

    private client: Daytona;
    private sandboxInstances = new Map<string, CachedSandbox>();

    constructor() {
        const apiKey = process.env.DAYTONA_API_KEY;
        const apiUrl = process.env.DAYTONA_API_URL;

        if (!apiKey) {
            throw new Error('DAYTONA_API_KEY environment variable is required');
        }
        if (!apiUrl) {
            throw new Error('DAYTONA_API_URL environment variable is required');
        }

        this.client = new Daytona({
            apiKey,
            apiUrl,
        });
    }

    async create(options: DaytonaCreateOptions): Promise<ProviderSandbox> {
        const snapshot = options.snapshot || SANDBOX_CONFIG.snapshot;
        const autoStopInterval = options.autoStopInterval || SANDBOX_CONFIG.autoStopIntervalMinutes;
        const autoArchiveInterval = options.autoArchiveInterval || SANDBOX_CONFIG.autoArchiveIntervalMinutes;

        const doCreate = async () => this.client.create({
            snapshot,
            envVars: options.envVars,
            autoStopInterval,
            autoArchiveInterval,
            autoDeleteInterval: options.autoDeleteInterval,
            labels: options.metadata,
        });

        let sandbox: Sandbox;
        try {
            sandbox = await withRetry(doCreate, 'create');
        } catch (err) {
            // Self-heal Daytona's idle-GC: if the snapshot was auto-deactivated
            // after ~14 days of disuse, transparently reactivate and retry once
            // so the user never sees the failure.
            if (snapshot && this.isSnapshotInactiveError(err)) {
                log.warn('Sandbox create failed: snapshot inactive — auto-recovering', { snapshot });
                await this.ensureSnapshotActive(snapshot);
                sandbox = await withRetry(doCreate, 'create');
            } else {
                throw err;
            }
        }

        // Cache the sandbox instance for later operations (with TTL tracking)
        this.sandboxInstances.set(sandbox.id, { sandbox, cachedAt: Date.now() });

        return {
            sandboxId: sandbox.id,
            metadata: {
                ...options.metadata,
                snapshot: snapshot || '',
                previewUrlBase: await this.getPreviewUrlBase(sandbox),
            },
        };
    }

    private isSnapshotInactiveError(err: unknown): boolean {
        const msg = (err as Error)?.message ?? '';
        return /snapshot\s+\S+\s+is\s+inactive/i.test(msg);
    }

    // Activates a snapshot that Daytona's idle GC has marked inactive, then
    // polls until it reaches the 'active' state. Throws on terminal error or
    // if activation does not complete within the budget.
    async ensureSnapshotActive(name: string): Promise<void> {
        const initial = await this.client.snapshot.get(name);
        if (initial.state === 'active') return;

        log.info('Activating snapshot', { name, currentState: initial.state });
        if (initial.state === 'inactive') {
            await this.client.snapshot.activate(initial);
        }

        const pollIntervalMs = 3000;
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
            const current = await this.client.snapshot.get(name);
            if (current.state === 'active') {
                log.info('Snapshot activated', { name });
                return;
            }
            if (current.state === 'error') {
                throw new Error(`Snapshot ${name} entered error state: ${current.errorReason ?? 'unknown'}`);
            }
        }
        throw new Error(`Snapshot ${name} did not reach 'active' within 120s`);
    }

    async connect(sandboxId: string): Promise<ProviderSandbox> {
        // First try to get the sandbox and start it if needed
        const sandbox = await withRetry(
            async () => {
                const s = await this.client.get(sandboxId);
                // Start if not running
                if (s.state !== 'started') {
                    await this.client.start(s);
                }
                return s;
            },
            'connect'
        );

        this.sandboxInstances.set(sandboxId, { sandbox, cachedAt: Date.now() });

        return {
            sandboxId: sandbox.id,
        };
    }

    async pause(sandboxId: string): Promise<void> {
        // Daytona uses stop() instead of pause()
        await withRetry(
            async () => {
                const sandbox = await this.getSandboxInstance(sandboxId);
                await this.client.stop(sandbox);
            },
            'pause'
        );
    }

    async kill(sandboxId: string): Promise<void> {
        try {
            const sandbox = await this.getSandboxInstance(sandboxId);
            await this.client.delete(sandbox);
            this.sandboxInstances.delete(sandboxId);
        } catch (error) {
            const errorMessage = (error as Error).message || '';
            // Only ignore if sandbox is already deleted/not found
            if (errorMessage.includes('not found') || errorMessage.includes('deleted') || errorMessage.includes('NOT_FOUND')) {
                this.sandboxInstances.delete(sandboxId);
                return;
            }
            // Propagate unexpected errors (fail-fast)
            throw error;
        }
    }

    async getStatus(sandboxId: string): Promise<ProviderSandboxStatus> {
        try {
            const sandbox = await this.client.get(sandboxId);

            return {
                sandboxId: sandbox.id,
                state: this.mapDaytonaState(sandbox.state, sandboxId),
                createdAt: sandbox.createdAt ? new Date(sandbox.createdAt) : undefined,
                metadata: {
                    snapshot: sandbox.snapshot || '',
                },
            };
        } catch (error) {
            const errorMessage = (error as Error).message || '';
            // Throw typed error if sandbox not found
            if (errorMessage.includes('not found') || errorMessage.includes('NOT_FOUND')) {
                throw new SandboxNotFoundError(sandboxId);
            }
            // Propagate unexpected errors (fail-fast)
            throw error;
        }
    }

    async start(sandboxId: string): Promise<void> {
        await withRetry(async () => {
            const sandbox = await this.getSandboxInstance(sandboxId);
            await this.client.start(sandbox);
            // Update cache timestamp after successful start
            this.sandboxInstances.set(sandboxId, { sandbox, cachedAt: Date.now() });
        }, 'start');
    }

    async archive(sandboxId: string): Promise<void> {
        await this.pause(sandboxId);
    }

    async getPreviewUrl(sandboxId: string, port: number): Promise<string> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        return (await sandbox.getPreviewLink(port)).url;
    }

    async startComputerUse(sandboxId: string): Promise<string> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        const startResult = await sandbox.computerUse.start();
        log.debug('computerUse.start() result', { result: startResult });

        // Detect actual DISPLAY from running X server process args
        const detectDisplay = await this.executeCommand(sandboxId, [
            'echo "=== X11 STATE ==="',
            'ls -la /tmp/.X11-unix/ 2>/dev/null || echo "No X11 sockets"',
            'ps aux 2>/dev/null | grep -E "Xvfb|Xtigervnc|Xvnc|Xorg" | grep -v grep || echo "No X server found"',
            'echo "---"',
            'file /usr/bin/chromium 2>/dev/null || echo "chromium not found"',
        ].join('; '));
        log.debug('X11 state', { output: detectDisplay.result.slice(0, 2000) });

        // Extract DISPLAY number from X server process (e.g. "Xvfb :1" or "Xtigervnc :1")
        const xMatch = detectDisplay.result.match(/(?:Xvfb|Xtigervnc|Xvnc|Xorg)\s+(:\d+)/);
        const display = xMatch ? xMatch[1] : ':1';
        log.debug('Detected DISPLAY', { display });

        // Strip xfce4 desktop chrome and persist DISPLAY for future agent use
        await this.executeCommand(sandboxId, [
            `pkill -9 xfce4-panel 2>/dev/null; true`,
            `pkill -9 xfdesktop 2>/dev/null; true`,
            `grep -q "DISPLAY=${display}" ~/.bashrc 2>/dev/null || echo "export DISPLAY=${display}" >> ~/.bashrc`,
        ].join('; '));

        // Write a bash launcher script with the detected DISPLAY, then run it via nohup.
        // Uses a script file to guarantee DISPLAY reaches Chromium regardless of
        // how executeCommand handles env propagation.
        const launchScript = `cat > /tmp/launch-chromium.sh << 'CHROMESCRIPT'
#!/bin/sh
export DISPLAY=${display}
CHROME=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || which google-chrome 2>/dev/null || echo "")
if [ -z "$CHROME" ]; then
  CHROME=$(find $HOME/.cache/ms-playwright -path "*/chrome-linux/chrome" -type f 2>/dev/null | head -1)
fi
echo "Launching: $CHROME on DISPLAY=$DISPLAY"
exec "$CHROME" --no-sandbox --no-first-run --no-default-browser-check --disable-infobars --disable-gpu --disable-dev-shm-usage --disable-software-rasterizer --start-maximized about:blank
CHROMESCRIPT
chmod +x /tmp/launch-chromium.sh
nohup /tmp/launch-chromium.sh > /tmp/chromium.log 2>&1 &
sleep 3
echo "Chromium PID: $(pgrep -f chromium | head -1)"
cat /tmp/chromium.log 2>/dev/null | head -20`;
        const launch = await this.executeCommand(sandboxId, launchScript);
        log.debug('Browser launch', { exit_code: launch.exitCode, output: launch.result.slice(0, 1000) });

        // Signed URL — vnc.html has auto-hiding side tab instead of permanent top bar
        const signed = await sandbox.getSignedPreviewUrl(SANDBOX_CONFIG.novncPort, 3600);
        const base = signed.url.replace(/\/+$/, '');
        return `${base}/vnc.html?autoconnect=true&resize=scale`;
    }

    async startTerminal(sandboxId: string): Promise<string> {
        const sandbox = await this.getSandboxInstance(sandboxId);

        // Start ttyd serving claude CLI on the terminal port (idempotent — check if already running)
        const check = await this.executeCommand(
            sandboxId,
            `ss -tlnp | grep ':${SANDBOX_CONFIG.terminalPort}' && echo LISTENING || echo FREE`,
        );
        if (!(check.result || '').trim().endsWith('LISTENING')) {
            // Use full path — ttyd is installed in ~/.local/bin which may not be on PATH
            await this.executeCommand(sandboxId,
                `TTYD=$(which ttyd 2>/dev/null || echo $HOME/.local/bin/ttyd); (nohup $TTYD -p ${SANDBOX_CONFIG.terminalPort} --writable bash -c 'claude; exec bash' > /dev/null 2>&1 &); sleep 1`,
            );
        }

        const signed = await sandbox.getSignedPreviewUrl(SANDBOX_CONFIG.terminalPort, 3600);
        return signed.url;
    }

    async executeCode(sandboxId: string, code: string): Promise<string> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        return (await sandbox.process.codeRun(code)).result || '';
    }

    async executeCommand(sandboxId: string, command: string): Promise<{ result: string; exitCode: number }> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        const result = await sandbox.process.executeCommand(command);
        return {
            result: stripLocaleWarnings(result.result || ''),
            exitCode: result.exitCode || 0,
        };
    }

    // Daytona-specific: Upload file to sandbox
    async uploadFile(sandboxId: string, content: string, remotePath: string): Promise<void> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        await sandbox.fs.uploadFile(Buffer.from(content, 'base64'), remotePath);
    }

    // Read a file from the sandbox filesystem
    async readFile(sandboxId: string, filePath: string): Promise<string> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        const fs = createDaytonaFileSystem(sandbox);
        return fs.readFile(filePath);
    }

    // Download raw file bytes from the sandbox filesystem
    async downloadFile(sandboxId: string, filePath: string): Promise<Buffer> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        return sandbox.fs.downloadFile(filePath);
    }

    // List files in a directory inside the sandbox (shallow)
    async listFiles(sandboxId: string, dirPath: string): Promise<string[]> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        const fs = createDaytonaFileSystem(sandbox);
        return fs.list(dirPath);
    }

    // List files recursively (for tree building - returns only files, not directories)
    async listFilesRecursive(sandboxId: string, dirPath: string, maxDepth: number): Promise<string[]> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        const fs = createDaytonaFileSystem(sandbox);
        if (!fs.listRecursive) {
            throw new Error('SandboxFileSystem does not support listRecursive');
        }
        return fs.listRecursive(dirPath, maxDepth);
    }

    // Write a file to the sandbox filesystem
    async writeFile(sandboxId: string, filePath: string, content: string): Promise<void> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        const fs = createDaytonaFileSystem(sandbox);
        await fs.writeFile(filePath, content);
    }

    // Create a SandboxFileSystem adapter for workspace operations
    async createFileSystem(sandboxId: string): Promise<SandboxFileSystem> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        return createDaytonaFileSystem(sandbox);
    }

    // Get the raw Sandbox instance for advanced operations
    // Includes TTL-based cache management to prevent memory leaks
    async getSandboxInstance(sandboxId: string): Promise<Sandbox> {
        // Clean stale cache entries periodically
        this.cleanStaleCache();

        const cached = this.sandboxInstances.get(sandboxId);
        if (cached) {
            // Update access time to keep active sandboxes in cache
            cached.cachedAt = Date.now();
            return cached.sandbox;
        }

        const sandbox = await this.client.get(sandboxId);
        this.sandboxInstances.set(sandboxId, { sandbox, cachedAt: Date.now() });
        return sandbox;
    }

    // Remove sandbox instances that haven't been accessed within TTL
    private cleanStaleCache(): void {
        const now = Date.now();
        for (const [sandboxId, entry] of this.sandboxInstances) {
            if (now - entry.cachedAt > CACHE_TTL_MS) {
                this.sandboxInstances.delete(sandboxId);
            }
        }
    }

    async resizeSandbox(sandboxId: string, resources: { cpu?: number; memory?: number; disk?: number }): Promise<void> {
        const sandbox = await this.getSandboxInstance(sandboxId);
        await sandbox.resize(resources);
    }

    // Run an agent in the sandbox via Sessions API
    // Returns async generator of events (backward-compatible one-shot interface)
    async *runAgent(options: RunAgentOptions): AsyncGenerator<RunnerEvent> {
        const { sandboxId, config, prompt, openRouterApiKey, abortSignal } = options;
        const sandbox = await this.getSandboxInstance(sandboxId);

        yield* runAgentInSandbox({
            sandbox,
            config,
            prompt,
            openRouterApiKey,
            abortSignal,
        });
    }

    // Run an agent with bidirectional communication support
    // Returns a handle for sending messages/interrupts mid-execution
    async runAgentBidirectional(options: RunAgentOptions): Promise<RunAgentResult> {
        const { sandboxId, config, prompt, openRouterApiKey, abortSignal } = options;
        const sandbox = await this.getSandboxInstance(sandboxId);

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

        const handle = await createAgentSession(sandbox, envVars, agentOpts);

        // Send initial prompt as plain text to CLI stdin
        await sendMessage(handle, prompt);

        return {
            events: streamEvents(handle, abortSignal),
            async sendMessage(content: string): Promise<void> {
                await sendMessage(handle, content);
            },
            async interrupt(): Promise<void> {
                await sendCommand(handle, { type: 'interrupt' });
            },
            async end(): Promise<void> {
                await sendCommand(handle, { type: 'done' });
            },
        };
    }

    private async getPreviewUrlBase(sandbox: Sandbox): Promise<string> {
        try {
            const previewLink = await sandbox.getPreviewLink(80);
            // Extract base URL pattern (replace port 80 with placeholder)
            return previewLink.url.replace(/\/\/80-/, '//{port}-');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new SandboxPreviewError(sandbox.id, 80, message);
        }
    }

    private mapDaytonaState(state: string | undefined, sandboxId: string): SandboxState {
        if (!state) {
            throw new UnknownSandboxStateError(sandboxId, 'undefined');
        }

        switch (state.toLowerCase()) {
            case 'started':
            case 'running':
                return 'running';
            case 'stopped':
            case 'stopping':
                return 'paused';
            case 'archived':
            case 'archiving':
                return 'paused'; // Treat archived as paused (can be restored)
            case 'deleted':
            case 'deleting':
            case 'error':
                return 'killed';
            default:
                throw new UnknownSandboxStateError(sandboxId, state);
        }
    }

}
