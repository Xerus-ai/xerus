// Xerus Master Tool Types
// Input interfaces and core type definitions for platform tools
// Split: result types moved to xerus-master.result-types.ts

import { CoordinationMode, AutonomyLevel } from '../types';
import { PLATFORM_TOOL_LIST } from './xerus-master.constants';
import type { DelegationBudget } from './xerus-master.constants';

// Re-export all result types so existing consumers don't break
export type {
    PlatformToolResult,
    AgentSearchResult,
    KbDocumentResult,
    ChannelResult,
    TaskResult,
    SkillResult,
    ToolResult,
    StatusResult,
    UpdateAgentResult,
    ConfigureHeartbeatResult,
    PauseExecutionResult,
    ResumeExecutionResult,
    SessionStateResult,
    MemorySearchResult,
    QueryMemoryResult,
    WriteMemoryResult,
    MemoryPattern,
    AnalyzeMemoryPatternsResult,
    TriggerResult,
    RegisterTriggerResult,
    ListTriggersResult,
    DeregisterTriggerResult,
    OutputEntry,
    SearchOutputsResult,
    HeartbeatInterval,
    HeartbeatCheckResult,
    HeartbeatFinding,
    HeartbeatResponse,
    ProactiveTaskSuggestion,
} from './xerus-master.result-types';

// -----------------------------------------------------------------------------
// Platform Tool Type
// -----------------------------------------------------------------------------

export type PlatformTool = (typeof PLATFORM_TOOL_LIST)[number];

// -----------------------------------------------------------------------------
// Workspace Context
// -----------------------------------------------------------------------------

export interface WorkspaceContext {
    userName: string;
    workspacePath: string;
    currentDate: string;
    modelId: string;
    creditBalance: number;
    agentCount: number;
    channelCount: number;
}

// -----------------------------------------------------------------------------
// Master Agent Configuration
// -----------------------------------------------------------------------------

export interface XerusMasterConfig {
    userId: string;
    workspaceContext: WorkspaceContext;
    model: string;
    sessionId?: string;
    delegationBudget?: DelegationBudget;
}

// -----------------------------------------------------------------------------
// Delegation Context
// -----------------------------------------------------------------------------

export interface DelegationContext {
    agentId: string;
    task: string;
    data?: Record<string, unknown>;
    artifacts?: string[];
    instructions?: string;
    awaitResult?: boolean;
}

export interface TeamDelegationContext {
    teamId: string;
    task: string;
    context?: Record<string, unknown>;
    coordinationOverride?: CoordinationMode;
}

// -----------------------------------------------------------------------------
// Call Chain Tracking (Circular Prevention)
// -----------------------------------------------------------------------------

export type CallChainEntryType = 'agent' | 'team';

export interface CallChainEntry {
    type: CallChainEntryType;
    id: string;
    startedAt: Date;
}

export interface CallChainCheckResult {
    allowed: boolean;
    reason?: 'circular_dependency' | 'max_depth_exceeded' | 'budget_exceeded';
    stackTrace?: string;
}

// -----------------------------------------------------------------------------
// Platform Tool Input Types
// -----------------------------------------------------------------------------

export interface CreateAgentInput {
    name: string;
    slug?: string;
    description: string;
    systemPrompt: {
        identity: string;
        goals: string;
        capabilities?: string;
        guidelines?: string;
        constraints?: string;
        personality?: string;
    };
    modelId?: string;
    autonomyLevel?: AutonomyLevel;
    toolSlugs?: string[];
    skillIds?: string[];
    kbCollectionIds?: string[];
}

export interface CloneAgentInput {
    sourceAgentId: string;
    name: string;
    customizations?: {
        description?: string;
        systemPrompt?: Record<string, string>;
        modelId?: string;
        autonomyLevel?: AutonomyLevel;
    };
}

export interface SearchAgentsInput {
    query: string;
    scope?: 'mine' | 'marketplace' | 'all';
    category?: string;
}

export interface UploadKbInput {
    title: string;
    content?: string;
    filePath?: string;
    collectionId?: string;
}

export interface AssignKbInput {
    agentId: string;
    documentId?: string;
    collectionId?: string;
    permission?: 'read' | 'read_write';
}

export interface SearchKbInput {
    query: string;
    collectionId?: string;
    limit?: number;
}

export interface CreateChannelInput {
    name: string;
    projectId?: string;
    description?: string;
    agentIds?: string[];
}

export interface AddToChannelInput {
    channelId: string;
    agentId: string;
    role?: 'member' | 'lead';
}

export interface CreateTaskInput {
    channelId: string;
    title: string;
    description?: string;
    assignedAgentIds?: string[];
    priority?: 'low' | 'medium' | 'high' | 'critical';
    subtasks?: string[];
}

export interface CreateSkillInput {
    name: string;
    description: string;
    instructions: string;
    agentId?: string;
    category?: string;
}

export interface SearchSkillsInput {
    query: string;
    scope?: 'system' | 'marketplace' | 'mine' | 'all';
}

export interface SearchToolsInput {
    query: string;
    agentId?: string;
}

export interface ConnectToolInput {
    agentId: string;
    appSlug: string;
}

export interface UpdateAgentInput {
    agentId: string;
    name?: string;
    description?: string;
    systemPrompt?: {
        identity?: string;
        goals?: string;
        capabilities?: string;
        guidelines?: string;
        constraints?: string;
        personality?: string;
    };
    modelId?: string;
    autonomyLevel?: AutonomyLevel;
}

export interface ConfigureHeartbeatInput {
    agentId: string;
    enabled?: boolean;
    cronExpression?: string;
    timezone?: string;
    activeHoursStart?: string | null;
    activeHoursEnd?: string | null;
    weekdaysOnly?: boolean;
    prompt?: string | null;
}

export interface GetStatusInput {
    scope: 'agent' | 'team' | 'task' | 'channel' | 'workspace';
    id?: string;
    includeActivity?: boolean;
}

// -----------------------------------------------------------------------------
// Session Control Input Types
// -----------------------------------------------------------------------------

export interface PauseExecutionInput {
    sessionId: string;
    reason?: string;
    checkpoint?: Record<string, unknown>;
}

export interface ResumeExecutionInput {
    sessionId: string;
    approved: boolean;
    feedback?: string;
}

export interface GetSessionStateInput {
    sessionId: string;
    includeCheckpoint?: boolean;
}

// -----------------------------------------------------------------------------
// Session Completion Input/Result Types
// -----------------------------------------------------------------------------

export interface CompleteSessionInput {
    session_id?: string;
    reason?: string;
    status?: 'success' | 'failure' | 'partial';
    summary?: string;
}

export interface CompleteSessionResult {
    acknowledged: boolean;
    session_id: string;
    completed_at: string;
}

// -----------------------------------------------------------------------------
// Memory Operations Input Types
// -----------------------------------------------------------------------------

export type MemoryScope = 'company' | 'project' | 'channel' | 'agent';

export interface QueryMemoryInput {
    query: string;
    scope?: MemoryScope;
    scopeId?: string;
    memoryType?: string;
    limit?: number;
}

export interface WriteMemoryInput {
    content: string;
    scope: MemoryScope;
    scopeId?: string;
    memoryType?: string;
    filePath?: string;
}

export interface AnalyzeMemoryPatternsInput {
    scope?: MemoryScope;
    scopeId?: string;
    categories?: string[];
}

// -----------------------------------------------------------------------------
// Trigger Management Input Types
// -----------------------------------------------------------------------------

export interface RegisterTriggerInput {
    agentId: string;
    appSlug: string;
    eventType: string;
    filterConfig?: Record<string, unknown>;
}

export interface ListTriggersInput {
    agentId: string;
    enabled?: boolean;
}

export interface DeregisterTriggerInput {
    triggerId: number;
}

// -----------------------------------------------------------------------------
// Output Registry Input Types
// -----------------------------------------------------------------------------

export interface SearchOutputsInput {
    taskId?: string;
    agentId?: string;
    outputType?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
}
