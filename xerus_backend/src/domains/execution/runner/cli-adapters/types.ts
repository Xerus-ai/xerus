// CLI Adapter Types
// Shared interface for Claude Code and Codex CLI adapters
// Reference: Ductor service.py, AionUI IAgentFactory.ts, Paperclip execute.ts

export type AdapterType = 'claudecode' | 'codex';

export type CLIBillingType = 'subscription' | 'api' | 'platform';

// orchestrator = xerus-master (creates agents, manages workspace)
// agent = all other agents (workers, first in channel also leads)
export type AgentRole = 'orchestrator' | 'agent';

export interface AuthResult {
    authenticated: boolean;
    method: 'credentials_file' | 'env_var' | 'cli_status' | 'none';
    billingType: CLIBillingType;
    credentialPath?: string;
    /** ISO timestamp of when the credential file was last modified */
    credentialAge?: string;
    /** CLI is installed but not authenticated (Ductor pattern: INSTALLED vs NOT_FOUND) */
    installed?: boolean;
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

    /** Whether the CLI accepts prompt via stdin (true) or as CLI arg (false) */
    readonly promptViaStdin: boolean;
}

// --- Input validation for CLI argument injection prevention ---

/** Allowed characters for model identifiers (provider/model:version format) */
const MODEL_PATTERN = /^[a-zA-Z0-9/_:.-]+$/;

/** Allowed characters for session IDs (UUID or hyphenated slug format) */
const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

/** Allowed characters for tool names (alphanumeric with underscores/hyphens) */
const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate user-controlled AgentConfig values before they are interpolated
 * into CLI arguments. Prevents shell injection and flag injection attacks.
 * Must be called at the top of every adapter's buildCommand().
 */
export function validateAgentConfig(config: AgentConfig): void {
    if (config.model && !MODEL_PATTERN.test(config.model)) {
        throw new Error(`Invalid model name: ${config.model}`);
    }
    if (config.session_id && !SESSION_ID_PATTERN.test(config.session_id)) {
        throw new Error(`Invalid session ID: ${config.session_id}`);
    }
    if (config.allowed_tools) {
        for (const tool of config.allowed_tools) {
            if (!TOOL_NAME_PATTERN.test(tool)) {
                throw new Error(`Invalid tool name: ${tool}`);
            }
        }
    }
    // Prevent flag injection via system_prompt: a value starting with '--'
    // could be misinterpreted as a CLI flag by the subprocess.
    if (config.system_prompt?.startsWith('--')) {
        throw new Error('System prompt cannot start with --');
    }
}
