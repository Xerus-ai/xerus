import { escapeSQL, executeWorkspaceQuery } from '../../conversations/workspace-db.helpers';
import type { DaytonaProvider } from '../../sandbox-infra/sandbox/providers/daytona.provider';
import { logger } from '../../../utils/logger';

const log = logger('activity-logger');

const DEFAULT_SENDER = 'xerus-master';

interface ActivityParams {
    channelSlug: string;
    agentSlug?: string;
    action: string;
    summary: string;
}

export async function logMcpActivity(
    provider: DaytonaProvider,
    sandboxId: string,
    params: ActivityParams,
): Promise<void> {
    const sender = params.agentSlug || DEFAULT_SENDER;
    const metadata = JSON.stringify({ action: params.action, auto_logged: true });

    const sql = `INSERT INTO channel_messages (channel_slug, agent_slug, content, message_type, metadata)
        VALUES ('${escapeSQL(params.channelSlug)}', '${escapeSQL(sender)}', '${escapeSQL(params.summary)}', 'system', '${escapeSQL(metadata)}')`;

    try {
        await executeWorkspaceQuery(provider, sandboxId, sql);
    } catch (err) {
        log.warn('Activity log failed (non-blocking)', {
            channel: params.channelSlug,
            action: params.action,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
