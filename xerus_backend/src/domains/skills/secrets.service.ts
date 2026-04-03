// Skill Secrets Service
// Business logic for per-workspace encrypted env vars for skills
// Uses workspace SQLite DB (migrated from Neon PostgreSQL)
// Uses skill_slug as the identifier

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
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
    private sandboxService: SandboxService | null = null;

    constructor(
        private readonly repository: SkillRepository = skillRepository,
        private readonly secretsRepo: SkillSecretsRepository = skillSecretsRepository,
    ) {}

    setSandboxService(svc: SandboxService): void {
        this.sandboxService = svc;
    }

    private async resolveSandbox(userId: string): Promise<{ provider: DaytonaProvider; sandboxId: string }> {
        if (!this.sandboxService) {
            throw new Error('SandboxService not configured on SkillSecretsService');
        }
        const status = await this.sandboxService.getSandboxStatus(userId);
        if (status.status !== 'running' || !status.sandboxId) {
            throw new Error(`No running sandbox for user ${userId}`);
        }
        const provider = this.sandboxService.getDaytonaProvider();
        return { provider, sandboxId: status.sandboxId };
    }

    async setSecret(skillSlug: string, secretName: string, value: string, userId: string): Promise<void> {
        await this.validateSkillAccess(skillSlug, userId);

        this.validateSecretKey(secretName);
        const valueError = validateEnvVarValue(value);
        if (valueError) {
            throw new SkillSecretInvalidValueError(secretName, valueError);
        }

        const encryptedValue = encrypt(value);
        const { provider, sandboxId } = await this.resolveSandbox(userId);
        await this.secretsRepo.upsert(provider, sandboxId, skillSlug, secretName, encryptedValue);
    }

    async deleteSecret(skillSlug: string, secretName: string, userId: string): Promise<void> {
        await this.validateSkillAccess(skillSlug, userId);

        this.validateSecretKey(secretName);
        const { provider, sandboxId } = await this.resolveSandbox(userId);
        const deleted = await this.secretsRepo.delete(provider, sandboxId, skillSlug, secretName);
        if (!deleted) {
            throw new SkillSecretNotFoundError(skillSlug, secretName);
        }
    }

    async getSecretStatuses(skillSlug: string, userId: string): Promise<SkillSecretStatus[]> {
        await this.validateSkillAccess(skillSlug, userId);

        const { provider, sandboxId } = await this.resolveSandbox(userId);
        const rows = await this.secretsRepo.getForSkill(provider, sandboxId, skillSlug);
        return rows.map(row => ({
            secret_name: row.secret_name,
            has_value: true,
            hint: maskApiKey(decrypt(row.encrypted_value)),
            updated_at: row.updated_at,
        }));
    }

    async resolveSecretsForExecution(
        provider: DaytonaProvider,
        sandboxId: string,
        skillSlugs: string[],
    ): Promise<Record<string, string>> {
        if (skillSlugs.length === 0) return {};

        const rows = await this.secretsRepo.getForSkills(provider, sandboxId, skillSlugs);
        const secrets: Record<string, string> = {};

        for (const row of rows) {
            // Defense-in-depth: re-validate at injection time
            if (isBlockedEnvKey(row.secret_name)) continue;
            if (!isValidEnvKeyFormat(row.secret_name)) continue;

            secrets[row.secret_name] = decrypt(row.encrypted_value);
        }

        return secrets;
    }

    async resolveAllSecrets(
        provider: DaytonaProvider,
        sandboxId: string,
    ): Promise<Record<string, string>> {
        const rows = await this.secretsRepo.getAll(provider, sandboxId);
        const secrets: Record<string, string> = {};

        for (const row of rows) {
            if (isBlockedEnvKey(row.secret_name)) continue;
            if (!isValidEnvKeyFormat(row.secret_name)) continue;
            secrets[row.secret_name] = decrypt(row.encrypted_value);
        }

        return secrets;
    }

    async cleanupOnUninstall(skillSlug: string, userId: string): Promise<void> {
        const isInstalled = await this.repository.isInstalled(userId, skillSlug);
        if (!isInstalled) {
            const { provider, sandboxId } = await this.resolveSandbox(userId);
            await this.secretsRepo.deleteAllForSkill(provider, sandboxId, skillSlug);
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
