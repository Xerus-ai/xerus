// Key Resolver Service
// Resolves API keys for execution with priority:
// 1. User's own key (BYOK) — stored encrypted in user_api_keys
// 2. Platform key — if user.platform_key_access is true
// 3. Throw — no key available

import { query } from '../../database/connection';
import { decrypt } from '../../utils/encryption';
import { DomainError } from '../../utils/errors';
import type { ApiProvider } from '../users/types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type KeySource = 'byok' | 'platform';

export interface ResolvedKey {
    apiKey: string;
    source: KeySource;
    provider: ApiProvider;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class NoApiKeyError extends DomainError {
    public readonly userId: string;
    public readonly provider: ApiProvider;

    constructor(userId: string, provider: ApiProvider) {
        super(
            `No API key available for provider '${provider}'. Configure your own key or contact support for platform access.`,
            402,
            'NO_API_KEY_AVAILABLE',
        );
        this.userId = userId;
        this.provider = provider;
    }
}

// -----------------------------------------------------------------------------
// Resolver
// Single query fetches both user key + platform_key_access atomically.
// Priority: user BYOK key > platform key (if access enabled) > throw.
// -----------------------------------------------------------------------------

interface KeyResolutionRow {
    platform_key_access: boolean;
    api_key_encrypted: string | null;
}

const ENV_KEY_MAP: Record<ApiProvider, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    daytona: 'DAYTONA_API_KEY',
};

export async function resolveApiKey(
    userId: string,
    provider: ApiProvider,
): Promise<ResolvedKey> {
    // Single JOIN query: get user's BYOK key + platform access flag in one round-trip
    const result = await query<KeyResolutionRow>(
        `SELECT u.platform_key_access, k.api_key_encrypted
         FROM users u
         LEFT JOIN user_api_keys k ON k.user_id = u.user_id AND k.provider = $2
         WHERE u.user_id = $1`,
        [userId, provider],
    );

    if (result.rows.length === 0) {
        throw new DomainError(`User '${userId}' not found`, 404, 'USER_NOT_FOUND');
    }

    const row = result.rows[0];

    // Priority 1: User's own key (BYOK)
    if (row.api_key_encrypted) {
        try {
            const apiKey = decrypt(row.api_key_encrypted);
            return { apiKey, source: 'byok', provider };
        } catch (err) {
            throw new DomainError(
                `Failed to decrypt stored API key for provider '${provider}': ${(err as Error).message}`,
                500,
                'API_KEY_DECRYPT_FAILED',
            );
        }
    }

    // Priority 2: Platform key (gated by platform_key_access)
    if (row.platform_key_access) {
        const envVar = ENV_KEY_MAP[provider];
        const platformKey = process.env[envVar];
        if (!platformKey) {
            // Server misconfiguration: user expects platform key but env var is missing
            throw new DomainError(
                `Platform key for provider '${provider}' is not configured (missing ${envVar})`,
                500,
                'PLATFORM_KEY_NOT_CONFIGURED',
            );
        }
        return { apiKey: platformKey, source: 'platform', provider };
    }

    // Priority 3: No key available — user has no BYOK key and no platform access
    throw new NoApiKeyError(userId, provider);
}
