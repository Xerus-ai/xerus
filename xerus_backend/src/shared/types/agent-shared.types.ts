// Shared Agent Types
// Types used across agents and execution domains.
// Extracted to break circular dependency: agents <-> execution.

// -----------------------------------------------------------------------------
// Behaviour Configuration (from behaviour-config.md)
// Canonical source: was execution/types.ts, now shared to avoid circular deps.
// -----------------------------------------------------------------------------

export const THINKING_LEVELS = ['low', 'medium', 'high'] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const THINKING_TOKENS: Record<ThinkingLevel, number> = {
    low: 1024,
    medium: 8192,
    high: 32768,
};

export const AUTONOMY_LEVELS = ['supervised', 'semi_autonomous', 'autonomous'] as const;

export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

// SDK permission modes mapped from autonomy levels
export const PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions'] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const PERMISSION_MAP: Record<AutonomyLevel, PermissionMode> = {
    supervised: 'default',
    semi_autonomous: 'acceptEdits',
    autonomous: 'bypassPermissions',
};

// Default values for behaviour configuration
export const DEFAULT_THINKING_LEVEL: ThinkingLevel = 'medium';
export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = 'supervised';

// -----------------------------------------------------------------------------
// Agent Capabilities (used by agents domain and execution orchestrator)
// -----------------------------------------------------------------------------

export interface AgentPermissions {
    can_write_files: boolean;
    can_send_emails: boolean;
    can_create_tasks: boolean;
    max_tokens_per_request?: number;
}

export interface AgentConstraints {
    max_concurrent_tools: number;
    timeout_seconds: number;
    memory_types?: string[];
}

export interface ModelConfig {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
}

export interface StyleConfig {
    tone?: string;
    verbosity?: string;
    formality?: string;
}

export interface AgentCapabilities {
    skills: string[];
    permissions: AgentPermissions;
    constraints: AgentConstraints;
    model_config: ModelConfig;
    style: StyleConfig;
}
