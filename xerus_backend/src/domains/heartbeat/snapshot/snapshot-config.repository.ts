// Snapshot Config Repository
// CRUD operations for snapshot_configs table

import { query } from '../../../database/connection';
import {
    SnapshotConfig,
    SnapshotConfigRow,
    CreateSnapshotConfigDTO,
    UpdateSnapshotConfigDTO,
} from './snapshot.types';

function parseJsonbSources(sources: unknown): SnapshotConfig['sources'] {
    if (Array.isArray(sources)) {
        return sources;
    }
    if (typeof sources === 'string') {
        return JSON.parse(sources);
    }
    throw new Error(`Unexpected sources type: ${typeof sources}. Expected array or JSON string.`);
}

function mapRowToConfig(row: SnapshotConfigRow): SnapshotConfig {
    return {
        id: row.id,
        agent_id: row.agent_id,
        enabled: row.enabled,
        run_before_ms: row.run_before_ms,
        sources: parseJsonbSources(row.sources),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export class SnapshotConfigRepository {
    async getByAgentId(agentId: number): Promise<SnapshotConfig | null> {
        const result = await query<SnapshotConfigRow>(
            'SELECT * FROM snapshot_configs WHERE agent_id = $1',
            [agentId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToConfig(result.rows[0]);
    }

    async getById(id: number): Promise<SnapshotConfig | null> {
        const result = await query<SnapshotConfigRow>(
            'SELECT * FROM snapshot_configs WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToConfig(result.rows[0]);
    }

    async upsert(data: CreateSnapshotConfigDTO): Promise<SnapshotConfig> {
        const result = await query<SnapshotConfigRow>(
            `INSERT INTO snapshot_configs (agent_id, enabled, run_before_ms, sources)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (agent_id) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                run_before_ms = EXCLUDED.run_before_ms,
                sources = EXCLUDED.sources,
                updated_at = NOW()
             RETURNING *`,
            [
                data.agent_id,
                data.enabled ?? true,
                data.run_before_ms ?? 300000,
                JSON.stringify(data.sources ?? []),
            ]
        );

        return mapRowToConfig(result.rows[0]);
    }

    async update(agentId: number, data: UpdateSnapshotConfigDTO): Promise<SnapshotConfig | null> {
        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (data.enabled !== undefined) {
            setClauses.push(`enabled = $${paramIndex}`);
            values.push(data.enabled);
            paramIndex++;
        }

        if (data.run_before_ms !== undefined) {
            setClauses.push(`run_before_ms = $${paramIndex}`);
            values.push(data.run_before_ms);
            paramIndex++;
        }

        if (data.sources !== undefined) {
            setClauses.push(`sources = $${paramIndex}`);
            values.push(JSON.stringify(data.sources));
            paramIndex++;
        }

        if (setClauses.length === 0) {
            return this.getByAgentId(agentId);
        }

        values.push(agentId);

        const result = await query<SnapshotConfigRow>(
            `UPDATE snapshot_configs SET ${setClauses.join(', ')}, updated_at = NOW()
             WHERE agent_id = $${paramIndex}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToConfig(result.rows[0]);
    }

    async deleteByAgentId(agentId: number): Promise<boolean> {
        const result = await query(
            'DELETE FROM snapshot_configs WHERE agent_id = $1',
            [agentId]
        );
        return (result.rowCount ?? 0) > 0;
    }

    async listEnabled(limit = 1000): Promise<SnapshotConfig[]> {
        const result = await query<SnapshotConfigRow>(
            'SELECT * FROM snapshot_configs WHERE enabled = true ORDER BY agent_id LIMIT $1',
            [limit]
        );
        return result.rows.map(mapRowToConfig);
    }
}

export const snapshotConfigRepository = new SnapshotConfigRepository();
