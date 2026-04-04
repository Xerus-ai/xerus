// Sandbox Route Helpers
// Shared utilities for route files that need to verify a running sandbox
// and obtain the DaytonaProvider. Extracted from 7 duplicate copies across
// execution, conversation, company, task, and inbox route files.

import { BadRequestError } from '../../../utils/errors';
import type { SandboxService } from './sandbox.service';
import type { DaytonaProvider } from './providers/daytona.provider';

/**
 * Verify that the user has a running sandbox and return its ID.
 * Throws BadRequestError if no sandbox is running.
 */
export async function requireRunningSandbox(
    sandboxService: SandboxService,
    userId: string,
): Promise<string> {
    const status = await sandboxService.getSandboxStatus(userId);
    if (status.status !== 'running' || !status.sandboxId) {
        throw new BadRequestError('Sandbox not running - start a session first');
    }
    return status.sandboxId;
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
