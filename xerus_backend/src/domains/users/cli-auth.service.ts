// CLI Auth Detection Service
// Detects CLI authentication status by checking credential files on sandbox
// and API keys in database
//
// Detection priority for Claude Code:
// 1. ~/.claude/.credentials.json on sandbox -> "subscription"
// 2. ANTHROPIC_API_KEY from user_api_keys -> "api" (BYOK)
// 3. Neither -> "platform" (OpenRouter)
//
// Detection priority for Codex:
// 1. ~/.codex/auth.json on sandbox -> "subscription"
// 2. OPENAI_API_KEY from user_api_keys -> "api" (BYOK)
// 3. Neither -> "platform" (OpenRouter)

import { userRepository } from './repository';
import { decrypt } from '../../utils/encryption';
import { shellEscapePath } from '../../utils/shell-safety';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { logger } from '../../utils/logger';

const log = logger('CLIAuthService');

export type AuthMethod = 'subscription' | 'api' | 'platform';

// -----------------------------------------------------------------------------
// Discriminated Union Types for Fail-Fast
// -----------------------------------------------------------------------------

/**
 * Result of checking sandbox file existence.
 * Uses discriminated union to make error states explicit without throwing.
 */
export type SandboxFileCheckResult =
    | { status: 'found' }
    | { status: 'not_found' }
    | { status: 'unavailable'; reason: 'no_sandbox_service' | 'no_running_sandbox' | 'sandbox_access_error'; error?: string };

/**
 * Result of checking user API key existence.
 * Uses discriminated union to make error states explicit without throwing.
 */
export type ApiKeyCheckResult =
    | { status: 'found' }
    | { status: 'not_found' }
    | { status: 'unavailable'; reason: 'key_not_found' | 'decryption_failed' | 'query_error'; error?: string };

export interface CLIAuthResult {
    authenticated: boolean;
    method: AuthMethod;
    details: string;
}

export interface CLIAuthStatus {
    claudecode: CLIAuthResult;
    codex: CLIAuthResult;
}

const CLAUDE_CREDENTIALS_PATH = '~/.claude/.credentials.json';
const CODEX_AUTH_PATH = '~/.codex/auth.json';

export class CLIAuthService {
    private sandboxService: SandboxService | null = null;

    setSandboxService(sandboxService: SandboxService): void {
        this.sandboxService = sandboxService;
    }

    async fetchAuthStatus(userId: string): Promise<CLIAuthStatus> {
        const [claudeAuth, codexAuth] = await Promise.all([
            this.detectClaudeAuth(userId),
            this.detectCodexAuth(userId),
        ]);

        return {
            claudecode: claudeAuth,
            codex: codexAuth,
        };
    }

    private async detectClaudeAuth(userId: string): Promise<CLIAuthResult> {
        // 1. Check credentials file on sandbox (subscription)
        const credentialsCheck = await this.checkSandboxFile(userId, CLAUDE_CREDENTIALS_PATH);
        if (credentialsCheck.status === 'found') {
            return {
                authenticated: true,
                method: 'subscription',
                details: 'Authenticated via Claude subscription',
            };
        }

        // 2. Check user_api_keys for anthropic provider (BYOK)
        const apiKeyCheck = await this.checkUserApiKey(userId, 'anthropic');
        if (apiKeyCheck.status === 'found') {
            return {
                authenticated: true,
                method: 'api',
                details: 'Using Anthropic API key (BYOK)',
            };
        }

        // 3. Neither -> platform billing via OpenRouter
        // Include diagnostic info about why other methods weren't available
        let details = 'Using OpenRouter (platform billing)';
        if (credentialsCheck.status === 'unavailable') {
            details += ` [sandbox: ${credentialsCheck.reason}]`;
        }
        if (apiKeyCheck.status === 'unavailable') {
            details += ` [api_key: ${apiKeyCheck.reason}]`;
        }

        return {
            authenticated: false,
            method: 'platform',
            details,
        };
    }

    private async detectCodexAuth(userId: string): Promise<CLIAuthResult> {
        // 1. Check auth file on sandbox (subscription)
        const authFileCheck = await this.checkSandboxFile(userId, CODEX_AUTH_PATH);
        if (authFileCheck.status === 'found') {
            return {
                authenticated: true,
                method: 'subscription',
                details: 'Authenticated via OpenAI subscription',
            };
        }

        // 2. Check user_api_keys for openai provider (BYOK)
        const apiKeyCheck = await this.checkUserApiKey(userId, 'openai');
        if (apiKeyCheck.status === 'found') {
            return {
                authenticated: true,
                method: 'api',
                details: 'Using OpenAI API key (BYOK)',
            };
        }

        // 3. Neither -> platform billing via OpenRouter
        // Include diagnostic info about why other methods weren't available
        let details = 'Using OpenRouter (platform billing)';
        if (authFileCheck.status === 'unavailable') {
            details += ` [sandbox: ${authFileCheck.reason}]`;
        }
        if (apiKeyCheck.status === 'unavailable') {
            details += ` [api_key: ${apiKeyCheck.reason}]`;
        }

        return {
            authenticated: false,
            method: 'platform',
            details,
        };
    }

    private async checkSandboxFile(userId: string, filePath: string): Promise<SandboxFileCheckResult> {
        if (!this.sandboxService) {
            return { status: 'unavailable', reason: 'no_sandbox_service' };
        }

        const session = this.sandboxService.getSession(userId);
        if (!session || session.status !== 'running') {
            return { status: 'unavailable', reason: 'no_running_sandbox' };
        }

        try {
            const provider = this.sandboxService.getDaytonaProvider();
            // Expand ~ to home directory and escape path for safe shell execution
            const expandedPath = filePath.replace(/^~/, '/home/daytona');
            const escapedPath = shellEscapePath(expandedPath);
            const result = await provider.executeCommand(
                session.sandboxId,
                `test -f ${escapedPath} && echo EXISTS || echo MISSING`,
            );

            const exists = (result.result || '').trim() === 'EXISTS';
            return exists ? { status: 'found' } : { status: 'not_found' };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.warn('Failed to check sandbox file', { file_path: filePath, user_id: userId, error: errorMessage });
            return { status: 'unavailable', reason: 'sandbox_access_error', error: errorMessage };
        }
    }

    private async checkUserApiKey(userId: string, apiProvider: 'anthropic' | 'openai'): Promise<ApiKeyCheckResult> {
        try {
            const key = await userRepository.getApiKey(userId, apiProvider);
            if (!key) {
                return { status: 'not_found' };
            }

            // Verify key can be decrypted (not corrupted)
            try {
                const decrypted = decrypt(key.api_key_encrypted);
                return decrypted.length > 0 ? { status: 'found' } : { status: 'not_found' };
            } catch (decryptError) {
                const errorMessage = decryptError instanceof Error ? decryptError.message : String(decryptError);
                log.warn('Failed to decrypt API key', { user_id: userId, provider: apiProvider, error: errorMessage });
                return { status: 'unavailable', reason: 'decryption_failed', error: errorMessage };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.warn('Failed to check API key', { user_id: userId, provider: apiProvider, error: errorMessage });
            return { status: 'unavailable', reason: 'query_error', error: errorMessage };
        }
    }
    /**
     * Trigger CLI auth login in the user's sandbox.
     * Runs the login command in background, waits briefly, and captures the auth URL.
     */
    async triggerLogin(userId: string, adapter: 'claudecode' | 'codex'): Promise<{ authUrl: string | null; message: string }> {
        if (!this.sandboxService) {
            return { authUrl: null, message: 'Sandbox service not available. Please start a chat first.' };
        }

        const session = this.sandboxService.getSession(userId);
        if (!session || session.status !== 'running') {
            return { authUrl: null, message: 'Your sandbox is not running. Please start a chat first to provision your environment.' };
        }

        const provider = this.sandboxService.getDaytonaProvider();
        const cliCommand = adapter === 'claudecode' ? 'claude' : 'codex';

        // Run auth login in background, capture output after a brief wait
        const script = [
            `rm -f /tmp/xerus-auth-${adapter}.log`,
            `nohup bash -c '${cliCommand} auth login > /tmp/xerus-auth-${adapter}.log 2>&1' &`,
            `sleep 4`,
            `cat /tmp/xerus-auth-${adapter}.log 2>/dev/null || echo 'Waiting for auth output...'`,
        ].join(' && ');

        try {
            const result = await provider.executeCommand(session.sandboxId, script);
            const output = result.result || '';

            // Parse any URL from the output (OAuth redirect URL)
            const urlMatch = output.match(/https?:\/\/[^\s"'<>]+/);
            return {
                authUrl: urlMatch ? urlMatch[0] : null,
                message: urlMatch
                    ? 'Please complete authentication in the opened tab.'
                    : output.trim() || 'Auth process started. Check your sandbox terminal for prompts.',
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.warn('Failed to trigger auth', { adapter, user_id: userId, error: errorMessage });
            return { authUrl: null, message: `Failed to start auth: ${errorMessage}` };
        }
    }
}

// Singleton export
export const cliAuthService = new CLIAuthService();
