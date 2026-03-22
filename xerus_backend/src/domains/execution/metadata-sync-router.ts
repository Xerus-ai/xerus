// Metadata Sync Router
// Handles metadata_sync events from the runner — routes to entity-specific DB handlers.
// Extracted from runner-event-router.ts to keep files under 400 lines.

import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { agentRegistryRepository } from '../agents/agent-registry.repository';
import { createMetadataSyncService } from './metadata-sync/metadata-sync.service';
import type { SyncEntityType } from './metadata-sync/metadata-sync.types';
import { handleTriggerSync, handleNotificationSync, handleKbSync, handleToolSync, handleSessionSync, handleMemorySync, handleHeartbeatSync } from './entity-sync-handlers';

const LOG_PREFIX = '[EventRouter]';

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
    'workspace', 'domain', 'channel', 'channel_message', 'task',
]);

export async function handleMetadataSync(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    const entity = d.entity as string | undefined;
    const action = d.action as string | undefined;
    const rawData = d.data as Record<string, unknown> | undefined;

    if (!entity || !action || !rawData) {
        console.warn(`${LOG_PREFIX} metadata_sync: missing entity=${entity} action=${action} or data`);
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
        await handleHeartbeatSync(data, action, ctx, deps);
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
            if (appSlug && agentSlug) {
                const agentCheck = await deps.db.query<{ id: number }>(
                    `SELECT id FROM agent_registry WHERE slug = $1 AND user_id = $2 LIMIT 1`,
                    [agentSlug, userId],
                );
                if (agentCheck.rows.length > 0) {
                    const connectionCheck = await deps.db.query<{ id: number }>(
                        `SELECT id FROM connected_accounts WHERE user_id = $1 AND app_slug = $2 LIMIT 1`,
                        [userId, appSlug],
                    );
                    if (connectionCheck.rows.length === 0) {
                        ctx.stream.send('tool_auth_required', { app_slug: appSlug, agent_slug: agentSlug });
                        console.log(`${LOG_PREFIX} tool_auth_required: sent SSE for app=${appSlug} agent=${agentSlug}`);
                    }
                } else {
                    console.warn(`${LOG_PREFIX} tool connect: agent slug=${agentSlug} not found for user=${userId}`);
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

    if (!SUPPORTED_SYNC_ENTITIES.has(entity as SyncEntityType)) {
        console.warn(`${LOG_PREFIX} metadata_sync: unsupported entity='${entity}'`);
        return;
    }

    const syncService = createMetadataSyncService(deps.db);
    const payload = entity === 'channel'
        ? { domain_slug: data.domain as string, slug: data.slug, name: data.name, description: data.description, agent_count: data.agent_count }
        : data;

    const result = await syncService.sync({
        entity: entity as SyncEntityType,
        user_id: userId,
        payload: payload as never,
    });
    console.log(`${LOG_PREFIX} metadata_sync: synced ${entity} id=${result.id} for user=${userId}`);
}

async function handleAgentMetadataSync(
    data: Record<string, unknown>, action: string, userId: string,
): Promise<void> {
    const slug = data.slug as string | undefined;
    if (!slug) {
        console.warn(`${LOG_PREFIX} metadata_sync: missing slug in agent data`);
        return;
    }

    // Agent metadata sync now only manages agent_registry entries.
    // Full agent data lives in config.json (filesystem source of truth).
    switch (action) {
        case 'create': {
            const existing = await agentRegistryRepository.findBySlug(slug, userId);
            if (!existing) {
                await agentRegistryRepository.register(slug, userId, 'private');
            }
            console.log(`${LOG_PREFIX} metadata_sync: registered agent slug=${slug} for user=${userId}`);
            break;
        }
        case 'update':
            // Config.json is the source of truth; registry only tracks slug/id/type
            console.log(`${LOG_PREFIX} metadata_sync: agent update slug=${slug} (config.json is source of truth)`);
            break;
        case 'delete':
            await agentRegistryRepository.deleteBySlug(slug, userId);
            console.log(`${LOG_PREFIX} metadata_sync: deleted agent slug=${slug} for user=${userId}`);
            break;
        default:
            console.warn(`${LOG_PREFIX} metadata_sync: unknown action '${action}' for agent slug=${slug}`);
            break;
    }
}

function handleSkillSync(data: Record<string, unknown>, action: string, _userId: string): void {
    // Skills are filesystem-based: install/uninstall happens via workspace copy.
    // The runner handles skill installation directly in the sandbox.
    // This handler just logs the event.
    const skillSlug = data.skill_slug as string || '';
    console.log(`${LOG_PREFIX} skill sync: action=${action} slug=${skillSlug} (filesystem-based, no DB write)`);
}
