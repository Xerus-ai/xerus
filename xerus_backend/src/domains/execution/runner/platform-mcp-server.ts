#!/usr/bin/env node
// Platform MCP Server
// Uses SDK-native createSdkMcpServer + tool() helpers for proper MCP integration.
// Provides all 27 canonical platform tools + 7 utility tools (34 total) to Xerus master.
// In-process mode: metadata_sync events route through StdoutEmitter (correct channel + format)
// Standalone mode: metadata_sync events write to process.stdout (MCP protocol pipe)
//
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 4, Section 10, Section 12
// SDK docs: https://docs.claude.com/en/api/agent-sdk/typescript (Custom Tools)

import { z } from 'zod';

// SDK is ESM-only — dynamic import avoids require() errors when backend (CJS) loads this module.
// These are resolved at call time inside the sandbox, not at import time on the backend.
let _sdkLoaded = false;
let _createSdkMcpServer: typeof import('@anthropic-ai/claude-agent-sdk').createSdkMcpServer;
let _tool: typeof import('@anthropic-ai/claude-agent-sdk').tool;

async function loadSdkHelpers(): Promise<void> {
    if (_sdkLoaded) return;
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    _createSdkMcpServer = sdk.createSdkMcpServer;
    _tool = sdk.tool;
    _sdkLoaded = true;
}
import {
    handleCreateWorkspace,
    handleCreateDomain,
    handleCreateChannel,
    handleCreateAgent,
    handleUpdateAgent,
    handleDeleteAgent,
    handleAssignAgentToChannel,
    handleInstallSkill,
    handleListAgents,
    handleListDomains,
    handleSendNotification,
} from './platform-mcp-handlers';
import type { MetadataSyncFn } from './platform-mcp-handlers';
import {
    handleSearchAgents,
    handleCloneAgent,
    handleGetStatus,
    handleSearchKb,
    handleUploadKb,
    handleAssignKb,
    handleCreateSkill,
    handleSearchSkills,
    handleSearchTools,
    handleConnectTool,
} from './platform-mcp-handlers-extended';
import {
    handleCreateTask,
    handleConfigureHeartbeat,
    handlePauseExecution,
    handleResumeExecution,
    handleGetSessionState,
    handleQueryMemory,
    handleWriteMemory,
    handleAnalyzeMemoryPatterns,
    handleRegisterTrigger,
    handleListTriggers,
    handleDeregisterTrigger,
    handleSearchOutputs,
    handleCompleteSession,
} from './platform-mcp-handlers-operations';

// Re-export the return type for process-manager.ts
export type { MetadataSyncFn } from './platform-mcp-handlers';

// -----------------------------------------------------------------------------
// Default metadata_sync emitter (standalone mode — writes to process.stdout)
// -----------------------------------------------------------------------------

function defaultEmitMetadataSync(entity: string, action: string, data: unknown): void {
    process.stdout.write(JSON.stringify({
        event: 'metadata_sync', entity, action, data, timestamp: new Date().toISOString(),
    }) + '\n');
}

// -----------------------------------------------------------------------------
// Zod Schemas (passthrough — handlers validate internally)
// z.record(z.unknown()) allows any JSON object through to the handler
// -----------------------------------------------------------------------------

const anyArgs = { args: z.record(z.string(), z.unknown()).optional().describe('Tool arguments') };
const noArgs = {};

// -----------------------------------------------------------------------------
// Tool Builder Helper
// -----------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>, syncFn: MetadataSyncFn) => Promise<string>;
type ToolHandlerNoSync = (args: Record<string, unknown>) => Promise<string>;
type ToolHandlerEmpty = () => Promise<string>;

function platformTool(
    name: string,
    description: string,
    handler: ToolHandler | ToolHandlerNoSync | ToolHandlerEmpty,
    syncFn: MetadataSyncFn,
    hasArgs: boolean = true,
) {
    if (!hasArgs) {
        return _tool(name, description, noArgs, async () => {
            const result = await (handler as ToolHandlerEmpty)();
            return { content: [{ type: 'text' as const, text: result }] };
        });
    }
    return _tool(name, description, anyArgs, async (parsed) => {
        const args = (parsed.args ?? {}) as Record<string, unknown>;
        try {
            const result = await (handler as ToolHandler)(args, syncFn);
            return { content: [{ type: 'text' as const, text: result }] };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { content: [{ type: 'text' as const, text: `Error: ${message}` }] };
        }
    });
}

// -----------------------------------------------------------------------------
// MCP Server Factory
// -----------------------------------------------------------------------------

export async function createPlatformMcpServer(onSync?: MetadataSyncFn) {
    await loadSdkHelpers();
    const syncFn = onSync || defaultEmitMetadataSync;

    return _createSdkMcpServer({
        name: 'xerus-platform',
        version: '1.0.0',
        tools: [
            // Utility tools (platform-mcp-handlers.ts)
            platformTool('platform.create_workspace',
                'Create a new workspace. Establishes the identity record and ensures projects/ directory exists.',
                handleCreateWorkspace, syncFn),
            platformTool('platform.create_domain',
                'Create a new department/domain. Scaffolds projects/{slug}/ with CLAUDE.md and subdirs.',
                handleCreateDomain, syncFn),
            platformTool('platform.delete_agent',
                'Delete an agent and its memory.',
                handleDeleteAgent, syncFn),
            platformTool('platform.install_skill',
                'Install a skill from the marketplace. Installs to the agent channel .claude/skills/ by default, or to root .claude/skills/ if scope is global.',
                handleInstallSkill, syncFn),
            platformTool('platform.list_agents',
                'List all agents in the workspace.',
                handleListAgents as ToolHandlerEmpty, syncFn, false),
            platformTool('platform.list_domains',
                'List all domains (departments) in the workspace.',
                handleListDomains as ToolHandlerEmpty, syncFn, false),
            platformTool('platform.send_notification',
                'Send a notification to the human user.',
                handleSendNotification, syncFn),

            // Canonical tools — Agent Management
            platformTool('platform.search_agents',
                'Search for agents in the marketplace.',
                handleSearchAgents as ToolHandlerNoSync, syncFn),
            platformTool('platform.clone_agent',
                'Clone an agent from the marketplace to the workspace.',
                handleCloneAgent, syncFn),
            platformTool('platform.create_agent',
                'Create a new custom agent in the workspace.',
                handleCreateAgent, syncFn),
            platformTool('platform.update_agent',
                'Update an existing agent configuration.',
                handleUpdateAgent, syncFn),

            // Canonical tools — Knowledge Base
            platformTool('platform.search_kb',
                'Search the knowledge base.',
                handleSearchKb as ToolHandlerNoSync, syncFn),
            platformTool('platform.upload_kb',
                'Upload a document to the knowledge base.',
                handleUploadKb, syncFn),
            platformTool('platform.assign_kb',
                'Assign a knowledge base document to an agent.',
                handleAssignKb, syncFn),

            // Canonical tools — Channels & Tasks
            platformTool('platform.create_channel',
                'Create a new channel in a domain.',
                handleCreateChannel, syncFn),
            platformTool('platform.add_to_channel',
                'Assign an agent to a channel.',
                handleAssignAgentToChannel, syncFn),
            platformTool('platform.create_task',
                'Create a task and assign it to an agent.',
                handleCreateTask, syncFn),

            // Canonical tools — Skills
            platformTool('platform.create_skill',
                'Create a new skill.',
                handleCreateSkill, syncFn),
            platformTool('platform.search_skills',
                'Search for available skills.',
                handleSearchSkills as ToolHandlerNoSync, syncFn),

            // Canonical tools — Tools & Integrations
            platformTool('platform.search_tools',
                'Search for available integrations and tools.',
                handleSearchTools, syncFn),
            platformTool('platform.connect_tool',
                'Connect an external tool/integration to an agent.',
                handleConnectTool, syncFn),

            // Canonical tools — Status
            platformTool('platform.get_status',
                'Get workspace status overview.',
                handleGetStatus as ToolHandlerNoSync, syncFn),

            // Canonical tools — Heartbeat
            platformTool('platform.configure_heartbeat',
                'Configure an agent heartbeat schedule.',
                handleConfigureHeartbeat, syncFn),

            // Canonical tools — Session Control
            platformTool('platform.pause_execution',
                'Pause an agent execution.',
                handlePauseExecution, syncFn),
            platformTool('platform.resume_execution',
                'Resume a paused agent execution.',
                handleResumeExecution, syncFn),
            platformTool('platform.get_session_state',
                'Get the current session state for an agent.',
                handleGetSessionState, syncFn),

            // Canonical tools — Memory Operations
            platformTool('platform.query_memory',
                'Query agent memory entries.',
                handleQueryMemory as ToolHandlerNoSync, syncFn),
            platformTool('platform.write_memory',
                'Write an entry to agent memory.',
                handleWriteMemory, syncFn),
            platformTool('platform.analyze_memory_patterns',
                'Analyze patterns in agent memory.',
                handleAnalyzeMemoryPatterns as ToolHandlerNoSync, syncFn),

            // Canonical tools — Trigger Management
            platformTool('platform.register_trigger',
                'Register a trigger for an agent.',
                handleRegisterTrigger, syncFn),
            platformTool('platform.list_triggers',
                'List all triggers for an agent.',
                handleListTriggers as ToolHandlerNoSync, syncFn),
            platformTool('platform.deregister_trigger',
                'Remove a trigger from an agent.',
                handleDeregisterTrigger, syncFn),

            // Canonical tools — Output Registry
            platformTool('platform.search_outputs',
                'Search agent output history.',
                handleSearchOutputs as ToolHandlerNoSync, syncFn),

            // Canonical tools — Session Completion
            platformTool('platform.complete_session',
                'Signal session completion to the backend.',
                handleCompleteSession, syncFn),
        ],
    });
}

// -----------------------------------------------------------------------------
// Standalone Entry Point (run with: node platform-mcp-server.js)
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
    // Standalone mode uses low-level McpServer for stdio transport
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const { CallToolRequestSchema, ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
    const { PLATFORM_TOOL_SCHEMAS } = await import('../platform/platform-tool.schemas');

    const mcpServer = new McpServer(
        { name: 'xerus-platform', version: '1.0.0' },
        { capabilities: { tools: {} } },
    );

    // Build tool list from schemas for standalone mode
    const tools = PLATFORM_TOOL_SCHEMAS.map(schema => ({
        name: schema.name as string,
        description: schema.description,
        inputSchema: {
            type: 'object' as const,
            properties: schema.inputSchema.properties as Record<string, unknown>,
            required: [...schema.inputSchema.required] as string[],
        },
    }));

    mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const result = await routeToolCallStandalone(name, (args || {}) as Record<string, unknown>);
            return { content: [{ type: 'text' as const, text: result }] };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
        }
    });

    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
}

async function routeToolCallStandalone(name: string, args: Record<string, unknown>): Promise<string> {
    const syncFn = defaultEmitMetadataSync;
    switch (name) {
        case 'platform.create_workspace': return handleCreateWorkspace(args, syncFn);
        case 'platform.create_domain': return handleCreateDomain(args, syncFn);
        case 'platform.delete_agent': return handleDeleteAgent(args, syncFn);
        case 'platform.install_skill': return handleInstallSkill(args, syncFn);
        case 'platform.list_agents': return handleListAgents();
        case 'platform.list_domains': return handleListDomains();
        case 'platform.send_notification': return handleSendNotification(args, syncFn);
        case 'platform.search_agents': return handleSearchAgents(args);
        case 'platform.clone_agent': return handleCloneAgent(args, syncFn);
        case 'platform.create_agent': return handleCreateAgent(args, syncFn);
        case 'platform.update_agent': return handleUpdateAgent(args, syncFn);
        case 'platform.search_kb': return handleSearchKb(args);
        case 'platform.upload_kb': return handleUploadKb(args, syncFn);
        case 'platform.assign_kb': return handleAssignKb(args, syncFn);
        case 'platform.create_channel': return handleCreateChannel(args, syncFn);
        case 'platform.add_to_channel': return handleAssignAgentToChannel(args, syncFn);
        case 'platform.create_task': return handleCreateTask(args, syncFn);
        case 'platform.create_skill': return handleCreateSkill(args, syncFn);
        case 'platform.search_skills': return handleSearchSkills(args);
        case 'platform.search_tools': return handleSearchTools(args, syncFn);
        case 'platform.connect_tool': return handleConnectTool(args, syncFn);
        case 'platform.get_status': return handleGetStatus(args);
        case 'platform.configure_heartbeat': return handleConfigureHeartbeat(args, syncFn);
        case 'platform.pause_execution': return handlePauseExecution(args, syncFn);
        case 'platform.resume_execution': return handleResumeExecution(args, syncFn);
        case 'platform.get_session_state': return handleGetSessionState(args, syncFn);
        case 'platform.query_memory': return handleQueryMemory(args);
        case 'platform.write_memory': return handleWriteMemory(args, syncFn);
        case 'platform.analyze_memory_patterns': return handleAnalyzeMemoryPatterns(args);
        case 'platform.register_trigger': return handleRegisterTrigger(args, syncFn);
        case 'platform.list_triggers': return handleListTriggers(args);
        case 'platform.deregister_trigger': return handleDeregisterTrigger(args, syncFn);
        case 'platform.search_outputs': return handleSearchOutputs(args);
        case 'platform.complete_session': return handleCompleteSession(args, syncFn);
        default: throw new Error(`Unknown tool: ${name}`);
    }
}

// Guard: only run standalone when invoked directly as platform-mcp-server.js.
const isStandalone = require.main === module
    && process.argv[1]?.endsWith('platform-mcp-server.js');

if (isStandalone) {
    main().catch((err) => {
        process.stderr.write(`Platform MCP Server fatal error: ${err}\n`);
        process.exit(1);
    });
}
