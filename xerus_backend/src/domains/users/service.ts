// Users Domain Service
// User lifecycle management

import { userRepository } from './repository';
import { userValidator } from './validators';
import { UserNotFoundError } from './errors';
import type { User, UserCreateInput, UserUpdateInput, FindOrCreateResult, DeleteUserResult, PlanType } from './types';

// ===== SERVICE CLASS =====

export class UserService {
    // Note: user_id IS the Firebase UID in this schema
    async findOrCreate(input: UserCreateInput): Promise<FindOrCreateResult> {
        const validated = userValidator.validateFindOrCreate(input);

        // Check if user exists (user_id = firebase_uid)
        const existingUser = await userRepository.findById(validated.firebase_uid);

        if (existingUser) {
            // Update last login
            await userRepository.updateLastLogin(existingUser.user_id);

            // Get credit balance
            const creditBalance = await userRepository.getCreditBalance(existingUser.user_id);

            return {
                user: { ...existingUser, last_login: new Date() },
                created: false,
                credit_balance: creditBalance!,
            };
        }

        // In invite-only mode, new users start inactive (must redeem invite code)
        const isInviteOnly = process.env.INVITE_ONLY_MODE === 'true';
        const isActive = !isInviteOnly;

        // Create new user (credits initialized to plan default in repository)
        const user = await userRepository.create(validated, isActive);

        // Get credit balance
        const creditBalance = await userRepository.getCreditBalance(user.user_id);

        return {
            user,
            created: true,
            credit_balance: creditBalance!,
        };
    }

    // Note: userId IS the Firebase UID
    async getById(userId: string): Promise<User> {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new UserNotFoundError(userId);
        }
        return user;
    }

    // Alias for getById since user_id = firebase_uid
    async getByFirebaseUid(firebaseUid: string): Promise<User> {
        return this.getById(firebaseUid);
    }

    async getByEmail(email: string): Promise<User | null> {
        return userRepository.findByEmail(email);
    }

    async update(userId: string, updates: UserUpdateInput): Promise<User> {
        const validated = userValidator.validateUpdate(updates);

        // Verify user exists
        const existing = await userRepository.findById(userId);
        if (!existing) {
            throw new UserNotFoundError(userId);
        }

        return userRepository.update(userId, validated);
    }

    async delete(userId: string): Promise<DeleteUserResult> {
        // Verify user exists
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new UserNotFoundError(userId);
        }

        // Delete user and related data (credits are on user row, deleted with it)
        const cleanup = await userRepository.delete(userId);

        return {
            deleted: true,
            user_id: userId,
            cleanup,
        };
    }

    async updatePlan(userId: string, planType: PlanType): Promise<User> {
        await this.getById(userId);
        return userRepository.updatePlanType(userId, planType);
    }

    async activateUser(userId: string): Promise<User> {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new UserNotFoundError(userId);
        }
        return userRepository.setActive(userId, true);
    }

    async list(limit = 50, offset = 0): Promise<{ users: User[]; total: number }> {
        return userRepository.list(limit, offset);
    }
}

// Singleton export
export const userService = new UserService();
