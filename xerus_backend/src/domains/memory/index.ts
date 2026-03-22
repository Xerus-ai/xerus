// Memory Domain - Public API (v2 Hierarchical Model)

export { default as memoryRoutes } from './memory.routes';
export {
    // Hierarchy
    MEMORY_LEVELS,
    type MemoryLevel,

    // File categories
    MEMORY_FILE_CATEGORIES,
    type MemoryFileCategory,

    // Per-level file maps
    AGENT_MEMORY_FILE_MAP,
    COMPANY_MEMORY_FILE_MAP,
    PROJECT_MEMORY_FILE_MAP,
    CHANNEL_MEMORY_FILE_MAP,
    USER_MEMORY_FILE_MAP,

    // Scopes
    MEMORY_SCOPES,
    type MemoryScope,

    // Memory types (v2 - expanded from v1 5-type model)
    MEMORY_TYPES,
    type MemoryType,

    // DRM tiers
    DRM_TIERS,
    DRM_RETENTION_DAYS,
    type DRMTier,

    // Tiered access
    MEMORY_ACCESS_LAYERS,
    type MemoryAccessLayer,
    HOT_FILES,
    HOT_FILES_ESTIMATED_LINES,

    // Entity types
    ENTITY_TYPES,
    type EntityType,
    type EntityNote,
    type EntityConnection,
    type EntityActivity,
    type EntityOpenItem,

    // Path builders
    buildAgentMemoryPath,
    buildProjectMemoryPath,
    buildChannelMemoryPath,
    buildEntityPath,
    buildTopicPath,
    buildUserMemoryPath,
    buildCompanyMemoryPath,

    // Search
    type MemorySearchResult,
    type HybridSearchConfig,
    DEFAULT_HYBRID_SEARCH_CONFIG,

    // Chunking
    type ChunkingConfig,
    DEFAULT_CHUNKING_CONFIG,

    // Embedding
    type EmbeddingConfig,
    DEFAULT_EMBEDDING_CONFIG,

    // Type guards
    isValidMemoryLevel,
    isValidMemoryScope,
    isValidMemoryType,
    isValidDRMTier,
    isValidEntityType,
    isValidMemoryFileCategory,
} from './memory.types';

// Git Memory sub-module
export * from './git-memory';
