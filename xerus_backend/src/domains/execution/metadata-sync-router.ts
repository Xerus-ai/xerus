// Metadata Sync Router
// Handles metadata_sync events from the runner — routes to entity-specific DB handlers.
// Extracted from runner-event-router.ts to keep files under 400 lines.

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { createMetadataSyncService } from '../sandbox-infra/metadata-sync/metadata-sync.service';
import type { SyncEntityType, WorkspaceSyncPayload } from '../sandbox-infra/metadata-sync/metadata-sync.types';
import { handleTriggerSync, handleNotificationSync, handleKbSync, handleToolSync, handleSessionSync, handleMemorySync } from './entity-sync-handlers';

const log = logger('MetadataSyncRouter');

const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

function sanitizeSyncData(data: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(data)) {
        if (!DANGEROUS_KEYS.includes(key)) {
            clean[key] = value;
        }
    }
    return clean;
}

const SUPPORTED_SYNC_ENTITIES = new Set<string>([
    'workspace',
]);

export async function handleMetadataSync(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const entity = d.entity as string | undefined;
    const action = d.action as string | undefined;
    const rawData = d.data as Record<string, unknown> | undefined;

    if (!entity || !action || !rawData) {
        log.warn('metadata_sync missing fields', { entity, action });
        return;
    }

    const data = sanitizeSyncData(rawData);
    const userId = ctx.request.userId;

    if (entity === 'agent') {
        await handleAgentMetadataSync(data, action, userId);
        return;
    }
    if (entity === 'session') {
        await handleSessionSync(data, action, ctx, deps);
        return;
    }
    if (entity === 'memory') {
        await handleMemorySync(data, action, ctx);
        return;
    }
    if (entity === 'heartbeat') {
        // Heartbeat tables dropped in migration 081. Log and skip.
        log.info('metadata_sync heartbeat sync ignored (tables deprecated)');
        return;
    }
    if (entity === 'trigger') {
        await handleTriggerSync(data, action, ctx, deps);
        return;
    }
    if (entity === 'notification') {
        await handleNotificationSync(data, ctx, deps);
        return;
    }
    if (entity === 'kb') {
        await handleKbSync(data, action, ctx, deps);
        return;
    }
    if (entity === 'tool') {
        if (action === 'connect') {
            const appSlug = data.app_slug as string | undefined;
            const agentSlug = data.agent_id as string | undefined;
            if (appSlug && agentSlug && ctx.sandboxId) {
                // Verify agent exists in workspace.db (source of truth)
                const { agentExists } = await import('../agents/agent-workspace-db.service');
                const provider = deps.sandboxService.getDaytonaProvider();
                const exists = await agentExists(provider, ctx.sandboxId, agentSlug);
                if (exists) {
                    const connectionCheck = await deps.db.query<{ id: number }>(
                        `SELECT id FROM connected_accounts WHERE user_id = $1 AND app_slug = $2 LIMIT 1`,
                        [userId, appSlug],
                    );
                    if (connectionCheck.rows.length === 0) {
                        ctx.stream.send('tool_auth_required', { app_slug: appSlug, agent_slug: agentSlug });
                        log.info('tool_auth_required sent via SSE', { app_slug: appSlug, agent_slug: agentSlug });
                    }
                } else {
                    log.warn('Tool connect: agent not found', { agent_slug: agentSlug, user_id: userId });
                }
            }
        }
        await handleToolSync(data, action, ctx, deps);
        return;
    }
    if (entity === 'skill') {
        handleSkillSync(data, action, userId);
        return;
    }
    if (entity === 'task') {
        log.info('metadata_sync task sync ignored (workspace DB is source of truth)');
        return;
    }
    if (entity === 'domain') {
        log.info('metadata_sync domain sync ignored (workspace DB is source of truth)');
        return;
    }
    if (entity === 'channel') {
        log.info('metadata_sync channel sync ignored (workspace DB is source of truth)');
        return;
    }
    if (entity === 'channel_message') {
        log.info('metadata_sync channel_message sync ignored (workspace DB is source of truth)');
        return;
    }

    if (!SUPPORTED_SYNC_ENTITIES.has(entity as SyncEntityType)) {
        log.warn('metadata_sync unsupported entity', { entity });
        return;
    }

    const syncService = createMetadataSyncService(deps.db);
    const result = await syncService.sync({
        entity: entity as SyncEntityType,
        user_id: userId,
        payload: data as unknown as WorkspaceSyncPayload,
    });
    log.info('metadata_sync synced', { entity, id: result.id, user_id: userId });
}

async function handleAgentMetadataSync(
    data: Record<string, unknown>, action: string, _userId: string,
): Promise<void> {
    const slug = data.slug as string | undefined;
    if (!slug) {
        log.warn('metadata_sync agent missing slug');
        return;
    }

    // Agent data lives in workspace.db + config.json (filesystem source of truth).
    // workspace.db registration is handled by scaffold-sync-hook on the sandbox.
    // No NeonDB agent_registry writes needed.
    switch (action) {
        case 'create':
            log.info('metadata_sync agent create (workspace.db is source of truth)', { slug });
            break;
        case 'update':
            log.info('metadata_sync agent update (config.json is source of truth)', { slug });
            break;
        case 'delete':
            log.info('metadata_sync agent delete (workspace.db is source of truth)', { slug });
            break;
        default:
            log.warn('metadata_sync unknown action for agent', { action, slug });
            break;
    }
}

function handleSkillSync(data: Record<string, unknown>, action: string, _userId: string): void {
    // Skills are filesystem-based: install/uninstall happens via workspace copy.
    // The runner handles skill installation directly in the sandbox.
    // This handler just logs the event.
    const skillSlug = data.skill_slug as string || '';
    log.info('Skill sync (filesystem-based, no DB write)', { action, skill_slug: skillSlug });
}
