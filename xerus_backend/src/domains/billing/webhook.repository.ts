import { PoolClient } from 'pg';
import { query } from '../../database/connection';
import type { PolarWebhookEventType } from './types';

export class WebhookRepository {
    /**
     * Atomically insert a webhook event if it doesn't already exist.
     * Uses ON CONFLICT DO NOTHING to avoid race conditions between
     * separate exists() + insert() calls.
     * Returns true if the row was inserted (new event), false if duplicate.
     */
    async insertIfNotExists(client: PoolClient, data: {
        event_id: string;
        event_type: PolarWebhookEventType;
        polar_customer_id?: string | null;
        polar_subscription_id?: string | null;
        payload: Record<string, unknown>;
    }): Promise<boolean> {
        const result = await client.query(
            `INSERT INTO polar_webhook_events (event_id, event_type, polar_customer_id, polar_subscription_id, payload)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (event_id) DO NOTHING
             RETURNING id`,
            [
                data.event_id,
                data.event_type,
                data.polar_customer_id ?? null,
                data.polar_subscription_id ?? null,
                JSON.stringify(data.payload),
            ],
        );
        return (result.rowCount ?? 0) > 0;
    }

    /** @deprecated Use insertIfNotExists with a PoolClient for atomic idempotency */
    async exists(eventId: string): Promise<boolean> {
        const result = await query<{ count: number }>(
            'SELECT COUNT(*)::int AS count FROM polar_webhook_events WHERE event_id = $1',
            [eventId],
        );
        return (result.rows[0]?.count ?? 0) > 0;
    }

    /** @deprecated Use insertIfNotExists with a PoolClient for atomic idempotency */
    async insert(data: {
        event_id: string;
        event_type: PolarWebhookEventType;
        polar_customer_id?: string | null;
        polar_subscription_id?: string | null;
        payload: Record<string, unknown>;
    }): Promise<void> {
        await query(
            `INSERT INTO polar_webhook_events (event_id, event_type, polar_customer_id, polar_subscription_id, payload)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                data.event_id,
                data.event_type,
                data.polar_customer_id ?? null,
                data.polar_subscription_id ?? null,
                JSON.stringify(data.payload),
            ],
        );
    }
}

export const webhookRepository = new WebhookRepository();
