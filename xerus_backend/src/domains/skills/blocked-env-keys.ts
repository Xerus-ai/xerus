// Blocked Environment Variable Keys
// Security sanitization for skill secrets: prevents users from injecting
// dangerous env vars that could compromise the sandbox or platform.
// Reference: Clawdbot host-env-security-policy.json + sanitize-env-vars.ts

// Exact env var names that are never allowed as skill secrets
const BLOCKED_EXACT_KEYS = new Set([
    // Platform credentials (would override the routing key)
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',

    // Node.js execution control
    'NODE_OPTIONS',
    'NODE_PATH',
    'NODE_EXTRA_CA_CERTS',
    'NODE_ENV',

    // Shell injection vectors
    'BASH_ENV',
    'ENV',
    'IFS',
    'SHELL',
    'PROMPT_COMMAND',

    // System paths
    'PATH',
    'HOME',
    'USER',
    'LANG',
    'TERM',

    // Python execution control
    'PYTHONPATH',
    'PYTHONHOME',
    'PYTHONSTARTUP',
    'PYTHONBREAKPOINTHOOK',
    'PYTHONINSPECT',

    // TLS/SSL interception
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'SSLKEYLOGFILE',
    'NODE_TLS_REJECT_UNAUTHORIZED',
    'REQUESTS_CA_BUNDLE',
    'CURL_CA_BUNDLE',

    // JVM execution control
    'JAVA_TOOL_OPTIONS',
    '_JAVA_OPTIONS',
    'JVM_OPTS',
    'MAVEN_OPTS',
    'GRADLE_OPTS',

    // Ruby execution control
    'RUBYOPT',
    'RUBYLIB',
    'GEM_PATH',
    'GEM_HOME',

    // Perl execution control
    'PERL5LIB',
    'PERLLIB',

    // Go build control
    'GOFLAGS',
    'GOPATH',
    'GOROOT',

    // Rust build control
    'RUSTFLAGS',

    // Git command injection
    'GIT_PROXY_COMMAND',
    'GIT_SSH_COMMAND',

    // Auth token patterns used by the platform
    'AUTH_TOKEN',

    // Claude Code SDK internals
    'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
]);

// Prefix patterns: any env var starting with these is blocked
const BLOCKED_PREFIXES = [
    'LD_',         // Dynamic linker injection (Linux)
    'DYLD_',       // Dynamic linker injection (macOS)
    'ANTHROPIC_',  // All Anthropic platform vars
    'CLAUDE_',     // All Claude SDK internals
    'BASH_FUNC_',  // Bash exported function injection
    'NPM_CONFIG_', // npm config injection via env
    'DENO_',       // All Deno runtime vars
    'CARGO_',      // Rust/Cargo environment
];

export function isBlockedEnvKey(key: string): boolean {
    const upperKey = key.toUpperCase();
    if (BLOCKED_EXACT_KEYS.has(upperKey)) {
        return true;
    }

    for (const prefix of BLOCKED_PREFIXES) {
        if (upperKey.startsWith(prefix)) {
            return true;
        }
    }

    return false;
}

// Validate env var key format: must be uppercase alphanumeric + underscores
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,254}$/;

export function isValidEnvKeyFormat(key: string): boolean {
    return ENV_KEY_PATTERN.test(key);
}

// Validate env var value: block null bytes and oversized values
const MAX_VALUE_LENGTH = 32768; // 32KB max

export function validateEnvVarValue(value: string): string | null {
    if (value.includes('\0')) {
        return 'Value must not contain null bytes';
    }
    if (value.length > MAX_VALUE_LENGTH) {
        return `Value must not exceed ${MAX_VALUE_LENGTH} characters`;
    }
    return null;
}
