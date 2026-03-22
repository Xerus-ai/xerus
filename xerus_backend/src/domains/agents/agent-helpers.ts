// Agent Helpers
// Shared permission checks and conversion utilities used by all agent services

import { AgentConfigFile } from './agent-filesystem.repository';
import { Agent } from './types';

export function configToAgent(
    config: AgentConfigFile,
    id: number,
    userId: string | null,
    agentTypeOverride?: string,
): Agent {
    let agentType: Agent['agent_type'] = 'private';
    if (agentTypeOverride) {
        agentType = agentTypeOverride as Agent['agent_type'];
    }
    return {
        id,
        name: config.name,
        slug: config.slug,
        description: config.description || '',
        personality_type: config.personality_type,
        avatar_url: config.mascot,
        ai_model: config.ai_model,
        user_id: userId,
        agent_type: agentType,
        thinking_level: config.thinking_level as Agent['thinking_level'],
        autonomy_level: config.autonomy_level as Agent['autonomy_level'],
        is_verified: config.is_verified || false,
        clone_count: config.clone_count || 0,
        tags: config.tags || [],
        public_metadata: config.public_metadata as Agent['public_metadata'],
        source_agent_id: config.source_agent_id,
        is_default: config.is_default || false,
        execution_count: config.execution_count || 0,
        success_rate: config.success_rate || 0,
        last_used_at: config.last_used_at ? new Date(config.last_used_at) : null,
        created_at: new Date(config.created_at),
        updated_at: new Date(config.updated_at),
    };
}

export function canUserView(agent: Agent, userId: string): boolean {
    if (agent.agent_type === 'internal') return false;
    if (agent.agent_type === 'public') return true;
    return agent.user_id === userId;
}

export function canUserModify(agent: Agent, userId: string): boolean {
    if (agent.agent_type === 'public' && agent.user_id === null) return false;
    if (agent.agent_type === 'internal') return false;
    return agent.user_id === userId;
}

export function canUserClone(agent: Agent, userId: string): boolean {
    if (agent.agent_type === 'internal') return false;
    if (agent.agent_type === 'public') return true;
    return agent.user_id === userId;
}
