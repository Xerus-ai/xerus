// Auth Detector
// Auto-detect CLI authentication status on sandbox
// Pattern: Ductor auth.py (check_claude_auth, check_codex_auth)
//   1. Credential file on disk (subscription / BYOS)
//   2. Environment variable (API key / BYOK)
//   3. CLI status command (fallback, slow — parses JSON output)
//   4. Installed-but-unauthenticated vs not-installed distinction
//   5. No auth -> platform billing via OpenRouter credits

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AdapterType, AuthResult, BillingType } from './cli-adapters/types';

const execFileAsync = promisify(execFile);

const CLAUDE_DIR = join(homedir(), '.claude');
const CLAUDE_CREDENTIALS = join(CLAUDE_DIR, '.credentials.json');
// Respect CODEX_HOME env var (Ductor pattern) for non-standard Codex installs
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex');
const CODEX_AUTH = join(CODEX_HOME, 'auth.json');
const CLI_STATUS_TIMEOUT_MS = 5000;

export interface PlatformAuthStatus {
    claudecode: AuthResult;
    codex: AuthResult;
}

export async function detectAllAuth(): Promise<PlatformAuthStatus> {
    const [claudeAuth, codexAuth] = await Promise.all([
        detectClaudeAuth(),
        detectCodexAuth(),
    ]);
    return { claudecode: claudeAuth, codex: codexAuth };
}

export async function detectAuthForAdapter(adapterType: AdapterType): Promise<AuthResult> {
    return adapterType === 'claudecode' ? detectClaudeAuth() : detectCodexAuth();
}

/** Get ISO timestamp of file modification time (Ductor pattern: auth_age tracking) */
function getFileAge(filePath: string): string | undefined {
    try {
        return statSync(filePath).mtime.toISOString();
    } catch {
        return undefined;
    }
}

async function detectClaudeAuth(): Promise<AuthResult> {
    // 1. Fast path: credentials file (standard OAuth login)
    // Ductor pattern: check ~/.claude/.credentials.json first
    if (existsSync(CLAUDE_CREDENTIALS)) {
        try {
            const content = readFileSync(CLAUDE_CREDENTIALS, 'utf-8');
            const parsed = JSON.parse(content);
            if (parsed.claudeAiOauth?.accessToken || parsed.accessToken) {
                return {
                    authenticated: true,
                    method: 'credentials_file',
                    billingType: 'subscription',
                    credentialPath: CLAUDE_CREDENTIALS,
                    credentialAge: getFileAge(CLAUDE_CREDENTIALS),
                };
            }
        } catch {
            // Malformed credentials file — continue
        }
    }

    // 2. ANTHROPIC_API_KEY environment variable (BYOK)
    if (process.env.ANTHROPIC_API_KEY) {
        return {
            authenticated: true,
            method: 'env_var',
            billingType: 'api',
        };
    }

    // 3. CLI status command (last resort, slow)
    // Ductor pattern: parse JSON output from `claude auth status`
    try {
        const { stdout } = await execFileAsync('claude', ['auth', 'status'], {
            timeout: CLI_STATUS_TIMEOUT_MS,
        });
        try {
            const data = JSON.parse(stdout);
            if (data.loggedIn === true) {
                return {
                    authenticated: true,
                    method: 'cli_status',
                    billingType: 'subscription',
                };
            }
        } catch {
            // Non-JSON output: fallback to string matching
            if (stdout.includes('authenticated') || stdout.includes('Logged in')) {
                return {
                    authenticated: true,
                    method: 'cli_status',
                    billingType: 'subscription',
                };
            }
        }
    } catch {
        // CLI not installed or auth check failed
    }

    // 4. Ductor pattern: distinguish installed-but-unauthenticated from not-installed
    if (existsSync(CLAUDE_DIR)) {
        return { authenticated: false, method: 'none', billingType: 'platform', installed: true };
    }

    return { authenticated: false, method: 'none', billingType: 'platform' };
}

async function detectCodexAuth(): Promise<AuthResult> {
    // 1. Fast path: auth.json credential file (respects CODEX_HOME env var per Ductor pattern)
    if (existsSync(CODEX_AUTH)) {
        return {
            authenticated: true,
            method: 'credentials_file',
            billingType: 'subscription',
            credentialPath: CODEX_AUTH,
            credentialAge: getFileAge(CODEX_AUTH),
        };
    }

    // 2. OPENAI_API_KEY environment variable (BYOK)
    if (process.env.OPENAI_API_KEY) {
        return {
            authenticated: true,
            method: 'env_var',
            billingType: 'api',
        };
    }

    // 3. Ductor pattern: check install markers (version.json or config.toml)
    // Distinguish "installed but not authenticated" from "not found"
    const versionFile = join(CODEX_HOME, 'version.json');
    const configFile = join(CODEX_HOME, 'config.toml');
    if (existsSync(versionFile) || existsSync(configFile)) {
        return { authenticated: false, method: 'none', billingType: 'platform', installed: true };
    }

    return { authenticated: false, method: 'none', billingType: 'platform' };
}

export function resolveBillingType(authResult: AuthResult): BillingType {
    return authResult.billingType;
}
