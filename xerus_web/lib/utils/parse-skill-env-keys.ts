// Parse required environment variable keys from SKILL.md YAML frontmatter
// Looks for `requires.env` or `primaryEnv` fields in the YAML frontmatter block
//
// Example SKILL.md frontmatter:
// ---
// primaryEnv: DATAFORSEO_API_KEY
// requires:
//   env:
//     - DATAFORSEO_API_KEY
//     - DATAFORSEO_PASSWORD
// ---

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/;

export function parseSkillEnvKeys(content: string): string[] {
    const match = content.match(FRONTMATTER_REGEX);
    if (!match) return [];

    const frontmatter = match[1];
    const keys = new Set<string>();

    // Parse primaryEnv: SINGLE_KEY
    const primaryMatch = frontmatter.match(/^primaryEnv:\s*(.+)$/m);
    if (primaryMatch) {
        const key = primaryMatch[1].trim();
        if (key && isEnvKeyFormat(key)) {
            keys.add(key);
        }
    }

    // Parse requires.env list (YAML array under requires > env)
    const requiresEnvMatch = frontmatter.match(/requires:\s*\n\s+env:\s*\n((?:\s+-\s+.+\n?)*)/);
    if (requiresEnvMatch) {
        const lines = requiresEnvMatch[1].split('\n');
        for (const line of lines) {
            const itemMatch = line.match(/^\s+-\s+(.+)/);
            if (itemMatch) {
                const key = itemMatch[1].trim();
                if (isEnvKeyFormat(key)) {
                    keys.add(key);
                }
            }
        }
    }

    return Array.from(keys);
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
};

export function getEnvKeysForSkill(slug: string, content?: string): string[] {
    const parsed = content ? parseSkillEnvKeys(content) : [];
    if (parsed.length > 0) return parsed;
    return KNOWN_ENV_REGISTRY[slug] ?? [];
}
