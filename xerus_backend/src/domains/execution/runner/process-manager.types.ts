// Process Manager Types and Constants
// Type definitions for agent execution sessions and configuration

import type { SDKHooksRecord } from './hook-sdk-bridge';
import type { SubagentDefinition } from './agent-config-loader';

// -----------------------------------------------------------------------------
// Idle Watchdog Constants
// -----------------------------------------------------------------------------

/** Check interval for idle watchdog (60 seconds) */
export const IDLE_WATCHDOG_INTERVAL_MS = 60_000;

/** Force-terminate if no SDK messages for 5 minutes */
export const IDLE_WATCHDOG_TIMEOUT_MS = 300_000;

// -----------------------------------------------------------------------------
// System Prompt Types
// -----------------------------------------------------------------------------

export interface PresetSystemPrompt {
    type: 'preset';
    preset: 'claude_code';
    append?: string;
}

export type SystemPrompt = PresetSystemPrompt | string;

// -----------------------------------------------------------------------------
// Agent Configuration
// -----------------------------------------------------------------------------

export interface AgentConfig {
    agent_slug: string;
    system_prompt: SystemPrompt;
    model: string;
    tools: string[];
    max_turns: number;
    mcp_servers?: Record<string, unknown>;
    cwd: string;
    name?: string;
    description?: string;
    domain?: string;
    heartbeat?: Record<string, unknown>;
    hooks?: SDKHooksRecord;
    agents?: Record<string, SubagentDefinition>;
    autonomy_level?: string;
}

// -----------------------------------------------------------------------------
// Active Session State
// -----------------------------------------------------------------------------

export interface ActiveSession {
    agentSlug: string;
    queryHandle: AsyncIterable<unknown> | null;
    messageQueue: string[];
    resolveNext: ((msg: string) => void) | null;
    abortController: AbortController | null;
    startTime: number;
}
