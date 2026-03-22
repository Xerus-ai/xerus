// Shared Slug Utilities
// Single source of truth for slug generation, validation, and sanitization

import { BadRequestError } from '../utils/errors';

/**
 * Convert a name to a URL-safe slug.
 * Lowercases, trims, replaces non-alphanumeric runs with hyphens, strips leading/trailing hyphens.
 */
export function slugify(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Sanitize an existing slug by stripping any characters outside the safe set.
 * Allows alphanumeric, hyphens, and underscores only.
 * Use this to guard slugs before interpolating into filesystem paths or shell commands.
 */
export function sanitizeSlug(slug: string): string {
    return slug.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Pattern for valid slugs: lowercase alphanumeric with hyphens,
 * must start and end with alphanumeric character.
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Check whether a string is a valid slug.
 */
export function isValidSlug(slug: string): boolean {
    return !!slug && SLUG_PATTERN.test(slug);
}

/**
 * Validate a slug, throwing BadRequestError if invalid.
 */
export function validateSlug(slug: string, label = 'slug'): void {
    if (!isValidSlug(slug)) {
        throw new BadRequestError(`Invalid ${label}: '${slug}' must be lowercase alphanumeric with hyphens`);
    }
}
