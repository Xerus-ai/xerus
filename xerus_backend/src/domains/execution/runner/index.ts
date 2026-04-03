// Runner Module Exports
// CLI-native runner types and components for sandbox execution

// Protocol Types (canonical - unified event system)
export type {
    RunnerEventType,
    RunnerEventBase,
    RunnerEvent,
    AgentOutputEvent,
    SessionStartedEvent,
    SessionEndedEvent,
    AgentMessageEvent as RunnerAgentMessageEvent,
    HealthResponseEvent,
    SessionsListEvent as RunnerSessionsListEvent,
    CreditCheckEvent,
    ErrorEvent as RunnerV2ErrorEvent,
    SseForwardEvent,
    CreditUsageEvent,
    SessionAnalyticsEvent,
    UpdateAgentRunEvent,
    CreateInboxItemEvent,
    PushNotificationEvent,
    DelegationRecordEvent,
    HookLogEvent,
    AceReflectionEvent,
    SkillSuggestionEvent,
    SandboxLifecycleEvent,
    TriggerIndexingEvent,
    SubagentFailureEvent,
    ScaffoldCompleteEvent,
    ScaffoldFile,
    SessionInfo,
    AgentConfig as RunnerAgentConfig,
    SessionState,
    CreditResponseCommand,
} from './runner.types';

// Transport configuration (used by daytona-runner.ts)
export type {
    RunnerConfig,
    McpServerConfig,
} from './runner.types';
export { RUNNER_ENV } from './runner.types';

// v2 Persistent runner components
export { StdinParser } from './stdin-parser';
export type {
    StdinCommand,
    StdinCommandType,
    ScaffoldAgentCommand as StdinScaffoldAgentCommand,
} from './stdin-parser';

export { StdoutEmitter } from './stdout-emitter';
export type {
    StdoutEvent,
} from './stdout-emitter';

export { buildSoulAppend } from './soul-append-builder';

export { detectAllAuth, detectAuthForAdapter, resolveBillingType } from './auth-detector';
export type { PlatformAuthStatus, SandboxExecutor } from './auth-detector';

export { parseClaudeStreamLine, parseCodexStreamLine, clearAccumulator } from './stream-parser';

// CLI adapter types
export type {
    CLIAdapter,
    AdapterType,
    AgentConfig as CLIAgentConfig,
    AuthResult,
    CLIBillingType,
} from './cli-adapters/types';

export { RunnerHealthMonitor } from './health-monitor';
export type {
    RunnerHealthMonitorDeps,
    HealthMonitorConfig,
    RunnerCrashEvent,
    SandboxHealthStatus,
    HealthCheckResult,
} from './health-monitor';

export { SandboxMemoryExtractor, EXTRACTION_SYSTEM_PROMPT } from './sandbox-memory-extractor';
export type { SandboxMemoryExtractorOptions } from './sandbox-memory-extractor';

export { buildRuntimeHookHandlers } from './runtime-hook-factory';
export type { RuntimeHookContext } from './runtime-hook-factory';
