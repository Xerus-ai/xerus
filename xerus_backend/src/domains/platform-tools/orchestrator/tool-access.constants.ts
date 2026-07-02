// Canonical tool access constants — single source of truth for prompt and filter.
// Both agent-config-resolver.ts (prompt rendering) and tool.filter.ts (runtime enforcement)
// MUST import from here to prevent prompt/runtime drift.

const PLATFORM_PREFIX = 'mcp__platform__';

/**
 * Platform tools available to ALL agents (orchestrator + specialist).
 * These are the 21 tools every agent's prompt advertises.
 * Changing this list changes both the prompt AND the runtime filter.
 */
export const COMMON_PLATFORM_TOOL_NAMES = [
    'create_task',
    'update_task',
    'search_agents',
    'list_agents',
    'search_kb',
    'query_memory',
    'write_memory',
    'analyze_memory_patterns',
    'search_outputs',
    'send_notification',
    'get_status',
    'get_billing_status',
    'search_skills',
    'search_tools',
    'list_domains',
    'list_triggers',
    'list_schedules',
    'pause_execution',
    'resume_execution',
    'get_session_state',
    'complete_session',
    'cancel_execution',
] as const;

export const COMMON_PLATFORM_TOOLS = COMMON_PLATFORM_TOOL_NAMES.map(
    t => `${PLATFORM_PREFIX}${t}`,
);

/**
 * Platform tools exclusive to the orchestrator (master Xerus).
 * These manage workspace structure: agents, channels, KB, skills, tools, schedules.
 */
export const ORCHESTRATOR_ONLY_PLATFORM_TOOL_NAMES = [
    'create_agent',
    'clone_agent',
    'update_agent',
    'delete_agent',
    'create_channel',
    'add_to_channel',
    'upload_kb',
    'assign_kb',
    'create_skill',
    'install_skill',
    'uninstall_skill',
    'connect_tool',
    'register_trigger',
    'deregister_trigger',
    'create_schedule',
    'update_schedule',
    'delete_schedule',
] as const;

export const ORCHESTRATOR_ONLY_PLATFORM_TOOLS = ORCHESTRATOR_ONLY_PLATFORM_TOOL_NAMES.map(
    t => `${PLATFORM_PREFIX}${t}`,
);

/**
 * All platform tools for the orchestrator (union of orchestrator-only + common).
 */
export const ALL_ORCHESTRATOR_PLATFORM_TOOLS = [
    ...ORCHESTRATOR_ONLY_PLATFORM_TOOLS,
    ...COMMON_PLATFORM_TOOLS,
];
