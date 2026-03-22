// Output Registry Platform Tools
// Implements platform.search_outputs
// Source: docs/planning/execution/architecture.md

import { query } from '../../../../database/connection';
import type {
    SearchOutputsInput,
    SearchOutputsResult,
    OutputEntry,
} from '../../agents/xerus-master.types';
import type { OutputServicePort } from '../platform-tool.types';
import { WorkspaceNotFoundError } from '../../errors';

// Re-export for consumers of this module
export { WorkspaceNotFoundError };

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_OUTPUT_LIMIT = 20;
const MAX_OUTPUT_LIMIT = 100;

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class InvalidDateRangeError extends Error {
    constructor(dateFrom: string, dateTo: string) {
        super(`Invalid date range: ${dateFrom} to ${dateTo}`);
        this.name = 'InvalidDateRangeError';
    }
}

// -----------------------------------------------------------------------------
// Row Types
// -----------------------------------------------------------------------------

interface OutputRow {
    id: string;
    agent_id: number;
    output_type: string;
    memory_commit_sha: string | null;
    agent_response: string | null;
    created_at: Date;
    completed_at: Date | null;
}

// -----------------------------------------------------------------------------
// Output Service
// -----------------------------------------------------------------------------

export class OutputService implements OutputServicePort {
    async searchOutputs(
        userId: string,
        input: SearchOutputsInput
    ): Promise<SearchOutputsResult> {
        const {
            taskId,
            agentId,
            outputType,
            dateFrom,
            dateTo,
            limit = DEFAULT_OUTPUT_LIMIT,
        } = input;

        const workspaceId = await this.getWorkspaceId(userId);
        const effectiveLimit = Math.min(limit, MAX_OUTPUT_LIMIT);

        if (dateFrom && dateTo) {
            const from = new Date(dateFrom);
            const to = new Date(dateTo);
            if (from > to) {
                throw new InvalidDateRangeError(dateFrom, dateTo);
            }
        }

        // Build WHERE clause for reuse in both COUNT and SELECT
        let whereClause = `workspace_id = $1::uuid AND status = 'completed'`;
        const filterParams: unknown[] = [workspaceId];
        let paramIndex = 2;

        if (agentId) {
            whereClause += ` AND agent_id = $${paramIndex}`;
            filterParams.push(parseInt(agentId, 10));
            paramIndex++;
        }

        if (dateFrom) {
            whereClause += ` AND created_at >= $${paramIndex}::timestamp`;
            filterParams.push(dateFrom);
            paramIndex++;
        }

        if (dateTo) {
            whereClause += ` AND created_at <= $${paramIndex}::timestamp`;
            filterParams.push(dateTo);
            paramIndex++;
        }

        // Filter by outputType in SQL, not post-query (fixes pagination/limit issues)
        if (outputType) {
            whereClause += ` AND trigger_type = $${paramIndex}`;
            filterParams.push(outputType);
            paramIndex++;
        }

        // Get total count for pagination
        const countResult = await query<{ count: string }>(
            `SELECT COUNT(*) as count FROM execution_sessions WHERE ${whereClause}`,
            filterParams
        );
        const totalCount = parseInt(countResult.rows[0]?.count ?? '0', 10);

        // Get paginated results
        const selectParams = [...filterParams, effectiveLimit];
        const result = await query<OutputRow>(
            `SELECT id, agent_id, trigger_type as output_type,
                    memory_commit_sha, agent_response, created_at, completed_at
             FROM execution_sessions
             WHERE ${whereClause}
             ORDER BY created_at DESC LIMIT $${paramIndex}`,
            selectParams
        );

        const outputs: OutputEntry[] = result.rows.map((row: OutputRow) => {
            const filePath = row.memory_commit_sha
                ? `.outputs/${row.id}/${row.memory_commit_sha}`
                : `.outputs/${row.id}/result.json`;
            // Compute size from the agent's response content stored in DB
            const size = row.agent_response
                ? Buffer.byteLength(row.agent_response, 'utf-8')
                : 0;
            return {
                id: row.id,
                taskId: taskId ?? undefined,
                agentId: row.agent_id,
                outputType: row.output_type ?? 'execution_result',
                filePath,
                size,
                createdAt: row.created_at.toISOString(),
            };
        });

        return { outputs, totalCount };
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
}

// -----------------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------------

let serviceInstance: OutputService | null = null;

export function getOutputService(): OutputService {
    if (!serviceInstance) {
        serviceInstance = new OutputService();
    }
    return serviceInstance;
}

export function resetOutputService(): void {
    serviceInstance = null;
}
