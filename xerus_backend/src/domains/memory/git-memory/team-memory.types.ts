// Team Memory Types
// Types for team-based memory scoping, isolation, and integration.
// Reference: docs/planning/execution/git-memory-system.md
// Reference: docs/planning/execution/memory-integration-team-episodic.md
// Reference: docs/planning/execution/memory-integration-team-queries.md

import type { MemoryType } from '../memory.types';
import type { SearchResultItem } from './memory-search.service';
import { COORDINATION_MODES } from '../../../shared/types/execution-shared.types';
import type { CoordinationMode } from '../../../shared/types/execution-shared.types';

// Re-export CoordinationMode and COORDINATION_MODES for backward compatibility
export type { CoordinationMode } from '../../../shared/types/execution-shared.types';
export { COORDINATION_MODES } from '../../../shared/types/execution-shared.types';

// -----------------------------------------------------------------------------
// Team Memory Scope
// Controls which memories are visible in team queries
// -----------------------------------------------------------------------------

export const TEAM_QUERY_SCOPES = ['agent', 'team', 'both'] as const;

export type TeamQueryScope = (typeof TEAM_QUERY_SCOPES)[number];

// -----------------------------------------------------------------------------
// Team Context
// Identifies the team execution context for memory operations
// -----------------------------------------------------------------------------

export interface TeamContext {
    teamExecutionId: string;
    teamId: number;
    coordinationMode: CoordinationMode;
    coordinatorAgentId?: number;
    memberAgentIds: number[];
}

// -----------------------------------------------------------------------------
// Team-Aware Search
// Combines agent-level and team-shared memories with weighted scoring
// -----------------------------------------------------------------------------

export interface TeamSearchOptions {
    query: string;
    agentId: number;
    agentSlug: string;
    workspaceId: string;
    projectSlug?: string;
    channelSlug?: string;
    scope: TeamQueryScope;
    maxResults?: number;
    minScore?: number;
    memoryTypes?: MemoryType[];
}

export interface TeamSearchResult extends SearchResultItem {
    sourceScope: 'agent' | 'team';
    originalScore: number;
}

// Weight applied to agent-own memories vs team-shared memories
export const TEAM_SEARCH_WEIGHTS = {
    agentOwnMemory: 1.0,
    teamSharedMemory: 0.8,
} as const;

export const DEFAULT_TEAM_SEARCH_MAX_RESULTS = 8;
export const DEFAULT_TEAM_SEARCH_MIN_SCORE = 0.35;

// -----------------------------------------------------------------------------
// Coordinator Procedural Learning
// Tracks delegation patterns learned by team coordinators
// -----------------------------------------------------------------------------

export interface DelegationPattern {
    patternName: string;
    description: string;
    coordinationMode: CoordinationMode;
    delegationSteps: DelegationStep[];
    aggregationStrategy: string;
    successCount: number;
    totalCount: number;
    lastUsed: Date;
}

export interface DelegationStep {
    step: number;
    delegateTo: string;
    taskTemplate: string;
    dependsOn: number[];
}

export interface CoordinatorLearningInput {
    coordinatorAgentId: number;
    coordinatorSlug: string;
    teamContext: TeamContext;
    agentOutputs: AgentTeamOutput[];
    teamGoal: string;
    teamOutcome: 'success' | 'partial' | 'failed';
}

export interface AgentTeamOutput {
    agentId: number;
    agentSlug: string;
    taskReceived: string;
    resultSummary: string;
    toolsUsed: string[];
    status: 'completed' | 'failed' | 'partial';
    position?: number;
}

// -----------------------------------------------------------------------------
// Memory Promotion (Agent -> Team scope)
// Promotes significant agent memories to team-shared scope
// -----------------------------------------------------------------------------

export interface PromotionCandidate {
    agentId: number;
    agentSlug: string;
    memoryType: MemoryType;
    content: string;
    filePath: string;
    significance: number;
}

export interface PromotionResult {
    promoted: boolean;
    filePath: string;
    reason: string;
}

export const PROMOTION_SIGNIFICANCE_THRESHOLD = 0.7;
export const MAX_PROMOTIONS_PER_MERGE = 5;

// -----------------------------------------------------------------------------
// Agent Team Participation
// Episodic memory for agent participation in team tasks
// -----------------------------------------------------------------------------

export interface AgentTeamParticipation {
    agentId: number;
    agentSlug: string;
    teamExecutionId: string;
    role: AgentTeamRole;
    taskReceived: string;
    resultSummary: string;
    outcome: 'success' | 'partial' | 'failed';
    teamGoal: string;
    coordinationMode: CoordinationMode;
    learnedLessons: string[];
}

export type AgentTeamRole = 'coordinator' | 'worker' | 'participant' | 'team_member';

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

export function isValidTeamQueryScope(scope: string): scope is TeamQueryScope {
    return TEAM_QUERY_SCOPES.includes(scope as TeamQueryScope);
}

export function isValidCoordinationMode(mode: string): mode is CoordinationMode {
    return COORDINATION_MODES.includes(mode as CoordinationMode);
}

export function resolveAgentTeamRole(
    agentId: number,
    coordinatorAgentId: number | undefined,
    coordinationMode: CoordinationMode
): AgentTeamRole {
    if (coordinationMode === 'hierarchical') {
        return agentId === coordinatorAgentId ? 'coordinator' : 'worker';
    }
    if (coordinationMode === 'consensus') {
        return 'participant';
    }
    return 'team_member';
}
