// Agent Tools Service
// Tool assignment and removal operations extracted from service.ts

import { AgentFilesystemRepository } from './agent-filesystem.repository';
import { Agent, EnrichedTool } from './types';
import { AgentNotFoundError, AgentAccessDeniedError, InvalidToolsError } from './errors';
import { toolsRepository } from '../tools/repository';
import { configToAgent, canUserView, canUserModify } from './agent-helpers';
import { syncPipedreamMcpConfigViaRepo } from '../sandbox-infra/workspace/mcp-config.service';
import { query as dbQuery } from '../../database/connection';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { findAgentByRowid, listAgents } from './agent-workspace-db.service';

export class AgentToolsService {
    constructor(
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

    async addTool(
        agentId: number,
        appSlug: string,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<string[]> {
        const row = await findAgentByRowid(provider, sandboxId, agentId);
        if (!row) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, row.rowid, userId, 'private');
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const toolExists = await toolsRepository.appExists(appSlug);
        if (!toolExists) throw new InvalidToolsError([appSlug]);

        const tools = config.tools || [];
        if (!tools.includes(appSlug)) {
            tools.push(appSlug);
        }
        await fs.updateTools(userId, row.slug, tools);

        // Sync .mcp.json so the new tool's Pipedream MCP server is available to CLI agents
        await this.syncMcpConfig(userId);

        return tools;
    }

    async removeTool(
        agentId: number,
        appSlug: string,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<string[]> {
        const row = await findAgentByRowid(provider, sandboxId, agentId);
        if (!row) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, row.rowid, userId, 'private');
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const tools = (config.tools || []).filter(t => t !== appSlug);
        await fs.updateTools(userId, row.slug, tools);

        // Sync .mcp.json to reflect removed tool
        await this.syncMcpConfig(userId);

        return tools;
    }

    async getTools(
        agentId: number,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<EnrichedTool[]> {
        const row = await findAgentByRowid(provider, sandboxId, agentId);
        if (!row) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, row.rowid, userId, 'private');
        if (!canUserView(agent, userId)) throw new AgentAccessDeniedError(agentId);

        return toolsRepository.enrichBySlugs(config.tools || []);
    }

    async findByTool(
        appSlug: string,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<Agent[]> {
        const fs = this.getFs();
        const index = await fs.getAgentIndex(userId);
        const wsRows = await listAgents(provider, sandboxId);
        const rowBySlug = new Map(wsRows.map(r => [r.slug, r]));

        const slugs = index.map(ie => ie.slug).filter(s => rowBySlug.has(s));
        const configs = await fs.getAgentConfigs(userId, slugs);

        const result: Agent[] = [];
        for (const [slug, config] of configs) {
            const row = rowBySlug.get(slug)!;
            if ((config.tools || []).includes(appSlug)) {
                result.push(configToAgent(config, row.rowid, userId, 'private'));
            }
        }
        return result;
    }

    /**
     * Sync .mcp.json on the sandbox with Pipedream MCP servers for the user's connected accounts.
     * Only suppresses sandbox-not-found errors (agent created before first execution).
     * All other errors propagate — fail-fast per project rules.
     */
    private async syncMcpConfig(userId: string): Promise<void> {
        const fs = this.getFs();
        try {
            await syncPipedreamMcpConfigViaRepo(
                (uid, path) => fs.readFile(uid, path),
                (uid, path, content) => fs.writeFile(uid, path, content),
                userId,
                { query: dbQuery },
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message.toLowerCase() : '';
            const isSandboxMissing = msg.includes('not found') || msg.includes('enoent') || msg.includes('no sandbox');
            if (isSandboxMissing) {
                // Expected: agent tool assigned before user's first execution (no sandbox yet)
                return;
            }
            throw err;
        }
    }

    async findByTools(
        appSlugs: string[],
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<Agent[]> {
        const fs = this.getFs();
        const index = await fs.getAgentIndex(userId);
        const wsRows = await listAgents(provider, sandboxId);
        const rowBySlug = new Map(wsRows.map(r => [r.slug, r]));

        const slugs = index.map(ie => ie.slug).filter(s => rowBySlug.has(s));
        const configs = await fs.getAgentConfigs(userId, slugs);

        const result: Agent[] = [];
        for (const [slug, config] of configs) {
            const row = rowBySlug.get(slug)!;
            if ((config.tools || []).some(t => appSlugs.includes(t))) {
                result.push(configToAgent(config, row.rowid, userId, 'private'));
            }
        }
        return result;
    }
}

export const agentToolsService = new AgentToolsService();
