// Claude Code CLI Adapter
// Spawns `claude` CLI with appropriate flags for agent execution
// Reference: Paperclip claude-local/execute.ts, 9to5 claude.ts, Ductor auth.py

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { CLIAdapter, AdapterType, AgentConfig, AuthResult, BillingType } from './types';

const CREDENTIALS_PATH = join(homedir(), '.claude', '.credentials.json');

export class ClaudeCodeAdapter implements CLIAdapter {
    readonly type: AdapterType = 'claudecode';
    readonly promptViaStdin = false;

    buildCommand(prompt: string, config: AgentConfig): string[] {
        const args: string[] = [
            'claude',
            '-p',
            '--output-format', 'stream-json',
            '--permission-mode', this.resolvePermissionMode(config.autonomy_level),
        ];

        if (config.model) {
            args.push('--model', config.model);
        }

        if (config.session_id) {
            args.push('--session-id', config.session_id);
        }

        if (config.max_budget_usd) {
            args.push('--max-budget-usd', String(config.max_budget_usd));
        }

        if (config.allowed_tools && config.allowed_tools.length > 0) {
            args.push('--allowed-tools', ...config.allowed_tools);
        }

        if (config.system_prompt) {
            args.push('--append-system-prompt', config.system_prompt);
        }

        args.push(prompt);

        return args;
    }

    async detectAuth(): Promise<AuthResult> {
        // 1. Credentials file (OAuth subscription)
        if (existsSync(CREDENTIALS_PATH)) {
            try {
                const content = readFileSync(CREDENTIALS_PATH, 'utf-8');
                const parsed = JSON.parse(content);
                if (parsed.claudeAiOauth?.accessToken || parsed.accessToken) {
                    return {
                        authenticated: true,
                        method: 'credentials_file',
                        billingType: 'subscription',
                        credentialPath: CREDENTIALS_PATH,
                    };
                }
            } catch {
                // Malformed credentials file
            }
        }

        // 2. Environment variable (API key)
        if (process.env.ANTHROPIC_API_KEY) {
            return {
                authenticated: true,
                method: 'env_var',
                billingType: 'api',
            };
        }

        // 3. No auth found — platform will inject OpenRouter
        return { authenticated: false, method: 'none', billingType: 'platform' };
    }

    resolveBillingType(env: Record<string, string>): BillingType {
        if (env.ANTHROPIC_API_KEY) return 'api';
        if (existsSync(CREDENTIALS_PATH)) return 'subscription';
        return 'platform';
    }

    private resolvePermissionMode(autonomyLevel: string): string {
        switch (autonomyLevel) {
            case 'autonomous': return 'bypassPermissions';
            case 'semi_autonomous': return 'acceptEdits';
            default: return 'default';
        }
    }
}
