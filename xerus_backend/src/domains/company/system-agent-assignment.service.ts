import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import {
    executeWorkspaceQuery as execWsMutate,
    executeWorkspaceJsonQuery,
    escapeSQL,
} from '../conversations/workspace-db.helpers';
import { logger } from '../../utils/logger';

const log = logger('SystemAgentAssignment');

export const SYSTEM_AGENT_SLUGS = ['xerus-master', 'xerus-cto'];

const AGENT_CONFIG_PATHS = ['agents', '.claude/agents'];

const AGENT_INDEX_PATH = `${SANDBOX_CONFIG.workspacePath}/agents/index.json`;


async function readAgentConfig(
    provider: DaytonaProvider,
    sandboxId: string,
    slug: string,
): Promise<{ path: string; config: Record<string, unknown> } | null> {
    const basePath = SANDBOX_CONFIG.workspacePath;
    for (const dir of AGENT_CONFIG_PATHS) {
        const configPath = `${basePath}/${dir}/${slug}/config.json`;
        try {
            const raw = await provider.readFile(sandboxId, configPath);
            if (!raw) continue;
            const config = JSON.parse(raw) as Record<string, unknown>;
            return { path: configPath, config };
        } catch {
            // Try next path
        }
    }
    return null;
}

export async function addSystemAgentsToChannel(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
): Promise<void> {
    for (const slug of SYSTEM_AGENT_SLUGS) {
        // Ensure agent row exists in workspace.db (prevents FK violations on channel_members)
        const ensureSql = `INSERT OR IGNORE INTO agents (slug, name, adapter_type, role, autonomy_level, status) VALUES ('${escapeSQL(slug)}', '${escapeSQL(slug)}', 'claudecode', 'specialist', 'supervised', 'idle')`;
        await execWsMutate(provider, sandboxId, ensureSql).catch((err: unknown) => {
            log.warn('Failed to ensure system agent exists in workspace DB', {
                agent_slug: slug,
                channel_slug: channelSlug,
                error: err instanceof Error ? err.message : String(err),
            });
        });

        const sql = `INSERT OR IGNORE INTO channel_members (channel_slug, agent_slug, role) VALUES ('${escapeSQL(channelSlug)}', '${escapeSQL(slug)}', 'member')`;
        await execWsMutate(provider, sandboxId, sql).catch((err: unknown) => {
            log.warn('Failed to insert system agent into channel_members', {
                agent_slug: slug,
                channel_slug: channelSlug,
                error: err instanceof Error ? err.message : String(err),
            });
        });

        try {
            const found = await readAgentConfig(provider, sandboxId, slug);
            if (!found) {
                log.warn('Agent config.json not found for system agent', {
                    agent_slug: slug,
                    channel_slug: channelSlug,
                });
                continue;
            }
            const { path: configPath, config } = found;
            const channels = Array.isArray(config.channels) ? (config.channels as string[]) : [];
            if (!channels.includes(channelSlug)) {
                channels.push(channelSlug);
                config.channels = channels;
                await provider.writeFile(sandboxId, configPath, JSON.stringify(config, null, 2));
            }
        } catch (err: unknown) {
            log.warn('Failed to update agent config channels', {
                agent_slug: slug,
                channel_slug: channelSlug,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}

interface ChannelMetaRow {
    slug: string;
    domain_slug: string;
}

interface AgentIndexRecord {
    name?: string;
    domain?: string;
    primary_channel?: string;
    channels?: string[];
    agent_type?: string;
    [key: string]: unknown;
}

interface AgentIndexDocument {
    agents: Record<string, AgentIndexRecord>;
    updated_at: string;
}

async function resolveChannelDomain(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
): Promise<string | null> {
    const rows = await executeWorkspaceJsonQuery<ChannelMetaRow>(
        provider,
        sandboxId,
        `SELECT slug, domain_slug FROM channels WHERE slug = '${escapeSQL(channelSlug)}'`,
    );
    return rows.length > 0 ? rows[0].domain_slug : null;
}

async function readAgentIndexDocument(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<AgentIndexDocument> {
    try {
        const raw = await provider.readFile(sandboxId, AGENT_INDEX_PATH);
        const parsed = raw ? (JSON.parse(raw) as Partial<AgentIndexDocument>) : null;
        if (parsed && parsed.agents && typeof parsed.agents === 'object') {
            return { agents: parsed.agents, updated_at: parsed.updated_at || new Date().toISOString() };
        }
    } catch {
        // index.json missing or unreadable — start a fresh document
    }
    return { agents: {}, updated_at: new Date().toISOString() };
}

async function writeAgentIndexDocument(
    provider: DaytonaProvider,
    sandboxId: string,
    doc: AgentIndexDocument,
): Promise<void> {
    doc.updated_at = new Date().toISOString();
    await provider.writeFile(sandboxId, AGENT_INDEX_PATH, JSON.stringify(doc, null, 2));
}

/**
 * Ensure an agent has an entry in agents/index.json. The agents list endpoint
 * iterates index.json, so an agent created via MCP that is missing from the
 * index is invisible on the agents page even though its row and config exist.
 * Idempotent: preserves any existing channel data on the entry.
 */
export async function registerAgentInIndex(
    provider: DaytonaProvider,
    sandboxId: string,
    agentSlug: string,
    agentName: string,
): Promise<void> {
    const doc = await readAgentIndexDocument(provider, sandboxId);
    const current = doc.agents[agentSlug];
    doc.agents[agentSlug] = {
        ...current,
        name: current?.name || agentName,
        agent_type: current?.agent_type || 'private',
    };
    await writeAgentIndexDocument(provider, sandboxId, doc);
}

async function updateAgentIndexChannels(
    provider: DaytonaProvider,
    sandboxId: string,
    agentSlug: string,
    agentName: string,
    domainSlug: string | null,
    primaryChannel: string,
    channels: string[],
): Promise<void> {
    const doc = await readAgentIndexDocument(provider, sandboxId);
    const current = doc.agents[agentSlug] || { name: agentName, agent_type: 'private' };
    doc.agents[agentSlug] = {
        ...current,
        name: current.name || agentName,
        agent_type: current.agent_type || 'private',
        ...(domainSlug ? { domain: domainSlug } : {}),
        primary_channel: primaryChannel,
        channels,
    };
    await writeAgentIndexDocument(provider, sandboxId, doc);
}

/**
 * Assign a single agent to a channel at the MCP/sandbox layer, keeping every
 * source of truth in sync:
 *   1. agents/{slug}/config.json  -> channels[] + primary_channel + domain
 *   2. agents/index.json          -> channels[] + primary_channel (agents list reads this)
 *   3. channel_members table      -> membership row (lead for first/primary channel)
 *   4. channels.lead_agent_slug   -> set when the channel has no lead yet
 *
 * The frontend's GET /channels/:slug/agents reads config.json channels[], and
 * the agents list reads index.json, so updating only channel_members leaves the
 * agent invisible. This helper is the canonical fix for that drift.
 *
 * Fail-fast: throws if the agent's config.json cannot be found, since a created
 * agent must always have one.
 */
export async function assignAgentToChannel(
    provider: DaytonaProvider,
    sandboxId: string,
    agentSlug: string,
    channelSlug: string,
): Promise<void> {
    const found = await readAgentConfig(provider, sandboxId, agentSlug);
    if (!found) {
        throw new Error(`Agent config.json not found for ${agentSlug}; cannot assign to channel ${channelSlug}`);
    }

    const { path: configPath, config } = found;
    const agentName = typeof config.name === 'string' ? config.name : agentSlug;
    const channels = Array.isArray(config.channels) ? (config.channels as string[]) : [];

    if (!channels.includes(channelSlug)) {
        channels.push(channelSlug);
    }

    const existingPrimary = typeof config.primary_channel === 'string' ? config.primary_channel : '';
    const primaryChannel = existingPrimary || channelSlug;

    const domainSlug = await resolveChannelDomain(provider, sandboxId, channelSlug);

    config.channels = channels;
    config.primary_channel = primaryChannel;
    if (domainSlug && (!config.domain || config.domain === '')) {
        config.domain = domainSlug;
    }
    config.updated_at = new Date().toISOString();
    await provider.writeFile(sandboxId, configPath, JSON.stringify(config, null, 2));

    await updateAgentIndexChannels(
        provider,
        sandboxId,
        agentSlug,
        agentName,
        domainSlug,
        primaryChannel,
        channels,
    );

    const role = primaryChannel === channelSlug ? 'lead' : 'member';
    const memberSql = `INSERT OR IGNORE INTO channel_members (channel_slug, agent_slug, role) VALUES ('${escapeSQL(channelSlug)}', '${escapeSQL(agentSlug)}', '${role}')`;
    await execWsMutate(provider, sandboxId, memberSql);

    // Claim the channel lead only when it has none yet (the IS NULL guard never
    // demotes an existing lead), so message routing (findChannelLead) can always
    // reach an agent in the channel.
    const setLeadSql = `UPDATE channels SET lead_agent_slug = '${escapeSQL(agentSlug)}', updated_at = '${new Date().toISOString()}' WHERE slug = '${escapeSQL(channelSlug)}' AND lead_agent_slug IS NULL`;
    await execWsMutate(provider, sandboxId, setLeadSql);
}
