// Skill Secrets Service
// Business logic for per-user encrypted env vars for skills
// Uses skill_slug as the identifier

import type { SkillSecretStatus } from './types';
import {
    SkillNotFoundError,
    SkillAccessDeniedError,
    SkillSecretNotFoundError,
    SkillSecretBlockedKeyError,
    SkillSecretInvalidKeyError,
    SkillSecretInvalidValueError,
} from './errors';
import { encrypt, decrypt, maskApiKey } from '../../utils/encryption';
import { isBlockedEnvKey, isValidEnvKeyFormat, validateEnvVarValue } from './blocked-env-keys';
import { canUserViewSkill } from './skill-access';
import { SkillRepository, skillRepository } from './repository';
import { SkillSecretsRepository, skillSecretsRepository } from './secrets.repository';

export class SkillSecretsService {
    constructor(
        private readonly repository: SkillRepository = skillRepository,
        private readonly secretsRepo: SkillSecretsRepository = skillSecretsRepository,
    ) {}

    async setSecret(skillSlug: string, envKey: string, value: string, userId: string): Promise<void> {
        await this.validateSkillAccess(skillSlug, userId);

        this.validateSecretKey(envKey);
        const valueError = validateEnvVarValue(value);
        if (valueError) {
            throw new SkillSecretInvalidValueError(envKey, valueError);
        }

        const encryptedValue = encrypt(value);
        const hint = maskApiKey(value);
        await this.secretsRepo.upsert(userId, skillSlug, envKey, encryptedValue, hint);
    }

    async deleteSecret(skillSlug: string, envKey: string, userId: string): Promise<void> {
        await this.validateSkillAccess(skillSlug, userId);

        this.validateSecretKey(envKey);
        const deleted = await this.secretsRepo.delete(userId, skillSlug, envKey);
        if (!deleted) {
            throw new SkillSecretNotFoundError(skillSlug, envKey);
        }
    }

    async getSecretStatuses(skillSlug: string, userId: string): Promise<SkillSecretStatus[]> {
        await this.validateSkillAccess(skillSlug, userId);

        const rows = await this.secretsRepo.getForSkill(userId, skillSlug);
        return rows.map(row => ({
            env_key: row.env_key,
            has_value: true,
            hint: row.hint,
            updated_at: row.updated_at,
        }));
    }

    async resolveSecretsForExecution(userId: string, skillSlugs: string[]): Promise<Record<string, string>> {
        if (skillSlugs.length === 0) return {};

        const rows = await this.secretsRepo.getForSkills(userId, skillSlugs);
        const secrets: Record<string, string> = {};

        for (const row of rows) {
            // Defense-in-depth: re-validate at injection time
            if (isBlockedEnvKey(row.env_key)) continue;
            if (!isValidEnvKeyFormat(row.env_key)) continue;

            secrets[row.env_key] = decrypt(row.encrypted_value);
        }

        return secrets;
    }

    async resolveAllSecrets(userId: string): Promise<Record<string, string>> {
        const rows = await this.secretsRepo.getAllForUser(userId);
        const secrets: Record<string, string> = {};

        for (const row of rows) {
            if (isBlockedEnvKey(row.env_key)) continue;
            if (!isValidEnvKeyFormat(row.env_key)) continue;
            secrets[row.env_key] = decrypt(row.encrypted_value);
        }

        return secrets;
    }

    async cleanupOnUninstall(skillSlug: string, userId: string): Promise<void> {
        const isInstalled = await this.repository.isInstalled(userId, skillSlug);
        if (!isInstalled) {
            await this.secretsRepo.deleteAllForSkill(userId, skillSlug);
        }
    }

    private async validateSkillAccess(skillSlug: string, userId: string): Promise<void> {
        const skill = await this.repository.findBySlug(userId, skillSlug);
        if (!skill) {
            throw new SkillNotFoundError(skillSlug);
        }
        if (!canUserViewSkill(skill, userId)) {
            throw new SkillAccessDeniedError(skillSlug);
        }
    }

    private validateSecretKey(key: string): void {
        if (!isValidEnvKeyFormat(key)) {
            throw new SkillSecretInvalidKeyError(key, 'Must be uppercase alphanumeric with underscores, starting with a letter');
        }
        if (isBlockedEnvKey(key)) {
            throw new SkillSecretBlockedKeyError(key);
        }
    }
}

export const skillSecretsService = new SkillSecretsService();
