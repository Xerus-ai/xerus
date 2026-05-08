// Sandbox Setup
// Workspace initialization steps for new and resumed sandboxes.
// Extracted from SandboxService to keep file sizes under 400 lines.

import { logger } from '../../../utils/logger';
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

const log = logger('SandboxSetup');

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
    log.info('Cloned workspace template', { sandbox_id: sandboxId, duration_ms: result.durationMs });
}

export async function runWorkspacePersonalize(
    sandboxId: string,
    userId: string,
    deps: SetupDeps,
): Promise<void> {
    const sandboxFs = await deps.getSandboxFs(sandboxId);
    const startTime = Date.now();
    const result = await personalizeWorkspace(sandboxFs, { userId });
    log.info('Personalized workspace', { sandbox_id: sandboxId, files_created: result.createdFiles.length, duration_ms: Date.now() - startTime });
}

export async function runRunnerInstall(
    sandboxId: string,
    deps: SetupDeps,
): Promise<void> {
    const provider = deps.getDaytonaProvider();
    const startTime = Date.now();
    await installRunnerBundle(provider, sandboxId);
    log.info('Runner installed', { sandbox_id: sandboxId, duration_ms: Date.now() - startTime });
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
        log.info('MCP config synced', {
            sandbox_id: sandboxId,
            added: result.added.length,
            added_servers: result.added.join(', ') || 'none',
            removed: result.removed.length,
            removed_servers: result.removed.join(', ') || 'none',
            total: result.total,
        });
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

    // Run schema migrations (init-db.sh) on every resume.
    // S3-restored databases may predate newer schema tables (e.g. file_connections).
    // init-db.sh migrations are idempotent (CREATE TABLE IF NOT EXISTS) so safe to re-run.
    await runDatabaseMigrations(sandboxId, deps);

    // Sync Pipedream MCP servers (connections may have changed while sandbox was paused)
    await runMcpConfigSync(sandboxId, userId, deps);

    // Restart scheduler daemon if not running (sandbox was paused/stopped)
    await startSchedulerDaemon(sandboxId, deps);
}

/**
 * Run init-db.sh to apply schema migrations on workspace databases.
 * Idempotent — uses CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN.
 * Called on both create and resume to handle S3-restored databases that
 * predate newer schema additions (e.g. file_connections, file_tags).
 */
async function runDatabaseMigrations(
    sandboxId: string,
    deps: SetupDeps,
): Promise<void> {
    const provider = deps.getDaytonaProvider();
    const basePath = SANDBOX_CONFIG.workspacePath;
    const initDbScript = `${basePath}/.claude/hooks/scripts/init-db.sh`;

    const result = await provider.executeCommand(
        sandboxId,
        `[ -f '${initDbScript}' ] && XERUS_WORKSPACE_ROOT='${basePath}' bash '${initDbScript}' 2>&1 || echo 'init-db.sh not found'`,
    );

    if (result.exitCode !== 0) {
        log.warn('Database migrations failed', { sandbox_id: sandboxId, output: (result.result || '').slice(-200) });
    }
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

    log.info('Browser setup complete', { sandbox_id: sandboxId, duration_ms: Date.now() - startTime });
    return { novncUrl };
}

export interface SetupReport {
    git_initialized: boolean;
    memory_git_initialized: boolean;
    sqlite_installed: boolean;
    databases_initialized: boolean;
    node_verified: boolean;
    node_version: string;
    bun_verified: boolean;
    bun_version: string;
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
        bun_verified: false,
        bun_version: '',
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
        log.info('Initialized workspace root .git', { sandbox_id: sandboxId });
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
        log.info('Initialized .memory/ git repo', { sandbox_id: sandboxId });
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
        log.info('Installed sqlite3', { sandbox_id: sandboxId });
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
        log.info('Initialized workspace databases', { sandbox_id: sandboxId });
    }

    // 4c. Run workspace.db migrations (idempotent — uses PRAGMA user_version)
    const dbPath = `${basePath}/data/workspace.db`;
    const versionCheck = await provider.executeCommand(
        sandboxId,
        `sqlite3 '${dbPath}' 'PRAGMA user_version' 2>/dev/null || echo '0'`,
    );
    const currentVersion = parseInt((versionCheck.result || '0').trim(), 10) || 0;
    if (currentVersion < 1) {
        const migrationSql = `${basePath}/data/migrations/001-conversations-set-null.sql`;
        const migrationCheck = await provider.executeCommand(
            sandboxId,
            `[ -f '${migrationSql}' ] && sqlite3 '${dbPath}' < '${migrationSql}' 2>&1 || echo 'migration not found'`,
        );
        if (!(migrationCheck.result || '').includes('migration not found')) {
            log.info('Ran workspace migration 001', { sandbox_id: sandboxId });
        }
    }

    // 5. Verify Node.js is available (required by agent runner)
    const nodeCheck = await provider.executeCommand(
        sandboxId,
        `which node 2>/dev/null && node --version && echo FOUND || echo MISSING`,
    );
    const nodeOutput = (nodeCheck.result || '').trim();
    if (nodeOutput.endsWith('MISSING')) {
        // Attempt runtime install as fallback (snapshot may be stale or broken)
        log.warn('Node.js not found, installing via nodesource', { sandbox_id: sandboxId });
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
        log.info('Installed Node.js', { node_version: report.node_version, sandbox_id: sandboxId });
    } else {
        // Extract version from output (e.g., "v22.11.0\nFOUND")
        const versionMatch = nodeOutput.match(/v[\d.]+/);
        report.node_version = versionMatch ? versionMatch[0] : 'unknown';
        report.node_verified = true;
        log.info('Node.js verified', { node_version: report.node_version, sandbox_id: sandboxId });
    }

    // 5b. Verify Bun is available (required by scheduler daemon at step 8).
    // Mirrors the Node.js fallback above — base devcontainer image (Microsoft
    // python:3.14) ships with neither runtime, and the scheduler daemon hard-fails
    // if Bun is missing, so install it at runtime when absent.
    const bunCheck = await provider.executeCommand(
        sandboxId,
        `which bun 2>/dev/null && bun --version && echo FOUND || echo MISSING`,
    );
    const bunOutput = (bunCheck.result || '').trim();
    if (bunOutput.endsWith('MISSING')) {
        log.warn('Bun not found, installing via bun.sh', { sandbox_id: sandboxId });
        // Install to /usr/local so 'which bun' resolves without PATH munging
        const installResult = await provider.executeCommand(
            sandboxId,
            `curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash 2>&1 | tail -5`,
        );
        const verifyResult = await provider.executeCommand(sandboxId, 'bun --version 2>/dev/null');
        const verifyOutput = (verifyResult.result || '').trim();
        if (verifyResult.exitCode !== 0 || !/^\d/.test(verifyOutput)) {
            throw new Error(
                `Bun installation failed in sandbox ${sandboxId}. `
                + `Install output: ${(installResult.result || '').slice(-200)}`,
            );
        }
        report.bun_version = verifyOutput;
        report.bun_verified = true;
        log.info('Installed Bun', { bun_version: report.bun_version, sandbox_id: sandboxId });
    } else {
        const versionMatch = bunOutput.match(/[\d.]+/);
        report.bun_version = versionMatch ? versionMatch[0] : 'unknown';
        report.bun_verified = true;
        log.info('Bun verified', { bun_version: report.bun_version, sandbox_id: sandboxId });
    }

    // 6. Sync DB agents into workspace (scaffold missing ones + update index.json)
    await runAgentSync(sandboxId, userId, deps);

    // 7. Sync Pipedream MCP servers into .mcp.json (connected accounts → MCP entries)
    await runMcpConfigSync(sandboxId, userId, deps);

    // 8. Start scheduler daemon (9to5-style recurring agent automation)
    await startSchedulerDaemon(sandboxId, deps);

    report.duration_ms = Date.now() - startTime;
    log.info('Full workspace setup complete', { sandbox_id: sandboxId, duration_ms: report.duration_ms });
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

    // Check if scheduler script exists (optional — only in cli-native workspaces)
    const fileCheck = await provider.executeCommand(
        sandboxId,
        `[ -f '${schedulerScript}' ] && echo EXISTS || echo MISSING`,
    );
    if ((fileCheck.result || '').trim() === 'MISSING') {
        log.warn('Scheduler script not found — proactive agents will not run', { sandbox_id: sandboxId, path: schedulerScript });
        return;
    }

    // Check if scheduler is already running (idempotent)
    // Use a lock file approach: check PID file AND verify process is alive.
    // Brief sleep after launch to avoid race where PID file isn't written yet.
    const pidCheck = await provider.executeCommand(
        sandboxId,
        `[ -f '${pidFile}' ] && kill -0 $(cat '${pidFile}') 2>/dev/null && echo RUNNING || echo STOPPED`,
    );
    if ((pidCheck.result || '').trim() === 'RUNNING') {
        log.debug('Scheduler already running', { sandbox_id: sandboxId });
        return;
    }

    // Verify bun is available (scheduler requires Bun runtime)
    const bunCheck = await provider.executeCommand(sandboxId, 'which bun 2>/dev/null && echo FOUND || echo MISSING');
    if ((bunCheck.result || '').trim().endsWith('MISSING')) {
        throw new Error(`Bun runtime not found in sandbox ${sandboxId}. Scheduler cannot start.`);
    }

    // Start scheduler daemon in background, then poll for PID file.
    // Bun may need >2s on first run (auto-installs deps from package.json).
    await provider.executeCommand(
        sandboxId,
        `cd '${basePath}' && nohup bun run '${schedulerScript}' >> '${basePath}/.xerus/runner/scheduler.log' 2>&1 &`,
    );

    const checkResult = await provider.executeCommand(
        sandboxId,
        `for i in 1 2 3; do [ -f '${pidFile}' ] && echo STARTED && exit 0; sleep 2; done; echo FAILED`,
    );

    if ((checkResult.result || '').trim() === 'FAILED') {
        throw new Error(`Scheduler daemon failed to start in sandbox ${sandboxId}: PID file not created within 6s`);
    }

    log.info('Scheduler daemon started', { sandbox_id: sandboxId });
}
