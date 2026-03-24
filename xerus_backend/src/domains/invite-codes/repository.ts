// Invite Codes Domain Repository
// Database operations for invite code management

import crypto from 'crypto';
import { query, transaction } from '../../database/connection';
import { PoolClient } from 'pg';
import type { InviteCode, InviteCodeRow } from './types';

// Ambiguity-free charset: no 0/O, 1/I/L
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

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

function generateCode(): string {
    const bytes = crypto.randomBytes(8);
    return Array.from(bytes)
        .map(b => CHARSET[b % CHARSET.length])
        .join('');
}

// ===== REPOSITORY CLASS =====

export class InviteCodeRepository {
    // Atomic redeem: UPDATE only if code is valid, unused, and not expired.
    // Returns null if code is invalid/used/expired (no race condition).
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
            await client.query(
                'UPDATE users SET is_active = true, updated_at = NOW() WHERE user_id = $1',
                [userId]
            );

            return mapInviteCodeRow(codeResult.rows[0]);
        });
    }

    async createBatch(createdBy: string, count: number, expiresAt: Date | null): Promise<string[]> {
        const codes: string[] = [];

        for (let i = 0; i < count; i++) {
            const code = generateCode();
            await query<InviteCodeRow>(
                `INSERT INTO invite_codes (code, created_by, expires_at)
                 VALUES ($1, $2, $3)`,
                [code, createdBy, expiresAt]
            );
            codes.push(code);
        }

        return codes;
    }

    async findByCode(code: string): Promise<InviteCode | null> {
        const result = await query<InviteCodeRow>(
            'SELECT * FROM invite_codes WHERE code = $1',
            [code]
        );
        return result.rows[0] ? mapInviteCodeRow(result.rows[0]) : null;
    }

    async list(limit = 50, offset = 0): Promise<{ codes: InviteCode[]; total: number }> {
        const countResult = await query<{ count: string }>('SELECT COUNT(*) as count FROM invite_codes');
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await query<InviteCodeRow>(
            'SELECT * FROM invite_codes ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        return {
            codes: result.rows.map(mapInviteCodeRow),
            total,
        };
    }
}

// Singleton export
export const inviteCodeRepository = new InviteCodeRepository();
