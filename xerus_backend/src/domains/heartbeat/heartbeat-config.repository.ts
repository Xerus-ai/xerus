// Heartbeat Config Repository
// CRUD operations for heartbeat_configs table

import { query } from '../../database/connection';
import {
    HeartbeatConfig,
    HeartbeatConfigRow,
    CreateHeartbeatConfigDTO,
    UpdateHeartbeatConfigDTO,
} from './types';

function mapRowToConfig(row: HeartbeatConfigRow): HeartbeatConfig {
    return {
        id: row.id,
        agent_id: row.agent_id,
        user_id: row.user_id,
        enabled: row.enabled,
        cron_expression: row.cron_expression,
        timezone: row.timezone,
        active_hours_start: row.active_hours_start,
        active_hours_end: row.active_hours_end,
        weekdays_only: row.weekdays_only,
        prompt: row.prompt,
        max_duration_seconds: row.max_duration_seconds,
        retry_on_failure: row.retry_on_failure,
        token_budget: row.token_budget,
        event_token_budget: row.event_token_budget,
        max_alerts_per_hour: row.max_alerts_per_hour,
        suppress_token: row.suppress_token,
        tool_allowlist: row.tool_allowlist,
        default_channel_id: row.default_channel_id,
        stagger_offset_ms: row.stagger_offset_ms,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export class HeartbeatConfigRepository {
    async getByAgentId(agentId: number): Promise<HeartbeatConfig | null> {
        const result = await query<HeartbeatConfigRow>(
            'SELECT * FROM heartbeat_configs WHERE agent_id = $1',
            [agentId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToConfig(result.rows[0]);
    }

    async getById(id: number): Promise<HeartbeatConfig | null> {
        const result = await query<HeartbeatConfigRow>('SELECT * FROM heartbeat_configs WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToConfig(result.rows[0]);
    }

    async upsert(data: CreateHeartbeatConfigDTO): Promise<HeartbeatConfig> {
        const result = await query<HeartbeatConfigRow>(
            `INSERT INTO heartbeat_configs (
                agent_id,
                user_id,
                enabled,
                cron_expression,
                timezone,
                active_hours_start,
                active_hours_end,
                weekdays_only,
                prompt,
                max_duration_seconds,
                retry_on_failure,
                token_budget,
                event_token_budget,
                max_alerts_per_hour,
                suppress_token,
                tool_allowlist,
                default_channel_id,
                stagger_offset_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (agent_id) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                cron_expression = EXCLUDED.cron_expression,
                timezone = EXCLUDED.timezone,
                active_hours_start = EXCLUDED.active_hours_start,
                active_hours_end = EXCLUDED.active_hours_end,
                weekdays_only = EXCLUDED.weekdays_only,
                prompt = EXCLUDED.prompt,
                max_duration_seconds = EXCLUDED.max_duration_seconds,
                retry_on_failure = EXCLUDED.retry_on_failure,
                token_budget = EXCLUDED.token_budget,
                event_token_budget = EXCLUDED.event_token_budget,
                max_alerts_per_hour = EXCLUDED.max_alerts_per_hour,
                suppress_token = EXCLUDED.suppress_token,
                tool_allowlist = EXCLUDED.tool_allowlist,
                default_channel_id = EXCLUDED.default_channel_id,
                stagger_offset_ms = EXCLUDED.stagger_offset_ms,
                updated_at = NOW()
            RETURNING *`,
            [
                data.agent_id,
                data.user_id,
                data.enabled ?? false,
                data.cron_expression ?? '0 */30 * * *',
                data.timezone ?? 'UTC',
                data.active_hours_start ?? null,
                data.active_hours_end ?? null,
                data.weekdays_only ?? false,
                data.prompt ?? null,
                data.max_duration_seconds ?? 300,
                data.retry_on_failure ?? true,
                data.token_budget ?? 8000,
                data.event_token_budget ?? 4000,
                data.max_alerts_per_hour ?? 3,
                data.suppress_token ?? 'HEARTBEAT_OK',
                data.tool_allowlist ?? null,
                data.default_channel_id ?? null,
                data.stagger_offset_ms ?? 0,
            ]
        );

        return mapRowToConfig(result.rows[0]);
    }

    async update(agentId: number, data: UpdateHeartbeatConfigDTO): Promise<HeartbeatConfig | null> {
        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        const addField = (field: string, value: unknown) => {
            setClauses.push(`${field} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        };

        if (data.enabled !== undefined) addField('enabled', data.enabled);
        if (data.cron_expression !== undefined) addField('cron_expression', data.cron_expression);
        if (data.timezone !== undefined) addField('timezone', data.timezone);
        if (data.active_hours_start !== undefined) addField('active_hours_start', data.active_hours_start);
        if (data.active_hours_end !== undefined) addField('active_hours_end', data.active_hours_end);
        if (data.weekdays_only !== undefined) addField('weekdays_only', data.weekdays_only);
        if (data.prompt !== undefined) addField('prompt', data.prompt);
        if (data.max_duration_seconds !== undefined) addField('max_duration_seconds', data.max_duration_seconds);
        if (data.retry_on_failure !== undefined) addField('retry_on_failure', data.retry_on_failure);
        if (data.token_budget !== undefined) addField('token_budget', data.token_budget);
        if (data.event_token_budget !== undefined) addField('event_token_budget', data.event_token_budget);
        if (data.max_alerts_per_hour !== undefined) addField('max_alerts_per_hour', data.max_alerts_per_hour);
        if (data.suppress_token !== undefined) addField('suppress_token', data.suppress_token);
        if (data.tool_allowlist !== undefined) addField('tool_allowlist', data.tool_allowlist);
        if (data.default_channel_id !== undefined) addField('default_channel_id', data.default_channel_id);
        if (data.stagger_offset_ms !== undefined) addField('stagger_offset_ms', data.stagger_offset_ms);

        if (setClauses.length === 0) {
            return this.getByAgentId(agentId);
        }

        values.push(agentId);

        const result = await query<HeartbeatConfigRow>(
            `UPDATE heartbeat_configs SET ${setClauses.join(', ')}, updated_at = NOW() WHERE agent_id = $${paramIndex} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToConfig(result.rows[0]);
    }

    async deleteByAgentId(agentId: number): Promise<boolean> {
        const result = await query('DELETE FROM heartbeat_configs WHERE agent_id = $1', [agentId]);
        return (result.rowCount ?? 0) > 0;
    }

    // Full scan expected; result set bounded by total user count.
    // Optional limit parameter available for pagination if needed.
    async listEnabled(limit?: number): Promise<HeartbeatConfig[]> {
        if (limit !== undefined) {
            const result = await query<HeartbeatConfigRow>(
                'SELECT * FROM heartbeat_configs WHERE enabled = true ORDER BY agent_id LIMIT $1',
                [limit]
            );
            return result.rows.map(mapRowToConfig);
        }
        const result = await query<HeartbeatConfigRow>(
            'SELECT * FROM heartbeat_configs WHERE enabled = true ORDER BY agent_id',
            []
        );
        return result.rows.map(mapRowToConfig);
    }

    async listByUserId(userId: string): Promise<HeartbeatConfig[]> {
        const result = await query<HeartbeatConfigRow>(
            'SELECT * FROM heartbeat_configs WHERE user_id = $1 ORDER BY agent_id',
            [userId]
        );
        return result.rows.map(mapRowToConfig);
    }

    async batchUpdateOffsets(updates: Array<{ agentId: number; offset: number }>): Promise<void> {
        if (updates.length === 0) {
            return;
        }

        const valueParts: string[] = [];
        const params: unknown[] = [];
        for (let i = 0; i < updates.length; i++) {
            const base = i * 2;
            valueParts.push(`($${base + 1}::int, $${base + 2}::int)`);
            params.push(updates[i].agentId, updates[i].offset);
        }

        await query(
            `UPDATE heartbeat_configs AS hc SET
                stagger_offset_ms = v.offset,
                updated_at = NOW()
             FROM (VALUES ${valueParts.join(', ')}) AS v(agent_id, offset)
             WHERE hc.agent_id = v.agent_id`,
            params
        );
    }
}

export const heartbeatConfigRepository = new HeartbeatConfigRepository();
