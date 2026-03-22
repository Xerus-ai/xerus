// Git Memory Module - Public API
export { GitMemoryRepository } from './git-memory.repository';

export { GitMemoryError, CommitLockError, GitCommandError, DirectoryListError } from './errors';

export {
    GIT_MEMORY_ROOT,
    GIT_MEMORY_DIRECTORIES,
    GIT_MEMORY_FILES,
    GIT_MEMORY_CONFIG,
    AGENT_MEMORY_FILES,
    COMMIT_LOCK_TIMEOUT_MS,
    COMMIT_LOCK_RETRY_INTERVAL_MS,
    buildAgentFilePath,
    buildProjectPath,
    buildChannelPath,
    buildCommitMessage,
} from './git-memory.types';

export type {
    CommitMessageType,
    CommitMessageParts,
    GitCommitResult,
    GitDiffResult,
    CommandResult,
    SandboxCommandExecutor,
    GitMemoryFileSystem,
} from './git-memory.types';

export { DigestGeneratorService } from './digest-generator.service';

export type {
    DigestGeneratorOptions,
    DigestEntry,
} from './digest-generator.service';

export { DRMCompressionService } from './drm-compression.service';

export type {
    DRMCompressionOptions,
    CompressionResult,
    ParsedEpisodicEntry,
} from './drm-compression.service';

export { MemorySearchService } from './memory-search.service';

export type {
    SearchContext,
    TieredSearchOptions,
    SearchTier,
    SearchResultItem,
    DigestReader,
    GrepSearcher,
    VectorSearcher,
} from './memory-search.service';

export { CrossProjectSharingService } from './cross-project-sharing.service';

export type {
    SharingContext,
    ShareableMemory,
    ShareResult,
} from './cross-project-sharing.service';

export { MemoryExtractorService } from './memory-extractor.service';

export type {
    ExtractionResult,
    ExtractionContext,
    LLMClient,
    EpisodicEntry,
    SemanticEntry,
    ProceduralEntry,
} from './memory-extractor.service';

export { MemoryFileWriterService } from './memory-file-writer.service';

export type { WriteMemoryOptions } from './memory-file-writer.service';

export {
    MemorySearchIndexService,
    OpenAIEmbeddingClient,
    createMemorySearchIndexService,
    chunkContent,
    computeContentHash,
} from './memory-search-index.service';

export type {
    MemoryIndexer,
    IndexFileOptions,
    SearchOptions,
    SearchResult,
    SearchIndexRow,
    SearchIndexRepository,
    EmbeddingClient,
    FileReadResult,
    FileReader,
} from './memory-search-index.service';

export { NeonSearchIndexRepository } from './memory-search-index.repository';

export {
    TeamMemoryService,
    TeamMemorySearchService,
    TeamMemoryCoordinatorService,
    TeamMemoryPromotionService,
} from './team-memory.service';

export type {
    TeamContext,
    TeamQueryScope,
    TeamSearchOptions,
    TeamSearchResult,
    CoordinatorLearningInput,
    AgentTeamOutput,
    AgentTeamParticipation,
    AgentTeamRole,
    CoordinationMode,
    DelegationPattern,
    DelegationStep,
    PromotionCandidate,
    PromotionResult,
} from './team-memory.types';

export {
    TEAM_QUERY_SCOPES,
    COORDINATION_MODES,
    TEAM_SEARCH_WEIGHTS,
    PROMOTION_SIGNIFICANCE_THRESHOLD,
    MAX_PROMOTIONS_PER_MERGE,
    isValidTeamQueryScope,
    isValidCoordinationMode,
    resolveAgentTeamRole,
} from './team-memory.types';

export {
    TeamMemoryError,
    TeamContextRequiredError,
    InvalidTeamQueryScopeError,
    PromotionThresholdError,
    CoordinatorNotInTeamError,
    DuplicatePromotionError,
} from './team-memory.errors';
