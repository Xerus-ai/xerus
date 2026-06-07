// Trigger Registration Service
// Reconciles HEARTBEAT.md event entries with agent_triggers table.
// On HEARTBEAT.md save: parse events, diff against DB, register/deregister as needed.

import { pool, transaction } from '../../database/connection';
import type { PoolClient } from 'pg';
import { TriggerResolver } from './trigger-resolver.service';
import type { AgentTriggerRow } from './trigger.types';
import { TriggerResolutionError } from './trigger.errors';

// -----------------------------------------------------------------------------
// Parsed Event Entry (inlined from deleted heartbeat-md-parser)
// -----------------------------------------------------------------------------

export interface ParsedEventEntry {
    app: string;
    event_type: string;
    filter: string | null;
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface TriggerChange {
    app: string;
    event_type: string;
    filter: string | null;
}

export interface ReconcileResult {
    registered: TriggerChange[];
    deregistered: TriggerChange[];
    unchanged: TriggerChange[];
    warnings: string[];
}

// -----------------------------------------------------------------------------
// Trigger Registration Service
// -----------------------------------------------------------------------------

export class TriggerRegistrationService {
    private readonly resolver: TriggerResolver;

    constructor(resolver?: TriggerResolver) {
        this.resolver = resolver ?? new TriggerResolver();
    }

    /**
     * Sync triggers from a list of desired events.
     * Previously parsed from HEARTBEAT.md; now accepts events directly.
     */
    async syncFromEvents(
        agentSlug: string,
        userId: string,
        events: ParsedEventEntry[]
    ): Promise<ReconcileResult> {
        return this.reconcileTriggers(agentSlug, userId, events);
    }

    /**
     * Reconcile desired events from HEARTBEAT.md against registered triggers in DB.
     *
     * For each desired event:
     *   - If not in DB: resolve provider, register, insert row
     *   - If in DB with same filter: unchanged
     *   - If in DB with different filter: deregister old, register new
     * For each DB trigger not in desired events:
     *   - Deregister and delete row
     *
     * All DB mutations run inside a single transaction so partial failures roll back.
     */
    async reconcileTriggers(
        agentSlug: string,
        userId: string,
        desiredEvents: ParsedEventEntry[]
    ): Promise<ReconcileResult> {
        return transaction(async (client) => {
            const result: ReconcileResult = {
                registered: [],
                deregistered: [],
                unchanged: [],
                warnings: [],
            };

            const existingTriggers = await this.getRegisteredTriggers(agentSlug, client);
            const existingMap = buildTriggerMap(existingTriggers);
            const desiredKeys = new Set<string>();

            // Process each desired event
            for (const event of desiredEvents) {
                const key = buildEventKey(event.app, event.event_type);
                desiredKeys.add(key);

                const existing = existingMap.get(key);
                const desiredFilterConfig = buildFilterConfig(event.filter);

                if (!existing) {
                    // New trigger - resolve and register
                    const registered = await this.registerNewTrigger(client, agentSlug, userId, event, result);
                    if (!registered) {
                        continue;
                    }
                } else if (filterChanged(existing.filter_config, desiredFilterConfig)) {
                    // Filter changed - deregister old, register new
                    await this.deregisterTrigger(client, existing, result);
                    await this.registerNewTrigger(client, agentSlug, userId, event, result);
                } else {
                    // Unchanged
                    result.unchanged.push({
                        app: event.app,
                        event_type: event.event_type,
                        filter: event.filter,
                    });
                }
            }

            // Deregister triggers that are no longer in HEARTBEAT.md
            for (const [key, trigger] of existingMap) {
                if (!desiredKeys.has(key)) {
                    await this.deregisterTrigger(client, trigger, result);
                }
            }

            return result;
        });
    }

    /**
     * Get all registered triggers for an agent from the database.
     */
    async getRegisteredTriggers(agentSlug: string, client?: PoolClient): Promise<AgentTriggerRow[]> {
        const queryable = client ?? pool;
        const dbResult = await queryable.query<AgentTriggerRow>(
            `SELECT id, agent_slug, user_id, provider_id, app_slug, event_type,
                    external_id, webhook_url, filter_config, account_id,
                    enabled, last_fired_at, fire_count, created_at, updated_at
             FROM agent_triggers
             WHERE agent_slug = $1`,
            [agentSlug]
        );
        return dbResult.rows;
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private async registerNewTrigger(
        client: PoolClient,
        agentSlug: string,
        userId: string,
        event: ParsedEventEntry,
        result: ReconcileResult
    ): Promise<boolean> {
        // Resolve provider for this app
        let resolution;
        try {
            resolution = await this.resolver.resolve(userId, event.app, event.event_type);
        } catch (error) {
            if (error instanceof TriggerResolutionError) {
                result.warnings.push(
                    `Skipped ${event.app}.${event.event_type}: ${error.message}`
                );
                return false;
            }
            throw error;
        }

        const filterConfig = buildFilterConfig(event.filter);

        // Insert into agent_triggers
        await client.query(
            `INSERT INTO agent_triggers
                (agent_slug, user_id, app_slug, event_type, provider_id, filter_config, account_id, enabled)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
            [
                agentSlug,
                userId,
                event.app,
                event.event_type,
                resolution.provider_id,
                JSON.stringify(filterConfig),
                resolution.account_id,
            ]
        );

        result.registered.push({
            app: event.app,
            event_type: event.event_type,
            filter: event.filter,
        });

        return true;
    }

    private async deregisterTrigger(
        client: PoolClient,
        trigger: AgentTriggerRow,
        result: ReconcileResult
    ): Promise<void> {
        // Delete from DB
        await client.query(
            `DELETE FROM agent_triggers WHERE id = $1`,
            [trigger.id]
        );

        result.deregistered.push({
            app: trigger.app_slug,
            event_type: trigger.event_type,
            filter: extractFilterRaw(trigger.filter_config),
        });
    }
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

function buildEventKey(app: string, eventType: string): string {
    return `${app}.${eventType}`;
}

function buildFilterConfig(filter: string | null): Record<string, unknown> {
    if (!filter) {
        return {};
    }
    return { raw: filter };
}

function buildTriggerMap(triggers: AgentTriggerRow[]): Map<string, AgentTriggerRow> {
    const map = new Map<string, AgentTriggerRow>();
    for (const trigger of triggers) {
        map.set(buildEventKey(trigger.app_slug, trigger.event_type), trigger);
    }
    return map;
}

function filterChanged(
    existingConfig: Record<string, unknown>,
    desiredConfig: Record<string, unknown>
): boolean {
    const existingRaw = (existingConfig.raw as string) ?? null;
    const desiredRaw = (desiredConfig.raw as string) ?? null;
    return existingRaw !== desiredRaw;
}

function extractFilterRaw(filterConfig: Record<string, unknown>): string | null {
    return (filterConfig.raw as string) ?? null;
}
