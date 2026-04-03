// Workspace Health Check
// Verifies critical workspace files exist in a sandbox.
// Used by SandboxService.tryResumeSandbox() to detect corrupted workspaces.
// Reference: docs/plans/2026-02-21-workspace-lifecycle-design.md Section 4

import { SANDBOX_CONFIG } from './sandbox.config';
import type { SandboxFileSystem } from '../workspace/workspace.manager';
import { personalizeWorkspace } from '../workspace/workspace-personalizer.service';
import { batchFetchAgentRows, buildScaffoldFilesFromRow, batchFetchHeartbeatFlags } from '../scaffold/scaffold-payload.service';
import type { SandboxDatabase } from './sandbox.service';
import { DEFAULT_SDK_MODEL } from '../../agents/types';

// Critical files that must exist for a workspace to be functional.
// If any are missing, the workspace needs volume restore or reinitialization.
const CRITICAL_FILES = [
    '.git',
    '.claude/settings.json',
    'CLAUDE.md',
    '.xerus/runner/minimal-mcp-server.js',
    'agents/index.json',
] as const;

export interface HealthCheckResult {
    healthy: boolean;
    missingFiles: string[];
    durationMs: number;
}

/**
 * Verify that all critical workspace files exist in the sandbox.
 * Checks all files in parallel for speed (~50ms target).
 */
export async function verifyWorkspaceHealth(
    sandboxFs: SandboxFileSystem,
): Promise<HealthCheckResult> {
    const startTime = Date.now();

    // Check all critical files in parallel
    const checks = CRITICAL_FILES.map(async (relativePath) => {
        const fullPath = `${SANDBOX_CONFIG.workspacePath}/${relativePath}`;
        const exists = await sandboxFs.exists(fullPath);
        return { relativePath, exists };
    });

    const results = await Promise.all(checks);
    const missingFiles = results
        .filter(r => !r.exists)
        .map(r => r.relativePath);

    return {
        healthy: missingFiles.length === 0,
        missingFiles,
        durationMs: Date.now() - startTime,
    };
}

/**
 * Verify workspace health and repair if needed.
 * Checks 4 critical files. If any are missing, re-clones template and personalizes.
 * Then syncs all DB agents into the workspace (scaffolds any missing ones).
 */
export async function ensureWorkspaceIntegrity(
    sandboxFs: SandboxFileSystem,
    userId: string,
    db: SandboxDatabase | undefined,
    cloneWorkspace: () => Promise<void>,
    installRunner?: () => Promise<void>,
): Promise<void> {
    const health = await verifyWorkspaceHealth(sandboxFs);

    if (!health.healthy) {
        console.log(
            `[WorkspaceHealth] Unhealthy workspace: missing ${health.missingFiles.join(', ')} (${health.durationMs}ms)`
        );

        // Re-clone workspace template and personalize
        await cloneWorkspace();
        console.log(`[WorkspaceHealth] Re-cloned workspace template for user ${userId}`);
        if (installRunner) await installRunner();
        const result = await personalizeWorkspace(sandboxFs, { userId });
        console.log(
            `[WorkspaceHealth] Personalized workspace: ${result.createdFiles.length} files`
        );
    }

    // Sync DB agents into workspace (scaffold any missing ones, update index.json)
    if (db) {
        await syncAgentsToWorkspace(sandboxFs, userId, db);
    }
}

/**
 * Query all user agents from DB and scaffold any missing from the workspace.
 * Also updates agents/index.json to reflect all agents.
 */
export async function syncAgentsToWorkspace(
    sandboxFs: SandboxFileSystem,
    userId: string,
    db: SandboxDatabase,
): Promise<void> {
    const result = await db.query<{ id: number; slug: string; name: string; role: string | null }>(
        `SELECT id, slug, slug AS name, 'specialist' AS role
         FROM agent_registry WHERE user_id = $1`,
        [userId],
    );

    if (result.rows.length === 0) return;

    const basePath = SANDBOX_CONFIG.workspacePath;
    let scaffoldedCount = 0;

    // Check all agent configs in parallel (avoids N+1 sequential filesystem calls)
    const existenceChecks = await Promise.all(
        result.rows.map(async (agent) => {
            const configPath = `${basePath}/agents/${agent.slug}/config.json`;
            const exists = await sandboxFs.exists(configPath);
            return { agent, exists };
        }),
    );
    const missingAgents = existenceChecks.filter(c => !c.exists).map(c => c.agent);

    // Scaffold missing agents from DB + templates (batch queries to avoid N+1)
    if (missingAgents.length > 0) {
        const missingIds = missingAgents.map(a => a.id);
        const [agentRows, heartbeatMap] = await Promise.all([
            batchFetchAgentRows(missingIds, { db }),
            batchFetchHeartbeatFlags(missingIds, { db }),
        ]);

        for (const agent of missingAgents) {
            try {
                const row = agentRows.get(agent.id);
                if (!row) {
                    console.warn(`[WorkspaceHealth] Agent ${agent.slug} (ID ${agent.id}) not found in batch query`);
                    continue;
                }

                const hasHeartbeat = heartbeatMap.get(agent.id) ?? false;
                const files = buildScaffoldFilesFromRow(row, agent.slug, [], hasHeartbeat);
                for (const file of files) {
                    const fullPath = `${basePath}/${file.path}`;
                    await sandboxFs.writeFile(fullPath, file.content);
                }
                scaffoldedCount++;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[WorkspaceHealth] Failed to scaffold agent ${agent.slug}: ${msg}`);
            }
        }
    }

    // Fix stale model in ALL agent configs (S3 restore may bring back old values).
    // Scan all agent dirs on disk, not just DB agents — xerus-master and other
    // platform agents come from the workspace template, not agent_registry.
    const agentsDirPath = `${basePath}/agents`;
    let modelFixCount = 0;
    try {
        const agentDirContents = await sandboxFs.list(agentsDirPath);
        const agentDirs = agentDirContents.filter(name => name !== 'index.json');
        for (const slug of agentDirs) {
            const configPath = `${agentsDirPath}/${slug}/config.json`;
            try {
                const raw = await sandboxFs.readFile(configPath);
                const config = JSON.parse(raw) as Record<string, unknown>;
                const currentModel = String(config.model || '');
                // Fix models not in OpenRouter format (must have vendor/ prefix)
                if (currentModel && !currentModel.includes('/')) {
                    config.model = DEFAULT_SDK_MODEL;
                    await sandboxFs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
                    modelFixCount++;
                }
            } catch {
                // Skip agents with unreadable or missing configs
            }
        }
    } catch {
        // agents/ dir might not exist yet
    }
    if (modelFixCount > 0) {
        console.log(`[WorkspaceHealth] Fixed model format in ${modelFixCount} agent config(s) to ${DEFAULT_SDK_MODEL}`);
    }

    // Always update agents/index.json to reflect current DB state
    // (handles both new scaffolds and agents deleted from DB)
    const indexPath = `${basePath}/agents/index.json`;
    const agents: Record<string, { name: string; role: string }> = {};
    for (const agent of result.rows) {
        agents[agent.slug] = { name: agent.name, role: agent.role || 'specialist' };
    }
    if (!agents['xerus-master']) {
        agents['xerus-master'] = { name: 'Xerus Master', role: 'orchestrator' };
    }
    const indexContent = JSON.stringify({ agents, updated_at: new Date().toISOString() }, null, 2);
    await sandboxFs.writeFile(indexPath, indexContent);

    if (scaffoldedCount > 0) {
        console.log(`[WorkspaceHealth] Synced ${scaffoldedCount} agent(s) to workspace, updated agents/index.json`);
    }
}
