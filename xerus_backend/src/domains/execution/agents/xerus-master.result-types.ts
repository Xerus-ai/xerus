// Xerus Master Result Types
// All PlatformTool*Result and related output interfaces
// Extracted from xerus-master.tool-types.ts

import type { MemoryScope } from './xerus-master.tool-types';

// -----------------------------------------------------------------------------
// Platform Tool Result Types
// -----------------------------------------------------------------------------

export interface PlatformToolResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    requiresHitl?: boolean;
    hitlPrompt?: string;
}

export interface AgentSearchResult {
    id: string;
    slug: string;
    name: string;
    description: string;
    category?: string;
    isPublic: boolean;
}

export interface KbDocumentResult {
    id: string;
    title: string;
    collection?: string;
    snippet?: string;
    relevance?: number;
}

export interface ChannelResult {
    id: string;
    name: string;
    projectId: string;
    memberCount: number;
}

export interface TaskResult {
    id: string;
    title: string;
    channelId: string;
    status: string;
    priority: string;
}

export interface SkillResult {
    id: string;
    name: string;
    slug: string;
    description: string;
    category?: string;
}

export interface ToolResult {
    appSlug: string;
    name: string;
    description: string;
    categories: string[];
    isConnected: boolean;
}

export interface StatusResult {
    scope: string;
    timestamp: string;
    summary: Record<string, unknown>;
    activity?: Array<{ timestamp: string; action: string; details: string }>;
}

export interface UpdateAgentResult {
    id: string;
    slug: string;
    name: string;
    updatedFields: string[];
}

export interface ConfigureHeartbeatResult {
    agentId: string;
    enabled: boolean;
    cronExpression: string;
    timezone: string;
    nextRunAt?: string;
}

// -----------------------------------------------------------------------------
// Session Control Result Types
// -----------------------------------------------------------------------------

export interface PauseExecutionResult {
    sessionId: string;
    pauseId: string;
    pausedAt: string;
    reason: string;
}

export interface ResumeExecutionResult {
    sessionId: string;
    pauseId: string;
    resolution: 'approved' | 'rejected';
    resumedAt: string;
}

export interface SessionStateResult {
    sessionId: string;
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
    agentId: number;
    triggerType: string;
    startedAt?: string;
    completedAt?: string;
    inputTokens: number;
    outputTokens: number;
    creditsUsed: number;
    checkpoint?: Record<string, unknown>;
    pendingApproval?: {
        pauseId: string;
        reason: string;
        requestData: Record<string, unknown>;
    };
}

// -----------------------------------------------------------------------------
// Memory Operations Result Types
// -----------------------------------------------------------------------------

export interface MemorySearchResult {
    id: string;
    content: string;
    filePath: string;
    memoryType: string;
    scope: MemoryScope;
    relevance: number;
    createdAt: string;
}

export interface QueryMemoryResult {
    results: MemorySearchResult[];
    totalCount: number;
}

export interface WriteMemoryResult {
    id: string;
    filePath: string;
    scope: MemoryScope;
    memoryType: string;
    createdAt: string;
}

export interface MemoryPattern {
    category: string;
    count: number;
    examples: string[];
    insights: string[];
}

export interface AnalyzeMemoryPatternsResult {
    patterns: MemoryPattern[];
    analyzedAt: string;
    totalMemories: number;
}

// -----------------------------------------------------------------------------
// Trigger Management Result Types
// -----------------------------------------------------------------------------

export interface TriggerResult {
    id: number;
    agentId: number;
    appSlug: string;
    eventType: string;
    webhookUrl: string;
    enabled: boolean;
    filterConfig: Record<string, unknown>;
    lastFiredAt?: string;
    fireCount: number;
    createdAt: string;
}

export interface RegisterTriggerResult {
    trigger: TriggerResult;
    webhookUrl: string;
}

export interface ListTriggersResult {
    triggers: TriggerResult[];
    totalCount: number;
}

export interface DeregisterTriggerResult {
    triggerId: number;
    deregisteredAt: string;
}

// -----------------------------------------------------------------------------
// Output Registry Result Types
// -----------------------------------------------------------------------------

export interface OutputEntry {
    id: string;
    taskId?: string;
    agentId: number;
    outputType: string;
    filePath: string;
    size: number;
    createdAt: string;
}

export interface SearchOutputsResult {
    outputs: OutputEntry[];
    totalCount: number;
}

// -----------------------------------------------------------------------------
// Heartbeat Types (Co-CEO Pattern)
// -----------------------------------------------------------------------------

export type HeartbeatInterval = 'quick' | 'hourly' | 'daily' | 'weekly';

export interface HeartbeatCheckResult {
    hasIssues: boolean;
    blockedTasks: number;
    idleAgents: number;
    pendingDecisions: number;
    creditBurnRate?: number;
    findings: HeartbeatFinding[];
}

export interface HeartbeatFinding {
    severity: 'info' | 'warning' | 'alert';
    channelSlug?: string;
    message: string;
    suggestedAction?: string;
}

export interface HeartbeatResponse {
    type: 'ok' | 'channel_post' | 'alert';
    channelSlug?: string;
    content: string;
}

// -----------------------------------------------------------------------------
// Proactive Task Types
// -----------------------------------------------------------------------------

export interface ProactiveTaskSuggestion {
    channelId: string;
    title: string;
    description: string;
    suggestedAgentId?: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
}
