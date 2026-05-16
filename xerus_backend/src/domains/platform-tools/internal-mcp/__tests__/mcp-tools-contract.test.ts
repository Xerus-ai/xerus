// MCP Server Tool Contract Tests
//
// Validates the TOOLS array exported from mcp-server.ts.
// These tests enforce the contract between the MCP server and
// the backend internal routes: every tool must have a name,
// description, inputSchema, and the full set must match the
// documented 38-tool catalog.

import { TOOLS } from '../../../execution/runner/mcp-server';

// The 20 new tools added in Task 2.1
const TASK_2_1_TOOLS = [
    'search_agents',
    'list_agents',
    'create_agent',
    'clone_agent',
    'update_agent',
    'delete_agent',
    'search_kb',
    'upload_kb',
    'assign_kb',
    'create_channel',
    'add_to_channel',
    'create_task',
    'search_skills',
    'create_skill',
    'install_skill',
    'uninstall_skill',
    'write_memory',
    'search_outputs',
    'list_domains',
    'cancel_execution',
];

describe('MCP Server Tool Definitions', () => {
    it('should define exactly 38 tools', () => {
        expect(TOOLS).toHaveLength(38);
    });

    it('every tool should have name, description, and inputSchema', () => {
        for (const tool of TOOLS) {
            expect(tool).toHaveProperty('name');
            expect(tool).toHaveProperty('description');
            expect(tool).toHaveProperty('inputSchema');

            expect(typeof tool.name).toBe('string');
            expect(tool.name.length).toBeGreaterThan(0);

            expect(typeof tool.description).toBe('string');
            expect(tool.description.length).toBeGreaterThan(0);

            expect(typeof tool.inputSchema).toBe('object');
            expect(tool.inputSchema).toHaveProperty('type', 'object');
            expect(tool.inputSchema).toHaveProperty('properties');
        }
    });

    it('every tool name should be unique', () => {
        const names = TOOLS.map((t) => t.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(names.length);
    });

    it('should include all 20 new tools from Task 2.1', () => {
        const toolNames = TOOLS.map((t) => t.name);
        for (const expectedTool of TASK_2_1_TOOLS) {
            expect(toolNames).toContain(expectedTool);
        }
    });

    it('every tool with required fields should list them as string arrays', () => {
        for (const tool of TOOLS) {
            if (tool.inputSchema.required) {
                expect(Array.isArray(tool.inputSchema.required)).toBe(true);
                for (const field of tool.inputSchema.required) {
                    expect(typeof field).toBe('string');
                    // Every required field must exist in properties
                    expect(tool.inputSchema.properties).toHaveProperty(
                        field,
                    );
                }
            }
        }
    });
});
