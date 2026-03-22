// Xerus Master Constants
// Slug names, delegation limits, heartbeat intervals, platform tool names, HITL requirements

import type { PlatformTool } from './xerus-master.tool-types';

// -----------------------------------------------------------------------------
// Xerus Master Constants
// -----------------------------------------------------------------------------

export const XERUS_MASTER_SLUG = 'xerus-master';
export const XERUS_MASTER_NAME = 'Xerus';
export const XERUS_CTO_SLUG = 'xerus-cto';

// Maximum delegation constraints
export const MAX_DELEGATION_DEPTH = 3;
export const MAX_DELEGATIONS_PER_REQUEST = 5;
export const MAX_PARALLEL_DELEGATIONS = 2;
export const DEFAULT_DELEGATED_TOKEN_BUDGET = 50000;

// Heartbeat intervals (in minutes)
export const HEARTBEAT_INTERVALS = {
    quick: 15,
    hourly: 60,
    daily: 1440,
    weekly: 10080,
} as const;

// -----------------------------------------------------------------------------
// Platform Tools (Master Exclusive)
// -----------------------------------------------------------------------------

export const PLATFORM_TOOLS = {
    // Agent Management (6)
    SEARCH_AGENTS: 'platform.search_agents',
    CLONE_AGENT: 'platform.clone_agent',
    CREATE_AGENT: 'platform.create_agent',
    UPDATE_AGENT: 'platform.update_agent',
    DELETE_AGENT: 'platform.delete_agent',
    LIST_AGENTS: 'platform.list_agents',

    // Knowledge Base (3)
    SEARCH_KB: 'platform.search_kb',
    UPLOAD_KB: 'platform.upload_kb',
    ASSIGN_KB: 'platform.assign_kb',

    // Channels & Tasks (4)
    LIST_DOMAINS: 'platform.list_domains',
    CREATE_CHANNEL: 'platform.create_channel',
    ADD_TO_CHANNEL: 'platform.add_to_channel',
    CREATE_TASK: 'platform.create_task',

    // Skills (3)
    SEARCH_SKILLS: 'platform.search_skills',
    CREATE_SKILL: 'platform.create_skill',
    INSTALL_SKILL: 'platform.install_skill',

    // Tools & Integrations (2)
    SEARCH_TOOLS: 'platform.search_tools',
    CONNECT_TOOL: 'platform.connect_tool',

    // Status (1)
    GET_STATUS: 'platform.get_status',

    // Heartbeat (1)
    CONFIGURE_HEARTBEAT: 'platform.configure_heartbeat',

    // Session Control (3) - Agent-native parity for execution management
    PAUSE_EXECUTION: 'platform.pause_execution',
    RESUME_EXECUTION: 'platform.resume_execution',
    GET_SESSION_STATE: 'platform.get_session_state',

    // Memory Operations (3) - Agent-native parity for memory management
    QUERY_MEMORY: 'platform.query_memory',
    WRITE_MEMORY: 'platform.write_memory',
    ANALYZE_MEMORY_PATTERNS: 'platform.analyze_memory_patterns',

    // Trigger Management (3) - Agent-native parity for webhook/event management
    REGISTER_TRIGGER: 'platform.register_trigger',
    LIST_TRIGGERS: 'platform.list_triggers',
    DEREGISTER_TRIGGER: 'platform.deregister_trigger',

    // Output Registry (1) - Agent-native parity for output search
    SEARCH_OUTPUTS: 'platform.search_outputs',

    // Notifications (1)
    SEND_NOTIFICATION: 'platform.send_notification',

    // Session Completion (1) - Agent-initiated session completion
    COMPLETE_SESSION: 'platform.complete_session',
} as const;

export const PLATFORM_TOOL_LIST = Object.values(PLATFORM_TOOLS);

// -----------------------------------------------------------------------------
// HITL Requirements for Platform Tools
// -----------------------------------------------------------------------------

export type HITLRequirement = 'auto' | 'always' | 'conditional';

export const PLATFORM_TOOL_HITL: Record<PlatformTool, HITLRequirement> = {
    // Agent Management
    'platform.search_agents': 'auto',
    'platform.clone_agent': 'always',
    'platform.create_agent': 'always',
    'platform.update_agent': 'always',
    'platform.delete_agent': 'always', // Destructive — requires user approval
    'platform.list_agents': 'auto',
    // Knowledge Base
    'platform.search_kb': 'auto',
    'platform.upload_kb': 'conditional', // Auto if < 1MB
    'platform.assign_kb': 'auto',
    // Channels & Tasks
    'platform.list_domains': 'auto',
    'platform.create_channel': 'auto',
    'platform.add_to_channel': 'auto',
    'platform.create_task': 'auto',
    // Skills
    'platform.search_skills': 'auto',
    'platform.create_skill': 'always',
    'platform.install_skill': 'always', // Installs files into workspace
    // Tools & Integrations
    'platform.search_tools': 'auto',
    'platform.connect_tool': 'always', // OAuth requires user
    // Status
    'platform.get_status': 'auto',
    // Heartbeat
    'platform.configure_heartbeat': 'always',
    // Session Control
    'platform.pause_execution': 'auto', // Agent can self-pause
    'platform.resume_execution': 'always', // Requires user approval
    'platform.get_session_state': 'auto',
    // Memory Operations
    'platform.query_memory': 'auto',
    'platform.write_memory': 'auto',
    'platform.analyze_memory_patterns': 'auto',
    // Trigger Management
    'platform.register_trigger': 'always', // Creates external webhook
    'platform.list_triggers': 'auto',
    'platform.deregister_trigger': 'auto',
    // Output Registry
    'platform.search_outputs': 'auto',
    // Notifications
    'platform.send_notification': 'auto', // Sends to user inbox
    // Session Completion
    'platform.complete_session': 'auto',
};

// -----------------------------------------------------------------------------
// Delegation Budget
// -----------------------------------------------------------------------------

export interface DelegationBudget {
    maxDelegations: number;
    maxParallel: number;
    maxTokensDelegated: number;
}

export const DEFAULT_DELEGATION_BUDGET: DelegationBudget = {
    maxDelegations: MAX_DELEGATIONS_PER_REQUEST,
    maxParallel: MAX_PARALLEL_DELEGATIONS,
    maxTokensDelegated: DEFAULT_DELEGATED_TOKEN_BUDGET,
};
