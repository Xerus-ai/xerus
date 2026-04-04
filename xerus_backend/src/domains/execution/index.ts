// Execution Domain - Public API (barrel)

export * from './execution.service';
export * from './types';
export * from './errors';
// sandbox, storage, workspace, scaffold, metadata-sync extracted to domains/sandbox-infra/
// NOTE: Do NOT re-export sandbox-infra here. Import directly from '../sandbox-infra'.
export * from './sdk';
export * from './utils';
export * from './streaming';
export * from './queue';
export * from './hooks';
// knowledge module: KB docs written directly to Daytona workspace via Drive API
// credits module: extracted to standalone domain at src/domains/credits/
// Modules with selective exports to avoid name conflicts
export {
    RunnerHealthMonitor,
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
    SandboxExecutor,
    CLIAgentConfig,
    AdapterType,
    AuthResult,
    CLIBillingType,
} from './runner';

export { HITLHandler, HITLPauseRepositoryImpl, ActiveStreamEmitter } from './hitl';
export type { HITLPauseRepository, HITLSSEEmitter, HITLHandlerDeps } from './hitl';
export type { HITLRequest, HITLResponse, HITLPauseState, HITLResult, HITLScenario } from './hitl';

export * from './background';

// metadata-sync re-exports now come from sandbox-infra barrel

// Platform tools, orchestrator, and internal-mcp extracted to domains/platform-tools/
