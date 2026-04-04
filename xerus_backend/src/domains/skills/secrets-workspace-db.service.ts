// Skill Secrets Workspace DB Service
// Queries workspace.db (SQLite) on sandbox for skill_secrets table.
// Secrets are per-workspace (user-scoped), so no user_id column.
// Reference schema: xerus-workspace/data/workspace-schema.sql

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceQuery, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';

export interface WorkspaceSkillSecretRow {
    id: number;
    skill_slug: string;
    secret_name: string;
    encrypted_value: string;
    created_at: string | null;
    updated_at: string | null;
}

export async function upsertSecret(
    provider: DaytonaProvider,
    sandboxId: string,
    skillSlug: string,
    secretName: string,
    encryptedValue: string,
): Promise<WorkspaceSkillSecretRow> {
    const now = new Date().toISOString();
    const sql = `
        BEGIN;
        INSERT INTO skill_secrets (skill_slug, secret_name, encrypted_value, created_at, updated_at)
        VALUES ('${escapeSQL(skillSlug)}', '${escapeSQL(secretName)}', '${escapeSQL(encryptedValue)}', '${now}', '${now}')
        ON CONFLICT (skill_slug, secret_name) DO UPDATE SET
            encrypted_value = '${escapeSQL(encryptedValue)}',
            updated_at = '${now}';
        SELECT id, skill_slug, secret_name, encrypted_value, created_at, updated_at
        FROM skill_secrets
        WHERE skill_slug = '${escapeSQL(skillSlug)}' AND secret_name = '${escapeSQL(secretName)}';
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<WorkspaceSkillSecretRow>(provider, sandboxId, sql);
    if (!rows[0]) {
        throw new Error(`Failed to upsert secret "${secretName}" for skill "${skillSlug}"`);
    }
    return rows[0];
}

export async function deleteSecret(
    provider: DaytonaProvider,
    sandboxId: string,
    skillSlug: string,
    secretName: string,
): Promise<boolean> {
    // Check existence first since SQLite JSON mode doesn't return affected row counts
    const checkSql = `
        SELECT COUNT(*) as count FROM skill_secrets
        WHERE skill_slug = '${escapeSQL(skillSlug)}' AND secret_name = '${escapeSQL(secretName)}'
    `;
    const countRows = await executeWorkspaceJsonQuery<{ count: number }>(provider, sandboxId, checkSql);
    const existed = (countRows[0]?.count ?? 0) > 0;

    if (existed) {
        const sql = `
            DELETE FROM skill_secrets
            WHERE skill_slug = '${escapeSQL(skillSlug)}' AND secret_name = '${escapeSQL(secretName)}'
        `;
        await executeWorkspaceQuery(provider, sandboxId, sql);
    }

    return existed;
}

export async function getSecretsForSkill(
    provider: DaytonaProvider,
    sandboxId: string,
    skillSlug: string,
): Promise<WorkspaceSkillSecretRow[]> {
    const sql = `
        SELECT id, skill_slug, secret_name, encrypted_value, created_at, updated_at
        FROM skill_secrets
        WHERE skill_slug = '${escapeSQL(skillSlug)}'
        ORDER BY secret_name
    `;
    return executeWorkspaceJsonQuery<WorkspaceSkillSecretRow>(provider, sandboxId, sql);
}

export async function deleteAllSecretsForSkill(
    provider: DaytonaProvider,
    sandboxId: string,
    skillSlug: string,
): Promise<number> {
    const countSql = `
        SELECT COUNT(*) as count FROM skill_secrets
        WHERE skill_slug = '${escapeSQL(skillSlug)}'
    `;
    const countRows = await executeWorkspaceJsonQuery<{ count: number }>(provider, sandboxId, countSql);
    const count = countRows[0]?.count ?? 0;

    if (count > 0) {
        const sql = `DELETE FROM skill_secrets WHERE skill_slug = '${escapeSQL(skillSlug)}'`;
        await executeWorkspaceQuery(provider, sandboxId, sql);
    }

    return count;
}

export async function getSecretsForSkills(
    provider: DaytonaProvider,
    sandboxId: string,
    skillSlugs: string[],
): Promise<WorkspaceSkillSecretRow[]> {
    if (skillSlugs.length === 0) return [];

    const inClause = skillSlugs.map(s => `'${escapeSQL(s)}'`).join(', ');
    const sql = `
        SELECT id, skill_slug, secret_name, encrypted_value, created_at, updated_at
        FROM skill_secrets
        WHERE skill_slug IN (${inClause})
        ORDER BY skill_slug, secret_name
    `;
    return executeWorkspaceJsonQuery<WorkspaceSkillSecretRow>(provider, sandboxId, sql);
}

export async function getAllSecrets(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<WorkspaceSkillSecretRow[]> {
    const sql = `
        SELECT id, skill_slug, secret_name, encrypted_value, created_at, updated_at
        FROM skill_secrets
        ORDER BY skill_slug, secret_name
    `;
    return executeWorkspaceJsonQuery<WorkspaceSkillSecretRow>(provider, sandboxId, sql);
}
