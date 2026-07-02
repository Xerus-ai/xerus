// Workspace Manifest Validator
// Validates agents/{slug}/config.json and agent.md frontmatter.
// Used by scaffold-sync-hook, agent-install route, and CI.

import { logger } from '../../utils/logger';

const log = logger('ManifestValidator');

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const VALID_ROLES = ['creative', 'technical', 'analytical', 'operational', 'specialist', 'lead', 'user', 'system'];
const VALID_AUTONOMY_LEVELS = ['manual', 'supervised', 'autonomous'];
const VALID_ADAPTER_TYPES = ['claudecode', 'codex'];

export interface AgentConfig {
    slug: string;
    name: string;
    description?: string;
    role?: string;
    model?: string;
    ai_model?: string;
    adapter_type?: string;
    autonomy_level?: string;
    domain?: string;
    primary_channel?: string;
    channels?: string[];
    tools?: string[];
    heartbeat_cron?: string;
    mascot?: string;
}

export interface ValidationError {
    field: string;
    message: string;
}

export function validateAgentConfig(config: unknown, slug?: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!config || typeof config !== 'object') {
        return [{ field: 'root', message: 'Config must be a JSON object' }];
    }

    const c = config as Record<string, unknown>;

    if (!c.slug || typeof c.slug !== 'string') {
        errors.push({ field: 'slug', message: 'slug is required and must be a string' });
    } else if (!SLUG_PATTERN.test(c.slug)) {
        errors.push({ field: 'slug', message: `slug "${c.slug}" must match ${SLUG_PATTERN}` });
    } else if (slug && c.slug !== slug) {
        errors.push({ field: 'slug', message: `slug "${c.slug}" does not match directory name "${slug}"` });
    }

    if (!c.name || typeof c.name !== 'string') {
        errors.push({ field: 'name', message: 'name is required and must be a string' });
    }

    if (c.role && typeof c.role === 'string' && !VALID_ROLES.includes(c.role)) {
        errors.push({ field: 'role', message: `role "${c.role}" must be one of: ${VALID_ROLES.join(', ')}` });
    }

    if (c.autonomy_level && typeof c.autonomy_level === 'string' && !VALID_AUTONOMY_LEVELS.includes(c.autonomy_level)) {
        errors.push({ field: 'autonomy_level', message: `autonomy_level "${c.autonomy_level}" must be one of: ${VALID_AUTONOMY_LEVELS.join(', ')}` });
    }

    if (c.adapter_type && typeof c.adapter_type === 'string' && !VALID_ADAPTER_TYPES.includes(c.adapter_type)) {
        errors.push({ field: 'adapter_type', message: `adapter_type "${c.adapter_type}" must be one of: ${VALID_ADAPTER_TYPES.join(', ')}` });
    }

    if (c.channels && !Array.isArray(c.channels)) {
        errors.push({ field: 'channels', message: 'channels must be an array' });
    }

    if (c.tools && !Array.isArray(c.tools)) {
        errors.push({ field: 'tools', message: 'tools must be an array' });
    }

    return errors;
}

export function validateAgentConfigJson(jsonStr: string, slug?: string): ValidationError[] {
    try {
        const parsed = JSON.parse(jsonStr) as unknown;
        return validateAgentConfig(parsed, slug);
    } catch (err) {
        return [{ field: 'root', message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` }];
    }
}

export function logValidationResult(slug: string, errors: ValidationError[]): void {
    if (errors.length === 0) {
        log.debug('Agent config valid', { slug });
    } else {
        log.warn('Agent config validation failed', {
            slug,
            errors: errors.map(e => `${e.field}: ${e.message}`),
        });
    }
}
