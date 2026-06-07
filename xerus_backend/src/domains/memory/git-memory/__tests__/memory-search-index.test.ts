// Memory Search Index Service Tests
// Tests for pgvector-based search indexing of .memory/ git files
// Reference: docs/planning/execution/git-memory-system.md (Neon pgvector Search Index)

import {
    MemorySearchIndexService,
    chunkContent,
    computeContentHash,
} from '../memory-search-index.service';
import type {
    EmbeddingClient,
    SearchIndexRepository,
    IndexFileOptions,
    SearchIndexRow,
    SearchOptions,
    SearchResult,
} from '../memory-search-index.service';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestEmbeddingClient(dimensions = 1536): {
    client: EmbeddingClient;
    calls: Array<{ texts: string[] }>;
} {
    const calls: Array<{ texts: string[] }> = [];
    const client: EmbeddingClient = {
        generateEmbeddings: async (texts: string[]): Promise<number[][]> => {
            calls.push({ texts });
            return texts.map(() => Array(dimensions).fill(0.1));
        },
    };
    return { client, calls };
}

function createFailingEmbeddingClient(error: Error): EmbeddingClient {
    return {
        generateEmbeddings: async (): Promise<number[][]> => {
            throw error;
        },
    };
}

function createTestRepository(): {
    repo: SearchIndexRepository;
    upserted: SearchIndexRow[];
    deleted: Array<{ workspaceId: string; filePath: string }>;
    queries: Array<{ workspaceId: string; options: SearchOptions }>;
} {
    const upserted: SearchIndexRow[] = [];
    const deleted: Array<{ workspaceId: string; filePath: string }> = [];
    const queries: Array<{ workspaceId: string; options: SearchOptions }> = [];
    const stored: SearchIndexRow[] = [];

    const repo: SearchIndexRepository = {
        upsertChunks: async (rows: SearchIndexRow[]): Promise<number> => {
            upserted.push(...rows);
            stored.push(...rows);
            return rows.length;
        },
        deleteFileChunks: async (workspaceId: string, filePath: string): Promise<number> => {
            deleted.push({ workspaceId, filePath });
            const beforeCount = stored.length;
            const remaining = stored.filter(
                (r) => !(r.workspace_id === workspaceId && r.file_path === filePath)
            );
            stored.length = 0;
            stored.push(...remaining);
            return beforeCount - stored.length;
        },
        findExistingChunks: async (
            workspaceId: string,
            filePath: string
        ): Promise<Array<{ chunk_start_line: number; content_hash: string }>> => {
            return stored
                .filter((r) => r.workspace_id === workspaceId && r.file_path === filePath)
                .map((r) => ({ chunk_start_line: r.chunk_start_line, content_hash: r.content_hash }));
        },
        hybridSearch: async (
            workspaceId: string,
            _queryEmbedding: number[],
            _queryText: string,
            options: SearchOptions
        ): Promise<SearchResult[]> => {
            queries.push({ workspaceId, options });
            return stored
                .filter((r) => r.workspace_id === workspaceId)
                .slice(0, options.maxResults ?? 6)
                .map((r) => ({
                    id: r.id || 'test-id',
                    file_path: r.file_path,
                    memory_type: r.memory_type,
                    scope: r.scope,
                    chunk_start_line: r.chunk_start_line,
                    chunk_end_line: r.chunk_end_line,
                    content: r.content,
                    score: 0.85,
                    vector_score: 0.9,
                    text_score: 0.7,
                }));
        },
    };

    return { repo, upserted, deleted, queries };
}

function createIndexFileOptions(overrides: Partial<IndexFileOptions> = {}): IndexFileOptions {
    return {
        workspaceId: 'ws-123',
        filePath: 'agents/seo-agent/expertise.md',
        content: 'Line 1: SEO keywords analysis.\nLine 2: Competitor research notes.\nLine 3: Rankings tracker.',
        memoryType: 'expertise',
        scope: 'agent',
        agentSlug: 'seo-agent',
        commitSha: 'abc123def',
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests: chunkContent (pure function)
// -----------------------------------------------------------------------------

describe('chunkContent', () => {
    it('should return a single chunk for short content', () => {
        const content = 'Short content that fits in one chunk.';
        const chunks = chunkContent(content);

        expect(chunks).toHaveLength(1);
        expect(chunks[0].content).toBe(content);
        expect(chunks[0].startLine).toBe(1);
        expect(chunks[0].endLine).toBe(1);
    });

    it('should split content into multiple chunks for long content', () => {
        // Create content that exceeds one chunk (~400 tokens, ~4 chars/token = ~1600 chars)
        const lines: string[] = [];
        for (let i = 0; i < 100; i++) {
            lines.push(`Line ${i + 1}: This is a line of content for testing chunking behavior.`);
        }
        const content = lines.join('\n');
        const chunks = chunkContent(content);

        expect(chunks.length).toBeGreaterThan(1);
    });

    it('should set correct line numbers for each chunk', () => {
        const lines: string[] = [];
        for (let i = 0; i < 100; i++) {
            lines.push(`Line ${i + 1}: Content for testing.`);
        }
        const content = lines.join('\n');
        const chunks = chunkContent(content);

        // First chunk starts at line 1
        expect(chunks[0].startLine).toBe(1);

        // Each chunk's start should be <= previous chunk's end (overlap)
        for (let i = 1; i < chunks.length; i++) {
            expect(chunks[i].startLine).toBeLessThanOrEqual(chunks[i - 1].endLine + 1);
        }

        // Last chunk should end at or near the last line
        const lastChunk = chunks[chunks.length - 1];
        expect(lastChunk.endLine).toBe(lines.length);
    });

    it('should include overlap between consecutive chunks', () => {
        const lines: string[] = [];
        for (let i = 0; i < 200; i++) {
            lines.push(`Line ${i + 1}: This is a test line with enough content to fill chunks.`);
        }
        const content = lines.join('\n');
        const chunks = chunkContent(content);

        if (chunks.length >= 2) {
            // Second chunk should start before or at the first chunk's end (overlap)
            expect(chunks[1].startLine).toBeLessThanOrEqual(chunks[0].endLine);
        }
    });

    it('should not exceed max_chars_per_chunk', () => {
        const lines: string[] = [];
        for (let i = 0; i < 200; i++) {
            lines.push(`Line ${i + 1}: Enough content to verify max char limit is enforced.`);
        }
        const content = lines.join('\n');
        const chunks = chunkContent(content);

        // Default max is 2000 chars per chunk
        for (const chunk of chunks) {
            expect(chunk.content.length).toBeLessThanOrEqual(2000);
        }
    });

    it('should handle empty content', () => {
        const chunks = chunkContent('');
        expect(chunks).toHaveLength(0);
    });

    it('should handle content with only whitespace', () => {
        const chunks = chunkContent('   \n  \n   ');
        expect(chunks).toHaveLength(0);
    });

    it('should handle single-line content', () => {
        const chunks = chunkContent('Single line of text.');
        expect(chunks).toHaveLength(1);
        expect(chunks[0].startLine).toBe(1);
        expect(chunks[0].endLine).toBe(1);
    });
});

// -----------------------------------------------------------------------------
// Tests: computeContentHash (pure function)
// -----------------------------------------------------------------------------

describe('computeContentHash', () => {
    it('should return a hex string', () => {
        const hash = computeContentHash('test content');
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return the same hash for the same content', () => {
        const hash1 = computeContentHash('identical content');
        const hash2 = computeContentHash('identical content');
        expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different content', () => {
        const hash1 = computeContentHash('content A');
        const hash2 = computeContentHash('content B');
        expect(hash1).not.toBe(hash2);
    });
});

// -----------------------------------------------------------------------------
// Tests: MemorySearchIndexService
// -----------------------------------------------------------------------------

describe('MemorySearchIndexService', () => {
    let service: MemorySearchIndexService;
    let embeddingCalls: Array<{ texts: string[] }>;
    let repo: ReturnType<typeof createTestRepository>;

    beforeEach(() => {
        const embedding = createTestEmbeddingClient();
        embeddingCalls = embedding.calls;
        repo = createTestRepository();
        service = new MemorySearchIndexService(embedding.client, repo.repo);
    });

    // -------------------------------------------------------------------------
    // indexFile
    // -------------------------------------------------------------------------

    describe('indexFile', () => {
        it('should chunk content and generate embeddings', async () => {
            const options = createIndexFileOptions();

            await service.indexFile(options);

            expect(embeddingCalls).toHaveLength(1);
            expect(embeddingCalls[0].texts.length).toBeGreaterThan(0);
        });

        it('should upsert chunks into the repository', async () => {
            const options = createIndexFileOptions();

            await service.indexFile(options);

            expect(repo.upserted.length).toBeGreaterThan(0);

            const firstRow = repo.upserted[0];
            expect(firstRow.workspace_id).toBe('ws-123');
            expect(firstRow.file_path).toBe('agents/seo-agent/expertise.md');
            expect(firstRow.memory_type).toBe('expertise');
            expect(firstRow.scope).toBe('agent');
            expect(firstRow.agent_slug).toBe('seo-agent');
            expect(firstRow.commit_sha).toBe('abc123def');
            expect(firstRow.content_hash).toMatch(/^[a-f0-9]{64}$/);
            expect(firstRow.embedding).toHaveLength(1536);
        });

        it('should set correct line numbers on chunks', async () => {
            const options = createIndexFileOptions({
                content: 'Line 1\nLine 2\nLine 3',
            });

            await service.indexFile(options);

            expect(repo.upserted).toHaveLength(1);
            expect(repo.upserted[0].chunk_start_line).toBe(1);
            expect(repo.upserted[0].chunk_end_line).toBe(3);
        });

        it('should pass scope metadata correctly', async () => {
            const options = createIndexFileOptions({
                scope: 'project',
                projectId: 7,
                channelId: undefined,
                agentSlug: undefined,
            });

            await service.indexFile(options);

            const row = repo.upserted[0];
            expect(row.scope).toBe('project');
            expect(row.project_id).toBe(7);
            expect(row.channel_id).toBeUndefined();
            expect(row.agent_slug).toBeUndefined();
        });

        it('should skip indexing when content is empty', async () => {
            const options = createIndexFileOptions({ content: '' });

            await service.indexFile(options);

            expect(embeddingCalls).toHaveLength(0);
            expect(repo.upserted).toHaveLength(0);
        });

        it('should skip unchanged chunks when content_hash matches', async () => {
            const options = createIndexFileOptions({
                content: 'Stable content that does not change.',
            });

            // Index once
            await service.indexFile(options);
            const firstUpsertCount = repo.upserted.length;

            // Reset calls tracking but keep stored data
            embeddingCalls.length = 0;

            // Index same content again
            await service.indexFile(options);

            // Should not generate new embeddings for unchanged chunks
            expect(embeddingCalls).toHaveLength(0);
            // Upserted count should not grow
            expect(repo.upserted.length).toBe(firstUpsertCount);
        });

        it('should propagate embedding client errors', async () => {
            const failingClient = createFailingEmbeddingClient(
                new Error('OpenAI API rate limit exceeded')
            );
            const failService = new MemorySearchIndexService(failingClient, repo.repo);
            const options = createIndexFileOptions();

            await expect(failService.indexFile(options)).rejects.toThrow(
                'OpenAI API rate limit exceeded'
            );
        });

        it('should handle content with channel scope metadata', async () => {
            const options = createIndexFileOptions({
                scope: 'channel',
                projectId: 5,
                channelId: '12',
                agentSlug: undefined,
            });

            await service.indexFile(options);

            const row = repo.upserted[0];
            expect(row.scope).toBe('channel');
            expect(row.project_id).toBe(5);
            expect(row.channel_id).toBe('12');
        });
    });

    // -------------------------------------------------------------------------
    // removeFileChunks
    // -------------------------------------------------------------------------

    describe('removeFileChunks', () => {
        it('should delegate to repository deleteFileChunks', async () => {
            await service.removeFileChunks('ws-123', 'agents/old-agent/working.md');

            expect(repo.deleted).toHaveLength(1);
            expect(repo.deleted[0]).toEqual({
                workspaceId: 'ws-123',
                filePath: 'agents/old-agent/working.md',
            });
        });

        it('should return the count of deleted chunks', async () => {
            // First index some content
            const options = createIndexFileOptions();
            await service.indexFile(options);

            const count = await service.removeFileChunks('ws-123', 'agents/seo-agent/expertise.md');
            expect(count).toBeGreaterThan(0);
        });
    });

    // -------------------------------------------------------------------------
    // indexChangedFiles
    // -------------------------------------------------------------------------

    describe('indexChangedFiles', () => {
        it('should index each changed file', async () => {
            const readFile = async (filePath: string) => ({
                content: `Content of ${filePath}`,
                memoryType: 'expertise' as const,
                scope: 'agent' as const,
            });

            await service.indexChangedFiles('ws-123', ['agents/a/expertise.md', 'agents/b/expertise.md'], readFile);

            // Should have generated embeddings for both files
            expect(embeddingCalls.length).toBeGreaterThanOrEqual(1);
            // Should have upserted chunks for both files
            const filePaths = repo.upserted.map((r) => r.file_path);
            expect(filePaths).toContain('agents/a/expertise.md');
            expect(filePaths).toContain('agents/b/expertise.md');
        });

        it('should skip files that readFile cannot find', async () => {
            const readFile = async (filePath: string) => {
                if (filePath === 'agents/deleted/working.md') {
                    return null;
                }
                return {
                    content: `Content of ${filePath}`,
                    memoryType: 'expertise' as const,
                    scope: 'agent' as const,
                };
            };

            await service.indexChangedFiles(
                'ws-123',
                ['agents/deleted/working.md', 'agents/valid/expertise.md'],
                readFile
            );

            // Only the valid file should be indexed
            expect(repo.upserted.length).toBeGreaterThan(0);
            const filePaths = repo.upserted.map((r) => r.file_path);
            expect(filePaths).not.toContain('agents/deleted/working.md');
            expect(filePaths).toContain('agents/valid/expertise.md');

            // The deleted file should have its chunks removed
            expect(repo.deleted).toEqual(
                expect.arrayContaining([
                    { workspaceId: 'ws-123', filePath: 'agents/deleted/working.md' },
                ])
            );
        });

        it('should handle empty changed files list', async () => {
            const readFile = async () => ({ content: 'x', memoryType: 'expertise' as const, scope: 'agent' as const });

            await service.indexChangedFiles('ws-123', [], readFile);

            expect(embeddingCalls).toHaveLength(0);
            expect(repo.upserted).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------------
    // search (hybrid)
    // -------------------------------------------------------------------------

    describe('search', () => {
        it('should generate embedding for query and call repository', async () => {
            await service.search('ws-123', 'find SEO keywords');

            expect(embeddingCalls).toHaveLength(1);
            expect(embeddingCalls[0].texts).toEqual(['find SEO keywords']);
            expect(repo.queries).toHaveLength(1);
            expect(repo.queries[0].workspaceId).toBe('ws-123');
        });

        it('should pass search options through', async () => {
            await service.search('ws-123', 'test query', {
                maxResults: 10,
                scopes: ['company', 'project'],
                memoryTypes: ['expertise'],
            });

            const passedOptions = repo.queries[0].options;
            expect(passedOptions.maxResults).toBe(10);
            expect(passedOptions.scopes).toEqual(['company', 'project']);
            expect(passedOptions.memoryTypes).toEqual(['expertise']);
        });

        it('should return search results', async () => {
            // Index some content first
            await service.indexFile(createIndexFileOptions());

            const results = await service.search('ws-123', 'SEO analysis');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].file_path).toBe('agents/seo-agent/expertise.md');
            expect(results[0].score).toBeGreaterThan(0);
            expect(typeof results[0].content).toBe('string');
        });
    });
});
