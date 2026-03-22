// Memory Types v2 - Hierarchical Company Model
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 6
//
// v2 replaces the old 5-type flat model (working/episodic/semantic/procedural/action_history)
// with a hierarchical model matching the .memory/ filesystem layout.

// -----------------------------------------------------------------------------
// Memory Hierarchy Levels (4 levels + user profile)
// Mirrors workspace directory structure
// -----------------------------------------------------------------------------

export const MEMORY_LEVELS = ['company', 'project', 'channel', 'agent'] as const;

export type MemoryLevel = (typeof MEMORY_LEVELS)[number];

// -----------------------------------------------------------------------------
// Memory File Categories
// Files that exist at various levels of the hierarchy
// -----------------------------------------------------------------------------

export const MEMORY_FILE_CATEGORIES = [
    'working',
    'context',
    'expertise',
    'learnings',
    'patterns',
    'decisions',
    'standup',
    'vision',
    'preferences',
    'entity',
    'topic',
    'index',
] as const;

export type MemoryFileCategory = (typeof MEMORY_FILE_CATEGORIES)[number];

// Per-agent memory files (.memory/agents/{slug}/)
export const AGENT_MEMORY_FILE_MAP = {
    working: 'working.md',
    expertise: 'expertise.md',
} as const;

// Company-level memory files (.memory/company/)
export const COMPANY_MEMORY_FILE_MAP = {
    vision: 'vision.md',
    decisions: 'decisions.md',
    standup: 'standup.md',
} as const;

// Project-level memory files (.memory/projects/{domain}/)
export const PROJECT_MEMORY_FILE_MAP = {
    context: 'context.md',
    learnings: 'learnings.md',
    patterns: 'patterns.md',
} as const;

// Channel-level memory files (.memory/projects/{domain}/{channel}/)
export const CHANNEL_MEMORY_FILE_MAP = {
    context: 'context.md',
    learnings: 'learnings.md',
    patterns: 'patterns.md',
} as const;

// User profile memory files (.memory/user/)
export const USER_MEMORY_FILE_MAP = {
    preferences: 'preferences.md',
    context: 'context.md',
    decisions: 'decisions.md',
} as const;

// -----------------------------------------------------------------------------
// Memory Scope (v2 - matches hierarchy + user + entity/topic cross-cutting)
// -----------------------------------------------------------------------------

export const MEMORY_SCOPES = [
    'company',
    'project',
    'channel',
    'agent',
    'user',
    'entity',
    'topic',
] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

// -----------------------------------------------------------------------------
// Legacy MemoryType Mapping
// git-memory module uses MemoryType for agent-level file operations.
// These map to the v2 agent memory files.
// Will be removed once git-memory module is fully migrated to v2.
// -----------------------------------------------------------------------------

export const MEMORY_TYPES = [
    'working',
    'expertise',
    'context',
    'learnings',
    'patterns',
    'decisions',
    'standup',
    'vision',
    'preferences',
    'entity',
    'topic',
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

// -----------------------------------------------------------------------------
// DRM Tier (Decay-based Retention Management)
// Unchanged from v1 - compression/retention still applies
// -----------------------------------------------------------------------------

export const DRM_TIERS = ['lossless', 'daily', 'weekly', 'monthly'] as const;

export type DRMTier = (typeof DRM_TIERS)[number];

export const DRM_RETENTION_DAYS: Record<DRMTier, number> = {
    lossless: 7,
    daily: 30,
    weekly: 90,
    monthly: 365,
} as const;

// -----------------------------------------------------------------------------
// Tiered Memory Access (6-Layer Model)
// From cheapest to most expensive
// -----------------------------------------------------------------------------

export const MEMORY_ACCESS_LAYERS = [
    'hot_files',
    'team_lead_curation',
    'agent_self_service',
    'wiki_backlinks',
    'index_lookup',
    'semantic_search',
] as const;

export type MemoryAccessLayer = (typeof MEMORY_ACCESS_LAYERS)[number];

// Hot files layer config - always loaded (~230 lines total)
export const HOT_FILES = {
    agentWorking: '.memory/agents/{slug}/working.md',
    channelContext: '.memory/projects/{domain}/{channel}/context.md',
    userPreferences: '.memory/user/preferences.md',
    companyStrategy: '.memory/company/vision.md',
} as const;

export const HOT_FILES_ESTIMATED_LINES = {
    agentWorking: 50,
    channelContext: 100,
    userPreferences: 30,
    companyStrategy: 50,
} as const;

// -----------------------------------------------------------------------------
// Entity Note (Knowledge Graph)
// .memory/entities/{type}/{name}.md format
// -----------------------------------------------------------------------------

export const ENTITY_TYPES = [
    'customers',
    'competitors',
    'leads',
    'products',
    'partners',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export interface EntityNote {
    name: string;
    entityType: EntityType;
    info: Record<string, string>;
    summary: string;
    connections: EntityConnection[];
    activities: EntityActivity[];
    openItems: EntityOpenItem[];
}

export interface EntityConnection {
    target: string; // Wiki link path: "leads/David Kim"
    label: string;
}

export interface EntityActivity {
    date: string;
    source: string; // heartbeat, trigger, meeting, etc.
    description: string;
    tags?: Record<string, string>;
}

export interface EntityOpenItem {
    description: string;
    completed: boolean;
    completedAt?: string;
}

// -----------------------------------------------------------------------------
// Memory Path Builders
// Construct filesystem paths for the v2 hierarchy
// -----------------------------------------------------------------------------

export function buildAgentMemoryPath(agentSlug: string): string {
    return `.memory/agents/${agentSlug}`;
}

export function buildProjectMemoryPath(domain: string): string {
    return `.memory/projects/${domain}`;
}

export function buildChannelMemoryPath(domain: string, channel: string): string {
    return `.memory/projects/${domain}/${channel}`;
}

export function buildEntityPath(entityType: EntityType, name: string): string {
    return `.memory/entities/${entityType}/${name}.md`;
}

export function buildTopicPath(topic: string): string {
    return `.memory/topics/${topic}.md`;
}

export function buildUserMemoryPath(): string {
    return '.memory/user';
}

export function buildCompanyMemoryPath(): string {
    return '.memory/company';
}

// -----------------------------------------------------------------------------
// Memory Search Result (v2 - scoped to hierarchy)
// Used by pgvector semantic search (Layer 6)
// -----------------------------------------------------------------------------

export interface MemorySearchResult {
    id: string;
    path: string;
    scope: MemoryScope;
    category: MemoryFileCategory;
    content: string;
    score: number;
    vectorScore?: number;
    textScore?: number;
}

// -----------------------------------------------------------------------------
// Hybrid Search Configuration (unchanged from v1)
// -----------------------------------------------------------------------------

export interface HybridSearchConfig {
    max_results: number;
    min_score: number;
    vector_weight: number;
    text_weight: number;
    candidate_multiplier: number;
}

export const DEFAULT_HYBRID_SEARCH_CONFIG: HybridSearchConfig = {
    max_results: 6,
    min_score: 0.35,
    vector_weight: 0.7,
    text_weight: 0.3,
    candidate_multiplier: 4,
} as const;

// -----------------------------------------------------------------------------
// Chunking Configuration (for pgvector indexing)
// -----------------------------------------------------------------------------

export interface ChunkingConfig {
    tokens_per_chunk: number;
    overlap_tokens: number;
    max_chars_per_chunk: number;
}

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
    tokens_per_chunk: 400,
    overlap_tokens: 80,
    max_chars_per_chunk: 2000,
} as const;

// -----------------------------------------------------------------------------
// Embedding Configuration (unchanged from v1)
// -----------------------------------------------------------------------------

export interface EmbeddingConfig {
    provider: 'openai';
    model: string;
    dimensions: number;
    batch_max_tokens: number;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
    provider: 'openai',
    model: 'text-embedding-3-large',
    dimensions: 1536,
    batch_max_tokens: 8000,
} as const;

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

export function isValidMemoryLevel(level: string): level is MemoryLevel {
    return MEMORY_LEVELS.includes(level as MemoryLevel);
}

export function isValidMemoryScope(scope: string): scope is MemoryScope {
    return MEMORY_SCOPES.includes(scope as MemoryScope);
}

export function isValidMemoryType(type: string): type is MemoryType {
    return MEMORY_TYPES.includes(type as MemoryType);
}

export function isValidDRMTier(tier: string): tier is DRMTier {
    return DRM_TIERS.includes(tier as DRMTier);
}

export function isValidEntityType(type: string): type is EntityType {
    return ENTITY_TYPES.includes(type as EntityType);
}

export function isValidMemoryFileCategory(cat: string): cat is MemoryFileCategory {
    return MEMORY_FILE_CATEGORIES.includes(cat as MemoryFileCategory);
}
