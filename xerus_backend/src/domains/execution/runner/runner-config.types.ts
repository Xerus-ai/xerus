// Runner Configuration Types
// Agent configuration, session state, and transport types
// Used by runner process for agent management and sandbox setup

// -----------------------------------------------------------------------------
// Agent Configuration
// Canonical AgentConfig is in process-manager.ts (used by runner)
// This file retains supporting config types only
// -----------------------------------------------------------------------------

export interface HeartbeatConfig {
    enabled: boolean;
    interval_minutes: number;
    offset_minutes?: number;
}

export interface ActiveHoursConfig {
    timezone: string;
    start_hour: number;
    end_hour: number;
    days: number[];
}

export interface McpServerConfig {
    type: 'http' | 'stdio';
    url?: string;
    command?: string;
    args?: string[];
    headers?: Record<string, string>;
}

// -----------------------------------------------------------------------------
// Session State (persisted to .xerus-sessions.json by runner)
// -----------------------------------------------------------------------------

export interface SessionState {
    agent_slug: string;
    session_id: string;
    started_at: string;
    status: 'active' | 'idle';
    last_activity: string;
}

// -----------------------------------------------------------------------------
// Transport Configuration
// Used by daytona-runner.ts to pass initial config to runner process
// Runner reads full config from agents/{slug}/config.json after startup
// -----------------------------------------------------------------------------

export interface RunnerConfig {
    agentId: number;
    agentSlug: string;
    userId: string;
    workspacePath: string;
    model: string;
    tools: string[];
    maxTurns: number;
    mcpServers?: Record<string, McpServerConfig>;
    sessionId?: string;
}

export const RUNNER_ENV = {
    CONFIG: 'XERUS_RUNNER_CONFIG',
    PROMPT: 'XERUS_RUNNER_PROMPT',
    ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
    ANTHROPIC_BASE_URL: 'ANTHROPIC_BASE_URL',
    ANTHROPIC_AUTH_TOKEN: 'ANTHROPIC_AUTH_TOKEN',
} as const;
