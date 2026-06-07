// Agent Workspace DB Service
// Queries workspace.db (SQLite) on sandbox for agent data.
// Replaces NeonDB agent_registry as single source of truth.
// Pattern follows company-workspace-db.service.ts.

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';
export interface AgentWorkspaceRow {
    rowid: number;
    slug: string;
    name: string;
    adapter_type: string;
    role: string | null;
    autonomy_level: string;
    status: string;
    config: string | null;
    marketplace_ref: string | null;
    installed_at: string;
    updated_at: string;
}

export async function findAgentBySlug(
    provider: DaytonaProvider,
    sandboxId: string,
    slug: string,
): Promise<AgentWorkspaceRow | null> {
    const escaped = escapeSQL(slug);
    const rows = await executeWorkspaceJsonQuery<AgentWorkspaceRow>(
        provider, sandboxId,
        `SELECT rowid, * FROM agents WHERE slug = '${escaped}' LIMIT 1;`,
    );
    return rows[0] || null;
}

export async function findAgentByRowid(
    provider: DaytonaProvider,
    sandboxId: string,
    rowid: number,
): Promise<AgentWorkspaceRow | null> {
    const rows = await executeWorkspaceJsonQuery<AgentWorkspaceRow>(
        provider, sandboxId,
        `SELECT rowid, * FROM agents WHERE rowid = ${Number(rowid)} LIMIT 1;`,
    );
    return rows[0] || null;
}

export async function listAgents(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<AgentWorkspaceRow[]> {
    return executeWorkspaceJsonQuery<AgentWorkspaceRow>(
        provider, sandboxId,
        `SELECT rowid, * FROM agents ORDER BY installed_at DESC;`,
    );
}

export async function countAgents(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<number> {
    const rows = await executeWorkspaceJsonQuery<{ cnt: number }>(
        provider, sandboxId,
        `SELECT COUNT(*) as cnt FROM agents;`,
    );
    return rows[0]?.cnt ?? 0;
}

export async function agentExists(
    provider: DaytonaProvider,
    sandboxId: string,
    slug: string,
): Promise<boolean> {
    const escaped = escapeSQL(slug);
    const rows = await executeWorkspaceJsonQuery<{ cnt: number }>(
        provider, sandboxId,
        `SELECT COUNT(*) as cnt FROM agents WHERE slug = '${escaped}';`,
    );
    return (rows[0]?.cnt ?? 0) > 0;
}

export async function deleteAgentFromWorkspaceDb(
    provider: DaytonaProvider,
    sandboxId: string,
    slug: string,
): Promise<void> {
    const escaped = escapeSQL(slug);
    await executeWorkspaceJsonQuery(
        provider, sandboxId,
        `DELETE FROM agents WHERE slug = '${escaped}';`,
    );
}
