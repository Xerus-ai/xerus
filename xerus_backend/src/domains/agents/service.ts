// Agent Domain Service
// Business logic for agent CRUD operations.
// Source of truth: filesystem (config.json) + agent_registry (ID/slug mapping).
//
// Tool operations: agent-tools.service.ts
// KB operations: agent-kb.service.ts
// Marketplace operations: agent-marketplace.service.ts

import { AgentRegistryRepository, agentRegistryRepository } from './agent-registry.repository';
import { AgentFilesystemRepository, AgentConfigFile } from './agent-filesystem.repository';
import { AgentValidator, agentValidator } from './validators';
import {
    Agent,
    AgentDetail,
    CreateAgentDTO,
    UpdateAgentDTO,
    AgentListOptions,
    PaginatedAgents,
    PaginatedAgentsWithTools,
    AgentWithEnrichedTools,
    AgentKnowledgeBase,
    EnrichedTool,
    DEFAULT_MODEL,
} from './types';
import {
    AgentNotFoundError,
    AgentAccessDeniedError,
    AgentNameConflictError,
    AgentLimitExceededError,
} from './errors';
import { toolsRepository } from '../tools/repository';
import { generateMascotConfig } from './avatar';
import { slugify } from '../../shared/slugify';
import { configToAgent, canUserView, canUserModify } from './agent-helpers';

// Re-export extracted services for convenience
export { agentToolsService, AgentToolsService } from './agent-tools.service';
export { agentKBService, AgentKBService } from './agent-kb.service';
export { agentMarketplaceService, AgentMarketplaceService } from './agent-marketplace.service';

// Agent limits
const AGENT_LIMITS = {
    private: 100,
    public: 50,
};

export class AgentService {
    constructor(
        private registry: AgentRegistryRepository = agentRegistryRepository,
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

    // ===== CRUD OPERATIONS =====

    async create(data: CreateAgentDTO, userId: string): Promise<Agent> {
        const validatedData = this.validator.validateCreate(data);
        await this.validator.validateModel(validatedData.ai_model || DEFAULT_MODEL);

        // Check agent limit
        const currentCount = await this.registry.countByUser(userId, 'private');
        if (currentCount >= AGENT_LIMITS.private) {
            throw new AgentLimitExceededError(AGENT_LIMITS.private, 'private');
        }

        // Check name uniqueness by scanning filesystem index
        const fs = this.getFs();
        const nameConflict = await this.findNameConflictInFs(validatedData.name, userId, 'private');
        if (nameConflict) {
            throw new AgentNameConflictError(validatedData.name);
        }

        // Generate slug
        const baseSlug = validatedData.slug || slugify(validatedData.name);
        if (!baseSlug) {
            throw new Error(`Cannot generate slug from agent name: "${validatedData.name}"`);
        }
        // Ensure slug uniqueness against registry
        let slug = baseSlug;
        let counter = 0;
        while (await this.registry.findBySlug(slug, userId)) {
            counter++;
            slug = `${baseSlug}-${counter}`;
        }

        // Register in agent_registry
        const entry = await this.registry.register(slug, userId, 'private');

        // Build config.json
        const now = new Date().toISOString();
        const mascot = generateMascotConfig();
        const config: AgentConfigFile = {
            name: validatedData.name,
            slug,
            description: validatedData.description || '',
            personality_type: validatedData.personality_type || null,
            mascot,
            ai_model: validatedData.ai_model || DEFAULT_MODEL,
            thinking_level: validatedData.thinking_level || 'medium',
            autonomy_level: validatedData.autonomy_level || 'supervised',
            is_verified: false,
            clone_count: 0,
            tags: validatedData.tags || [],
            public_metadata: validatedData.public_metadata || null,
            source_agent_id: null,
            is_default: false,
            execution_count: 0,
            success_rate: 0,
            last_used_at: null,
            tools: [],
            knowledge_bases: [],
            domain: '',
            primary_channel: '',
            channels: [],
            created_at: now,
            updated_at: now,
        };

        // Write config.json to sandbox
        await fs.putAgentConfig(userId, slug, config);
        if (validatedData.system_prompt !== undefined) {
            await fs.writeFile(userId, `agents/${slug}/agent.md`, validatedData.system_prompt);
        }

        // Update index.json
        await fs.addToIndex(userId, { slug, name: config.name, agent_type: 'private' });

        return {
            ...configToAgent(config, entry.id, userId, entry.agent_type),
            system_prompt: validatedData.system_prompt || '',
        };
    }

    async getById(id: number, userId: string): Promise<AgentDetail> {
        const entry = await this.registry.findById(id);
        if (!entry) throw new AgentNotFoundError(id);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(id);

        const agentPrompt = await fs.readFile(userId, `agents/${entry.slug}/agent.md`);
        const agent = {
            ...configToAgent(config, entry.id, entry.user_id, entry.agent_type),
            system_prompt: agentPrompt,
        };

        if (!canUserView(agent, userId)) {
            throw new AgentAccessDeniedError(id);
        }

        // Build KB details
        const kbs: AgentKnowledgeBase[] = (config.knowledge_bases || []).map((kb, idx) => ({
            id: idx + 1,
            agent_id: id,
            knowledge_base_id: kb.knowledge_base_id,
            kb_name: kb.kb_name,
            access_mode: kb.access_mode,
            created_at: new Date(config.created_at),
        }));

        return {
            ...agent,
            tool_count: (config.tools || []).length,
            kb_count: (config.knowledge_bases || []).length,
            source_agent_name: null,
            tools: config.tools || [],
            knowledge_bases: kbs,
        };
    }

    async list(userId: string, options: AgentListOptions = {}): Promise<PaginatedAgents> {
        const validatedOptions = this.validator.validateListOptions(options);
        const { filters, sort_by = 'created_at', sort_order = 'desc', page = 1, limit = 20 } = validatedOptions;

        const fs = this.getFs();
        const index = await fs.getAgentIndex(userId);

        // Get user's registry entries for ID mapping
        const userEntries = await this.registry.listByUser(userId);
        const entryBySlug = new Map(userEntries.map(e => [e.slug, e]));

        // Batch-read all config.json files for agents in index
        const indexSlugs = index
            .filter(entry => entryBySlug.has(entry.slug))
            .map(entry => entry.slug);
        const configs = await fs.getAgentConfigs(userId, indexSlugs);

        const agents: Agent[] = [];
        for (const entry of index) {
            const registryEntry = entryBySlug.get(entry.slug);
            if (!registryEntry) continue;

            const config = configs.get(entry.slug);
            if (!config) continue;

            const agent = configToAgent(config, registryEntry.id, registryEntry.user_id, registryEntry.agent_type);
            if (!canUserView(agent, userId)) continue;

            // Apply filters
            if (filters?.agent_type && agent.agent_type !== filters.agent_type) continue;
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

            agents.push(agent);
        }

        // Sort
        agents.sort((a, b) => {
            // Private agents first
            const typeOrder = (t: string) => t === 'private' ? 0 : t === 'public' ? 1 : 2;
            const typeDiff = typeOrder(a.agent_type) - typeOrder(b.agent_type);
            if (typeDiff !== 0) return typeDiff;

            const aVal = a[sort_by as keyof Agent];
            const bVal = b[sort_by as keyof Agent];
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return sort_order === 'asc' ? cmp : -cmp;
        });

        // Paginate
        const total = agents.length;
        const offset = (page - 1) * limit;
        const paged = agents.slice(offset, offset + limit);

        return {
            agents: paged,
            total,
            page,
            limit,
            total_pages: Math.ceil(total / limit),
        };
    }

    async listWithEnrichedTools(userId: string, options: AgentListOptions = {}): Promise<PaginatedAgentsWithTools> {
        const result = await this.list(userId, options);

        // Batch fetch enriched tools
        const allToolSlugs = new Set<string>();
        const toolsByAgent = new Map<number, string[]>();

        const fs = this.getFs();
        const agentSlugs = result.agents
            .map(a => a.slug)
            .filter((s): s is string => !!s);
        const configs = await fs.getAgentConfigs(userId, agentSlugs);

        for (const agent of result.agents) {
            if (!agent.slug) continue;
            const config = configs.get(agent.slug);
            const tools = config?.tools || [];
            toolsByAgent.set(agent.id, tools);
            tools.forEach(t => allToolSlugs.add(t));
        }

        const enrichedAll = await toolsRepository.enrichBySlugs([...allToolSlugs]);
        const enrichedMap = new Map(enrichedAll.map(t => [t.name_slug, t]));

        const agentsWithTools: AgentWithEnrichedTools[] = result.agents.map(agent => {
            const slugs = toolsByAgent.get(agent.id) || [];
            const enriched_tools: EnrichedTool[] = slugs
                .map(s => enrichedMap.get(s))
                .filter((t): t is EnrichedTool => t !== undefined);
            return { ...agent, enriched_tools };
        });

        return {
            agents: agentsWithTools,
            total: result.total,
            page: result.page,
            limit: result.limit,
            total_pages: result.total_pages,
        };
    }

    async update(id: number, data: UpdateAgentDTO, userId: string): Promise<Agent> {
        const entry = await this.registry.findById(id);
        if (!entry) throw new AgentNotFoundError(id);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(id);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserModify(agent, userId)) {
            throw new AgentAccessDeniedError(id);
        }

        const validatedData = this.validator.validateUpdate(data);

        if (validatedData.ai_model) {
            await this.validator.validateModel(validatedData.ai_model);
        }

        // Check name uniqueness if changed
        if (validatedData.name && validatedData.name !== config.name) {
            const conflict = await this.findNameConflictInFs(validatedData.name, userId, agent.agent_type, id);
            if (conflict) {
                throw new AgentNameConflictError(validatedData.name);
            }
        }

        // Merge updates into config
        if (validatedData.name !== undefined) config.name = validatedData.name;
        if (validatedData.description !== undefined) config.description = validatedData.description;
        if (validatedData.personality_type !== undefined) config.personality_type = validatedData.personality_type || null;
        if (validatedData.avatar_url !== undefined) config.mascot = validatedData.avatar_url || null;
        if (validatedData.ai_model !== undefined) config.ai_model = validatedData.ai_model;
        if (validatedData.tags !== undefined) config.tags = validatedData.tags;
        if (validatedData.public_metadata !== undefined) config.public_metadata = validatedData.public_metadata || null;
        if (validatedData.is_default !== undefined) config.is_default = validatedData.is_default;
        if (validatedData.thinking_level !== undefined) config.thinking_level = validatedData.thinking_level;
        if (validatedData.autonomy_level !== undefined) config.autonomy_level = validatedData.autonomy_level;
        if (validatedData.agent_type !== undefined) {
            await this.registry.updateType(id, validatedData.agent_type);
        }
        config.updated_at = new Date().toISOString();

        await fs.putAgentConfig(userId, entry.slug, config);
        if (validatedData.system_prompt !== undefined) {
            await fs.writeFile(userId, `agents/${entry.slug}/agent.md`, validatedData.system_prompt);
        }

        // Update index if name or agent_type changed
        const effectiveType = validatedData.agent_type ?? entry.agent_type;
        if (validatedData.name !== undefined || validatedData.agent_type !== undefined) {
            await fs.addToIndex(userId, {
                slug: entry.slug,
                name: config.name,
                agent_type: effectiveType,
            });
        }

        return {
            ...configToAgent(config, entry.id, entry.user_id, entry.agent_type),
            system_prompt: validatedData.system_prompt !== undefined
                ? validatedData.system_prompt
                : await fs.readFile(userId, `agents/${entry.slug}/agent.md`),
        };
    }

    async delete(id: number, userId: string): Promise<Agent> {
        const entry = await this.registry.findById(id);
        if (!entry) throw new AgentNotFoundError(id);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(id);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserModify(agent, userId)) {
            throw new AgentAccessDeniedError(id);
        }

        await this.registry.delete(id);
        await fs.removeFromIndex(userId, entry.slug);

        return agent;
    }

    // ===== HELPERS =====

    private async findNameConflictInFs(
        name: string, userId: string, agentType?: string, excludeId?: number,
    ): Promise<boolean> {
        const fs = this.getFs();
        const index = await fs.getAgentIndex(userId);
        const entries = await this.registry.listByUser(userId);
        const entryBySlug = new Map(entries.map(e => [e.slug, e]));

        for (const ie of index) {
            if (ie.name.toLowerCase() === name.toLowerCase()) {
                const entry = entryBySlug.get(ie.slug);
                if (entry && excludeId && entry.id === excludeId) continue;
                if (agentType && entry && entry.agent_type !== agentType) continue;
                return true;
            }
        }
        return false;
    }
}

// Singleton export
export const agentService = new AgentService();
