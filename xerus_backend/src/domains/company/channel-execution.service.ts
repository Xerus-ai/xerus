// Channel -> Execution Bridge Service
// When a human sends a message in a channel and no agent is already running,
// finds or creates a conversation for the agent+channel pair and triggers execution.
// Also handles sandbox dual-write (posts.jsonl for agent IPC).

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import type { ExecutionService } from '../execution/execution.service';
import { NullStreamingResponse } from '../execution/streaming/stream.handler';
import { findOrCreateChannelConversation } from '../conversations/workspace-db.service';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import { shellEscape, shellEscapePath } from '../../utils/shell-safety';
import { sanitizeSlug } from '../../shared/slugify';
import { logger } from '../../utils/logger';

const log = logger('ChannelExecution');

// In-memory lock to prevent duplicate concurrent executions for the same agent+channel.
// Key: `${userId}:${agentSlug}:${channelSlug}`, Value: expiry timestamp.
const executionLocks = new Map<string, number>();
const LOCK_TTL_MS = 30_000; // 30 seconds

function acquireLock(userId: string, agentSlug: string, channelSlug: string): boolean {
    const key = `${userId}:${agentSlug}:${channelSlug}`;
    const now = Date.now();
    const existing = executionLocks.get(key);
    if (existing && existing > now) {
        return false; // lock held
    }
    executionLocks.set(key, now + LOCK_TTL_MS);
    return true;
}

function releaseLock(userId: string, agentSlug: string, channelSlug: string): void {
    executionLocks.delete(`${userId}:${agentSlug}:${channelSlug}`);
}

/**
 * Trigger agent execution for a channel message.
 * Creates a NullStreamingResponse (no SSE listener) and delegates to ExecutionService.
 * The agent's response flows back to channel_messages via the runner's outbound
 * message-bridge pipeline (runner -> message-bridge.handleOutboundMessage -> workspace DB).
 * Uses an in-memory lock to prevent duplicate concurrent executions per agent+channel.
 */
export async function triggerChannelExecution(
    executionService: ExecutionService,
    provider: DaytonaProvider,
    sandboxId: string,
    userId: string,
    agentSlug: string,
    messageContent: string,
    channelSlug: string,
): Promise<void> {
    // Debounce: prevent concurrent executions for the same agent+channel pair
    if (!acquireLock(userId, agentSlug, channelSlug)) {
        log.debug('Execution already in progress for agent+channel, skipping', {
            channel: channelSlug,
            agent: agentSlug,
        });
        return;
    }

    try {
        // Find or create a conversation linked to this agent+channel
        const conversation = await findOrCreateChannelConversation(
            provider,
            sandboxId,
            agentSlug,
            channelSlug,
        );

        log.info('Triggering channel execution', {
            channel: channelSlug,
            agent: agentSlug,
            conversation_id: conversation.id,
            user_id: userId,
        });

        // Use a NullStreamingResponse since there is no frontend SSE connection.
        // The agent's response will be written to channel_messages by the runner's
        // outbound message flow (runner -> message-bridge -> workspace DB).
        const stream = new NullStreamingResponse();

        await executionService.startExecution({
            request: {
                agentSlug,
                task: messageContent,
                userId,
                conversationId: conversation.id,
                context: {
                    trigger: 'channel_message',
                    channel_slug: channelSlug,
                },
            },
            stream,
            triggerType: 'channel_message',
        });
    } finally {
        releaseLock(userId, agentSlug, channelSlug);
    }
}

/**
 * Append a message entry to the channel's posts.jsonl file on sandbox.
 * This is the agent IPC (inter-process communication) dual-write -- agents
 * read posts.jsonl via ChannelWatcher to discover new messages.
 */
export async function syncMessageToSandbox(
    sandboxService: SandboxService,
    userId: string,
    channelTag: string,
    messageEntry: Record<string, unknown>,
): Promise<void> {
    const status = await sandboxService.getSandboxStatus(userId);
    if (status.status !== 'running' || !status.sandboxId) return;

    const provider = sandboxService.getProvider() as DaytonaProvider;
    if (typeof provider.executeCommand !== 'function') return;

    const parts = channelTag.split('/');
    const domainSlug = sanitizeSlug(parts[0] || '');
    const channelSlug = sanitizeSlug(parts[1] || '');
    const postsDir = `${SANDBOX_CONFIG.workspacePath}/projects/${domainSlug}/channels/${channelSlug}`;
    const postsPath = `${postsDir}/posts.jsonl`;

    const jsonLine = JSON.stringify(messageEntry);
    await provider.executeCommand(
        status.sandboxId,
        `mkdir -p ${shellEscapePath(postsDir)} && printf '%s\\n' ${shellEscape(jsonLine)} >> ${shellEscapePath(postsPath)}`,
    );
}
