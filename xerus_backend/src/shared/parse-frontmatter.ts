import { parse as parseYaml } from 'yaml';

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/;

/**
 * Extract YAML frontmatter from markdown content.
 * Uses the `yaml` package (safe by default — no YAML bomb risk).
 * Returns parsed data object + the markdown body after the frontmatter block.
 */
export function parseFrontmatter(content: string): { data: Record<string, any>; body: string } {
    const match = content.match(FRONTMATTER_REGEX);
    if (!match) return { data: {}, body: content };

    const rawYaml = match[1];
    const body = content.slice(match[0].length).trim();

    try {
        const data = parseYaml(rawYaml) ?? {};
        return { data, body };
    } catch {
        return { data: {}, body: content };
    }
}
