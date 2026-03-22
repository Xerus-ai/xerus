// Memory Search Service Tests
// Tests for tiered search: digest -> grep -> pgvector
// Reference: docs/planning/execution/git-memory-system.md (Phase 4, Search Flow)

import { MemorySearchService } from '../memory-search.service';
import type {
    SearchContext,
    TieredSearchOptions,
    SearchResultItem,
    DigestReader,
    GrepSearcher,
    VectorSearcher,
} from '../memory-search.service';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createSearchContext(overrides: Partial<SearchContext> = {}): SearchContext {
    return {
        workspaceId: 'ws-test-123',
        agentId: 42,
        agentSlug: 'seo-agent',
        ...overrides,
    };
}

function createSearchOptions(overrides: Partial<TieredSearchOptions> = {}): TieredSearchOptions {
    return {
        query: 'find SEO keywords',
        ...overrides,
    };
}

function createDigestReader(
    results: SearchResultItem[] = []
): { reader: DigestReader; calls: Array<{ context: SearchContext; query: string }> } {
    const calls: Array<{ context: SearchContext; query: string }> = [];
    const reader: DigestReader = {
        searchDigests: async (context: SearchContext, query: string): Promise<SearchResultItem[]> => {
            calls.push({ context, query });
            return results;
        },
    };
    return { reader, calls };
}

function createGrepSearcher(
    results: SearchResultItem[] = []
): { searcher: GrepSearcher; calls: Array<{ context: SearchContext; query: string }> } {
    const calls: Array<{ context: SearchContext; query: string }> = [];
    const searcher: GrepSearcher = {
        searchGrep: async (context: SearchContext, query: string): Promise<SearchResultItem[]> => {
            calls.push({ context, query });
            return results;
        },
    };
    return { searcher, calls };
}

function createVectorSearcher(
    results: SearchResultItem[] = []
): { searcher: VectorSearcher; calls: Array<{ workspaceId: string; query: string }> } {
    const calls: Array<{ workspaceId: string; query: string }> = [];
    const searcher: VectorSearcher = {
        searchVector: async (workspaceId: string, query: string): Promise<SearchResultItem[]> => {
            calls.push({ workspaceId, query });
            return results;
        },
    };
    return { searcher, calls };
}

function createDigestResult(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
    return {
        filePath: '.memory/digest.md',
        snippet: 'Dev team shipped auth endpoints yesterday',
        score: 0.9,
        tier: 'digest',
        memoryType: 'expertise',
        scope: 'company',
        ...overrides,
    };
}

function createGrepResult(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
    return {
        filePath: '.memory/agents/seo-agent/expertise.md',
        snippet: 'SEO keywords: AI workforce, agent platform',
        score: 0.7,
        tier: 'grep',
        memoryType: 'expertise',
        scope: 'agent',
        ...overrides,
    };
}

function createVectorResult(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
    return {
        filePath: '.memory/agents/seo-agent/working.md',
        snippet: 'Completed keyword research for AI workforce cluster',
        score: 0.85,
        tier: 'vector',
        memoryType: 'working',
        scope: 'agent',
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests: Tiered Search Order
// -----------------------------------------------------------------------------

describe('MemorySearchService', () => {
    describe('search', () => {
        it('should stop at digest tier when digests satisfy maxResults', async () => {
            const digestResults = Array.from({ length: 5 }, (_, i) =>
                createDigestResult({ filePath: `.memory/digest-${i}.md`, score: 0.9 - i * 0.05 })
            );
            const { reader } = createDigestReader(digestResults);
            const { searcher: grepSearcher, calls: grepCalls } = createGrepSearcher();
            const { searcher: vectorSearcher, calls: vectorCalls } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ maxResults: 5 });

            const results = await service.search(context, options);

            expect(results).toHaveLength(5);
            expect(results.every((r) => r.tier === 'digest')).toBe(true);
            // Grep and vector should NOT be called when digests satisfy maxResults
            expect(grepCalls).toHaveLength(0);
            expect(vectorCalls).toHaveLength(0);
        });

        it('should fall through to grep when digests return no results', async () => {
            const { reader } = createDigestReader([]);
            const grepResults = Array.from({ length: 5 }, (_, i) =>
                createGrepResult({ filePath: `.memory/grep-${i}.md`, score: 0.8 - i * 0.05 })
            );
            const { searcher: grepSearcher } = createGrepSearcher(grepResults);
            const { searcher: vectorSearcher, calls: vectorCalls } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ maxResults: 5 });

            const results = await service.search(context, options);

            expect(results).toHaveLength(5);
            expect(results.every((r) => r.tier === 'grep')).toBe(true);
            expect(vectorCalls).toHaveLength(0);
        });

        it('should fall through to vector search when digest and grep return no results', async () => {
            const { reader } = createDigestReader([]);
            const { searcher: grepSearcher } = createGrepSearcher([]);
            const vectorResults = [createVectorResult()];
            const { searcher: vectorSearcher } = createVectorSearcher(vectorResults);

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions();

            const results = await service.search(context, options);

            expect(results).toHaveLength(1);
            expect(results[0].tier).toBe('vector');
        });

        it('should return empty array when all tiers return no results', async () => {
            const { reader } = createDigestReader([]);
            const { searcher: grepSearcher } = createGrepSearcher([]);
            const { searcher: vectorSearcher } = createVectorSearcher([]);

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions();

            const results = await service.search(context, options);

            expect(results).toHaveLength(0);
        });

        it('should combine digest and grep results when combined count satisfies maxResults', async () => {
            const digestResults = [
                createDigestResult({ filePath: '.memory/digest.md', score: 0.95 }),
                createDigestResult({ filePath: '.memory/projects/p1/digest.md', score: 0.9 }),
            ];
            const grepResults = [
                createGrepResult({ filePath: '.memory/agents/seo-agent/expertise.md', score: 0.8 }),
                createGrepResult({ filePath: '.memory/agents/seo-agent/working.md', score: 0.75 }),
                createGrepResult({ filePath: '.memory/projects/marketing/project.md', score: 0.7 }),
            ];
            const { reader } = createDigestReader(digestResults);
            const { searcher: grepSearcher } = createGrepSearcher(grepResults);
            const { searcher: vectorSearcher, calls: vectorCalls } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ maxResults: 5 });

            const results = await service.search(context, options);

            expect(results).toHaveLength(5);
            // Results should be sorted by score descending
            expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
            // Vector should NOT be called since digest + grep >= maxResults
            expect(vectorCalls).toHaveLength(0);
        });

        it('should combine all three tiers when none individually satisfy maxResults', async () => {
            const digestResults = [createDigestResult({ score: 0.95 })];
            const grepResults = [createGrepResult({ score: 0.7 })];
            const vectorResults = [createVectorResult({ score: 0.85 })];
            const { reader } = createDigestReader(digestResults);
            const { searcher: grepSearcher } = createGrepSearcher(grepResults);
            const { searcher: vectorSearcher } = createVectorSearcher(vectorResults);

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ maxResults: 5 });

            const results = await service.search(context, options);

            expect(results).toHaveLength(3);
            // Sorted by score descending
            expect(results[0].score).toBe(0.95);
            expect(results[1].score).toBe(0.85);
            expect(results[2].score).toBe(0.7);
        });

        it('should limit results to maxResults', async () => {
            const digestResults = [
                createDigestResult({ filePath: '.memory/digest.md', score: 0.95 }),
                createDigestResult({ filePath: '.memory/projects/marketing/digest.md', score: 0.9 }),
            ];
            const grepResults = [
                createGrepResult({ score: 0.8 }),
                createGrepResult({ filePath: '.memory/agents/seo-agent/working.md', score: 0.75 }),
            ];
            const { reader } = createDigestReader(digestResults);
            const { searcher: grepSearcher } = createGrepSearcher(grepResults);
            const { searcher: vectorSearcher } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ maxResults: 3 });

            const results = await service.search(context, options);

            expect(results).toHaveLength(3);
        });

        it('should use default maxResults of 5 when not specified', async () => {
            const manyResults = Array.from({ length: 8 }, (_, i) =>
                createDigestResult({ filePath: `.memory/file-${i}.md`, score: 0.9 - i * 0.05 })
            );
            const { reader } = createDigestReader(manyResults);
            const { searcher: grepSearcher } = createGrepSearcher();
            const { searcher: vectorSearcher } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions();

            const results = await service.search(context, options);

            expect(results).toHaveLength(5);
        });
    });

    // -------------------------------------------------------------------------
    // Skip flags
    // -------------------------------------------------------------------------

    describe('skip flags', () => {
        it('should skip digests when skipDigests is true', async () => {
            const { reader, calls: digestCalls } = createDigestReader([createDigestResult()]);
            const grepResults = [createGrepResult()];
            const { searcher: grepSearcher } = createGrepSearcher(grepResults);
            const { searcher: vectorSearcher } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ skipDigests: true });

            const results = await service.search(context, options);

            expect(digestCalls).toHaveLength(0);
            expect(results.every((r) => r.tier !== 'digest')).toBe(true);
        });

        it('should skip grep when skipGrep is true', async () => {
            const { reader } = createDigestReader([]);
            const { searcher: grepSearcher, calls: grepCalls } = createGrepSearcher([createGrepResult()]);
            const vectorResults = [createVectorResult()];
            const { searcher: vectorSearcher } = createVectorSearcher(vectorResults);

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ skipGrep: true });

            const results = await service.search(context, options);

            expect(grepCalls).toHaveLength(0);
            expect(results.every((r) => r.tier !== 'grep')).toBe(true);
        });

        it('should skip vector when skipVector is true', async () => {
            const { reader } = createDigestReader([]);
            const { searcher: grepSearcher } = createGrepSearcher([]);
            const { searcher: vectorSearcher, calls: vectorCalls } = createVectorSearcher([createVectorResult()]);

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ skipVector: true });

            const results = await service.search(context, options);

            expect(vectorCalls).toHaveLength(0);
            expect(results).toHaveLength(0);
        });

        it('should return empty when all tiers are skipped', async () => {
            const { reader } = createDigestReader([createDigestResult()]);
            const { searcher: grepSearcher } = createGrepSearcher([createGrepResult()]);
            const { searcher: vectorSearcher } = createVectorSearcher([createVectorResult()]);

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({
                skipDigests: true,
                skipGrep: true,
                skipVector: true,
            });

            const results = await service.search(context, options);

            expect(results).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------------
    // Score filtering
    // -------------------------------------------------------------------------

    describe('score filtering', () => {
        it('should filter results below minScore', async () => {
            const digestResults = [
                createDigestResult({ score: 0.9 }),
                createDigestResult({ filePath: '.memory/low-score.md', score: 0.2 }),
            ];
            const { reader } = createDigestReader(digestResults);
            const { searcher: grepSearcher } = createGrepSearcher();
            const { searcher: vectorSearcher } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ minScore: 0.35 });

            const results = await service.search(context, options);

            expect(results).toHaveLength(1);
            expect(results[0].score).toBe(0.9);
        });

        it('should use default minScore of 0.35', async () => {
            const digestResults = [
                createDigestResult({ score: 0.5 }),
                createDigestResult({ filePath: '.memory/low.md', score: 0.3 }),
            ];
            const { reader } = createDigestReader(digestResults);
            const { searcher: grepSearcher } = createGrepSearcher();
            const { searcher: vectorSearcher } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions();

            const results = await service.search(context, options);

            expect(results).toHaveLength(1);
            expect(results[0].score).toBe(0.5);
        });
    });

    // -------------------------------------------------------------------------
    // Deduplication
    // -------------------------------------------------------------------------

    describe('deduplication', () => {
        it('should deduplicate results with the same filePath across tiers', async () => {
            const sharedPath = '.memory/agents/seo-agent/expertise.md';
            const digestResults = [createDigestResult({ filePath: sharedPath, score: 0.6 })];
            const grepResults = [createGrepResult({ filePath: sharedPath, score: 0.8 })];
            const { reader } = createDigestReader(digestResults);
            const { searcher: grepSearcher } = createGrepSearcher(grepResults);
            const { searcher: vectorSearcher } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ maxResults: 10 });

            const results = await service.search(context, options);

            const pathCounts = results.filter((r) => r.filePath === sharedPath);
            expect(pathCounts).toHaveLength(1);
            // Should keep the higher-scored one
            expect(pathCounts[0].score).toBe(0.8);
        });
    });

    // -------------------------------------------------------------------------
    // Context passing
    // -------------------------------------------------------------------------

    describe('context passing', () => {
        it('should pass context to digest reader', async () => {
            const { reader, calls } = createDigestReader([createDigestResult()]);
            const { searcher: grepSearcher } = createGrepSearcher();
            const { searcher: vectorSearcher } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext({
                workspaceId: 'ws-abc',
                agentSlug: 'dev-agent',
                projectSlug: 'project-x',
                channelSlug: 'backend',
            });
            const options = createSearchOptions({ query: 'auth endpoints' });

            await service.search(context, options);

            expect(calls).toHaveLength(1);
            expect(calls[0].context.workspaceId).toBe('ws-abc');
            expect(calls[0].context.agentSlug).toBe('dev-agent');
            expect(calls[0].context.projectSlug).toBe('project-x');
            expect(calls[0].context.channelSlug).toBe('backend');
            expect(calls[0].query).toBe('auth endpoints');
        });

        it('should pass context to grep searcher', async () => {
            const { reader } = createDigestReader([]);
            const { searcher: grepSearcher, calls } = createGrepSearcher([createGrepResult()]);
            const { searcher: vectorSearcher } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext({ agentSlug: 'content-agent' });
            const options = createSearchOptions({ query: 'blog posts' });

            await service.search(context, options);

            expect(calls).toHaveLength(1);
            expect(calls[0].context.agentSlug).toBe('content-agent');
            expect(calls[0].query).toBe('blog posts');
        });

        it('should pass workspaceId to vector searcher', async () => {
            const { reader } = createDigestReader([]);
            const { searcher: grepSearcher } = createGrepSearcher([]);
            const { searcher: vectorSearcher, calls } = createVectorSearcher([createVectorResult()]);

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext({ workspaceId: 'ws-xyz' });
            const options = createSearchOptions({ query: 'keyword research' });

            await service.search(context, options);

            expect(calls).toHaveLength(1);
            expect(calls[0].workspaceId).toBe('ws-xyz');
            expect(calls[0].query).toBe('keyword research');
        });
    });

    // -------------------------------------------------------------------------
    // Error propagation
    // -------------------------------------------------------------------------

    describe('error propagation', () => {
        it('should propagate errors from digest reader', async () => {
            const reader: DigestReader = {
                searchDigests: async () => {
                    throw new Error('Digest file not found');
                },
            };
            const { searcher: grepSearcher } = createGrepSearcher();
            const { searcher: vectorSearcher } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions();

            await expect(service.search(context, options)).rejects.toThrow('Digest file not found');
        });

        it('should propagate errors from grep searcher', async () => {
            const { reader } = createDigestReader([]);
            const grepSearcher: GrepSearcher = {
                searchGrep: async () => {
                    throw new Error('Grep execution failed');
                },
            };
            const { searcher: vectorSearcher } = createVectorSearcher();

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions();

            await expect(service.search(context, options)).rejects.toThrow('Grep execution failed');
        });

        it('should propagate errors from vector searcher', async () => {
            const { reader } = createDigestReader([]);
            const { searcher: grepSearcher } = createGrepSearcher([]);
            const vectorSearcher: VectorSearcher = {
                searchVector: async () => {
                    throw new Error('pgvector connection failed');
                },
            };

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions();

            await expect(service.search(context, options)).rejects.toThrow('pgvector connection failed');
        });
    });

    // -------------------------------------------------------------------------
    // Sort order
    // -------------------------------------------------------------------------

    describe('sort order', () => {
        it('should sort results by score descending across all tiers', async () => {
            const digestResults = [createDigestResult({ score: 0.6 })];
            const grepResults = [createGrepResult({ score: 0.9 })];
            const vectorResults = [createVectorResult({ score: 0.75 })];
            const { reader } = createDigestReader(digestResults);
            const { searcher: grepSearcher } = createGrepSearcher(grepResults);
            const { searcher: vectorSearcher } = createVectorSearcher(vectorResults);

            const service = new MemorySearchService(reader, grepSearcher, vectorSearcher);
            const context = createSearchContext();
            const options = createSearchOptions({ maxResults: 10 });

            const results = await service.search(context, options);

            expect(results).toHaveLength(3);
            expect(results[0].score).toBe(0.9);
            expect(results[1].score).toBe(0.75);
            expect(results[2].score).toBe(0.6);
        });
    });
});
