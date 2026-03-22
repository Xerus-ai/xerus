// Agent Registry - SDK Agent Configuration Builder
// Queries agent_registry for ID/slug mapping, reads config.json for agent data
// See: docs/planning/execution/agent-systemprompt-guide.md

import { query } from '../../../database/connection';
import { AutonomyLevel, ThinkingLevel } from '../types';
import { InvalidAutonomyLevelError } from '../errors';
import { AgentNotFoundError } from '../../agents/errors';
import type { AgentCapabilities } from '../../../shared/types/agent-shared.types';

// =============================================================================
// SDK NATIVE TOOLS (All agents get these)
// =============================================================================

/**
 * SDK native tools available to all agents.
 * Maps to Claude Agent SDK's built-in tool set.
 */
export const SDK_TOOLS = Object.freeze({
    // File operations
    READ: 'Read',
    WRITE: 'Write',
    EDIT: 'Edit',
    GLOB: 'Glob',
    GREP: 'Grep',

    // System operations
    BASH: 'Bash',

    // Web operations
    WEB_SEARCH: 'WebSearch',
    WEB_FETCH: 'WebFetch',

    // Task management (SDK native)
    TASK: 'Task',
    TASK_CREATE: 'TaskCreate',
    TASK_UPDATE: 'TaskUpdate',
    TASK_LIST: 'TaskList',
    TASK_GET: 'TaskGet',

    // User interaction
    ASK_USER: 'AskUserQuestion',
} as const);

export type SDKTool = (typeof SDK_TOOLS)[keyof typeof SDK_TOOLS];

/**
 * All SDK tools as array - all agents get full access.
 */
export const ALL_SDK_TOOLS: SDKTool[] = Object.values(SDK_TOOLS);

// =============================================================================
// TYPES
// =============================================================================

/**
 * Agent record from agent_registry + config.json.
 */
export interface AgentRecord {
    id: number;
    slug: string | null;
    name: string;
    description: string;
    capabilities: Partial<AgentCapabilities>;
    tools: string[];
    thinking_level: ThinkingLevel;
    autonomy_level: AutonomyLevel;
    tags: string[];
    agent_type: string;
}

/**
 * User's Pipedream connection.
 */
export interface UserPipedreamConnection {
    app_slug: string;
    account_id: string;
    is_active: boolean;
}

/**
 * MCP server configuration for SDK.
 */
export interface MCPServerConfig {
    url: string;
    name: string;
}

/**
 * Complete SDK agent configuration.
 */
export interface SDKAgentConfig {
    name: string;
    description: string;
    allowedTools: SDKTool[];
    mcpServers: Record<string, MCPServerConfig>;
    permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions';
    thinkingLevel: ThinkingLevel;
    model?: string;
}

// =============================================================================
// PIPEDREAM MCP CONFIGURATION
// =============================================================================

let _pipedreamMcpBaseUrl: string | undefined;
function getPipedreamMcpBaseUrl(): string {
    if (!_pipedreamMcpBaseUrl) {
        const url = process.env.PIPEDREAM_MCP_URL;
        if (!url) {
            throw new Error('PIPEDREAM_MCP_URL environment variable is required');
        }
        _pipedreamMcpBaseUrl = url;
    }
    return _pipedreamMcpBaseUrl;
}

/**
 * Map autonomy level to SDK permission mode.
 * Throws InvalidAutonomyLevelError for unknown autonomy levels.
 */
function mapAutonomyToPermissionMode(autonomy: AutonomyLevel): SDKAgentConfig['permissionMode'] {
    switch (autonomy) {
        case 'supervised':
            return 'default';
        case 'semi_autonomous':
            return 'acceptEdits';
        case 'autonomous':
            return 'bypassPermissions';
        default:
            throw new InvalidAutonomyLevelError(autonomy as string);
    }
}

/**
 * Build MCP server configs for agent's tools that user has connected.
 */
function buildMCPServers(
    agentTools: string[],
    userConnections: UserPipedreamConnection[],
    userId: string
): Record<string, MCPServerConfig> {
    const servers: Record<string, MCPServerConfig> = {};

    // Only include tools that agent needs AND user has connected
    const connectedApps = new Set(
        userConnections
            .filter(c => c.is_active)
            .map(c => c.app_slug)
    );

    for (const tool of agentTools) {
        if (connectedApps.has(tool)) {
            servers[tool] = {
                url: `${getPipedreamMcpBaseUrl()}/${userId}/${tool}`,
                name: tool,
            };
        }
    }

    return servers;
}

// =============================================================================
// DATABASE QUERIES
// =============================================================================

interface AgentRow {
    id: number;
    slug: string | null;
    name: string;
    description: string;
    thinking_level: string;
    autonomy_level: string;
    tags: string[] | null;
    agent_type: string;
}

function mapRowToAgent(row: AgentRow, tools: string[] = []): AgentRecord {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        capabilities: { skills: [] },
        tools,
        thinking_level: row.thinking_level as ThinkingLevel,
        autonomy_level: row.autonomy_level as AutonomyLevel,
        tags: row.tags ?? [],
        agent_type: row.agent_type,
    };
}

/**
 * Get agent by ID.
 * Returns registry data only — enrich from config.json for full agent details.
 */
export async function getAgentById(id: number): Promise<AgentRecord | null> {
    const sql = `
        SELECT a.id, a.slug, a.slug AS name, '' AS description,
               'medium' AS thinking_level, 'supervised' AS autonomy_level,
               ARRAY[]::text[] AS tags, a.agent_type
        FROM agent_registry a
        WHERE a.id = $1
    `;
    const result = await query<AgentRow>(sql, [id]);
    if (result.rows.length === 0) return null;
    return mapRowToAgent(result.rows[0], []);
}

/**
 * Get agent by slug.
 * Returns registry data only — enrich from config.json for full agent details.
 */
export async function getAgentBySlug(slugOrName: string): Promise<AgentRecord | null> {
    const sql = `
        SELECT a.id, a.slug, a.slug AS name, '' AS description,
               'medium' AS thinking_level, 'supervised' AS autonomy_level,
               ARRAY[]::text[] AS tags, a.agent_type
        FROM agent_registry a
        WHERE a.slug = $1
        LIMIT 1
    `;
    const result = await query<AgentRow>(sql, [slugOrName]);
    if (result.rows.length === 0) return null;
    return mapRowToAgent(result.rows[0], []);
}

/**
 * Get user's Pipedream connections.
 */
export async function getUserPipedreamConnections(userId: string): Promise<UserPipedreamConnection[]> {
    const sql = `
        SELECT app_slug, pipedream_account_id AS account_id, true AS is_active
        FROM connected_accounts
        WHERE user_id = $1
    `;
    const result = await query<UserPipedreamConnection>(sql, [userId]);
    return result.rows;
}

// =============================================================================
// SDK CONFIG BUILDER
// =============================================================================

/**
 * Build complete SDK agent configuration from database agent and user connections.
 * Throws AgentNotFoundError if agent does not exist.
 */
export async function buildSDKAgentConfig(
    agentId: number,
    userId: string
): Promise<SDKAgentConfig> {
    const agent = await getAgentById(agentId);
    if (!agent) {
        throw new AgentNotFoundError(String(agentId));
    }

    const userConnections = await getUserPipedreamConnections(userId);

    return {
        name: agent.name,
        description: agent.description,
        allowedTools: ALL_SDK_TOOLS,
        mcpServers: buildMCPServers(agent.tools, userConnections, userId),
        permissionMode: mapAutonomyToPermissionMode(agent.autonomy_level),
        thinkingLevel: agent.thinking_level,
    };
}

/**
 * Build SDK config from agent record (when already fetched).
 */
export function buildSDKAgentConfigFromRecord(
    agent: AgentRecord,
    userConnections: UserPipedreamConnection[],
    userId: string
): SDKAgentConfig {
    return {
        name: agent.name,
        description: agent.description,
        allowedTools: ALL_SDK_TOOLS,
        mcpServers: buildMCPServers(agent.tools, userConnections, userId),
        permissionMode: mapAutonomyToPermissionMode(agent.autonomy_level),
        thinkingLevel: agent.thinking_level,
    };
}
