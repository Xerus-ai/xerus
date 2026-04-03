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

    // Tracks pending auth sessions so we can deliver the callback code later
    private pendingAuth = new Map<string, { redirectUri: string; localPort: number; timestamp: number }>();

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
     *
     * The CLI starts a local OAuth server inside the sandbox. Since the user's browser
     * can't reach that localhost, we also store the redirect_uri so that completeLogin()
     * can deliver the auth code via curl inside the sandbox.
     */
    async triggerLogin(userId: string, adapter: 'claudecode' | 'codex'): Promise<{
        authUrl: string | null;
        message: string;
        needsCode: boolean;
        deviceCode?: string;
    }> {
        if (!this.sandboxService) {
            return { authUrl: null, message: 'Sandbox service not available. Please start a chat first.', needsCode: false };
        }

        const session = this.sandboxService.getSession(userId);
        if (!session || session.status !== 'running') {
            return { authUrl: null, message: 'Your sandbox is not running. Please start a chat first to provision your environment.', needsCode: false };
        }

        const provider = this.sandboxService.getDaytonaProvider();

        // Codex supports --device-auth for headless/remote environments (no localhost callback needed).
        // Claude Code doesn't have this — it uses localhost OAuth which we handle via code paste.
        const loginCommand = adapter === 'codex' ? 'codex login --device-auth' : 'claude auth login';

        // Run auth login in background, capture output after a brief wait.
        // The nohup & must be in a subshell so the && chain continues correctly.
        // Without the subshell, `& &&` is a syntax error in sh/dash.
        const logFile = `/tmp/xerus-auth-${adapter}.log`;
        const script = `rm -f ${logFile} && (nohup ${loginCommand} > ${logFile} 2>&1 &) && sleep 4 && cat ${logFile} 2>/dev/null || echo 'Waiting for auth output...'`;

        try {
            const result = await provider.executeCommand(session.sandboxId, script);
            const output = result.result || '';

            // Device auth flow (Codex --device-auth): outputs a URL and a user code.
            // e.g. "Visit https://auth.openai.com/activate and enter code: ABCD-EFGH"
            if (adapter === 'codex') {
                return this.parseDeviceAuthOutput(output, userId, adapter);
            }

            // Standard OAuth flow (Claude): outputs external auth URL + starts localhost server.
            return this.parseOAuthOutput(output, userId, adapter);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.warn('Failed to trigger auth', { adapter, user_id: userId, error: errorMessage });
            return { authUrl: null, message: `Failed to start auth: ${errorMessage}`, needsCode: false };
        }
    }

    /**
     * Parse device auth output (Codex --device-auth).
     * The CLI outputs a URL to visit and a code to enter. No localhost callback needed.
     * The CLI process keeps running in background and auto-detects when the user completes auth.
     */
    private parseDeviceAuthOutput(output: string, userId: string, adapter: 'claudecode' | 'codex'): {
        authUrl: string | null;
        message: string;
        needsCode: boolean;
        deviceCode?: string;
    } {
        // Extract the activation URL
        const allUrls = output.match(/https?:\/\/[^\s"'<>]+/g) || [];
        const authUrl = allUrls.find(u => !u.includes('localhost') && !u.includes('127.0.0.1')) || null;

        // Extract the device code (e.g. "ABCD-EFGH" or "enter code: XXXX-XXXX")
        const codeMatch = output.match(/code[:\s]+([A-Z0-9]{4}-[A-Z0-9]{4})/i)
            || output.match(/:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);
        const deviceCode = codeMatch ? codeMatch[1] : undefined;

        log.info('Device auth triggered', { adapter, user_id: userId, has_url: !!authUrl, has_code: !!deviceCode });

        if (authUrl && deviceCode) {
            return {
                authUrl,
                needsCode: false, // No code paste needed — CLI auto-detects completion
                deviceCode,
                message: `Visit the link and enter code: ${deviceCode}`,
            };
        }

        // Fallback if parsing fails
        return {
            authUrl,
            needsCode: false,
            message: output.trim() || 'Device auth started. Check the opened tab.',
        };
    }

    /**
     * Parse standard OAuth output (Claude auth login).
     * The CLI outputs an external auth URL and starts a localhost callback server.
     * Since the sandbox's localhost isn't reachable from the browser, we store the
     * redirect_uri so the user can paste the code back via completeLogin().
     */
    private parseOAuthOutput(output: string, userId: string, adapter: 'claudecode' | 'codex'): {
        authUrl: string | null;
        message: string;
        needsCode: boolean;
    } {
        // Extract ALL URLs from CLI output
        const allUrls = output.match(/https?:\/\/[^\s"'<>]+/g) || [];

        // Prefer external (non-localhost) HTTPS URLs — these are the OAuth authorization URLs.
        // Localhost URLs are the CLI's internal callback server (useless outside the sandbox).
        const externalUrl = allUrls.find(u => !u.includes('localhost') && !u.includes('127.0.0.1'));
        const localhostUrl = allUrls.find(u => u.includes('localhost') || u.includes('127.0.0.1'));

        // Extract redirect_uri and local port for later code delivery
        const redirectUri = externalUrl ? this.extractRedirectUri(externalUrl) : null;
        const localPort = this.extractLocalhostPort(localhostUrl || redirectUri || '');

        if (localPort) {
            this.pendingAuth.set(`${userId}:${adapter}`, {
                redirectUri: redirectUri || `http://localhost:${localPort}`,
                localPort,
                timestamp: Date.now(),
            });
            log.info('Stored pending auth', { adapter, user_id: userId, local_port: localPort, has_redirect_uri: !!redirectUri });
        }

        const authUrl = externalUrl || null;
        return {
            authUrl,
            needsCode: !!authUrl,
            message: authUrl
                ? 'Authenticate in the opened tab, then paste the code from the URL back here.'
                : output.trim() || 'Auth process started. Check your sandbox terminal for prompts.',
        };
    }

    /**
     * Complete a pending CLI auth by delivering the OAuth callback code to the CLI's
     * local server inside the sandbox.
     *
     * The user authenticates in the browser, gets redirected to localhost (which fails),
     * then pastes the code or full URL from their browser address bar.
     * We deliver it to the CLI via curl inside the sandbox.
     */
    async completeLogin(
        userId: string,
        adapter: 'claudecode' | 'codex',
        codeOrUrl: string,
    ): Promise<{ success: boolean; message: string }> {
        if (!this.sandboxService) {
            return { success: false, message: 'Sandbox service not available.' };
        }

        const session = this.sandboxService.getSession(userId);
        if (!session || session.status !== 'running') {
            return { success: false, message: 'Sandbox not running.' };
        }

        const pending = this.pendingAuth.get(`${userId}:${adapter}`);
        if (!pending) {
            return { success: false, message: 'No pending auth session. Click Login first to start the flow.' };
        }

        // Expire stale sessions (10 minutes)
        if (Date.now() - pending.timestamp > 10 * 60 * 1000) {
            this.pendingAuth.delete(`${userId}:${adapter}`);
            return { success: false, message: 'Auth session expired. Please click Login again.' };
        }

        const provider = this.sandboxService.getDaytonaProvider();
        const input = codeOrUrl.trim();

        try {
            // Determine the callback URL to hit inside the sandbox.
            // The user may paste:
            //   (a) The full failed redirect URL: http://localhost:7775/oauth/callback?code=XYZ
            //   (b) Just the code: ugWZFfyiMSIhfgJkHZO9ZapKLvGwSyRkvmKUGDcoe1tl4lfq
            let callbackUrl: string;

            if (input.startsWith('http://localhost') || input.startsWith('http://127.0.0.1')) {
                // User pasted the full redirect URL — use it directly inside the sandbox
                callbackUrl = input;
            } else {
                // User pasted just the code — reconstruct the callback URL
                const redirectUri = pending.redirectUri;
                const separator = redirectUri.includes('?') ? '&' : '?';
                callbackUrl = `${redirectUri}${separator}code=${encodeURIComponent(input)}`;
            }

            log.info('Delivering auth callback to sandbox', {
                adapter,
                user_id: userId,
                port: pending.localPort,
                callback_url_prefix: callbackUrl.substring(0, 60),
            });

            // Deliver the callback to the CLI's local server inside the sandbox
            await provider.executeCommand(
                session.sandboxId,
                `curl -sL "${callbackUrl}" -o /dev/null -w "%{http_code}" 2>&1 || echo "curl_failed"`,
            );

            // Wait for the CLI to exchange the code for tokens and write credentials
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Verify credentials were written
            const status = await this.fetchAuthStatus(userId);
            const authResult = adapter === 'claudecode' ? status.claudecode : status.codex;

            this.pendingAuth.delete(`${userId}:${adapter}`);

            if (authResult.authenticated && authResult.method === 'subscription') {
                return { success: true, message: 'Authentication successful! Connected via subscription.' };
            }

            return {
                success: false,
                message: 'Code delivered but credentials not detected yet. The CLI may still be processing — try refreshing in a few seconds.',
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.warn('Failed to complete auth', { adapter, user_id: userId, error: errorMessage });
            return { success: false, message: `Failed to complete auth: ${errorMessage}` };
        }
    }

    /**
     * Extract redirect_uri from an OAuth authorization URL.
     */
    private extractRedirectUri(authUrl: string): string | null {
        try {
            const url = new URL(authUrl);
            return url.searchParams.get('redirect_uri');
        } catch {
            const match = authUrl.match(/redirect_uri=([^&]+)/);
            return match ? decodeURIComponent(match[1]) : null;
        }
    }

    /**
     * Extract port number from a localhost URL or redirect_uri.
     */
    private extractLocalhostPort(urlStr: string): number | null {
        const match = urlStr.match(/localhost:(\d+)|127\.0\.0\.1:(\d+)/);
        if (match) {
            return parseInt(match[1] || match[2], 10);
        }
        return null;
    }
}

// Singleton export
export const cliAuthService = new CLIAuthService();
