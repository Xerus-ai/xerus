// Xerus Platform MCP Server
// MCP server with 39 backend-coupled tools that CLIs access.
// Tool definitions: mcp-tool-definitions.ts (split into session + resource files)
// Backend client: mcp-backend-client.ts (errors, retry, diagnostics)

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { TOOLS } from './mcp-tool-definitions';
import { callBackendApi, logStartupDiagnostics, runStartupHealthCheck } from './mcp-backend-client';

// Re-export TOOLS for contract tests
export { TOOLS };

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
    process.stderr.write('[mcp-server] Running with 39 backend-coupled tools\n');

    logStartupDiagnostics();
    await runStartupHealthCheck();
}

main().catch((err) => {
    process.stderr.write(`[mcp-server] Fatal error: ${err}\n`);
    process.exit(1);
});
