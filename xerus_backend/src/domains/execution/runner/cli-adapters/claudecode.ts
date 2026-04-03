// Claude Code CLI Adapter
// Interactive persistent Claude CLI sessions via Daytona Sessions API
// Backend sends messages directly to Claude's stdin (no cli-executor middleman)
// Auth detection is handled by auth-detector.ts (not the adapter).
// Reference: Paperclip claude-local/execute.ts, 9to5 claude.ts

import type { CLIAdapter, AdapterType, AgentConfig } from './types';
import { validateAgentConfig } from './types';

export class ClaudeCodeAdapter implements CLIAdapter {
    readonly type: AdapterType = 'claudecode';
    readonly promptViaStdin = false;

    /**
     * Build command for interactive (persistent) Claude session.
     * Claude stays alive, backend pipes messages to stdin.
     * --resume is only used for crash recovery (existing session_id).
     */
    buildCommand(_prompt: string, config: AgentConfig): string[] {
        validateAgentConfig(config);

        const args: string[] = [
            'claude',
            '--output-format', 'stream-json',
            '--dangerously-skip-permissions',
        ];

        if (config.model) {
            args.push('--model', config.model);
        }

        // --resume for crash recovery: reattach to existing Claude session
        if (config.session_id) {
            args.push('--resume', config.session_id);
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

        // '--' prevents any subsequent positional args from being parsed as flags
        args.push('--');

        return args;
    }
}
