// Minimal MCP Server (CLI-Native Pivot)
// Lightweight MCP server with 9 backend-coupled tools that CLIs access
// Replaces the 34-tool platform-mcp-server.ts — most tools are now native CLI ops
//
// 9 tools that require backend state:
// 1. pause_execution     — Session control (needs backend state machine)
// 2. resume_execution    — HITL approval (needs backend state)
// 3. get_session_state   — Distributed state query (needs backend DB)
// 4. complete_session    — Termination signal (needs backend cleanup)
// 5. connect_tool        — OAuth flow (needs Pipedream integration)
// 6. register_trigger    — Webhook provisioning (needs backend registration)
// 7. deregister_trigger  — Webhook cleanup (needs backend)
// 8. send_notification   — User notification (needs backend push)
// 9. search_tools        — Query connected accounts (needs Pipedream DB)
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

// -----------------------------------------------------------------------------
// Tool Definitions
// -----------------------------------------------------------------------------

const TOOLS = [
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
];

// -----------------------------------------------------------------------------
// Backend API Proxy (fail-fast pattern)
// -----------------------------------------------------------------------------

async function callBackendApi(
    path: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    let response: Response;
    try {
        response = await fetch(`${BACKEND_URL}/api/v1/internal${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(BACKEND_TOKEN ? { Authorization: `Bearer ${BACKEND_TOKEN}` } : {}),
            },
            body: JSON.stringify(body),
        });
    } catch (err) {
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
    { name: 'xerus-platform', version: '2.0.0' },
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
    console.error('[minimal-mcp-server] Running with 9 backend-coupled tools');
}

main().catch((err) => {
    console.error('[minimal-mcp-server] Fatal error:', err);
    process.exit(1);
});
