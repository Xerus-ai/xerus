import { parse as parseYaml } from 'yaml'

// Reuse the same regex pattern as parse-skill-env-keys.ts
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/

export interface ParsedFrontmatter<T = Record<string, unknown>> {
  data: T
  body: string
}

/**
 * Extract YAML frontmatter from a markdown file.
 * Uses the `yaml` package (safe by default — no YAML bomb risk).
 * Returns parsed data object + the markdown body after the frontmatter block.
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string
): ParsedFrontmatter<T> {
  const match = content.match(FRONTMATTER_REGEX)
  if (!match) {
    return { data: {} as T, body: content }
  }

  const rawYaml = match[1]
  const body = content.slice(match[0].length).trim()

  try {
    const data = parseYaml(rawYaml) as T
    return { data: data ?? ({} as T), body }
  } catch {
    // If YAML parsing fails, return empty data with full content as body
    return { data: {} as T, body: content }
  }
}

/** Agent frontmatter shape (from xerus-agents agent.md files) */
export interface AgentFrontmatter {
  name?: string
  slug?: string
  description?: string
  personality_type?: string
  ai_model?: string
  category?: string
  tags?: string[]
  autonomy_level?: string
  tools?: string[]
  skills?: string[]
  model_config?: {
    temperature?: number
    top_p?: number
    max_tokens?: number
  }
  permissions?: {
    can_write_files?: boolean
    can_send_emails?: boolean
    can_create_tasks?: boolean
  }
}

/** Skill frontmatter shape (from xerus-skills SKILL.md files) */
export interface SkillFrontmatter {
  name?: string
  description?: string
  license?: string
  version?: string
  'allowed-tools'?: string
  author?: string
}

/** XerusHub metadata shape (from xerushub.json) */
export interface XerusHubMeta {
  slug?: string
  displayName?: string
  summary?: string
  tags?: string[]
  version?: string
}
