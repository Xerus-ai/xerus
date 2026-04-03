// Sandbox Setup
// Workspace initialization steps for new and resumed sandboxes.
// Extracted from SandboxService to keep file sizes under 400 lines.

import { SANDBOX_CONFIG } from './sandbox.config';
import { cloneWorkspaceTemplate } from './workspace-clone';
import { installRunnerBundle } from './runner-installer';
import { personalizeWorkspace } from '../workspace/workspace-personalizer.service';
import { syncPipedreamMcpConfig } from '../workspace/mcp-config.service';
import { ensureWorkspaceIntegrity, syncAgentsToWorkspace } from './workspace-health';
import { GIT_MEMORY_CONFIG } from '../../memory/git-memory/git-memory.types';
import type { DaytonaProvider } from './providers/daytona.provider';
import type { SandboxFileSystem } from '../workspace/workspace.manager';
import type { SandboxDatabase } from './sandbox.service';

interface SetupDeps {
    getDaytonaProvider: () => DaytonaProvider;
    getSandboxFs: (sandboxId: string) => Promise<SandboxFileSystem>;
    db: SandboxDatabase;
}

export async function runWorkspaceClone(
    sandboxId: string,
    deps: SetupDeps,
): Promise<void> {
    const provider = deps.getDaytonaProvider();
    const result = await cloneWorkspaceTemplate(provider, sandboxId);
    console.log(`[SandboxSetup] Cloned workspace template into ${sandboxId} in ${result.durationMs}ms`);
}

export async function runWorkspacePersonalize(
    sandboxId: string,
    userId: string,
    deps: SetupDeps,
): Promise<void> {
    const sandboxFs = await deps.getSandboxFs(sandboxId);
    const startTime = Date.now();
    const result = await personalizeWorkspace(sandboxFs, { userId });
    console.log(
        `[SandboxSetup] Personalized workspace for ${sandboxId}: ${result.createdFiles.length} files (${Date.now() - startTime}ms)`,
    );
}

export async function runRunnerInstall(
    sandboxId: string,
    deps: SetupDeps,
): Promise<void> {
    const provider = deps.getDaytonaProvider();
    const startTime = Date.now();
    await installRunnerBundle(provider, sandboxId);
    console.log(`[SandboxSetup] Runner installed in ${sandboxId} (${Date.now() - startTime}ms)`);
}

export async function runAgentSync(
    sandboxId: string,
    userId: string,
    deps: SetupDeps,
): Promise<void> {
    const sandboxFs = await deps.getSandboxFs(sandboxId);
    await syncAgentsToWorkspace(sandboxFs, userId, deps.db);
}

/**
 * Sync Pipedream MCP servers into .mcp.json based on user's connected accounts.
 * Adds entries for connected apps, removes entries for disconnected apps.
 * Called at workspace create and resume so agents always have up-to-date MCP tools.
 */
export async function runMcpConfigSync(
    sandboxId: string,
    userId: string,
    deps: SetupDeps,
): Promise<void> {
    const sandboxFs = await deps.getSandboxFs(sandboxId);
    const mcpJsonPath = `${SANDBOX_CONFIG.workspacePath}/.mcp.json`;
    const result = await syncPipedreamMcpConfig(sandboxFs, mcpJsonPath, userId, deps.db);
    if (result.added.length > 0 || result.removed.length > 0) {
        console.log(
            `[SandboxSetup] MCP config synced for ${sandboxId}: `
            + `+${result.added.length} (${result.added.join(', ') || 'none'}) `
            + `-${result.removed.length} (${result.removed.join(', ') || 'none'}) `
            + `= ${result.total} Pipedream servers`,
        );
    }
}

export async function runWorkspaceHealthCheck(
    sandboxId: string,
    userId: string,
    deps: SetupDeps,
): Promise<void> {
    const sandboxFs = await deps.getSandboxFs(sandboxId);

    const cloneWorkspace = async (): Promise<void> => {
        await runWorkspaceClone(sandboxId, deps);
    };
    const installRunner = async (): Promise<void> => {
        await runRunnerInstall(sandboxId, deps);
    };

    await ensureWorkspaceIntegrity(sandboxFs, userId, deps.db, cloneWorkspace, installRunner);

    // Sync Pipedream MCP servers (connections may have changed while sandbox was paused)
    await runMcpConfigSync(sandboxId, userId, deps);

    // Restart scheduler daemon if not running (sandbox was paused/stopped)
    await startSchedulerDaemon(sandboxId, deps);
}

export async function runBrowserSetup(
    sandboxId: string,
    deps: SetupDeps,
): Promise<{ novncUrl: string }> {
    const provider = deps.getDaytonaProvider();
    const startTime = Date.now();

    // Skip installBrowserTools — daytona-medium snapshot already has /usr/bin/chromium,
    // and agent-browser install requires network access to download Chrome which may
    // not be available in the sandbox. agent-browser can be installed lazily when
    // an agent actually needs headless automation.

    // Start Xvfb + x11vnc + noVNC (computerUse API) + launch Chromium on DISPLAY=:1
    const novncUrl = await provider.startComputerUse(sandboxId);

    console.log(`[SandboxSetup] Browser setup for ${sandboxId} in ${Date.now() - startTime}ms`);
    return { novncUrl };
}

export interface SetupReport {
    git_initialized: boolean;
    memory_git_initialized: boolean;
    sqlite_installed: boolean;
    databases_initialized: boolean;
    node_verified: boolean;
    node_version: string;
    duration_ms: number;
}

export async function runFullWorkspaceSetup(
    sandboxId: string,
    userId: string,
    deps: SetupDeps,
): Promise<SetupReport> {
    const startTime = Date.now();
    const provider = deps.getDaytonaProvider();
    const basePath = SANDBOX_CONFIG.workspacePath;
    const report: SetupReport = {
        git_initialized: false,
        memory_git_initialized: false,
        sqlite_installed: false,
        databases_initialized: false,
        node_verified: false,
        node_version: '',
        duration_ms: 0,
    };

    // 1a. Initialize workspace root git repo (idempotent).
    // The SDK uses .git as a project root marker to discover .claude/settings.json
    // and .claude/skills/. Without this, shell hooks and skills are invisible
    // to agents running from subdirectory CWDs (e.g. agents/{slug}/, projects/{domain}/channels/{channel}/).
    // workspace-clone.ts deletes .git after cloning the template, so we re-init here.
    const rootGitCheck = await provider.executeCommand(
        sandboxId,
        `test -d '${basePath}/.git' && echo EXISTS || echo MISSING`,
    );
    if ((rootGitCheck.result || '').trim() === 'MISSING') {
        await provider.executeCommand(sandboxId, [
            `git -C '${basePath}' init`,
            `git -C '${basePath}' config user.name '${GIT_MEMORY_CONFIG.userName}'`,
            `git -C '${basePath}' config user.email '${GIT_MEMORY_CONFIG.userEmail}'`,
            `touch '${basePath}/.gitkeep'`,
            `git -C '${basePath}' add -A`,
            `git -C '${basePath}' commit -m 'init: workspace root for SDK project detection'`,
        ].join(' && '));
        report.git_initialized = true;
        console.log(`[SandboxSetup] Initialized workspace root .git in ${sandboxId}`);
    }

    // 1b. Initialize .memory/ git repo (idempotent — skips if .git already exists)
    const memoryGitCheck = await provider.executeCommand(
        sandboxId,
        `test -d '${basePath}/.memory/.git' && echo EXISTS || echo MISSING`,
    );
    if ((memoryGitCheck.result || '').trim() === 'MISSING') {
        const memoryPath = `${basePath}/.memory`;
        await provider.executeCommand(sandboxId, [
            `git -C '${memoryPath}' init`,
            `git -C '${memoryPath}' config user.name '${GIT_MEMORY_CONFIG.userName}'`,
            `git -C '${memoryPath}' config user.email '${GIT_MEMORY_CONFIG.userEmail}'`,
            `touch '${memoryPath}/.gitkeep'`,
            `git -C '${memoryPath}' add -A`,
            `git -C '${memoryPath}' commit -m 'init: initialize memory repository'`,
        ].join(' && '));
        report.memory_git_initialized = true;
        console.log(`[SandboxSetup] Initialized .memory/ git repo in ${sandboxId}`);
    }

    // 2. Create context directories
    const contextDirs = ['context', 'context/memory', 'context/knowledge', 'context/ace', 'context/trigger', 'output'];
    await provider.executeCommand(
        sandboxId,
        `mkdir -p ${contextDirs.map(d => `'${basePath}/${d}'`).join(' ')}`,
    );

    // 3. Ensure shell hook scripts are executable (git clone from Windows may strip +x bits)
    await provider.executeCommand(
        sandboxId,
        `chmod +x '${basePath}'/.claude/hooks/scripts/*.sh 2>/dev/null || true`,
    );

    // 4. Install sqlite3 CLI if missing (required by init-db.sh shell hook for company.db)
    const sqliteCheck = await provider.executeCommand(
        sandboxId,
        `which sqlite3 2>/dev/null && echo FOUND || echo MISSING`,
    );
    if ((sqliteCheck.result || '').trim().endsWith('MISSING')) {
        await provider.executeCommand(
            sandboxId,
            `apt-get update -qq && apt-get install -y -qq sqlite3 2>&1 || (apk add --no-cache sqlite 2>&1 || echo 'WARN: sqlite3 install failed')`,
        );
        report.sqlite_installed = true;
        console.log(`[SandboxSetup] Installed sqlite3 in ${sandboxId}`);
    }

    // 4b. Initialize workspace databases (company.db + workspace.db)
    // Run init-db.sh explicitly since CLI prompts mode may not trigger SessionStart hooks
    const initDbScript = `${basePath}/.claude/hooks/scripts/init-db.sh`;
    const initDbCheck = await provider.executeCommand(
        sandboxId,
        `[ -f '${initDbScript}' ] && XERUS_WORKSPACE_ROOT='${basePath}' bash '${initDbScript}' 2>&1 || echo 'init-db.sh not found or failed'`,
    );
    if (initDbCheck.exitCode === 0 && !(initDbCheck.result || '').includes('not found')) {
        report.databases_initialized = true;
        console.log(`[SandboxSetup] Initialized workspace databases in ${sandboxId}`);
    }

    // 5. Verify Node.js is available (required by agent runner)
    const nodeCheck = await provider.executeCommand(
        sandboxId,
        `which node 2>/dev/null && node --version && echo FOUND || echo MISSING`,
    );
    const nodeOutput = (nodeCheck.result || '').trim();
    if (nodeOutput.endsWith('MISSING')) {
        // Attempt runtime install as fallback (snapshot may be stale or broken)
        console.warn(`[SandboxSetup] Node.js not found in ${sandboxId}, installing via nodesource...`);
        const installResult = await provider.executeCommand(
            sandboxId,
            `curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs 2>&1 | tail -3`,
        );
        // Verify install succeeded
        const verifyResult = await provider.executeCommand(sandboxId, 'node --version 2>/dev/null');
        if (verifyResult.exitCode !== 0 || !(verifyResult.result || '').trim().startsWith('v')) {
            throw new Error(
                `Node.js installation failed in sandbox ${sandboxId}. `
                + `Install output: ${(installResult.result || '').slice(-200)}`,
            );
        }
        report.node_version = (verifyResult.result || '').trim();
        report.node_verified = true;
        console.log(`[SandboxSetup] Installed Node.js ${report.node_version} in ${sandboxId}`);
    } else {
        // Extract version from output (e.g., "v22.11.0\nFOUND")
        const versionMatch = nodeOutput.match(/v[\d.]+/);
        report.node_version = versionMatch ? versionMatch[0] : 'unknown';
        report.node_verified = true;
        console.log(`[SandboxSetup] Node.js ${report.node_version} verified in ${sandboxId}`);
    }

    // 6. Sync DB agents into workspace (scaffold missing ones + update index.json)
    await runAgentSync(sandboxId, userId, deps);

    // 7. Sync Pipedream MCP servers into .mcp.json (connected accounts → MCP entries)
    await runMcpConfigSync(sandboxId, userId, deps);

    // 8. Start scheduler daemon (9to5-style recurring agent automation)
    await startSchedulerDaemon(sandboxId, deps);

    report.duration_ms = Date.now() - startTime;
    console.log(`[SandboxSetup] Full workspace setup for ${sandboxId} in ${report.duration_ms}ms`);
    return report;
}

/**
 * Start the 9to5 scheduler daemon in the sandbox.
 * Polls schedules table every 30s, spawns CLI processes for due automations.
 * Idempotent: checks PID file before starting.
 */
export async function startSchedulerDaemon(
    sandboxId: string,
    deps: SetupDeps,
): Promise<void> {
    const provider = deps.getDaytonaProvider();
    const basePath = SANDBOX_CONFIG.workspacePath;
    const pidFile = `${basePath}/.xerus/runner/scheduler.pid`;
    const schedulerScript = `${basePath}/.xerus/runner/scheduler.ts`;

    // Check if scheduler is already running (idempotent)
    // Use a lock file approach: check PID file AND verify process is alive.
    // Brief sleep after launch to avoid race where PID file isn't written yet.
    const pidCheck = await provider.executeCommand(
        sandboxId,
        `[ -f '${pidFile}' ] && kill -0 $(cat '${pidFile}') 2>/dev/null && echo RUNNING || echo STOPPED`,
    );
    if ((pidCheck.result || '').trim() === 'RUNNING') {
        console.log(`[SandboxSetup] Scheduler already running in ${sandboxId}`);
        return;
    }

    // Verify bun is available (fail-fast — scheduler requires Bun runtime)
    const bunCheck = await provider.executeCommand(sandboxId, 'which bun 2>/dev/null && echo FOUND || echo MISSING');
    if ((bunCheck.result || '').trim().endsWith('MISSING')) {
        throw new Error(`Bun runtime not found in sandbox ${sandboxId}. Scheduler cannot start.`);
    }

    // Start scheduler daemon in background, then verify PID file appears
    const startResult = await provider.executeCommand(
        sandboxId,
        `cd '${basePath}' && nohup bun run '${schedulerScript}' >> '${basePath}/.xerus/runner/scheduler.log' 2>&1 & sleep 2 && [ -f '${pidFile}' ] && echo STARTED || echo FAILED`,
    );

    if (startResult.exitCode !== 0 || (startResult.result || '').trim() === 'FAILED') {
        throw new Error(`Scheduler daemon failed to start in sandbox ${sandboxId}: ${startResult.result}`);
    }

    console.log(`[SandboxSetup] Scheduler daemon started in ${sandboxId}`);
}
