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

async function agentExistsInWorkspaceDb(
    provider: DaytonaProvider,
    sandboxId: string,
    slug: string,
): Promise<boolean> {
    const sql = `SELECT slug FROM agents WHERE slug = '${escapeSQL(slug)}' LIMIT 1`;
    const rows = await executeWorkspaceJsonQuery<{ slug: string }>(provider, sandboxId, sql);
    return rows.length > 0;
}

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
        const exists = await agentExistsInWorkspaceDb(provider, sandboxId, slug).catch((err: unknown) => {
            log.warn('Failed to verify system agent exists in workspace DB', {
                agent_slug: slug,
                channel_slug: channelSlug,
                error: err instanceof Error ? err.message : String(err),
            });
            return false;
        });

        if (!exists) {
            log.warn('System agent not found in workspace DB; skipping channel assignment', {
                agent_slug: slug,
                channel_slug: channelSlug,
            });
            continue;
        }

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
