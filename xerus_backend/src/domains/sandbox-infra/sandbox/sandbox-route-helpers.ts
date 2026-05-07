// Sandbox Route Helpers
// Shared utilities for route files that need to verify a running sandbox
// and obtain the DaytonaProvider. Extracted from 7 duplicate copies across
// execution, conversation, company, task, and inbox route files.

import { logger } from '../../../utils/logger';
import { ServiceUnavailableError } from '../../../utils/errors';
import type { SandboxService } from './sandbox.service';
import type { DaytonaProvider } from './providers/daytona.provider';

const log = logger('SandboxRouteHelpers');

/**
 * Ensure the user has a running sandbox and return its ID.
 * If the sandbox is paused, resumes it. If none exists, creates one.
 * Throws 503 ServiceUnavailableError if provisioning fails.
 */
export async function requireRunningSandbox(
    sandboxService: SandboxService,
    userId: string,
): Promise<string> {
    try {
        const status = await sandboxService.getSandboxStatus(userId);
        if (status.status === 'running' && status.sandboxId) {
            return status.sandboxId;
        }

        log.info('Auto-provisioning sandbox', { user_id: userId, current_status: status.status });
        const session = await sandboxService.getOrCreateSandbox({ userId });
        return session.sandboxId;
    } catch (err) {
        log.error('Sandbox unavailable', { user_id: userId, error: String(err) });
        throw new ServiceUnavailableError('Sandbox unavailable — please try again shortly');
    }
}

/**
 * Extract the DaytonaProvider from the SandboxService and verify it supports
 * the executeCommand method required for workspace operations.
 * Throws if the provider is missing or incompatible.
 */
export function getDaytonaProvider(sandboxService: SandboxService): DaytonaProvider {
    const provider = sandboxService.getProvider();
    if (!provider || typeof (provider as DaytonaProvider).executeCommand !== 'function') {
        throw new Error('Sandbox provider does not support executeCommand');
    }
    return provider as DaytonaProvider;
}
