// Platform Tool Registry
// Metadata registry and lookup functions for platform and system tools
// Source: docs/planning/tools/system-tools.md

import { PLATFORM_TOOLS } from '../agents/xerus-master.types';
import type { ToolSchema, ToolMetadata, ToolCategory } from './platform-tool.types';
import { ALL_TOOL_SCHEMAS } from './platform-tool.schemas';

// -----------------------------------------------------------------------------
// Tool Metadata Registry
// Maps each tool to its category, delegation target, and destructive flag
// -----------------------------------------------------------------------------

export const TOOL_METADATA: ReadonlyMap<string, ToolMetadata> = new Map<string, ToolMetadata>([
    // Agent Management
    [PLATFORM_TOOLS.SEARCH_AGENTS, {
        name: PLATFORM_TOOLS.SEARCH_AGENTS,
        category: 'agent_management' as ToolCategory,
        description: 'Search agents by name, capability, or category',
        delegatesTo: 'AgentService.search()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.CLONE_AGENT, {
        name: PLATFORM_TOOLS.CLONE_AGENT,
        category: 'agent_management' as ToolCategory,
        description: 'Clone an agent template',
        delegatesTo: 'AgentService.clone()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.CREATE_AGENT, {
        name: PLATFORM_TOOLS.CREATE_AGENT,
        category: 'agent_management' as ToolCategory,
        description: 'Create a new agent from scratch',
        delegatesTo: 'AgentService.create()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.UPDATE_AGENT, {
        name: PLATFORM_TOOLS.UPDATE_AGENT,
        category: 'agent_management' as ToolCategory,
        description: 'Update agent configuration',
        delegatesTo: 'AgentService.update()',
        isDestructive: false,
    }],
    // Knowledge Base
    [PLATFORM_TOOLS.SEARCH_KB, {
        name: PLATFORM_TOOLS.SEARCH_KB,
        category: 'knowledge_base' as ToolCategory,
        description: 'Search knowledge base documents',
        delegatesTo: 'KnowledgeService.search()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.UPLOAD_KB, {
        name: PLATFORM_TOOLS.UPLOAD_KB,
        category: 'knowledge_base' as ToolCategory,
        description: 'Upload a document to knowledge base',
        delegatesTo: 'KnowledgeService.upload()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.ASSIGN_KB, {
        name: PLATFORM_TOOLS.ASSIGN_KB,
        category: 'knowledge_base' as ToolCategory,
        description: 'Assign KB document to an agent',
        delegatesTo: 'KnowledgeService.assignToAgent()',
        isDestructive: false,
    }],
    // Channels & Tasks
    [PLATFORM_TOOLS.CREATE_CHANNEL, {
        name: PLATFORM_TOOLS.CREATE_CHANNEL,
        category: 'channels_tasks' as ToolCategory,
        description: 'Create an inbox channel',
        delegatesTo: 'InboxService.createChannel()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.ADD_TO_CHANNEL, {
        name: PLATFORM_TOOLS.ADD_TO_CHANNEL,
        category: 'channels_tasks' as ToolCategory,
        description: 'Add an agent to a channel',
        delegatesTo: 'InboxService.addChannelMember()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.CREATE_TASK, {
        name: PLATFORM_TOOLS.CREATE_TASK,
        category: 'channels_tasks' as ToolCategory,
        description: 'Create a task in a channel',
        delegatesTo: 'InboxService.createTask()',
        isDestructive: false,
    }],
    // Skills
    [PLATFORM_TOOLS.CREATE_SKILL, {
        name: PLATFORM_TOOLS.CREATE_SKILL,
        category: 'skills' as ToolCategory,
        description: 'Create a new skill',
        delegatesTo: 'SkillService.create()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.SEARCH_SKILLS, {
        name: PLATFORM_TOOLS.SEARCH_SKILLS,
        category: 'skills' as ToolCategory,
        description: 'Search available skills',
        delegatesTo: 'SkillService.search()',
        isDestructive: false,
    }],
    // Tools & Integrations
    [PLATFORM_TOOLS.SEARCH_TOOLS, {
        name: PLATFORM_TOOLS.SEARCH_TOOLS,
        category: 'tools_integrations' as ToolCategory,
        description: 'Search available tool integrations',
        delegatesTo: 'ToolsService.searchApps()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.CONNECT_TOOL, {
        name: PLATFORM_TOOLS.CONNECT_TOOL,
        category: 'tools_integrations' as ToolCategory,
        description: 'Connect a tool integration to an agent',
        delegatesTo: 'ToolsService.initiateConnection()',
        isDestructive: false,
    }],
    // Status
    [PLATFORM_TOOLS.GET_STATUS, {
        name: PLATFORM_TOOLS.GET_STATUS,
        category: 'status' as ToolCategory,
        description: 'Get workspace/agent/team/task status',
        delegatesTo: 'StatusService.get()',
        isDestructive: false,
    }],
    // Heartbeat
    [PLATFORM_TOOLS.CONFIGURE_HEARTBEAT, {
        name: PLATFORM_TOOLS.CONFIGURE_HEARTBEAT,
        category: 'heartbeat' as ToolCategory,
        description: 'Configure agent heartbeat schedule',
        delegatesTo: 'HeartbeatConfigService.update()',
        isDestructive: false,
    }],
    // Session Control
    [PLATFORM_TOOLS.PAUSE_EXECUTION, {
        name: PLATFORM_TOOLS.PAUSE_EXECUTION,
        category: 'session_control' as ToolCategory,
        description: 'Pause a running execution session',
        delegatesTo: 'SessionControlService.pauseExecution()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.RESUME_EXECUTION, {
        name: PLATFORM_TOOLS.RESUME_EXECUTION,
        category: 'session_control' as ToolCategory,
        description: 'Resume a paused execution session',
        delegatesTo: 'SessionControlService.resumeExecution()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.GET_SESSION_STATE, {
        name: PLATFORM_TOOLS.GET_SESSION_STATE,
        category: 'session_control' as ToolCategory,
        description: 'Get execution session state and checkpoint',
        delegatesTo: 'SessionControlService.getSessionState()',
        isDestructive: false,
    }],
    // Memory Operations
    [PLATFORM_TOOLS.QUERY_MEMORY, {
        name: PLATFORM_TOOLS.QUERY_MEMORY,
        category: 'memory' as ToolCategory,
        description: 'Search memory with semantic search',
        delegatesTo: 'MemoryService.queryMemory()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.WRITE_MEMORY, {
        name: PLATFORM_TOOLS.WRITE_MEMORY,
        category: 'memory' as ToolCategory,
        description: 'Write memory entry with explicit scope',
        delegatesTo: 'MemoryService.writeMemory()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.ANALYZE_MEMORY_PATTERNS, {
        name: PLATFORM_TOOLS.ANALYZE_MEMORY_PATTERNS,
        category: 'memory' as ToolCategory,
        description: 'Analyze memory patterns across categories',
        delegatesTo: 'MemoryService.analyzeMemoryPatterns()',
        isDestructive: false,
    }],
    // Trigger Management
    [PLATFORM_TOOLS.REGISTER_TRIGGER, {
        name: PLATFORM_TOOLS.REGISTER_TRIGGER,
        category: 'triggers' as ToolCategory,
        description: 'Register an event trigger and webhook',
        delegatesTo: 'TriggerService.registerTrigger()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.LIST_TRIGGERS, {
        name: PLATFORM_TOOLS.LIST_TRIGGERS,
        category: 'triggers' as ToolCategory,
        description: 'List registered triggers for an agent',
        delegatesTo: 'TriggerService.listTriggers()',
        isDestructive: false,
    }],
    [PLATFORM_TOOLS.DEREGISTER_TRIGGER, {
        name: PLATFORM_TOOLS.DEREGISTER_TRIGGER,
        category: 'triggers' as ToolCategory,
        description: 'Remove a trigger and cleanup webhook',
        delegatesTo: 'TriggerService.deregisterTrigger()',
        isDestructive: false,
    }],
    // Output Registry
    [PLATFORM_TOOLS.SEARCH_OUTPUTS, {
        name: PLATFORM_TOOLS.SEARCH_OUTPUTS,
        category: 'outputs' as ToolCategory,
        description: 'Search output registry by filters',
        delegatesTo: 'OutputService.searchOutputs()',
        isDestructive: false,
    }],
    // Session Completion
    [PLATFORM_TOOLS.COMPLETE_SESSION, {
        name: PLATFORM_TOOLS.COMPLETE_SESSION,
        category: 'session_control' as ToolCategory,
        description: 'Signal that the current agent session is complete',
        delegatesTo: 'SessionControlService.completeSession()',
        isDestructive: false,
    }],
]);

// -----------------------------------------------------------------------------
// Lookup Functions
// -----------------------------------------------------------------------------

/**
 * Get the schema for a tool by name.
 * Throws if the tool name is not recognized.
 */
export function getToolSchema(toolName: string): ToolSchema {
    const schema = ALL_TOOL_SCHEMAS.find(s => s.name === toolName);
    if (!schema) {
        throw new Error(`Unknown tool: ${toolName}`);
    }
    return schema;
}

/**
 * Get metadata for a tool by name.
 * Throws if the tool name is not recognized.
 */
export function getToolMetadata(toolName: string): ToolMetadata {
    const metadata = TOOL_METADATA.get(toolName);
    if (!metadata) {
        throw new Error(`Unknown tool: ${toolName}`);
    }
    return metadata;
}

/**
 * Get all tool schemas for a specific category.
 */
export function getToolSchemasByCategory(category: ToolCategory): ToolSchema[] {
    return ALL_TOOL_SCHEMAS.filter(schema => {
        const metadata = TOOL_METADATA.get(schema.name);
        return metadata?.category === category;
    });
}

/**
 * Check if a tool name is a valid platform or system tool.
 */
export function isRegisteredTool(toolName: string): boolean {
    return TOOL_METADATA.has(toolName);
}

/**
 * Get the list of required fields for a tool's input schema.
 */
export function getRequiredFields(toolName: string): readonly string[] {
    const schema = getToolSchema(toolName);
    return schema.inputSchema.required;
}
