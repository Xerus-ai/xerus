// Team Memory Integration Service
// Thin coordinator that delegates to focused sub-services while
// maintaining the original public API surface.
//
// Reference: docs/planning/execution/git-memory-system.md
// Reference: docs/planning/execution/memory-integration-team-episodic.md
// Reference: docs/planning/execution/memory-integration-team-procedural.md
//
// Capabilities:
//   1. Isolation: Agent writes to agent scope by default, shared to team scope
//   2. Team-aware queries: Combines agent + team memories with weighted scoring
//   3. Coordinator procedural learning: Learns delegation patterns from team outcomes
//   4. Memory merge: Promotes significant agent memories to team scope on completion

import { GitMemoryRepository } from './git-memory.repository';
import type { MemorySearchService } from './memory-search.service';
import type { LLMClient } from './memory-extractor.service';
import { TeamMemorySearchService } from './team-memory-search.service';
import { TeamMemoryCoordinatorService } from './team-memory-coordinator.service';
import type {
    TeamContext,
    TeamSearchOptions,
    TeamSearchResult,
    CoordinatorLearningInput,
    AgentTeamParticipation,
    PromotionResult,
    DelegationPattern,
} from './team-memory.types';

// Re-export sub-services for direct use when needed
export { TeamMemorySearchService } from './team-memory-search.service';
export { TeamMemoryCoordinatorService } from './team-memory-coordinator.service';
export { TeamMemoryPromotionService } from './team-memory-promotion.service';

// -----------------------------------------------------------------------------
// Team Memory Integration Service
// -----------------------------------------------------------------------------

export class TeamMemoryService {
    private readonly searchSvc: TeamMemorySearchService;
    private readonly coordinatorSvc: TeamMemoryCoordinatorService;

    constructor(
        repo: GitMemoryRepository,
        searchService: MemorySearchService,
        llmClient: LLMClient
    ) {
        this.searchSvc = new TeamMemorySearchService(searchService);
        this.coordinatorSvc = new TeamMemoryCoordinatorService(repo, llmClient);
    }

    // -------------------------------------------------------------------------
    // 1. Team-Aware Search (delegates to TeamMemorySearchService)
    // -------------------------------------------------------------------------

    async searchTeamMemory(options: TeamSearchOptions): Promise<TeamSearchResult[]> {
        return this.searchSvc.searchTeamMemory(options);
    }

    // -------------------------------------------------------------------------
    // 2. Write Team Participation (delegates to TeamMemoryCoordinatorService)
    // -------------------------------------------------------------------------

    async writeTeamParticipation(
        participation: AgentTeamParticipation
    ): Promise<string> {
        return this.coordinatorSvc.writeTeamParticipation(participation);
    }

    async writeTeamParticipations(
        teamContext: TeamContext,
        agentOutputs: Array<{
            agentId: number;
            agentSlug: string;
            taskReceived: string;
            resultSummary: string;
            outcome: 'success' | 'partial' | 'failed';
        }>,
        teamGoal: string
    ): Promise<string[]> {
        return this.coordinatorSvc.writeTeamParticipations(teamContext, agentOutputs, teamGoal);
    }

    // -------------------------------------------------------------------------
    // 3. Coordinator Procedural Learning (delegates to TeamMemoryCoordinatorService)
    // -------------------------------------------------------------------------

    async learnDelegationPattern(
        input: CoordinatorLearningInput
    ): Promise<DelegationPattern | null> {
        return this.coordinatorSvc.learnDelegationPattern(input);
    }

    // -------------------------------------------------------------------------
    // 4. Memory Merge (delegates to TeamMemoryCoordinatorService)
    // -------------------------------------------------------------------------

    async mergeAgentMemoriesToTeam(
        teamContext: TeamContext,
        agentSlugs: string[],
        projectSlug: string
    ): Promise<PromotionResult[]> {
        return this.coordinatorSvc.mergeAgentMemoriesToTeam(teamContext, agentSlugs, projectSlug);
    }
}
