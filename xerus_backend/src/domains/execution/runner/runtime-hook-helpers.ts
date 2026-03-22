// Runtime Hook Helpers
// Utility functions used by runtime hook builders.

import fs from 'fs';
import path from 'path';

/**
 * Simple per-agent rate limiter for ACE reflection.
 * Limits to 10 reflections per minute per agent.
 */
export function createInMemoryRateLimiter(): { isLimited(agentId: number): boolean; recordAttempt(agentId: number): void } {
    const attempts = new Map<number, number[]>();
    const windowMs = 60_000;
    const maxPerWindow = 10;

    return {
        isLimited(agentId: number): boolean {
            const now = Date.now();
            const agentAttempts = (attempts.get(agentId) ?? []).filter(t => now - t < windowMs);
            attempts.set(agentId, agentAttempts);
            return agentAttempts.length >= maxPerWindow;
        },
        recordAttempt(agentId: number): void {
            const now = Date.now();
            const agentAttempts = (attempts.get(agentId) ?? []).filter(t => now - t < windowMs);
            agentAttempts.push(now);
            attempts.set(agentId, agentAttempts);
        },
    };
}

export function scanDirRecursive(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...scanDirRecursive(fullPath));
        } else {
            results.push(fullPath);
        }
    }
    return results;
}
