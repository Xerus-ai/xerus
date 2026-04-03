// Platform HITL Rules
// Evaluates HITL (Human-in-the-Loop) approval rules for platform.* tools.
// Source: docs/planning/tools/system-tools.md HITL table
//
// Rules:
//   - search/status tools: auto-approve always
//   - create_agent/clone_agent/update_agent: always require user confirmation
//   - create_skill: always require user review of SKILL.md content
//   - connect_tool: always require user OAuth
//   - upload_kb: auto-approve if content < 1MB, ask otherwise
//   - Destructive ops (delete): NOT provided as tools

import {
    PLATFORM_TOOLS,
    PLATFORM_TOOL_HITL,
    PLATFORM_TOOL_LIST,
} from './platform-tool.inlined-types';
import type {
    HITLRequirement,
    PlatformTool,
} from './platform-tool.inlined-types';
import type { PreToolUseInput, PreToolUseOutput } from '../hooks/hooks.types';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const UPLOAD_KB_SIZE_LIMIT_BYTES = 1_048_576; // 1MB

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Evaluate the HITL rule for a tool call and return a PreToolUse decision.
 * Non-platform tools are allowed by default (not governed by these rules).
 */
export function evaluateHitlRule(input: PreToolUseInput): PreToolUseOutput {
    const { tool_name, tool_input } = input;

    if (!isPlatformTool(tool_name)) {
        return createAllowOutput(`${tool_name} is not a platform tool; auto-approved`);
    }

    const requirement = PLATFORM_TOOL_HITL[tool_name as PlatformTool];

    switch (requirement) {
        case 'auto':
            return createAllowOutput(buildHitlReason(tool_name, tool_input));

        case 'always':
            return createAskOutput(tool_name, tool_input);

        case 'conditional':
            return evaluateConditionalRule(tool_name, tool_input);

        default:
            return createAllowOutput(`${tool_name} auto-approved (no rule defined)`);
    }
}

/**
 * Get the HITL requirement for a tool name.
 * Returns null for non-platform tools.
 */
export function getHitlRequirement(toolName: string): HITLRequirement | null {
    if (!isPlatformTool(toolName)) {
        return null;
    }
    return PLATFORM_TOOL_HITL[toolName as PlatformTool];
}

/**
 * Build a human-readable reason for the HITL decision.
 */
export function buildHitlReason(
    toolName: string,
    toolInput: Record<string, unknown>
): string {
    switch (toolName) {
        case PLATFORM_TOOLS.CREATE_AGENT:
            return `Requires confirmation to create agent '${toolInput.name ?? 'unnamed'}'`;

        case PLATFORM_TOOLS.CLONE_AGENT:
            return `Requires confirmation to clone agent as '${toolInput.name ?? 'unnamed'}'`;

        case PLATFORM_TOOLS.UPDATE_AGENT:
            return `Requires confirmation to update agent '${toolInput.agent_id ?? 'unknown'}'`;

        case PLATFORM_TOOLS.CREATE_SKILL:
            return `Requires user review of SKILL.md for skill '${toolInput.name ?? 'unnamed'}'`;

        case PLATFORM_TOOLS.CONNECT_TOOL:
            return `Requires user OAuth authorization for '${toolInput.app_slug ?? 'unknown'}' integration`;

        case PLATFORM_TOOLS.UPLOAD_KB: {
            const contentSize = estimateContentSize(toolInput);
            if (contentSize !== null && contentSize > UPLOAD_KB_SIZE_LIMIT_BYTES) {
                return `Upload '${toolInput.title ?? 'untitled'}' exceeds 1MB limit (${formatBytes(contentSize)}); requires confirmation`;
            }
            if (toolInput.file_path) {
                return `Upload from file '${toolInput.file_path}' requires confirmation (size unknown)`;
            }
            return `Upload '${toolInput.title ?? 'untitled'}' auto-approved (within size limit)`;
        }

        // Session Control
        case PLATFORM_TOOLS.PAUSE_EXECUTION:
            return `Pause execution '${toolInput.session_id ?? 'unknown'}' auto-approved`;

        case PLATFORM_TOOLS.RESUME_EXECUTION:
            return `Requires user approval to resume execution '${toolInput.session_id ?? 'unknown'}'`;

        case PLATFORM_TOOLS.GET_SESSION_STATE:
            return `Get session state '${toolInput.session_id ?? 'unknown'}' auto-approved`;

        // Memory Operations
        case PLATFORM_TOOLS.QUERY_MEMORY:
            return `Query memory '${toolInput.query ?? ''}' auto-approved`;

        case PLATFORM_TOOLS.WRITE_MEMORY:
            return `Write memory to scope '${toolInput.scope ?? 'company'}' auto-approved`;

        case PLATFORM_TOOLS.ANALYZE_MEMORY_PATTERNS:
            return `Analyze memory patterns auto-approved`;

        // Trigger Management
        case PLATFORM_TOOLS.REGISTER_TRIGGER:
            return `Requires confirmation to register trigger '${toolInput.app_slug ?? 'unknown'}.${toolInput.event_type ?? 'unknown'}' for agent`;

        case PLATFORM_TOOLS.LIST_TRIGGERS:
            return `List triggers for agent '${toolInput.agent_id ?? 'unknown'}' auto-approved`;

        case PLATFORM_TOOLS.DEREGISTER_TRIGGER:
            return `Deregister trigger '${toolInput.trigger_id ?? 'unknown'}' auto-approved`;

        // Output Registry
        case PLATFORM_TOOLS.SEARCH_OUTPUTS:
            return `Search outputs auto-approved`;

        // Session Completion
        case PLATFORM_TOOLS.COMPLETE_SESSION:
            return `Complete session auto-approved`;

        // Schedule Management
        case PLATFORM_TOOLS.CREATE_SCHEDULE:
            return `Create schedule '${toolInput.name ?? 'unnamed'}' for agent '${toolInput.agent_slug ?? 'unknown'}' auto-approved`;

        case PLATFORM_TOOLS.LIST_SCHEDULES:
            return `List schedules auto-approved`;

        case PLATFORM_TOOLS.UPDATE_SCHEDULE:
            return `Update schedule '${toolInput.schedule_id ?? 'unknown'}' auto-approved`;

        case PLATFORM_TOOLS.DELETE_SCHEDULE:
            return `Delete schedule '${toolInput.schedule_id ?? 'unknown'}' auto-approved`;

        default:
            return `${toolName} auto-approved`;
    }
}

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

function isPlatformTool(toolName: string): boolean {
    return (PLATFORM_TOOL_LIST as readonly string[]).includes(toolName);
}

function createAllowOutput(reason: string): PreToolUseOutput {
    return {
        hook_event_name: 'PreToolUse',
        permission_decision: 'allow',
        permission_decision_reason: reason,
    };
}

function createAskOutput(
    toolName: string,
    toolInput: Record<string, unknown>
): PreToolUseOutput {
    const reason = buildHitlReason(toolName, toolInput);
    const requiresAuth = toolName === PLATFORM_TOOLS.CONNECT_TOOL;

    return {
        hook_event_name: 'PreToolUse',
        permission_decision: 'ask',
        permission_decision_reason: reason,
        ...(requiresAuth && { requires_auth: true }),
    };
}

function evaluateConditionalRule(
    toolName: string,
    toolInput: Record<string, unknown>
): PreToolUseOutput {
    if (toolName === PLATFORM_TOOLS.UPLOAD_KB) {
        return evaluateUploadKbRule(toolInput);
    }

    // No other conditional rules defined; default to ask
    return createAskOutput(toolName, toolInput);
}

function evaluateUploadKbRule(toolInput: Record<string, unknown>): PreToolUseOutput {
    // File path uploads always require confirmation (size unknown at evaluation time)
    if (toolInput.file_path) {
        return createAskOutput(PLATFORM_TOOLS.UPLOAD_KB, toolInput);
    }

    const contentSize = estimateContentSize(toolInput);

    if (contentSize !== null && contentSize > UPLOAD_KB_SIZE_LIMIT_BYTES) {
        return createAskOutput(PLATFORM_TOOLS.UPLOAD_KB, toolInput);
    }

    return createAllowOutput(buildHitlReason(PLATFORM_TOOLS.UPLOAD_KB, toolInput));
}

function estimateContentSize(toolInput: Record<string, unknown>): number | null {
    if (typeof toolInput.content === 'string') {
        return Buffer.byteLength(toolInput.content, 'utf-8');
    }
    return null;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes}B`;
    }
    if (bytes < 1_048_576) {
        return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${(bytes / 1_048_576).toFixed(1)}MB`;
}
