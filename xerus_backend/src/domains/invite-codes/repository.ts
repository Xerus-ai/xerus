// Invite Codes Domain Repository
// Database operations for invite code management

import crypto from 'crypto';
import { query, transaction } from '../../database/connection';
import { PoolClient } from 'pg';
import type { InviteCode, InviteCodeRow } from './types';
import { UserNotFoundError } from '../users/errors';

// Ambiguity-free charset: no 0/O, 1/I/L
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CHARSET_LEN = CHARSET.length; // 31
const MAX_BYTE = CHARSET_LEN * Math.floor(256 / CHARSET_LEN); // 248 — eliminates modulo bias

// ===== HELPERS =====

function mapInviteCodeRow(row: InviteCodeRow): InviteCode {
    return {
        id: row.id,
        code: row.code,
        created_by: row.created_by,
        used_by: row.used_by,
        used_at: row.used_at,
        expires_at: row.expires_at,
        is_used: row.is_used,
        created_at: row.created_at,
    };
}

// Rejection sampling: discard bytes >= MAX_BYTE to eliminate modulo bias
function generateCode(): string {
    const result: string[] = [];
    while (result.length < 8) {
        const [byte] = crypto.randomBytes(1);
        if (byte < MAX_BYTE) {
            result.push(CHARSET[byte % CHARSET_LEN]);
        }
    }
    return result.join('');
}

// ===== REPOSITORY CLASS =====

export class InviteCodeRepository {
    // Atomic redeem: UPDATE only if code is valid, unused, and not expired.
    // Cross-domain write on users table is intentional — transaction atomicity
    // requires both the code mark-used and user activation to succeed or fail together.
    async redeemCode(code: string, userId: string): Promise<InviteCode | null> {
        return transaction(async (client: PoolClient) => {
            // Atomic UPDATE on invite code
            const codeResult = await client.query<InviteCodeRow>(
                `UPDATE invite_codes
                 SET is_used = true, used_by = $2, used_at = NOW()
                 WHERE code = $1 AND NOT is_used AND (expires_at IS NULL OR expires_at > NOW())
                 RETURNING *`,
                [code, userId]
            );

            if (codeResult.rows.length === 0) {
                return null;
            }

            // Activate user in same transaction
            const userResult = await client.query(
                'UPDATE users SET is_active = true, updated_at = NOW() WHERE user_id = $1',
                [userId]
            );

            if (userResult.rowCount === 0) {
                throw new UserNotFoundError(userId);
            }

            return mapInviteCodeRow(codeResult.rows[0]);
        });
    }

    // Check if a user has previously redeemed an invite code (for banned-user detection)
    async hasUserRedeemedBefore(userId: string): Promise<boolean> {
        const result = await query<{ exists: boolean }>(
            'SELECT EXISTS(SELECT 1 FROM invite_codes WHERE used_by = $1 AND is_used = true) as exists',
            [userId]
        );
        return result.rows[0]?.exists ?? false;
    }

    // Batch INSERT in a single transaction — no N+1
    async createBatch(createdBy: string, count: number, expiresAt: Date | null): Promise<string[]> {
        const codes = Array.from({ length: count }, () => generateCode());

        return transaction(async (client: PoolClient) => {
            const values: unknown[] = [];
            const placeholders: string[] = [];

            codes.forEach((code, i) => {
                const offset = i * 3;
                placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
                values.push(code, createdBy, expiresAt);
            });

            await client.query(
                `INSERT INTO invite_codes (code, created_by, expires_at) VALUES ${placeholders.join(', ')}`,
                values
            );

            return codes;
        });
    }

    async findByCode(code: string): Promise<InviteCode | null> {
        const result = await query<InviteCodeRow>(
            'SELECT * FROM invite_codes WHERE code = $1',
            [code]
        );
        return result.rows[0] ? mapInviteCodeRow(result.rows[0]) : null;
    }

    async list(limit = 50, offset = 0): Promise<{ codes: InviteCode[]; total: number }> {
        const result = await query<InviteCodeRow & { total_count: string }>(
            `SELECT *, COUNT(*) OVER() as total_count
             FROM invite_codes
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const total = result.rows[0] ? parseInt(result.rows[0].total_count, 10) : 0;

        return {
            codes: result.rows.map(mapInviteCodeRow),
            total,
        };
    }
}

// Singleton export
export const inviteCodeRepository = new InviteCodeRepository();
