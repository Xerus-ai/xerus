// Agent Channel Service
// Channel assignment and removal operations for agents.
// Channels stored in filesystem (config.json + index.json), not in DB.
// Channel metadata resolved from workspace-DB (SQLite on sandbox).
// Pattern mirrors agent-tools.service.ts.

import { AgentFilesystemRepository } from './agent-filesystem.repository';
import {
    AgentNotFoundError,
    AgentAccessDeniedError,
    AgentChannelNotFoundError,
    AgentChannelNotAssignedError,
} from './errors';
import { configToAgent, canUserView, canUserModify } from './agent-helpers';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceJsonQuery, executeWorkspaceQuery } from '../conversations/workspace-db.helpers';
import { findAgentByRowid } from './agent-workspace-db.service';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ChannelEntry {
    channel_slug: string;
    channel_name: string;
    domain_slug: string;
    domain_name: string;
    is_primary: boolean;
}

interface ChannelRow {
    slug: string;
    name: string;
    domain_slug: string;
    domain_name: string;
}

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

export class AgentChannelService {
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

    private async resolveChannelMeta(
        provider: DaytonaProvider,
        sandboxId: string,
        channelSlug: string,
    ): Promise<ChannelRow> {
        const sql = `
            SELECT c.slug, c.name, c.domain_slug, d.name AS domain_name
            FROM channels c
            JOIN domains d ON d.slug = c.domain_slug
            WHERE c.slug = '${escapeSQL(channelSlug)}'
        `;
        const rows = await executeWorkspaceJsonQuery<ChannelRow>(provider, sandboxId, sql);
        if (rows.length === 0) throw new AgentChannelNotFoundError(channelSlug);
        return rows[0];
    }

    private async batchResolveChannels(
        provider: DaytonaProvider,
        sandboxId: string,
        channelSlugs: string[],
    ): Promise<Map<string, ChannelRow>> {
        if (channelSlugs.length === 0) return new Map();
        const inClause = channelSlugs.map(s => `'${escapeSQL(s)}'`).join(', ');
        const sql = `
            SELECT c.slug, c.name, c.domain_slug, d.name AS domain_name
            FROM channels c
            JOIN domains d ON d.slug = c.domain_slug
            WHERE c.slug IN (${inClause})
        `;
        const rows = await executeWorkspaceJsonQuery<ChannelRow>(provider, sandboxId, sql);
        const map = new Map<string, ChannelRow>();
        for (const row of rows) map.set(row.slug, row);
        return map;
    }

    private toEntries(
        channelMap: Map<string, ChannelRow>,
        channelSlugs: string[],
        primaryChannel: string,
    ): ChannelEntry[] {
        return channelSlugs
            .filter(slug => channelMap.has(slug))
            .map(slug => {
                const ch = channelMap.get(slug)!;
                return {
                    channel_slug: ch.slug,
                    channel_name: ch.name,
                    domain_slug: ch.domain_slug,
                    domain_name: ch.domain_name,
                    is_primary: slug === primaryChannel,
                };
            });
    }

    async getChannels(
        provider: DaytonaProvider,
        sandboxId: string,
        agentId: number,
        userId: string,
    ): Promise<ChannelEntry[]> {
        const row = await findAgentByRowid(provider, sandboxId, agentId);
        if (!row) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, row.rowid, userId, 'private');
        if (!canUserView(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const channelSlugs = config.channels || [];
        const primaryChannel = config.primary_channel || '';
        const channelMap = await this.batchResolveChannels(provider, sandboxId, channelSlugs);
        return this.toEntries(channelMap, channelSlugs, primaryChannel);
    }

    async assignChannel(
        provider: DaytonaProvider,
        sandboxId: string,
        agentId: number,
        channelSlug: string,
        userId: string,
    ): Promise<{ channels: ChannelEntry[]; primary_channel: string }> {
        const row = await findAgentByRowid(provider, sandboxId, agentId);
        if (!row) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, row.rowid, userId, 'private');
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const channelMeta = await this.resolveChannelMeta(provider, sandboxId, channelSlug);

        const currentChannels = config.channels || [];
        if (currentChannels.includes(channelSlug)) {
            const channelMap = await this.batchResolveChannels(provider, sandboxId, currentChannels);
            return {
                channels: this.toEntries(channelMap, currentChannels, config.primary_channel || ''),
                primary_channel: config.primary_channel || '',
            };
        }

        const channels = [...new Set([...currentChannels, channelSlug])];
        const primaryChannel = currentChannels.length === 0 ? channelSlug : (config.primary_channel || channelSlug);

        config.channels = channels;
        config.primary_channel = primaryChannel;
        config.updated_at = new Date().toISOString();
        await fs.putAgentConfig(userId, row.slug, config);

        const channelMap = await this.batchResolveChannels(provider, sandboxId, channels);
        const slugs = channels.filter(s => channelMap.has(s));
        const primarySlug = channelMap.get(primaryChannel)?.slug || '';
        await fs.updateIndexChannels(userId, row.slug, channelMeta.domain_slug, primarySlug, slugs);

        // Sync to channel_members table so GET /company/channels/:slug/agents works
        const role = primaryChannel === channelSlug ? 'lead' : 'member';
        const memberSql = `
            INSERT OR IGNORE INTO channel_members (channel_slug, agent_slug, role)
            VALUES ('${escapeSQL(channelSlug)}', '${escapeSQL(row.slug)}', '${role}');
        `;
        await executeWorkspaceQuery(provider, sandboxId, memberSql).catch(() => {});

        // Auto-set lead_agent_slug if channel has no lead yet.
        // This ensures findChannelLead() can route messages to an agent.
        const setLeadSql = `
            UPDATE channels
            SET lead_agent_slug = '${escapeSQL(row.slug)}', updated_at = '${new Date().toISOString()}'
            WHERE slug = '${escapeSQL(channelSlug)}' AND lead_agent_slug IS NULL;
        `;
        await executeWorkspaceQuery(provider, sandboxId, setLeadSql).catch(() => {});

        return {
            channels: this.toEntries(channelMap, channels, primaryChannel),
            primary_channel: primaryChannel,
        };
    }

    async removeChannel(
        provider: DaytonaProvider,
        sandboxId: string,
        agentId: number,
        channelSlug: string,
        userId: string,
    ): Promise<{ channels: ChannelEntry[]; primary_channel: string }> {
        const row = await findAgentByRowid(provider, sandboxId, agentId);
        if (!row) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, row.rowid, userId, 'private');
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const currentChannels = config.channels || [];
        if (!currentChannels.includes(channelSlug)) throw new AgentChannelNotAssignedError(channelSlug);

        const channels = currentChannels.filter(s => s !== channelSlug);
        const primaryChannel = (config.primary_channel === channelSlug)
            ? (channels[0] || '')
            : (config.primary_channel || '');

        config.channels = channels;
        config.primary_channel = primaryChannel;
        config.updated_at = new Date().toISOString();
        await fs.putAgentConfig(userId, row.slug, config);

        const channelMap = await this.batchResolveChannels(provider, sandboxId, channels);
        const slugs = channels.filter(s => channelMap.has(s));
        const primarySlug = primaryChannel ? (channelMap.get(primaryChannel)?.slug || '') : '';
        const domainSlug = channels.length > 0
            ? (channelMap.get(channels[0])?.domain_slug || '')
            : undefined;
        await fs.updateIndexChannels(userId, row.slug, domainSlug, primarySlug, slugs);

        // Sync removal from channel_members table
        const deleteSql = `
            DELETE FROM channel_members
            WHERE channel_slug = '${escapeSQL(channelSlug)}' AND agent_slug = '${escapeSQL(row.slug)}';
        `;
        await executeWorkspaceQuery(provider, sandboxId, deleteSql).catch(() => {});

        return {
            channels: this.toEntries(channelMap, channels, primaryChannel),
            primary_channel: primaryChannel,
        };
    }

    async setPrimaryChannel(
        provider: DaytonaProvider,
        sandboxId: string,
        agentId: number,
        channelSlug: string,
        userId: string,
    ): Promise<{ channels: ChannelEntry[]; primary_channel: string }> {
        const row = await findAgentByRowid(provider, sandboxId, agentId);
        if (!row) throw new AgentNotFoundError(agentId);

        const fs = this.getFs();
        const config = await fs.getAgentConfig(userId, row.slug);
        if (!config) throw new AgentNotFoundError(agentId);

        const agent = configToAgent(config, row.rowid, userId, 'private');
        if (!canUserModify(agent, userId)) throw new AgentAccessDeniedError(agentId);

        const currentChannels = config.channels || [];
        if (!currentChannels.includes(channelSlug)) throw new AgentChannelNotAssignedError(channelSlug);

        config.primary_channel = channelSlug;
        config.updated_at = new Date().toISOString();
        await fs.putAgentConfig(userId, row.slug, config);

        const channelMap = await this.batchResolveChannels(provider, sandboxId, currentChannels);
        const primarySlug = channelMap.get(channelSlug)?.slug || '';
        const slugs = currentChannels.filter(s => channelMap.has(s));
        await fs.updateIndexChannels(userId, row.slug, undefined, primarySlug, slugs);

        return {
            channels: this.toEntries(channelMap, currentChannels, channelSlug),
            primary_channel: channelSlug,
        };
    }
}

export const agentChannelService = new AgentChannelService();
