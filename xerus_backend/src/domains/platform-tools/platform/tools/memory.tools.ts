// Memory Operations Platform Tools
// Implements platform.query_memory, platform.write_memory, platform.analyze_memory_patterns
// Source: docs/planning/execution/git-memory-system.md

import crypto from 'crypto';
import { query } from '../../../../database/connection';
import { OpenAIEmbeddingClient } from '../../../memory/git-memory/memory-search-index.service';
import type {
    QueryMemoryInput,
    WriteMemoryInput,
    AnalyzeMemoryPatternsInput,
    QueryMemoryResult,
    WriteMemoryResult,
    AnalyzeMemoryPatternsResult,
    MemorySearchResult,
    MemoryPattern,
    MemoryScope,
} from '../platform-tool.inlined-types';
import type { MemoryServicePort } from '../platform-tool.types';
import { WorkspaceNotFoundError } from '../../../execution/errors';

// Re-export for consumers of this module
export { WorkspaceNotFoundError };

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_MEMORY_LIMIT = 10;
// Must match DB CHECK constraint: working, episodic, semantic, procedural, action_history
const DEFAULT_MEMORY_TYPE = 'working';
const MEMORY_CATEGORIES = [
    'user_preferences',
    'project_context',
    'learned_patterns',
    'error_resolutions',
    'workflow_insights',
    'domain_knowledge',
] as const;

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class InvalidScopeError extends Error {
    constructor(scope: string, scopeId?: string) {
        super(`Invalid scope: ${scope}${scopeId ? ` with id ${scopeId}` : ''}`);
        this.name = 'InvalidScopeError';
    }
}

export class ScopeAccessDeniedError extends Error {
    constructor(scope: string, scopeId: string) {
        super(`Access denied to ${scope} with id ${scopeId}`);
        this.name = 'ScopeAccessDeniedError';
    }
}

// -----------------------------------------------------------------------------
// Row Types
// -----------------------------------------------------------------------------

interface MemoryRow {
    id: string;
    content: string;
    file_path: string;
    memory_type: string;
    scope: string;
    relevance: number;
    created_at: Date;
}

interface CountRow {
    memory_type: string;
    count: string;
}

interface SampleRow {
    memory_type: string;
    content: string;
}

// -----------------------------------------------------------------------------
// Embedding Helper (shared with memory-search-index.service)
// -----------------------------------------------------------------------------

let _embeddingClient: OpenAIEmbeddingClient | null = null;

function getEmbeddingClient(): OpenAIEmbeddingClient {
    if (!_embeddingClient) {
        _embeddingClient = new OpenAIEmbeddingClient();
    }
    return _embeddingClient;
}

async function generateEmbedding(text: string): Promise<number[]> {
    const results = await getEmbeddingClient().generateEmbeddings([text]);
    return results[0];
}

// -----------------------------------------------------------------------------
// Memory Service
// -----------------------------------------------------------------------------

export class MemoryService implements MemoryServicePort {
    async queryMemory(
        userId: string,
        input: QueryMemoryInput
    ): Promise<QueryMemoryResult> {
        const { query: searchQuery, scope, scopeId, memoryType, limit = DEFAULT_MEMORY_LIMIT } = input;

        const workspaceId = await this.getWorkspaceId(userId);
        const embedding = await generateEmbedding(searchQuery);
        const embeddingStr = `[${embedding.join(',')}]`;

        let queryText = `SELECT id, content, file_path, memory_type, scope,
                         1 - (embedding <=> $1::vector) as relevance, created_at
                         FROM memory_search_index WHERE workspace_id = $2::uuid`;
        const params: unknown[] = [embeddingStr, workspaceId];
        let paramIndex = 3;

        if (scope) {
            queryText += ` AND scope = $${paramIndex}`;
            params.push(scope);
            paramIndex++;
        }

        if (scopeId && scope) {
            // Verify user has access to the requested scope before querying
            await this.verifyScopeAccess(userId, scope as MemoryScope, scopeId, workspaceId);

            const scopeColumn = this.getScopeColumn(scope as MemoryScope);
            if (scopeColumn) {
                queryText += ` AND ${scopeColumn} = $${paramIndex}`;
                params.push(this.parseScopeId(scope as MemoryScope, scopeId));
                paramIndex++;
            }
        }

        if (memoryType) {
            queryText += ` AND memory_type = $${paramIndex}`;
            params.push(memoryType);
            paramIndex++;
        }

        queryText += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
        params.push(limit);

        const result = await query<MemoryRow>(queryText, params);

        const results: MemorySearchResult[] = result.rows.map((row: MemoryRow) => ({
            id: row.id,
            content: row.content,
            filePath: row.file_path,
            memoryType: row.memory_type,
            scope: row.scope as MemoryScope,
            relevance: parseFloat(String(row.relevance)),
            createdAt: row.created_at.toISOString(),
        }));

        return { results, totalCount: results.length };
    }

    async writeMemory(
        userId: string,
        input: WriteMemoryInput
    ): Promise<WriteMemoryResult> {
        const { content, scope, scopeId, memoryType = DEFAULT_MEMORY_TYPE, filePath } = input;

        const workspaceId = await this.getWorkspaceId(userId);

        // Verify user has access to the requested scope before writing
        if (scopeId && scope) {
            await this.verifyScopeAccess(userId, scope as MemoryScope, scopeId, workspaceId);
        }
        const embedding = await generateEmbedding(content);
        const embeddingStr = `[${embedding.join(',')}]`;
        const finalFilePath = filePath ?? this.generateFilePath(scope, memoryType);
        const contentHash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);

        const scopeColumns = this.buildScopeColumns(scope, scopeId);

        const queryText = `INSERT INTO memory_search_index (
            workspace_id, file_path, chunk_start_line, chunk_end_line,
            content, content_hash, memory_type, scope,
            ${scopeColumns.columns ? scopeColumns.columns + ',' : ''}
            embedding, created_at, updated_at
        ) VALUES (
            $1::uuid, $2, 1, 1, $3, $4, $5, $6,
            ${scopeColumns.placeholders ? scopeColumns.placeholders + ',' : ''}
            $${scopeColumns.nextIndex}::vector, NOW(), NOW()
        )
        ON CONFLICT (workspace_id, file_path, chunk_start_line)
        DO UPDATE SET content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
                      embedding = EXCLUDED.embedding, updated_at = NOW()
        RETURNING id, created_at`;

        const params = [workspaceId, finalFilePath, content, contentHash, memoryType, scope,
                        ...scopeColumns.values, embeddingStr];

        const result = await query<{ id: string; created_at: Date }>(queryText, params);
        const row = result.rows[0];

        if (!row) {
            throw new Error('Failed to write memory: no row returned from INSERT');
        }

        return {
            id: row.id,
            filePath: finalFilePath,
            scope,
            memoryType,
            createdAt: row.created_at.toISOString(),
        };
    }

    async analyzeMemoryPatterns(
        userId: string,
        input: AnalyzeMemoryPatternsInput
    ): Promise<AnalyzeMemoryPatternsResult> {
        const { scope, scopeId, categories = [...MEMORY_CATEGORIES] } = input;

        const workspaceId = await this.getWorkspaceId(userId);

        // Verify user has access to the requested scope before analyzing
        if (scopeId && scope) {
            await this.verifyScopeAccess(userId, scope as MemoryScope, scopeId, workspaceId);
        }

        let baseFilter = `workspace_id = $1::uuid`;
        const params: unknown[] = [workspaceId];
        let paramIndex = 2;

        if (scope) {
            baseFilter += ` AND scope = $${paramIndex}`;
            params.push(scope);
            paramIndex++;
        }

        if (scopeId && scope) {
            const scopeColumn = this.getScopeColumn(scope as MemoryScope);
            if (scopeColumn) {
                baseFilter += ` AND ${scopeColumn} = $${paramIndex}`;
                params.push(this.parseScopeId(scope as MemoryScope, scopeId));
            }
        }

        const countResult = await query<CountRow>(
            `SELECT memory_type, COUNT(*) as count FROM memory_search_index
             WHERE ${baseFilter} GROUP BY memory_type`,
            params
        );

        const sampleResult = await query<SampleRow>(
            `SELECT memory_type, content FROM memory_search_index
             WHERE ${baseFilter} ORDER BY created_at DESC LIMIT 100`,
            params
        );

        const memoriesByType = new Map<string, string[]>();
        for (const row of sampleResult.rows) {
            const existing = memoriesByType.get(row.memory_type) ?? [];
            existing.push(row.content);
            memoriesByType.set(row.memory_type, existing);
        }

        const patterns: MemoryPattern[] = categories.map((category) => {
            const categoryMemories = memoriesByType.get(category) ?? [];
            const countRow = countResult.rows.find((r: CountRow) => r.memory_type === category);

            return {
                category,
                count: parseInt(countRow?.count ?? '0', 10),
                examples: categoryMemories.slice(0, 3),
                insights: this.extractInsights(categoryMemories),
            };
        });

        const totalResult = await query<{ total: string }>(
            `SELECT COUNT(*) as total FROM memory_search_index WHERE ${baseFilter}`,
            params
        );

        return {
            patterns,
            analyzedAt: new Date().toISOString(),
            totalMemories: parseInt(totalResult.rows[0]?.total ?? '0', 10),
        };
    }

    private async getWorkspaceId(userId: string): Promise<string> {
        const result = await query<{ id: string }>(
            `SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId]
        );
        if (result.rows.length === 0) {
            throw new WorkspaceNotFoundError(userId);
        }
        return result.rows[0].id;
    }

    /**
     * Verify user has access to the requested scope.
     * Prevents unauthorized cross-workspace memory access.
     *
     * Security model: workspace_id in every memory_search_index query is the
     * primary security boundary. Domain/channel entities live in workspace-DB
     * (per-sandbox SQLite) and are not queryable from backend Neon.
     * The workspace_id check (derived from userId via getWorkspaceId) ensures
     * the user can only access memories in their own workspace.
     *
     * Agent scope validates via workspace_id boundary (agent_registry dropped in migration 093).
     */
    private async verifyScopeAccess(
        _userId: string,
        scope: MemoryScope,
        scopeId: string,
        _workspaceId: string
    ): Promise<void> {
        switch (scope) {
            case 'project':
            case 'channel':
                // Domain/channel entities migrated to workspace-DB (sandbox SQLite).
                // Workspace_id boundary in all memory queries ensures user isolation.
                // Validate scopeId format (must be a valid integer for memory_search_index columns).
                if (isNaN(parseInt(scopeId, 10))) {
                    throw new InvalidScopeError(scope, scopeId);
                }
                return;
            case 'agent':
                // Agent scope: scopeId is now agent_slug (string).
                // Security boundary is workspace_id in all memory queries.
                // Validate scopeId is non-empty.
                if (!scopeId || scopeId.trim().length === 0) {
                    throw new InvalidScopeError(scope, scopeId);
                }
                return;
            default:
                return; // company scope - already verified via workspaceId
        }
    }

    /**
     * Maps scope to database column name.
     * SECURITY: This is a whitelist - only hardcoded column names are returned.
     * Safe for SQL interpolation because values cannot be user-controlled.
     */
    private getScopeColumn(scope: MemoryScope): string | null {
        // Whitelist mapping - safe for SQL interpolation
        const SCOPE_COLUMN_MAP: Record<string, string> = {
            'project': 'project_id',
            'channel': 'channel_id',
            'agent': 'agent_slug',
        };
        return SCOPE_COLUMN_MAP[scope] ?? null;
    }

    private buildScopeColumns(
        scope: MemoryScope,
        scopeId?: string
    ): { columns: string; placeholders: string; values: unknown[]; nextIndex: number } {
        if (!scopeId) {
            return { columns: '', placeholders: '', values: [], nextIndex: 7 };
        }

        const parsed = this.parseScopeId(scope as MemoryScope, scopeId);
        switch (scope) {
            case 'project':
                return { columns: 'project_id', placeholders: '$7', values: [parsed], nextIndex: 8 };
            case 'channel':
                return { columns: 'channel_id', placeholders: '$7', values: [parsed], nextIndex: 8 };
            case 'agent':
                return { columns: 'agent_slug', placeholders: '$7', values: [parsed], nextIndex: 8 };
            default:
                return { columns: '', placeholders: '', values: [], nextIndex: 7 };
        }
    }

    /**
     * Parse scope ID to the correct type for the database column.
     * memory_search_index columns: project_id INTEGER, channel_id INTEGER, agent_slug TEXT
     *
     * For agent scope: return as string (agent_slug is TEXT).
     * For project/channel scope: parse to integer.
     */
    private parseScopeId(scope: MemoryScope, scopeId: string): number | string {
        if (scope === 'agent') {
            return scopeId;
        }
        // project_id and channel_id are INTEGER in memory_search_index.
        // Attempt integer parse; throw if scopeId is not a valid integer.
        const parsed = parseInt(scopeId, 10);
        if (isNaN(parsed)) {
            throw new InvalidScopeError(scope, scopeId);
        }
        return parsed;
    }

    private generateFilePath(scope: MemoryScope, memoryType: string): string {
        const timestamp = Date.now();
        return `.memory/${scope}/${memoryType}/${timestamp}.md`;
    }

    private extractInsights(memories: string[]): string[] {
        if (memories.length === 0) {
            return [];
        }

        const insights: string[] = [];
        if (memories.length >= 3) {
            insights.push(`Found ${memories.length} entries in this category`);
        }

        const avgLength = memories.reduce((sum, m) => sum + m.length, 0) / memories.length;
        if (avgLength > 500) {
            insights.push('Entries tend to be detailed and comprehensive');
        } else if (avgLength < 100) {
            insights.push('Entries are concise and brief');
        }

        return insights;
    }
}

// -----------------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------------

let serviceInstance: MemoryService | null = null;

export function getMemoryService(): MemoryService {
    if (!serviceInstance) {
        serviceInstance = new MemoryService();
    }
    return serviceInstance;
}

export function resetMemoryService(): void {
    serviceInstance = null;
}
