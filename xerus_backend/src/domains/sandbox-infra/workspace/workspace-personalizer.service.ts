// Workspace Personalizer
// Writes dynamic, user-specific content on top of the cloned xerus-workspace template.
// The template repo (git clone) provides all static files: CLAUDE.md, settings.json,
// hooks, skills, agent soul files, shared resources, marketplace catalog.
// This service only generates content that requires runtime values (userId, session state).
// Idempotent: safe to re-run on existing workspace.
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 5, Section 14

import { WorkspaceManager, SandboxFileSystem } from './workspace.manager';
import { WORKSPACE_DIRECTORIES } from './workspace.types';
const XERUS_MASTER_SLUG = 'xerus-master';
const XERUS_CTO_SLUG = 'xerus-cto';
import { PLATFORM_HOOKS, PLATFORM_PERMISSIONS } from './platform-settings';

export interface WorkspacePersonalizeOptions {
    userId: string;
}

export interface WorkspacePersonalizeResult {
    success: boolean;
    alreadyInitialized: boolean;
    createdFiles: string[];
}

/**
 * Write dynamic content after git clone of xerus-workspace template.
 * Four things require runtime generation:
 *   1. Merge XERUS_USER_ID + XERUS_WORKSPACE_ROOT into .claude/settings.json
 *   2. Inject BROWSER_DATA_DIR and BROWSER_STATE_DIR (derived from workspace root)
 *   3. Seed .memory/agents/{main-agents}/ working.md and expertise.md (session state)
 *   4. Create data/company.db placeholder (real init by SessionStart hook)
 * Everything else comes from the template clone.
 * Idempotent: each step checks before writing.
 */
export async function personalizeWorkspace(
    sandboxFs: SandboxFileSystem,
    options: WorkspacePersonalizeOptions,
    basePath?: string,
): Promise<WorkspacePersonalizeResult> {
    const manager = new WorkspaceManager(sandboxFs, basePath);
    const createdFiles: string[] = [];

    // Detect whether clone already ran (agents dir exists = cloned)
    const info = await manager.getWorkspaceInfo();
    const alreadyInitialized = info.initialized;

    // 1. Merge provider-specific and user-specific env vars into .claude/settings.json
    // Template has path-independent env vars; workspace root + user ID injected at scaffold time
    const settingsPath = `${manager.getBasePath()}/${WORKSPACE_DIRECTORIES.claudeSettings}`;
    if (await sandboxFs.exists(settingsPath)) {
        const raw = await sandboxFs.readFile(settingsPath);
        let existing: { env?: Record<string, string> };
        try {
            existing = JSON.parse(raw) as { env?: Record<string, string> };
        } catch (err) {
            throw new Error(`Failed to parse ${settingsPath}: ${(err as Error).message}`);
        }
        const workspaceRoot = manager.getBasePath();
        existing.env = {
            ...existing.env,
            XERUS_USER_ID: options.userId,
            XERUS_WORKSPACE_ROOT: workspaceRoot,
            BROWSER_DATA_DIR: `${workspaceRoot}/.browser/chromium-data`,
            BROWSER_STATE_DIR: `${workspaceRoot}/.browser/state`,
        };
        // Ensure platform-defined hooks and permissions survive S3 snapshot restore.
        // Old snapshots may have settings.json without hooks (created before hooks were added).
        const full = existing as Record<string, unknown>;
        if (!full.hooks) full.hooks = PLATFORM_HOOKS;
        if (!full.permissions) full.permissions = PLATFORM_PERMISSIONS;
        await sandboxFs.writeFile(settingsPath, JSON.stringify(full, null, 2));
    }

    // 2. Seed main agent memory files (session state, not version-controlled in template)
    for (const agentSlug of [XERUS_MASTER_SLUG, XERUS_CTO_SLUG]) {
        const memoryDir = manager.getAgentMemoryPath(agentSlug);
        await sandboxFs.mkdir(memoryDir);

        const workingMdPath = `${memoryDir}/working.md`;
        if (!(await sandboxFs.exists(workingMdPath))) {
            await sandboxFs.writeFile(workingMdPath, `# Working Context\n\n(session not started)\n`);
            createdFiles.push(workingMdPath);
        }

        const expertiseMdPath = `${memoryDir}/expertise.md`;
        if (!(await sandboxFs.exists(expertiseMdPath))) {
            await sandboxFs.writeFile(expertiseMdPath, `# Expertise\n\nCapabilities and knowledge developed through work.\n`);
            createdFiles.push(expertiseMdPath);
        }
    }

    // 3. Create data/company.db placeholder (SessionStart hook performs real SQLite init)
    const dataDir = `${manager.getBasePath()}/data`;
    await sandboxFs.mkdir(dataDir);
    const companyDbPath = `${dataDir}/company.db`;
    if (!(await sandboxFs.exists(companyDbPath))) {
        await sandboxFs.writeFile(companyDbPath, '');
        createdFiles.push(companyDbPath);
    }

    return {
        success: true,
        alreadyInitialized,
        createdFiles,
    };
}
