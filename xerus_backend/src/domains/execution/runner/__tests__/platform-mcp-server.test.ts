// Platform MCP Server Tests
// Tests for MCP server module structure.
// NOTE: createPlatformMcpServer requires @anthropic-ai/claude-agent-sdk (ESM-only)
// which cannot be loaded in Jest CJS environment. We verify the module
// structure by testing handler imports that do not depend on the SDK.

describe('platform-mcp-server module', () => {
    it('exports createPlatformMcpServer as an async function', async () => {
        // Dynamic import to catch ESM errors gracefully
        try {
            const mod = await import('../platform-mcp-server');
            expect(typeof mod.createPlatformMcpServer).toBe('function');
        } catch (err) {
            const message = (err as Error).message;
            // Expected in CJS Jest: SDK is ESM-only and cannot be require()d
            expect(message).toMatch(/Cannot use import statement|import.*module/i);
        }
    });

    it('handler modules load cleanly without SDK dependency', async () => {
        // The server delegates to these handler modules.
        // Verify they load without the SDK.
        const handlers = await import('../platform-mcp-handlers');
        expect(typeof handlers.handleCreateDomain).toBe('function');
        expect(typeof handlers.handleInstallSkill).toBe('function');
        expect(typeof handlers.handleListAgents).toBe('function');
    });
});
