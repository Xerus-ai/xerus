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
    HeartbeatFiredEvent,
    HeartbeatSkippedEvent,
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
    ActiveHoursConfig,
    SessionState,
    CreditResponseCommand,
} from './runner.types';

// Transport configuration (used by daytona-runner.ts)
export type {
    RunnerConfig,
    McpServerConfig,
    HeartbeatConfig,
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

export { SessionManager } from './session-manager';

export { buildSoulAppend } from './soul-append-builder';

// CLI-native components (replacements for deleted SDK-based runner)
export { ProcessRegistry } from './process-registry';

export { detectAllAuth, detectAuthForAdapter, resolveBillingType } from './auth-detector';
export type { PlatformAuthStatus } from './auth-detector';

export { parseClaudeStreamLine, parseCodexStreamLine, clearAccumulator } from './stream-parser';

// CLI adapter types
export type {
    CLIAdapter,
    AdapterType,
    AgentConfig as CLIAgentConfig,
    AuthResult,
    BillingType,
} from './cli-adapters/types';

export { RunnerHealthMonitor, createRunnerHealthMonitor } from './health-monitor';
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
