// Invite Codes Domain Service
// Business logic for invite code generation and redemption

import { inviteCodeRepository } from './repository';
import { inviteCodeValidator } from './validators';
import { InvalidInviteCodeError, InviteCodeAlreadyUsedError, InviteCodeValidationError } from './errors';
import type { RedeemResult, GenerateResult, InviteCodeListResult } from './types';
import { ForbiddenError } from '../../utils/errors';

// ===== SERVICE CLASS =====

export class InviteCodeService {
    static isInviteOnlyMode(): boolean {
        return process.env.INVITE_ONLY_MODE === 'true';
    }

    async redeemCode(code: unknown, userId: string): Promise<RedeemResult> {
        // Guard: code must be a string before normalize
        if (typeof code !== 'string') {
            throw new InviteCodeValidationError([{ field: 'code', message: 'Code must be a string' }]);
        }

        // Normalize: uppercase, strip hyphens/spaces
        const normalizedCode = code.replace(/[-\s]/g, '').toUpperCase();

        inviteCodeValidator.validateRedeem({ code: normalizedCode });

        // Check if user was previously activated then banned — prevent reactivation
        const previouslyRedeemed = await inviteCodeRepository.hasUserRedeemedBefore(userId);
        if (previouslyRedeemed) {
            throw new ForbiddenError('Account has been suspended');
        }

        // Try atomic redeem first
        const redeemed = await inviteCodeRepository.redeemCode(normalizedCode, userId);

        if (!redeemed) {
            // Classify the error for better UX
            const existing = await inviteCodeRepository.findByCode(normalizedCode);
            if (existing && existing.is_used) {
                throw new InviteCodeAlreadyUsedError();
            }
            // Code not found or expired — same error
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
