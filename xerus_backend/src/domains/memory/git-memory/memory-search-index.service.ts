// Memory Search Index Service
// Indexes .memory/ git files into Neon pgvector for semantic search.
// Source of truth: git files in .memory/ on Daytona workspace volume.
// Reference: docs/planning/execution/git-memory-system.md (Neon pgvector Search Index)

import { createHash } from 'crypto';
import type { MemoryType, MemoryScope } from '../memory.types';
import {
    DEFAULT_CHUNKING_CONFIG,
    DEFAULT_HYBRID_SEARCH_CONFIG,
} from '../memory.types';

// -- Embedding Client Interface (injected) ------------------------------------

export interface EmbeddingClient {
    generateEmbeddings(texts: string[]): Promise<number[][]>;
}

// -- Repository Interface (injected for testability) --------------------------

export interface SearchIndexRow {
    id?: string;
    workspace_id: string;
    file_path: string;
    chunk_start_line: number;
    chunk_end_line: number;
    content: string;
    content_hash: string;
    memory_type: MemoryType;
    scope: MemoryScope;
    project_id?: number;
    channel_id?: string;
    agent_id?: number;
    embedding: number[];
    commit_sha?: string;
}

export interface SearchOptions {
    maxResults?: number;
    minScore?: number;
    vectorWeight?: number;
    textWeight?: number;
    scopes?: MemoryScope[];
    memoryTypes?: MemoryType[];
    projectId?: number;
    channelId?: string;
    agentId?: number;
}

export interface SearchResult {
    id: string;
    file_path: string;
    memory_type: MemoryType;
    scope: MemoryScope;
    chunk_start_line: number;
    chunk_end_line: number;
    content: string;
    score: number;
    vector_score: number;
    text_score: number;
}

export interface SearchIndexRepository {
    upsertChunks(rows: SearchIndexRow[]): Promise<number>;
    deleteFileChunks(workspaceId: string, filePath: string): Promise<number>;
    findExistingChunks(
        workspaceId: string,
        filePath: string
    ): Promise<Array<{ chunk_start_line: number; content_hash: string }>>;
    hybridSearch(
        workspaceId: string,
        queryEmbedding: number[],
        queryText: string,
        options: SearchOptions
    ): Promise<SearchResult[]>;
}

// -- MemoryIndexer Interface (narrow contract for DRMCompressionService) ------

/**
 * Narrow interface for memory indexing operations.
 * Used by DRMCompressionService to avoid depending on the full MemorySearchIndexService.
 */
export interface MemoryIndexer {
    indexFile(options: IndexFileOptions): Promise<void>;
}

// -- Index File Options -------------------------------------------------------

export interface IndexFileOptions {
    workspaceId: string;
    filePath: string;
    content: string;
    memoryType: MemoryType;
    scope: MemoryScope;
    projectId?: number;
    channelId?: string;
    agentId?: number;
    commitSha?: string;
}

export interface FileReadResult {
    content: string;
    memoryType: MemoryType;
    scope: MemoryScope;
    projectId?: number;
    channelId?: string;
    agentId?: number;
}

export type FileReader = (filePath: string) => Promise<FileReadResult | null>;

interface ContentChunk {
    content: string;
    startLine: number;
    endLine: number;
}

// -- Pure Functions -----------------------------------------------------------

/**
 * Split content into chunks based on ChunkingConfig.
 * Uses line-based splitting with token estimation (4 chars ~ 1 token).
 */
export function chunkContent(
    content: string,
    tokensPerChunk = DEFAULT_CHUNKING_CONFIG.tokens_per_chunk,
    overlapTokens = DEFAULT_CHUNKING_CONFIG.overlap_tokens,
    maxCharsPerChunk = DEFAULT_CHUNKING_CONFIG.max_chars_per_chunk
): ContentChunk[] {
    if (!content || content.trim().length === 0) {
        return [];
    }

    const lines = content.split('\n');
    const charsPerToken = 4;
    const maxCharsFromTokens = tokensPerChunk * charsPerToken;
    const effectiveMaxChars = Math.min(maxCharsFromTokens, maxCharsPerChunk);
    const overlapChars = overlapTokens * charsPerToken;
    const chunks: ContentChunk[] = [];
    let currentStart = 0;

    while (currentStart < lines.length) {
        let currentChars = 0;
        let currentEnd = currentStart;

        while (currentEnd < lines.length) {
            const lineChars = lines[currentEnd].length + 1;
            if (currentChars + lineChars > effectiveMaxChars && currentEnd > currentStart) {
                break;
            }
            currentChars += lineChars;
            currentEnd++;
        }

        const chunkText = lines.slice(currentStart, currentEnd).join('\n');
        if (chunkText.trim().length > 0) {
            chunks.push({
                content: chunkText,
                startLine: currentStart + 1,
                endLine: currentEnd,
            });
        }

        if (currentEnd >= lines.length) {
            break;
        }

        const chunkLineCount = currentEnd - currentStart;
        const avgCharsPerLine = currentChars / Math.max(1, chunkLineCount);
        const overlapLines = Math.max(1, Math.floor(overlapChars / avgCharsPerLine));
        const advance = Math.max(1, chunkLineCount - overlapLines);
        currentStart += advance;
    }

    return chunks;
}

/** Compute SHA-256 hash of content for deduplication. */
export function computeContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

// -- Memory Search Index Service ----------------------------------------------

export class MemorySearchIndexService {
    private readonly embeddingClient: EmbeddingClient;
    private readonly repository: SearchIndexRepository;

    constructor(embeddingClient: EmbeddingClient, repository: SearchIndexRepository) {
        this.embeddingClient = embeddingClient;
        this.repository = repository;
    }

    /**
     * Index a single memory file. Chunks content, generates embeddings,
     * and upserts into pgvector. Skips chunks whose content_hash has not changed.
     */
    async indexFile(options: IndexFileOptions): Promise<void> {
        const chunks = chunkContent(options.content);
        if (chunks.length === 0) {
            return;
        }

        const newChunks = chunks.map((chunk) => ({
            ...chunk,
            hash: computeContentHash(chunk.content),
        }));

        const existing = await this.repository.findExistingChunks(
            options.workspaceId,
            options.filePath
        );
        const existingMap = new Map(existing.map((e) => [e.chunk_start_line, e.content_hash]));

        const changedChunks = newChunks.filter((chunk) => {
            const existingHash = existingMap.get(chunk.startLine);
            return existingHash !== chunk.hash;
        });

        if (changedChunks.length === 0) {
            return;
        }

        const texts = changedChunks.map((c) => c.content);
        const embeddings = await this.embeddingClient.generateEmbeddings(texts);

        const rows: SearchIndexRow[] = changedChunks.map((chunk, i) => ({
            workspace_id: options.workspaceId,
            file_path: options.filePath,
            chunk_start_line: chunk.startLine,
            chunk_end_line: chunk.endLine,
            content: chunk.content,
            content_hash: chunk.hash,
            memory_type: options.memoryType,
            scope: options.scope,
            project_id: options.projectId,
            channel_id: options.channelId,
            agent_id: options.agentId,
            embedding: embeddings[i],
            commit_sha: options.commitSha,
        }));

        await this.repository.upsertChunks(rows);
    }

    /** Remove all chunks for a file that has been deleted from .memory/. */
    async removeFileChunks(workspaceId: string, filePath: string): Promise<number> {
        return this.repository.deleteFileChunks(workspaceId, filePath);
    }

    /**
     * Index a batch of changed files from a git commit.
     * Batches embedding calls across all files for efficiency.
     * For files that cannot be read (deleted), removes their chunks.
     */
    async indexChangedFiles(
        workspaceId: string,
        changedFiles: string[],
        readFile: FileReader,
        commitSha?: string
    ): Promise<void> {
        // Phase 1: Read all files and chunk content in parallel
        const fileResults = await Promise.all(
            changedFiles.map(async (filePath) => ({
                filePath,
                data: await readFile(filePath),
            }))
        );

        // Phase 2: Remove chunks for deleted files
        const deletions = fileResults
            .filter((f) => f.data === null)
            .map((f) => this.removeFileChunks(workspaceId, f.filePath));
        await Promise.all(deletions);

        // Phase 3: Find existing chunks for all readable files in parallel
        const readableFiles = fileResults.filter(
            (f): f is { filePath: string; data: FileReadResult } => f.data !== null
        );
        if (readableFiles.length === 0) return;

        const existingChunksMap = new Map<string, Map<number, string>>();
        await Promise.all(
            readableFiles.map(async (f) => {
                const existing = await this.repository.findExistingChunks(workspaceId, f.filePath);
                existingChunksMap.set(
                    f.filePath,
                    new Map(existing.map((e) => [e.chunk_start_line, e.content_hash]))
                );
            })
        );

        // Phase 4: Collect all changed chunks across files
        interface PendingChunk {
            fileIdx: number;
            chunk: { content: string; startLine: number; endLine: number; hash: string };
        }
        const pendingChunks: PendingChunk[] = [];

        for (let i = 0; i < readableFiles.length; i++) {
            const file = readableFiles[i];
            const chunks = chunkContent(file.data.content);
            const existingMap = existingChunksMap.get(file.filePath) ?? new Map();

            for (const chunk of chunks) {
                const hash = computeContentHash(chunk.content);
                if (existingMap.get(chunk.startLine) !== hash) {
                    pendingChunks.push({ fileIdx: i, chunk: { ...chunk, hash } });
                }
            }
        }

        if (pendingChunks.length === 0) return;

        // Phase 5: Single batched embedding call for all chunks
        const texts = pendingChunks.map((p) => p.chunk.content);
        const embeddings = await this.embeddingClient.generateEmbeddings(texts);

        // Phase 6: Build rows and upsert in one batch
        const rows: SearchIndexRow[] = pendingChunks.map((p, i) => {
            const file = readableFiles[p.fileIdx];
            return {
                workspace_id: workspaceId,
                file_path: file.filePath,
                chunk_start_line: p.chunk.startLine,
                chunk_end_line: p.chunk.endLine,
                content: p.chunk.content,
                content_hash: p.chunk.hash,
                memory_type: file.data.memoryType,
                scope: file.data.scope,
                project_id: file.data.projectId,
                channel_id: file.data.channelId,
                agent_id: file.data.agentId,
                embedding: embeddings[i],
                commit_sha: commitSha,
            };
        });

        await this.repository.upsertChunks(rows);
    }

    /** Search the memory index using hybrid vector + full-text search. */
    async search(
        workspaceId: string,
        queryText: string,
        options: SearchOptions = {}
    ): Promise<SearchResult[]> {
        const [queryEmbedding] = await this.embeddingClient.generateEmbeddings([queryText]);
        return this.repository.hybridSearch(workspaceId, queryEmbedding, queryText, {
            maxResults: options.maxResults ?? DEFAULT_HYBRID_SEARCH_CONFIG.max_results,
            minScore: options.minScore ?? DEFAULT_HYBRID_SEARCH_CONFIG.min_score,
            vectorWeight: options.vectorWeight ?? DEFAULT_HYBRID_SEARCH_CONFIG.vector_weight,
            textWeight: options.textWeight ?? DEFAULT_HYBRID_SEARCH_CONFIG.text_weight,
            scopes: options.scopes,
            memoryTypes: options.memoryTypes,
            projectId: options.projectId,
            channelId: options.channelId,
            agentId: options.agentId,
        });
    }
}

// -- Re-exports from extracted modules ----------------------------------------

export { NeonSearchIndexRepository } from './memory-search-index.repository';
export { OpenAIEmbeddingClient, createMemorySearchIndexService } from './openai-embedding-client';
