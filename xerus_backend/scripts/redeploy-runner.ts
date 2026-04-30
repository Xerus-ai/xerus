// Redeploy runner bundle to all active Daytona sandboxes
// Builds the runner bundle, then uploads it to every running sandbox.
// Does NOT kill sandboxes — preserves workspace state and active sessions.
//
// Usage: npx ts-node --transpile-only scripts/redeploy-runner.ts
//   or:  npm run redeploy:runner
//
// Options:
//   --skip-build    Skip the bundle build step (use existing dist/runner-bundle/)
//   --sandbox <id>  Redeploy to a specific sandbox only

import { Daytona } from '@daytonaio/sdk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const _root = path.join(__dirname, '..');
const _envLocal = path.join(_root, '.env.local');
dotenv.config({ path: fs.existsSync(_envLocal) ? _envLocal : path.join(_root, '.env') });

const ROOT = path.join(__dirname, '..');
const BUNDLE_DIR = path.join(ROOT, 'dist', 'runner-bundle');
const RUNNER_BUNDLE = path.join(BUNDLE_DIR, 'agent-runner.js');
const MCP_BUNDLE = path.join(BUNDLE_DIR, 'platform-mcp-server.js');
const RUNNER_DIR = '/home/daytona/.xerus/runner';

interface RedeployResult {
    sandboxId: string;
    success: boolean;
    error?: string;
}

function parseArgs(): { skipBuild: boolean; sandboxId?: string } {
    const args = process.argv.slice(2);
    const skipBuild = args.includes('--skip-build');
    const sandboxIdx = args.indexOf('--sandbox');
    const sandboxId = sandboxIdx !== -1 ? args[sandboxIdx + 1] : undefined;
    return { skipBuild, sandboxId };
}

async function buildBundle(): Promise<void> {
    console.log('[redeploy] Building runner bundle...');
    execSync('npx ts-node --transpile-only scripts/bundle-runner.ts', {
        cwd: ROOT,
        stdio: 'inherit',
    });
    console.log('[redeploy] Bundle built.');
}

async function uploadBundle(client: Daytona, sandboxId: string): Promise<void> {
    const sandbox = await client.get(sandboxId);

    if ((sandbox as unknown as { state: string }).state !== 'started') {
        console.log(`[redeploy] Sandbox ${sandboxId} is ${(sandbox as unknown as { state: string }).state}, starting...`);
        await client.start(sandbox);
    }

    // Ensure runner directory exists
    const mkdirResult = await sandbox.process.executeCommand(`mkdir -p ${RUNNER_DIR}`);
    if (mkdirResult.exitCode !== 0) {
        throw new Error(`mkdir failed: ${mkdirResult.result}`);
    }

    // Upload agent-runner.js
    const runnerContent = fs.readFileSync(RUNNER_BUNDLE);
    await sandbox.fs.uploadFile(runnerContent, `${RUNNER_DIR}/agent-runner.js`);
    console.log(`[redeploy]   Uploaded agent-runner.js`);

    // Upload platform-mcp-server.js (if exists)
    if (fs.existsSync(MCP_BUNDLE)) {
        const mcpContent = fs.readFileSync(MCP_BUNDLE);
        await sandbox.fs.uploadFile(mcpContent, `${RUNNER_DIR}/platform-mcp-server.js`);
        console.log(`[redeploy]   Uploaded platform-mcp-server.js`);
    }
}

async function main(): Promise<void> {
    const { skipBuild, sandboxId } = parseArgs();

    // Step 1: Build bundle
    if (!skipBuild) {
        await buildBundle();
    } else {
        console.log('[redeploy] Skipping build (--skip-build)');
    }

    // Verify bundle exists
    if (!fs.existsSync(RUNNER_BUNDLE)) {
        console.error(`[redeploy] Bundle not found: ${RUNNER_BUNDLE}`);
        console.error('[redeploy] Run without --skip-build or run "npm run build:runner" first.');
        process.exit(1);
    }

    // Step 2: Connect to Daytona
    const apiKey = process.env.DAYTONA_API_KEY;
    const apiUrl = process.env.DAYTONA_API_URL;
    if (!apiKey) {
        console.error('[redeploy] DAYTONA_API_KEY not set in environment');
        process.exit(1);
    }
    if (!apiUrl) {
        console.error('[redeploy] DAYTONA_API_URL not set in environment');
        process.exit(1);
    }

    const client = new Daytona({ apiKey, apiUrl });

    // Step 3: Get target sandboxes
    let sandboxIds: string[];
    if (sandboxId) {
        sandboxIds = [sandboxId];
        console.log(`[redeploy] Targeting sandbox: ${sandboxId}`);
    } else {
        const result = await client.list();
        sandboxIds = result.items
            .filter((s: { state?: string }) => s.state === 'started' || s.state === 'stopped')
            .map((s: { id: string }) => s.id);
        console.log(`[redeploy] Found ${sandboxIds.length} sandbox(es) to redeploy`);
    }

    if (sandboxIds.length === 0) {
        console.log('[redeploy] No sandboxes to redeploy.');
        return;
    }

    // Step 4: Upload to each sandbox
    const results: RedeployResult[] = [];
    for (const id of sandboxIds) {
        console.log(`[redeploy] Deploying to ${id}...`);
        try {
            await uploadBundle(client, id);
            results.push({ sandboxId: id, success: true });
            console.log(`[redeploy]   Done.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            results.push({ sandboxId: id, success: false, error: message });
            console.error(`[redeploy]   FAILED: ${message}`);
        }
    }

    // Step 5: Summary
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`\n[redeploy] Complete: ${succeeded} succeeded, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('[redeploy] Fatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
});
