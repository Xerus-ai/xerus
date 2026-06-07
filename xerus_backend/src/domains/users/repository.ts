// Users Domain Repository
// Database operations for users, credits, and API keys

import { query, transaction } from '../../database/connection';
import { PoolClient } from 'pg';
import type {
    User,
    UserRow,
    UserCreateInput,
    UserUpdateInput,
    CreditBalance,
    UserApiKey,
    UserApiKeyRow,
    PlanType,
    ApiProvider,
    SubscriptionStatus,
} from './types';
import { PLAN_CREDITS } from './types';
import { UserNotFoundError } from './errors';

// ===== HELPERS =====

export function mapUserRow(row: UserRow): User {
    return {
        user_id: row.user_id,
        email: row.email,
        display_name: row.display_name,
        role: row.role as 'admin' | 'user',
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_login: row.last_login,
        is_active: row.is_active,
        avatar_url: row.avatar_url,
        timezone: row.timezone,
        credits_available: row.credits_available,
        credits_used: row.credits_used,
        credits_reset_date: row.credits_reset_date,
        plan_type: row.plan_type as PlanType,
        platform_key_access: row.platform_key_access,
        polar_customer_id: row.polar_customer_id ?? null,
        polar_subscription_id: row.polar_subscription_id ?? null,
        subscription_status: (row.subscription_status as SubscriptionStatus) ?? 'pending',
        subscription_current_period_end: row.subscription_current_period_end ?? null,
        billing_email: row.billing_email ?? null,
    };
}

function userToCreditBalance(user: User): CreditBalance {
    return {
        user_id: user.user_id,
        balance: user.credits_available,
        used: user.credits_used,
        plan_type: user.plan_type,
        reset_date: user.credits_reset_date,
    };
}

function mapApiKeyRow(row: UserApiKeyRow): UserApiKey {
    return {
        id: row.id,
        user_id: row.user_id,
        provider: row.provider as ApiProvider,
        api_key_encrypted: row.api_key_encrypted,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

// ===== REPOSITORY CLASS =====

export class UserRepository {
    // ===== USER OPERATIONS =====

    // Note: user_id IS the Firebase UID in this schema
    async findById(userId: string): Promise<User | null> {
        const result = await query<UserRow>('SELECT * FROM users WHERE user_id = $1', [userId]);
        return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    }

    // Alias for findById since user_id = firebase_uid
    async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
        return this.findById(firebaseUid);
    }

    async findByEmail(email: string): Promise<User | null> {
        const result = await query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    }

    async create(data: UserCreateInput, isActive = true): Promise<User> {
        const planCredits = PLAN_CREDITS.pro;

        const result = await query<UserRow>(
            `INSERT INTO users (
        user_id, email, display_name, avatar_url,
        role, plan_type, is_active,
        credits_available, credits_used,
        credits_reset_date, platform_key_access,
        subscription_status,
        created_at, updated_at, last_login
      ) VALUES ($1, $2, $3, $4, 'user', 'pro', $6, $5, 0, NOW() + INTERVAL '30 days', true, 'pending', NOW(), NOW(), NOW())
      RETURNING *`,
            [data.firebase_uid, data.email, data.display_name || null, data.avatar_url || null, planCredits, isActive]
        );

        return mapUserRow(result.rows[0]);
    }

    async update(userId: string, updates: UserUpdateInput): Promise<User> {
        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (updates.display_name !== undefined) {
            setClauses.push(`display_name = $${paramIndex}`);
            values.push(updates.display_name);
            paramIndex++;
        }

        if (updates.avatar_url !== undefined) {
            setClauses.push(`avatar_url = $${paramIndex}`);
            values.push(updates.avatar_url);
            paramIndex++;
        }

        if (updates.timezone !== undefined) {
            setClauses.push(`timezone = $${paramIndex}`);
            values.push(updates.timezone);
            paramIndex++;
        }

        if (setClauses.length === 0) {
            const user = await this.findById(userId);
            if (!user) throw new UserNotFoundError(userId);
            return user;
        }

        setClauses.push('updated_at = NOW()');
        values.push(userId);

        const result = await query<UserRow>(`UPDATE users SET ${setClauses.join(', ')} WHERE user_id = $${paramIndex} RETURNING *`, values);

        if (result.rows.length === 0) {
            throw new UserNotFoundError(userId);
        }

        return mapUserRow(result.rows[0]);
    }

    async updatePlanType(userId: string, planType: PlanType): Promise<User> {
        const result = await query<UserRow>(
            'UPDATE users SET plan_type = $2, updated_at = NOW() WHERE user_id = $1 RETURNING *',
            [userId, planType]
        );
        if (result.rows.length === 0) {
            throw new UserNotFoundError(userId);
        }
        return mapUserRow(result.rows[0]);
    }

    async updatePlatformKeyAccess(userId: string, platformKeyAccess: boolean): Promise<User> {
        const result = await query<UserRow>(
            'UPDATE users SET platform_key_access = $2, updated_at = NOW() WHERE user_id = $1 RETURNING *',
            [userId, platformKeyAccess]
        );
        if (result.rows.length === 0) {
            throw new UserNotFoundError(userId);
        }
        return mapUserRow(result.rows[0]);
    }

    async updateLastLogin(userId: string): Promise<void> {
        await query('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE user_id = $1', [userId]);
    }

    async setActive(userId: string, isActive: boolean): Promise<User> {
        const result = await query<UserRow>(
            'UPDATE users SET is_active = $2, updated_at = NOW() WHERE user_id = $1 RETURNING *',
            [userId, isActive]
        );
        if (result.rows.length === 0) {
            throw new UserNotFoundError(userId);
        }
        return mapUserRow(result.rows[0]);
    }

    async delete(userId: string): Promise<{ api_keys_deleted: number }> {
        return transaction(async (client: PoolClient) => {
            // Agents live in workspace-DB (per-sandbox SQLite).
            // They are cleaned up when the sandbox is deleted.

            // Conversations live in workspace-DB (per-sandbox SQLite).
            // They are cleaned up when the sandbox is deleted.

            const apiKeysResult = await client.query('DELETE FROM user_api_keys WHERE user_id = $1', [userId]);

            // Finally delete user
            const userResult = await client.query('DELETE FROM users WHERE user_id = $1', [userId]);

            if (userResult.rowCount === 0) {
                throw new UserNotFoundError(userId);
            }

            return {
                api_keys_deleted: apiKeysResult.rowCount || 0,
            };
        });
    }

    async list(limit = 50, offset = 0): Promise<{ users: User[]; total: number }> {
        const countResult = await query<{ count: string }>('SELECT COUNT(*) as count FROM users');
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await query<UserRow>('SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);

        return {
            users: result.rows.map(mapUserRow),
            total,
        };
    }

    // ===== CREDIT OPERATIONS =====

    async getCreditBalance(userId: string): Promise<CreditBalance | null> {
        const user = await this.findById(userId);
        if (!user) return null;
        return userToCreditBalance(user);
    }

    async getCreditBalanceForUpdate(client: PoolClient, userId: string): Promise<CreditBalance | null> {
        const result = await client.query<UserRow>('SELECT * FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
        if (!result.rows[0]) return null;
        const user = mapUserRow(result.rows[0]);
        return userToCreditBalance(user);
    }

    async updateCredits(
        client: PoolClient,
        userId: string,
        creditsAvailable: number,
        creditsUsed?: number,
        creditsResetDate?: Date
    ): Promise<CreditBalance> {
        let sql = 'UPDATE users SET credits_available = $2';
        const params: unknown[] = [userId, creditsAvailable];
        let paramIndex = 3;

        if (creditsUsed !== undefined) {
            sql += `, credits_used = $${paramIndex}`;
            params.push(creditsUsed);
            paramIndex++;
        }

        if (creditsResetDate !== undefined) {
            sql += `, credits_reset_date = $${paramIndex}`;
            params.push(creditsResetDate);
            paramIndex++;
        }

        sql += ', updated_at = NOW() WHERE user_id = $1 RETURNING *';

        const result = await client.query<UserRow>(sql, params);
        const user = mapUserRow(result.rows[0]);
        return userToCreditBalance(user);
    }

    async deductCredits(client: PoolClient, userId: string, amount: number): Promise<CreditBalance> {
        const result = await client.query<UserRow>(
            `UPDATE users SET
        credits_available = credits_available - $2,
        credits_used = credits_used + $2,
        updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
            [userId, amount]
        );
        const user = mapUserRow(result.rows[0]);
        return userToCreditBalance(user);
    }

    async addCredits(client: PoolClient, userId: string, amount: number): Promise<CreditBalance> {
        const result = await client.query<UserRow>(
            `UPDATE users SET
        credits_available = credits_available + $2,
        updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
            [userId, amount]
        );
        const user = mapUserRow(result.rows[0]);
        return userToCreditBalance(user);
    }

    async resetCredits(client: PoolClient, userId: string, newBalance: number): Promise<CreditBalance> {
        const result = await client.query<UserRow>(
            `UPDATE users SET
        credits_available = $2,
        credits_used = 0,
        credits_reset_date = NOW() + INTERVAL '30 days',
        updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
            [userId, newBalance]
        );
        const user = mapUserRow(result.rows[0]);
        return userToCreditBalance(user);
    }

    async resetExpiredCredits(planType: PlanType, newBalance: number): Promise<number> {
        const result = await query<{ user_id: string }>(
            `UPDATE users SET
        credits_available = $1,
        credits_used = 0,
        credits_reset_date = NOW() + INTERVAL '30 days',
        updated_at = NOW()
       WHERE plan_type = $2
         AND credits_reset_date <= NOW()
       RETURNING user_id`,
            [newBalance, planType]
        );
        return result.rowCount || 0;
    }

    // ===== API KEY OPERATIONS =====

    async getApiKeys(userId: string): Promise<UserApiKey[]> {
        const result = await query<UserApiKeyRow>('SELECT * FROM user_api_keys WHERE user_id = $1 ORDER BY provider', [userId]);
        return result.rows.map(mapApiKeyRow);
    }

    async getApiKey(userId: string, provider: ApiProvider): Promise<UserApiKey | null> {
        const result = await query<UserApiKeyRow>('SELECT * FROM user_api_keys WHERE user_id = $1 AND provider = $2', [userId, provider]);
        return result.rows[0] ? mapApiKeyRow(result.rows[0]) : null;
    }

    async saveApiKey(userId: string, provider: ApiProvider, encryptedKey: string): Promise<UserApiKey> {
        const result = await query<UserApiKeyRow>(
            `INSERT INTO user_api_keys (user_id, provider, api_key_encrypted, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id, provider)
       DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, updated_at = NOW()
       RETURNING *`,
            [userId, provider, encryptedKey]
        );
        return mapApiKeyRow(result.rows[0]);
    }

    async deleteApiKey(userId: string, provider: ApiProvider): Promise<boolean> {
        const result = await query('DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2', [userId, provider]);
        return (result.rowCount ?? 0) > 0;
    }

    async deleteAllApiKeys(userId: string): Promise<number> {
        const result = await query('DELETE FROM user_api_keys WHERE user_id = $1', [userId]);
        return result.rowCount ?? 0;
    }
}

// Singleton export
export const userRepository = new UserRepository();
