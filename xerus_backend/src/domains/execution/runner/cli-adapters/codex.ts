// Codex CLI Adapter
// Spawns `codex` CLI with appropriate flags for agent execution
// Reference: Paperclip codex-local/execute.ts, Ductor service.py

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { CLIAdapter, AdapterType, AgentConfig, AuthResult, BillingType } from './types';

const CODEX_AUTH_PATH = join(homedir(), '.codex', 'auth.json');

export class CodexAdapter implements CLIAdapter {
    readonly type: AdapterType = 'codex';
    readonly promptViaStdin = true;

    buildCommand(_prompt: string, config: AgentConfig): string[] {
        const args: string[] = [
            'codex',
            'exec',
            '--json',
        ];

        if (config.model) {
            args.push('--model', config.model);
        }

        if (config.session_id) {
            args.push('resume', config.session_id);
        }

        // Codex reads prompt from stdin
        args.push('-');

        return args;
    }

    async detectAuth(): Promise<AuthResult> {
        // 1. Auth file
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
}
