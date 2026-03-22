// Users Domain Credit Service
// Credit management with transactional operations

import { transaction, query } from '../../database/connection';
import { PoolClient } from 'pg';
import { userRepository } from './repository';
import { userValidator } from './validators';
import { UserNotFoundError, InsufficientCreditsError, CreditOperationError } from './errors';
import type { CreditBalance, CreditDeductInput, CreditHistoryOptions, CreditHistoryPage, CreditHistoryEntry, PlanType } from './types';
import { PLAN_CREDITS } from './types';

// ===== TRANSACTION LOGGING =====

async function logTransaction(
    client: PoolClient,
    userId: string,
    amount: number,
    operationType: string,
    balanceAfter: number,
    reason?: string,
    sessionId?: string,
): Promise<void> {
    await client.query(
        `INSERT INTO credit_transactions (user_id, amount, operation_type, reason, session_id, balance_after)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, amount, operationType, reason || null, sessionId || null, balanceAfter]
    );
}

// ===== SERVICE CLASS =====

export class CreditService {
    async getBalance(userId: string): Promise<CreditBalance> {
        const balance = await userRepository.getCreditBalance(userId);
        if (!balance) {
            throw new UserNotFoundError(userId);
        }
        return balance;
    }

    async checkCredits(userId: string, required = 1): Promise<boolean> {
        const balance = await this.getBalance(userId);
        return balance.balance >= required;
    }

    async deduct(userId: string, input?: CreditDeductInput): Promise<CreditBalance> {
        const validated = input ? userValidator.validateCreditDeduct(input) : { amount: 1 };
        const amount = validated.amount || 1;

        return transaction(async (client: PoolClient) => {
            // Lock the user row for update
            const balance = await userRepository.getCreditBalanceForUpdate(client, userId);
            if (!balance) {
                throw new UserNotFoundError(userId);
            }

            // Check if sufficient credits
            if (balance.balance < amount) {
                throw new InsufficientCreditsError(amount, balance.balance);
            }

            // Deduct credits (updates credits_available and credits_used)
            const updated = await userRepository.deductCredits(client, userId, amount);

            await logTransaction(client, userId, -amount, 'deduct', updated.balance);

            return updated;
        });
    }

    async add(userId: string, amount: number, description?: string): Promise<CreditBalance> {
        if (amount <= 0) {
            throw new CreditOperationError('add', 'Amount must be positive');
        }

        return transaction(async (client: PoolClient) => {
            const balance = await userRepository.getCreditBalanceForUpdate(client, userId);
            if (!balance) {
                throw new UserNotFoundError(userId);
            }

            const updated = await userRepository.addCredits(client, userId, amount);

            await logTransaction(client, userId, amount, 'add', updated.balance, description);

            return updated;
        });
    }

    async refund(userId: string, amount: number, description?: string): Promise<CreditBalance> {
        if (amount <= 0) {
            throw new CreditOperationError('refund', 'Amount must be positive');
        }

        return transaction(async (client: PoolClient) => {
            const balance = await userRepository.getCreditBalanceForUpdate(client, userId);
            if (!balance) {
                throw new UserNotFoundError(userId);
            }

            const updated = await userRepository.addCredits(client, userId, amount);

            await logTransaction(client, userId, amount, 'refund', updated.balance, description);

            return updated;
        });
    }

    async reset(userId: string): Promise<CreditBalance> {
        return transaction(async (client: PoolClient) => {
            const balance = await userRepository.getCreditBalanceForUpdate(client, userId);
            if (!balance) {
                throw new UserNotFoundError(userId);
            }

            const credits = PLAN_CREDITS[balance.plan_type];
            const updated = await userRepository.resetCredits(client, userId, credits);

            await logTransaction(client, userId, credits - balance.balance, 'reset', updated.balance, 'Monthly reset');

            return updated;
        });
    }

    async resetExpiredForPlan(planType: PlanType): Promise<number> {
        const credits = PLAN_CREDITS[planType];
        return userRepository.resetExpiredCredits(planType, credits);
    }

    async getHistory(userId: string, options?: CreditHistoryOptions): Promise<CreditHistoryPage> {
        const validated = options ? userValidator.validateCreditHistoryOptions(options) : { page: 1, limit: 20 };

        // Verify user exists
        const balance = await userRepository.getCreditBalance(userId);
        if (!balance) {
            throw new UserNotFoundError(userId);
        }

        const page = validated.page || 1;
        const limit = validated.limit || 20;
        const offset = (page - 1) * limit;

        const conditions: string[] = ['user_id = $1'];
        const params: unknown[] = [userId];
        let paramIndex = 2;

        if (validated.operation) {
            conditions.push(`operation_type = $${paramIndex}`);
            params.push(validated.operation);
            paramIndex++;
        }

        if (validated.start_date) {
            conditions.push(`created_at >= $${paramIndex}`);
            params.push(validated.start_date);
            paramIndex++;
        }

        if (validated.end_date) {
            conditions.push(`created_at <= $${paramIndex}`);
            params.push(validated.end_date);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');

        const [countResult, dataResult] = await Promise.all([
            query<{ count: number }>(
                `SELECT COUNT(*)::int AS count FROM credit_transactions WHERE ${whereClause}`,
                params
            ),
            query<{ amount: number; operation_type: string; reason: string | null; created_at: Date }>(
                `SELECT amount, operation_type, reason, created_at
                 FROM credit_transactions
                 WHERE ${whereClause}
                 ORDER BY created_at DESC
                 LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                [...params, limit, offset]
            ),
        ]);

        const total = countResult.rows[0]?.count ?? 0;
        const history: CreditHistoryEntry[] = dataResult.rows.map((row: { amount: number; operation_type: string; reason: string | null; created_at: Date }) => ({
            amount: row.amount,
            operation: row.operation_type as CreditHistoryEntry['operation'],
            description: row.reason,
            timestamp: row.created_at,
        }));

        return {
            history,
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
            },
        };
    }

    // Scheduled job methods
    async resetDailyCreditsForFreeUsers(): Promise<number> {
        // Free plan has 0 credits — nothing to reset
        return 0;
    }

    async resetMonthlyCreditsForStarterUsers(): Promise<number> {
        return this.resetExpiredForPlan('starter');
    }

    async resetMonthlyCreditsForAdvancedUsers(): Promise<number> {
        return this.resetExpiredForPlan('advanced');
    }

    async resetMonthlyCreditsForProdigyUsers(): Promise<number> {
        return this.resetExpiredForPlan('prodigy');
    }
}

// Singleton export
export const creditService = new CreditService();
