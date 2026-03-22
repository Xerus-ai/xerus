// Snapshot Execution Repository
// CRUD operations for snapshot_executions table

import { query } from '../../../database/connection';
import {
    SnapshotExecution,
    SnapshotExecutionRow,
    CreateSnapshotExecutionDTO,
    SnapshotSourceError,
} from './snapshot.types';

function parseJsonbErrors(errors: unknown): SnapshotSourceError[] {
    if (Array.isArray(errors)) {
        return errors;
    }
    if (typeof errors === 'string') {
        return JSON.parse(errors);
    }
    throw new Error(`Unexpected errors type: ${typeof errors}. Expected array or JSON string.`);
}

function mapRowToExecution(row: SnapshotExecutionRow): SnapshotExecution {
    return {
        id: row.id,
        agent_id: row.agent_id,
        sources_fetched: row.sources_fetched,
        sources_failed: row.sources_failed,
        duration_ms: row.duration_ms,
        snapshot_hash: row.snapshot_hash,
        file_path: row.file_path,
        errors: parseJsonbErrors(row.errors),
        created_at: row.created_at,
    };
}

export class SnapshotExecutionRepository {
    async create(data: CreateSnapshotExecutionDTO): Promise<SnapshotExecution> {
        const result = await query<SnapshotExecutionRow>(
            `INSERT INTO snapshot_executions
                (agent_id, sources_fetched, sources_failed, duration_ms, snapshot_hash, file_path, errors)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                data.agent_id,
                data.sources_fetched,
                data.sources_failed,
                data.duration_ms,
                data.snapshot_hash,
                data.file_path,
                JSON.stringify(data.errors),
            ]
        );

        return mapRowToExecution(result.rows[0]);
    }

    async getLatestByAgentId(agentId: number): Promise<SnapshotExecution | null> {
        const result = await query<SnapshotExecutionRow>(
            `SELECT * FROM snapshot_executions
             WHERE agent_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [agentId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToExecution(result.rows[0]);
    }

    async getById(id: string): Promise<SnapshotExecution | null> {
        const result = await query<SnapshotExecutionRow>(
            'SELECT * FROM snapshot_executions WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToExecution(result.rows[0]);
    }

    async listByAgentId(
        agentId: number,
        limit: number = 20,
        offset: number = 0
    ): Promise<{ executions: SnapshotExecution[]; total: number }> {
        const countResult = await query<{ count: string }>(
            'SELECT COUNT(*) as count FROM snapshot_executions WHERE agent_id = $1',
            [agentId]
        );

        const result = await query<SnapshotExecutionRow>(
            `SELECT * FROM snapshot_executions
             WHERE agent_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [agentId, limit, offset]
        );

        return {
            executions: result.rows.map(mapRowToExecution),
            total: parseInt(countResult.rows[0].count, 10),
        };
    }

    async deleteByAgentId(agentId: number): Promise<number> {
        const result = await query(
            'DELETE FROM snapshot_executions WHERE agent_id = $1',
            [agentId]
        );
        return result.rowCount ?? 0;
    }
}

export const snapshotExecutionRepository = new SnapshotExecutionRepository();
