// Resolve Agent Param
// Accepts route param as either numeric ID or slug string.
// Returns resolved { id, slug, userId, agentType }.

import { AgentRegistryRepository, agentRegistryRepository, AgentRegistryEntry } from './agent-registry.repository';
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
    registry: AgentRegistryRepository = agentRegistryRepository,
): Promise<ResolvedAgent> {
    const numericId = parseInt(param, 10);
    let entry: AgentRegistryEntry | null = null;

    if (!isNaN(numericId) && String(numericId) === param) {
        // Numeric ID path
        entry = await registry.findById(numericId);
    } else {
        // Slug path
        entry = await registry.findBySlug(param, userId);
    }

    if (!entry) {
        throw new AgentNotFoundError(param);
    }

    return {
        id: entry.id,
        slug: entry.slug,
        userId: entry.user_id,
        agentType: entry.agent_type,
    };
}
