// Codex CLI Adapter
// Interactive persistent Codex CLI sessions via Daytona Sessions API
// Backend sends messages directly to Codex's stdin (no cli-executor middleman)
// Auth detection is handled by auth-detector.ts (not the adapter).
// Reference: Paperclip codex-local/execute.ts, Ductor service.py
//
// LIMITATION: Budget controls
// The Codex CLI does not expose --max-budget-usd or --max-tokens flags as of
// v0.1.x. config.max_budget_usd is therefore ignored at the CLI level.
// Defense-in-depth: the backend runner event stream already tracks token usage
// and credits per session (see runner.service.ts). A process-level cost monitor
// that kills the Codex process when budget is exceeded would add a second layer
// of protection. See: https://github.com/openai/codex/issues (track for new flags).

import type { CLIAdapter, AdapterType, AgentConfig } from './types';
import { validateAgentConfig } from './types';

export class CodexAdapter implements CLIAdapter {
    readonly type: AdapterType = 'codex';
    readonly promptViaStdin = false;

    /**
     * Build command for interactive (persistent) Codex session.
     * Codex stays alive in full-auto mode, backend pipes messages to stdin.
     * --session-id for crash recovery (existing session).
     */
    buildCommand(_prompt: string, config: AgentConfig): string[] {
        validateAgentConfig(config);

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

        // '--' prevents any subsequent positional args from being parsed as flags
        args.push('--');

        return args;
    }
}
