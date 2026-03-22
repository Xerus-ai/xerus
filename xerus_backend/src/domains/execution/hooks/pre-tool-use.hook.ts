// PreToolUse Hook
// Validates tool access and evaluates HITL rules before tool execution.
// Runs INSIDE the runner process (sandbox), NOT on backend.
//
// Decision pipeline:
//   1. Check allowed_tools list (agent config)
//   2. Validate agent type restrictions (orchestrator vs specialist)
//   3. Evaluate HITL rules (platform tools only)
//   4. Log hook execution

import { PreToolUseInput, PreToolUseOutput, HookResult } from './hooks.types';
import { validateToolAccess } from '../orchestrator/tool.filter';
import { evaluateHitlRule } from '../platform/hitl-rules';
import type { AgentType } from '../orchestrator/tool.filter';
import type { AutonomyLevel } from '../types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PreToolUseContext {
    agent_id: number;
    agent_slug: string;
    user_id: string;
    agent_type: AgentType;
    is_master_orchestrator: boolean;
    allowed_tools: string[];
    autonomy_level: AutonomyLevel;
}

export interface HookExecutionRecord {
    hook_event: 'PreToolUse';
    agent_id: number;
    user_id: string;
    tool_name: string;
    blocked: boolean;
    decision: 'allow' | 'deny' | 'ask';
    reason?: string;
    session_id: string;
    timestamp: string;
}

export interface HookExecutionLogger {
    logExecution(record: HookExecutionRecord): Promise<void>;
}

export interface PreToolUseHandlerDeps {
    hookExecutionLogger: HookExecutionLogger;
}

// -----------------------------------------------------------------------------
// PreToolUse Handler
// -----------------------------------------------------------------------------

export class PreToolUseHandler {
    private readonly deps: PreToolUseHandlerDeps;
    private readonly context: PreToolUseContext;

    constructor(deps: PreToolUseHandlerDeps, context: PreToolUseContext) {
        this.deps = deps;
        this.context = context;
    }

    async handle(input: PreToolUseInput): Promise<HookResult> {
        // 1. Check allowed_tools list (empty = unrestricted)
        const allowedToolsResult = this.checkAllowedTools(input.tool_name);
        if (allowedToolsResult) {
            await this.logDecision(input, allowedToolsResult);
            return { success: true, hook_specific_output: allowedToolsResult };
        }

        // 2. Validate agent type restrictions
        const accessResult = this.checkAgentTypeAccess(input.tool_name);
        if (accessResult) {
            await this.logDecision(input, accessResult);
            return { success: true, hook_specific_output: accessResult };
        }

        // 3. Evaluate HITL rules (applies to platform tools)
        const hitlResult = this.evaluateHitlRules(input);
        await this.logDecision(input, hitlResult);
        return { success: true, hook_specific_output: hitlResult };
    }

    // -------------------------------------------------------------------------
    // Private: Decision Pipeline
    // -------------------------------------------------------------------------

    /**
     * Check if tool is in the agent's allowed_tools list.
     * Returns null if allowed (continue pipeline), or PreToolUseOutput if denied.
     * Empty allowed_tools = unrestricted (no filtering).
     *
     * MCP tools (prefixed with mcp__) are dynamically registered by the SDK from
     * MCP servers and won't appear in the static allowed_tools list. They are
     * skipped here and validated by checkAgentTypeAccess() instead.
     */
    private checkAllowedTools(toolName: string): PreToolUseOutput | null {
        if (this.context.allowed_tools.length === 0) {
            return null;
        }

        // MCP tools are dynamically registered by SDK; not in static allowed_tools.
        // Access control for MCP tools is handled by checkAgentTypeAccess().
        if (toolName.startsWith('mcp__')) {
            return null;
        }

        if (this.context.allowed_tools.includes(toolName)) {
            return null;
        }

        return {
            hook_event_name: 'PreToolUse',
            permission_decision: 'deny',
            permission_decision_reason: `Tool '${toolName}' is not in allowed tools for agent '${this.context.agent_slug}'`,
        };
    }

    /**
     * Validate tool access based on agent type (orchestrator vs specialist).
     * Returns null if allowed (continue pipeline), or PreToolUseOutput if denied.
     */
    private checkAgentTypeAccess(toolName: string): PreToolUseOutput | null {
        const validation = validateToolAccess(
            toolName,
            this.context.agent_type,
            this.context.is_master_orchestrator
        );

        if (validation.allowed) {
            return null;
        }

        return {
            hook_event_name: 'PreToolUse',
            permission_decision: 'deny',
            permission_decision_reason: `Access denied: ${validation.reason}`,
        };
    }

    /**
     * Evaluate HITL rules for platform tools.
     * Non-platform tools are auto-approved by evaluateHitlRule.
     */
    private evaluateHitlRules(input: PreToolUseInput): PreToolUseOutput {
        return evaluateHitlRule(input);
    }

    // -------------------------------------------------------------------------
    // Private: Logging
    // -------------------------------------------------------------------------

    private async logDecision(
        input: PreToolUseInput,
        output: PreToolUseOutput
    ): Promise<void> {
        const record: HookExecutionRecord = {
            hook_event: 'PreToolUse',
            agent_id: this.context.agent_id,
            user_id: this.context.user_id,
            tool_name: input.tool_name,
            blocked: output.permission_decision !== 'allow',
            decision: output.permission_decision,
            reason: output.permission_decision_reason,
            session_id: input.session_id,
            timestamp: new Date().toISOString(),
        };

        try {
            await this.deps.hookExecutionLogger.logExecution(record);
        } catch (error) {
            // Logging is auxiliary - do not fail hook execution
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[PreToolUseHook] Failed to log execution:', message);
        }
    }
}
