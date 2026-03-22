// DRM Compression Service Tests
// Tests for compressing old working.md entries using DRM tier thresholds.
// Reference: docs/planning/execution/git-memory-system.md (DRM Compression Integration)

import { DRMCompressionService } from '../drm-compression.service';
import { GitMemoryRepository } from '../git-memory.repository';
import type {
    SandboxCommandExecutor,
    GitMemoryFileSystem,
    CommandResult,
} from '../git-memory.types';
import type { LLMClient } from '../memory-extractor.service';
import type { MemoryIndexer, IndexFileOptions } from '../memory-search-index.service';

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
        if (this.files.has(path)) {
            // Lock release writes empty content - treat empty lock files as non-existent
            const content = this.files.get(path)!;
            if (path.endsWith('.commit.lock') && content === '') {
                return false;
            }
            return true;
        }
        return this.directories.has(path);
    }

    getContent(path: string): string | undefined {
        return this.files.get(path);
    }

    listDirectory(path: string): string[] {
        const results: Set<string> = new Set();
        const prefix = path.endsWith('/') ? path : path + '/';
        for (const filePath of this.files.keys()) {
            if (filePath.startsWith(prefix)) {
                const rest = filePath.substring(prefix.length);
                const firstSegment = rest.split('/')[0];
                if (firstSegment) {
                    results.add(firstSegment);
                }
            }
        }
        for (const dirPath of this.directories) {
            if (dirPath.startsWith(prefix)) {
                const rest = dirPath.substring(prefix.length);
                const firstSegment = rest.split('/')[0];
                if (firstSegment) {
                    results.add(firstSegment);
                }
            }
        }
        return Array.from(results);
    }
}

// -----------------------------------------------------------------------------
// Tracking Git Command Executor
// -----------------------------------------------------------------------------

class TrackingExecutor implements SandboxCommandExecutor {
    public commands: string[] = [];
    private commitCount = 0;
    private readonly fs: InMemoryFileSystem;

    constructor(fs: InMemoryFileSystem) {
        this.fs = fs;
    }

    async exec(command: string): Promise<CommandResult> {
        this.commands.push(command);

        if (command.includes('status --porcelain')) {
            return { stdout: 'M working.md', stderr: '', exitCode: 0 };
        }
        if (command.includes('diff --cached --name-only')) {
            return { stdout: 'working.md', stderr: '', exitCode: 0 };
        }
        if (command.includes('rev-parse HEAD')) {
            this.commitCount++;
            return { stdout: `abc${this.commitCount}def`, stderr: '', exitCode: 0 };
        }
        // Handle ls for agent discovery
        if (command.includes('ls -1')) {
            const match = command.match(/ls -1 "([^"]+)"/);
            if (match) {
                const path = match[1];
                const entries = this.fs.listDirectory(path);
                return { stdout: entries.join('\n'), stderr: '', exitCode: 0 };
            }
        }
        return { stdout: '', stderr: '', exitCode: 0 };
    }
}

// -----------------------------------------------------------------------------
// Test LLM Client (returns predictable compressed summaries)
// -----------------------------------------------------------------------------

class TestLLMClient implements LLMClient {
    public calls: Array<{ systemPrompt: string; userPrompt: string }> = [];

    async generateJSON<T>(
        systemPrompt: string,
        userPrompt: string,
    ): Promise<T> {
        this.calls.push({ systemPrompt, userPrompt });
        return {
            compressed: 'Compressed summary of multiple entries covering key events and outcomes.',
        } as T;
    }
}

// -----------------------------------------------------------------------------
// Test Search Index Service (tracks indexing calls)
// -----------------------------------------------------------------------------

class TestSearchIndexService {
    public indexedFiles: IndexFileOptions[] = [];

    async indexFile(options: IndexFileOptions): Promise<void> {
        this.indexedFiles.push(options);
    }

    async removeFileChunks(): Promise<number> {
        return 0;
    }

    async indexChangedFiles(): Promise<void> {
        // no-op
    }

    async search(): Promise<never[]> {
        return [];
    }
}

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

const WORKSPACE_PATH = '/workspace';

function createDeps() {
    const fs = new InMemoryFileSystem();
    const executor = new TrackingExecutor(fs);
    const repo = new GitMemoryRepository(executor, fs, WORKSPACE_PATH);
    const llmClient = new TestLLMClient();
    const searchIndex = new TestSearchIndexService();
    const service = new DRMCompressionService(
        repo,
        executor,
        llmClient,
        searchIndex as MemoryIndexer,
    );
    return { fs, executor, repo, llmClient, searchIndex, service };
}

function daysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
}

function buildWorkingContent(entries: Array<{ daysAgo: number; event: string; outcome: string }>): string {
    const lines = entries.map((e) => {
        const date = daysAgo(e.daysAgo);
        return `- [${date}] ${e.event} -> ${e.outcome}`;
    });
    return `## Session Log\n\n${lines.join('\n')}\n`;
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('DRMCompressionService', () => {
    // -------------------------------------------------------------------------
    // compressWorkingMemory
    // -------------------------------------------------------------------------

    describe('compressWorkingMemory', () => {
        it('should return empty results when working.md does not exist', async () => {
            const { fs, service } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/test-agent`);

            const results = await service.compressWorkingMemory({
                workspaceId: 'ws-1',
                agentSlug: 'test-agent',
            });

            expect(results).toEqual([]);
        });

        it('should return empty results when all entries are within lossless threshold', async () => {
            const { fs, service } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/test-agent`);

            const content = buildWorkingContent([
                { daysAgo: 1, event: 'Recent event 1', outcome: 'success' },
                { daysAgo: 3, event: 'Recent event 2', outcome: 'partial' },
                { daysAgo: 5, event: 'Recent event 3', outcome: 'success' },
            ]);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`, content);

            const results = await service.compressWorkingMemory({
                workspaceId: 'ws-1',
                agentSlug: 'test-agent',
            });

            expect(results).toEqual([]);
        });

        it('should compress lossless entries older than 7 days to daily summaries', async () => {
            const { fs, service, llmClient } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/test-agent`);

            const content = buildWorkingContent([
                { daysAgo: 1, event: 'Recent event', outcome: 'success' },
                { daysAgo: 10, event: 'Old event 1', outcome: 'success' },
                { daysAgo: 11, event: 'Old event 2', outcome: 'partial' },
                { daysAgo: 12, event: 'Old event 3', outcome: 'failed' },
            ]);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`, content);

            const results = await service.compressWorkingMemory({
                workspaceId: 'ws-1',
                agentSlug: 'test-agent',
            });

            expect(results.length).toBeGreaterThan(0);
            const dailyResult = results.find((r) => r.tier === 'daily');
            expect(dailyResult).toBeDefined();
            expect(dailyResult!.entriesCompressed).toBe(3);
            expect(llmClient.calls.length).toBeGreaterThan(0);
        });

        it('should preserve recent entries and replace old ones with compressed', async () => {
            const { fs, service } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/test-agent`);

            const content = buildWorkingContent([
                { daysAgo: 1, event: 'Recent event', outcome: 'success' },
                { daysAgo: 10, event: 'Old event', outcome: 'failed' },
            ]);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`, content);

            await service.compressWorkingMemory({
                workspaceId: 'ws-1',
                agentSlug: 'test-agent',
            });

            const updatedContent = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`)!;
            expect(updatedContent).toContain('Recent event');
            expect(updatedContent).not.toContain('Old event');
            expect(updatedContent).toContain('[daily]');
        });

        it('should commit changes with correct message format', async () => {
            const { fs, service, executor } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/test-agent`);
            await fs.mkdir(`${WORKSPACE_PATH}/.memory`);

            const content = buildWorkingContent([
                { daysAgo: 10, event: 'Old event', outcome: 'success' },
            ]);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`, content);

            const results = await service.compressWorkingMemory({
                workspaceId: 'ws-1',
                agentSlug: 'test-agent',
            });

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].commitSha).toBeDefined();

            const commitCommands = executor.commands.filter((c) => c.includes('commit -m'));
            expect(commitCommands.length).toBeGreaterThan(0);
            expect(commitCommands[0]).toContain('drm:test-agent');
            expect(commitCommands[0]).toContain('compress episodic daily');
        });

        it('should re-index the file after compression', async () => {
            const { fs, service, searchIndex } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/test-agent`);

            const content = buildWorkingContent([
                { daysAgo: 10, event: 'Old event', outcome: 'success' },
            ]);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`, content);

            await service.compressWorkingMemory({
                workspaceId: 'ws-1',
                agentSlug: 'test-agent',
            });

            expect(searchIndex.indexedFiles.length).toBeGreaterThan(0);
            expect(searchIndex.indexedFiles[0].filePath).toContain('working.md');
            expect(searchIndex.indexedFiles[0].workspaceId).toBe('ws-1');
            expect(searchIndex.indexedFiles[0].memoryType).toBe('working');
        });

        it('should handle dryRun without writing changes', async () => {
            const { fs, service, executor, searchIndex } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/test-agent`);

            const content = buildWorkingContent([
                { daysAgo: 10, event: 'Old event 1', outcome: 'success' },
                { daysAgo: 15, event: 'Old event 2', outcome: 'partial' },
            ]);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`, content);

            const results = await service.compressWorkingMemory({
                workspaceId: 'ws-1',
                agentSlug: 'test-agent',
                dryRun: true,
            });

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].entriesCompressed).toBe(2);

            // Should NOT have committed
            const commitCommands = executor.commands.filter((c) => c.includes('commit'));
            expect(commitCommands).toHaveLength(0);

            // Should NOT have re-indexed
            expect(searchIndex.indexedFiles).toHaveLength(0);

            // Original content should be unchanged
            const updatedContent = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`)!;
            expect(updatedContent).toContain('Old event 1');
            expect(updatedContent).toContain('Old event 2');
        });

        it('should handle empty working file', async () => {
            const { fs, service } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/test-agent`);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`, '## Session Log\n\n');

            const results = await service.compressWorkingMemory({
                workspaceId: 'ws-1',
                agentSlug: 'test-agent',
            });

            expect(results).toEqual([]);
        });

        it('should track token counts before and after compression', async () => {
            const { fs, service } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/test-agent`);

            const content = buildWorkingContent([
                { daysAgo: 10, event: 'Old event with lots of detail about what happened', outcome: 'success with many findings' },
                { daysAgo: 11, event: 'Another old event with extensive details', outcome: 'partial with caveats' },
            ]);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`, content);

            const results = await service.compressWorkingMemory({
                workspaceId: 'ws-1',
                agentSlug: 'test-agent',
            });

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].originalTokens).toBeGreaterThan(0);
            expect(results[0].compressedTokens).toBeGreaterThan(0);
        });

        it('should delete entries older than monthly retention', async () => {
            const { fs, service } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/test-agent`);

            const content = buildWorkingContent([
                { daysAgo: 1, event: 'Recent', outcome: 'success' },
                { daysAgo: 400, event: 'Very old entry beyond yearly retention', outcome: 'ancient' },
            ]);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`, content);

            await service.compressWorkingMemory({
                workspaceId: 'ws-1',
                agentSlug: 'test-agent',
            });

            const updatedContent = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/test-agent/working.md`)!;
            expect(updatedContent).toContain('Recent');
            expect(updatedContent).not.toContain('Very old entry');
        });
    });

    // -------------------------------------------------------------------------
    // runDRMCompression
    // -------------------------------------------------------------------------

    describe('runDRMCompression', () => {
        it('should compress all agents in workspace', async () => {
            const { fs, service } = createDeps();

            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/agent-a`);
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/agent-b`);

            const oldContent = buildWorkingContent([
                { daysAgo: 10, event: 'Old event', outcome: 'success' },
            ]);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/agent-a/working.md`, oldContent);
            await fs.writeFile(`${WORKSPACE_PATH}/.memory/agents/agent-b/working.md`, oldContent);

            const results = await service.runDRMCompression('ws-1');

            expect(results.size).toBe(2);
            expect(results.has('agent-a')).toBe(true);
            expect(results.has('agent-b')).toBe(true);
        });

        it('should return empty map when no agents directory exists', async () => {
            const { fs, service } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory`);

            const results = await service.runDRMCompression('ws-1');

            expect(results.size).toBe(0);
        });

        it('should skip agents with no working.md', async () => {
            const { fs, service } = createDeps();
            await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/agent-only-working`);
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/agents/agent-only-working/working.md`,
                '## Current State\n\nDoing stuff\n',
            );

            const results = await service.runDRMCompression('ws-1');

            const agentResults = results.get('agent-only-working');
            expect(agentResults === undefined || agentResults.length === 0).toBe(true);
        });
    });

    // -------------------------------------------------------------------------
    // parseEpisodicEntries (static helper)
    // -------------------------------------------------------------------------

    describe('parseEpisodicEntries', () => {
        it('should parse entries with standard format', () => {
            const content = `## Session Log

- [2025-01-15] Completed keyword analysis -> success
- [2025-01-16] Published blog post -> partial
`;
            const entries = DRMCompressionService.parseEpisodicEntries(content);

            expect(entries).toHaveLength(2);
            expect(entries[0].date).toBe('2025-01-15');
            expect(entries[0].text).toBe('Completed keyword analysis -> success');
            expect(entries[0].rawLine).toBe('- [2025-01-15] Completed keyword analysis -> success');
        });

        it('should parse entries with agent tag format', () => {
            const content = `## Project Log

- [2025-01-15] [seo-agent] Found competitor gap -> success
`;
            const entries = DRMCompressionService.parseEpisodicEntries(content);

            expect(entries).toHaveLength(1);
            expect(entries[0].date).toBe('2025-01-15');
        });

        it('should parse compressed summary entries', () => {
            const content = `## Session Log

- [daily] [2025-01-10 to 2025-01-14] Compressed summary of daily activities
- [2025-01-15] Recent event -> success
`;
            const entries = DRMCompressionService.parseEpisodicEntries(content);

            expect(entries).toHaveLength(2);
            expect(entries[0].tier).toBe('daily');
        });

        it('should return empty array for empty content', () => {
            const entries = DRMCompressionService.parseEpisodicEntries('');
            expect(entries).toEqual([]);
        });

        it('should skip non-entry lines', () => {
            const content = `## Session Log

Some header text
- [2025-01-15] Real entry -> success
Just a comment
`;
            const entries = DRMCompressionService.parseEpisodicEntries(content);
            expect(entries).toHaveLength(1);
        });
    });
});
