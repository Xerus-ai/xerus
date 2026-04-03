// Session Dispatcher
// Concrete SessionDispatcher that bridges MessageBridgeService to SandboxService.
// Looks up agent session handles from the in-memory session map and sends text to stdin.

import type { SessionDispatcher } from '../../inbox/messaging/message-bridge.types';
import type { SandboxService } from './sandbox.service';

const LOG_PREFIX = '[SessionDispatcher]';

/**
 * Create a SessionDispatcher backed by SandboxService.
 * Resolves agent session handles from the per-user SandboxSession.agentSessions map.
 */
export function createSessionDispatcher(sandboxService: SandboxService): SessionDispatcher {
    return {
        async sendToAgent(userId: string, agentSlug: string, message: string): Promise<boolean> {
            const session = sandboxService.getSession(userId);
            if (!session || session.status !== 'running') {
                console.log(`${LOG_PREFIX} No running sandbox for user ${userId}, cannot dispatch to ${agentSlug}`);
                return false;
            }

            const entry = session.agentSessions.get(agentSlug);
            if (!entry) {
                console.log(`${LOG_PREFIX} No active session for agent ${agentSlug} (user ${userId})`);
                return false;
            }

            try {
                await entry.handle.sendInput(message + '\n');
                entry.handle.lastUsedAt = Date.now();
                console.log(`${LOG_PREFIX} Dispatched message to ${agentSlug} (user ${userId})`);
                return true;
            } catch (err) {
                console.error(`${LOG_PREFIX} Failed to dispatch to ${agentSlug}: ${(err as Error).message}`);
                return false;
            }
        },
    };
}
