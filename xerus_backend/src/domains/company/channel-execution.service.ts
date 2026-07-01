// Channel -> Execution Bridge Service
// When a human sends a message in a channel and no agent is already running,
// finds or creates a conversation for the agent+channel pair and triggers execution.
// Also handles sandbox dual-write (posts.jsonl for agent IPC).

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import type { ExecutionService } from '../execution/execution.service';
import { NullStreamingResponse, type StreamSink } from '../execution/streaming/stream.handler';
import { findOrCreateChannelConversation } from '../conversations/workspace-db.service';
import { createSystemEvent } from './company-workspace-db.service';
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
 * If an SSE stream is provided (frontend connected), uses it for real-time progress.
 * Otherwise creates a NullStreamingResponse for background execution.
 * The agent's response is also written to channel_messages at execution end.
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
    triggerType: 'channel_message' | 'task_assigned' = 'channel_message',
    existingStream?: StreamSink,
): Promise<void> {
    // Debounce: prevent concurrent executions for the same agent+channel pair
    if (!acquireLock(userId, agentSlug, channelSlug)) {
        log.info('Execution locked for agent+channel, writing to inbox instead', {
            channel: channelSlug,
            agent: agentSlug,
            trigger: triggerType,
        });
        await writeToAgentInbox(provider, sandboxId, agentSlug, messageContent, channelSlug, triggerType);
        return;
    }

    try {
        const conversation = await findOrCreateChannelConversation(
            provider,
            sandboxId,
            agentSlug,
            channelSlug,
        );

        const stream = existingStream ?? new NullStreamingResponse();

        log.info('Triggering channel execution', {
            channel: channelSlug,
            agent: agentSlug,
            conversation_id: conversation.id,
            user_id: userId,
            has_sse: !!existingStream,
        });

        await executionService.startExecution({
            request: {
                agentSlug,
                task: messageContent,
                userId,
                conversationId: conversation.id,
                context: {
                    trigger: triggerType,
                    channel_slug: channelSlug,
                },
            },
            stream,
            triggerType,
        });
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error('Channel execution failed', { channel: channelSlug, agent: agentSlug, error: errorMsg });
        createSystemEvent(provider, sandboxId, channelSlug,
            `Agent ${agentSlug} couldn't respond: ${errorMsg}`,
            { error_type: 'execution_failure', agent_slug: agentSlug },
        ).catch(sysErr => log.warn('Failed to write execution error as system event', {
            error: sysErr instanceof Error ? sysErr.message : String(sysErr),
        }));
    } finally {
        releaseLock(userId, agentSlug, channelSlug);
    }
}

async function writeToAgentInbox(
    provider: DaytonaProvider,
    sandboxId: string,
    agentSlug: string,
    content: string,
    channelSlug: string,
    trigger: string,
): Promise<void> {
    const ws = SANDBOX_CONFIG.workspacePath;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const inboxDir = `${ws}/agents/${sanitizeSlug(agentSlug)}/inbox`;
    const filename = `${ts}-${trigger}.json`;
    const entry = JSON.stringify({ trigger, channel: channelSlug, content, created_at: new Date().toISOString() });
    const cmd = `mkdir -p ${shellEscapePath(inboxDir)} && printf '%s\\n' ${shellEscape(entry)} > ${shellEscapePath(`${inboxDir}/${filename}`)}`;
    await provider.executeCommand(sandboxId, cmd).catch(err => {
        log.warn('Failed to write to agent inbox', { agent: agentSlug, error: (err as Error).message });
    });
}

/**
 * @deprecated Posts.jsonl is being replaced by workspace.db channel_messages.
 * This dual-write is kept as a transition — agents with old prompts still
 * read posts.jsonl. Remove once all agents read from workspace.db.
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
