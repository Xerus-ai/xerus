// Sandbox Module Exports
// Default provider: Daytona (persistence, volumes, preview URLs)
// SDK runs INSIDE sandbox - see docs/planning/execution/architecture.md

export { SandboxService, SandboxDatabase } from './sandbox.service';
export {
    SandboxSchedulerService,
    SandboxSchedulerDeps,
    SchedulerDatabase,
    SleepEvalResult,
    WakeResult,
    SchedulerStats,
} from './sandbox-scheduler.service';
export { SANDBOX_CONFIG, RETRY_CONFIG, RETRYABLE_ERROR_CODES, RetryableErrorCode } from './sandbox.config';
export { withRetry } from './sandbox.retry';
export {
    SandboxSession,
    SandboxRegistryEntry,
    CreateSandboxOptions,
    SandboxOperationResult,
    SandboxStatusResponse,
    SandboxMetrics,
} from './sandbox.types';

// Provider exports
export {
    SandboxProvider,
    ProviderSandbox,
    CreateProviderSandboxOptions,
    ProviderSandboxStatus,
    ProviderCapabilities,
    ProviderType,
    PROVIDER_TYPES,
    createProvider,
    getDefaultProvider,
    clearProviderCache,
    isDaytonaConfigured,
} from './providers';

// DaytonaProvider type export (use createProvider('daytona') for instance)
export type { DaytonaProvider, DaytonaCreateOptions, RunAgentOptions, RunAgentResult } from './providers';

// Runner installer
export { installRunnerBundle } from './runner-installer';
export type { RunnerInstallResult } from './runner-installer';

// Workspace health check
export { verifyWorkspaceHealth, ensureWorkspaceIntegrity } from './workspace-health';
export type { HealthCheckResult } from './workspace-health';

// Session transport exports (for bidirectional communication)
export type { SessionHandle, AgentSessionOptions } from './providers';
export { PersistentLogBuffer, sendCommand, sendMessage, createAgentSession, createRunnerSession, streamEvents } from './providers';

// Session dispatcher (bridges MessageBridge -> SandboxService agent sessions)
export { createSessionDispatcher } from './session-dispatcher';

// Snapshot helpers
export { createWorkspaceTar, restoreWorkspaceTar } from './snapshot-helpers';

// Lifecycle cleanup
export {
    LifecycleCleanupService,
    createLifecycleCleanupService,
} from './lifecycle-cleanup.service';
export type {
    LifecycleCleanupDeps,
    CleanupConfig,
    CleanupResult,
    FullCleanupResult,
    CleanupDatabase,
    CleanupSandboxControl,
    CleanupUserLookup,
} from './lifecycle-cleanup.service';
