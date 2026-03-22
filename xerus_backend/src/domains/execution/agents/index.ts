// Agents Module - Public API
// Xerus master orchestrator and subagent management

// Types
export type {
    XerusMasterConfig,
    DelegationBudget,
    DelegationContext,
    TeamDelegationContext,
    CallChainEntry,
    CallChainCheckResult,
    HITLRequirement,
    CreateAgentInput,
    CloneAgentInput,
    SearchAgentsInput,
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
    PlatformToolResult,
    AgentSearchResult,
    KbDocumentResult,
    ChannelResult,
    TaskResult,
    SkillResult,
    ToolResult,
    StatusResult,
    HeartbeatCheckResult,
    HeartbeatFinding,
    HeartbeatResponse,
    ProactiveTaskSuggestion,
    PlatformTool,
    HeartbeatInterval,
} from './xerus-master.types';

// Constants
export {
    XERUS_MASTER_SLUG,
    XERUS_MASTER_NAME,
    XERUS_CTO_SLUG,
    MAX_DELEGATION_DEPTH,
    MAX_DELEGATIONS_PER_REQUEST,
    MAX_PARALLEL_DELEGATIONS,
    DEFAULT_DELEGATED_TOKEN_BUDGET,
    HEARTBEAT_INTERVALS,
    PLATFORM_TOOLS,
    PLATFORM_TOOL_LIST,
    PLATFORM_TOOL_HITL,
    DEFAULT_DELEGATION_BUDGET,
} from './xerus-master.types';

// Services
export {
    XerusMasterService,
    CallChainTracker,
    getXerusMasterService,
    resetXerusMasterService,
    DelegationError,
    PlatformToolError,
} from './xerus-master.service';
