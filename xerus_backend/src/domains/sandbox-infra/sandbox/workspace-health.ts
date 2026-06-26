// Workspace Health Check
// Verifies critical workspace files exist in a sandbox.
// Used by SandboxService.tryResumeSandbox() to detect corrupted workspaces.
// Reference: docs/plans/2026-02-21-workspace-lifecycle-design.md Section 4

import { logger } from '../../../utils/logger';
import { SANDBOX_CONFIG } from './sandbox.config';
import type { SandboxFileSystem } from '../workspace/workspace.manager';
import type { DaytonaProvider } from './providers/daytona.provider';
import { personalizeWorkspace } from '../workspace/workspace-personalizer.service';
import type { SandboxDatabase } from './sandbox.service';
import { DEFAULT_SDK_MODEL } from '../../agents/types';
import { executeWorkspaceQuery } from '../../conversations/workspace-db.helpers';

const log = logger('WorkspaceHealth');

// Agent configs live under either `agents/` or `.claude/agents/`.
// Scan both, with `agents/` taking priority on slug collisions.
const AGENT_CONFIG_DIRS = ['agents', '.claude/agents'] as const;

// Critical files that must exist for a workspace to be functional.
// If any are missing, the workspace needs volume restore or reinitialization.
const CRITICAL_FILES = [
    '.git',
    '.claude/settings.json',
    'CLAUDE.md',
    '.xerus/runner/mcp-server.js',
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
        log.warn('Unhealthy workspace', { missing_files: health.missingFiles.join(', '), duration_ms: health.durationMs });

        // Re-clone workspace template and personalize
        await cloneWorkspace();
        log.info('Re-cloned workspace template', { user_id: userId });
        if (installRunner) await installRunner();
        const result = await personalizeWorkspace(sandboxFs, { userId });
        log.info('Personalized workspace', { files_created: result.createdFiles.length });
    }

    // Seed drive/ starter files once (handles sandboxes created before drive/ existed).
    // Gated behind sentinel to skip ~15 filesystem ops on subsequent resumes.
    const driveSeedPath = `${SANDBOX_CONFIG.workspacePath}/drive/.seeded`;
    if (!(await sandboxFs.exists(driveSeedPath))) {
        await personalizeWorkspace(sandboxFs, { userId });
        try { await sandboxFs.writeFile(driveSeedPath, new Date().toISOString()); } catch { /* best-effort sentinel */ }
    }

    // Sync DB agents into workspace (scaffold any missing ones, update index.json)
    if (db) {
        await syncAgentsToWorkspace(sandboxFs, userId, db);
    }
}

/**
 * Sync agents to workspace.
 *
 * With workspace.db as the source of truth for agent data, this function
 * no longer queries NeonDB agent_registry to scaffold agents.
 * workspace.db is populated by the scaffold-sync-hook on the sandbox.
 *
 * This function now only fixes stale model formats in agent configs
 * (e.g., after S3 restore) and ensures agents/index.json exists.
 */
export async function syncAgentsToWorkspace(
    sandboxFs: SandboxFileSystem,
    _userId: string,
    _db: SandboxDatabase,
    _provider?: DaytonaProvider,
    _sandboxId?: string,
): Promise<void> {
    const basePath = SANDBOX_CONFIG.workspacePath;

    // Fix stale model in ALL agent configs (S3 restore may bring back old values).
    // Scan all agent dirs on disk — agents live under either `agents/` or
    // `.claude/agents/`. xerus-master and other platform agents come from the
    // workspace template. Dedupe by slug, with `agents/` taking priority.
    const agentDirConfigs = new Map<string, string>();
    for (const dir of AGENT_CONFIG_DIRS) {
        const agentsDirPath = `${basePath}/${dir}`;
        try {
            const contents = await sandboxFs.list(agentsDirPath);
            for (const slug of contents) {
                if (slug === 'index.json' || slug === '.gitkeep') continue;
                if (slug.endsWith('.md')) continue;
                if (agentDirConfigs.has(slug)) continue;
                const configPath = `${agentsDirPath}/${slug}/config.json`;
                try {
                    await sandboxFs.readFile(configPath);
                    agentDirConfigs.set(slug, configPath);
                } catch {
                    // No config.json — not a real agent directory
                }
            }
        } catch {
            // This agents dir might not exist yet
        }
    }

    let modelFixCount = 0;
    try {
        for (const configPath of agentDirConfigs.values()) {
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

        // Build agents/index.json from filesystem (workspace.db is source of truth,
        // but index.json is a convenience file for the runner)
        const agents: Record<string, { name: string; role: string }> = {};
        for (const [slug, configPath] of agentDirConfigs) {
            try {
                const raw = await sandboxFs.readFile(configPath);
                const config = JSON.parse(raw) as Record<string, unknown>;
                agents[slug] = {
                    name: (config.name as string) || slug,
                    role: (config.role as string) || 'specialist',
                };
            } catch {
                // config.json already validated in scan phase — skip broken entries
            }
        }
        if (!agents['xerus-master']) {
            agents['xerus-master'] = { name: 'Xerus Master', role: 'orchestrator' };
        }
        const indexPath = `${basePath}/agents/index.json`;
        const indexContent = JSON.stringify({ agents, updated_at: new Date().toISOString() }, null, 2);
        await sandboxFs.writeFile(indexPath, indexContent);

        // Sync agents to workspace.db with correct role and autonomy from config.json.
        // The scaffold-sync-hook only fires on PostToolUse Write, so system agents
        // (xerus-master, xerus-cto) from the template clone are never registered.
        if (_provider && _sandboxId) {
            for (const [slug, configPath] of agentDirConfigs) {
                try {
                    const raw = await sandboxFs.readFile(configPath);
                    const config = JSON.parse(raw) as Record<string, unknown>;
                    const name = String(config.name || slug).replace(/'/g, "''");
                    const role = String(config.role || 'specialist').replace(/'/g, "''");
                    const autonomy = String(config.autonomy_level || 'supervised').replace(/'/g, "''");
                    await executeWorkspaceQuery(
                        _provider, _sandboxId,
                        `INSERT OR REPLACE INTO agents (slug, name, adapter_type, role, autonomy_level, status)
                         VALUES ('${slug}', '${name}', 'claudecode', '${role}', '${autonomy}', 'idle')`,
                    );
                } catch {
                    // Skip agents with unreadable configs
                }
            }
        }
    } catch {
        // agents/ dir might not exist yet
    }
    if (modelFixCount > 0) {
        log.info('Fixed model format in agent configs', { count: modelFixCount, model: DEFAULT_SDK_MODEL });
    }
}
