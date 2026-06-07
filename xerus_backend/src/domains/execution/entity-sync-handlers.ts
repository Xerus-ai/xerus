// Entity Sync Handlers
// Direct DB write handlers for metadata_sync entities that bypass MetadataSyncService:
// trigger, notification, kb, tool, session, memory.
// Extracted from runner-event-router.ts to keep files under 400 lines.

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { requireAgent } from './pipeline-guards';
import type { MemoryScope } from '../memory/memory.types';
import { getSessionControlService, getMemoryService } from '../platform-tools/platform/tools';
import { escapeSQL, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';

const log = logger('EntitySyncHandlers');
const LOG_PREFIX = '[EntitySyncHandlers]';

// ---------------------------------------------------------------------------
// Typed event data interfaces for entity sync handlers
// ---------------------------------------------------------------------------

interface TriggerSyncData {
    trigger_id?: string | number;
    agent_slug: string;
    app_slug: string;
    event_type: string;
}

interface NotificationSyncData {
    content: string;
    priority?: string;
    metadata?: Record<string, unknown>;
}

interface KbSyncData {
    agent_slug: string;
    kb_id?: string;
}

interface SessionSyncData {
    session_id: string;
    reason?: string;
    approved?: boolean;
    feedback?: string;
}

interface MemorySyncData {
    content: string;
    scope?: MemoryScope;
    scope_id?: string;
    path?: string;
}

interface ToolSyncData {
    agent_slug: string;
    app_slug?: string;
}

// ---------------------------------------------------------------------------
// Assertion functions (fail-fast with explicit type checks)
// ---------------------------------------------------------------------------

function assertTriggerSyncData(data: Record<string, unknown>): TriggerSyncData {
    const agentSlug = typeof data.agent_id === 'string' ? data.agent_id
        : typeof data.agent_slug === 'string' ? data.agent_slug : '';
    const appSlug = typeof data.app_slug === 'string' ? data.app_slug : '';
    const eventType = typeof data.event_type === 'string' ? data.event_type : '';
    const triggerId = typeof data.trigger_id === 'string' || typeof data.trigger_id === 'number'
        ? data.trigger_id : undefined;
    return { trigger_id: triggerId, agent_slug: agentSlug, app_slug: appSlug, event_type: eventType };
}

function assertNotificationSyncData(data: Record<string, unknown>): NotificationSyncData {
    if (typeof data.content !== 'string' || data.content.length === 0) {
        throw new Error(`${LOG_PREFIX} notification sync: missing content`);
    }
    return {
        content: data.content,
        priority: typeof data.priority === 'string' ? data.priority : 'normal',
        metadata: typeof data.metadata === 'object' && data.metadata !== null
            ? data.metadata as Record<string, unknown> : undefined,
    };
}

function assertKbSyncData(data: Record<string, unknown>): KbSyncData {
    const agentSlug = typeof data.agent_id === 'string' ? data.agent_id
        : typeof data.agent_slug === 'string' ? data.agent_slug : '';
    return {
        agent_slug: agentSlug,
        kb_id: typeof data.kb_id === 'string' ? data.kb_id : undefined,
    };
}

function assertSessionSyncData(data: Record<string, unknown>): SessionSyncData {
    if (typeof data.session_id !== 'string') {
        throw new Error(`${LOG_PREFIX} session sync: missing session_id`);
    }
    return {
        session_id: data.session_id,
        reason: typeof data.reason === 'string' ? data.reason : undefined,
        approved: typeof data.approved === 'boolean' ? data.approved : undefined,
        feedback: typeof data.feedback === 'string' ? data.feedback : '',
    };
}

function assertMemorySyncData(data: Record<string, unknown>): MemorySyncData {
    if (typeof data.content !== 'string' || data.content.length === 0) {
        throw new Error(`${LOG_PREFIX} memory sync: missing content`);
    }
    return {
        content: data.content,
        scope: typeof data.scope === 'string' ? data.scope as MemoryScope : undefined,
        scope_id: typeof data.scope_id === 'string' ? data.scope_id : undefined,
        path: typeof data.path === 'string' ? data.path : undefined,
    };
}

function assertToolSyncData(data: Record<string, unknown>): ToolSyncData {
    const agentSlug = typeof data.agent_id === 'string' ? data.agent_id
        : typeof data.agent_slug === 'string' ? data.agent_slug : '';
    return {
        agent_slug: agentSlug,
        app_slug: typeof data.app_slug === 'string' ? data.app_slug : undefined,
    };
}

export async function handleTriggerSync(
    data: Record<string, unknown>, action: string, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const d = assertTriggerSyncData(data);

    if (action === 'deregister') {
        // Deregister supports two paths:
        // 1. By trigger_id (from platform.deregister_trigger MCP handler)
        // 2. By agent_slug + app_slug + event_type (field-based match)
        if (d.trigger_id !== undefined) {
            await deps.db.query(
                `DELETE FROM agent_triggers WHERE id = $1 AND user_id = $2`,
                [String(d.trigger_id), ctx.request.userId],
            );
            log.info('Trigger sync deregistered by id', { trigger_id: d.trigger_id });
            return;
        }
        // Fall through to field-based deregister below
    }

    if (!d.agent_slug || !d.app_slug || !d.event_type) {
        log.warn('Trigger sync missing fields');
        return;
    }

    if (action === 'register') {
        await deps.db.query(
            `INSERT INTO agent_triggers (agent_slug, user_id, app_slug, event_type)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (agent_slug, user_id, app_slug, event_type) DO NOTHING`,
            [d.agent_slug, ctx.request.userId, d.app_slug, d.event_type],
        );
        log.info('Trigger sync registered', { app_slug: d.app_slug, event_type: d.event_type, agent_slug: d.agent_slug });
    } else if (action === 'deregister') {
        await deps.db.query(
            `DELETE FROM agent_triggers WHERE agent_slug = $1 AND app_slug = $2 AND event_type = $3`,
            [d.agent_slug, d.app_slug, d.event_type],
        );
        log.info('Trigger sync deregistered', { app_slug: d.app_slug, event_type: d.event_type, agent_slug: d.agent_slug });
    }
}

export async function handleNotificationSync(
    data: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const d = assertNotificationSyncData(data);

    if (!ctx.sandboxId) {
        log.warn('Notification sync: no sandboxId in context, skipping');
        return;
    }

    const workspacePriority = d.priority === 'critical' ? 'urgent' : (d.priority || 'normal');
    const subject = (d.content.length > 80 ? d.content.slice(0, 77) + '...' : d.content);
    const senderSlug = requireAgent(ctx).slug;
    const now = new Date().toISOString();
    const metadataStr = JSON.stringify(d.metadata ?? {});

    const provider = deps.sandboxService.getDaytonaProvider() as DaytonaProvider;

    const sql = `
        BEGIN;
        INSERT INTO inbox_items (agent_slug, sender_slug, message_type, subject, content, metadata, priority, status, received_at)
        VALUES ('xerus-master', '${escapeSQL(senderSlug)}', 'notification', '${escapeSQL(subject)}', '${escapeSQL(d.content)}', '${escapeSQL(metadataStr)}', '${escapeSQL(workspacePriority)}', 'unread', '${now}');
        SELECT id FROM inbox_items WHERE id = last_insert_rowid();
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<{ id: number }>(provider, ctx.sandboxId, sql);
    if (rows.length === 0) {
        throw new Error(`Failed to create notification inbox item in workspace DB for sandbox=${ctx.sandboxId}`);
    }

    log.info('Notification sync: created inbox item', { inbox_item_id: rows[0].id, sandbox_id: ctx.sandboxId });
}

export async function handleKbSync(
    data: Record<string, unknown>, action: string, _ctx: PipelineContext, _deps: ResolvedExecutionDeps,
): Promise<void> {
    const d = assertKbSyncData(data);
    // KB assignments now live in config.json (filesystem is source of truth).
    log.info('KB sync (filesystem is source of truth, no DB write)', { action, kb_id: d.kb_id, agent_slug: d.agent_slug });
}

export async function handleSessionSync(
    data: Record<string, unknown>, action: string, ctx: PipelineContext, _deps: ResolvedExecutionDeps,
): Promise<void> {
    const d = assertSessionSyncData(data);
    const sessionControlService = getSessionControlService();
    const userId = ctx.request.userId;
    switch (action) {
        case 'pause':
            await sessionControlService.pauseExecution(userId, {
                sessionId: d.session_id,
                reason: d.reason || '',
            });
            log.info('Session sync paused', { session_id: d.session_id });
            break;
        case 'resume':
            await sessionControlService.resumeExecution(userId, {
                sessionId: d.session_id,
                approved: d.approved === true,
                feedback: d.feedback || '',
            });
            log.info('Session sync resumed', { session_id: d.session_id });
            break;
        case 'get_state':
            log.info('Session sync get_state (fire-and-forget)', { session_id: d.session_id });
            break;
        default:
            log.warn('Session sync unknown action', { action });
    }
}

export async function handleMemorySync(
    data: Record<string, unknown>, _action: string, ctx: PipelineContext,
): Promise<void> {
    const d = assertMemorySyncData(data);
    const memoryService = getMemoryService();
    await memoryService.writeMemory(ctx.request.userId, {
        content: d.content,
        scope: d.scope || 'company',
        scopeId: d.scope_id,
        filePath: d.path,
    });
    log.info('Memory sync indexed in pgvector', { scope: d.scope });
}

export async function handleToolSync(
    data: Record<string, unknown>, action: string, _ctx: PipelineContext, _deps: ResolvedExecutionDeps,
): Promise<void> {
    const d = assertToolSyncData(data);
    // Tool assignments now live in config.json (filesystem is source of truth).
    log.info('Tool sync (filesystem is source of truth, no DB write)', { action, app_slug: d.app_slug, agent_slug: d.agent_slug });
}
