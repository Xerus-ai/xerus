// Execution Service Registry
// Lazy singleton access to the ExecutionService instance.
// Extracted from execution.routes.ts so multiple route modules
// (execution.routes.ts, execution-lifecycle.routes.ts) share one instance
// without importing each other (avoids circular deps).

import { ExecutionService } from './execution.service';

let executionServiceInstance: ExecutionService | null = null;

export function getExecutionService(): ExecutionService {
    if (!executionServiceInstance) {
        throw new Error('ExecutionService not initialized. Call setExecutionService() at startup.');
    }
    return executionServiceInstance;
}

export function setExecutionService(service: ExecutionService): void {
    executionServiceInstance = service;
}
