// Claude Code CLI Adapter
// Persistent Claude CLI sessions via Daytona Sessions API using stream-json I/O.
// Uses --input-format stream-json so Claude reads NDJSON from stdin as a stream
// (no EOF wait). Backend sends structured messages; Claude outputs stream-json.
// Auth detection is handled by auth-detector.ts (not the adapter).
// Reference: Claude Code source src/cli/structuredIO.ts, src/main.tsx

import type { CLIAdapter, AdapterType, AgentConfig } from './types';
import { validateAgentConfig } from './types';

export class ClaudeCodeAdapter implements CLIAdapter {
    readonly type: AdapterType = 'claudecode';
    readonly promptViaStdin = true;

    /**
     * Build command for persistent stream-json Claude session.
     * --input-format stream-json: reads NDJSON from stdin without waiting for EOF.
     * --output-format stream-json --verbose: full event firehose to stdout.
     * Stdin messages: {"type":"user","message":{"role":"user","content":"..."}}
     * --resume for multi-turn: reattach to existing Claude conversation.
     */
    buildCommand(_prompt: string, config: AgentConfig): string[] {
        validateAgentConfig(config);

        const args: string[] = [
            'claude',
            '--input-format', 'stream-json',
            '--output-format', 'stream-json',
            '--verbose',
            '--print',
            '--dangerously-skip-permissions',
        ];

        if (config.model) {
            args.push('--model', config.model);
        }

        // --resume for multi-turn: reattach to existing Claude conversation
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

        return args;
    }

    /**
     * Format a user message as stream-json NDJSON for Claude's stdin.
     */
    formatStdinMessage(text: string): string {
        return JSON.stringify({
            type: 'user',
            message: { role: 'user', content: text },
        });
    }
}
