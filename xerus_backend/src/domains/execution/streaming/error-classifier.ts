// Error Classification Utility
// Shared logic for classifying errors by type based on error codes and names

import { ErrorType } from '../types';

/**
 * Classify error type based on error code prefix or explicit type.
 * Used by both stream.events.ts (factory) and stream.handler.ts (SSE).
 *
 * Classification priority: explicit type > code patterns > default
 */
export function classifyErrorType(errorCode: string, explicitType?: ErrorType): ErrorType {
    if (explicitType) {
        return explicitType;
    }

    // Classify based on error code patterns (most reliable)
    if (errorCode.startsWith('TOOL_') || errorCode.includes('_TOOL_')) {
        return 'tool_error';
    }
    if (
        errorCode.startsWith('AUTH_') ||
        errorCode.includes('_AUTH_') ||
        errorCode === 'UNAUTHORIZED' ||
        errorCode === 'FORBIDDEN'
    ) {
        return 'auth_error';
    }
    if (
        errorCode.startsWith('VALIDATION_') ||
        errorCode.includes('_VALIDATION_') ||
        errorCode === 'BAD_REQUEST'
    ) {
        return 'validation_error';
    }
    if (errorCode.startsWith('TIMEOUT_') || errorCode.includes('_TIMEOUT_') || errorCode === 'TIMEOUT') {
        return 'timeout';
    }
    if (errorCode.startsWith('SYSTEM_') || errorCode.includes('_SYSTEM_') || errorCode === 'INTERNAL_ERROR') {
        return 'system_error';
    }
    if (errorCode.includes('CONTEXT_') || errorCode === 'CONTEXT_OVERFLOW') {
        return 'context_overflow';
    }
    if (errorCode.includes('CANCEL') || errorCode === 'USER_CANCEL') {
        return 'user_cancel';
    }

    // Default to llm_error for LLM-related issues
    return 'llm_error';
}

/**
 * Classify error from an Error object.
 * Checks code first (more reliable), then falls back to name-based classification.
 */
export function classifyErrorFromObject(error: Error, errorCode: string): ErrorType {
    // Try code-based classification first (most reliable)
    const codeClassification = classifyErrorType(errorCode);
    if (codeClassification !== 'llm_error') {
        return codeClassification;
    }

    // Fall back to name-based classification
    const name = error.name.toLowerCase();
    if (name.includes('timeout')) return 'timeout';
    if (name.includes('auth') || name.includes('permission')) return 'auth_error';
    if (name.includes('validation') || name.includes('invalid')) return 'validation_error';
    if (name.includes('tool')) return 'tool_error';
    if (name.includes('context') || name.includes('overflow')) return 'context_overflow';
    if (name.includes('cancel')) return 'user_cancel';
    if (name.includes('system')) return 'system_error';

    return 'llm_error';
}

/**
 * Extract error code from an Error object.
 * Checks for code property, then falls back to error name transformation.
 */
export function extractErrorCode(error: Error): string {
    // Check for code property on error
    if ('code' in error && typeof error.code === 'string') {
        return error.code;
    }
    // Use error name if meaningful
    if (error.name && error.name !== 'Error') {
        return error.name.toUpperCase().replace(/ERROR$/, '_ERROR');
    }
    return 'EXECUTION_ERROR';
}
