// Agent Domain Types
// 21-field agent schema - system_prompt is markdown string

// Import and re-export behaviour configuration types from shared (single source of truth)
import type { ThinkingLevel, AutonomyLevel } from '../../shared/types/agent-shared.types';
export type { ThinkingLevel, AutonomyLevel };
export {
    THINKING_LEVELS,
    AUTONOMY_LEVELS,
    THINKING_TOKENS,
    PERMISSION_MAP,
} from '../../shared/types/agent-shared.types';

// Re-export capabilities types from shared (single source of truth)
export type {
    AgentPermissions,
    AgentConstraints,
    ModelConfig,
    StyleConfig,
    AgentCapabilities,
} from '../../shared/types/agent-shared.types';

export type AgentType = 'internal' | 'public' | 'private';

// Public Metadata Structure
export interface PublicMetadata {
    description: string;
    changelog?: string;
    version?: string;
    category?: 'marketing' | 'data' | 'content' | 'research' | 'sales' | 'support';
    use_cases?: string[];
}

// Main Agent Interface (24 fields - added thinking_level, autonomy_level, slug)
export interface Agent {
    // Identity (6 fields)
    id: number;
    name: string;
    slug: string | null;
    description: string;
    personality_type: string | null;
    avatar_url: string | null;
    system_prompt?: string | null;

    // Model (1 field)
    ai_model: string;

    // Ownership & Visibility (2 fields)
    user_id: string | null;
    agent_type: AgentType;

    // Behaviour Configuration (2 fields - from migration 021)
    thinking_level: ThinkingLevel;
    autonomy_level: AutonomyLevel;

    // Marketplace (4 fields)
    is_verified: boolean;
    clone_count: number;
    tags: string[];
    public_metadata: PublicMetadata | null;

    // Clone Tracking (1 field)
    source_agent_id: number | null;

    // Status & Analytics (4 fields)
    is_default: boolean;
    execution_count: number;
    success_rate: number;
    last_used_at: Date | null;

    // Timestamps (2 fields)
    created_at: Date;
    updated_at: Date;
}

// Agent with enriched data (for detail endpoint)
export interface AgentDetail extends Agent {
    tool_count: number;
    source_agent_name: string | null;
    tools?: string[]; // Tool slugs from config.json
}

// Adapter type for CLI execution (claudecode or codex)
export type AdapterType = 'claudecode' | 'codex';

// DTOs for CRUD operations
export interface CreateAgentDTO {
    name: string;
    slug?: string;
    description?: string;
    personality_type?: string | null;
    system_prompt?: string;
    avatar_url?: string | null;
    ai_model?: string;
    tags?: string[];
    public_metadata?: PublicMetadata | null;
    thinking_level?: ThinkingLevel; // Default: 'medium'
    autonomy_level?: AutonomyLevel; // Default: 'supervised'
    adapter_type?: AdapterType; // Default: 'claudecode'
}

export interface UpdateAgentDTO {
    name?: string;
    description?: string;
    personality_type?: string | null;
    system_prompt?: string;
    avatar_url?: string | null;
    ai_model?: string;
    agent_type?: AgentType;
    tags?: string[];
    public_metadata?: PublicMetadata | null;
    is_default?: boolean;
    thinking_level?: ThinkingLevel;
    autonomy_level?: AutonomyLevel;
    adapter_type?: AdapterType;
}

export interface CloneAgentDTO {
    name?: string;
}

// Filtering and pagination
export interface AgentFilters {
    agent_type?: AgentType;
    tags?: string[];
    is_verified?: boolean;
    ai_model?: string;
    search?: string;
}

export interface AgentListOptions {
    filters?: AgentFilters;
    sort_by?: 'name' | 'created_at' | 'updated_at' | 'last_used_at' | 'execution_count' | 'clone_count';
    sort_order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
}

export interface PaginatedAgents {
    agents: Agent[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

// Agent with enriched tools for list responses
export interface AgentWithEnrichedTools extends Agent {
    enriched_tools: EnrichedTool[];
}

export interface PaginatedAgentsWithTools {
    agents: AgentWithEnrichedTools[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

// Enriched tool with metadata from pipedream_apps
export interface EnrichedTool {
    name_slug: string;
    name: string;
    description: string | null;
    img_src: string | null;
    auth_type: string | null;
    categories: string[] | null;
}

// Default model for new agents (OpenRouter format: vendor/model-name)
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';

// Default model in OpenRouter format (vendor/model).
// Used by runner config.json and SDK CLI (routed through OpenRouter).
export const DEFAULT_SDK_MODEL = 'anthropic/claude-sonnet-4.6';

// Lightweight model for cheap operations (memory extraction, compression, delegation patterns)
export const DEFAULT_LIGHT_MODEL = 'anthropic/claude-haiku-4-5-20251001';

// Legacy haiku model (for services that specifically need the older version)
export const LEGACY_LIGHT_MODEL = 'anthropic/claude-3-5-haiku-20241022';

