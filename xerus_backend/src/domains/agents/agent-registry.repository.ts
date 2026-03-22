// Agent Registry Repository
// Thin lookup layer for ID<->slug resolution.
// Replaces the full 24-column agents table with a 5-column registry.

import { query } from '../../database/connection';

export interface AgentRegistryEntry {
    id: number;
    slug: string;
    user_id: string | null;
    agent_type: string;
    created_at: Date;
}

export class AgentRegistryRepository {
    async register(
        slug: string,
        userId: string | null,
        agentType: string = 'private',
    ): Promise<AgentRegistryEntry> {
        const result = await query<AgentRegistryEntry>(
            `INSERT INTO agent_registry (slug, user_id, agent_type)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [slug, userId, agentType],
        );
        return result.rows[0];
    }

    async findBySlug(slug: string, userId: string | null): Promise<AgentRegistryEntry | null> {
        const result = await query<AgentRegistryEntry>(
            `SELECT * FROM agent_registry WHERE slug = $1 AND user_id = $2 LIMIT 1`,
            [slug, userId],
        );
        return result.rows[0] || null;
    }

    async findById(id: number): Promise<AgentRegistryEntry | null> {
        const result = await query<AgentRegistryEntry>(
            `SELECT * FROM agent_registry WHERE id = $1`,
            [id],
        );
        return result.rows[0] || null;
    }

    async delete(id: number): Promise<void> {
        await query('DELETE FROM agent_registry WHERE id = $1', [id]);
    }

    async deleteBySlug(slug: string, userId: string): Promise<void> {
        await query(
            'DELETE FROM agent_registry WHERE slug = $1 AND user_id = $2',
            [slug, userId],
        );
    }

    async updateType(id: number, agentType: string): Promise<void> {
        await query(
            'UPDATE agent_registry SET agent_type = $2 WHERE id = $1',
            [id, agentType],
        );
    }

    async countByUser(userId: string, agentType?: string): Promise<number> {
        let sql = 'SELECT COUNT(*) as count FROM agent_registry WHERE user_id = $1';
        const params: unknown[] = [userId];

        if (agentType) {
            sql += ' AND agent_type = $2';
            params.push(agentType);
        }

        const result = await query<{ count: string }>(sql, params);
        return parseInt(result.rows[0].count, 10);
    }

    async listByUser(userId: string): Promise<AgentRegistryEntry[]> {
        const result = await query<AgentRegistryEntry>(
            `SELECT * FROM agent_registry
             WHERE user_id = $1 AND agent_type IN ('private', 'public')
             ORDER BY created_at DESC`,
            [userId],
        );
        return result.rows;
    }

}

export const agentRegistryRepository = new AgentRegistryRepository();
