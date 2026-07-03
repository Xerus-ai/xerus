// Sandbox Configuration Constants
// Daytona sandbox lifecycle and retry settings
// Reference: xerus_backend/docs/daytona/guides/typescript/anthropic/

import { logger } from '../../../utils/logger';

const log = logger('SandboxConfig');

// Base workspace path (all other sandbox paths derive from this)
// Provider-specific: Daytona sets this in Dockerfile, local dev sets it in .env
const workspacePath = process.env.XERUS_WORKSPACE_ROOT;
if (!workspacePath) {
    throw new Error(
        'XERUS_WORKSPACE_ROOT environment variable is required. '
        + 'Set it to the workspace base path (e.g. /home/daytona for Daytona, /workspace for local).'
    );
}

// DAYTONA_SNAPSHOT is required by the backend (sandbox creation) but NOT by the
// runner process inside the sandbox. Don't throw — the runner bundle imports this
// module for workspacePath only.
const snapshot = process.env.DAYTONA_SNAPSHOT || '';
if (!snapshot && !process.env.XERUS_AGENT_SLUG) {
    // Only warn on the backend (not inside sandbox where XERUS_AGENT_SLUG is set)
    log.warn('DAYTONA_SNAPSHOT not set. Sandbox creation will fail. Set it to the Daytona snapshot name (e.g. xerus-sandbox).');
}

export const SANDBOX_CONFIG = {
    snapshot,

    // Timeout for sandbox operations (5 minutes)
    operationTimeoutMs: 5 * 60 * 1000,

    // Auto-stop interval: 0 disables Daytona's built-in auto-stop.
    // Our SandboxSchedulerService handles lifecycle (3-day inactivity).
    autoStopIntervalMinutes: 0,

    // Auto-archive interval: minutes after stop before sandbox is archived (24 hours)
    autoArchiveIntervalMinutes: 24 * 60,

    // Auto-delete interval: minutes after stop before sandbox is deleted (7 days)
    // Set to 0 to disable auto-delete
    autoDeleteIntervalMinutes: 0,

    // Workspace base path inside sandbox (provider-agnostic)
    workspacePath,

    // Directory containing runner module in sandbox (derived from workspacePath)
    runnerDir: `${workspacePath}/.xerus/runner`,

    // Git repository URL for workspace template (cloned on new sandbox creation)
    workspaceTemplateUrl: process.env.XERUS_WORKSPACE_TEMPLATE_URL || 'https://github.com/xerus-ai/xerus-workspace.git',

    // Git branch for workspace template. Pinned to 'main' — never rely on the
    // repo's default branch: when the GitHub default pointed at a stale branch,
    // every sandbox was scaffolded from months-old prompts (fictional tool names)
    // and template sync "converged" to the same stale content forever.
    workspaceTemplateBranch: process.env.XERUS_WORKSPACE_TEMPLATE_BRANCH || 'main',

    // Streaming queue limits (backpressure)
    queueSoftLimit: 500,   // Emit warning when exceeded
    queueHardLimit: 1000,  // Pause reading when exceeded

    // Process control timeouts
    killGracePeriodMs: 5000, // Wait 5s after SIGTERM before SIGKILL

    // noVNC port (used by computerUse for browser access)
    novncPort: 6080,

    // ttyd port (web terminal server)
    terminalPort: 7681,
} as const;

// Directories excluded from workspace backup tars (large, regenerable, or not user data)
// Infrastructure files (.claude/hooks, schemas, .xerus/) come from the workspace template
// (git clone) and must NOT be restored from S3 — otherwise S3 overwrites newer versions.
export const BACKUP_TAR_EXCLUDES = [
    'node_modules',
    '.git',
    '.cache',
    'marketplace',
    '.xerus/runner',
    '.claude/hooks',
    '.claude/settings.json',
    '.claude/skills',
    '.xerus/ipc',
    '.xerus/templates',
    '.xerus/manifest.yaml',
    'data/schema.sql',
    'data/workspace-schema.sql',
    '.claude/rules/TOOL_GUIDE.md',
] as const;

// Pre-built tar exclude flags for shell commands
// Prefixed with ./ because tar is invoked with `-C <path> .` — exclude patterns
// must match member names as they appear in the archive (./node_modules, ./.xerus/runner)
export const BACKUP_TAR_EXCLUDE_FLAGS = BACKUP_TAR_EXCLUDES
    .map(dir => `--exclude='./${dir}'`)
    .join(' ');

// Environment variable allowlist for agent execution
// Only these patterns are passed to the SDK process
// Security: Narrow allowlist to prevent env var injection
export const ENV_ALLOWLIST = [
    'ANTHROPIC_API_KEY',       // Claude Code CLI auth - API key
    'ANTHROPIC_BASE_URL',      // Claude Code CLI - custom base URL (OpenRouter)
    'ANTHROPIC_AUTH_TOKEN',    // Claude Code CLI - bearer token
    'OPENAI_API_KEY',          // Codex CLI auth - API key
    'OPENAI_BASE_URL',         // Codex CLI - custom base URL (OpenRouter)
    'OPENROUTER_API_KEY',      // Platform billing fallback
    'XERUS_RUNNER_*',          // Our config (XERUS_RUNNER_CONFIG, XERUS_RUNNER_PROMPT)
    'XERUS_WORKSPACE_ROOT',    // Workspace base path
    'PATH',                    // Required for CLI executables
    'HOME',                    // Required for CLI credential files
    'NODE_PATH',               // Node.js module resolution
    'LANG',                    // Locale for proper text encoding
    'LC_*',                    // Locale settings (LC_ALL, LC_CTYPE, etc.)
    'DISPLAY',                 // Xvfb virtual display (:99)
    'AGENT_BROWSER_*',        // agent-browser CDP config (port, data dir, etc.)
    'BROWSER_*',              // Browser data/state directories
    'GOOGLE_APPLICATION_CREDENTIALS',  // GCP service account path
    'GOOGLE_CLOUD_PROJECT',            // GCP project ID
] as const;

// Check if an environment variable matches the allowlist
export function isEnvAllowed(key: string): boolean {
    return ENV_ALLOWLIST.some(pattern => {
        if (pattern.endsWith('*')) {
            return key.startsWith(pattern.slice(0, -1));
        }
        return key === pattern;
    });
}

export const RETRY_CONFIG = {
    // Maximum number of retry attempts
    maxRetries: 3,

    // Initial delay before first retry (1 second)
    initialDelayMs: 1000,

    // Maximum delay between retries (10 seconds)
    maxDelayMs: 10000,

    // Exponential backoff multiplier
    multiplier: 2,

    // Add jitter to prevent thundering herd
    jitter: true,
} as const;

// Error codes that are safe to retry (Daytona + common network errors)
export const RETRYABLE_ERROR_CODES = [
    'SANDBOX_TIMEOUT',
    'SANDBOX_CONNECTION_FAILED',
    'SANDBOX_NOT_FOUND',
    'RATE_LIMIT_EXCEEDED',
    'DAYTONA_TIMEOUT',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
] as const;

export type RetryableErrorCode = (typeof RETRYABLE_ERROR_CODES)[number];
