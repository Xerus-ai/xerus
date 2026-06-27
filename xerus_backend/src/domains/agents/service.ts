// Agent Domain Service
// Business logic for agent CRUD operations.
// Source of truth: filesystem (config.json) + workspace.db agents table.
//
// Tool operations: agent-tools.service.ts
// Marketplace operations: agent-marketplace.service.ts
// Knowledge base assignment: workspace.connections (file_connections table).

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
import { buildAllSoulFiles } from '../sandbox-infra/workspace/soul-file-templates';
import { generateOperatingMd } from '../sandbox-infra/workspace/operating-md.template';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import {
    findAgentBySlug,
    findAgentByRowid,
    listAgents,
    countAgents,
    agentExists,
    deleteAgentFromWorkspaceDb,
} from './agent-workspace-db.service';

// Re-export extracted services for convenience
export { agentToolsService, AgentToolsService } from './agent-tools.service';
export { agentMarketplaceService, AgentMarketplaceService } from './agent-marketplace.service';

// Agent limits
const AGENT_LIMITS = {
    private: 100,
    public: 50,
};

export class AgentService {
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

    // ===== CRUD OPERATIONS =====

    async create(
        data: CreateAgentDTO,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<Agent> {
        const validatedData = this.validator.validateCreate(data);
        await this.validator.validateModel(validatedData.ai_model || DEFAULT_MODEL);

        // Check agent limit via workspace.db
        const currentCount = await countAgents(provider, sandboxId);
        if (currentCount >= AGENT_LIMITS.private) {
            throw new AgentLimitExceededError(AGENT_LIMITS.private, 'private');
        }

        // Check name uniqueness by scanning filesystem index
        const fs = this.getFs();
        const conflictSlug = await this.findNameConflictInFs(validatedData.name, userId, 'private');
        if (conflictSlug) {
            throw new AgentNameConflictError(validatedData.name, conflictSlug);
        }

        // Generate slug
        const baseSlug = validatedData.slug || slugify(validatedData.name);
        if (!baseSlug) {
            throw new Error(`Cannot generate slug from agent name: "${validatedData.name}"`);
        }
        // Ensure slug uniqueness against workspace.db
        let slug = baseSlug;
        let counter = 0;
        while (await agentExists(provider, sandboxId, slug)) {
            counter++;
            slug = `${baseSlug}-${counter}`;
        }

        // Build config.json — writing it triggers scaffold-sync-hook.sh which INSERTs into workspace.db
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
            adapter_type: validatedData.adapter_type || 'claudecode',
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

        // Generate soul files (identity, status, relationships, operating protocol)
        const soulFiles = buildAllSoulFiles({
            name: config.name,
            role: config.personality_type || '',
            domain: config.domain || '',
            personalityType: config.personality_type || '',
            description: config.description,
        });
        const operatingMd = generateOperatingMd({
            agentSlug: slug,
            agentName: config.name,
            agentType: 'reactive',
            autonomyLevel: config.autonomy_level || 'supervised',
            hasHeartbeat: false,
        });
        await Promise.all([
            fs.writeFile(userId, `agents/${slug}/SOUL.md`, soulFiles.soul),
            fs.writeFile(userId, `agents/${slug}/STATUS.md`, soulFiles.status),
            fs.writeFile(userId, `agents/${slug}/USER.md`, soulFiles.user),
            fs.writeFile(userId, `agents/${slug}/RELATIONSHIPS.md`, soulFiles.relationships),
            fs.writeFile(userId, `agents/${slug}/BOOTSTRAP.md`, soulFiles.bootstrap),
            fs.writeFile(userId, `agents/${slug}/OPERATING.md`, operatingMd),
            fs.writeFile(userId, `agents/${slug}/HEARTBEAT.md`, `# ${config.name} Heartbeat\n\n## Scheduled\n\nNo schedule configured.\n\n## Events\n`),
            fs.writeFile(userId, `.memory/agents/${slug}/working.md`, `# ${config.name} Working Context\n\n`),
            fs.writeFile(userId, `.memory/agents/${slug}/expertise.md`, `# ${config.name} Expertise\n\n`),
        ]);

        // Update index.json
        await fs.addToIndex(userId, { slug, name: config.name, agent_type: 'private' });

        // Read back the workspace.db row to get the rowid assigned by the hook
        const row = await findAgentBySlug(provider, sandboxId, slug);
        const rowid = row?.rowid ?? 0;

        return {
            ...configToAgent(config, rowid, userId, 'private'),
            system_prompt: validatedData.system_prompt || '',
        };
    }

    async getById(
        id: number,
        userId: string,
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<AgentDetail> {
        const row = await findAgentByRowid(provider, sandboxId, id);
        if (!row) throw new AgentNotFoundError(id);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(id);

        const agentPrompt = await fs.readFile(userId, `agents/${row.slug}/agent.md`);
        const agent = {
            ...configToAgent(config, row.rowid, userId, 'private'),
            system_prompt: agentPrompt,
        };

        if (!canUserView(agent, userId)) {
            throw new AgentAccessDeniedError(id);
        }

        return {
            ...agent,
            tool_count: (config.tools || []).length,
            source_agent_name: null,
            tools: config.tools || [],
        };
    }

    async list(
        userId: string,
        options: AgentListOptions = {},
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<PaginatedAgents> {
        const validatedOptions = this.validator.validateListOptions(options);
        const { filters, sort_by = 'created_at', sort_order = 'desc', page = 1, limit = 20 } = validatedOptions;

        const fs = this.getFs();

        // workspace.db is the source of truth for which agents exist
        const wsRows = await listAgents(provider, sandboxId);
        const allSlugs = wsRows.map(r => r.slug);
        const configs = await fs.getAgentConfigs(userId, allSlugs);

        const agents: Agent[] = [];
        for (const wsRow of wsRows) {
            const config = configs.get(wsRow.slug);
            if (!config) continue;

            const agent = configToAgent(config, wsRow.rowid, userId, 'private');
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

    async listWithEnrichedTools(
        userId: string,
        options: AgentListOptions = {},
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<PaginatedAgentsWithTools> {
        const result = await this.list(userId, options, provider, sandboxId);

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

    async update(
        id: number,
        data: UpdateAgentDTO,
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
        if (!canUserModify(agent, userId)) {
            throw new AgentAccessDeniedError(id);
        }

        const validatedData = this.validator.validateUpdate(data);

        if (validatedData.ai_model) {
            await this.validator.validateModel(validatedData.ai_model);
        }

        // Check name uniqueness if changed
        if (validatedData.name && validatedData.name !== config.name) {
            const conflictSlug = await this.findNameConflictInFs(validatedData.name, userId, agent.agent_type, row.slug);
            if (conflictSlug) {
                throw new AgentNameConflictError(validatedData.name, conflictSlug);
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
        if (validatedData.adapter_type !== undefined) config.adapter_type = validatedData.adapter_type;
        config.updated_at = new Date().toISOString();

        await fs.putAgentConfig(userId, row.slug, config);
        if (validatedData.system_prompt !== undefined) {
            await fs.writeFile(userId, `agents/${row.slug}/agent.md`, validatedData.system_prompt);
        }

        // Update index if name or agent_type changed
        const effectiveType = validatedData.agent_type ?? 'private';
        if (validatedData.name !== undefined || validatedData.agent_type !== undefined) {
            await fs.addToIndex(userId, {
                slug: row.slug,
                name: config.name,
                agent_type: effectiveType,
            });
        }

        return {
            ...configToAgent(config, row.rowid, userId, 'private'),
            system_prompt: validatedData.system_prompt !== undefined
                ? validatedData.system_prompt
                : await fs.readFile(userId, `agents/${row.slug}/agent.md`),
        };
    }

    async delete(
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
        if (!canUserModify(agent, userId)) {
            throw new AgentAccessDeniedError(id);
        }

        await deleteAgentFromWorkspaceDb(provider, sandboxId, row.slug);
        await fs.removeFromIndex(userId, row.slug);

        return agent;
    }

    // ===== HELPERS =====

    private async findNameConflictInFs(
        name: string, userId: string, _agentType?: string, excludeSlug?: string,
    ): Promise<string | null> {
        const fs = this.getFs();
        const index = await fs.getAgentIndex(userId);

        for (const ie of index) {
            if (ie.name.toLowerCase() === name.toLowerCase()) {
                if (excludeSlug && ie.slug === excludeSlug) continue;
                return ie.slug;
            }
        }
        return null;
    }
}

// Singleton export
export const agentService = new AgentService();
