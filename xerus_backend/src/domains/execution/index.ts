// Execution Domain - Public API (barrel)

export * from './execution.service';
export * from './types';
export * from './errors';
export * from './sandbox';
export * from './storage';
export * from './sdk';
export * from './utils';
export * from './streaming';
export * from './workspace';
export * from './queue';
export * from './hooks';
export * from './orchestrator';
// knowledge module: KB docs written directly to Daytona workspace via Drive API
export * from './credits';
export * from './ace';
// Modules with selective exports to avoid name conflicts
export {
    RunnerHealthMonitor,
    createRunnerHealthMonitor,
    StdinParser,
    StdoutEmitter,
    RUNNER_ENV,
    detectAllAuth,
    detectAuthForAdapter,
    resolveBillingType,
    parseClaudeStreamLine,
    parseCodexStreamLine,
    clearAccumulator,
} from './runner';

export type {
    RunnerEventType,
    RunnerEvent,
    RunnerAgentConfig,
    RunnerConfig,
    McpServerConfig as RunnerMcpServerConfig,
    RunnerHealthMonitorDeps,
    HealthMonitorConfig,
    RunnerCrashEvent,
    SandboxHealthStatus,
    HealthCheckResult,
    RuntimeHookContext,
    PlatformAuthStatus,
    CLIAgentConfig,
    AdapterType,
    AuthResult,
    BillingType,
} from './runner';

export { HITLHandler, HITLPauseRepositoryImpl, ActiveStreamEmitter } from './hitl';
export type { HITLPauseRepository, HITLSSEEmitter, HITLHandlerDeps } from './hitl';
export type { HITLRequest, HITLResponse, HITLPauseState, HITLResult, HITLScenario } from './hitl';

export * from './background';

export {
    MetadataSyncService,
    createMetadataSyncService,
    SYNC_ENTITY_TYPES,
} from './metadata-sync';
export type {
    SyncEntityType,
    MetadataSyncEvent,
    SyncResult as MetadataSyncResult,
    SyncDatabase as MetadataSyncDatabase,
    DomainSyncPayload,
    ChannelSyncPayload,
    ChannelMessageSyncPayload,
    SyncQueryResult,
} from './metadata-sync';

// Platform: no longer needs rename workaround (orchestrator uses TOOL_FILTER_CATEGORIES)
export {
    TOOL_CATEGORIES as PLATFORM_TOOL_CATEGORIES,
    PLATFORM_TOOL_SCHEMAS,
    TOOL_METADATA,
    getToolSchema,
    getToolMetadata,
    getToolSchemasByCategory,
    isRegisteredTool,
    getRequiredFields,
    evaluateHitlRule,
    getHitlRequirement,
    buildHitlReason,
} from './platform';
export type { ToolCategory as PlatformToolCategory } from './platform';
