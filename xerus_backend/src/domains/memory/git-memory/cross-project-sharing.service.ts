// Cross-Project Memory Sharing Service
// Enables memories to propagate across projects via workspace-level shared files.
// Reference: docs/planning/execution/git-memory-system.md (Phase 6, Cross-Team Features)
//
// Visibility hierarchy:
//   workspace.md                    <- scope: workspace (all agents see)
//     projects/{slug}/project.md    <- scope: project (project agents see)
//       channels/{slug}/channel.md  <- scope: channel (channel agents see)
//         agents/{slug}/*.md        <- scope: agent (private to agent)
//
// Shared files:
//   workspace.md          - Company-wide facts, user preferences
//   shared/integrations.md - Cross-project API keys, service configs
//   shared/policies.md    - Company policies, guidelines
//   digest.md             - Auto-generated workspace overview (rolled up from projects)

import { GitMemoryRepository } from './git-memory.repository';
import type { SandboxCommandExecutor } from './git-memory.types';
import {
    GIT_MEMORY_DIRECTORIES,
    buildProjectPath,
} from './git-memory.types';
import { stripMemoryPrefix, formatDate, listSubdirectories } from './memory-file-writer.helpers';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SharingContext {
    workspaceId: string;
    sourceAgentId: number;
    sourceProjectSlug?: string;
}

export interface ShareableMemory {
    content: string;
    memoryType: 'expertise' | 'patterns';
    targetScope: 'company' | 'project';
}

export interface ShareResult {
    success: boolean;
    filePath: string;
    message?: string;
}

// Shared file paths relative to .memory/
const SHARED_FILE_PATHS = {
    workspace: 'workspace.md',
    digest: 'digest.md',
    integrations: 'shared/integrations.md',
    policies: 'shared/policies.md',
} as const;

// Maximum digest entries per project section
const MAX_DIGEST_ENTRIES_PER_PROJECT = 10;

// -----------------------------------------------------------------------------
// Cross-Project Sharing Service
// -----------------------------------------------------------------------------

export class CrossProjectSharingService {
    private readonly repo: GitMemoryRepository;
    private readonly executor: SandboxCommandExecutor;

    constructor(repo: GitMemoryRepository, executor: SandboxCommandExecutor) {
        this.repo = repo;
        this.executor = executor;
    }

    /**
     * Share a memory to a broader scope (workspace or project).
     * Only semantic and procedural memory types can be shared.
     * Appends to the target file with source attribution.
     */
    async shareMemory(
        context: SharingContext,
        memory: ShareableMemory
    ): Promise<ShareResult> {
        if (!memory.content || memory.content.trim().length === 0) {
            return {
                success: false,
                filePath: '',
                message: 'Cannot share memory with empty content',
            };
        }

        const targetPath = this.resolveTargetPath(memory.targetScope, context.sourceProjectSlug);
        if (targetPath === null) {
            return {
                success: false,
                filePath: '',
                message: 'Cannot share to project scope without sourceProjectSlug in context',
            };
        }

        await this.ensureParentDirectory(targetPath);

        const formattedEntry = this.formatSharedEntry(context, memory);
        await this.appendToSharedFile(targetPath, formattedEntry, memory.targetScope);

        return {
            success: true,
            filePath: targetPath,
        };
    }

    /**
     * Get file paths of memories visible to an agent from broader scopes.
     * Returns paths relative to .memory/ for files that actually exist.
     * Agent can then read these files using the GitMemoryRepository.
     */
    async getSharedMemories(
        _workspaceId: string,
        _agentSlug: string,
        projectSlug?: string
    ): Promise<string[]> {
        const paths: string[] = [];

        // Workspace-level files
        const workspaceFiles = [
            SHARED_FILE_PATHS.workspace,
            SHARED_FILE_PATHS.digest,
            SHARED_FILE_PATHS.integrations,
            SHARED_FILE_PATHS.policies,
        ];

        for (const filePath of workspaceFiles) {
            const exists = await this.repo.fileExists(filePath);
            if (exists) {
                paths.push(filePath);
            }
        }

        // Project-level files
        if (projectSlug) {
            const projectDir = stripMemoryPrefix(buildProjectPath(projectSlug));
            const projectFiles = [
                `${projectDir}/project.md`,
                `${projectDir}/digest.md`,
            ];

            for (const filePath of projectFiles) {
                const exists = await this.repo.fileExists(filePath);
                if (exists) {
                    paths.push(filePath);
                }
            }
        }

        return paths;
    }

    /**
     * Regenerate the workspace digest by rolling up all project digests.
     * Reads each project's digest.md and combines into a single workspace digest.
     * This provides cross-project visibility without agents reading every file.
     */
    async updateWorkspaceDigestWithCrossProjectInsights(
        _workspaceId: string
    ): Promise<void> {
        const projectDigests = await this.collectProjectDigests();
        const digestContent = this.buildWorkspaceDigest(projectDigests);
        await this.repo.writeFile(SHARED_FILE_PATHS.digest, digestContent);
    }

    // -------------------------------------------------------------------------
    // Private Helpers
    // -------------------------------------------------------------------------

    private resolveTargetPath(
        scope: 'company' | 'project',
        projectSlug?: string
    ): string | null {
        if (scope === 'company') {
            return SHARED_FILE_PATHS.workspace;
        }

        if (scope === 'project') {
            if (!projectSlug) {
                return null;
            }
            return `${stripMemoryPrefix(buildProjectPath(projectSlug))}/project.md`;
        }

        return null;
    }

    private formatSharedEntry(
        context: SharingContext,
        memory: ShareableMemory
    ): string {
        const timestamp = formatDate(new Date());
        const source = context.sourceProjectSlug || 'company';
        return `- [${timestamp}] [${source}] [${memory.memoryType}] ${memory.content.trim()}`;
    }

    private async appendToSharedFile(
        relativePath: string,
        entry: string,
        scope: 'company' | 'project'
    ): Promise<void> {
        const exists = await this.repo.fileExists(relativePath);

        if (!exists) {
            const header = scope === 'company'
                ? '## Shared Knowledge'
                : '## Project Knowledge';
            await this.repo.writeFile(relativePath, `${header}\n\n${entry}\n`);
            return;
        }

        const existing = await this.repo.readFile(relativePath);
        await this.repo.writeFile(relativePath, `${existing.trimEnd()}\n${entry}\n`);
    }

    private async ensureParentDirectory(relativePath: string): Promise<void> {
        const lastSlash = relativePath.lastIndexOf('/');
        if (lastSlash > 0) {
            await this.repo.ensureDirectory(relativePath.substring(0, lastSlash));
        }
    }

    /**
     * Collect project digests by listing project directories under .memory/projects/
     * and reading each project's digest.md.
     */
    private async collectProjectDigests(): Promise<Map<string, string>> {
        const digests = new Map<string, string>();

        const projectsDir = stripMemoryPrefix(GIT_MEMORY_DIRECTORIES.projects);
        const projectSlugs = await listSubdirectories(this.repo, this.executor, projectsDir);

        for (const slug of projectSlugs) {
            const digestPath = `${projectsDir}/${slug}/digest.md`;
            const exists = await this.repo.fileExists(digestPath);
            if (exists) {
                const content = await this.repo.readFile(digestPath);
                digests.set(slug, content);
            }
        }

        return digests;
    }

    private buildWorkspaceDigest(projectDigests: Map<string, string>): string {
        const lines: string[] = ['## Workspace Digest', ''];

        if (projectDigests.size === 0) {
            lines.push('No project activity recorded yet.');
            lines.push('');
            return lines.join('\n');
        }

        const timestamp = formatDate(new Date());

        for (const [slug, content] of projectDigests) {
            lines.push(`### ${slug}`);

            const digestLines = content
                .split('\n')
                .filter((line) => line.startsWith('- '))
                .slice(0, MAX_DIGEST_ENTRIES_PER_PROJECT);

            if (digestLines.length > 0) {
                lines.push(...digestLines);
            } else {
                lines.push('- No recent activity');
            }

            lines.push('');
        }

        lines.push(`_Last updated: ${timestamp}_`);
        lines.push('');

        return lines.join('\n');
    }
}
