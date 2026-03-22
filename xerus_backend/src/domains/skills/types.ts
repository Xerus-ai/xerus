// Skills Domain Types
// Filesystem-based: skills live in sandbox, not in DB

export type SkillInstallScope = 'channel' | 'global';

export type SkillCategory =
    | 'productivity'
    | 'wellness'
    | 'business'
    | 'content'
    | 'finance'
    | 'education'
    | 'development'
    | 'operations';

export const SKILL_CATEGORIES: SkillCategory[] = [
    'productivity',
    'wellness',
    'business',
    'content',
    'finance',
    'education',
    'development',
    'operations',
];

// Core entity derived from filesystem (xerushub.json + SKILL.md)
export interface Skill {
    slug: string;
    name: string;
    description: string;
    user_id: string | null;     // null = marketplace/system skill
    is_global: boolean;         // true = marketplace skill
    category: string | null;
    tags: string[];
    avatar_config: string | null;
    version: string;
    file_count: number;
    is_published: boolean;
    author: string | null;
    source_url: string | null;
    created_at: string;         // ISO date string (filesystem mtime)
    updated_at: string;         // ISO date string (filesystem mtime)
    is_installed?: boolean;     // set by unified list()
    installed_scope?: SkillInstallScope; // where the skill is installed (global or channel)
    channel_path?: string;      // workspace-relative channel path if installed_scope === 'channel'
}

// Enriched entity for detail view
export interface SkillDetail extends Skill {
    files: SkillFile[];
    is_installed: boolean;
}

// File listing
export interface SkillFile {
    path: string;       // e.g. "SKILL.md", "references/guide.md"
    size: number;
}

// Input DTOs
export interface CreateSkillDTO {
    name: string;
    slug?: string;
    description: string;
    category?: SkillCategory;
    tags?: string[];
    is_global?: boolean;
    is_published?: boolean;
    author?: string;
    source_url?: string;
    avatar_config?: string;
}

export interface UpdateSkillDTO {
    name?: string;
    description?: string;
    category?: SkillCategory;
    tags?: string[];
    is_published?: boolean;
    author?: string;
    source_url?: string;
    version?: string;
    avatar_config?: string;
}

export interface InstallSkillDTO {
    scope: SkillInstallScope;
    channel_id?: string;
}

// Query types
export interface SkillFilters {
    category?: SkillCategory;
    tags?: string[];
    search?: string;
    is_published?: boolean;
    is_global?: boolean;
}

export interface SkillListOptions {
    filters?: SkillFilters;
    sort_by: string;
    sort_order: 'asc' | 'desc';
    page: number;
    limit: number;
}

export interface PaginatedSkills {
    skills: Skill[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    categories?: CategoryCount[];
}

export interface CategoryCount {
    category: string;
    count: number;
}

// xerushub.json file format (marketplace metadata)
export interface XerushubMetadata {
    slug: string;
    displayName: string;
    summary: string;
    tags: string[];
    version: string;
    category?: string;
    author?: string;
    source_url?: string;
    avatar_config?: string;
}

// Custom skill config stored in .claude/skills/{slug}/config.json (user-created)
export interface CustomSkillConfig {
    name: string;
    description: string;
    category?: string;
    tags?: string[];
    author?: string;
    source_url?: string;
    avatar_config?: string;
    version?: string;
    created_at?: string;
    updated_at?: string;
}

// Skill secrets (per-user encrypted env vars, keyed by skill_slug)
export interface SkillSecretRow {
    id: number;
    user_id: string;
    skill_slug: string;
    env_key: string;
    encrypted_value: string;
    hint: string;
    created_at: Date;
    updated_at: Date;
}

// What the API returns (masked, never raw values)
export interface SkillSecretStatus {
    env_key: string;
    has_value: boolean;
    hint: string; // e.g. "sk-l****3kf9" or "" if no value
    updated_at: Date;
}

// Slug validation pattern (re-exported from shared slug utility)
export { SLUG_PATTERN as SKILL_SLUG_PATTERN } from '../../shared/slugify';
export const SKILL_SLUG_MAX_LENGTH = 64;

// Sort options
export const VALID_SORT_FIELDS = ['name', 'created_at', 'updated_at'] as const;
