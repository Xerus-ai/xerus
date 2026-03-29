// CLI Adapter Types
// Shared interface for Claude Code and Codex CLI adapters
// Reference: Ductor service.py, AionUI IAgentFactory.ts, Paperclip execute.ts

export type AdapterType = 'claudecode' | 'codex';

export type BillingType = 'subscription' | 'api' | 'platform';

// orchestrator = xerus-master (creates agents, manages workspace)
// agent = all other agents (workers, first in channel also leads)
export type AgentRole = 'orchestrator' | 'agent';

export interface AuthResult {
    authenticated: boolean;
    method: 'credentials_file' | 'env_var' | 'cli_status' | 'none';
    billingType: BillingType;
    credentialPath?: string;
}

export interface AgentConfig {
    slug: string;
    model?: string;
    adapter_type: AdapterType;
    role: AgentRole;
    autonomy_level: string;
    thinking_level?: string;
    max_budget_usd?: number;
    allowed_tools?: string[];
    system_prompt?: string;
    session_id?: string;
    cwd?: string;
}

export interface CLIAdapter {
    readonly type: AdapterType;

    /** Build full command array for spawning the CLI subprocess */
    buildCommand(prompt: string, config: AgentConfig): string[];

    /** Detect authentication status for this CLI */
    detectAuth(): Promise<AuthResult>;

    /** Resolve billing type from environment variables */
    resolveBillingType(env: Record<string, string>): BillingType;

    /** Whether the CLI accepts prompt via stdin (true) or as CLI arg (false) */
    readonly promptViaStdin: boolean;
}
