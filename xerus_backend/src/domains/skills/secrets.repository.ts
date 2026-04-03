// Skill Secrets Repository
// Database operations for skill_secrets table (per-workspace encrypted env vars)
// Uses workspace SQLite DB via Daytona provider (migrated from Neon PostgreSQL)
// Uses skill_slug (text) as the skill identifier

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import type { SkillSecretRow } from './types';
import {
    upsertSecret,
    deleteSecret,
    getSecretsForSkill,
    deleteAllSecretsForSkill,
    getSecretsForSkills,
    getAllSecrets,
} from './secrets-workspace-db.service';

export class SkillSecretsRepository {
    async upsert(
        provider: DaytonaProvider,
        sandboxId: string,
        skillSlug: string,
        secretName: string,
        encryptedValue: string,
    ): Promise<SkillSecretRow> {
        const row = await upsertSecret(provider, sandboxId, skillSlug, secretName, encryptedValue);
        return {
            id: row.id,
            skill_slug: row.skill_slug,
            secret_name: row.secret_name,
            encrypted_value: row.encrypted_value,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }

    async delete(
        provider: DaytonaProvider,
        sandboxId: string,
        skillSlug: string,
        secretName: string,
    ): Promise<boolean> {
        return deleteSecret(provider, sandboxId, skillSlug, secretName);
    }

    async getForSkill(
        provider: DaytonaProvider,
        sandboxId: string,
        skillSlug: string,
    ): Promise<SkillSecretRow[]> {
        const rows = await getSecretsForSkill(provider, sandboxId, skillSlug);
        return rows.map(row => ({
            id: row.id,
            skill_slug: row.skill_slug,
            secret_name: row.secret_name,
            encrypted_value: row.encrypted_value,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }));
    }

    async deleteAllForSkill(
        provider: DaytonaProvider,
        sandboxId: string,
        skillSlug: string,
    ): Promise<number> {
        return deleteAllSecretsForSkill(provider, sandboxId, skillSlug);
    }

    async getForSkills(
        provider: DaytonaProvider,
        sandboxId: string,
        skillSlugs: string[],
    ): Promise<SkillSecretRow[]> {
        const rows = await getSecretsForSkills(provider, sandboxId, skillSlugs);
        return rows.map(row => ({
            id: row.id,
            skill_slug: row.skill_slug,
            secret_name: row.secret_name,
            encrypted_value: row.encrypted_value,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }));
    }

    async getAll(
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<SkillSecretRow[]> {
        const rows = await getAllSecrets(provider, sandboxId);
        return rows.map(row => ({
            id: row.id,
            skill_slug: row.skill_slug,
            secret_name: row.secret_name,
            encrypted_value: row.encrypted_value,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }));
    }
}

export const skillSecretsRepository = new SkillSecretsRepository();
