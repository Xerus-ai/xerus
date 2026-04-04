// Sandbox Providers Module Exports
// Daytona is the production provider (persistence, volumes, preview URLs)
// SDK runs INSIDE sandbox - see docs/planning/execution/architecture.md

export {
    SandboxProvider,
    ProviderSandbox,
    CreateProviderSandboxOptions,
    ProviderSandboxStatus,
    ProviderCapabilities,
    ProviderType,
    PROVIDER_TYPES,
} from './sandbox-provider.interface';

// DaytonaProvider is the primary provider
// Import directly from './daytona.provider' when needed for extended features
export type { DaytonaProvider, DaytonaCreateOptions, RunAgentOptions, RunAgentResult } from './daytona.provider';

// File system adapter for workspace operations inside Daytona sandbox
export { createDaytonaFileSystem } from './daytona-filesystem';

// Session transport exports (for direct session control)
export type { SessionHandle, AgentSessionOptions } from './daytona-runner';
export { PersistentLogBuffer, sendCommand, sendMessage, createAgentSession, streamEvents } from './daytona-runner';

export {
    createProvider,
    getDefaultProvider,
    clearProviderCache,
    isDaytonaConfigured,
    ProviderFactoryConfig,
} from './provider-factory';
