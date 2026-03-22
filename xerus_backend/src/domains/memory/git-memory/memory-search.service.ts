// Memory Search Service - Tiered Search
// Implements tiered search: digest -> grep -> pgvector.
// First checks digest files (~200 tokens, covers 70% of queries),
// then greps .memory/ files (<100ms, covers 20%),
// finally falls back to hybrid pgvector search if needed.
// Reference: docs/planning/execution/git-memory-system.md (Phase 4, Search Flow)

import type { MemoryType, MemoryScope } from '../memory.types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SearchContext {
    workspaceId: string;
    agentId: number;
    agentSlug: string;
    projectSlug?: string;
    channelSlug?: string;
}

export interface TieredSearchOptions {
    query: string;
    maxResults?: number;
    minScore?: number;
    skipDigests?: boolean;
    skipGrep?: boolean;
    skipVector?: boolean;
}

export type SearchTier = 'digest' | 'grep' | 'vector';

export interface SearchResultItem {
    filePath: string;
    snippet: string;
    score: number;
    tier: SearchTier;
    memoryType?: MemoryType;
    scope?: MemoryScope;
}

// -----------------------------------------------------------------------------
// Dependency Interfaces (injected)
// -----------------------------------------------------------------------------

export interface DigestReader {
    searchDigests(context: SearchContext, query: string): Promise<SearchResultItem[]>;
}

export interface GrepSearcher {
    searchGrep(context: SearchContext, query: string): Promise<SearchResultItem[]>;
}

export interface VectorSearcher {
    searchVector(workspaceId: string, query: string): Promise<SearchResultItem[]>;
}

// -----------------------------------------------------------------------------
// Defaults
// -----------------------------------------------------------------------------

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MIN_SCORE = 0.35;

// -----------------------------------------------------------------------------
// Memory Search Service
// -----------------------------------------------------------------------------

export class MemorySearchService {
    private readonly digestReader: DigestReader;
    private readonly grepSearcher: GrepSearcher;
    private readonly vectorSearcher: VectorSearcher;

    constructor(
        digestReader: DigestReader,
        grepSearcher: GrepSearcher,
        vectorSearcher: VectorSearcher
    ) {
        this.digestReader = digestReader;
        this.grepSearcher = grepSearcher;
        this.vectorSearcher = vectorSearcher;
    }

    /**
     * Search memory using a tiered approach:
     * 1. Digest files (fast, ~200 tokens, covers 70% of queries)
     * 2. Grep across .memory/ files (<100ms, covers 20%)
     * 3. Hybrid pgvector search (semantic, covers remaining 10%)
     *
     * Each tier is skipped if previous tiers already satisfy maxResults.
     * Results are deduplicated by filePath (highest score wins),
     * filtered by minScore, and sorted by score descending.
     */
    async search(
        context: SearchContext,
        options: TieredSearchOptions
    ): Promise<SearchResultItem[]> {
        const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
        const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
        const collected: SearchResultItem[] = [];

        // Tier 1: Digest files
        if (!options.skipDigests) {
            const digestResults = await this.digestReader.searchDigests(context, options.query);
            collected.push(...digestResults);

            if (collected.length >= maxResults) {
                return this.finalizeResults(collected, maxResults, minScore);
            }
        }

        // Tier 2: Grep across .memory/ files
        if (!options.skipGrep) {
            const grepResults = await this.grepSearcher.searchGrep(context, options.query);
            collected.push(...grepResults);

            if (collected.length >= maxResults) {
                return this.finalizeResults(collected, maxResults, minScore);
            }
        }

        // Tier 3: Hybrid pgvector search
        if (!options.skipVector) {
            const vectorResults = await this.vectorSearcher.searchVector(
                context.workspaceId,
                options.query
            );
            collected.push(...vectorResults);
        }

        return this.finalizeResults(collected, maxResults, minScore);
    }

    /**
     * Deduplicate by filePath (keep highest score), filter by minScore,
     * sort by score descending, and limit to maxResults.
     */
    private finalizeResults(
        results: SearchResultItem[],
        maxResults: number,
        minScore: number
    ): SearchResultItem[] {
        // Deduplicate by filePath, keeping the entry with the highest score
        const byPath = new Map<string, SearchResultItem>();
        for (const result of results) {
            const existing = byPath.get(result.filePath);
            if (!existing || result.score > existing.score) {
                byPath.set(result.filePath, result);
            }
        }

        return Array.from(byPath.values())
            .filter((r) => r.score >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);
    }
}
