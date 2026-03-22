// Shared workspace path validation
// Decode, normalize, and reject traversal attempts for user-supplied paths

import path from 'path';

export interface PathValidationResult {
    valid: true;
    normalized: string;
}

export interface PathValidationError {
    valid: false;
    reason: 'empty' | 'null_byte' | 'decode_failed' | 'traversal';
}

type PathValidationOutcome = PathValidationResult | PathValidationError;

/**
 * Validate and normalize a user-supplied workspace path.
 * Decodes URI encoding, normalizes separators, and rejects traversal attempts.
 *
 * Returns a discriminated union so callers can choose their own error handling
 * (throw BadRequestError in routes, silently return in event handlers, etc).
 */
export function validateWorkspacePath(rawPath: string): PathValidationOutcome {
    if (!rawPath) {
        return { valid: false, reason: 'empty' };
    }

    if (rawPath.includes('\0')) {
        return { valid: false, reason: 'null_byte' };
    }

    let decoded: string;
    try {
        decoded = decodeURIComponent(rawPath);
    } catch {
        return { valid: false, reason: 'decode_failed' };
    }

    if (decoded.includes('..') || path.isAbsolute(decoded)) {
        return { valid: false, reason: 'traversal' };
    }

    const normalized = path.normalize(decoded.replace(/\\/g, '/')).replace(/\\/g, '/');

    if (normalized.includes('..') || normalized.startsWith('/')) {
        return { valid: false, reason: 'traversal' };
    }

    return { valid: true, normalized };
}
