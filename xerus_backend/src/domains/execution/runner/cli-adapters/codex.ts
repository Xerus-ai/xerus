// Codex CLI Adapter
// Interactive persistent Codex CLI sessions via Daytona Sessions API
// Backend sends messages directly to Codex's stdin (no cli-executor middleman)
// Reference: Paperclip codex-local/execute.ts, Ductor service.py

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { CLIAdapter, AdapterType, AgentConfig, AuthResult, BillingType } from './types';

const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex');
const CODEX_AUTH_PATH = join(CODEX_HOME, 'auth.json');
const CODEX_CONFIG_PATH = join(CODEX_HOME, 'config.toml');

export class CodexAdapter implements CLIAdapter {
    readonly type: AdapterType = 'codex';
    readonly promptViaStdin = false;

    /**
     * Build command for interactive (persistent) Codex session.
     * Codex stays alive in full-auto mode, backend pipes messages to stdin.
     * --session-id for crash recovery (existing session).
     */
    buildCommand(_prompt: string, config: AgentConfig): string[] {
        const args: string[] = [
            'codex',
            '--approval-mode', 'full-auto',
            '--output-format', 'stream-json',
        ];

        if (config.model) {
            args.push('--model', config.model);
        }

        // --session-id for crash recovery: reattach to existing Codex session
        if (config.session_id) {
            args.push('--session-id', config.session_id);
        }

        return args;
    }

    async detectAuth(): Promise<AuthResult> {
        // 1. Auth file (respects CODEX_HOME env var per Ductor pattern)
        if (existsSync(CODEX_AUTH_PATH)) {
            return {
                authenticated: true,
                method: 'credentials_file',
                billingType: 'subscription',
                credentialPath: CODEX_AUTH_PATH,
            };
        }

        // 2. Environment variable
        if (process.env.OPENAI_API_KEY) {
            return {
                authenticated: true,
                method: 'env_var',
                billingType: 'api',
            };
        }

        // 3. No auth — platform will inject OpenRouter
        return { authenticated: false, method: 'none', billingType: 'platform' };
    }

    resolveBillingType(env: Record<string, string>): BillingType {
        if (env.OPENAI_API_KEY) return 'api';
        if (existsSync(CODEX_AUTH_PATH)) return 'subscription';
        return 'platform';
    }

    /**
     * Write config.toml with model_provider = "openrouter" for platform billing.
     * Called before spawning Codex when user has no BYOK key.
     */
    writeOpenRouterConfig(openRouterApiKey: string): void {
        mkdirSync(CODEX_HOME, { recursive: true });
        const toml = [
            'model_provider = "openrouter"',
            `api_key = "${openRouterApiKey}"`,
        ].join('\n');
        writeFileSync(CODEX_CONFIG_PATH, toml, 'utf-8');
    }
}
