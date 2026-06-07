// Resolve Agent Param
// Accepts route param as either numeric ID or slug string.
// Returns resolved { id, slug, userId, agentType }.
// Source of truth: workspace.db agents table (SQLite on sandbox).

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { findAgentBySlug, findAgentByRowid, AgentWorkspaceRow } from './agent-workspace-db.service';
import { AgentNotFoundError } from './errors';

export interface ResolvedAgent {
    id: number;
    slug: string;
    userId: string | null;
    agentType: string;
}

export async function resolveAgentParam(
    param: string,
    userId: string,
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<ResolvedAgent> {
    const numericId = parseInt(param, 10);
    let row: AgentWorkspaceRow | null = null;

    if (!isNaN(numericId) && String(numericId) === param) {
        // Numeric ID path (workspace.db rowid)
        row = await findAgentByRowid(provider, sandboxId, numericId);
    } else {
        // Slug path
        row = await findAgentBySlug(provider, sandboxId, param);
    }

    if (!row) {
        throw new AgentNotFoundError(param);
    }

    return {
        id: row.rowid,
        slug: row.slug,
        userId: userId,
        agentType: 'private',
    };
}
