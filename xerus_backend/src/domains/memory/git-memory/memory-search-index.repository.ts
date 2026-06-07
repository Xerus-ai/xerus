// Memory Search Index Repository
// Neon pgvector implementation for memory_search_index table operations.
// Handles CRUD and hybrid search (vector + full-text) queries.
// Reference: docs/planning/execution/git-memory-system.md (Neon pgvector Search Index)

import { query } from '../../../database/connection';
import type { MemoryType, MemoryScope } from '../memory.types';
import { DEFAULT_HYBRID_SEARCH_CONFIG } from '../memory.types';
import type { SearchIndexRepository, SearchIndexRow, SearchOptions, SearchResult } from './memory-search-index.service';

// -----------------------------------------------------------------------------
// Database Row Type
// -----------------------------------------------------------------------------

interface SearchIndexDbRow {
    id: string;
    workspace_id: string;
    file_path: string;
    chunk_start_line: number;
    chunk_end_line: number;
    content: string;
    content_hash: string;
    memory_type: string;
    scope: string;
    project_id: number | null;
    channel_id: string | null;
    agent_slug: string | null;
    commit_sha: string | null;
    score: string;
    vector_score: string;
    text_score: string;
}

// -----------------------------------------------------------------------------
// Neon pgvector Repository
// -----------------------------------------------------------------------------

export class NeonSearchIndexRepository implements SearchIndexRepository {
    /**
     * Upsert chunks into memory_search_index.
     * Matches on (workspace_id, file_path, chunk_start_line).
     * Updates if content_hash differs.
     */
    async upsertChunks(rows: SearchIndexRow[]): Promise<number> {
        if (rows.length === 0) {
            return 0;
        }

        const COLUMNS_PER_ROW = 13;

        const valueClauses = rows.map((_, i) => {
            const offset = i * COLUMNS_PER_ROW;
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, ` +
                `$${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, ` +
                `$${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}::vector, $${offset + 13})`;
        }).join(', ');

        const params = rows.flatMap(row => [
            row.workspace_id,
            row.file_path,
            row.chunk_start_line,
            row.chunk_end_line,
            row.content,
            row.content_hash,
            row.memory_type,
            row.scope,
            row.project_id ?? null,
            row.channel_id ?? null,
            row.agent_slug ?? null,
            `[${row.embedding.join(',')}]`,
            row.commit_sha ?? null,
        ]);

        const result = await query(
            `INSERT INTO memory_search_index (
                workspace_id, file_path, chunk_start_line, chunk_end_line,
                content, content_hash, memory_type, scope,
                project_id, channel_id, agent_slug, embedding, commit_sha
            )
            VALUES ${valueClauses}
            ON CONFLICT (workspace_id, file_path, chunk_start_line)
                DO UPDATE SET
                    chunk_end_line = EXCLUDED.chunk_end_line,
                    content = EXCLUDED.content,
                    content_hash = EXCLUDED.content_hash,
                    memory_type = EXCLUDED.memory_type,
                    scope = EXCLUDED.scope,
                    project_id = EXCLUDED.project_id,
                    channel_id = EXCLUDED.channel_id,
                    agent_slug = EXCLUDED.agent_slug,
                    embedding = EXCLUDED.embedding,
                    commit_sha = EXCLUDED.commit_sha,
                    updated_at = NOW()
                WHERE memory_search_index.content_hash != EXCLUDED.content_hash`,
            params
        );

        return result.rowCount ?? rows.length;
    }

    /**
     * Delete all chunks for a given file path in a workspace.
     */
    async deleteFileChunks(workspaceId: string, filePath: string): Promise<number> {
        const result = await query(
            `DELETE FROM memory_search_index
             WHERE workspace_id = $1 AND file_path = $2`,
            [workspaceId, filePath]
        );

        return result.rowCount ?? 0;
    }

    /**
     * Find existing chunks for a file to detect unchanged content.
     */
    async findExistingChunks(
        workspaceId: string,
        filePath: string
    ): Promise<Array<{ chunk_start_line: number; content_hash: string }>> {
        const result = await query<{ chunk_start_line: number; content_hash: string }>(
            `SELECT chunk_start_line, content_hash
             FROM memory_search_index
             WHERE workspace_id = $1 AND file_path = $2`,
            [workspaceId, filePath]
        );

        return result.rows;
    }

    /**
     * Hybrid search combining vector similarity and full-text relevance.
     * Uses weights from HybridSearchConfig (default: 0.7 vector, 0.3 text).
     */
    async hybridSearch(
        workspaceId: string,
        queryEmbedding: number[],
        queryText: string,
        options: SearchOptions
    ): Promise<SearchResult[]> {
        const maxResults = options.maxResults ?? DEFAULT_HYBRID_SEARCH_CONFIG.max_results;
        const minScore = options.minScore ?? DEFAULT_HYBRID_SEARCH_CONFIG.min_score;
        const vectorWeight = options.vectorWeight ?? DEFAULT_HYBRID_SEARCH_CONFIG.vector_weight;
        const textWeight = options.textWeight ?? DEFAULT_HYBRID_SEARCH_CONFIG.text_weight;
        const candidateMultiplier = DEFAULT_HYBRID_SEARCH_CONFIG.candidate_multiplier;

        const embeddingStr = `[${queryEmbedding.join(',')}]`;

        // Build dynamic WHERE clauses for filtering
        const conditions: string[] = ['workspace_id = $1'];
        const params: unknown[] = [workspaceId];
        let paramIndex = 2;

        if (options.scopes && options.scopes.length > 0) {
            conditions.push(`scope = ANY($${paramIndex})`);
            params.push(options.scopes);
            paramIndex++;
        }

        if (options.memoryTypes && options.memoryTypes.length > 0) {
            conditions.push(`memory_type = ANY($${paramIndex})`);
            params.push(options.memoryTypes);
            paramIndex++;
        }

        if (options.projectId !== undefined) {
            conditions.push(`project_id = $${paramIndex}`);
            params.push(options.projectId);
            paramIndex++;
        }

        if (options.channelId !== undefined) {
            conditions.push(`channel_id = $${paramIndex}`);
            params.push(options.channelId);
            paramIndex++;
        }

        if (options.agentSlug !== undefined) {
            conditions.push(`agent_slug = $${paramIndex}`);
            params.push(options.agentSlug);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');
        const embeddingParam = `$${paramIndex}`;
        params.push(embeddingStr);
        paramIndex++;

        const queryTextParam = `$${paramIndex}`;
        params.push(queryText);
        paramIndex++;

        // Parameterize weights to prevent SQL injection
        const vectorWeightParam = `$${paramIndex}`;
        params.push(vectorWeight);
        paramIndex++;

        const textWeightParam = `$${paramIndex}`;
        params.push(textWeight);
        paramIndex++;

        const limitParam = `$${paramIndex}`;
        params.push(maxResults * candidateMultiplier);

        const sql = `
            SELECT
                id, file_path, memory_type, scope,
                chunk_start_line, chunk_end_line, content,
                (${vectorWeightParam} * (1 - (embedding <=> ${embeddingParam}::vector)) +
                 ${textWeightParam} * COALESCE(ts_rank(to_tsvector('english', content), plainto_tsquery(${queryTextParam})), 0)) AS score,
                (1 - (embedding <=> ${embeddingParam}::vector)) AS vector_score,
                COALESCE(ts_rank(to_tsvector('english', content), plainto_tsquery(${queryTextParam})), 0) AS text_score
            FROM memory_search_index
            WHERE ${whereClause}
            ORDER BY score DESC
            LIMIT ${limitParam}
        `;

        const result = await query<SearchIndexDbRow>(sql, params);

        return result.rows
            .filter((row: SearchIndexDbRow) => parseFloat(row.score) >= minScore)
            .slice(0, maxResults)
            .map((row: SearchIndexDbRow) => ({
                id: row.id,
                file_path: row.file_path,
                memory_type: row.memory_type as MemoryType,
                scope: row.scope as MemoryScope,
                chunk_start_line: row.chunk_start_line,
                chunk_end_line: row.chunk_end_line,
                content: row.content,
                score: parseFloat(row.score),
                vector_score: parseFloat(row.vector_score),
                text_score: parseFloat(row.text_score),
            }));
    }
}
