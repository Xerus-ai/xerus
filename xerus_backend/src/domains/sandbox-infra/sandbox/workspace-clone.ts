// Workspace Clone
// Clones the xerus-workspace template repo into a Daytona sandbox.
// Provides all static workspace files: CLAUDE.md, settings.json, hooks,
// agent soul files, skills, shared resources, and marketplace catalog.
// Reference: docs/planning/execution/daytona-first-workspace.md

import { SANDBOX_CONFIG } from './sandbox.config';
import { GIT_MEMORY_CONFIG } from '../../memory/git-memory/git-memory.types';
import type { DaytonaProvider } from './providers/daytona.provider';

// Only allow well-formed HTTPS git URLs (defense-in-depth against command injection)
const VALID_GIT_URL_PATTERN = /^https:\/\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9_./-]+\.git$/;

export interface WorkspaceCloneResult {
    cloned: boolean;
    durationMs: number;
    branch?: string;
}

/**
 * Clone the xerus-workspace template repo into the sandbox.
 * Uses --recurse-submodules to initialize marketplace submodules.
 * Uses --depth 1 to skip full git history.
 * Deletes .git after clone (workspace is not a persistent repo).
 *
 * Throws on failure (fail-fast). Caller handles retry.
 */
export async function cloneWorkspaceTemplate(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<WorkspaceCloneResult> {
    const startTime = Date.now();
    const basePath = SANDBOX_CONFIG.workspacePath;
    const templateUrl = SANDBOX_CONFIG.workspaceTemplateUrl;
    const branch = SANDBOX_CONFIG.workspaceTemplateBranch;

    if (!VALID_GIT_URL_PATTERN.test(templateUrl)) {
        throw new Error(`Invalid workspace template URL: ${templateUrl}`);
    }

    // Clone into temp dir then move contents (basePath /home/daytona already exists)
    // cp -a preserves hidden files (.claude/, .memory/, .beads/, .xerus/)
    // rm -rf removes both the temp clone and the workspace .git (template history)
    // git init creates a fresh .git so the SDK can detect project root from subdirectory CWDs.
    // Without .git, SDK cannot discover .claude/settings.json (shell hooks) or .claude/skills/.
    const branchFlag = branch ? `-b '${branch}'` : '';
    const cloneCmd = [
        `git clone --recurse-submodules --depth 1 ${branchFlag} '${templateUrl}' /tmp/xerus-workspace-clone`,
        `cp -a /tmp/xerus-workspace-clone/. '${basePath}/'`,
        `rm -rf /tmp/xerus-workspace-clone '${basePath}/.git'`,
        `git -C '${basePath}' init`,
        `git -C '${basePath}' config user.name '${GIT_MEMORY_CONFIG.userName}'`,
        `git -C '${basePath}' config user.email '${GIT_MEMORY_CONFIG.userEmail}'`,
    ].join(' && ');

    const result = await provider.executeCommand(sandboxId, cloneCmd);

    if (result.exitCode !== 0) {
        throw new Error(
            `Workspace clone failed (exit ${result.exitCode}): ${result.result}`,
        );
    }

    return {
        cloned: true,
        durationMs: Date.now() - startTime,
    };
}
