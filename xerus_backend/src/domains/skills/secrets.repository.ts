// Skill Secrets Repository
// Database operations for skill_secrets table (per-user encrypted env vars)
// Uses skill_slug (text) as the skill identifier

import { query } from '../../database/connection';
import type { SkillSecretRow } from './types';

export class SkillSecretsRepository {
    async upsert(userId: string, skillSlug: string, envKey: string, encryptedValue: string, hint: string): Promise<SkillSecretRow> {
        const result = await query<SkillSecretRow>(
            `INSERT INTO skill_secrets (user_id, skill_slug, env_key, encrypted_value, hint)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, skill_slug, env_key) DO UPDATE SET
                encrypted_value = EXCLUDED.encrypted_value,
                hint = EXCLUDED.hint,
                updated_at = NOW()
             RETURNING *`,
            [userId, skillSlug, envKey, encryptedValue, hint],
        );
        return result.rows[0];
    }

    async delete(userId: string, skillSlug: string, envKey: string): Promise<boolean> {
        const result = await query(
            'DELETE FROM skill_secrets WHERE user_id = $1 AND skill_slug = $2 AND env_key = $3',
            [userId, skillSlug, envKey],
        );
        return (result.rowCount ?? 0) > 0;
    }

    async getForSkill(userId: string, skillSlug: string): Promise<SkillSecretRow[]> {
        const result = await query<SkillSecretRow>(
            'SELECT * FROM skill_secrets WHERE user_id = $1 AND skill_slug = $2 ORDER BY env_key',
            [userId, skillSlug],
        );
        return result.rows;
    }

    async deleteAllForSkill(userId: string, skillSlug: string): Promise<number> {
        const result = await query(
            'DELETE FROM skill_secrets WHERE user_id = $1 AND skill_slug = $2',
            [userId, skillSlug],
        );
        return result.rowCount ?? 0;
    }

    async getForSkills(userId: string, skillSlugs: string[]): Promise<SkillSecretRow[]> {
        if (skillSlugs.length === 0) return [];
        const result = await query<SkillSecretRow>(
            'SELECT * FROM skill_secrets WHERE user_id = $1 AND skill_slug = ANY($2::text[])',
            [userId, skillSlugs],
        );
        return result.rows;
    }

    async getAllForUser(userId: string): Promise<SkillSecretRow[]> {
        const result = await query<SkillSecretRow>(
            'SELECT * FROM skill_secrets WHERE user_id = $1',
            [userId],
        );
        return result.rows;
    }
}

export const skillSecretsRepository = new SkillSecretsRepository();
