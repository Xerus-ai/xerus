// Users Domain - Subscription Repository
// Database operations for Polar subscription management

import { query } from '../../database/connection';
import { PoolClient } from 'pg';
import type { User, UserRow, PlanType, SubscriptionStatus } from './types';
import { UserNotFoundError } from './errors';
import { mapUserRow } from './repository';

// ===== REPOSITORY CLASS =====

export class SubscriptionRepository {
    async findByPolarCustomerId(customerId: string, client?: PoolClient): Promise<User | null> {
        const exec = client ? client.query.bind(client) : (text: string, values: unknown[]) => query<UserRow>(text, values);
        const result = await exec('SELECT * FROM users WHERE polar_customer_id = $1', [customerId]);
        return result.rows[0] ? mapUserRow(result.rows[0] as UserRow) : null;
    }

    async findByPolarSubscriptionId(subscriptionId: string, client?: PoolClient): Promise<User | null> {
        const exec = client ? client.query.bind(client) : (text: string, values: unknown[]) => query<UserRow>(text, values);
        const result = await exec('SELECT * FROM users WHERE polar_subscription_id = $1', [subscriptionId]);
        return result.rows[0] ? mapUserRow(result.rows[0] as UserRow) : null;
    }

    async updateSubscription(userId: string, data: {
        polar_customer_id?: string;
        polar_subscription_id?: string;
        subscription_status?: SubscriptionStatus;
        subscription_current_period_end?: Date | null;
        plan_type?: PlanType;
        billing_email?: string;
    }, client?: PoolClient): Promise<User> {
        const exec = client ? client.query.bind(client) : (text: string, values: unknown[]) => query<UserRow>(text, values);
        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (data.polar_customer_id !== undefined) {
            setClauses.push(`polar_customer_id = $${paramIndex}`);
            values.push(data.polar_customer_id);
            paramIndex++;
        }
        if (data.polar_subscription_id !== undefined) {
            setClauses.push(`polar_subscription_id = $${paramIndex}`);
            values.push(data.polar_subscription_id);
            paramIndex++;
        }
        if (data.subscription_status !== undefined) {
            setClauses.push(`subscription_status = $${paramIndex}`);
            values.push(data.subscription_status);
            paramIndex++;
        }
        if (data.subscription_current_period_end !== undefined) {
            setClauses.push(`subscription_current_period_end = $${paramIndex}`);
            values.push(data.subscription_current_period_end);
            paramIndex++;
        }
        if (data.plan_type !== undefined) {
            setClauses.push(`plan_type = $${paramIndex}`);
            values.push(data.plan_type);
            paramIndex++;
        }
        if (data.billing_email !== undefined) {
            setClauses.push(`billing_email = $${paramIndex}`);
            values.push(data.billing_email);
            paramIndex++;
        }

        if (setClauses.length === 0) {
            const result = await exec('SELECT * FROM users WHERE user_id = $1', [userId]);
            if (result.rows.length === 0) throw new UserNotFoundError(userId);
            return mapUserRow(result.rows[0] as UserRow);
        }

        setClauses.push('updated_at = NOW()');
        values.push(userId);

        const result = await exec(
            `UPDATE users SET ${setClauses.join(', ')} WHERE user_id = $${paramIndex} RETURNING *`,
            values,
        );
        if (result.rows.length === 0) {
            throw new UserNotFoundError(userId);
        }
        return mapUserRow(result.rows[0] as UserRow);
    }
}

// Singleton export
export const subscriptionRepository = new SubscriptionRepository();
