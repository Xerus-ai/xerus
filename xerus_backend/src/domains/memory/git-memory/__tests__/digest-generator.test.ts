// Digest Generator Service Tests
// Tests for generating channel, project, and workspace digests
// Reference: docs/planning/execution/git-memory-system.md (Digest System section)

import { DigestGeneratorService } from '../digest-generator.service';
import type { DigestGeneratorOptions } from '../digest-generator.service';
import { GitMemoryRepository } from '../git-memory.repository';
import type { SandboxCommandExecutor, GitMemoryFileSystem, CommandResult } from '../git-memory.types';

// -----------------------------------------------------------------------------
// In-Memory File System (real implementation, not a mock)
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

    getContent(path: string): string | undefined {
        return this.files.get(path);
    }

    getAllPaths(): string[] {
        return [...this.files.keys(), ...this.directories];
    }
}

// -----------------------------------------------------------------------------
// No-op Git Command Executor
// Digest generator reads/writes files but does not run git commands directly.
// The ListingExecutor extension supports `ls` for directory listing.
// -----------------------------------------------------------------------------

class ListingExecutor implements SandboxCommandExecutor {
    constructor(private readonly fs: InMemoryFileSystem) {}

    async exec(command: string): Promise<CommandResult> {
        // Support ls commands for directory listing
        const lsMatch = command.match(/ls\s+"?([^"]+)"?$/);
        if (lsMatch) {
            const dir = lsMatch[1].replace(/\/$/, '');
            const allPaths = this.fs.getAllPaths();
            const entries = new Set<string>();

            for (const p of allPaths) {
                if (p.startsWith(dir + '/')) {
                    const relative = p.substring(dir.length + 1);
                    const firstSegment = relative.split('/')[0];
                    entries.add(firstSegment);
                }
            }

            return {
                stdout: [...entries].join('\n'),
                stderr: '',
                exitCode: 0,
            };
        }

        return { stdout: '', stderr: '', exitCode: 0 };
    }
}

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

const WORKSPACE_PATH = '/workspace';

function createInfra(): {
    fs: InMemoryFileSystem;
    repo: GitMemoryRepository;
} {
    const fs = new InMemoryFileSystem();
    const executor = new ListingExecutor(fs);
    const repo = new GitMemoryRepository(executor, fs, WORKSPACE_PATH);
    return { fs, repo };
}

function createService(repo: GitMemoryRepository, executor: ListingExecutor): DigestGeneratorService {
    return new DigestGeneratorService(repo, executor);
}

// Helper to write a channel.md with episodic entries
async function writeChannelLog(
    fs: InMemoryFileSystem,
    projectSlug: string,
    channelSlug: string,
    entries: string[]
): Promise<void> {
    const dir = `${WORKSPACE_PATH}/.memory/projects/${projectSlug}/channels/${channelSlug}`;
    await fs.mkdir(dir);
    const content = `## Channel Log\n\n${entries.join('\n')}\n`;
    await fs.writeFile(`${dir}/channel.md`, content);
}

// Helper to write a project.md with episodic entries
async function writeProjectLog(
    fs: InMemoryFileSystem,
    projectSlug: string,
    entries: string[]
): Promise<void> {
    const dir = `${WORKSPACE_PATH}/.memory/projects/${projectSlug}`;
    await fs.mkdir(dir);
    const content = `## Project Log\n\n${entries.join('\n')}\n`;
    await fs.writeFile(`${dir}/project.md`, content);
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('DigestGeneratorService', () => {
    let fs: InMemoryFileSystem;
    let repo: GitMemoryRepository;
    let service: DigestGeneratorService;

    beforeEach(async () => {
        const infra = createInfra();
        fs = infra.fs;
        repo = infra.repo;
        service = createService(repo, new ListingExecutor(fs));
    });

    // -------------------------------------------------------------------------
    // generateChannelDigest
    // -------------------------------------------------------------------------

    describe('generateChannelDigest', () => {
        it('should generate digest from channel.md entries', async () => {
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-01] [seo-agent] Completed keyword gap analysis -> Found 12 targets',
                '- [2025-02-02] [seo-agent] Updated target keyword list -> Added 5, removed 3',
            ]);

            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo'
            );

            expect(digest).toContain('Recent Activity');
            expect(digest).toContain('keyword gap analysis');
            expect(digest).toContain('target keyword list');
        });

        it('should truncate to maxEntriesPerSection', async () => {
            const entries: string[] = [];
            for (let i = 1; i <= 15; i++) {
                entries.push(`- [2025-02-${String(i).padStart(2, '0')}] [agent] Event ${i} -> Outcome ${i}`);
            }
            await writeChannelLog(fs, 'marketing', 'seo', entries);

            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo',
                { maxEntriesPerSection: 5 }
            );

            // Should keep last 5 entries (most recent)
            expect(digest).toContain('Event 15');
            expect(digest).toContain('Event 11');
            // Events 1-10 should not appear (only 11-15 kept)
            expect(digest).not.toContain('Event 10 ');
            expect(digest).not.toContain('Event 1 ');
        });

        it('should include timestamps when enabled', async () => {
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-01] [seo-agent] Did something -> Result',
            ]);

            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo',
                { includeTimestamps: true }
            );

            expect(digest).toContain('2025-02-01');
        });

        it('should return empty digest when channel has no entries', async () => {
            const dir = `${WORKSPACE_PATH}/.memory/projects/marketing/channels/seo`;
            await fs.mkdir(dir);

            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo'
            );

            expect(digest).toContain('No recent activity');
        });

        it('should return empty digest when channel directory does not exist', async () => {
            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'nonexistent'
            );

            expect(digest).toContain('No recent activity');
        });

        it('should write digest to correct location', async () => {
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-01] [seo-agent] Activity -> Result',
            ]);

            await service.generateChannelDigest('test-workspace', 'marketing', 'seo');

            const digestContent = fs.getContent(
                `${WORKSPACE_PATH}/.memory/projects/marketing/channels/seo/digest.md`
            );
            expect(digestContent).toBeDefined();
            expect(digestContent).toContain('Activity');
        });
    });

    // -------------------------------------------------------------------------
    // generateProjectDigest
    // -------------------------------------------------------------------------

    describe('generateProjectDigest', () => {
        it('should aggregate channel digests into project digest', async () => {
            // Create two channels with content
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-01] [seo-agent] Found 12 target keywords -> Strategy updated',
            ]);
            await writeChannelLog(fs, 'marketing', 'content', [
                '- [2025-02-01] [content-agent] Published 2 blog posts -> Traffic increased',
            ]);

            // Generate channel digests first
            await service.generateChannelDigest('test-workspace', 'marketing', 'seo');
            await service.generateChannelDigest('test-workspace', 'marketing', 'content');

            // Generate project digest
            const digest = await service.generateProjectDigest('test-workspace', 'marketing');

            expect(digest).toContain('seo');
            expect(digest).toContain('content');
        });

        it('should include project.md entries', async () => {
            await writeProjectLog(fs, 'marketing', [
                '- [2025-02-01] [seo-agent] Completed competitor analysis -> Identified 3 gaps',
            ]);

            const digest = await service.generateProjectDigest('test-workspace', 'marketing');

            expect(digest).toContain('competitor analysis');
        });

        it('should truncate entries per channel section', async () => {
            const entries: string[] = [];
            for (let i = 1; i <= 15; i++) {
                entries.push(`- [2025-02-${String(i).padStart(2, '0')}] [agent] Event ${i} -> Outcome ${i}`);
            }
            await writeChannelLog(fs, 'marketing', 'seo', entries);
            await service.generateChannelDigest('test-workspace', 'marketing', 'seo');

            const digest = await service.generateProjectDigest(
                'test-workspace',
                'marketing',
                { maxEntriesPerSection: 3 }
            );

            // Should have limited entries per section
            const lines = digest.split('\n').filter((l) => l.startsWith('- '));
            expect(lines.length).toBeLessThanOrEqual(10);
        });

        it('should return empty digest when project has no channels', async () => {
            const dir = `${WORKSPACE_PATH}/.memory/projects/marketing`;
            await fs.mkdir(dir);

            const digest = await service.generateProjectDigest('test-workspace', 'marketing');

            expect(digest).toContain('No recent activity');
        });

        it('should write digest to correct location', async () => {
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-01] [seo-agent] Activity -> Result',
            ]);
            await service.generateChannelDigest('test-workspace', 'marketing', 'seo');

            await service.generateProjectDigest('test-workspace', 'marketing');

            const digestContent = fs.getContent(
                `${WORKSPACE_PATH}/.memory/projects/marketing/digest.md`
            );
            expect(digestContent).toBeDefined();
        });
    });

    // -------------------------------------------------------------------------
    // generateWorkspaceDigest
    // -------------------------------------------------------------------------

    describe('generateWorkspaceDigest', () => {
        it('should aggregate project digests into workspace digest', async () => {
            // Setup two projects with channels
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-01] [seo-agent] SEO keyword strategy updated -> 12 targets',
            ]);
            await writeChannelLog(fs, 'dev', 'backend', [
                '- [2025-02-01] [backend-agent] Shipped v2 auth endpoints -> API live',
            ]);

            await service.generateChannelDigest('test-workspace', 'marketing', 'seo');
            await service.generateChannelDigest('test-workspace', 'dev', 'backend');
            await service.generateProjectDigest('test-workspace', 'marketing');
            await service.generateProjectDigest('test-workspace', 'dev');

            const digest = await service.generateWorkspaceDigest('test-workspace');

            expect(digest).toContain('marketing');
            expect(digest).toContain('dev');
        });

        it('should truncate entries per project section', async () => {
            const entries: string[] = [];
            for (let i = 1; i <= 15; i++) {
                entries.push(`- [2025-02-${String(i).padStart(2, '0')}] [agent] Event ${i} -> Outcome ${i}`);
            }
            await writeChannelLog(fs, 'marketing', 'seo', entries);
            await service.generateChannelDigest('test-workspace', 'marketing', 'seo');
            await service.generateProjectDigest('test-workspace', 'marketing');

            const digest = await service.generateWorkspaceDigest('test-workspace', {
                maxEntriesPerSection: 3,
            });

            const lines = digest.split('\n').filter((l) => l.startsWith('- '));
            expect(lines.length).toBeLessThanOrEqual(10);
        });

        it('should return empty digest when no projects exist', async () => {
            const digest = await service.generateWorkspaceDigest('test-workspace');

            expect(digest).toContain('No recent activity');
        });

        it('should write digest to correct location', async () => {
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-01] [seo-agent] Activity -> Result',
            ]);
            await service.generateChannelDigest('test-workspace', 'marketing', 'seo');
            await service.generateProjectDigest('test-workspace', 'marketing');

            await service.generateWorkspaceDigest('test-workspace');

            const digestContent = fs.getContent(`${WORKSPACE_PATH}/.memory/digest.md`);
            expect(digestContent).toBeDefined();
        });
    });

    // -------------------------------------------------------------------------
    // regenerateAllDigests (background job entry point)
    // -------------------------------------------------------------------------

    describe('regenerateAllDigests', () => {
        it('should regenerate all digests bottom-up', async () => {
            // Setup: two projects, each with channels
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-01] [seo-agent] Found 12 target keywords -> Updated list',
            ]);
            await writeChannelLog(fs, 'marketing', 'content', [
                '- [2025-02-01] [content-agent] Published 2 blog posts -> Indexed',
            ]);
            await writeChannelLog(fs, 'dev', 'backend', [
                '- [2025-02-01] [backend-agent] Shipped v2 auth -> API live',
            ]);

            await service.regenerateAllDigests('test-workspace');

            // Channel digests should exist
            expect(
                fs.getContent(`${WORKSPACE_PATH}/.memory/projects/marketing/channels/seo/digest.md`)
            ).toBeDefined();
            expect(
                fs.getContent(`${WORKSPACE_PATH}/.memory/projects/marketing/channels/content/digest.md`)
            ).toBeDefined();
            expect(
                fs.getContent(`${WORKSPACE_PATH}/.memory/projects/dev/channels/backend/digest.md`)
            ).toBeDefined();

            // Project digests should exist
            expect(
                fs.getContent(`${WORKSPACE_PATH}/.memory/projects/marketing/digest.md`)
            ).toBeDefined();
            expect(
                fs.getContent(`${WORKSPACE_PATH}/.memory/projects/dev/digest.md`)
            ).toBeDefined();

            // Workspace digest should exist
            expect(fs.getContent(`${WORKSPACE_PATH}/.memory/digest.md`)).toBeDefined();
        });

        it('should handle empty workspace gracefully', async () => {
            await service.regenerateAllDigests('test-workspace');

            const digest = fs.getContent(`${WORKSPACE_PATH}/.memory/digest.md`);
            expect(digest).toBeDefined();
            expect(digest).toContain('No recent activity');
        });

        it('should propagate bottom-up: channel -> project -> workspace', async () => {
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-01] [seo-agent] Keywords analyzed -> 12 found',
            ]);

            await service.regenerateAllDigests('test-workspace');

            // Channel digest should contain the entry
            const channelDigest = fs.getContent(
                `${WORKSPACE_PATH}/.memory/projects/marketing/channels/seo/digest.md`
            )!;
            expect(channelDigest).toContain('Keywords analyzed');

            // Project digest should reference the channel
            const projectDigest = fs.getContent(
                `${WORKSPACE_PATH}/.memory/projects/marketing/digest.md`
            )!;
            expect(projectDigest).toContain('seo');

            // Workspace digest should reference the project
            const workspaceDigest = fs.getContent(`${WORKSPACE_PATH}/.memory/digest.md`)!;
            expect(workspaceDigest).toContain('marketing');
        });
    });

    // -------------------------------------------------------------------------
    // Options and defaults
    // -------------------------------------------------------------------------

    describe('options', () => {
        it('should use default maxEntriesPerSection of 10', async () => {
            const entries: string[] = [];
            for (let i = 1; i <= 20; i++) {
                entries.push(`- [2025-02-${String(i).padStart(2, '0')}] [agent] Event ${i} -> Outcome ${i}`);
            }
            await writeChannelLog(fs, 'marketing', 'seo', entries);

            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo'
            );

            // Should contain last 10 entries
            expect(digest).toContain('Event 20');
            expect(digest).toContain('Event 11');
            expect(digest).not.toContain('Event 10');
        });

        it('should respect custom maxEntriesPerSection', async () => {
            const entries: string[] = [];
            for (let i = 1; i <= 10; i++) {
                entries.push(`- [2025-02-${String(i).padStart(2, '0')}] [agent] Event ${i} -> Outcome ${i}`);
            }
            await writeChannelLog(fs, 'marketing', 'seo', entries);

            const options: DigestGeneratorOptions = { maxEntriesPerSection: 3 };
            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo',
                options
            );

            expect(digest).toContain('Event 10');
            expect(digest).toContain('Event 8');
            expect(digest).not.toContain('Event 7');
        });

        it('should include timestamps by default', async () => {
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-14] [seo-agent] Something happened -> Result achieved',
            ]);

            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo'
            );

            expect(digest).toContain('2025-02-14');
        });

        it('should exclude timestamps when includeTimestamps is false', async () => {
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-14] [seo-agent] Something happened -> Result achieved',
            ]);

            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo',
                { includeTimestamps: false }
            );

            expect(digest).not.toContain('2025-02-14');
        });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
        it('should handle channel.md with only header (no entries)', async () => {
            const dir = `${WORKSPACE_PATH}/.memory/projects/marketing/channels/seo`;
            await fs.mkdir(dir);
            await fs.writeFile(`${dir}/channel.md`, '## Channel Log\n\n');

            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo'
            );

            expect(digest).toContain('No recent activity');
        });

        it('should handle malformed entries gracefully', async () => {
            await writeChannelLog(fs, 'marketing', 'seo', [
                'this is not a proper entry',
                '- [2025-02-01] [seo-agent] Valid entry -> Valid result',
                '',
                '## Some random header',
            ]);

            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo'
            );

            expect(digest).toContain('Valid entry');
        });

        it('should handle project with channels but no channel digests yet', async () => {
            // Create channel directory but no digest
            const dir = `${WORKSPACE_PATH}/.memory/projects/marketing/channels/seo`;
            await fs.mkdir(dir);
            await fs.writeFile(`${dir}/channel.md`, '## Channel Log\n\n- [2025-02-01] [agent] Entry -> Result\n');

            // Generate project digest without generating channel digests first
            const digest = await service.generateProjectDigest('test-workspace', 'marketing');

            // Should still work (channel digest will be empty, project.md might be the only source)
            expect(digest).toBeDefined();
        });

        it('should handle multiple entries from different agents in same channel', async () => {
            await writeChannelLog(fs, 'marketing', 'seo', [
                '- [2025-02-01] [seo-agent] Keyword research -> Found 12 targets',
                '- [2025-02-01] [content-agent] Content audit -> Flagged 3 pages',
                '- [2025-02-02] [seo-agent] Link building -> Acquired 5 backlinks',
            ]);

            const digest = await service.generateChannelDigest(
                'test-workspace',
                'marketing',
                'seo'
            );

            expect(digest).toContain('seo-agent');
            expect(digest).toContain('content-agent');
        });
    });
});
