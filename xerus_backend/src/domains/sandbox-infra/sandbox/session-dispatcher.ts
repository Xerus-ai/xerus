// Session Dispatcher
// Concrete SessionDispatcher that bridges MessageBridgeService to SandboxService.
// Looks up agent session handles from the in-memory session map and sends text to stdin.

import { logger } from '../../../utils/logger';
import type { SessionDispatcher } from '../../inbox/messaging/message-bridge.types';
import type { SandboxService } from './sandbox.service';

const log = logger('SessionDispatcher');

/**
 * Create a SessionDispatcher backed by SandboxService.
 * Resolves agent session handles from the per-user SandboxSession.agentSessions map.
 */
export function createSessionDispatcher(sandboxService: SandboxService): SessionDispatcher {
    return {
        async sendToAgent(userId: string, agentSlug: string, message: string): Promise<boolean> {
            const session = sandboxService.getSession(userId);
            if (!session || session.status !== 'running') {
                log.info('No running sandbox, cannot dispatch', { user_id: userId, agent_slug: agentSlug });
                return false;
            }

            const entry = session.agentSessions.get(agentSlug);
            if (!entry) {
                log.info('No active session for agent', { agent_slug: agentSlug, user_id: userId });
                return false;
            }

            try {
                await entry.handle.sendInput(message + '\n');
                entry.handle.lastUsedAt = Date.now();
                log.debug('Dispatched message', { agent_slug: agentSlug, user_id: userId });
                return true;
            } catch (err) {
                log.error('Failed to dispatch', { agent_slug: agentSlug, error: (err as Error).message });
                return false;
            }
        },
    };
}
