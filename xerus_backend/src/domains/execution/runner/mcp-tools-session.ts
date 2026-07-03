// MCP Tool Definitions — Session & Platform Tools
// Tools 1-18: execution control, triggers, notifications, memory, schedules, billing, status.

export const SESSION_PLATFORM_TOOLS = [
    {
        name: 'pause_execution',
        description: 'Pause the current execution session. Used for human-in-the-loop approval workflows.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                session_id: { type: 'string', description: 'Execution session ID to pause' },
                reason: { type: 'string', description: 'Reason for pausing' },
                question: { type: 'string', description: 'Question to ask the user' },
            },
            required: ['session_id', 'reason'],
        },
    },
    {
        name: 'resume_execution',
        description: 'Resume a paused execution session after human approval.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                session_id: { type: 'string', description: 'Session ID to resume' },
                approved: { type: 'boolean', description: 'Whether the user approved' },
                feedback: { type: 'string', description: 'Optional user feedback' },
            },
            required: ['session_id', 'approved'],
        },
    },
    {
        name: 'get_session_state',
        description: 'Query the state of an execution session from the backend.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                session_id: { type: 'string', description: 'Session ID to query' },
            },
            required: ['session_id'],
        },
    },
    {
        name: 'complete_session',
        description: 'Signal that the current session is complete. Triggers backend cleanup and finalization.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                session_id: { type: 'string', description: 'Session ID to complete' },
                summary: { type: 'string', description: 'Completion summary' },
            },
            required: ['session_id'],
        },
    },
    {
        name: 'connect_tool',
        description: 'Connect an external tool via OAuth (Pipedream integration). Returns an auth URL for the user.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                tool_slug: { type: 'string', description: 'Tool identifier to connect' },
                agent_slug: { type: 'string', description: 'Agent requesting the connection' },
            },
            required: ['tool_slug'],
        },
    },
    {
        name: 'register_trigger',
        description: 'Register a webhook trigger for an agent. Returns a webhook URL that fires the agent.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                agent_slug: { type: 'string', description: 'Agent to trigger' },
                trigger_type: { type: 'string', description: 'Type of trigger (webhook, schedule, event)' },
                config: { type: 'object', description: 'Trigger configuration' },
            },
            required: ['agent_slug', 'trigger_type'],
        },
    },
    {
        name: 'deregister_trigger',
        description: 'Remove a registered webhook trigger.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                trigger_id: { type: 'string', description: 'Trigger ID to remove' },
            },
            required: ['trigger_id'],
        },
    },
    {
        name: 'send_notification',
        description: 'Send a notification to the user via the platform.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                message: { type: 'string', description: 'Notification message' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Priority level' },
                agent_slug: { type: 'string', description: 'Sending agent' },
            },
            required: ['message'],
        },
    },
    {
        name: 'search_tools',
        description: 'Search available tool integrations from connected accounts.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query' },
                category: { type: 'string', description: 'Tool category filter' },
            },
            required: ['query'],
        },
    },
    {
        name: 'query_memory',
        description: 'Search agent memories using semantic similarity. Returns relevant memory entries from the platform knowledge base.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query for semantic similarity' },
                scope: { type: 'string', enum: ['company', 'project', 'channel', 'agent'], description: 'Memory scope' },
                scope_id: { type: 'string', description: 'ID of the scope entity' },
                memory_type: { type: 'string', description: 'Filter by memory type' },
                limit: { type: 'number', description: 'Max results (default 10)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'analyze_memory_patterns',
        description: 'Analyze patterns across stored memories. Returns category counts, examples, and insights.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                scope: { type: 'string', enum: ['company', 'project', 'channel', 'agent'], description: 'Memory scope' },
                scope_id: { type: 'string', description: 'ID of the scope entity' },
                categories: { type: 'array', items: { type: 'string' }, description: 'Memory categories to analyze' },
            },
        },
    },
    {
        name: 'list_triggers',
        description: 'List all registered webhook triggers for agents.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                agent_slug: { type: 'string', description: 'Filter by agent slug' },
            },
        },
    },
    {
        name: 'get_status',
        description: 'Get current platform status including active agents, sandbox state, and system health.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                include_agents: { type: 'boolean', description: 'Include agent status details' },
                include_sandbox: { type: 'boolean', description: 'Include sandbox resource info' },
            },
        },
    },
    {
        name: 'create_schedule',
        description: 'Create a recurring schedule for an agent. The 9to5 scheduler daemon polls every 30s and spawns CLI processes for due schedules.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                agent_slug: { type: 'string', description: 'Agent slug to schedule' },
                name: { type: 'string', description: 'Human-readable schedule name (unique)' },
                prompt: { type: 'string', description: 'Prompt to execute on each run' },
                rrule: { type: 'string', description: 'RFC 5545 recurrence rule (e.g., FREQ=DAILY;BYHOUR=9;BYMINUTE=0)' },
                adapter_type: { type: 'string', enum: ['claudecode', 'codex'], description: 'CLI adapter (default: claudecode)' },
                model: { type: 'string', description: 'AI model (e.g., anthropic/claude-sonnet-4.6)' },
                max_budget_usd: { type: 'number', description: 'Max budget per run in USD' },
                allowed_tools: { type: 'array', items: { type: 'string' }, description: 'Tool allowlist' },
                system_prompt: { type: 'string', description: 'Additional system prompt' },
            },
            required: ['agent_slug', 'name', 'prompt'],
        },
    },
    {
        name: 'list_schedules',
        description: 'List all schedules, optionally filtered by agent or status.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                agent_slug: { type: 'string', description: 'Filter by agent slug' },
                status: { type: 'string', enum: ['active', 'paused'], description: 'Filter by status' },
            },
        },
    },
    {
        name: 'update_schedule',
        description: 'Update a schedule (name, prompt, rrule, status, model, budget, tools, system prompt).',
        inputSchema: {
            type: 'object' as const,
            properties: {
                schedule_id: { type: 'string', description: 'Schedule ID to update' },
                name: { type: 'string', description: 'New name' },
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
    },
    {
        name: 'delete_schedule',
        description: 'Delete a schedule by ID.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                schedule_id: { type: 'string', description: 'Schedule ID to delete' },
            },
            required: ['schedule_id'],
        },
    },
    {
        name: 'get_billing_status',
        description: 'Check billing status including plan type, credit balance, and subscription status.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
];
