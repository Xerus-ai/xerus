// Invite Codes Domain Service
// Business logic for invite code generation and redemption

import { inviteCodeRepository } from './repository';
import { inviteCodeValidator } from './validators';
import { InvalidInviteCodeError } from './errors';
import type { RedeemResult, GenerateResult, InviteCodeListResult } from './types';

// ===== SERVICE CLASS =====

export class InviteCodeService {
    static isInviteOnlyMode(): boolean {
        return process.env.INVITE_ONLY_MODE === 'true';
    }

    async redeemCode(code: string, userId: string): Promise<RedeemResult> {
        // Normalize: uppercase, strip hyphens/spaces
        const normalizedCode = code.replace(/[-\s]/g, '').toUpperCase();

        inviteCodeValidator.validateRedeem({ code: normalizedCode });

        const redeemed = await inviteCodeRepository.redeemCode(normalizedCode, userId);

        if (!redeemed) {
            throw new InvalidInviteCodeError();
        }

        return {
            activated: true,
            code: redeemed,
        };
    }

    async generateCodes(createdBy: string, count: number, expiresAt?: Date | null): Promise<GenerateResult> {
        inviteCodeValidator.validateGenerate({ count, expires_at: expiresAt });

        const codes = await inviteCodeRepository.createBatch(createdBy, count, expiresAt ?? null);

        return {
            codes,
            expires_at: expiresAt ?? null,
        };
    }

    async listCodes(limit = 50, offset = 0): Promise<InviteCodeListResult> {
        return inviteCodeRepository.list(limit, offset);
    }
}

// Singleton export
export const inviteCodeService = new InviteCodeService();
