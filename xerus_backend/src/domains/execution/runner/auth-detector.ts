// Auth Detector
// Auto-detect CLI authentication status on sandbox
// Pattern: Ductor auth.py (check_claude_auth, check_codex_auth)
//   1. Credential file on disk (subscription / BYOS)
//   2. Environment variable (API key / BYOK)
//   3. Installed-but-unauthenticated vs not-installed distinction
//   4. No auth -> platform billing via OpenRouter credits
//
// All checks execute on the Daytona sandbox via SandboxExecutor,
// never on the backend host's filesystem.

import type { AdapterType, AuthResult, CLIBillingType } from './cli-adapters/types';

// -----------------------------------------------------------------------------
// Sandbox Executor Interface
// -----------------------------------------------------------------------------

export interface SandboxExecutor {
    executeCommand(sandboxId: string, command: string): Promise<{ result: string; exitCode: number }>;
}

// -----------------------------------------------------------------------------
// Sandbox Filesystem Helpers
// -----------------------------------------------------------------------------

async function readSandboxFile(
    sandboxId: string, executor: SandboxExecutor, path: string,
): Promise<string | null> {
    const { result, exitCode } = await executor.executeCommand(
        sandboxId, `test -f ${path} && cat ${path} 2>/dev/null`,
    );
    return exitCode === 0 && result.trim().length > 0 ? result.trim() : null;
}

async function getSandboxFileMtime(
    sandboxId: string, executor: SandboxExecutor, path: string,
): Promise<string | undefined> {
    const { result, exitCode } = await executor.executeCommand(
        sandboxId, `stat -c '%Y' ${path} 2>/dev/null`,
    );
    if (exitCode !== 0 || !result.trim()) return undefined;
    const epoch = parseInt(result.trim(), 10);
    if (isNaN(epoch)) return undefined;
    return new Date(epoch * 1000).toISOString();
}

async function sandboxDirExists(
    sandboxId: string, executor: SandboxExecutor, path: string,
): Promise<boolean> {
    const { exitCode } = await executor.executeCommand(sandboxId, `test -d ${path}`);
    return exitCode === 0;
}

async function getSandboxEnvVar(
    sandboxId: string, executor: SandboxExecutor, name: string,
): Promise<string | null> {
    const { result, exitCode } = await executor.executeCommand(
        sandboxId, `printenv ${name} 2>/dev/null`,
    );
    return exitCode === 0 && result.trim().length > 0 ? result.trim() : null;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface PlatformAuthStatus {
    claudecode: AuthResult;
    codex: AuthResult;
}

export async function detectAllAuth(
    sandboxId: string, executor: SandboxExecutor,
): Promise<PlatformAuthStatus> {
    const [claudeAuth, codexAuth] = await Promise.all([
        detectClaudeAuth(sandboxId, executor),
        detectCodexAuth(sandboxId, executor),
    ]);
    return { claudecode: claudeAuth, codex: codexAuth };
}

export async function detectAuthForAdapter(
    sandboxId: string, executor: SandboxExecutor, adapterType: AdapterType,
): Promise<AuthResult> {
    return adapterType === 'claudecode'
        ? detectClaudeAuth(sandboxId, executor)
        : detectCodexAuth(sandboxId, executor);
}

// -----------------------------------------------------------------------------
// Private Detection
// -----------------------------------------------------------------------------

const CLAUDE_CREDENTIALS = '$HOME/.claude/.credentials.json';
const CLAUDE_DIR = '$HOME/.claude';
const CODEX_AUTH = '${CODEX_HOME:-$HOME/.codex}/auth.json';
const CODEX_HOME_DIR = '${CODEX_HOME:-$HOME/.codex}';

async function detectClaudeAuth(
    sandboxId: string, executor: SandboxExecutor,
): Promise<AuthResult> {
    // 1. Fast path: credentials file (standard OAuth login)
    // Ductor pattern: check ~/.claude/.credentials.json first
    const content = await readSandboxFile(sandboxId, executor, CLAUDE_CREDENTIALS);
    if (content) {
        try {
            const parsed = JSON.parse(content);
            if (parsed.claudeAiOauth?.accessToken || parsed.accessToken) {
                return {
                    authenticated: true,
                    method: 'credentials_file',
                    billingType: 'subscription',
                    credentialPath: CLAUDE_CREDENTIALS,
                    credentialAge: await getSandboxFileMtime(sandboxId, executor, CLAUDE_CREDENTIALS),
                };
            }
        } catch (err) {
            console.warn('[auth-detector] Malformed Claude credentials file:', err);
        }
    }

    // 2. ANTHROPIC_API_KEY environment variable (BYOK)
    const anthropicKey = await getSandboxEnvVar(sandboxId, executor, 'ANTHROPIC_API_KEY');
    if (anthropicKey) {
        return {
            authenticated: true,
            method: 'env_var',
            billingType: 'api',
        };
    }

    // 3. Ductor pattern: distinguish installed-but-unauthenticated from not-installed
    if (await sandboxDirExists(sandboxId, executor, CLAUDE_DIR)) {
        return { authenticated: false, method: 'none', billingType: 'platform', installed: true };
    }

    return { authenticated: false, method: 'none', billingType: 'platform' };
}

async function detectCodexAuth(
    sandboxId: string, executor: SandboxExecutor,
): Promise<AuthResult> {
    // 1. Fast path: auth.json credential file (respects CODEX_HOME env var per Ductor pattern)
    const content = await readSandboxFile(sandboxId, executor, CODEX_AUTH);
    if (content) {
        return {
            authenticated: true,
            method: 'credentials_file',
            billingType: 'subscription',
            credentialPath: CODEX_AUTH,
            credentialAge: await getSandboxFileMtime(sandboxId, executor, CODEX_AUTH),
        };
    }

    // 2. OPENAI_API_KEY environment variable (BYOK)
    const openaiKey = await getSandboxEnvVar(sandboxId, executor, 'OPENAI_API_KEY');
    if (openaiKey) {
        return {
            authenticated: true,
            method: 'env_var',
            billingType: 'api',
        };
    }

    // 3. Ductor pattern: check install markers (version.json or config.toml)
    // Distinguish "installed but not authenticated" from "not found"
    const versionFile = `${CODEX_HOME_DIR}/version.json`;
    const configFile = `${CODEX_HOME_DIR}/config.toml`;
    const [versionContent, configContent] = await Promise.all([
        readSandboxFile(sandboxId, executor, versionFile),
        readSandboxFile(sandboxId, executor, configFile),
    ]);
    if (versionContent !== null || configContent !== null) {
        return { authenticated: false, method: 'none', billingType: 'platform', installed: true };
    }

    return { authenticated: false, method: 'none', billingType: 'platform' };
}

export function resolveBillingType(authResult: AuthResult): CLIBillingType {
    return authResult.billingType;
}
