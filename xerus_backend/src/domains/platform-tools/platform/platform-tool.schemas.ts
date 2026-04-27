// Platform Tool Schemas - JSON Schema definitions for platform.* tools
// 27 platform tools. Delegation handled by SDK-native tools (Task, TeamCreate, etc.)
// Metadata in platform-tool.registry.ts

import { PLATFORM_TOOLS } from './platform-tool.inlined-types';
import type { ToolSchema } from './platform-tool.types';

// -- Agent Management (4) ----------------------------------------------------

export const SEARCH_AGENTS_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.SEARCH_AGENTS,
    description: 'Search agents by name, capability, or category.',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search query' },
            scope: { type: 'string', description: 'Search scope', enum: ['mine', 'marketplace', 'all'], default: 'all' },
            category: { type: 'string', description: 'Filter by agent category' },
        },
        required: ['query'],
    },
};

export const CLONE_AGENT_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.CLONE_AGENT,
    description: 'Clone an agent template to create a customized agent.',
    inputSchema: {
        type: 'object',
        properties: {
            source_agent_id: { type: 'string', description: 'ID of the agent to clone' },
            name: { type: 'string', description: 'Name for the new agent' },
            customizations: {
                type: 'object',
                description: 'Optional customizations for the cloned agent',
                properties: {
                    description: { type: 'string', description: 'New description' },
                    system_prompt: { type: 'object', description: 'System prompt overrides', properties: {} },
                    model_id: { type: 'string', description: 'LLM model override' },
                    autonomy_level: {
                        type: 'string',
                        description: 'Autonomy level override',
                        enum: ['supervised', 'semi_autonomous', 'autonomous'],
                    },
                },
            },
        },
        required: ['source_agent_id', 'name'],
    },
};

export const CREATE_AGENT_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.CREATE_AGENT,
    description: 'Create a new agent with custom configuration.',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Agent display name' },
            slug: { type: 'string', description: 'URL-safe identifier (auto-generated if omitted)' },
            description: { type: 'string', description: 'What this agent does' },
            system_prompt: { type: 'string', description: 'System prompt defining agent behavior and identity' },
            model_id: { type: 'string', description: 'LLM model (default: claude-sonnet)', default: 'claude-sonnet' },
            autonomy_level: {
                type: 'string',
                description: 'How much human oversight the agent requires',
                enum: ['supervised', 'semi_autonomous', 'autonomous'],
                default: 'semi_autonomous',
            },
            tool_slugs: { type: 'array', items: { type: 'string' }, description: 'Pipedream app slugs to assign' },
            skill_slugs: { type: 'array', items: { type: 'string' }, description: 'Skill slugs to install on the agent' },
            kb_collection_ids: { type: 'array', items: { type: 'string' }, description: 'KB collections to assign' },
        },
        required: ['name', 'description', 'system_prompt'],
    },
};

export const UPDATE_AGENT_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.UPDATE_AGENT,
    description: 'Update an existing agent configuration (name, description, system prompt, model, autonomy level).',
    inputSchema: {
        type: 'object',
        properties: {
            agent_id: { type: 'string', description: 'ID of the agent to update' },
            name: { type: 'string', description: 'New agent display name' },
            description: { type: 'string', description: 'New agent description' },
            system_prompt: {
                type: 'object',
                description: 'System prompt fields to update (partial update)',
                properties: {
                    identity: { type: 'string', description: 'Who the agent is' },
                    goals: { type: 'string', description: 'What the agent should accomplish' },
                    capabilities: { type: 'string', description: 'What the agent can do' },
                    guidelines: { type: 'string', description: 'How the agent should behave' },
                    constraints: { type: 'string', description: 'What the agent must not do' },
                    personality: { type: 'string', description: 'Agent personality traits' },
                },
            },
            model_id: { type: 'string', description: 'LLM model override' },
            autonomy_level: {
                type: 'string',
                description: 'Autonomy level override',
                enum: ['supervised', 'semi_autonomous', 'autonomous'],
            },
        },
        required: ['agent_id'],
    },
};

// -- Knowledge Base (3) ------------------------------------------------------

export const SEARCH_KB_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.SEARCH_KB,
    description: 'Search knowledge base documents.',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search query' },
            collection_id: { type: 'string', description: 'Limit search to a specific collection' },
            limit: { type: 'number', description: 'Maximum number of results', default: 10 },
        },
        required: ['query'],
    },
};

export const UPLOAD_KB_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.UPLOAD_KB,
    description: 'Upload a document to the knowledge base.',
    inputSchema: {
        type: 'object',
        properties: {
            title: { type: 'string', description: 'Document title' },
            content: { type: 'string', description: 'Document content (text/markdown)' },
            file_path: { type: 'string', description: 'Path to file in workspace (alternative to content)' },
            collection_id: { type: 'string', description: 'Target KB collection (uses default if omitted)' },
        },
        required: ['title'],
    },
};

export const ASSIGN_KB_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.ASSIGN_KB,
    description: 'Assign a knowledge base document or collection to an agent.',
    inputSchema: {
        type: 'object',
        properties: {
            agent_id: { type: 'string', description: 'Target agent ID' },
            document_id: { type: 'string', description: 'KB document to assign' },
            collection_id: { type: 'string', description: 'Or assign an entire collection' },
            permission: { type: 'string', description: 'Access permission level', enum: ['read', 'read_write'], default: 'read' },
        },
        required: ['agent_id'],
    },
};

// -- Channels & Tasks (3) ----------------------------------------------------

export const CREATE_CHANNEL_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.CREATE_CHANNEL,
    description: 'Create a channel in the inbox for organizing agent work.',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Channel name (e.g., seo, content, bugs)' },
            project_id: { type: 'string', description: 'Parent project (uses default if omitted)' },
            description: { type: 'string', description: 'Channel description' },
            agent_ids: { type: 'array', items: { type: 'string' }, description: 'Agent IDs to add initially' },
        },
        required: ['name'],
    },
};

export const ADD_TO_CHANNEL_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.ADD_TO_CHANNEL,
    description: 'Add an agent to a channel.',
    inputSchema: {
        type: 'object',
        properties: {
            channel_id: { type: 'string', description: 'Channel ID' },
            agent_id: { type: 'string', description: 'Agent ID to add' },
            role: { type: 'string', description: 'Role in the channel', enum: ['member', 'lead'], default: 'member' },
        },
        required: ['channel_id', 'agent_id'],
    },
};

export const CREATE_TASK_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.CREATE_TASK,
    description: 'Create a task in a channel with agent assignments.',
    inputSchema: {
        type: 'object',
        properties: {
            channel_id: { type: 'string', description: 'Channel to create the task in' },
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
            assigned_agent_ids: { type: 'array', items: { type: 'string' }, description: 'Agent IDs to assign' },
            priority: { type: 'string', description: 'Task priority', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
            subtasks: { type: 'array', items: { type: 'string' }, description: 'Checklist items for the task' },
        },
        required: ['channel_id', 'title'],
    },
};

// -- Skills (2) ---------------------------------------------------------------

export const CREATE_SKILL_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.CREATE_SKILL,
    description: 'Create a new skill with instructions and optional scripts.',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Skill name (lowercase, hyphenated)' },
            description: { type: 'string', description: 'When to use this skill' },
            instructions: { type: 'string', description: 'SKILL.md content (full instructions)' },
            agent_id: { type: 'string', description: 'Assign to a specific agent (optional)' },
            category: { type: 'string', description: 'Skill category' },
        },
        required: ['name', 'description', 'instructions'],
    },
};

export const SEARCH_SKILLS_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.SEARCH_SKILLS,
    description: 'Search skills by name, capability, or category.',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search query' },
            scope: { type: 'string', description: 'Search scope', enum: ['system', 'marketplace', 'mine', 'all'], default: 'all' },
        },
        required: ['query'],
    },
};

// -- Tools & Integrations (2) ------------------------------------------------

export const SEARCH_TOOLS_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.SEARCH_TOOLS,
    description: 'Search available tool integrations.',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search query (e.g., email, slack, spreadsheet)' },
            agent_id: { type: 'string', description: 'Show connection status for this agent' },
        },
        required: ['query'],
    },
};

export const CONNECT_TOOL_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.CONNECT_TOOL,
    description: 'Connect a tool integration to an agent. Returns OAuth URL if needed.',
    inputSchema: {
        type: 'object',
        properties: {
            agent_id: { type: 'string', description: 'Agent to connect tool for' },
            app_slug: { type: 'string', description: 'Pipedream app slug (e.g., gmail, slack)' },
        },
        required: ['agent_id', 'app_slug'],
    },
};

// -- Notifications (1) --------------------------------------------------------

export const SEND_NOTIFICATION_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.SEND_NOTIFICATION,
    description: 'Send a notification to the user via the platform.',
    inputSchema: {
        type: 'object',
        properties: {
            message: { type: 'string', description: 'Notification message' },
            priority: { type: 'string', description: 'Priority level', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
            agent_slug: { type: 'string', description: 'Sending agent slug' },
        },
        required: ['message'],
    },
};

// -- Status (1) ---------------------------------------------------------------

export const GET_STATUS_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.GET_STATUS,
    description: 'Get status of agents, teams, tasks, or the workspace.',
    inputSchema: {
        type: 'object',
        properties: {
            scope: { type: 'string', description: 'What to get status for', enum: ['agent', 'team', 'task', 'channel', 'workspace'] },
            id: { type: 'string', description: 'Specific entity ID (returns overview if omitted)' },
            include_activity: { type: 'boolean', description: 'Include recent activity log', default: false },
        },
        required: ['scope'],
    },
};

// -- Session Control (3) ------------------------------------------------------

export const PAUSE_EXECUTION_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.PAUSE_EXECUTION,
    description: 'Pause a running execution session, optionally saving a checkpoint for later resume.',
    inputSchema: {
        type: 'object',
        properties: {
            session_id: { type: 'string', description: 'ID of the execution session to pause' },
            reason: { type: 'string', description: 'Reason for pausing (e.g., "awaiting_approval", "rate_limited")' },
            checkpoint: { type: 'object', description: 'State checkpoint to save for resume', properties: {} },
        },
        required: ['session_id'],
    },
};

export const RESUME_EXECUTION_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.RESUME_EXECUTION,
    description: 'Resume a paused execution session with approval or rejection.',
    inputSchema: {
        type: 'object',
        properties: {
            session_id: { type: 'string', description: 'ID of the paused execution session' },
            approved: { type: 'boolean', description: 'Whether to approve and resume (true) or reject (false)' },
            feedback: { type: 'string', description: 'Optional feedback for the agent' },
        },
        required: ['session_id', 'approved'],
    },
};

export const GET_SESSION_STATE_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.GET_SESSION_STATE,
    description: 'Get the current state of an execution session including status and checkpoint.',
    inputSchema: {
        type: 'object',
        properties: {
            session_id: { type: 'string', description: 'ID of the execution session' },
            include_checkpoint: { type: 'boolean', description: 'Include saved checkpoint data', default: false },
        },
        required: ['session_id'],
    },
};

// -- Memory Operations (3) ----------------------------------------------------

export const QUERY_MEMORY_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.QUERY_MEMORY,
    description: 'Search memory entries using semantic search with scope filtering.',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search query for semantic memory search' },
            scope: { type: 'string', description: 'Memory scope filter', enum: ['company', 'project', 'channel', 'agent'] },
            scope_id: { type: 'string', description: 'ID of the scope entity (project_id, channel_id, or agent_id)' },
            memory_type: { type: 'string', description: 'Filter by memory type (e.g., "session_memory", "project_context")' },
            limit: { type: 'number', description: 'Maximum number of results', default: 10 },
        },
        required: ['query'],
    },
};

export const WRITE_MEMORY_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.WRITE_MEMORY,
    description: 'Write a memory entry with explicit scope.',
    inputSchema: {
        type: 'object',
        properties: {
            content: { type: 'string', description: 'Memory content to store' },
            scope: { type: 'string', description: 'Memory scope', enum: ['company', 'project', 'channel', 'agent'] },
            scope_id: { type: 'string', description: 'ID of the scope entity' },
            memory_type: { type: 'string', description: 'Type of memory (e.g., "session_memory", "learned_preference")' },
            file_path: { type: 'string', description: 'Optional custom file path within .memory/' },
        },
        required: ['content', 'scope'],
    },
};

export const ANALYZE_MEMORY_PATTERNS_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.ANALYZE_MEMORY_PATTERNS,
    description: 'Trigger pattern discovery across memories to identify insights and trends.',
    inputSchema: {
        type: 'object',
        properties: {
            scope: { type: 'string', description: 'Scope to analyze', enum: ['company', 'project', 'channel', 'agent'] },
            scope_id: { type: 'string', description: 'ID of the scope entity' },
            categories: {
                type: 'array',
                items: { type: 'string' },
                description: 'Categories to analyze (default: all 6 categories)',
            },
        },
        required: [],
    },
};

// -- Trigger Management (3) ---------------------------------------------------

export const REGISTER_TRIGGER_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.REGISTER_TRIGGER,
    description: 'Register an event trigger for an agent. Provisions a webhook endpoint.',
    inputSchema: {
        type: 'object',
        properties: {
            agent_id: { type: 'string', description: 'Agent ID to receive trigger events' },
            app_slug: { type: 'string', description: 'External app identifier (e.g., "stripe", "github", "slack")' },
            event_type: { type: 'string', description: 'Event type to listen for (e.g., "invoice.created", "push")' },
            filter_config: { type: 'object', description: 'Event filtering rules', properties: {} },
        },
        required: ['agent_id', 'app_slug', 'event_type'],
    },
};

export const LIST_TRIGGERS_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.LIST_TRIGGERS,
    description: 'List registered triggers for an agent.',
    inputSchema: {
        type: 'object',
        properties: {
            agent_id: { type: 'string', description: 'Agent ID to list triggers for' },
            enabled: { type: 'boolean', description: 'Filter by enabled status' },
        },
        required: ['agent_id'],
    },
};

export const DEREGISTER_TRIGGER_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.DEREGISTER_TRIGGER,
    description: 'Remove a trigger and cleanup its webhook endpoint.',
    inputSchema: {
        type: 'object',
        properties: {
            trigger_id: { type: 'number', description: 'ID of the trigger to remove' },
        },
        required: ['trigger_id'],
    },
};

// -- Output Registry (1) ------------------------------------------------------

export const SEARCH_OUTPUTS_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.SEARCH_OUTPUTS,
    description: 'Search the output registry by task, agent, type, or date range.',
    inputSchema: {
        type: 'object',
        properties: {
            task_id: { type: 'string', description: 'Associate results with this task ID' },
            agent_id: { type: 'string', description: 'Filter by agent ID' },
            output_type: { type: 'string', description: 'Filter by output type (e.g., "file", "artifact", "report")' },
            date_from: { type: 'string', description: 'Start date (ISO 8601 format)' },
            date_to: { type: 'string', description: 'End date (ISO 8601 format)' },
            limit: { type: 'number', description: 'Maximum number of results', default: 20 },
        },
        required: [],
    },
};

// -- Billing (1) ---------------------------------------------------------------

export const GET_BILLING_STATUS_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.GET_BILLING_STATUS,
    description: 'Get billing status for the current user including plan, credits, and subscription details.',
    inputSchema: {
        type: 'object',
        properties: {},
        required: [],
    },
};

// -- Session Completion (1) ----------------------------------------------------

export const COMPLETE_SESSION_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.COMPLETE_SESSION,
    description: 'Signal that the current agent session is complete with an optional reason and status.',
    inputSchema: {
        type: 'object',
        properties: {
            reason: { type: 'string', description: 'Why the session is complete (e.g. "Report delivered")' },
            status: { type: 'string', enum: ['success', 'failure', 'partial'], description: 'Outcome status. Defaults to success.' },
            summary: { type: 'string', description: 'Brief summary of work accomplished' },
        },
        required: [],
    },
};

// -- Schedule Management (4) --------------------------------------------------

export const CREATE_SCHEDULE_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.CREATE_SCHEDULE,
    description: 'Create a recurring schedule for an agent. The scheduler daemon polls every 30s and spawns CLI processes for due schedules.',
    inputSchema: {
        type: 'object',
        properties: {
            agent_slug: { type: 'string', description: 'Agent slug to schedule' },
            name: { type: 'string', description: 'Human-readable schedule name (unique)' },
            prompt: { type: 'string', description: 'Prompt to execute on each run' },
            rrule: { type: 'string', description: 'RFC 5545 recurrence rule (e.g., FREQ=DAILY;BYHOUR=9;BYMINUTE=0)' },
            adapter_type: { type: 'string', enum: ['claudecode', 'codex'], description: 'CLI adapter (default: claudecode)' },
            model: { type: 'string', description: 'AI model to use (e.g., anthropic/claude-sonnet-4.6)' },
            max_budget_usd: { type: 'number', description: 'Maximum budget per run in USD' },
            allowed_tools: { type: 'array', items: { type: 'string' }, description: 'Tool allowlist (omit for all tools)' },
            system_prompt: { type: 'string', description: 'Additional system prompt appended to agent prompt' },
        },
        required: ['agent_slug', 'name', 'prompt'],
    },
};

export const LIST_SCHEDULES_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.LIST_SCHEDULES,
    description: 'List all schedules, optionally filtered by agent or status.',
    inputSchema: {
        type: 'object',
        properties: {
            agent_slug: { type: 'string', description: 'Filter by agent slug' },
            status: { type: 'string', enum: ['active', 'paused'], description: 'Filter by status' },
        },
        required: [],
    },
};

export const UPDATE_SCHEDULE_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.UPDATE_SCHEDULE,
    description: 'Update a schedule (name, prompt, rrule, status, model, budget, tools, system prompt).',
    inputSchema: {
        type: 'object',
        properties: {
            schedule_id: { type: 'string', description: 'Schedule ID to update' },
            name: { type: 'string', description: 'New schedule name' },
            prompt: { type: 'string', description: 'New prompt' },
            rrule: { type: 'string', description: 'New recurrence rule' },
            status: { type: 'string', enum: ['active', 'paused'], description: 'Pause or activate' },
            model: { type: 'string', description: 'New model' },
            max_budget_usd: { type: 'number', description: 'New budget cap' },
            allowed_tools: { type: 'array', items: { type: 'string' }, description: 'New tool allowlist' },
            system_prompt: { type: 'string', description: 'New system prompt' },
        },
        required: ['schedule_id'],
    },
};

export const DELETE_SCHEDULE_SCHEMA: ToolSchema = {
    name: PLATFORM_TOOLS.DELETE_SCHEDULE,
    description: 'Delete a schedule by ID.',
    inputSchema: {
        type: 'object',
        properties: {
            schedule_id: { type: 'string', description: 'Schedule ID to delete' },
        },
        required: ['schedule_id'],
    },
};

// -- Schema Collections -------------------------------------------------------

export const PLATFORM_TOOL_SCHEMAS: readonly ToolSchema[] = [
    // Agent Management (4)
    SEARCH_AGENTS_SCHEMA, CLONE_AGENT_SCHEMA, CREATE_AGENT_SCHEMA, UPDATE_AGENT_SCHEMA,
    // Knowledge Base (3)
    SEARCH_KB_SCHEMA, UPLOAD_KB_SCHEMA, ASSIGN_KB_SCHEMA,
    // Channels & Tasks (3)
    CREATE_CHANNEL_SCHEMA, ADD_TO_CHANNEL_SCHEMA, CREATE_TASK_SCHEMA,
    // Skills (2)
    CREATE_SKILL_SCHEMA, SEARCH_SKILLS_SCHEMA,
    // Tools & Integrations (2)
    SEARCH_TOOLS_SCHEMA, CONNECT_TOOL_SCHEMA,
    // Notifications (1)
    SEND_NOTIFICATION_SCHEMA,
    // Status (1)
    GET_STATUS_SCHEMA,
    // Session Control (3)
    PAUSE_EXECUTION_SCHEMA, RESUME_EXECUTION_SCHEMA, GET_SESSION_STATE_SCHEMA,
    // Memory Operations (3)
    QUERY_MEMORY_SCHEMA, WRITE_MEMORY_SCHEMA, ANALYZE_MEMORY_PATTERNS_SCHEMA,
    // Trigger Management (3)
    REGISTER_TRIGGER_SCHEMA, LIST_TRIGGERS_SCHEMA, DEREGISTER_TRIGGER_SCHEMA,
    // Output Registry (1)
    SEARCH_OUTPUTS_SCHEMA,
    // Billing (1)
    GET_BILLING_STATUS_SCHEMA,
    // Session Completion (1)
    COMPLETE_SESSION_SCHEMA,
    // Schedule Management (4)
    CREATE_SCHEDULE_SCHEMA, LIST_SCHEDULES_SCHEMA, UPDATE_SCHEDULE_SCHEMA, DELETE_SCHEDULE_SCHEMA,
] as const;

export const ALL_TOOL_SCHEMAS: readonly ToolSchema[] = [
    ...PLATFORM_TOOL_SCHEMAS,
] as const;
