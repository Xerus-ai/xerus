// Tool Filter - Orchestrator Restrictions
// Enforces tool access rules between orchestrator and specialist agents
// See: docs/planning/execution/subagents.md, docs/planning/tools/system-tools.md

import { DomainError } from '../../../utils/errors';

// -----------------------------------------------------------------------------
// Agent Types
// -----------------------------------------------------------------------------

const AGENT_TYPES = ['orchestrator', 'specialist'] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

// -----------------------------------------------------------------------------
// Tool Categories (from subagents.md and system-tools.md)
// -----------------------------------------------------------------------------

/**
 * Tools exclusive to the orchestrator (master Xerus).
 * Empty: TodoWrite and AskUserQuestion moved to COMMON_TOOLS so all
 * workspace agents can manage their own task lists (beads) and ask
 * the user when blocked — matching workspace SOP instructions.
 */
export const ORCHESTRATOR_ONLY_TOOLS = [] as const;


/**
 * Execution tools for specialist agents.
 * The orchestrator delegates work; it does not execute these directly.
 */
export const SPECIALIST_TOOLS = [
    'Read',           // Read files
    'Write',          // Write files
    'Edit',           // Edit files
    'Bash',           // Execute shell commands
    'Grep',           // Search file contents
    'Glob',           // Find files by pattern
    'WebSearch',      // Search the web
    'WebFetch',       // Fetch web content
    'NotebookEdit',   // Edit Jupyter notebooks
    'Skill',          // Execute skills
    'ToolSearch',     // Search deferred tools
    'SendMessage',    // Team communication
] as const;


/**
 * Platform tools exclusive to master Xerus orchestrator.
 * These manage the platform (agents, KB, channels, skills, tools).
 * Prefix: platform.*
 */
const PLATFORM_TOOL_PREFIXES = ['platform.'] as const;

/**
 * Tools that any agent type can use.
 * Task is here so all workspace agents can delegate to channel-mates.
 * TodoWrite and AskUserQuestion are here so agents can manage their own
 * task lists (beads) and escalate to the user when blocked.
 * SDK subagents (sub-subagents) still have Task stripped via sanitizeSubagentTools.
 */
export const COMMON_TOOLS = [
    'Task',           // Delegate to subagents (SDK native) - all workspace agents
    'TaskList',       // Read task list (SDK native)
    'TaskGet',        // Get task details (SDK native)
    'TaskUpdate',     // Update task status (SDK native)
    'TaskCreate',     // Create tasks (SDK native)
    'TodoWrite',      // Manage task lists / beads (SDK native) - all agents need this
    'AskUserQuestion', // Human-in-the-loop (SDK native) - agents can ask user when blocked
] as const;


// -----------------------------------------------------------------------------
// Tool Sets (for quick lookup)
// -----------------------------------------------------------------------------

const ORCHESTRATOR_ONLY_SET = new Set<string>(ORCHESTRATOR_ONLY_TOOLS);
const SPECIALIST_SET = new Set<string>(SPECIALIST_TOOLS);
const COMMON_SET = new Set<string>(COMMON_TOOLS);

// -----------------------------------------------------------------------------
// Validation Error
// -----------------------------------------------------------------------------

export class ToolAccessDeniedError extends DomainError {
    public readonly toolName: string;
    public readonly agentType: AgentType;
    public readonly reason: string;

    constructor(toolName: string, agentType: AgentType, reason: string) {
        super(
            `Tool '${toolName}' access denied for ${agentType} agent: ${reason}`,
            403,
            'TOOL_ACCESS_DENIED'
        );
        this.toolName = toolName;
        this.agentType = agentType;
        this.reason = reason;
    }
}

// -----------------------------------------------------------------------------
// Tool Validation Result
// -----------------------------------------------------------------------------

export interface ToolValidationResult {
    allowed: boolean;
    reason?: string;
}

// -----------------------------------------------------------------------------
// Filter Result
// -----------------------------------------------------------------------------

export interface ToolFilterResult {
    allowedTools: string[];
    deniedTools: Array<{ tool: string; reason: string }>;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

const SPECIALIST_ALLOWED_PLATFORM_TOOLS = new Set([
    'mcp__platform__create_task',
    'mcp__platform__update_task',
]);

function isPlatformTool(toolName: string): boolean {
    return PLATFORM_TOOL_PREFIXES.some(prefix => toolName.startsWith(prefix))
        || toolName.startsWith('mcp__platform__');
}

function isOrchestratorOnlyTool(toolName: string): boolean {
    return ORCHESTRATOR_ONLY_SET.has(toolName);
}

function isSpecialistTool(toolName: string): boolean {
    return SPECIALIST_SET.has(toolName);
}

function isCommonTool(toolName: string): boolean {
    return COMMON_SET.has(toolName);
}

// -----------------------------------------------------------------------------
// Core Validation Logic
// -----------------------------------------------------------------------------

/**
 * Validate if a specific tool is allowed for the given agent type.
 *
 * Rules:
 * - Orchestrator CAN use: platform.*, common tools (incl. Task, TodoWrite, AskUserQuestion)
 * - Orchestrator CANNOT use: Read, Write, Edit, Bash, etc. (specialist tools) — unless master
 * - Specialist CAN use: Read, Write, Edit, Bash, etc., common tools (incl. Task, TodoWrite, AskUserQuestion)
 * - Specialist CANNOT use: platform.* tools
 */
export function validateToolAccess(
    toolName: string,
    agentType: AgentType,
    isMasterOrchestrator: boolean = false
): ToolValidationResult {
    // Common tools are allowed for all agent types
    if (isCommonTool(toolName)) {
        return { allowed: true };
    }

    // Platform tools: master Xerus gets all, specialists get task tools only
    if (isPlatformTool(toolName)) {
        if (isMasterOrchestrator) {
            return { allowed: true };
        }
        if (SPECIALIST_ALLOWED_PLATFORM_TOOLS.has(toolName)) {
            return { allowed: true };
        }
        return {
            allowed: false,
            reason: 'Platform tools are exclusive to master Xerus orchestrator',
        };
    }

    if (agentType === 'orchestrator') {
        // Orchestrator can use its delegation tools
        if (isOrchestratorOnlyTool(toolName)) {
            return { allowed: true };
        }

        // Master orchestrator (Xerus) can use specialist tools directly.
        // It may need Read/Grep/Glob for context files, Bash for system commands,
        // and Agent for spawning subagents via SDK native teams.
        if (isMasterOrchestrator) {
            return { allowed: true };
        }

        // Non-master orchestrators cannot use specialist tools - they delegate
        if (isSpecialistTool(toolName)) {
            return {
                allowed: false,
                reason: 'Orchestrator delegates work to specialists; use Task tool to delegate',
            };
        }

        // Unknown tools (including MCP tools like mcp__gmail__send_email) are ALLOWED
        // MCP tools are dynamically registered by SDK and should pass through
        return { allowed: true };
    }

    if (agentType === 'specialist') {
        // Specialist cannot use orchestrator-only tools (no sub-subagents)
        if (isOrchestratorOnlyTool(toolName)) {
            return {
                allowed: false,
                reason: 'Specialists cannot spawn sub-subagents; report results to orchestrator',
            };
        }

        // Specialist can use its execution tools
        if (isSpecialistTool(toolName)) {
            return { allowed: true };
        }

        // Unknown tools (including MCP tools like mcp__gmail__send_email) are ALLOWED
        // MCP tools are dynamically registered by SDK and should pass through
        return { allowed: true };
    }

    // Unknown agent type - reject (fail-fast)
    return {
        allowed: false,
        reason: `Unknown agent type '${agentType}' - expected 'orchestrator' or 'specialist'`,
    };
}

// -----------------------------------------------------------------------------
// Filter Function
// -----------------------------------------------------------------------------

/**
 * Filter a list of requested tools based on agent type restrictions.
 *
 * @param agentType - The type of agent ('orchestrator' or 'specialist')
 * @param requestedTools - List of tool names the agent is requesting
 * @param isMasterOrchestrator - Whether this is the master Xerus (has platform.* access)
 * @returns ToolFilterResult with allowed and denied tools
 */
export function filterToolsForAgent(
    agentType: AgentType,
    requestedTools: string[],
    isMasterOrchestrator: boolean = false
): ToolFilterResult {
    const allowedTools: string[] = [];
    const deniedTools: Array<{ tool: string; reason: string }> = [];

    for (const tool of requestedTools) {
        const validation = validateToolAccess(tool, agentType, isMasterOrchestrator);

        if (validation.allowed) {
            allowedTools.push(tool);
        } else {
            deniedTools.push({
                tool,
                reason: validation.reason ?? 'Access denied',
            });
        }
    }

    return { allowedTools, deniedTools };
}

// -----------------------------------------------------------------------------
// Sanitization Functions
// -----------------------------------------------------------------------------

/**
 * Sanitize tools for SDK subagent definitions (NOT for workspace agents).
 * Strips Task to prevent sub-subagent recursion (SDK limitation).
 * Also strips platform.* tools (master-only).
 */
export function sanitizeSubagentTools(tools: string[]): string[] {
    return tools.filter(tool => !isOrchestratorOnlyTool(tool) && !isPlatformTool(tool) && tool !== 'Task');
}

/**
 * Build the default tool set for a specialist agent.
 * Includes all specialist tools plus common tools.
 */
export function buildSpecialistDefaultTools(): string[] {
    return [...SPECIALIST_TOOLS, ...COMMON_TOOLS];
}

/**
 * Build the default tool set for the orchestrator.
 * Includes common tools (TodoWrite, AskUserQuestion, Task, etc.).
 * Platform tools are added dynamically via the MCP server, not here.
 */
export function buildOrchestratorDefaultTools(): string[] {
    return [...COMMON_TOOLS];
}

// -----------------------------------------------------------------------------
// Validation at Execution Time
// -----------------------------------------------------------------------------

/**
 * Validate and potentially throw if a tool call is not allowed.
 * Called by PreToolUse hook before tool execution.
 *
 * @throws ToolAccessDeniedError if tool is not allowed
 */
export function assertToolAccess(
    toolName: string,
    agentType: AgentType,
    isMasterOrchestrator: boolean = false
): void {
    const validation = validateToolAccess(toolName, agentType, isMasterOrchestrator);

    if (!validation.allowed) {
        throw new ToolAccessDeniedError(
            toolName,
            agentType,
            validation.reason ?? 'Access denied'
        );
    }
}

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

export function isValidAgentType(type: string): type is AgentType {
    return AGENT_TYPES.includes(type as AgentType);
}

// -----------------------------------------------------------------------------
// Export Constants for External Use
// -----------------------------------------------------------------------------

export const TOOL_FILTER_CATEGORIES = {
    orchestratorOnly: ORCHESTRATOR_ONLY_TOOLS,
    specialist: SPECIALIST_TOOLS,
    platform: PLATFORM_TOOL_PREFIXES,
    common: COMMON_TOOLS,
} as const;
