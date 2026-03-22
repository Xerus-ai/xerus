// Agent Knowledge Base Service
// KB assignment and management operations extracted from service.ts

import { AgentRegistryRepository, agentRegistryRepository } from './agent-registry.repository';
import { AgentFilesystemRepository } from './agent-filesystem.repository';
import { AgentKnowledgeBase } from './types';
import { AgentNotFoundError, AgentAccessDeniedError } from './errors';
import { configToAgent, canUserView, canUserModify } from './agent-helpers';

export class AgentKBService {
    constructor(
        private registry: AgentRegistryRepository = agentRegistryRepository,
        private fsRepo: AgentFilesystemRepository | null = null,
    ) {}

    setFilesystemRepo(repo: AgentFilesystemRepository): void {
        this.fsRepo = repo;
    }

    private getFs(): AgentFilesystemRepository {
        if (!this.fsRepo) {
            throw new Error('AgentFilesystemRepository not initialized. Call setFilesystemRepo() at startup.');
        }
        return this.fsRepo;
    }

    async addKnowledgeBase(
        agentId: number,
        kbId: string,
        kbName: string | undefined,
        accessMode: 'read' | 'write' | 'admin',
        userId: string
    ): Promise<AgentKnowledgeBase> {
        const entry = await this.registry.findById(agentId);
        if (!entry) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const kbs = config.knowledge_bases || [];
        const existing = kbs.findIndex(k => k.knowledge_base_id === kbId);
        const kbEntry = { knowledge_base_id: kbId, kb_name: kbName || null, access_mode: accessMode };
        if (existing >= 0) {
            kbs[existing] = kbEntry;
        } else {
            kbs.push(kbEntry);
        }
        await fs.updateKBs(userId, entry.slug, kbs);

        return {
            id: existing >= 0 ? existing + 1 : kbs.length,
            agent_id: agentId,
            knowledge_base_id: kbId,
            kb_name: kbName || null,
            access_mode: accessMode,
            created_at: new Date(),
        };
    }

    async removeKnowledgeBase(agentId: number, kbId: string, userId: string): Promise<void> {
        const entry = await this.registry.findById(agentId);
        if (!entry) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const kbs = (config.knowledge_bases || []).filter(k => k.knowledge_base_id !== kbId);
        await fs.updateKBs(userId, entry.slug, kbs);
    }

    async getKnowledgeBases(agentId: number, userId: string): Promise<AgentKnowledgeBase[]> {
        const entry = await this.registry.findById(agentId);
        if (!entry) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserView(agent, userId)) throw new AgentAccessDeniedError(agentId);

        return (config.knowledge_bases || []).map((kb, idx) => ({
            id: idx + 1,
            agent_id: agentId,
            knowledge_base_id: kb.knowledge_base_id,
            kb_name: kb.kb_name,
            access_mode: kb.access_mode,
            created_at: new Date(config.created_at),
        }));
    }
}

export const agentKBService = new AgentKBService();
