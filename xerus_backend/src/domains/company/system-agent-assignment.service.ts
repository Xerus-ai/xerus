import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import {
    executeWorkspaceQuery as execWsMutate,
    escapeSQL,
} from '../conversations/workspace-db.helpers';
import { logger } from '../../utils/logger';

const log = logger('SystemAgentAssignment');

export const SYSTEM_AGENT_SLUGS = ['xerus-master', 'xerus-cto'];

const AGENT_CONFIG_PATHS = ['agents', '.claude/agents'];


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
