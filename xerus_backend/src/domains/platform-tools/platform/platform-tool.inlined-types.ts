// Platform Tool Inlined Types
// Types formerly defined in agents/xerus-master.types.ts, inlined after Block 7 cleanup.
// Canonical source for platform tool names, input/result types, and HITL rules.

// -----------------------------------------------------------------------------
// Platform Tool Names
// -----------------------------------------------------------------------------

export const PLATFORM_TOOLS = {
    // Agent Management (4)
    SEARCH_AGENTS: 'search_agents',
    CLONE_AGENT: 'clone_agent',
    CREATE_AGENT: 'create_agent',
    UPDATE_AGENT: 'update_agent',
    // Knowledge Base (3)
    SEARCH_KB: 'search_kb',
    UPLOAD_KB: 'upload_kb',
    ASSIGN_KB: 'assign_kb',
    // Channels & Tasks (3)
    CREATE_CHANNEL: 'create_channel',
    ADD_TO_CHANNEL: 'add_to_channel',
    CREATE_TASK: 'create_task',
    // Skills (2)
    CREATE_SKILL: 'create_skill',
    SEARCH_SKILLS: 'search_skills',
    // Tools & Integrations (2)
    SEARCH_TOOLS: 'search_tools',
    CONNECT_TOOL: 'connect_tool',
    // Notifications (1)
    SEND_NOTIFICATION: 'send_notification',
    // Status (1)
    GET_STATUS: 'get_status',
    // Session Control (3 + 1 complete)
    PAUSE_EXECUTION: 'pause_execution',
    RESUME_EXECUTION: 'resume_execution',
    GET_SESSION_STATE: 'get_session_state',
    COMPLETE_SESSION: 'complete_session',
    // Memory (3)
    QUERY_MEMORY: 'query_memory',
    WRITE_MEMORY: 'write_memory',
    ANALYZE_MEMORY_PATTERNS: 'analyze_memory_patterns',
    // Triggers (3)
    REGISTER_TRIGGER: 'register_trigger',
    LIST_TRIGGERS: 'list_triggers',
    DEREGISTER_TRIGGER: 'deregister_trigger',
    // Outputs (1)
    SEARCH_OUTPUTS: 'search_outputs',
    // Schedules (4) — sandbox-local workspace.db via sqlite3
    CREATE_SCHEDULE: 'create_schedule',
    LIST_SCHEDULES: 'list_schedules',
    UPDATE_SCHEDULE: 'update_schedule',
    DELETE_SCHEDULE: 'delete_schedule',
} as const;

export type PlatformTool = (typeof PLATFORM_TOOLS)[keyof typeof PLATFORM_TOOLS];

export const PLATFORM_TOOL_LIST: readonly PlatformTool[] = Object.values(PLATFORM_TOOLS);

// -----------------------------------------------------------------------------
// HITL Rules
// -----------------------------------------------------------------------------

export type HITLRequirement = 'auto' | 'always' | 'conditional';

export const PLATFORM_TOOL_HITL: Record<PlatformTool, HITLRequirement> = {
    // Agent Management
    [PLATFORM_TOOLS.SEARCH_AGENTS]: 'auto',
    [PLATFORM_TOOLS.CLONE_AGENT]: 'always',
    [PLATFORM_TOOLS.CREATE_AGENT]: 'always',
    [PLATFORM_TOOLS.UPDATE_AGENT]: 'always',
    // Knowledge Base
    [PLATFORM_TOOLS.SEARCH_KB]: 'auto',
    [PLATFORM_TOOLS.UPLOAD_KB]: 'conditional',
    [PLATFORM_TOOLS.ASSIGN_KB]: 'auto',
    // Channels & Tasks
    [PLATFORM_TOOLS.CREATE_CHANNEL]: 'auto',
    [PLATFORM_TOOLS.ADD_TO_CHANNEL]: 'auto',
    [PLATFORM_TOOLS.CREATE_TASK]: 'auto',
    // Skills
    [PLATFORM_TOOLS.CREATE_SKILL]: 'always',
    [PLATFORM_TOOLS.SEARCH_SKILLS]: 'auto',
    // Tools & Integrations
    [PLATFORM_TOOLS.SEARCH_TOOLS]: 'auto',
    [PLATFORM_TOOLS.CONNECT_TOOL]: 'always',
    // Notifications
    [PLATFORM_TOOLS.SEND_NOTIFICATION]: 'auto',
    // Status
    [PLATFORM_TOOLS.GET_STATUS]: 'auto',
    // Session Control
    [PLATFORM_TOOLS.PAUSE_EXECUTION]: 'auto',
    [PLATFORM_TOOLS.RESUME_EXECUTION]: 'always',
    [PLATFORM_TOOLS.GET_SESSION_STATE]: 'auto',
    [PLATFORM_TOOLS.COMPLETE_SESSION]: 'auto',
    // Memory
    [PLATFORM_TOOLS.QUERY_MEMORY]: 'auto',
    [PLATFORM_TOOLS.WRITE_MEMORY]: 'auto',
    [PLATFORM_TOOLS.ANALYZE_MEMORY_PATTERNS]: 'auto',
    // Triggers
    [PLATFORM_TOOLS.REGISTER_TRIGGER]: 'always',
    [PLATFORM_TOOLS.LIST_TRIGGERS]: 'auto',
    [PLATFORM_TOOLS.DEREGISTER_TRIGGER]: 'auto',
    // Outputs
    [PLATFORM_TOOLS.SEARCH_OUTPUTS]: 'auto',
    // Schedules
    [PLATFORM_TOOLS.CREATE_SCHEDULE]: 'auto',
    [PLATFORM_TOOLS.LIST_SCHEDULES]: 'auto',
    [PLATFORM_TOOLS.UPDATE_SCHEDULE]: 'auto',
    [PLATFORM_TOOLS.DELETE_SCHEDULE]: 'auto',
};

// -----------------------------------------------------------------------------
// Agent Management Input Types
// -----------------------------------------------------------------------------

export interface CreateAgentInput {
    name: string;
    slug?: string;
    description: string;
    system_prompt: string;
    model_id?: string;
    autonomy_level?: string;
    tool_slugs?: string[];
    skill_slugs?: string[];
    kb_collection_ids?: string[];
}

export interface CloneAgentInput {
    source_agent_id: string;
    name: string;
    customizations?: {
        description?: string;
        system_prompt?: Record<string, unknown>;
        model_id?: string;
        autonomy_level?: string;
    };
}

export interface SearchAgentsInput {
    query: string;
    scope?: string;
    category?: string;
}

export interface UpdateAgentInput {
    agent_id: string;
    name?: string;
    description?: string;
    system_prompt?: Record<string, unknown>;
    model_id?: string;
    autonomy_level?: string;
}

// -----------------------------------------------------------------------------
// Knowledge Base Input Types
// -----------------------------------------------------------------------------

export interface UploadKbInput {
    title: string;
    content?: string;
    file_path?: string;
    collection_id?: string;
}

export interface AssignKbInput {
    agent_id: string;
    document_id?: string;
    collection_id?: string;
    permission?: string;
}

export interface SearchKbInput {
    query: string;
    collection_id?: string;
    limit?: number;
}

// -----------------------------------------------------------------------------
// Channels & Tasks Input Types
// -----------------------------------------------------------------------------

export interface CreateChannelInput {
    name: string;
    project_id?: string;
    description?: string;
    agent_ids?: string[];
}

export interface AddToChannelInput {
    channel_id: string;
    agent_id: string;
    role?: string;
}

export interface CreateTaskInput {
    channel_id: string;
    title: string;
    description?: string;
    assigned_agent_ids?: string[];
    priority?: string;
    subtasks?: string[];
}

// -----------------------------------------------------------------------------
// Skills Input Types
// -----------------------------------------------------------------------------

export interface CreateSkillInput {
    name: string;
    description: string;
    instructions: string;
    agent_id?: string;
    category?: string;
}

export interface SearchSkillsInput {
    query: string;
    scope?: string;
}

// -----------------------------------------------------------------------------
// Tools & Integrations Input Types
// -----------------------------------------------------------------------------

export interface SearchToolsInput {
    query: string;
    agent_id?: string;
}

export interface ConnectToolInput {
    agent_id: string;
    app_slug: string;
}

// -----------------------------------------------------------------------------
// Notification Input Types
// -----------------------------------------------------------------------------

export interface SendNotificationInput {
    message: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    agent_slug?: string;
}

// -----------------------------------------------------------------------------
// Status Input Types
// -----------------------------------------------------------------------------

export interface GetStatusInput {
    scope: string;
    id?: string;
    include_activity?: boolean;
}

// -----------------------------------------------------------------------------
// Heartbeat Input Types (deprecated -- tables dropped in migration 081)
// Stub retained for HeartbeatServicePort compatibility in platform-tool.types.ts
// -----------------------------------------------------------------------------

/** @deprecated Heartbeat tables dropped in migration 081. */
export interface ConfigureHeartbeatInput {
    agent_id: string;
}

// -----------------------------------------------------------------------------
// Session Control Input/Result Types
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

export interface CompleteSessionInput {
    reason?: string;
    status?: 'success' | 'failure' | 'partial';
    summary?: string;
}

export interface PauseExecutionResult {
    sessionId: string;
    pauseId: string;
    pausedAt: string;
    reason: string;
}

export interface ResumeExecutionResult {
    sessionId: string;
    pauseId: string;
    resolution: string;
    resumedAt: string;
}

export interface SessionStateResult {
    sessionId: string;
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
    agentId: number;
    triggerType: string;
    startedAt?: string;
    completedAt?: string;
    inputTokens: number;
    outputTokens: number;
    creditsUsed: number;
    pendingApproval?: {
        pauseId: string;
        reason: string;
        requestData: Record<string, unknown>;
    };
    checkpoint?: Record<string, unknown>;
}

export interface CompleteSessionResult {
    acknowledged: boolean;
    session_id: string;
    completed_at: string;
}

// -----------------------------------------------------------------------------
// Memory Input/Result Types
// -----------------------------------------------------------------------------

export type MemoryScope = 'company' | 'project' | 'channel' | 'agent' | 'user' | 'entity' | 'topic';

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
// Trigger Input/Result Types
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
// Output Input/Result Types
// -----------------------------------------------------------------------------

export interface SearchOutputsInput {
    taskId?: string;
    agentId?: string;
    outputType?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
}

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
// Schedule Input/Result Types (workspace.db on sandbox)
// -----------------------------------------------------------------------------

export interface CreateScheduleInput {
    agent_slug: string;
    name: string;
    prompt: string;
    rrule?: string;
    adapter_type?: 'claudecode' | 'codex';
    model?: string;
    max_budget_usd?: number;
    allowed_tools?: string[];
    system_prompt?: string;
    config?: string;  // JSON-serialized UI metadata (timezone, activeHours, weekdaysOnly, tokenBudget, etc.)
}

export interface ListSchedulesInput {
    agent_slug?: string;
    status?: 'active' | 'paused';
}

export interface UpdateScheduleInput {
    schedule_id: string;
    name?: string;
    prompt?: string;
    rrule?: string;
    status?: 'active' | 'paused';
    model?: string;
    max_budget_usd?: number;
    allowed_tools?: string[];
    system_prompt?: string;
    config?: string;  // JSON-serialized UI metadata
}

export interface DeleteScheduleInput {
    schedule_id: string;
}

export interface ScheduleEntry {
    id: string;
    agent_slug: string;
    name: string;
    prompt: string;
    rrule: string | null;
    adapter_type: string;
    model: string | null;
    status: string;
    max_budget_usd: number | null;
    config: string | null;  // JSON-serialized UI metadata; null until the user saves one
    next_run_at: number | null;
    last_run_at: number | null;
    created_at: number;
}

export interface CreateScheduleResult {
    schedule: ScheduleEntry;
}

export interface ListSchedulesResult {
    schedules: ScheduleEntry[];
    total: number;
}

export interface UpdateScheduleResult {
    schedule: ScheduleEntry;
}

export interface DeleteScheduleResult {
    schedule_id: string;
    deleted_at: string;
}
