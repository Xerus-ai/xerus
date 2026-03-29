// Auth Detector
// Auto-detect CLI authentication status on sandbox
// Detection order: credential files -> env vars -> CLI status command
// Reference: Ductor auth.py, CloudCLI cli-auth.js, Paperclip quota.ts

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AdapterType, AuthResult, BillingType } from './cli-adapters/types';

const execFileAsync = promisify(execFile);

const CLAUDE_CREDENTIALS = join(homedir(), '.claude', '.credentials.json');
const CODEX_AUTH = join(homedir(), '.codex', 'auth.json');
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

async function detectClaudeAuth(): Promise<AuthResult> {
    // 1. Check credentials file (OAuth / subscription)
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
                };
            }
        } catch {
            // Malformed credentials file — continue
        }
    }

    // 2. Check env var (API key)
    if (process.env.ANTHROPIC_API_KEY) {
        return {
            authenticated: true,
            method: 'env_var',
            billingType: 'api',
        };
    }

    // 3. CLI status command (last resort, slow)
    try {
        const { stdout } = await execFileAsync('claude', ['auth', 'status'], {
            timeout: CLI_STATUS_TIMEOUT_MS,
        });
        if (stdout.includes('authenticated') || stdout.includes('Logged in')) {
            return {
                authenticated: true,
                method: 'cli_status',
                billingType: 'subscription',
            };
        }
    } catch {
        // CLI not installed or auth check failed
    }

    return { authenticated: false, method: 'none', billingType: 'platform' };
}

async function detectCodexAuth(): Promise<AuthResult> {
    // 1. Auth file
    if (existsSync(CODEX_AUTH)) {
        return {
            authenticated: true,
            method: 'credentials_file',
            billingType: 'subscription',
            credentialPath: CODEX_AUTH,
        };
    }

    // 2. Env var
    if (process.env.OPENAI_API_KEY) {
        return {
            authenticated: true,
            method: 'env_var',
            billingType: 'api',
        };
    }

    return { authenticated: false, method: 'none', billingType: 'platform' };
}

export function resolveBillingType(authResult: AuthResult): BillingType {
    return authResult.billingType;
}
