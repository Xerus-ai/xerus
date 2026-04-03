// Sandbox Retry Utility
// Exponential backoff with jitter for Daytona operations

import { logger } from '../../../utils/logger';
import { RETRY_CONFIG, RETRYABLE_ERROR_CODES } from './sandbox.config';
import { SANDBOX_CONFIG } from './sandbox.config';
import { SandboxCreationError, SandboxTimeoutError } from '../../execution/errors';

const log = logger('SandboxRetry');

/**
 * Execute an operation with exponential backoff retry.
 */
export async function withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | null = null;
    let delay = RETRY_CONFIG.initialDelayMs;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            const errorCode = (error as { code?: string }).code || '';
            const errorMessage = lastError.message || '';

            const isRetryable = RETRYABLE_ERROR_CODES.some(
                (code) => errorCode.includes(code) || errorMessage.includes(code)
            );

            if (!isRetryable) {
                throw wrapError(lastError, context);
            }

            if (attempt < RETRY_CONFIG.maxRetries) {
                const jitter = RETRY_CONFIG.jitter ? Math.random() * delay * 0.1 : 0;
                const actualDelay = Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);

                log.info('Retry attempt failed', { context, attempt, retry_delay_ms: Math.round(actualDelay) });
                await sleep(actualDelay);
                delay *= RETRY_CONFIG.multiplier;
            }
        }
    }

    throw wrapError(lastError!, context);
}

/**
 * Wrap an error with a domain-specific error type.
 */
function wrapError(error: Error, context: string): Error {
    const errorMessage = error.message || 'Unknown error';
    if (context === 'createSandbox' || context === 'create') {
        return new SandboxCreationError(errorMessage);
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
        return new SandboxTimeoutError('unknown', SANDBOX_CONFIG.operationTimeoutMs / 1000);
    }
    return error;
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
