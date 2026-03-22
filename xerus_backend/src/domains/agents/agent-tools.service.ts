// Agent Tools Service
// Tool assignment and removal operations extracted from service.ts

import { AgentRegistryRepository, agentRegistryRepository } from './agent-registry.repository';
import { AgentFilesystemRepository } from './agent-filesystem.repository';
import { Agent, EnrichedTool } from './types';
import { AgentNotFoundError, AgentAccessDeniedError, InvalidToolsError } from './errors';
import { toolsRepository } from '../tools/repository';
import { configToAgent, canUserView, canUserModify } from './agent-helpers';

export class AgentToolsService {
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

    async addTool(agentId: number, appSlug: string, userId: string): Promise<string[]> {
        const entry = await this.registry.findById(agentId);
        if (!entry) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const toolExists = await toolsRepository.appExists(appSlug);
        if (!toolExists) throw new InvalidToolsError([appSlug]);

        const tools = config.tools || [];
        if (!tools.includes(appSlug)) {
            tools.push(appSlug);
        }
        await fs.updateTools(userId, entry.slug, tools);

        return tools;
    }

    async removeTool(agentId: number, appSlug: string, userId: string): Promise<string[]> {
        const entry = await this.registry.findById(agentId);
        if (!entry) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const tools = (config.tools || []).filter(t => t !== appSlug);
        await fs.updateTools(userId, entry.slug, tools);

        return tools;
    }

    async getTools(agentId: number, userId: string): Promise<EnrichedTool[]> {
        const entry = await this.registry.findById(agentId);
        if (!entry) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserView(agent, userId)) throw new AgentAccessDeniedError(agentId);

        return toolsRepository.enrichBySlugs(config.tools || []);
    }

    async findByTool(appSlug: string, userId: string): Promise<Agent[]> {
        const fs = this.getFs();
        const index = await fs.getAgentIndex(userId);
        const entries = await this.registry.listByUser(userId);
        const entryBySlug = new Map(entries.map(e => [e.slug, e]));

        const slugs = index.map(ie => ie.slug).filter(s => entryBySlug.has(s));
        const configs = await fs.getAgentConfigs(userId, slugs);

        const result: Agent[] = [];
        for (const [slug, config] of configs) {
            const entry = entryBySlug.get(slug)!;
            if ((config.tools || []).includes(appSlug)) {
                result.push(configToAgent(config, entry.id, entry.user_id, entry.agent_type));
            }
        }
        return result;
    }

    async findByTools(appSlugs: string[], userId: string): Promise<Agent[]> {
        const fs = this.getFs();
        const index = await fs.getAgentIndex(userId);
        const entries = await this.registry.listByUser(userId);
        const entryBySlug = new Map(entries.map(e => [e.slug, e]));

        const slugs = index.map(ie => ie.slug).filter(s => entryBySlug.has(s));
        const configs = await fs.getAgentConfigs(userId, slugs);

        const result: Agent[] = [];
        for (const [slug, config] of configs) {
            const entry = entryBySlug.get(slug)!;
            if ((config.tools || []).some(t => appSlugs.includes(t))) {
                result.push(configToAgent(config, entry.id, entry.user_id, entry.agent_type));
            }
        }
        return result;
    }
}

export const agentToolsService = new AgentToolsService();
