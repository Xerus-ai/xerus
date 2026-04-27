// Platform Tool Types
// Service port interfaces for platform.* tool handlers.
// Domain services implement these contracts.

import { PLATFORM_TOOLS } from './platform-tool.inlined-types';
import type {
    CreateAgentInput,
    CloneAgentInput,
    SearchAgentsInput,
    UpdateAgentInput,
    UploadKbInput,
    AssignKbInput,
    SearchKbInput,
    CreateChannelInput,
    AddToChannelInput,
    CreateTaskInput,
    CreateSkillInput,
    SearchSkillsInput,
    SearchToolsInput,
    ConnectToolInput,
    GetStatusInput,
    ConfigureHeartbeatInput,
    PauseExecutionInput,
    ResumeExecutionInput,
    GetSessionStateInput,
    CompleteSessionInput,
    QueryMemoryInput,
    WriteMemoryInput,
    AnalyzeMemoryPatternsInput,
    RegisterTriggerInput,
    ListTriggersInput,
    DeregisterTriggerInput,
    SearchOutputsInput,
    GetBillingStatusInput,
} from './platform-tool.inlined-types';

// -----------------------------------------------------------------------------
// Tool Categories
// -----------------------------------------------------------------------------

export const TOOL_CATEGORIES = [
    'agent_management',
    'knowledge_base',
    'channels_tasks',
    'skills',
    'tools_integrations',
    'notifications',
    'status',
    'heartbeat',
    'delegation',
    'session_control',
    'memory',
    'triggers',
    'outputs',
    'billing',
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

// -----------------------------------------------------------------------------
// Tool Name Collections
// -----------------------------------------------------------------------------

export const ALL_PLATFORM_TOOL_NAMES: readonly string[] = Object.values(PLATFORM_TOOLS);
export const ALL_TOOL_NAMES: readonly string[] = [...ALL_PLATFORM_TOOL_NAMES];

// -----------------------------------------------------------------------------
// Tool Schema & Metadata Types
// -----------------------------------------------------------------------------

export interface ToolSchema {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required: readonly string[];
    };
}

export interface ToolMetadata {
    name: string;
    category: ToolCategory;
    description: string;
    delegatesTo: string;
    isDestructive: boolean;
}

// -----------------------------------------------------------------------------
// Service Port Interfaces
// Domain services implement these contracts. Consumers depend on ports,
// not concrete implementations, enabling testability without mocks.
// -----------------------------------------------------------------------------

export interface AgentServicePort {
    create(userId: string, input: CreateAgentInput): Promise<unknown>;
    clone(userId: string, input: CloneAgentInput): Promise<unknown>;
    search(userId: string, input: SearchAgentsInput): Promise<unknown>;
    update(userId: string, input: UpdateAgentInput): Promise<unknown>;
}

export interface KnowledgeServicePort {
    upload(userId: string, input: UploadKbInput): Promise<unknown>;
    assign(userId: string, input: AssignKbInput): Promise<unknown>;
    search(userId: string, input: SearchKbInput): Promise<unknown>;
}

export interface InboxServicePort {
    createChannel(userId: string, input: CreateChannelInput): Promise<unknown>;
    addToChannel(userId: string, input: AddToChannelInput): Promise<unknown>;
    createTask(userId: string, input: CreateTaskInput): Promise<unknown>;
}

export interface SkillServicePort {
    create(userId: string, input: CreateSkillInput): Promise<unknown>;
    search(userId: string, input: SearchSkillsInput): Promise<unknown>;
}

export interface ToolsServicePort {
    searchApps(userId: string, input: SearchToolsInput): Promise<unknown>;
    initiateConnection(userId: string, input: ConnectToolInput): Promise<unknown>;
}

export interface StatusServicePort {
    getStatus(userId: string, input: GetStatusInput): Promise<unknown>;
}

export interface HeartbeatServicePort {
    configureHeartbeat(userId: string, input: ConfigureHeartbeatInput): Promise<unknown>;
}

export interface SessionControlServicePort {
    pauseExecution(userId: string, input: PauseExecutionInput): Promise<unknown>;
    resumeExecution(userId: string, input: ResumeExecutionInput): Promise<unknown>;
    getSessionState(userId: string, input: GetSessionStateInput): Promise<unknown>;
    completeSession(userId: string, input: CompleteSessionInput): Promise<unknown>;
}

export interface MemoryServicePort {
    queryMemory(userId: string, input: QueryMemoryInput): Promise<unknown>;
    writeMemory(userId: string, input: WriteMemoryInput): Promise<unknown>;
    analyzeMemoryPatterns(userId: string, input: AnalyzeMemoryPatternsInput): Promise<unknown>;
}

export interface TriggerServicePort {
    registerTrigger(userId: string, input: RegisterTriggerInput): Promise<unknown>;
    listTriggers(userId: string, input: ListTriggersInput): Promise<unknown>;
    deregisterTrigger(userId: string, input: DeregisterTriggerInput): Promise<unknown>;
}

export interface OutputServicePort {
    searchOutputs(userId: string, input: SearchOutputsInput): Promise<unknown>;
}

export interface BillingServicePort {
    getBillingStatus(userId: string, input: GetBillingStatusInput): Promise<unknown>;
}

// -----------------------------------------------------------------------------
// Service Dependencies Bundle
// -----------------------------------------------------------------------------

export interface PlatformToolServices {
    agentService: AgentServicePort;
    knowledgeService: KnowledgeServicePort;
    inboxService: InboxServicePort;
    skillService: SkillServicePort;
    toolsService: ToolsServicePort;
    statusService: StatusServicePort;
    heartbeatService: HeartbeatServicePort;
    sessionControlService: SessionControlServicePort;
    memoryService: MemoryServicePort;
    triggerService: TriggerServicePort;
    outputService: OutputServicePort;
    billingService: BillingServicePort;
}

// -----------------------------------------------------------------------------
// Tool Handler Type
// -----------------------------------------------------------------------------

// Args are validated by SDK JSON schemas (PLATFORM_TOOL_SCHEMAS) before reaching handlers.
// Using `unknown` avoids unsafe double-cast through Record<string, unknown>.
export type ToolHandler = (
    services: PlatformToolServices,
    userId: string,
    args: unknown
) => Promise<unknown>;
