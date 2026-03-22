// Runner Installer
// Uploads the pre-built runner bundle to a Daytona sandbox at .xerus/runner/
//
// Two modes:
// 1. Custom snapshot (xerus-sandbox): deps pre-installed, only upload bundle
// 2. Generic snapshot (daytona-medium): upload bundle + package.json + npm install
//
// Called during sandbox creation, after workspace initialization.
// Bundle is ALWAYS uploaded (ensures latest code). npm install is skipped if
// node_modules already exists (deps don't change often).

import fs from 'fs';
import path from 'path';
import { SANDBOX_CONFIG } from './sandbox.config';
import type { DaytonaProvider } from './providers/daytona.provider';

const BUNDLE_DIR = path.join(__dirname, '..', '..', '..', '..', 'dist', 'runner-bundle');
const RUNNER_BUNDLE_PATH = path.join(BUNDLE_DIR, 'agent-runner.js');
const PLATFORM_MCP_BUNDLE_PATH = path.join(BUNDLE_DIR, 'platform-mcp-server.js');

// Snapshot names where runner deps are pre-installed via Dockerfile
const PREINSTALLED_SNAPSHOTS = new Set(['xerus-sandbox']);

// package.json for runner dependencies (used only with generic snapshots)
const RUNNER_PACKAGE_JSON = {
    name: 'xerus-runner',
    version: '1.0.0',
    private: true,
    dependencies: {
        '@anthropic-ai/claude-agent-sdk': '^0.2.37',
        '@modelcontextprotocol/sdk': '^1.26.0',
    },
};

export interface RunnerInstallResult {
    depsPreinstalled: boolean;
    npmInstallOutput?: string;
}

/**
 * Install the runner bundle in a sandbox.
 *
 * Bundle JS files are ALWAYS uploaded to ensure the sandbox runs the latest
 * version (volume restore may place stale bundles before this runs).
 *
 * npm install is skipped if node_modules already exists (deps change rarely).
 * For custom Xerus snapshots, deps are pre-installed via Dockerfile.
 */
export async function installRunnerBundle(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<RunnerInstallResult> {
    const runnerDir = SANDBOX_CONFIG.runnerDir;
    const snapshot = SANDBOX_CONFIG.snapshot;
    const depsPreinstalled = PREINSTALLED_SNAPSHOTS.has(snapshot);

    // Read the pre-built bundles from disk
    if (!fs.existsSync(RUNNER_BUNDLE_PATH)) {
        throw new Error(
            `Runner bundle not found at ${RUNNER_BUNDLE_PATH}. Run 'npm run build:runner' first.`,
        );
    }
    const bundleContent = fs.readFileSync(RUNNER_BUNDLE_PATH, 'utf-8');

    // Always upload bundle (overwrite any stale version from snapshot)
    const sandboxFs = await provider.createFileSystem(sandboxId);
    await sandboxFs.mkdir(runnerDir);
    await sandboxFs.writeFile(SANDBOX_CONFIG.runnerScriptPath, bundleContent);

    // Upload platform MCP server bundle (used by Xerus master agent)
    if (fs.existsSync(PLATFORM_MCP_BUNDLE_PATH)) {
        const mcpContent = fs.readFileSync(PLATFORM_MCP_BUNDLE_PATH, 'utf-8');
        await sandboxFs.writeFile(`${runnerDir}/platform-mcp-server.js`, mcpContent);
    }

    // Verify node_modules exists for pre-installed snapshots.
    // If snapshot is broken (e.g., Dockerfile build failed), deps won't be there.
    if (depsPreinstalled) {
        const nodeModulesExists = await sandboxFs.exists(`${runnerDir}/node_modules`);
        if (!nodeModulesExists) {
            console.warn(`[RunnerInstaller] Snapshot '${snapshot}' claims pre-installed deps but node_modules missing. Falling back to npm install.`);
        } else {
            return { depsPreinstalled: true };
        }
    }

    // Generic snapshot: skip npm install if node_modules already exists
    const nodeModulesExists = await sandboxFs.exists(`${runnerDir}/node_modules`);
    if (nodeModulesExists) {
        return { depsPreinstalled: false };
    }

    // Write package.json and run npm install
    await sandboxFs.writeFile(
        `${runnerDir}/package.json`,
        JSON.stringify(RUNNER_PACKAGE_JSON, null, 2) + '\n',
    );

    const npmResult = await provider.executeCommand(
        sandboxId,
        `cd ${runnerDir} && npm install --production --no-audit --no-fund 2>&1`,
    );

    if (npmResult.exitCode !== 0) {
        throw new Error(`npm install failed in sandbox runner: ${npmResult.result}`);
    }

    return {
        depsPreinstalled: false,
        npmInstallOutput: npmResult.result,
    };
}

/**
 * Install browser automation tools in the sandbox (idempotent).
 *
 * Installs:
 * - agent-browser: Vercel's headless browser CLI (ref-based element selection)
 *   npm package: "agent-browser", then "agent-browser install" to download Chromium
 *
 * Skipped if agent-browser binary is already present on PATH.
 */
export async function installBrowserTools(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<void> {
    // Idempotent check: skip if agent-browser is already installed
    const check = await provider.executeCommand(sandboxId, 'which agent-browser 2>/dev/null && echo FOUND || echo MISSING');
    if ((check.result || '').trim().endsWith('FOUND')) {
        return;
    }

    // Install agent-browser globally
    const npmResult = await provider.executeCommand(
        sandboxId,
        'npm install -g agent-browser 2>&1',
    );
    if (npmResult.exitCode !== 0) {
        throw new Error(`agent-browser npm install failed: ${npmResult.result}`);
    }

    // Download Chromium for agent-browser
    const installResult = await provider.executeCommand(
        sandboxId,
        'agent-browser install 2>&1',
    );
    if (installResult.exitCode !== 0) {
        throw new Error(`agent-browser install (Chromium download) failed: ${installResult.result}`);
    }
}

/**
 * Install ttyd web terminal server in the sandbox (idempotent).
 * Downloads the static binary from GitHub releases.
 */
export async function installTerminalServer(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<void> {
    const check = await provider.executeCommand(sandboxId, '(which ttyd 2>/dev/null || test -x $HOME/.local/bin/ttyd) && echo FOUND || echo MISSING');
    if ((check.result || '').trim().endsWith('FOUND')) {
        return;
    }

    const installResult = await provider.executeCommand(
        sandboxId,
        'mkdir -p $HOME/.local/bin && curl --fail -Lo $HOME/.local/bin/ttyd https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.x86_64 2>&1 && chmod +x $HOME/.local/bin/ttyd',
    );
    if (installResult.exitCode !== 0) {
        throw new Error(`ttyd install failed: ${installResult.result}`);
    }
}
