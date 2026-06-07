// Agent Marketplace Service
// Clone, publish, templates, and marketplace operations extracted from service.ts

import { AgentFilesystemRepository, AgentConfigFile } from './agent-filesystem.repository';
import { AgentValidator, agentValidator } from './validators';
import {
    Agent,
    AgentDetail,
    AgentFilters,
    AgentWithEnrichedTools,
    EnrichedTool,
    PaginatedAgents,
} from './types';
import { toolsRepository } from '../tools/repository';
import {
    AgentNotFoundError,
    AgentNotClonableError,
    AgentLimitExceededError,
    AgentDefaultError,
} from './errors';
import { generateMascotConfig } from './avatar';
import { slugify } from '../../shared/slugify';
import { configToAgent, canUserClone } from './agent-helpers';
import { buildAllSoulFiles } from '../sandbox-infra/workspace/soul-file-templates';
import { generateOperatingMd } from '../sandbox-infra/workspace/operating-md.template';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import {
    findAgentByRowid,
    findAgentBySlug,
    listAgents,
    countAgents,
    agentExists,
} from './agent-workspace-db.service';

const AGENT_LIMITS = {
    private: 100,
    public: 50,
};

// Build supplementary workspace files that marketplace agents lack
function buildSupplementaryFiles(cloneSlug: string, config: AgentConfigFile): Array<{ path: string; content: string }> {
    const soulFiles = buildAllSoulFiles({
        name: config.name,
        role: config.personality_type || '',
        domain: config.domain || '',
        personalityType: config.personality_type || '',
        description: config.description,
    });

    return [
        { path: `agents/${cloneSlug}/SOUL.md`, content: soulFiles.soul },
        { path: `agents/${cloneSlug}/STATUS.md`, content: soulFiles.status },
        { path: `agents/${cloneSlug}/USER.md`, content: soulFiles.user },
        { path: `agents/${cloneSlug}/RELATIONSHIPS.md`, content: soulFiles.relationships },
        { path: `agents/${cloneSlug}/BOOTSTRAP.md`, content: soulFiles.bootstrap },
        { path: `agents/${cloneSlug}/HEARTBEAT.md`, content: `# ${config.name} Heartbeat\n\n## Scheduled\n\nNo schedule configured.\n\n## Events\n` },
        { path: `agents/${cloneSlug}/OPERATING.md`, content: generateOperatingMd({
            agentSlug: cloneSlug,
            agentName: config.name,
            agentType: 'reactive',
            autonomyLevel: config.autonomy_level || 'supervised',
            hasHeartbeat: false,
            channelSlug: config.primary_channel || undefined,
            domainSlug: config.domain || undefined,
        }) },
        { path: `.memory/agents/${cloneSlug}/working.md`, content: `# ${config.name} Working Context\n\n` },
        { path: `.memory/agents/${cloneSlug}/expertise.md`, content: `# ${config.name} Expertise\n\n` },
    ];
}

export class AgentMarketplaceService {
    constructor(
        private validator: AgentValidator = agentValidator,
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

    async clone(
        sourceId: number,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
        options?: { name?: string },
    ): Promise<{ cloned: Agent; sourceSlug: string | null }> {
        const sourceRow = await findAgentByRowid(provider, sandboxId, sourceId);
        if (!sourceRow) throw new AgentNotFoundError(sourceId);

        const fs = this.getFs();
        const sourceConfig = await fs.getAgentConfig(userId, sourceRow.slug);
        if (!sourceConfig) throw new AgentNotFoundError(sourceId);

        const sourceAgent = configToAgent(sourceConfig, sourceRow.rowid, userId, 'private');
        if (!canUserClone(sourceAgent, userId)) {
            throw new AgentNotClonableError(sourceId);
        }

        const { cloneName, cloneSlug } = await this.prepareClone(sourceConfig.name, userId, provider, sandboxId, options?.name);

        await fs.cloneAgentDir(userId, sourceRow.slug, cloneSlug);

        const now = new Date().toISOString();
        const cloneConfig: AgentConfigFile = {
            ...sourceConfig,
            name: cloneName,
            slug: cloneSlug,
            mascot: generateMascotConfig(),
            source_agent_id: sourceId,
            is_default: false,
            is_verified: false,
            clone_count: 0,
            execution_count: 0,
            success_rate: 0,
            last_used_at: null,
            created_at: now,
            updated_at: now,
        };
        await fs.putAgentConfig(userId, cloneSlug, cloneConfig);

        // Generate soul files for the clone with correct identity (name, slug, personality)
        const supplementaryFiles = buildSupplementaryFiles(cloneSlug, cloneConfig);
        await Promise.all(
            supplementaryFiles.map(({ path, content }) => fs.writeFile(userId, path, content)),
        );

        await fs.addToIndex(userId, { slug: cloneSlug, name: cloneName, agent_type: 'private' });

        // Read back the workspace.db row to get the rowid assigned by the hook
        const cloneRow = await findAgentBySlug(provider, sandboxId, cloneSlug);
        const cloneRowid = cloneRow?.rowid ?? 0;

        const cloned = configToAgent(cloneConfig, cloneRowid, userId, 'private');
        return { cloned, sourceSlug: sourceRow.slug };
    }

    // Clone a marketplace agent by slug (marketplace agents have no DB registry entry)
    async cloneMarketplaceAgent(
        sourceSlug: string,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
        options?: { name?: string },
    ): Promise<{ cloned: Agent; sourceSlug: string }> {
        const fs = this.getFs();

        // findMarketplaceAgent returns both category and config in one scan (avoids double-read)
        const found = await fs.findMarketplaceAgent(userId, sourceSlug);
        if (!found) {
            throw new AgentNotFoundError(`marketplace agent: ${sourceSlug}`);
        }
        const { category, config: marketplaceConfig } = found;

        const { cloneName, cloneSlug } = await this.prepareClone(marketplaceConfig.name, userId, provider, sandboxId, options?.name);

        await fs.cloneFromMarketplace(userId, category, sourceSlug, cloneSlug);

        const now = new Date().toISOString();
        const cloneConfig: AgentConfigFile = {
            ...marketplaceConfig,
            name: cloneName,
            slug: cloneSlug,
            mascot: generateMascotConfig(),
            source_agent_id: null,
            is_default: false,
            is_verified: false,
            clone_count: 0,
            execution_count: 0,
            success_rate: 0,
            last_used_at: null,
            created_at: now,
            updated_at: now,
        };
        await fs.putAgentConfig(userId, cloneSlug, cloneConfig);

        // B1 fix: use cloneConfig (has clone name), not marketplaceConfig (has original name)
        const supplementaryFiles = buildSupplementaryFiles(cloneSlug, cloneConfig);
        await Promise.all(
            supplementaryFiles.map(({ path, content }) => fs.writeFile(userId, path, content)),
        );

        await fs.addToIndex(userId, { slug: cloneSlug, name: cloneName, agent_type: 'private' });

        // Read back the workspace.db row to get the rowid assigned by the hook
        const cloneRow = await findAgentBySlug(provider, sandboxId, cloneSlug);
        const cloneRowid = cloneRow?.rowid ?? 0;

        const cloned = configToAgent(cloneConfig, cloneRowid, userId, 'private');
        return { cloned, sourceSlug };
    }

    async publish(
        id: number,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<Agent> {
        const row = await findAgentByRowid(provider, sandboxId, id);
        if (!row) throw new AgentNotFoundError(id);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(id);

        const agent = configToAgent(config, row.rowid, userId, 'private');
        this.validator.validatePublishRequirements(agent);

        const updatedConfig = { ...config, updated_at: new Date().toISOString() };
        await fs.putAgentConfig(userId, row.slug, updatedConfig);
        await fs.addToIndex(userId, { slug: row.slug, name: config.name, agent_type: 'public' });

        return configToAgent(updatedConfig, row.rowid, userId, 'public');
    }

    async unpublish(
        id: number,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<Agent> {
        const row = await findAgentByRowid(provider, sandboxId, id);
        if (!row) throw new AgentNotFoundError(id);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(id);

        const updatedConfig = { ...config, updated_at: new Date().toISOString() };
        await fs.putAgentConfig(userId, row.slug, updatedConfig);
        await fs.addToIndex(userId, { slug: row.slug, name: config.name, agent_type: 'private' });

        return configToAgent(updatedConfig, row.rowid, userId, 'private');
    }

    async setDefault(
        id: number,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<Agent> {
        const row = await findAgentByRowid(provider, sandboxId, id);
        if (!row) throw new AgentNotFoundError(id);

        const fs = this.getFs();

        // Batch-load all configs to find and unset existing default
        const index = await fs.getAgentIndex(userId);
        const slugs = index.map(ie => ie.slug);
        const configs = await fs.getAgentConfigs(userId, slugs);

        const now = new Date().toISOString();
        for (const [slug, cfg] of configs) {
            if (cfg.is_default) {
                await fs.putAgentConfig(userId, slug, { ...cfg, is_default: false, updated_at: now });
            }
        }

        // Set new default (use already-loaded config if available)
        const config = configs.get(row.slug) ?? await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(id);
        const updatedConfig = { ...config, is_default: true, updated_at: now };
        await fs.putAgentConfig(userId, row.slug, updatedConfig);

        return configToAgent(updatedConfig, row.rowid, userId, 'private');
    }

    async unsetDefault(
        id: number,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<Agent> {
        const row = await findAgentByRowid(provider, sandboxId, id);
        if (!row) throw new AgentNotFoundError(id);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(id);

        if (!config.is_default) throw new AgentDefaultError('Agent is not currently default');

        const updatedConfig = { ...config, is_default: false, updated_at: new Date().toISOString() };
        await fs.putAgentConfig(userId, row.slug, updatedConfig);

        return configToAgent(updatedConfig, row.rowid, userId, 'private');
    }

    async getUserAgents(
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<AgentWithEnrichedTools[]> {
        const wsRows = await listAgents(provider, sandboxId);
        const fs = this.getFs();
        const configs = await fs.getAgentConfigs(userId, wsRows.map(r => r.slug));

        const agents: Array<{ agent: Agent; toolSlugs: string[] }> = [];
        const allToolSlugs = new Set<string>();
        for (const row of wsRows) {
            const config = configs.get(row.slug);
            if (!config) continue;
            const toolSlugs = config.tools || [];
            toolSlugs.forEach(t => allToolSlugs.add(t));
            agents.push({ agent: configToAgent(config, row.rowid, userId, 'private'), toolSlugs });
        }

        return enrichAgentsWithTools(agents, allToolSlugs);
    }

    async searchMarketplace(filters: AgentFilters, userId: string, page = 1, limit = 20): Promise<PaginatedAgents & { agents: AgentWithEnrichedTools[] }> {
        const fs = this.getFs();

        // Read marketplace agents directly from filesystem (marketplace/agents/{category}/{slug}/config.json)
        const marketplaceEntries = await fs.listMarketplaceAgents(userId);

        // Use negative IDs for marketplace agents (they have no DB registry entry)
        let syntheticId = -1;
        const matched: Array<{ agent: Agent; toolSlugs: string[] }> = [];
        const allToolSlugs = new Set<string>();
        for (const { category, config } of marketplaceEntries) {
            const agentConfig = { ...config, personality_type: config.personality_type || category };
            const agent = configToAgent(agentConfig, syntheticId--, null, 'public');

            if (filters?.is_verified !== undefined && agent.is_verified !== filters.is_verified) continue;
            if (filters?.ai_model && agent.ai_model !== filters.ai_model) continue;
            if (filters?.tags && filters.tags.length > 0) {
                const hasTag = filters.tags.some(t => agent.tags.includes(t));
                if (!hasTag) continue;
            }
            if (filters?.search) {
                const s = filters.search.toLowerCase();
                if (!agent.name.toLowerCase().includes(s) && !agent.description.toLowerCase().includes(s)) continue;
            }

            const toolSlugs = config.tools || [];
            toolSlugs.forEach(t => allToolSlugs.add(t));
            matched.push({ agent, toolSlugs });
        }

        matched.sort((a, b) => a.agent.name.localeCompare(b.agent.name));

        const total = matched.length;
        const offsetIdx = (page - 1) * limit;
        const paged = matched.slice(offsetIdx, offsetIdx + limit);

        const agents = await enrichAgentsWithTools(paged, allToolSlugs);
        return { agents, total, page, limit, total_pages: Math.ceil(total / limit) };
    }

    async getMarketplaceDetailBySlug(slug: string, userId: string): Promise<AgentDetail> {
        const fs = this.getFs();
        const found = await fs.findMarketplaceAgent(userId, slug);
        if (!found) {
            throw new AgentNotFoundError(`marketplace agent: ${slug}`);
        }

        const { category, config } = found;
        const normalizedConfig = {
            ...config,
            personality_type: config.personality_type || category,
        };
        const systemPrompt = await fs.readFile(userId, `marketplace/agents/${category}/${slug}/agent.md`);
        const syntheticId = -1;

        return {
            ...configToAgent(normalizedConfig, syntheticId, null, 'public'),
            system_prompt: systemPrompt,
            tool_count: (config.tools || []).length,
            source_agent_name: null,
            tools: config.tools || [],
        };
    }

    private async prepareClone(
        sourceName: string,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
        customName?: string,
    ): Promise<{ cloneName: string; cloneSlug: string }> {
        const currentCount = await countAgents(provider, sandboxId);
        if (currentCount >= AGENT_LIMITS.private) {
            throw new AgentLimitExceededError(AGENT_LIMITS.private, 'private');
        }

        const cloneName = customName || (await this.generateCloneName(sourceName, userId));
        const baseSlug = slugify(cloneName);
        if (!baseSlug) throw new Error(`Cannot generate slug from clone name: "${cloneName}"`);
        let cloneSlug = baseSlug;
        let counter = 0;
        while (await agentExists(provider, sandboxId, cloneSlug)) {
            counter++;
            cloneSlug = `${baseSlug}-${counter}`;
        }

        return { cloneName, cloneSlug };
    }

    private async generateCloneName(baseName: string, userId: string): Promise<string> {
        const fs = this.getFs();
        const index = await fs.getAgentIndex(userId);
        const names = new Set(index.map(ie => ie.name.toLowerCase()));

        let name = `${baseName} (Copy)`;
        let counter = 1;

        while (names.has(name.toLowerCase())) {
            counter++;
            name = `${baseName} (Copy ${counter})`;
            if (counter > 100) return `${baseName} (Copy ${Date.now()})`;
        }
        return name;
    }
}

// Batch-enrich agents with tool metadata from pipedream_apps
async function enrichAgentsWithTools(
    items: Array<{ agent: Agent; toolSlugs: string[] }>,
    allToolSlugs: Set<string>,
): Promise<AgentWithEnrichedTools[]> {
    const enrichedMap = new Map<string, EnrichedTool>();
    if (allToolSlugs.size > 0) {
        const enriched = await toolsRepository.enrichBySlugs([...allToolSlugs]);
        for (const t of enriched) enrichedMap.set(t.name_slug, t);
    }
    return items.map(({ agent, toolSlugs }) => ({
        ...agent,
        enriched_tools: toolSlugs
            .map(s => enrichedMap.get(s))
            .filter((t): t is EnrichedTool => t !== undefined),
    }));
}

export const agentMarketplaceService = new AgentMarketplaceService();
