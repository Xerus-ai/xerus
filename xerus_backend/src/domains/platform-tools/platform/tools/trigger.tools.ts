// Trigger Management Platform Tools
// Implements platform.register_trigger, platform.list_triggers, platform.deregister_trigger
// Source: docs/planning/execution/heartbeat-unified.md

import crypto from 'crypto';
import { query } from '../../../../database/connection';
import type {
    RegisterTriggerInput,
    ListTriggersInput,
    DeregisterTriggerInput,
    RegisterTriggerResult,
    ListTriggersResult,
    DeregisterTriggerResult,
    TriggerResult,
} from '../platform-tool.inlined-types';
import type { TriggerServicePort } from '../platform-tool.types';
import { TriggerNotFoundError, TriggerAlreadyExistsError } from '../../../triggers/trigger.errors';

// Re-export for consumers of this module
export { TriggerNotFoundError, TriggerAlreadyExistsError };

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_PROVIDER_ID = 1; // Pipedream provider

let _webhookBaseUrl: string | undefined;
function getWebhookBaseUrl(): string {
    if (!_webhookBaseUrl) {
        const url = process.env.WEBHOOK_BASE_URL;
        if (!url) {
            throw new Error('WEBHOOK_BASE_URL environment variable is required');
        }
        _webhookBaseUrl = url;
    }
    return _webhookBaseUrl;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class UnauthorizedTriggerAccessError extends Error {
    constructor(triggerId: number) {
        super(`Unauthorized access to trigger: ${triggerId}`);
        this.name = 'UnauthorizedTriggerAccessError';
    }
}

// -----------------------------------------------------------------------------
// Row Types
// -----------------------------------------------------------------------------

interface TriggerRow {
    id: number;
    agent_slug: string;
    app_slug: string;
    event_type: string;
    webhook_url: string;
    enabled: boolean;
    filter_config: Record<string, unknown>;
    last_fired_at: Date | null;
    fire_count: number;
    created_at: Date;
}

// -----------------------------------------------------------------------------
// Trigger Service
// -----------------------------------------------------------------------------

export class TriggerService implements TriggerServicePort {
    async registerTrigger(
        userId: string,
        input: RegisterTriggerInput
    ): Promise<RegisterTriggerResult> {
        const { agentId: agentSlug, appSlug, eventType, filterConfig = {} } = input;

        const existingResult = await query<{ id: number }>(
            `SELECT id FROM agent_triggers
             WHERE agent_slug = $1 AND app_slug = $2 AND event_type = $3 AND user_id = $4`,
            [agentSlug, appSlug, eventType, userId]
        );

        if (existingResult.rows.length > 0) {
            throw new TriggerAlreadyExistsError(agentSlug, appSlug, eventType);
        }

        const externalId = crypto.randomBytes(16).toString('hex');
        const webhookUrl = `${getWebhookBaseUrl()}/${externalId}`;

        const result = await query<TriggerRow>(
            `INSERT INTO agent_triggers (
                agent_slug, user_id, provider_id, app_slug, event_type,
                external_id, webhook_url, filter_config, enabled, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, true, NOW(), NOW())
             RETURNING id, agent_slug, app_slug, event_type, webhook_url, enabled,
                       filter_config, fire_count, created_at`,
            [agentSlug, userId, DEFAULT_PROVIDER_ID, appSlug, eventType,
             externalId, webhookUrl, JSON.stringify(filterConfig)]
        );

        const trigger = this.mapRowToTrigger(result.rows[0]);
        return { trigger, webhookUrl };
    }

    async listTriggers(
        userId: string,
        input: ListTriggersInput
    ): Promise<ListTriggersResult> {
        const { agentId: agentSlug, enabled } = input;

        let queryText = `SELECT id, agent_slug, app_slug, event_type, webhook_url, enabled,
                                filter_config, last_fired_at, fire_count, created_at
                         FROM agent_triggers WHERE agent_slug = $1 AND user_id = $2`;
        const params: unknown[] = [agentSlug, userId];

        if (enabled !== undefined) {
            queryText += ` AND enabled = $3`;
            params.push(enabled);
        }

        queryText += ` ORDER BY created_at DESC`;

        const result = await query<TriggerRow>(queryText, params);
        const triggers = result.rows.map((row: TriggerRow) => this.mapRowToTrigger(row));

        return { triggers, totalCount: triggers.length };
    }

    async deregisterTrigger(
        userId: string,
        input: DeregisterTriggerInput
    ): Promise<DeregisterTriggerResult> {
        const { triggerId } = input;

        const triggerResult = await query<{ id: number; user_id: string }>(
            `SELECT id, user_id FROM agent_triggers WHERE id = $1`,
            [triggerId]
        );

        if (triggerResult.rows.length === 0) {
            throw new TriggerNotFoundError(String(triggerId));
        }

        if (triggerResult.rows[0].user_id !== userId) {
            throw new UnauthorizedTriggerAccessError(triggerId);
        }

        await query(`DELETE FROM agent_triggers WHERE id = $1`, [triggerId]);

        return { triggerId, deregisteredAt: new Date().toISOString() };
    }

    private mapRowToTrigger(row: TriggerRow): TriggerResult {
        return {
            id: row.id,
            agentId: row.agent_slug,
            appSlug: row.app_slug,
            eventType: row.event_type,
            webhookUrl: row.webhook_url,
            enabled: row.enabled,
            filterConfig: row.filter_config ?? {},
            lastFiredAt: row.last_fired_at?.toISOString(),
            fireCount: row.fire_count ?? 0,
            createdAt: row.created_at.toISOString(),
        };
    }
}

// -----------------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------------

let serviceInstance: TriggerService | null = null;

export function getTriggerService(): TriggerService {
    if (!serviceInstance) {
        serviceInstance = new TriggerService();
    }
    return serviceInstance;
}

export function resetTriggerService(): void {
    serviceInstance = null;
}
