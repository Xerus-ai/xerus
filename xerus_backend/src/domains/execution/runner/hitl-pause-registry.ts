// HITL Pause Registry
// In-memory registry of pending HITL pause requests.
// Bridges PermissionRequest handler (awaits) with stdin hitl_response (resolves).
//
// Flow:
//   1. PermissionRequest handler calls registerPause() - creates Promise, stores resolver
//   2. Handler emits hitl_request via stdout - backend routes to DB + SSE
//   3. User responds via frontend - backend sends hitl_response to stdin
//   4. Stdin handler calls resolvePause() - resolves the Promise
//   5. PermissionRequest handler returns approve/block to SDK

export interface PauseResolutionResult {
    approved: boolean;
    feedback?: string;
}

interface PendingPause {
    resolve: (result: PauseResolutionResult) => void;
    reject: (error: Error) => void;
    createdAt: number;
    toolName: string;
    timer: ReturnType<typeof setTimeout>;
}

const pendingPauses = new Map<string, PendingPause>();

/**
 * Register a new pause and return a Promise that resolves when the user responds.
 * Automatically rejects after timeoutMs with a deny result.
 */
export function registerPause(
    pauseId: string,
    toolName: string,
    timeoutMs: number,
): Promise<PauseResolutionResult> {
    return new Promise<PauseResolutionResult>((resolve, reject) => {
        const timer = setTimeout(() => {
            const pending = pendingPauses.get(pauseId);
            if (pending) {
                pendingPauses.delete(pauseId);
                resolve({ approved: false, feedback: 'Timed out waiting for user response' });
            }
        }, timeoutMs);

        pendingPauses.set(pauseId, { resolve, reject, createdAt: Date.now(), toolName, timer });
    });
}

/**
 * Resolve a pending pause with the user's decision.
 * Returns true if the pause was found and resolved, false if not found.
 */
export function resolvePause(pauseId: string, result: PauseResolutionResult): boolean {
    const pending = pendingPauses.get(pauseId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    pendingPauses.delete(pauseId);
    pending.resolve(result);
    return true;
}

export function hasPendingPause(pauseId: string): boolean {
    return pendingPauses.has(pauseId);
}

export function getPendingPauseCount(): number {
    return pendingPauses.size;
}

/**
 * Clear all pending pauses (e.g., on process shutdown).
 * Rejects all with the given error.
 */
export function clearAllPauses(error: Error): void {
    for (const [id, pending] of pendingPauses) {
        clearTimeout(pending.timer);
        pending.reject(error);
        pendingPauses.delete(id);
    }
}
