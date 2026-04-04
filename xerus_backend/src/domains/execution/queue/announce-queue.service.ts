// Subagent Announce Queue Service
// Batches subagent completion notifications for user inbox
// Task: xerus-y5v.4.40

import { logger } from '../../../utils/logger';
import { AnnounceQueueDrainError } from './command-queue.errors';

const log = logger('AnnounceQueueService');

const XERUS_MASTER_SLUG = 'xerus-master';

// -----------------------------------------------------------------------------
// Drop Policies
// -----------------------------------------------------------------------------

export const DROP_POLICIES = ['fifo', 'lifo', 'reject'] as const;

type DropPolicy = (typeof DROP_POLICIES)[number];

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface AnnounceQueueItem {
    subagent_type: string;
    subagent_name: string;
    success: boolean;
    duration_ms: number;
    summary?: string;
    error?: string;
    queued_at: Date;
}

export interface AnnounceContext {
    user_id: string;
    primary_channel_id: string;
    session_id: string;
}

export interface EnqueueResult {
    accepted: boolean;
    dropped: boolean;
    dropped_item?: AnnounceQueueItem;
}

export interface DrainResult {
    drained_count: number;
    skipped?: boolean;
}

export interface AnnounceQueueConfig {
    maxQueueSize?: number;
    debounceDelayMs?: number;
    dropPolicy?: DropPolicy;
}

// -----------------------------------------------------------------------------
// Inbox Writer Interface
// -----------------------------------------------------------------------------

export interface InboxWriter {
    writeToInbox(item: {
        channel_id: string;
        message: string;
        agent_slug: string;
        timestamp: Date;
    }): Promise<{ id: string }>;
}

export interface AnnounceQueueServiceDeps {
    inboxWriter: InboxWriter;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_MAX_QUEUE_SIZE = 50;
const DEFAULT_DEBOUNCE_DELAY_MS = 500;
const DEFAULT_DROP_POLICY: DropPolicy = 'fifo';

// -----------------------------------------------------------------------------
// Announce Queue Service
// -----------------------------------------------------------------------------

export class AnnounceQueueService {
    private readonly deps: AnnounceQueueServiceDeps;
    private readonly context: AnnounceContext;
    private readonly maxQueueSize: number;
    private readonly debounceDelayMs: number;
    private readonly dropPolicy: DropPolicy;

    private queue: AnnounceQueueItem[] = [];
    private drainTimeoutId: NodeJS.Timeout | null = null;

    constructor(
        deps: AnnounceQueueServiceDeps,
        context: AnnounceContext,
        config: AnnounceQueueConfig = {}
    ) {
        this.deps = deps;
        this.context = context;
        this.maxQueueSize = config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
        this.debounceDelayMs = config.debounceDelayMs ?? DEFAULT_DEBOUNCE_DELAY_MS;
        this.dropPolicy = config.dropPolicy ?? DEFAULT_DROP_POLICY;
    }

    // -------------------------------------------------------------------------
    // Queue Operations
    // -------------------------------------------------------------------------

    enqueue(item: AnnounceQueueItem): EnqueueResult {
        if (this.queue.length >= this.maxQueueSize) {
            return this.handleQueueFull(item);
        }

        this.queue.push(item);
        return { accepted: true, dropped: false };
    }

    async drain(): Promise<DrainResult> {
        if (this.queue.length === 0) {
            return { drained_count: 0, skipped: true };
        }

        const itemsToDrain = [...this.queue];

        try {
            const message = this.formatBatchMessage(itemsToDrain);

            await this.deps.inboxWriter.writeToInbox({
                channel_id: this.context.primary_channel_id,
                message,
                agent_slug: XERUS_MASTER_SLUG,
                timestamp: new Date(),
            });

            // Clear queue only on success
            this.queue = [];

            return {
                drained_count: itemsToDrain.length,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const originalError = error instanceof Error ? error : undefined;
            throw new AnnounceQueueDrainError(
                this.context.primary_channel_id,
                itemsToDrain.length,
                errorMessage,
                originalError
            );
        }
    }

    scheduleDrain(delayMs?: number): void {
        // Cancel existing scheduled drain (debounce)
        if (this.drainTimeoutId !== null) {
            clearTimeout(this.drainTimeoutId);
        }

        const delay = delayMs ?? this.debounceDelayMs;

        this.drainTimeoutId = setTimeout(async () => {
            this.drainTimeoutId = null;
            try {
                await this.drain();
            } catch (error) {
                // Scheduled drains are background operations - log error, don't crash
                // Queue remains intact for retry on next scheduleDrain call
                log.error('Scheduled drain failed', { error: error instanceof Error ? error.message : String(error) });
            }
        }, delay);
    }

    dispose(): void {
        if (this.drainTimeoutId !== null) {
            clearTimeout(this.drainTimeoutId);
            this.drainTimeoutId = null;
        }
    }

    // -------------------------------------------------------------------------
    // Queue State
    // -------------------------------------------------------------------------

    getQueueSize(): number {
        return this.queue.length;
    }

    peekAll(): AnnounceQueueItem[] {
        return [...this.queue];
    }

    getMaxQueueSize(): number {
        return this.maxQueueSize;
    }

    getDebounceDelay(): number {
        return this.debounceDelayMs;
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private handleQueueFull(newItem: AnnounceQueueItem): EnqueueResult {
        switch (this.dropPolicy) {
            case 'fifo': {
                const droppedFifo = this.queue.shift();
                this.queue.push(newItem);
                return { accepted: true, dropped: true, dropped_item: droppedFifo };
            }

            case 'lifo': {
                const droppedLifo = this.queue.pop();
                this.queue.push(newItem);
                return { accepted: true, dropped: true, dropped_item: droppedLifo };
            }

            case 'reject':
                return { accepted: false, dropped: true, dropped_item: newItem };

            default: {
                const dropped = this.queue.shift();
                this.queue.push(newItem);
                return { accepted: true, dropped: true, dropped_item: dropped };
            }
        }
    }

    private formatBatchMessage(items: AnnounceQueueItem[]): string {
        if (items.length === 1) {
            return this.formatSingleItem(items[0]);
        }

        return this.formatMultipleItems(items);
    }

    private formatSingleItem(item: AnnounceQueueItem): string {
        const status = item.success ? 'completed' : 'failed';
        const parts: string[] = [];

        parts.push(`**${item.subagent_name}** ${status}`);

        if (item.summary) {
            parts.push(item.summary);
        }

        if (!item.success && item.error) {
            parts.push(`Error: ${item.error}`);
        }

        return parts.join('\n\n');
    }

    private formatMultipleItems(items: AnnounceQueueItem[]): string {
        const successCount = items.filter((i) => i.success).length;
        const failCount = items.length - successCount;

        const lines: string[] = [];

        // Header
        lines.push(`**${items.length} agents completed**`);

        if (failCount > 0) {
            lines.push(`(${successCount} succeeded, ${failCount} failed)`);
        }

        lines.push('');

        // Item list
        for (const item of items) {
            const icon = item.success ? '✓' : '✗';
            let line = `${icon} **${item.subagent_name}**`;

            if (item.summary) {
                line += `: ${item.summary}`;
            }

            if (!item.success && item.error) {
                line += ` (Error: ${item.error})`;
            }

            lines.push(line);
        }

        return lines.join('\n');
    }
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

export function createAnnounceQueueService(
    deps: AnnounceQueueServiceDeps,
    context: AnnounceContext,
    config?: AnnounceQueueConfig
): AnnounceQueueService {
    return new AnnounceQueueService(deps, context, config);
}
