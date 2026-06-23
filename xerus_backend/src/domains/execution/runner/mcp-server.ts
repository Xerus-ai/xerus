// Xerus Platform MCP Server
// MCP server with 38 backend-coupled tools that CLIs access
//
// 38 tools that require backend state:
//  1. pause_execution          — Session control (needs backend state machine)
//  2. resume_execution         — HITL approval (needs backend state)
//  3. get_session_state        — Distributed state query (needs backend DB)
//  4. complete_session         — Termination signal (needs backend cleanup)
//  5. connect_tool             — OAuth flow (needs Pipedream integration)
//  6. register_trigger         — Webhook provisioning (needs backend registration)
//  7. deregister_trigger       — Webhook cleanup (needs backend)
//  8. send_notification        — User notification (needs backend push)
//  9. search_tools             — Query connected accounts (needs Pipedream DB)
// 10. query_memory             — pgvector semantic search (needs Neon DB)
// 11. analyze_memory_patterns  — Memory analytics (needs pgvector)
// 12. list_triggers            — List registered webhooks (needs backend DB)
// 13. get_status               — Agent/sandbox status (needs backend DB)
// 14. create_schedule          — Create recurring schedule (workspace.db via sqlite3)
// 15. list_schedules           — List schedules (workspace.db via sqlite3)
// 16. update_schedule          — Update schedule (workspace.db via sqlite3)
// 17. delete_schedule          — Delete schedule (workspace.db via sqlite3)
// 18. get_billing_status       — Billing info (needs backend DB)
// 19. search_agents            — Agent discovery (needs backend DB + filesystem)
// 20. clone_agent              — Clone agent template (needs backend DB + filesystem)
// 21. create_agent             — Create new agent (needs backend DB + filesystem)
// 22. update_agent             — Update agent config (needs backend DB + filesystem)
// 23. search_kb                — KB document search (needs workspace filesystem)
// 24. upload_kb                — KB document upload (needs workspace filesystem)
// 25. assign_kb                — Assign KB to agent (needs backend DB)
// 26. create_channel           — Create inbox channel (needs workspace DB)
// 27. add_to_channel           — Add agent to channel (needs backend DB + filesystem)
// 28. create_task              — Create task in channel (needs workspace DB)
// 29. search_skills            — Skill discovery (needs backend DB + filesystem)
// 30. create_skill             — Create new skill (needs workspace filesystem)
// 31. write_memory             — Write memory entry (needs pgvector + filesystem)
// 32. search_outputs           — Search output registry (needs workspace filesystem)
// 33. delete_agent             — Delete agent (needs backend DB + filesystem)
// 34. list_agents              — List all agents (needs backend DB + filesystem)
// 35. list_domains             — List projects/domains (needs workspace DB)
// 36. install_skill            — Install skill on agent (needs backend DB + filesystem)
// 37. uninstall_skill          — Remove skill from agent (needs backend DB + filesystem)
// 38. cancel_execution         — Cancel running execution (needs backend state machine)
//
// Reference: Paperclip adapter pattern (agent calls MCP -> MCP calls backend API)

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// -----------------------------------------------------------------------------
// Backend API Errors (fail-fast pattern)
// -----------------------------------------------------------------------------

class BackendApiError extends Error {
    public readonly statusCode: number;
    public readonly path: string;
    public readonly responseBody?: string;

    constructor(path: string, statusCode: number, message: string, responseBody?: string) {
        super(message);
        this.name = 'BackendApiError';
        this.path = path;
        this.statusCode = statusCode;
        this.responseBody = responseBody;
    }
}

class BackendNetworkError extends Error {
    public readonly path: string;
    public readonly cause: Error;

    constructor(path: string, cause: Error) {
        super(`Backend call to ${path} failed: ${cause.message}`);
        this.name = 'BackendNetworkError';
        this.path = path;
        this.cause = cause;
    }
}

// Backend API URL — platform routes that handle the actual operations
const BACKEND_URL = process.env.XERUS_BACKEND_URL || 'http://localhost:5001';

// Fail-fast: require XERUS_BACKEND_TOKEN in production
const BACKEND_TOKEN = process.env.XERUS_BACKEND_TOKEN;
if (!BACKEND_TOKEN && process.env.NODE_ENV === 'production') {
    throw new Error('XERUS_BACKEND_TOKEN is required in production');
}

// User ID injected by workspace-personalizer into .claude/settings.json env
// The MCP server inherits it from the Claude Code process environment
const USER_ID = process.env.XERUS_USER_ID;
if (!USER_ID && process.env.NODE_ENV === 'production') {
    throw new Error('XERUS_USER_ID is required — set via .claude/settings.json env');
}

// -----------------------------------------------------------------------------
// Tool Definitions
// -----------------------------------------------------------------------------

export const TOOLS = [
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
    // Schedule Management (4) — workspace.db via backend proxy
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
    // Billing (1) — read-only billing status from backend DB
    {
        name: 'get_billing_status',
        description: 'Check billing status including plan type, credit balance, and subscription status.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    // Agent Management (4) — backend DB + sandbox filesystem
    {
        name: 'search_agents',
        description: 'Search agents by name, capability, or category.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query' },
                scope: { type: 'string', enum: ['mine', 'marketplace', 'all'], description: 'Search scope' },
                category: { type: 'string', description: 'Filter by agent category' },
            },
            required: ['query'],
        },
    },
    {
        name: 'clone_agent',
        description: 'Clone an agent template to create a customized agent.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                source_agent_id: { type: 'string', description: 'ID of the agent to clone' },
                name: { type: 'string', description: 'Name for the new agent' },
                customizations: { type: 'object', description: 'Optional customizations for the cloned agent' },
            },
            required: ['source_agent_id', 'name'],
        },
    },
    {
        name: 'create_agent',
        description: 'Create a new agent with custom configuration.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Agent display name' },
                slug: { type: 'string', description: 'URL-safe identifier (auto-generated if omitted)' },
                description: { type: 'string', description: 'What this agent does' },
                system_prompt: { type: 'string', description: 'System prompt defining agent behavior and identity' },
                model_id: { type: 'string', description: 'LLM model (default: claude-sonnet)' },
                autonomy_level: { type: 'string', enum: ['supervised', 'semi_autonomous', 'autonomous'], description: 'How much human oversight the agent requires' },
                tool_slugs: { type: 'array', items: { type: 'string' }, description: 'Pipedream app slugs to assign' },
                skill_slugs: { type: 'array', items: { type: 'string' }, description: 'Skill slugs to install on the agent' },
                kb_collection_ids: { type: 'array', items: { type: 'string' }, description: 'KB collections to assign' },
                channels: { type: 'array', items: { type: 'string' }, description: 'Channel slugs to add the agent to so it is visible in those channels. Without this the agent is created but appears in no channel.' },
                primary_channel: { type: 'string', description: 'Slug of the agent primary channel (made the channel lead if the channel has none). Defaults to the first entry of channels.' },
            },
            required: ['name', 'description', 'system_prompt'],
        },
    },
    {
        name: 'update_agent',
        description: 'Update an existing agent configuration (name, description, system prompt, model, autonomy level).',
        inputSchema: {
            type: 'object' as const,
            properties: {
                agent_id: { type: 'string', description: 'ID of the agent to update' },
                name: { type: 'string', description: 'New agent display name' },
                description: { type: 'string', description: 'New agent description' },
                system_prompt: { type: 'object', description: 'System prompt fields to update (partial update)' },
                model_id: { type: 'string', description: 'LLM model override' },
                autonomy_level: { type: 'string', enum: ['supervised', 'semi_autonomous', 'autonomous'], description: 'Autonomy level override' },
            },
            required: ['agent_id'],
        },
    },
    // Knowledge Base (3) — workspace filesystem
    {
        name: 'search_kb',
        description: 'Search knowledge base documents.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query' },
                collection_id: { type: 'string', description: 'Limit search to a specific collection' },
                limit: { type: 'number', description: 'Maximum number of results (default 10)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'upload_kb',
        description: 'Upload a document to the knowledge base.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Document title' },
                content: { type: 'string', description: 'Document content (text/markdown)' },
                file_path: { type: 'string', description: 'Path to file in workspace (alternative to content)' },
                collection_id: { type: 'string', description: 'Target KB collection (uses default if omitted)' },
            },
            required: ['title'],
        },
    },
    {
        name: 'assign_kb',
        description: 'Assign a knowledge base document or collection to an agent.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                agent_id: { type: 'string', description: 'Target agent ID' },
                document_id: { type: 'string', description: 'KB document to assign' },
                collection_id: { type: 'string', description: 'Or assign an entire collection' },
                permission: { type: 'string', enum: ['read', 'read_write'], description: 'Access permission level' },
            },
            required: ['agent_id'],
        },
    },
    // Channels & Tasks (3) — workspace DB
    {
        name: 'create_channel',
        description: 'Create a channel in the inbox for organizing agent work.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Channel name (e.g., seo, content, bugs)' },
                project_id: { type: 'string', description: 'Parent project (uses default if omitted)' },
                description: { type: 'string', description: 'Channel description' },
                agent_ids: { type: 'array', items: { type: 'string' }, description: 'Agent IDs to add initially' },
            },
            required: ['name'],
        },
    },
    {
        name: 'add_to_channel',
        description: 'Add an agent to a channel.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                channel_id: { type: 'string', description: 'Channel ID' },
                agent_id: { type: 'string', description: 'Agent ID to add' },
                role: { type: 'string', enum: ['member', 'lead'], description: 'Role in the channel' },
            },
            required: ['channel_id', 'agent_id'],
        },
    },
    {
        name: 'create_task',
        description: 'Create a task in a channel with agent assignments.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                channel_id: { type: 'string', description: 'Channel to create the task in' },
                title: { type: 'string', description: 'Task title' },
                description: { type: 'string', description: 'Task description' },
                assigned_agent_ids: { type: 'array', items: { type: 'string' }, description: 'Agent IDs to assign' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Task priority' },
                subtasks: { type: 'array', items: { type: 'string' }, description: 'Checklist items for the task' },
            },
            required: ['channel_id', 'title'],
        },
    },
    // Skills (2) — backend DB + workspace filesystem
    {
        name: 'search_skills',
        description: 'Search skills by name, capability, or category.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query' },
                scope: { type: 'string', enum: ['system', 'marketplace', 'mine', 'all'], description: 'Search scope' },
            },
            required: ['query'],
        },
    },
    {
        name: 'create_skill',
        description: 'Create a new skill with instructions and optional scripts.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Skill name (lowercase, hyphenated)' },
                description: { type: 'string', description: 'When to use this skill' },
                instructions: { type: 'string', description: 'SKILL.md content (full instructions)' },
                agent_id: { type: 'string', description: 'Assign to a specific agent (optional)' },
                category: { type: 'string', description: 'Skill category' },
            },
            required: ['name', 'description', 'instructions'],
        },
    },
    // Memory (1) — pgvector + filesystem (write_memory; query_memory already exists above)
    {
        name: 'write_memory',
        description: 'Write a memory entry with explicit scope.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                content: { type: 'string', description: 'Memory content to store' },
                scope: { type: 'string', enum: ['company', 'project', 'channel', 'agent'], description: 'Memory scope' },
                scope_id: { type: 'string', description: 'ID of the scope entity' },
                memory_type: { type: 'string', description: 'Type of memory (e.g., session_memory, learned_preference)' },
                file_path: { type: 'string', description: 'Optional custom file path within .memory/' },
            },
            required: ['content', 'scope'],
        },
    },
    // Output Registry (1) — workspace filesystem
    {
        name: 'search_outputs',
        description: 'Search the output registry by task, agent, type, or date range.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                task_id: { type: 'string', description: 'Associate results with this task ID' },
                agent_id: { type: 'string', description: 'Filter by agent ID' },
                output_type: { type: 'string', description: 'Filter by output type (e.g., file, artifact, report)' },
                date_from: { type: 'string', description: 'Start date (ISO 8601 format)' },
                date_to: { type: 'string', description: 'End date (ISO 8601 format)' },
                limit: { type: 'number', description: 'Maximum number of results (default 20)' },
            },
        },
    },
    // Parity Tools (6) — agent lifecycle, skill management, execution control
    {
        name: 'delete_agent',
        description: 'Delete an agent by ID or slug. Removes agent config, soul files, and registry entry.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                agent_id: { type: 'string', description: 'Agent ID to delete' },
                agent_slug: { type: 'string', description: 'Agent slug to delete (alternative to agent_id)' },
            },
        },
    },
    {
        name: 'list_agents',
        description: 'List all agents accessible to the current user. No search required.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
    },
    {
        name: 'list_domains',
        description: 'List all projects and domains in the workspace.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
    },
    {
        name: 'install_skill',
        description: 'Install a marketplace skill onto an agent.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                skill_slug: { type: 'string', description: 'Skill slug to install' },
                agent_id: { type: 'string', description: 'Agent to install the skill on (optional)' },
            },
            required: ['skill_slug'],
        },
    },
    {
        name: 'uninstall_skill',
        description: 'Remove a skill from an agent.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                skill_slug: { type: 'string', description: 'Skill slug to uninstall' },
                agent_id: { type: 'string', description: 'Agent to remove the skill from (optional)' },
            },
            required: ['skill_slug'],
        },
    },
    {
        name: 'cancel_execution',
        description: 'Cancel a running execution session. Sends termination signal to the agent process.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                session_id: { type: 'string', description: 'Execution session ID to cancel' },
            },
            required: ['session_id'],
        },
    },
];

// -----------------------------------------------------------------------------
// Backend API Proxy (fail-fast pattern)
// -----------------------------------------------------------------------------

async function callBackendApi(
    path: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    // Inject user_id into every request — backend middleware requires it
    const enrichedBody = { ...body, user_id: USER_ID };

    let response: Response;
    try {
        response = await fetch(`${BACKEND_URL}/api/v1/internal${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(BACKEND_TOKEN ? { Authorization: `Bearer ${BACKEND_TOKEN}` } : {}),
            },
            body: JSON.stringify(enrichedBody),
            signal: AbortSignal.timeout(30_000),
        });
    } catch (err) {
        if (err instanceof DOMException && err.name === 'TimeoutError') {
            throw new BackendApiError(path, 504, `Backend call to ${path} timed out after 30s`);
        }
        throw new BackendNetworkError(path, err as Error);
    }

    if (!response.ok) {
        const text = await response.text();
        throw new BackendApiError(
            path,
            response.status,
            `Backend returned ${response.status}: ${text}`,
            text
        );
    }

    return response.json();
}

// -----------------------------------------------------------------------------
// MCP Server Setup
// -----------------------------------------------------------------------------

const server = new Server(
    { name: 'platform', version: '2.0.0' },
    { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolArgs = (args || {}) as Record<string, unknown>;

    try {
        const data = await callBackendApi(`/mcp/${name}`, toolArgs);

        return {
            content: [{
                type: 'text' as const,
                text: typeof data === 'string'
                    ? data
                    : JSON.stringify(data, null, 2),
            }],
        };
    } catch (error) {
        // Format errors for MCP response (errors are caught here, not swallowed)
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: 'text' as const, text: `Error: ${errorMessage}` }],
            isError: true,
        };
    }
});

// -----------------------------------------------------------------------------
// Start Server
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('[mcp-server] Running with 38 backend-coupled tools\n');
}

main().catch((err) => {
    process.stderr.write(`[mcp-server] Fatal error: ${err}\n`);
    process.exit(1);
});
