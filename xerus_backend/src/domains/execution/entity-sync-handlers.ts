// Entity Sync Handlers
// Direct DB write handlers for metadata_sync entities that bypass MetadataSyncService:
// trigger, notification, kb, tool, session, memory.
// Extracted from runner-event-router.ts to keep files under 400 lines.

import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { requireAgent } from './pipeline-guards';
import type { MemoryScope } from '../memory/memory.types';
import { getSessionControlService, getMemoryService } from './platform/tools';

const LOG_PREFIX = '[EventRouter]';

export async function handleTriggerSync(
    data: Record<string, unknown>, action: string, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    if (action === 'deregister') {
        // Deregister supports two paths:
        // 1. By trigger_id (from platform.deregister_trigger MCP handler)
        // 2. By agent_id + app_slug + event_type (field-based match)
        const triggerId = data.trigger_id as string | number | undefined;
        if (triggerId) {
            await deps.db.query(
                `DELETE FROM agent_triggers WHERE id = $1 AND user_id = $2`,
                [String(triggerId), ctx.request.userId],
            );
            console.log(`${LOG_PREFIX} trigger sync: deregistered trigger id=${triggerId}`);
            return;
        }
        // Fall through to field-based deregister below
    }

    const agentSlug = data.agent_id as string || data.agent_slug as string;
    const appSlug = data.app_slug as string;
    const eventType = data.event_type as string;
    if (!agentSlug || !appSlug || !eventType) {
        console.warn(`${LOG_PREFIX} trigger sync: missing fields`);
        return;
    }

    const agentResult = await deps.db.query<{ id: number }>(
        `SELECT id FROM agent_registry WHERE slug = $1 AND user_id = $2 LIMIT 1`,
        [agentSlug, ctx.request.userId],
    );
    if (agentResult.rows.length === 0) {
        console.warn(`${LOG_PREFIX} trigger sync: agent not found slug=${agentSlug}`);
        return;
    }
    const agentId = agentResult.rows[0].id;

    if (action === 'register') {
        await deps.db.query(
            `INSERT INTO agent_triggers (agent_id, user_id, app_slug, event_type)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (agent_id, app_slug, event_type) DO NOTHING`,
            [agentId, ctx.request.userId, appSlug, eventType],
        );
        console.log(`${LOG_PREFIX} trigger sync: registered ${appSlug}.${eventType} for agent=${agentSlug}`);
    } else if (action === 'deregister') {
        await deps.db.query(
            `DELETE FROM agent_triggers WHERE agent_id = $1 AND app_slug = $2 AND event_type = $3`,
            [agentId, appSlug, eventType],
        );
        console.log(`${LOG_PREFIX} trigger sync: deregistered ${appSlug}.${eventType} for agent=${agentSlug}`);
    }
}

export async function handleNotificationSync(
    data: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const content = data.content as string;
    if (!content) {
        console.warn(`${LOG_PREFIX} notification sync: missing content`);
        return;
    }
    const channel = data.channel as string | undefined;
    const priority = data.priority as string || 'normal';
    const title = (content.length > 80 ? content.slice(0, 77) + '...' : content);
    const summary = content.slice(0, 200);

    await deps.db.query(
        `INSERT INTO inbox_items (user_id, channel_id, agent_slug, title, summary, content, status, priority, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, 'delivered', $7, $8)`,
        [ctx.request.userId, channel || null, requireAgent(ctx).slug, title, summary, content, priority, JSON.stringify(data.metadata ?? {})],
    );
    console.log(`${LOG_PREFIX} notification sync: created inbox item for user=${ctx.request.userId}`);
}

export async function handleKbSync(
    data: Record<string, unknown>, action: string, _ctx: PipelineContext, _deps: ResolvedExecutionDeps,
): Promise<void> {
    const agentSlug = data.agent_id as string || data.agent_slug as string;
    const kbId = data.kb_id as string;
    // KB assignments now live in config.json (filesystem is source of truth).
    console.log(`${LOG_PREFIX} kb sync: ${action} kb=${kbId} agent=${agentSlug} (filesystem is source of truth, no DB write)`);
}

export async function handleSessionSync(
    data: Record<string, unknown>, action: string, ctx: PipelineContext, _deps: ResolvedExecutionDeps,
): Promise<void> {
    const sessionControlService = getSessionControlService();
    const userId = ctx.request.userId;
    switch (action) {
        case 'pause':
            await sessionControlService.pauseExecution(userId, {
                sessionId: data.session_id as string,
                reason: data.reason as string,
            });
            console.log(`${LOG_PREFIX} session sync: paused session=${data.session_id}`);
            break;
        case 'resume':
            await sessionControlService.resumeExecution(userId, {
                sessionId: data.session_id as string,
                approved: data.approved === true,
                feedback: (data.feedback as string) || '',
            });
            console.log(`${LOG_PREFIX} session sync: resumed session=${data.session_id}`);
            break;
        case 'get_state':
            console.log(`${LOG_PREFIX} session sync: get_state for session=${data.session_id} (fire-and-forget, result cannot be returned to agent)`);
            break;
        default:
            console.warn(`${LOG_PREFIX} session sync: unknown action '${action}'`);
    }
}

export async function handleMemorySync(
    data: Record<string, unknown>, _action: string, ctx: PipelineContext,
): Promise<void> {
    const content = data.content as string;
    if (!content) {
        console.warn(`${LOG_PREFIX} memory sync: missing content, skipping pgvector index`);
        return;
    }
    const memoryService = getMemoryService();
    await memoryService.writeMemory(ctx.request.userId, {
        content,
        scope: (data.scope as MemoryScope) || 'company',
        scopeId: data.scope_id as string,
        filePath: data.path as string,
    });
    console.log(`${LOG_PREFIX} memory sync: indexed in pgvector scope=${data.scope}`);
}

export async function handleHeartbeatSync(
    data: Record<string, unknown>, _action: string, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const agentSlug = data.agent_id as string || data.agent_slug as string;
    if (!agentSlug) {
        console.warn(`${LOG_PREFIX} heartbeat sync: missing agent_id`);
        return;
    }

    const agentResult = await deps.db.query<{ id: number }>(
        `SELECT id FROM agent_registry WHERE slug = $1 AND user_id = $2 LIMIT 1`,
        [agentSlug, ctx.request.userId],
    );
    if (agentResult.rows.length === 0) {
        console.warn(`${LOG_PREFIX} heartbeat sync: agent not found slug=${agentSlug}`);
        return;
    }
    const agentId = agentResult.rows[0].id;

    await deps.db.query(
        `INSERT INTO heartbeat_configs (agent_id, user_id, enabled, cron_expression, timezone, active_hours_start, active_hours_end, weekdays_only, prompt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (agent_id) DO UPDATE SET
             enabled = COALESCE(EXCLUDED.enabled, heartbeat_configs.enabled),
             cron_expression = COALESCE(EXCLUDED.cron_expression, heartbeat_configs.cron_expression),
             timezone = COALESCE(EXCLUDED.timezone, heartbeat_configs.timezone),
             active_hours_start = COALESCE(EXCLUDED.active_hours_start, heartbeat_configs.active_hours_start),
             active_hours_end = COALESCE(EXCLUDED.active_hours_end, heartbeat_configs.active_hours_end),
             weekdays_only = COALESCE(EXCLUDED.weekdays_only, heartbeat_configs.weekdays_only),
             prompt = COALESCE(EXCLUDED.prompt, heartbeat_configs.prompt)`,
        [
            agentId, ctx.request.userId,
            data.enabled ?? true,
            data.cron_expression as string || '0 */4 * * *',
            data.timezone as string || 'UTC',
            data.active_hours_start as string || null,
            data.active_hours_end as string || null,
            data.weekdays_only ?? false,
            data.prompt as string || null,
        ],
    );
    console.log(`${LOG_PREFIX} heartbeat sync: upserted config for agent=${agentSlug}`);
}

export async function handleToolSync(
    data: Record<string, unknown>, action: string, _ctx: PipelineContext, _deps: ResolvedExecutionDeps,
): Promise<void> {
    const agentSlug = data.agent_id as string || data.agent_slug as string;
    const appSlug = data.app_slug as string;
    // Tool assignments now live in config.json (filesystem is source of truth).
    console.log(`${LOG_PREFIX} tool sync: ${action} tool=${appSlug} agent=${agentSlug} (filesystem is source of truth, no DB write)`);
}
