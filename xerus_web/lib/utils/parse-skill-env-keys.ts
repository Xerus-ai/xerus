// Parse skill configuration requirements from SKILL.md
// Detects env vars (frontmatter + body), CLI tools, and auth patterns.

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/;

// Common env vars that are NOT skill-specific config (skip these)
const IGNORE_VARS = new Set([
    'PATH', 'HOME', 'USER', 'SHELL', 'PWD', 'TERM', 'LANG',
    'NODE_ENV', 'NODE_PATH', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS',
    'NPM_TOKEN', 'CI', 'DEBUG', 'VERBOSE', 'LOG_LEVEL',
]);

export interface SkillConfigRequirements {
    envKeys: string[];
    bins: string[];
    hasAuth: boolean;
}

export function parseSkillConfig(content: string): SkillConfigRequirements {
    const envKeys = new Set<string>();
    const bins: string[] = [];

    const fmMatch = content.match(FRONTMATTER_REGEX);
    const frontmatter = fmMatch ? fmMatch[1] : '';
    const body = fmMatch ? content.slice(fmMatch[0].length) : content;

    // 1. Frontmatter: primaryEnv
    const primaryMatch = frontmatter.match(/^primaryEnv:\s*(.+)$/m);
    if (primaryMatch) {
        const key = primaryMatch[1].trim();
        if (isEnvKeyFormat(key)) envKeys.add(key);
    }

    // 2. Frontmatter: requires.env list
    const requiresEnvMatch = frontmatter.match(/requires:\s*\n\s+env:\s*\n((?:\s+-\s+.+\n?)*)/);
    if (requiresEnvMatch) {
        for (const line of requiresEnvMatch[1].split('\n')) {
            const itemMatch = line.match(/^\s+-\s+(.+)/);
            if (itemMatch) {
                const key = itemMatch[1].trim();
                if (isEnvKeyFormat(key)) envKeys.add(key);
            }
        }
    }

    // 3. Frontmatter: requires.bins
    const binsMatch = frontmatter.match(/bins:\s*\[([^\]]*)\]/);
    if (binsMatch) {
        for (const b of binsMatch[1].split(',')) {
            const bin = b.trim().replace(/^["']|["']$/g, '');
            if (bin) bins.push(bin);
        }
    }

    // 4. Body: `export VAR_NAME=` or `export VAR_NAME="..."`
    const exportMatches = body.matchAll(/export\s+([A-Z][A-Z0-9_]{2,})[\s=]/g);
    for (const m of exportMatches) {
        if (!IGNORE_VARS.has(m[1])) envKeys.add(m[1]);
    }

    // 5. Body: `$VAR_NAME` or `${VAR_NAME}` references (only obvious auth-related ones)
    const varRefMatches = body.matchAll(/\$\{?([A-Z][A-Z0-9_]{2,})\}?/g);
    for (const m of varRefMatches) {
        const key = m[1];
        if (!IGNORE_VARS.has(key) && isLikelyAuthVar(key)) envKeys.add(key);
    }

    // 6. Body: backtick code with `VAR_NAME=` assignment (common in setup instructions)
    const assignMatches = body.matchAll(/^[`\s]*([A-Z][A-Z0-9_]{2,})=["'<]/gm);
    for (const m of assignMatches) {
        if (!IGNORE_VARS.has(m[1]) && isLikelyAuthVar(m[1])) envKeys.add(m[1]);
    }

    const hasAuth = envKeys.size > 0 || bins.length > 0 ||
        /\b(auth|authenticate|OAuth|token|credential|api[_\s-]?key|sign[_\s-]?in|login)\b/i.test(body);

    return { envKeys: Array.from(envKeys), bins, hasAuth };
}

function isLikelyAuthVar(key: string): boolean {
    return /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|API|ACCOUNT|ACCESS|CLIENT_ID|CLIENT_SECRET|WEBHOOK)/i.test(key);
}

function isEnvKeyFormat(key: string): boolean {
    return /^[A-Z][A-Z0-9_]{0,254}$/.test(key);
}

const KNOWN_ENV_REGISTRY: Record<string, string[]> = {
    'twitter-poster': ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
    'twitter-monitor': ['TWITTER_API_KEY', 'TWITTER_API_SECRET'],
    'google-analytics': ['GOOGLE_ANALYTICS_KEY'],
    'reddit-monitor': ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
    'seo-analyzer': ['DATAFORSEO_API_KEY', 'DATAFORSEO_PASSWORD'],
    'email-sender': ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'],
    'slack-notifier': ['SLACK_BOT_TOKEN'],
    'github-integration': ['GITHUB_TOKEN'],
    'instagram': ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID'],
    'discord': ['DISCORD_BOT_TOKEN'],
    'discord-webhook': ['DISCORD_WEBHOOK_URL'],
    'apify': ['APIFY_API_TOKEN'],
    'dev.to': ['DEVTO_API_KEY'],
    'supadata': ['SUPADATA_API_KEY'],
    'bird': ['AUTH_TOKEN', 'CT0'],
    'last30days': ['SCRAPECREATORS_API_KEY'],
};

export function getEnvKeysForSkill(slug: string, content?: string): string[] {
    if (content) {
        const config = parseSkillConfig(content);
        if (config.envKeys.length > 0) return config.envKeys;
    }
    return KNOWN_ENV_REGISTRY[slug] ?? [];
}

export function parseSkillRequiredBins(content: string): string[] {
    return parseSkillConfig(content).bins;
}

export function getSkillConfigRequirements(slug: string, content?: string): SkillConfigRequirements {
    if (content) {
        const config = parseSkillConfig(content);
        if (config.envKeys.length > 0 || config.bins.length > 0 || config.hasAuth) {
            return config;
        }
    }
    const knownKeys = KNOWN_ENV_REGISTRY[slug];
    if (knownKeys) {
        return { envKeys: knownKeys, bins: [], hasAuth: true };
    }
    return { envKeys: [], bins: [], hasAuth: false };
}
