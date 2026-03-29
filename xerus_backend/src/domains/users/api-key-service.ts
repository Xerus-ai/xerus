// Users Domain API Key Service
// Provider API key management with encryption

import { userRepository } from './repository';
import { userValidator } from './validators';
import { encrypt, decrypt } from '../../utils/encryption';
import { InvalidApiProviderError, ApiKeyNotFoundError, ApiKeyEncryptionError } from './errors';
import type { ApiProvider, ApiKeyStatus, ApiKeySetInput } from './types';
import { VALID_API_PROVIDERS } from './types';

// ===== ENVIRONMENT KEY MAPPING =====

const ENV_KEY_MAP: Record<ApiProvider, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    daytona: 'DAYTONA_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
};

function hasEnvKey(provider: ApiProvider): boolean {
    return !!process.env[ENV_KEY_MAP[provider]];
}

function getKeyHint(apiKey: string): string {
    if (apiKey.length <= 8) {
        return '***';
    }
    return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
}

// ===== SERVICE CLASS =====

export class ApiKeyService {
    async getStatus(userId: string): Promise<{
        user_id: string;
        status: Record<ApiProvider, ApiKeyStatus>;
        summary: {
            configured: number;
            total: number;
            completion_percentage: number;
        };
    }> {
        const keys = await userRepository.getApiKeys(userId);
        const savedProviders = new Set(keys.map(k => k.provider));

        const status: Record<ApiProvider, ApiKeyStatus> = {} as Record<ApiProvider, ApiKeyStatus>;

        for (const provider of VALID_API_PROVIDERS) {
            const savedKey = keys.find(k => k.provider === provider);
            const hasEnv = hasEnvKey(provider);
            const isSet = savedProviders.has(provider) || hasEnv;

            // Generate key hint from encrypted key if available
            let keyHint: string | null = null;
            if (savedKey) {
                try {
                    const decrypted = decrypt(savedKey.api_key_encrypted);
                    keyHint = getKeyHint(decrypted);
                } catch {
                    keyHint = '***';
                }
            }

            status[provider] = {
                provider,
                is_set: isSet,
                key_hint: keyHint,
            };
        }

        const configured = Object.values(status).filter(s => s.is_set).length;
        const total = VALID_API_PROVIDERS.length;

        return {
            user_id: userId,
            status,
            summary: {
                configured,
                total,
                completion_percentage: Math.round((configured / total) * 100),
            },
        };
    }

    async set(userId: string, input: ApiKeySetInput): Promise<ApiKeyStatus> {
        const validated = userValidator.validateApiKeySet(input);

        if (!VALID_API_PROVIDERS.includes(validated.provider as ApiProvider)) {
            throw new InvalidApiProviderError(validated.provider);
        }

        let encryptedKey: string;
        try {
            encryptedKey = encrypt(validated.api_key);
        } catch (error) {
            console.error('[API KEY SERVICE] Encryption failed:', error);
            throw new ApiKeyEncryptionError('encrypt');
        }

        const keyHint = getKeyHint(validated.api_key);
        await userRepository.saveApiKey(userId, validated.provider as ApiProvider, encryptedKey);

        return {
            provider: validated.provider as ApiProvider,
            is_set: true,
            key_hint: keyHint,
        };
    }

    async get(userId: string, provider: ApiProvider): Promise<string | null> {
        if (!VALID_API_PROVIDERS.includes(provider)) {
            throw new InvalidApiProviderError(provider);
        }

        const key = await userRepository.getApiKey(userId, provider);

        if (!key) {
            return null;
        }

        try {
            return decrypt(key.api_key_encrypted);
        } catch (error) {
            console.error(`[API KEY SERVICE] Decryption failed for ${provider}:`, error);
            throw new ApiKeyEncryptionError('decrypt');
        }
    }

    async delete(userId: string, provider: ApiProvider): Promise<boolean> {
        if (!VALID_API_PROVIDERS.includes(provider)) {
            throw new InvalidApiProviderError(provider);
        }

        const deleted = await userRepository.deleteApiKey(userId, provider);
        if (!deleted) {
            throw new ApiKeyNotFoundError(provider);
        }

        return true;
    }

    async deleteAll(userId: string): Promise<number> {
        return userRepository.deleteAllApiKeys(userId);
    }

    async validate(userId: string, provider: ApiProvider): Promise<boolean> {
        if (!VALID_API_PROVIDERS.includes(provider)) {
            throw new InvalidApiProviderError(provider);
        }

        const apiKey = await this.get(userId, provider);
        if (!apiKey) {
            return false;
        }

        // Simple validation: key exists and has content
        // Full provider-specific validation would require API calls
        return apiKey.length > 0;
    }

    async getEffectiveKey(userId: string, provider: ApiProvider): Promise<string | null> {
        // First try user's key
        const userKey = await this.get(userId, provider);
        if (userKey) {
            return userKey;
        }

        // Fall back to environment key
        return process.env[ENV_KEY_MAP[provider]] || null;
    }

    isValidProvider(provider: string): provider is ApiProvider {
        return VALID_API_PROVIDERS.includes(provider as ApiProvider);
    }
}

// Singleton export
export const apiKeyService = new ApiKeyService();
