// Cross-Project Memory Sharing Service Tests
// Tests for sharing memories across projects via workspace-level files.
// Reference: docs/planning/execution/git-memory-system.md (Phase 6, Cross-Team Features)

import { CrossProjectSharingService } from '../cross-project-sharing.service';
import type { SharingContext, ShareableMemory } from '../cross-project-sharing.service';
import { GitMemoryRepository } from '../git-memory.repository';
import type { SandboxCommandExecutor, GitMemoryFileSystem, CommandResult } from '../git-memory.types';

// -----------------------------------------------------------------------------
// In-Memory File System (real implementation, same pattern as other tests)
// -----------------------------------------------------------------------------

class InMemoryFileSystem implements GitMemoryFileSystem {
    private files: Map<string, string> = new Map();
    private directories: Set<string> = new Set();

    async mkdir(path: string): Promise<void> {
        this.directories.add(path);
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
            this.directories.add(parts.slice(0, i).join('/'));
        }
    }

    async writeFile(path: string, content: string): Promise<void> {
        this.files.set(path, content);
        // Auto-create parent directories
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
            this.directories.add(parts.slice(0, i).join('/'));
        }
    }

    async readFile(path: string): Promise<string> {
        const content = this.files.get(path);
        if (content === undefined) {
            throw new Error(`File not found: ${path}`);
        }
        return content;
    }

    async exists(path: string): Promise<boolean> {
        return this.files.has(path) || this.directories.has(path);
    }

    async tryExclusiveCreate(path: string, content: string): Promise<boolean> {
        if (this.files.has(path)) return false;
        this.files.set(path, content);
        return true;
    }

    getContent(path: string): string | undefined {
        return this.files.get(path);
    }

    getDirectories(): Set<string> {
        return this.directories;
    }
}

// -----------------------------------------------------------------------------
// Directory-aware executor that simulates `ls` for listing subdirectories
// -----------------------------------------------------------------------------

class DirectoryListingExecutor implements SandboxCommandExecutor {
    private readonly fs: InMemoryFileSystem;

    constructor(fs: InMemoryFileSystem) {
        this.fs = fs;
    }

    async exec(command: string): Promise<CommandResult> {
        const lsMatch = command.match(/ls\s+"?([^"]+)"?$/);
        if (lsMatch) {
            const basePath = lsMatch[1].replace(/\/$/, '');
            const dirs = this.getSubdirectories(basePath);
            return {
                stdout: dirs.join('\n'),
                stderr: '',
                exitCode: 0,
            };
        }

        return { stdout: '', stderr: '', exitCode: 0 };
    }

    private getSubdirectories(basePath: string): string[] {
        const subdirs = new Set<string>();
        const allPaths = [...this.fs.getDirectories()];

        for (const p of allPaths) {
            if (p.startsWith(basePath + '/') && p !== basePath) {
                const relative = p.substring(basePath.length + 1);
                const firstSegment = relative.split('/')[0];
                if (firstSegment) {
                    subdirs.add(firstSegment);
                }
            }
        }

        return Array.from(subdirs).sort();
    }
}

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const WORKSPACE_PATH = '/workspace';
const WORKSPACE_ID = 'ws-123';

function createDeps(fs: InMemoryFileSystem): {
    repo: GitMemoryRepository;
    executor: DirectoryListingExecutor;
} {
    const executor = new DirectoryListingExecutor(fs);
    const repo = new GitMemoryRepository(executor, fs, WORKSPACE_PATH);
    return { repo, executor };
}

function createService(
    repo: GitMemoryRepository,
    executor: SandboxCommandExecutor
): CrossProjectSharingService {
    return new CrossProjectSharingService(repo, executor);
}

const BASE_CONTEXT: SharingContext = {
    workspaceId: WORKSPACE_ID,
    sourceAgentId: 1,
    sourceProjectSlug: 'marketing',
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('CrossProjectSharingService', () => {
    let fs: InMemoryFileSystem;
    let repo: GitMemoryRepository;
    let executor: DirectoryListingExecutor;
    let service: CrossProjectSharingService;

    beforeEach(async () => {
        fs = new InMemoryFileSystem();
        const deps = createDeps(fs);
        repo = deps.repo;
        executor = deps.executor;
        service = createService(repo, executor);
        // Pre-create shared directory
        await fs.mkdir(`${WORKSPACE_PATH}/.memory/shared`);
    });

    // -------------------------------------------------------------------------
    // shareMemory - workspace scope
    // -------------------------------------------------------------------------

    describe('shareMemory - workspace scope', () => {
        it('should write semantic memory to workspace.md', async () => {
            const memory: ShareableMemory = {
                content: 'Company timezone is PST',
                memoryType: 'expertise',
                targetScope: 'company',
            };

            const result = await service.shareMemory(BASE_CONTEXT, memory);

            expect(result.success).toBe(true);
            expect(result.filePath).toBe('workspace.md');
            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`);
            expect(content).toBeDefined();
            expect(content).toContain('Company timezone is PST');
        });

        it('should write procedural memory to workspace.md', async () => {
            const memory: ShareableMemory = {
                content: 'Always use formal tone in client communications',
                memoryType: 'patterns',
                targetScope: 'company',
            };

            const result = await service.shareMemory(BASE_CONTEXT, memory);

            expect(result.success).toBe(true);
            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`)!;
            expect(content).toContain('Always use formal tone');
        });

        it('should append to existing workspace.md content', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/workspace.md`,
                '## Shared Knowledge\n\n- Existing fact\n'
            );

            const memory: ShareableMemory = {
                content: 'New shared insight',
                memoryType: 'expertise',
                targetScope: 'company',
            };

            await service.shareMemory(BASE_CONTEXT, memory);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`)!;
            expect(content).toContain('Existing fact');
            expect(content).toContain('New shared insight');
        });

        it('should include source attribution in shared entries', async () => {
            const memory: ShareableMemory = {
                content: 'Important discovery',
                memoryType: 'expertise',
                targetScope: 'company',
            };

            await service.shareMemory(BASE_CONTEXT, memory);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`)!;
            expect(content).toContain('marketing');
        });
    });

    // -------------------------------------------------------------------------
    // shareMemory - project scope
    // -------------------------------------------------------------------------

    describe('shareMemory - project scope', () => {
        it('should write memory to project.md', async () => {
            const memory: ShareableMemory = {
                content: 'Project uses React for frontend',
                memoryType: 'expertise',
                targetScope: 'project',
            };

            const result = await service.shareMemory(BASE_CONTEXT, memory);

            expect(result.success).toBe(true);
            expect(result.filePath).toContain('projects/marketing/project.md');
            const content = fs.getContent(
                `${WORKSPACE_PATH}/.memory/projects/marketing/project.md`
            );
            expect(content).toBeDefined();
            expect(content).toContain('Project uses React for frontend');
        });

        it('should fail when project scope requested but no project slug provided', async () => {
            const contextNoProject: SharingContext = {
                workspaceId: WORKSPACE_ID,
                sourceAgentId: 1,
            };

            const memory: ShareableMemory = {
                content: 'Some fact',
                memoryType: 'expertise',
                targetScope: 'project',
            };

            const result = await service.shareMemory(contextNoProject, memory);

            expect(result.success).toBe(false);
            expect(result.message).toContain('project');
        });

        it('should create project directory if it does not exist', async () => {
            const memory: ShareableMemory = {
                content: 'Project-level fact',
                memoryType: 'expertise',
                targetScope: 'project',
            };

            await service.shareMemory(BASE_CONTEXT, memory);

            const exists = await fs.exists(`${WORKSPACE_PATH}/.memory/projects/marketing`);
            expect(exists).toBe(true);
        });
    });

    // -------------------------------------------------------------------------
    // shareMemory - validation
    // -------------------------------------------------------------------------

    describe('shareMemory - validation', () => {
        it('should reject empty content', async () => {
            const memory: ShareableMemory = {
                content: '',
                memoryType: 'expertise',
                targetScope: 'company',
            };

            const result = await service.shareMemory(BASE_CONTEXT, memory);

            expect(result.success).toBe(false);
            expect(result.message).toContain('empty');
        });

        it('should reject whitespace-only content', async () => {
            const memory: ShareableMemory = {
                content: '   \n  ',
                memoryType: 'expertise',
                targetScope: 'company',
            };

            const result = await service.shareMemory(BASE_CONTEXT, memory);

            expect(result.success).toBe(false);
        });

        it('should write shared entry for semantic memory', async () => {
            const memory: ShareableMemory = {
                content: 'API rate limit is 100/min',
                memoryType: 'expertise',
                targetScope: 'company',
            };

            await service.shareMemory(BASE_CONTEXT, memory);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`)!;
            expect(content).toContain('API rate limit is 100/min');
        });
    });

    // -------------------------------------------------------------------------
    // getSharedMemories
    // -------------------------------------------------------------------------

    describe('getSharedMemories', () => {
        it('should return workspace.md when it exists', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/workspace.md`,
                '## Shared Knowledge\n\n- Company fact\n'
            );

            const paths = await service.getSharedMemories(WORKSPACE_ID, 'seo-agent');

            expect(paths).toContain('workspace.md');
        });

        it('should return shared/integrations.md when it exists', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/shared/integrations.md`,
                '## Integrations\n\n- Stripe API key configured\n'
            );

            const paths = await service.getSharedMemories(WORKSPACE_ID, 'seo-agent');

            expect(paths).toContain('shared/integrations.md');
        });

        it('should return shared/policies.md when it exists', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/shared/policies.md`,
                '## Policies\n\n- Always use formal tone\n'
            );

            const paths = await service.getSharedMemories(WORKSPACE_ID, 'seo-agent');

            expect(paths).toContain('shared/policies.md');
        });

        it('should return digest.md when it exists', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/digest.md`,
                '## Workspace Digest\n\n- Dev shipped auth\n'
            );

            const paths = await service.getSharedMemories(WORKSPACE_ID, 'seo-agent');

            expect(paths).toContain('digest.md');
        });

        it('should return project-level files when projectSlug provided', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/projects/marketing/project.md`,
                '## Project Knowledge\n\n- Uses SEMrush\n'
            );
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/projects/marketing/digest.md`,
                '## Project Digest\n\n- SEO analysis complete\n'
            );

            const paths = await service.getSharedMemories(WORKSPACE_ID, 'seo-agent', 'marketing');

            expect(paths).toContain('projects/marketing/project.md');
            expect(paths).toContain('projects/marketing/digest.md');
        });

        it('should return empty array when no shared files exist', async () => {
            const paths = await service.getSharedMemories(WORKSPACE_ID, 'seo-agent');

            expect(paths).toEqual([]);
        });

        it('should not return files that do not exist', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/workspace.md`,
                '## Knowledge\n'
            );

            const paths = await service.getSharedMemories(WORKSPACE_ID, 'seo-agent');

            expect(paths).toContain('workspace.md');
            expect(paths).not.toContain('shared/integrations.md');
            expect(paths).not.toContain('shared/policies.md');
        });
    });

    // -------------------------------------------------------------------------
    // updateWorkspaceDigestWithCrossProjectInsights
    // -------------------------------------------------------------------------

    describe('updateWorkspaceDigestWithCrossProjectInsights', () => {
        it('should create workspace digest from project digests', async () => {
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/projects/marketing`);
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/projects/marketing/digest.md`,
                '## Project Digest\n\n- SEO: keyword analysis complete\n- Content: 3 blog posts published\n'
            );
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/projects/engineering`);
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/projects/engineering/digest.md`,
                '## Project Digest\n\n- Auth: v2 endpoints shipped\n- Infra: migrated to new DB\n'
            );

            await service.updateWorkspaceDigestWithCrossProjectInsights(WORKSPACE_ID);

            const digest = fs.getContent(`${WORKSPACE_PATH}/.memory/digest.md`);
            expect(digest).toBeDefined();
            expect(digest).toContain('marketing');
            expect(digest).toContain('engineering');
        });

        it('should overwrite existing workspace digest', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/digest.md`,
                '## Workspace Digest\n\n- Old content\n'
            );
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/projects/dev`);
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/projects/dev/digest.md`,
                '## Project Digest\n\n- New: shipped feature X\n'
            );

            await service.updateWorkspaceDigestWithCrossProjectInsights(WORKSPACE_ID);

            const digest = fs.getContent(`${WORKSPACE_PATH}/.memory/digest.md`)!;
            expect(digest).toContain('dev');
            expect(digest).toContain('shipped feature X');
        });

        it('should write empty digest when no project digests exist', async () => {
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/projects`);

            await service.updateWorkspaceDigestWithCrossProjectInsights(WORKSPACE_ID);

            const digest = fs.getContent(`${WORKSPACE_PATH}/.memory/digest.md`);
            expect(digest).toBeDefined();
            expect(digest).toContain('Workspace Digest');
        });

        it('should handle projects directory not existing', async () => {
            await service.updateWorkspaceDigestWithCrossProjectInsights(WORKSPACE_ID);

            const digest = fs.getContent(`${WORKSPACE_PATH}/.memory/digest.md`);
            expect(digest).toBeDefined();
        });

        it('should list projects from directory structure', async () => {
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/projects/alpha`);
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/projects/alpha/digest.md`,
                '## Project Digest\n\n- Alpha progress: milestone 1 complete\n'
            );
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/projects/beta`);
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/projects/beta/digest.md`,
                '## Project Digest\n\n- Beta progress: design phase\n'
            );

            await service.updateWorkspaceDigestWithCrossProjectInsights(WORKSPACE_ID);

            const digest = fs.getContent(`${WORKSPACE_PATH}/.memory/digest.md`)!;
            expect(digest).toContain('alpha');
            expect(digest).toContain('beta');
        });

        it('should include digest line items from project digests', async () => {
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/projects/marketing`);
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/projects/marketing/digest.md`,
                '## Project Digest\n\n- SEO: keyword analysis complete\n- Content: 3 blog posts published\n'
            );

            await service.updateWorkspaceDigestWithCrossProjectInsights(WORKSPACE_ID);

            const digest = fs.getContent(`${WORKSPACE_PATH}/.memory/digest.md`)!;
            expect(digest).toContain('keyword analysis complete');
            expect(digest).toContain('3 blog posts published');
        });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
        it('should handle multiple shares to same file', async () => {
            const memory1: ShareableMemory = {
                content: 'First shared fact',
                memoryType: 'expertise',
                targetScope: 'company',
            };
            const memory2: ShareableMemory = {
                content: 'Second shared fact',
                memoryType: 'expertise',
                targetScope: 'company',
            };

            await service.shareMemory(BASE_CONTEXT, memory1);
            await service.shareMemory(BASE_CONTEXT, memory2);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`)!;
            expect(content).toContain('First shared fact');
            expect(content).toContain('Second shared fact');
        });

        it('should handle context without sourceProjectSlug for workspace scope', async () => {
            const context: SharingContext = {
                workspaceId: WORKSPACE_ID,
                sourceAgentId: 1,
            };
            const memory: ShareableMemory = {
                content: 'Global fact',
                memoryType: 'expertise',
                targetScope: 'company',
            };

            const result = await service.shareMemory(context, memory);

            expect(result.success).toBe(true);
            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`)!;
            expect(content).toContain('Global fact');
        });

        it('should handle special characters in content', async () => {
            const memory: ShareableMemory = {
                content: 'Price is $100 (20% off) & includes "premium" tier',
                memoryType: 'expertise',
                targetScope: 'company',
            };

            const result = await service.shareMemory(BASE_CONTEXT, memory);

            expect(result.success).toBe(true);
            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`)!;
            expect(content).toContain('Price is $100 (20% off)');
        });

        it('should include memory type tag in formatted entry', async () => {
            const memory: ShareableMemory = {
                content: 'Procedural pattern',
                memoryType: 'patterns',
                targetScope: 'company',
            };

            await service.shareMemory(BASE_CONTEXT, memory);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`)!;
            expect(content).toContain('[patterns]');
        });

        it('should include timestamp in formatted entry', async () => {
            const memory: ShareableMemory = {
                content: 'Timestamped fact',
                memoryType: 'expertise',
                targetScope: 'company',
            };

            await service.shareMemory(BASE_CONTEXT, memory);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`)!;
            // Should have ISO date format [YYYY-MM-DD]
            expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}\]/);
        });
    });
});
