// Team Memory Search Service
// Team-aware memory search that combines agent-own + team-shared memories
// with weighted scoring and deduplication.
// Reference: docs/planning/execution/memory-integration-team-episodic.md

import type { MemorySearchService, SearchContext, SearchResultItem } from './memory-search.service';
import type {
    TeamSearchOptions,
    TeamSearchResult,
} from './team-memory.types';
import {
    TEAM_SEARCH_WEIGHTS,
    DEFAULT_TEAM_SEARCH_MAX_RESULTS,
    DEFAULT_TEAM_SEARCH_MIN_SCORE,
} from './team-memory.types';
import { InvalidTeamQueryScopeError } from './team-memory.errors';

// -----------------------------------------------------------------------------
// Team Memory Search Service
// -----------------------------------------------------------------------------

export class TeamMemorySearchService {
    private readonly searchService: MemorySearchService;

    constructor(searchService: MemorySearchService) {
        this.searchService = searchService;
    }

    /**
     * Search memories with team-awareness. Queries combine:
     * - Agent's own memories (scored at 1.0x)
     * - Team-shared memories (scored at 0.8x)
     *
     * Scope controls which pools to search:
     * - 'agent': Only agent-private memories
     * - 'team': Only team-shared memories (project/channel/workspace)
     * - 'both': Combined search (default)
     */
    async searchTeamMemory(options: TeamSearchOptions): Promise<TeamSearchResult[]> {
        if (!['agent', 'team', 'both'].includes(options.scope)) {
            throw new InvalidTeamQueryScopeError(options.scope);
        }

        const maxResults = options.maxResults ?? DEFAULT_TEAM_SEARCH_MAX_RESULTS;
        const minScore = options.minScore ?? DEFAULT_TEAM_SEARCH_MIN_SCORE;
        const collected: TeamSearchResult[] = [];

        // Search agent-own memories
        if (options.scope === 'agent' || options.scope === 'both') {
            const agentContext: SearchContext = {
                workspaceId: options.workspaceId,
                agentId: options.agentId,
                agentSlug: options.agentSlug,
                projectSlug: options.projectSlug,
                channelSlug: options.channelSlug,
            };

            const agentResults = await this.searchService.search(agentContext, {
                query: options.query,
                maxResults,
            });

            const agentTagged = this.tagResults(
                agentResults,
                'agent',
                TEAM_SEARCH_WEIGHTS.agentOwnMemory
            );
            collected.push(...agentTagged);
        }

        // Search team-shared memories (project/workspace scope)
        if (options.scope === 'team' || options.scope === 'both') {
            const teamContext: SearchContext = {
                workspaceId: options.workspaceId,
                agentId: 0,
                agentSlug: '__team__',
                projectSlug: options.projectSlug,
                channelSlug: options.channelSlug,
            };

            const teamResults = await this.searchService.search(teamContext, {
                query: options.query,
                maxResults,
                skipDigests: false,
                skipGrep: false,
                skipVector: false,
            });

            // Filter out agent's own results (avoid duplicates in 'both' mode)
            const agentPrefix = `agents/${options.agentSlug}/`;
            const filteredTeam = teamResults.filter(
                (r) => !r.filePath.includes(agentPrefix)
            );

            const teamTagged = this.tagResults(
                filteredTeam,
                'team',
                TEAM_SEARCH_WEIGHTS.teamSharedMemory
            );
            collected.push(...teamTagged);
        }

        return this.finalizeTeamResults(collected, maxResults, minScore);
    }

    // -------------------------------------------------------------------------
    // Private: Search Helpers
    // -------------------------------------------------------------------------

    private tagResults(
        results: SearchResultItem[],
        sourceScope: 'agent' | 'team',
        weight: number
    ): TeamSearchResult[] {
        return results.map((r) => ({
            ...r,
            sourceScope,
            originalScore: r.score,
            score: r.score * weight,
        }));
    }

    private finalizeTeamResults(
        results: TeamSearchResult[],
        maxResults: number,
        minScore: number
    ): TeamSearchResult[] {
        // Deduplicate by filePath, keeping the entry with the highest weighted score
        const byPath = new Map<string, TeamSearchResult>();
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
