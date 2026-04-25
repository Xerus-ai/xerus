// Agent Filesystem Repository
// Reads/writes agent data from sandbox filesystem via DriveService.
// Filesystem is the source of truth for agent configuration.

import { DriveService } from '../drive/drive.service';
import type { PublicMetadata } from './types';
import { generateMascotConfig } from './avatar';

// Daytona SDK throws generic errors for missing files — match by message
function isFileNotFoundError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return msg.includes('not found') || msg.includes('enoent') || msg.includes('no such file');
}

// Config.json schema — all agent data lives here
export interface AgentConfigFile {
    // Identity
    name: string;
    slug: string;
    description: string;
    personality_type: string | null;
    mascot: string | null;
    // Model + Behavior
    ai_model: string;
    thinking_level: string;
    autonomy_level: string;
    adapter_type?: 'claudecode' | 'codex'; // CLI adapter (default: claudecode)
    // Marketplace
    is_verified: boolean;
    clone_count: number;
    tags: string[];
    public_metadata: PublicMetadata | null;
    source_agent_id: number | null;
    // Status
    is_default: boolean;
    execution_count: number;
    success_rate: number;
    last_used_at: string | null;
    // Sub-resources (replaces junction tables)
    tools: string[];
    // Channel assignment (replaces dropped channel_members table)
    domain: string;
    primary_channel: string;
    channels: string[];
    // Timestamps
    created_at: string;
    updated_at: string;
}

// Agent index.json entry
export interface AgentIndexEntry {
    slug: string;
    name: string;
    agent_type: string;
    category?: string;
}

interface AgentIndexRecord {
    name: string;
    role?: string;
    description?: string;
    is_master?: boolean;
    domain?: string;
    primary_channel?: string;
    channels?: string[];
    model?: string;
    agent_type?: string;
    category?: string;
}

interface AgentIndexDocument {
    agents: Record<string, AgentIndexRecord>;
    updated_at: string;
}

// Normalize raw config JSON to AgentConfigFile shape.
// Handles field name mismatches between marketplace/template configs and canonical schema:
//   - "model" -> "ai_model"
//   - missing "mascot" -> generate one
// Returns { config, dirty } so callers can persist back if needed.
function normalizeConfig(raw: Record<string, unknown>): { config: AgentConfigFile; dirty: boolean } {
    let dirty = false;
    if (!raw.ai_model && raw.model) {
        raw.ai_model = raw.model;
        dirty = true;
    }
    if (!raw.mascot) {
        raw.mascot = generateMascotConfig();
        dirty = true;
    }
    return { config: raw as unknown as AgentConfigFile, dirty };
}

export class AgentFilesystemRepository {
    constructor(private readonly driveService: DriveService) {}

    async getAgentConfig(userId: string, slug: string): Promise<AgentConfigFile | null> {
        let raw: string;
        try {
            const result = await this.driveService.readFile(userId, `agents/${slug}/config.json`);
            raw = result.content;
        } catch (err) {
            if (isFileNotFoundError(err)) return null;
            throw err;
        }
        const { config, dirty } = normalizeConfig(JSON.parse(raw));
        if (dirty) {
            // Persist normalized fields so they stay stable across reads
            this.putAgentConfig(userId, slug, config).catch(() => {});
        }
        return config;
    }

    async getAgentConfigs(userId: string, slugs: string[]): Promise<Map<string, AgentConfigFile>> {
        const results = await Promise.all(
            slugs.map(async (slug) => {
                const config = await this.getAgentConfig(userId, slug);
                return [slug, config] as const;
            })
        );
        const map = new Map<string, AgentConfigFile>();
        for (const [slug, config] of results) {
            if (config) map.set(slug, config);
        }
        return map;
    }

    async putAgentConfig(userId: string, slug: string, config: AgentConfigFile): Promise<void> {
        const content = JSON.stringify(config, null, 2);
        await this.driveService.writeFile(userId, `agents/${slug}/config.json`, content);
    }

    async getAgentIndex(userId: string): Promise<AgentIndexEntry[]> {
        const index = await this.readAgentIndexDocument(userId);
        return Object.entries(index.agents).map(([slug, entry]) => ({
            slug,
            name: entry.name,
            agent_type: entry.agent_type || 'private',
            ...(entry.category ? { category: entry.category } : {}),
        }));
    }

    async putAgentIndex(userId: string, index: AgentIndexEntry[]): Promise<void> {
        const existing = await this.readAgentIndexDocument(userId);
        const agents: Record<string, AgentIndexRecord> = {};

        for (const entry of index) {
            const current = existing.agents[entry.slug] || { name: entry.name };
            agents[entry.slug] = {
                ...current,
                name: entry.name,
                ...(entry.agent_type ? { agent_type: entry.agent_type } : {}),
                ...(entry.category ? { category: entry.category } : {}),
            };
        }

        await this.writeAgentIndexDocument(userId, {
            agents,
            updated_at: new Date().toISOString(),
        });
    }

    async addToIndex(userId: string, entry: AgentIndexEntry): Promise<void> {
        const index = await this.readAgentIndexDocument(userId);
        const current = index.agents[entry.slug] || { name: entry.name };

        index.agents[entry.slug] = {
            ...current,
            name: entry.name,
            ...(entry.agent_type ? { agent_type: entry.agent_type } : {}),
            ...(entry.category ? { category: entry.category } : {}),
        };
        index.updated_at = new Date().toISOString();

        await this.writeAgentIndexDocument(userId, index);
    }

    async removeFromIndex(userId: string, slug: string): Promise<void> {
        const index = await this.readAgentIndexDocument(userId);
        delete index.agents[slug];
        index.updated_at = new Date().toISOString();
        await this.writeAgentIndexDocument(userId, index);
    }

    async deleteAgentDir(userId: string, slug: string): Promise<void> {
        await this.driveService.deleteDirectory(userId, `agents/${slug}`);
    }

    async cloneAgentDir(userId: string, sourceSlug: string, targetSlug: string): Promise<void> {
        await this.driveService.copyDirectory(userId, `agents/${sourceSlug}`, `agents/${targetSlug}`);
    }

    // Read a marketplace agent config from marketplace/agents/{category}/{slug}/config.json
    async getMarketplaceAgentConfig(userId: string, category: string, slug: string): Promise<AgentConfigFile | null> {
        let raw: string;
        try {
            const result = await this.driveService.readFile(userId, `marketplace/agents/${category}/${slug}/config.json`);
            raw = result.content;
        } catch (err) {
            if (isFileNotFoundError(err)) return null;
            throw err;
        }
        return normalizeConfig(JSON.parse(raw)).config;
    }

    // List all marketplace agents by scanning category dirs under marketplace/agents/
    async listMarketplaceAgents(userId: string): Promise<Array<{ category: string; slug: string; config: AgentConfigFile }>> {
        const categories = await this.driveService.listSubdirectories(userId, 'marketplace/agents');
        const results: Array<{ category: string; slug: string; config: AgentConfigFile }> = [];

        for (const category of categories) {
            const slugs = await this.driveService.listSubdirectories(userId, `marketplace/agents/${category}`);
            const configs = await Promise.all(
                slugs.map(async (slug) => {
                    const config = await this.getMarketplaceAgentConfig(userId, category, slug);
                    return config ? { category, slug, config } : null;
                }),
            );
            for (const entry of configs) {
                if (entry) results.push(entry);
            }
        }

        return results;
    }

    // Copy marketplace agent files to user's agents/ dir as clone base
    async cloneFromMarketplace(userId: string, category: string, sourceSlug: string, targetSlug: string): Promise<void> {
        await this.driveService.copyDirectory(
            userId,
            `marketplace/agents/${category}/${sourceSlug}`,
            `agents/${targetSlug}`,
        );
    }

    // Find which category a marketplace agent slug belongs to, returning config to avoid double-read
    async findMarketplaceAgent(userId: string, slug: string): Promise<{ category: string; config: AgentConfigFile } | null> {
        const categories = await this.driveService.listSubdirectories(userId, 'marketplace/agents');
        for (const category of categories) {
            const config = await this.getMarketplaceAgentConfig(userId, category, slug);
            if (config) return { category, config };
        }
        return null;
    }

    // Write an arbitrary workspace-relative file (used for supplementary files during clone)
    async writeFile(userId: string, relativePath: string, content: string): Promise<void> {
        if (relativePath.includes('..') || relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath) || relativePath.includes('\0')) {
            throw new Error(`Invalid relative path: ${relativePath}`);
        }
        await this.driveService.writeFile(userId, relativePath, content);
    }

    async readFile(userId: string, relativePath: string): Promise<string | null> {
        if (relativePath.includes('..') || relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath) || relativePath.includes('\0')) {
            throw new Error(`Invalid relative path: ${relativePath}`);
        }
        try {
            const result = await this.driveService.readFile(userId, relativePath);
            return result.content;
        } catch (err) {
            if (isFileNotFoundError(err)) return null;
            throw err;
        }
    }

    async getAgentTools(userId: string, slug: string): Promise<string[]> {
        const config = await this.getAgentConfig(userId, slug);
        return config?.tools ?? [];
    }

    async updateTools(userId: string, slug: string, tools: string[]): Promise<void> {
        const config = await this.getAgentConfig(userId, slug);
        if (!config) throw new Error(`Agent config not found: ${slug}`);
        config.tools = tools;
        config.updated_at = new Date().toISOString();
        await this.putAgentConfig(userId, slug, config);
    }

    async updateIndexChannels(
        userId: string,
        slug: string,
        domain: string | undefined,
        primaryChannel: string,
        channelSlugs: string[],
    ): Promise<void> {
        const index = await this.readAgentIndexDocument(userId);
        const current = index.agents[slug];
        if (!current) return;
        index.agents[slug] = {
            ...current,
            ...(domain !== undefined ? { domain } : {}),
            primary_channel: primaryChannel,
            channels: channelSlugs,
        };
        index.updated_at = new Date().toISOString();
        await this.writeAgentIndexDocument(userId, index);
    }

    private async readAgentIndexDocument(userId: string): Promise<AgentIndexDocument> {
        const emptyDoc: AgentIndexDocument = { agents: {}, updated_at: new Date().toISOString() };

        let raw: string;
        try {
            const result = await this.driveService.readFile(userId, 'agents/index.json');
            raw = result.content;
        } catch (err) {
            if (isFileNotFoundError(err)) return emptyDoc;
            throw err;
        }

        const parsed = JSON.parse(raw) as unknown;

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('agents' in parsed)) {
            return emptyDoc;
        }

        const parsedRecord = parsed as { agents?: Record<string, AgentIndexRecord>; updated_at?: string };
        const agents = parsedRecord.agents;
        return {
            agents: agents && typeof agents === 'object' ? agents : {},
            updated_at: typeof parsedRecord.updated_at === 'string'
                ? parsedRecord.updated_at
                : new Date().toISOString(),
        };
    }

    private async writeAgentIndexDocument(userId: string, index: AgentIndexDocument): Promise<void> {
        const content = JSON.stringify(index, null, 2);
        await this.driveService.writeFile(userId, 'agents/index.json', content);
    }
}
