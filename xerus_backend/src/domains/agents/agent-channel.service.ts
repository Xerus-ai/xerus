// Agent Channel Service
// Channel assignment and removal operations for agents.
// Channels stored in filesystem (config.json + index.json), not in DB.
// Pattern mirrors agent-tools.service.ts.

import { AgentRegistryRepository, agentRegistryRepository } from './agent-registry.repository';
import { AgentFilesystemRepository } from './agent-filesystem.repository';
import {
    AgentNotFoundError,
    AgentAccessDeniedError,
    AgentChannelNotFoundError,
    AgentChannelNotAssignedError,
} from './errors';
import { configToAgent, canUserView, canUserModify } from './agent-helpers';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ChannelEntry {
    channel_id: string;
    channel_slug: string;
    channel_name: string;
    domain_slug: string;
    domain_name: string;
    is_primary: boolean;
}

interface ChannelRow {
    id: string;
    slug: string;
    name: string;
    domain_slug: string;
    domain_name: string;
}

interface DbClient {
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

export class AgentChannelService {
    constructor(
        private registry: AgentRegistryRepository = agentRegistryRepository,
        private fsRepo: AgentFilesystemRepository | null = null,
        private db: DbClient | null = null,
    ) {}

    setFilesystemRepo(repo: AgentFilesystemRepository): void {
        this.fsRepo = repo;
    }

    setDb(db: DbClient): void {
        this.db = db;
    }

    private getFs(): AgentFilesystemRepository {
        if (!this.fsRepo) {
            throw new Error('AgentFilesystemRepository not initialized. Call setFilesystemRepo() at startup.');
        }
        return this.fsRepo;
    }

    private getDb(): DbClient {
        if (!this.db) {
            throw new Error('DbClient not initialized. Call setDb() at startup.');
        }
        return this.db;
    }

    private async resolveChannelMeta(channelId: string, userId: string): Promise<ChannelRow> {
        const { rows } = await this.getDb().query<ChannelRow>(
            `SELECT c.id::text, c.slug, c.name, d.slug AS domain_slug, d.name AS domain_name
             FROM channels c
             JOIN domains d ON d.id = c.domain_id
             WHERE c.id::text = $1 AND d.user_id = $2`,
            [channelId, userId],
        );
        if (rows.length === 0) throw new AgentChannelNotFoundError(channelId);
        return rows[0];
    }

    private async batchResolveChannels(
        channelIds: string[],
        userId: string,
    ): Promise<Map<string, ChannelRow>> {
        if (channelIds.length === 0) return new Map();
        const { rows } = await this.getDb().query<ChannelRow>(
            `SELECT c.id::text, c.slug, c.name, d.slug AS domain_slug, d.name AS domain_name
             FROM channels c
             JOIN domains d ON d.id = c.domain_id
             WHERE c.id::text = ANY($1) AND d.user_id = $2`,
            [channelIds, userId],
        );
        const map = new Map<string, ChannelRow>();
        for (const row of rows) map.set(row.id, row);
        return map;
    }

    private toEntries(
        channelMap: Map<string, ChannelRow>,
        channelIds: string[],
        primaryChannel: string,
    ): ChannelEntry[] {
        return channelIds
            .filter(id => channelMap.has(id))
            .map(id => {
                const ch = channelMap.get(id)!;
                return {
                    channel_id: ch.id,
                    channel_slug: ch.slug,
                    channel_name: ch.name,
                    domain_slug: ch.domain_slug,
                    domain_name: ch.domain_name,
                    is_primary: id === primaryChannel,
                };
            });
    }

    async getChannels(agentId: number, userId: string): Promise<ChannelEntry[]> {
        const entry = await this.registry.findById(agentId);
        if (!entry) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserView(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const channelIds = config.channels || [];
        const primaryChannel = config.primary_channel || '';
        const channelMap = await this.batchResolveChannels(channelIds, userId);
        return this.toEntries(channelMap, channelIds, primaryChannel);
    }

    async assignChannel(
        agentId: number,
        channelId: string,
        userId: string,
    ): Promise<{ channels: ChannelEntry[]; primary_channel: string }> {
        const entry = await this.registry.findById(agentId);
        if (!entry) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const channelMeta = await this.resolveChannelMeta(channelId, userId);

        const currentChannels = config.channels || [];
        if (currentChannels.includes(channelId)) {
            const channelMap = await this.batchResolveChannels(currentChannels, userId);
            return {
                channels: this.toEntries(channelMap, currentChannels, config.primary_channel || ''),
                primary_channel: config.primary_channel || '',
            };
        }

        const channels = [...new Set([...currentChannels, channelId])];
        const primaryChannel = currentChannels.length === 0 ? channelId : (config.primary_channel || channelId);

        config.channels = channels;
        config.primary_channel = primaryChannel;
        config.updated_at = new Date().toISOString();
        await fs.putAgentConfig(userId, entry.slug, config);

        const channelMap = await this.batchResolveChannels(channels, userId);
        const channelSlugs = channels.map(id => channelMap.get(id)?.slug).filter(Boolean) as string[];
        const primarySlug = channelMap.get(primaryChannel)?.slug || '';
        await fs.updateIndexChannels(userId, entry.slug, channelMeta.domain_slug, primarySlug, channelSlugs);

        await this.getDb().query(
            'UPDATE channels SET agent_count = agent_count + 1 WHERE id::text = $1',
            [channelId],
        );

        return {
            channels: this.toEntries(channelMap, channels, primaryChannel),
            primary_channel: primaryChannel,
        };
    }

    async removeChannel(
        agentId: number,
        channelId: string,
        userId: string,
    ): Promise<{ channels: ChannelEntry[]; primary_channel: string }> {
        const entry = await this.registry.findById(agentId);
        if (!entry) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const currentChannels = config.channels || [];
        if (!currentChannels.includes(channelId)) throw new AgentChannelNotAssignedError(channelId);

        const channels = currentChannels.filter(id => id !== channelId);
        const primaryChannel = (config.primary_channel === channelId)
            ? (channels[0] || '')
            : (config.primary_channel || '');

        config.channels = channels;
        config.primary_channel = primaryChannel;
        config.updated_at = new Date().toISOString();
        await fs.putAgentConfig(userId, entry.slug, config);

        const channelMap = await this.batchResolveChannels(channels, userId);
        const channelSlugs = channels.map(id => channelMap.get(id)?.slug).filter(Boolean) as string[];
        const primarySlug = primaryChannel ? (channelMap.get(primaryChannel)?.slug || '') : '';
        const domainSlug = channels.length > 0
            ? (channelMap.get(channels[0])?.domain_slug || '')
            : undefined;
        await fs.updateIndexChannels(userId, entry.slug, domainSlug, primarySlug, channelSlugs);

        await this.getDb().query(
            'UPDATE channels SET agent_count = GREATEST(agent_count - 1, 0) WHERE id::text = $1',
            [channelId],
        );

        return {
            channels: this.toEntries(channelMap, channels, primaryChannel),
            primary_channel: primaryChannel,
        };
    }

    async setPrimaryChannel(
        agentId: number,
        channelId: string,
        userId: string,
    ): Promise<{ channels: ChannelEntry[]; primary_channel: string }> {
        const entry = await this.registry.findById(agentId);
        if (!entry) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, entry.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, entry.id, entry.user_id, entry.agent_type);
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const currentChannels = config.channels || [];
        if (!currentChannels.includes(channelId)) throw new AgentChannelNotAssignedError(channelId);

        config.primary_channel = channelId;
        config.updated_at = new Date().toISOString();
        await fs.putAgentConfig(userId, entry.slug, config);

        const channelMap = await this.batchResolveChannels(currentChannels, userId);
        const primarySlug = channelMap.get(channelId)?.slug || '';
        const channelSlugs = currentChannels.map(id => channelMap.get(id)?.slug).filter(Boolean) as string[];
        await fs.updateIndexChannels(userId, entry.slug, undefined, primarySlug, channelSlugs);

        return {
            channels: this.toEntries(channelMap, currentChannels, channelId),
            primary_channel: channelId,
        };
    }
}

export const agentChannelService = new AgentChannelService();
