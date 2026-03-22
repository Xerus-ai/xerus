// Platform Tool Schemas Tests
import {
    PLATFORM_TOOL_SCHEMAS,
    ALL_TOOL_SCHEMAS,
    SEARCH_AGENTS_SCHEMA,
    CLONE_AGENT_SCHEMA,
    CREATE_AGENT_SCHEMA,
    UPDATE_AGENT_SCHEMA,
    SEARCH_KB_SCHEMA,
    UPLOAD_KB_SCHEMA,
    ASSIGN_KB_SCHEMA,
    CREATE_CHANNEL_SCHEMA,
    ADD_TO_CHANNEL_SCHEMA,
    CREATE_TASK_SCHEMA,
    CREATE_SKILL_SCHEMA,
    SEARCH_SKILLS_SCHEMA,
    SEARCH_TOOLS_SCHEMA,
    CONNECT_TOOL_SCHEMA,
    GET_STATUS_SCHEMA,
    CONFIGURE_HEARTBEAT_SCHEMA,
} from '../platform-tool.schemas';
import {
    TOOL_METADATA,
    getToolSchema,
    getToolMetadata,
    getToolSchemasByCategory,
    isRegisteredTool,
    getRequiredFields,
} from '../platform-tool.registry';
import { PLATFORM_TOOLS } from '../../agents/xerus-master.types';
import type { ToolSchema } from '../platform-tool.types';

// -----------------------------------------------------------------------------
// Helper: property schema type for accessing nested schema properties
// -----------------------------------------------------------------------------

interface PropertySchema {
    type?: string;
    description?: string;
    enum?: string[];
    default?: unknown;
    items?: PropertySchema;
    properties?: Record<string, PropertySchema>;
    required?: string[];
}

function prop(schema: ToolSchema, key: string): PropertySchema {
    return schema.inputSchema.properties[key] as PropertySchema;
}

// -----------------------------------------------------------------------------
// Helper: validate a ToolSchema has the correct structure
// -----------------------------------------------------------------------------

function assertValidToolSchema(schema: ToolSchema): void {
    expect(schema.name).toBeDefined();
    expect(typeof schema.name).toBe('string');
    expect(schema.name.length).toBeGreaterThan(0);

    expect(schema.description).toBeDefined();
    expect(typeof schema.description).toBe('string');
    expect(schema.description.length).toBeGreaterThan(0);

    expect(schema.inputSchema).toBeDefined();
    expect(schema.inputSchema.type).toBe('object');
    expect(schema.inputSchema.properties).toBeDefined();
    expect(typeof schema.inputSchema.properties).toBe('object');
    expect(Array.isArray(schema.inputSchema.required)).toBe(true);
}

// -----------------------------------------------------------------------------
// Schema Count Tests
// -----------------------------------------------------------------------------

describe('Platform Tool Schemas', () => {
    describe('schema counts', () => {
        it('should have 27 platform tool schemas', () => {
            expect(PLATFORM_TOOL_SCHEMAS).toHaveLength(27);
        });

        it('should have 27 total tool schemas', () => {
            expect(ALL_TOOL_SCHEMAS).toHaveLength(27);
        });

        it('should have metadata for all 27 tools', () => {
            expect(TOOL_METADATA.size).toBe(27);
        });

        it('should have matching schema and metadata counts', () => {
            expect(ALL_TOOL_SCHEMAS.length).toBe(TOOL_METADATA.size);
        });
    });

    // -------------------------------------------------------------------------
    // Structure Validation
    // -------------------------------------------------------------------------

    describe('schema structure', () => {
        it.each(ALL_TOOL_SCHEMAS.map(s => [s.name, s]))(
            '%s should have valid schema structure',
            (_name, schema) => {
                assertValidToolSchema(schema as ToolSchema);
            }
        );

        it('every schema name should have corresponding metadata', () => {
            for (const schema of ALL_TOOL_SCHEMAS) {
                expect(TOOL_METADATA.has(schema.name)).toBe(true);
            }
        });

        it('every metadata entry should have a corresponding schema', () => {
            for (const [name] of TOOL_METADATA) {
                const schema = ALL_TOOL_SCHEMAS.find(s => s.name === name);
                expect(schema).toBeDefined();
            }
        });
    });

    // -------------------------------------------------------------------------
    // Name Alignment with Constants
    // -------------------------------------------------------------------------

    describe('name alignment', () => {
        it('all schema names should be valid platform tool names', () => {
            const toolNames = new Set<string>(Object.values(PLATFORM_TOOLS));
            for (const schema of PLATFORM_TOOL_SCHEMAS) {
                expect(toolNames.has(schema.name)).toBe(true);
            }
        });

        it('MCP-only tools should not have backend schemas', () => {
            // 5 tools handled inside sandbox MCP server, not backend registry
            const mcpOnlyTools = [
                PLATFORM_TOOLS.DELETE_AGENT,
                PLATFORM_TOOLS.LIST_AGENTS,
                PLATFORM_TOOLS.LIST_DOMAINS,
                PLATFORM_TOOLS.INSTALL_SKILL,
                PLATFORM_TOOLS.SEND_NOTIFICATION,
            ];
            const schemaNames = new Set(PLATFORM_TOOL_SCHEMAS.map(s => s.name));
            for (const tool of mcpOnlyTools) {
                expect(schemaNames.has(tool)).toBe(false);
            }
        });
    });

    // -------------------------------------------------------------------------
    // Agent Management Tools
    // -------------------------------------------------------------------------

    describe('platform.search_agents', () => {
        it('should require query', () => {
            expect(SEARCH_AGENTS_SCHEMA.inputSchema.required).toEqual(['query']);
        });

        it('scope should have valid enum values', () => {
            const scope = prop(SEARCH_AGENTS_SCHEMA, 'scope');
            expect(scope.enum).toEqual(['mine', 'marketplace', 'all']);
        });
    });

    describe('platform.clone_agent', () => {
        it('should require source_agent_id and name', () => {
            expect(CLONE_AGENT_SCHEMA.inputSchema.required).toContain('source_agent_id');
            expect(CLONE_AGENT_SCHEMA.inputSchema.required).toContain('name');
        });

        it('customizations should be an object with expected properties', () => {
            const customizations = prop(CLONE_AGENT_SCHEMA, 'customizations');
            expect(customizations.type).toBe('object');
            expect(customizations.properties).toBeDefined();
            expect(customizations.properties!.autonomy_level).toBeDefined();
            expect(customizations.properties!.autonomy_level.enum).toEqual(
                ['supervised', 'semi_autonomous', 'autonomous']
            );
        });
    });

    describe('platform.create_agent', () => {
        it('should require name, description, and system_prompt', () => {
            expect(CREATE_AGENT_SCHEMA.inputSchema.required).toContain('name');
            expect(CREATE_AGENT_SCHEMA.inputSchema.required).toContain('description');
            expect(CREATE_AGENT_SCHEMA.inputSchema.required).toContain('system_prompt');
        });

        it('system_prompt should require identity and goals', () => {
            const prompt = prop(CREATE_AGENT_SCHEMA, 'system_prompt');
            expect(prompt.required).toContain('identity');
            expect(prompt.required).toContain('goals');
        });

        it('should have array properties for tool_slugs, skill_slugs, kb_collection_ids', () => {
            expect(prop(CREATE_AGENT_SCHEMA, 'tool_slugs').type).toBe('array');
            expect(prop(CREATE_AGENT_SCHEMA, 'skill_slugs').type).toBe('array');
            expect(prop(CREATE_AGENT_SCHEMA, 'kb_collection_ids').type).toBe('array');
        });
    });

    describe('platform.update_agent', () => {
        it('should require only agent_id', () => {
            expect(UPDATE_AGENT_SCHEMA.inputSchema.required).toEqual(['agent_id']);
        });

        it('should have optional name, description, system_prompt, model_id, autonomy_level', () => {
            const props = Object.keys(UPDATE_AGENT_SCHEMA.inputSchema.properties);
            expect(props).toContain('agent_id');
            expect(props).toContain('name');
            expect(props).toContain('description');
            expect(props).toContain('system_prompt');
            expect(props).toContain('model_id');
            expect(props).toContain('autonomy_level');
        });
    });

    // -------------------------------------------------------------------------
    // Knowledge Base Tools
    // -------------------------------------------------------------------------

    describe('platform.search_kb', () => {
        it('should require query', () => {
            expect(SEARCH_KB_SCHEMA.inputSchema.required).toEqual(['query']);
        });

        it('limit should default to 10', () => {
            expect(prop(SEARCH_KB_SCHEMA, 'limit').default).toBe(10);
        });
    });

    describe('platform.upload_kb', () => {
        it('should require title', () => {
            expect(UPLOAD_KB_SCHEMA.inputSchema.required).toEqual(['title']);
        });

        it('should have content and file_path as alternative input methods', () => {
            const props = UPLOAD_KB_SCHEMA.inputSchema.properties;
            expect(props.content).toBeDefined();
            expect(props.file_path).toBeDefined();
        });
    });

    describe('platform.assign_kb', () => {
        it('should require agent_id', () => {
            expect(ASSIGN_KB_SCHEMA.inputSchema.required).toEqual(['agent_id']);
        });

        it('permission should have read and read_write enum values', () => {
            const permission = prop(ASSIGN_KB_SCHEMA, 'permission');
            expect(permission.enum).toEqual(['read', 'read_write']);
        });
    });

    // -------------------------------------------------------------------------
    // Channels & Tasks Tools
    // -------------------------------------------------------------------------

    describe('platform.create_channel', () => {
        it('should require name', () => {
            expect(CREATE_CHANNEL_SCHEMA.inputSchema.required).toEqual(['name']);
        });

        it('agent_ids should be an array of strings', () => {
            const agentIds = prop(CREATE_CHANNEL_SCHEMA, 'agent_ids');
            expect(agentIds.type).toBe('array');
            expect(agentIds.items!.type).toBe('string');
        });
    });

    describe('platform.add_to_channel', () => {
        it('should require channel_id and agent_id', () => {
            expect(ADD_TO_CHANNEL_SCHEMA.inputSchema.required).toContain('channel_id');
            expect(ADD_TO_CHANNEL_SCHEMA.inputSchema.required).toContain('agent_id');
        });

        it('role should have member and lead enum values', () => {
            expect(prop(ADD_TO_CHANNEL_SCHEMA, 'role').enum).toEqual(['member', 'lead']);
        });
    });

    describe('platform.create_task', () => {
        it('should require channel_id and title', () => {
            expect(CREATE_TASK_SCHEMA.inputSchema.required).toContain('channel_id');
            expect(CREATE_TASK_SCHEMA.inputSchema.required).toContain('title');
        });

        it('priority should have 4 levels', () => {
            expect(prop(CREATE_TASK_SCHEMA, 'priority').enum).toEqual(
                ['low', 'medium', 'high', 'critical']
            );
        });
    });

    // -------------------------------------------------------------------------
    // Skills Tools
    // -------------------------------------------------------------------------

    describe('platform.create_skill', () => {
        it('should require name, description, and instructions', () => {
            expect(CREATE_SKILL_SCHEMA.inputSchema.required).toContain('name');
            expect(CREATE_SKILL_SCHEMA.inputSchema.required).toContain('description');
            expect(CREATE_SKILL_SCHEMA.inputSchema.required).toContain('instructions');
        });
    });

    describe('platform.search_skills', () => {
        it('should require query', () => {
            expect(SEARCH_SKILLS_SCHEMA.inputSchema.required).toEqual(['query']);
        });

        it('scope should have 4 options', () => {
            expect(prop(SEARCH_SKILLS_SCHEMA, 'scope').enum).toEqual(
                ['system', 'marketplace', 'mine', 'all']
            );
        });
    });

    // -------------------------------------------------------------------------
    // Tools & Integrations Tools
    // -------------------------------------------------------------------------

    describe('platform.search_tools', () => {
        it('should require query', () => {
            expect(SEARCH_TOOLS_SCHEMA.inputSchema.required).toEqual(['query']);
        });
    });

    describe('platform.connect_tool', () => {
        it('should require agent_id and app_slug', () => {
            expect(CONNECT_TOOL_SCHEMA.inputSchema.required).toContain('agent_id');
            expect(CONNECT_TOOL_SCHEMA.inputSchema.required).toContain('app_slug');
        });
    });

    // -------------------------------------------------------------------------
    // Status Tool
    // -------------------------------------------------------------------------

    describe('platform.get_status', () => {
        it('should require scope', () => {
            expect(GET_STATUS_SCHEMA.inputSchema.required).toEqual(['scope']);
        });

        it('scope should have 5 options', () => {
            expect(prop(GET_STATUS_SCHEMA, 'scope').enum).toEqual(
                ['agent', 'team', 'task', 'channel', 'workspace']
            );
        });
    });

    // -------------------------------------------------------------------------
    // Heartbeat Tool
    // -------------------------------------------------------------------------

    describe('platform.configure_heartbeat', () => {
        it('should require agent_id', () => {
            expect(CONFIGURE_HEARTBEAT_SCHEMA.inputSchema.required).toEqual(['agent_id']);
        });

        it('should have schedule-related properties', () => {
            const props = Object.keys(CONFIGURE_HEARTBEAT_SCHEMA.inputSchema.properties);
            expect(props).toContain('agent_id');
            expect(props).toContain('enabled');
            expect(props).toContain('cron_expression');
            expect(props).toContain('timezone');
            expect(props).toContain('active_hours_start');
            expect(props).toContain('active_hours_end');
            expect(props).toContain('weekdays_only');
            expect(props).toContain('prompt');
        });
    });

    // -------------------------------------------------------------------------
    // Lookup Functions
    // -------------------------------------------------------------------------

    describe('getToolSchema', () => {
        it('should return schema for valid tool name', () => {
            const schema = getToolSchema('platform.search_agents');
            expect(schema.name).toBe('platform.search_agents');
        });

        it('should throw for unknown tool name', () => {
            expect(() => getToolSchema('platform.nonexistent')).toThrow('Unknown tool: platform.nonexistent');
        });
    });

    describe('getToolMetadata', () => {
        it('should return metadata for valid tool name', () => {
            const metadata = getToolMetadata('platform.create_agent');
            expect(metadata.category).toBe('agent_management');
            expect(metadata.delegatesTo).toBe('AgentService.create()');
        });

        it('should throw for unknown tool name', () => {
            expect(() => getToolMetadata('platform.nonexistent')).toThrow('Unknown tool: platform.nonexistent');
        });
    });

    describe('getToolSchemasByCategory', () => {
        it('should return 4 agent_management schemas', () => {
            const schemas = getToolSchemasByCategory('agent_management');
            expect(schemas).toHaveLength(4);
            const names = schemas.map(s => s.name);
            expect(names).toContain('platform.search_agents');
            expect(names).toContain('platform.clone_agent');
            expect(names).toContain('platform.create_agent');
            expect(names).toContain('platform.update_agent');
        });

        it('should return 3 knowledge_base schemas', () => {
            const schemas = getToolSchemasByCategory('knowledge_base');
            expect(schemas).toHaveLength(3);
        });

        it('should return 0 delegation schemas (removed)', () => {
            const schemas = getToolSchemasByCategory('delegation');
            expect(schemas).toHaveLength(0);
        });

        it('should return 1 heartbeat schema', () => {
            const schemas = getToolSchemasByCategory('heartbeat');
            expect(schemas).toHaveLength(1);
        });

        it('should return empty array for unknown category', () => {
            const schemas = getToolSchemasByCategory('nonexistent' as never);
            expect(schemas).toHaveLength(0);
        });
    });

    describe('isRegisteredTool', () => {
        it('should return true for platform tools', () => {
            expect(isRegisteredTool('platform.search_agents')).toBe(true);
            expect(isRegisteredTool('platform.configure_heartbeat')).toBe(true);
        });

        it('should return false for removed system tools', () => {
            expect(isRegisteredTool('system.invoke_agent')).toBe(false);
            expect(isRegisteredTool('system.invoke_team')).toBe(false);
        });

        it('should return false for MCP-only tools (handled in sandbox, not backend registry)', () => {
            expect(isRegisteredTool('platform.delete_agent')).toBe(false);
            expect(isRegisteredTool('platform.list_agents')).toBe(false);
            expect(isRegisteredTool('platform.list_domains')).toBe(false);
            expect(isRegisteredTool('platform.install_skill')).toBe(false);
            expect(isRegisteredTool('platform.send_notification')).toBe(false);
        });

        it('should return false for unknown tools', () => {
            expect(isRegisteredTool('platform.nonexistent_tool')).toBe(false);
            expect(isRegisteredTool('Read')).toBe(false);
        });
    });

    describe('getRequiredFields', () => {
        it('should return required fields for create_agent', () => {
            const required = getRequiredFields('platform.create_agent');
            expect(required).toContain('name');
            expect(required).toContain('description');
            expect(required).toContain('system_prompt');
        });

        it('should throw for removed system tool', () => {
            expect(() => getRequiredFields('system.invoke_agent')).toThrow('Unknown tool: system.invoke_agent');
        });

        it('should throw for unknown tool', () => {
            expect(() => getRequiredFields('unknown.tool')).toThrow('Unknown tool: unknown.tool');
        });
    });

    // -------------------------------------------------------------------------
    // Metadata Completeness
    // -------------------------------------------------------------------------

    describe('metadata completeness', () => {
        it('every metadata entry should have a non-empty delegatesTo', () => {
            for (const [, metadata] of TOOL_METADATA) {
                expect(metadata.delegatesTo.length).toBeGreaterThan(0);
            }
        });

        it('every metadata entry should have a valid category', () => {
            const validCategories = new Set([
                'agent_management',
                'knowledge_base',
                'channels_tasks',
                'skills',
                'tools_integrations',
                'status',
                'heartbeat',
                'delegation',
                'session_control',
                'memory',
                'triggers',
                'outputs',
            ]);
            for (const [, metadata] of TOOL_METADATA) {
                expect(validCategories.has(metadata.category)).toBe(true);
            }
        });

        it('no tools should be marked as destructive', () => {
            // Per system-tools.md: destructive operations are intentionally NOT provided as tools
            for (const [, metadata] of TOOL_METADATA) {
                expect(metadata.isDestructive).toBe(false);
            }
        });
    });

    // -------------------------------------------------------------------------
    // No Duplicate Names
    // -------------------------------------------------------------------------

    describe('uniqueness', () => {
        it('all schema names should be unique', () => {
            const names = ALL_TOOL_SCHEMAS.map(s => s.name);
            const uniqueNames = new Set(names);
            expect(uniqueNames.size).toBe(names.length);
        });

        it('all schemas should be platform tools', () => {
            for (const schema of ALL_TOOL_SCHEMAS) {
                expect(String(schema.name).startsWith('platform.')).toBe(true);
            }
        });
    });
});
