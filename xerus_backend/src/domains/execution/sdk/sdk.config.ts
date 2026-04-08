// SDK Configuration
// Configuration for Claude Agent SDK with OpenRouter routing

import { DEFAULT_MODEL } from '../../agents/types';

export interface SDKConfig {
    openRouterBaseUrl: string;
    defaultModel: string;
    maxTurns: number;
    maxThinkingTokens: number;
    defaultAllowedTools: string[];
    persistSession: boolean;
    includePartialMessages: boolean;
    permissionMode: string;
    settingSources: string[];
}

export const SDK_CONFIG: SDKConfig = {
    // OpenRouter API endpoint
    openRouterBaseUrl: 'https://openrouter.ai/api',

    // Default model (OpenRouter format)
    defaultModel: DEFAULT_MODEL,

    // Execution limits
    maxTurns: 50,
    maxThinkingTokens: 10000,

    // Default tools available to agents
    defaultAllowedTools: [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Grep',
        'Glob',
        'Task',
        'WebFetch',
        'WebSearch',
        'TodoWrite',
    ],

    // Session handling
    persistSession: true,
    includePartialMessages: true,

    // Permission mode (we handle auth via hooks)
    permissionMode: 'bypassPermissions',

    // Load settings from workspace
    settingSources: ['project'],
};

// Prefixes that must never leak into the sandbox environment.
// XERUS_ vars contain backend secrets (DB credentials, internal tokens).
const BLOCKED_ENV_PREFIXES = ['XERUS_', 'NEON_', 'FIREBASE_', 'AWS_'] as const;

export interface UserCliKeys {
    anthropicKey?: string;
    openaiKey?: string;
}

// Build SDK environment for OpenRouter routing
// OpenRouter uses ANTHROPIC_AUTH_TOKEN for Bearer auth, ANTHROPIC_API_KEY must be empty.
// Only whitelisted env vars are passed to the sandbox — never spread process.env.
// skillSecrets: pre-validated, decrypted env vars from skill_secrets table.
// They are spread FIRST so platform vars always win (cannot be overridden by user input).
// Keys matching BLOCKED_ENV_PREFIXES are stripped from skillSecrets to prevent leaks.
// userCliKeys: optional BYOK keys for Anthropic/OpenAI from user_api_keys table.
// When present, these are injected as ANTHROPIC_API_KEY / OPENAI_API_KEY so the
// sandbox auth-detector recognizes 'api' billing instead of 'platform'.
export function buildSDKEnvironment(
    apiKey: string,
    skillSecrets?: Record<string, string>,
    userCliKeys?: UserCliKeys,
): Record<string, string> {
    const filtered: Record<string, string> = {};
    if (skillSecrets) {
        for (const [key, value] of Object.entries(skillSecrets)) {
            const upperKey = key.toUpperCase();
            const blocked = BLOCKED_ENV_PREFIXES.some(prefix => upperKey.startsWith(prefix));
            if (!blocked) {
                filtered[key] = value;
            }
        }
    }

    const env: Record<string, string> = {
        ...filtered,
        ANTHROPIC_BASE_URL: SDK_CONFIG.openRouterBaseUrl,
        // Claude CLI v2.1.91+ uses ANTHROPIC_API_KEY for auth detection.
        // ANTHROPIC_AUTH_TOKEN is no longer recognized by the CLI.
        ANTHROPIC_API_KEY: apiKey,
        XERUS_WORKSPACE_ROOT: process.env.XERUS_WORKSPACE_ROOT || '/home/daytona',
    };

    // Inject user's BYOK keys if available.
    // When ANTHROPIC_API_KEY is set, Claude Code CLI uses it directly (BYOK).
    // When OPENAI_API_KEY is set, Codex CLI uses it directly (BYOK).
    // The sandbox auth-detector checks these env vars to determine billing type.
    if (userCliKeys?.anthropicKey) {
        env.ANTHROPIC_API_KEY = userCliKeys.anthropicKey;
        // Clear OpenRouter base URL when using direct Anthropic key
        delete env.ANTHROPIC_BASE_URL;
    }
    if (userCliKeys?.openaiKey) {
        env.OPENAI_API_KEY = userCliKeys.openaiKey;
    }

    return env;
}
