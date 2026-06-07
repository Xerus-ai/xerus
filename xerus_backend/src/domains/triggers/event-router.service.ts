// Event Router Service
// Receives normalized events, matches them to agent triggers, manages
// per-agent event queues, and dispatches to the heartbeat runner.

import { query } from '../../database/connection';
import type { NormalizedEvent, AgentTriggerRow } from './trigger.types';
import { logger } from '../../utils/logger';

const log = logger('EventRouter');

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const MAX_QUEUE_SIZE = 10;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface QueuedEvent {
    event: NormalizedEvent;
    trigger: AgentTriggerRow;
    queued_at: Date;
}

interface RateLimitEntry {
    count: number;
    window_start: number;
}

// -----------------------------------------------------------------------------
// Event Router Service
// -----------------------------------------------------------------------------

export class EventRouterService {
    // In-memory state: acceptable for single-instance deployment.
    // Queued events and rate limits reset on restart.
    // Migrate to DB-backed queues if multi-instance deployment is needed.
    private queues: Map<string, QueuedEvent[]> = new Map();
    private processing: Set<string> = new Set();
    private rateLimits: Map<string, RateLimitEntry> = new Map();

    /**
     * Route a normalized event to the matching agent trigger.
     *
     * Steps:
     * 1. Look up agent_triggers for agent_slug + app_slug + event_type
     * 2. If not found or disabled: return silently (no error)
     * 3. Check rate limit per agent
     * 4. Check concurrency gate: if agent busy, queue the event
     * 5. If agent idle: dispatch immediately
     * 6. Update trigger stats (last_fired_at, fire_count)
     *
     * @returns Object with routed status and optional reason
     */
    async routeEvent(
        agentSlug: string,
        event: NormalizedEvent
    ): Promise<{ routed: boolean; reason?: string }> {
        // 1. Match trigger
        const trigger = await this.matchTrigger(agentSlug, event.app, event.event_type);
        if (!trigger) {
            return { routed: false, reason: 'no_matching_trigger' };
        }

        if (!trigger.enabled) {
            return { routed: false, reason: 'trigger_disabled' };
        }

        // 2. Check rate limit
        const maxPerHour = await this.getMaxEventsPerHour(agentSlug);
        if (this.isRateLimited(agentSlug, maxPerHour)) {
            log.warn('Rate limited', { agent_slug: agentSlug, max_per_hour: maxPerHour });
            return { routed: false, reason: 'rate_limited' };
        }

        // 3. Record this event against rate limit
        this.recordRateLimitHit(agentSlug);

        // 4. Check concurrency: is agent currently executing?
        const isLocked = await this.isAgentBusy(agentSlug);
        if (isLocked) {
            this.enqueue(agentSlug, event, trigger);
            return { routed: true, reason: 'queued' };
        }

        // 5. Dispatch immediately
        await this.dispatchEvent(agentSlug, event, trigger);

        return { routed: true };
    }

    /**
     * Process queued events for an agent after its current execution completes.
     * Called by heartbeat runner after execution finishes.
     */
    async processQueue(agentSlug: string): Promise<number> {
        if (this.processing.has(agentSlug)) {
            return 0;
        }

        const queue = this.queues.get(agentSlug);
        if (!queue || queue.length === 0) {
            return 0;
        }

        this.processing.add(agentSlug);
        let processed = 0;

        try {
            while (queue.length > 0) {
                const isLocked = await this.isAgentBusy(agentSlug);
                if (isLocked) {
                    break;
                }

                const entry = queue.shift();
                if (!entry) {
                    break;
                }

                await this.dispatchEvent(agentSlug, entry.event, entry.trigger);
                processed++;
            }
        } finally {
            this.processing.delete(agentSlug);
        }

        return processed;
    }

    /**
     * Get the current queue depth for an agent.
     */
    getQueueDepth(agentSlug: string): number {
        return this.queues.get(agentSlug)?.length ?? 0;
    }

    /**
     * Clear the event queue for an agent.
     */
    clearQueue(agentSlug: string): void {
        this.queues.delete(agentSlug);
    }

    // -------------------------------------------------------------------------
    // Private: Trigger Matching
    // -------------------------------------------------------------------------

    private async matchTrigger(
        agentSlug: string,
        appSlug: string,
        eventType: string
    ): Promise<AgentTriggerRow | null> {
        const result = await query<AgentTriggerRow>(
            `SELECT * FROM agent_triggers
             WHERE agent_slug = $1 AND app_slug = $2 AND event_type = $3
             LIMIT 1`,
            [agentSlug, appSlug, eventType]
        );

        return result.rows[0] ?? null;
    }

    // -------------------------------------------------------------------------
    // Private: Rate Limiting (in-memory, per agent)
    // -------------------------------------------------------------------------

    private isRateLimited(agentSlug: string, maxPerHour: number): boolean {
        const entry = this.rateLimits.get(agentSlug);
        if (!entry) {
            return false;
        }

        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        // Window expired, reset
        if (now - entry.window_start > oneHour) {
            this.rateLimits.delete(agentSlug);
            return false;
        }

        return entry.count >= maxPerHour;
    }

    private recordRateLimitHit(agentSlug: string): void {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const entry = this.rateLimits.get(agentSlug);

        if (!entry || now - entry.window_start > oneHour) {
            this.rateLimits.set(agentSlug, { count: 1, window_start: now });
            return;
        }

        entry.count++;
    }

    private async getMaxEventsPerHour(_agentSlug: string): Promise<number> {
        // Heartbeat tables deprecated in migration 081. Use sensible default.
        return 60;
    }

    // -------------------------------------------------------------------------
    // Private: Concurrency Gate
    // -------------------------------------------------------------------------

    private async isAgentBusy(agentSlug: string): Promise<boolean> {
        // Check if agent has a running execution session
        const result = await query<{ count: string }>(
            `SELECT COUNT(*) as count FROM execution_sessions
             WHERE agent_slug = $1 AND status = 'running'`,
            [agentSlug]
        );
        return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
    }

    // -------------------------------------------------------------------------
    // Private: Event Queue
    // -------------------------------------------------------------------------

    private enqueue(agentSlug: string, event: NormalizedEvent, trigger: AgentTriggerRow): void {
        let queue = this.queues.get(agentSlug);
        if (!queue) {
            queue = [];
            this.queues.set(agentSlug, queue);
        }

        if (queue.length >= MAX_QUEUE_SIZE) {
            const dropped = queue.shift();
            log.warn('Queue full, dropping oldest event', {
                agent_slug: agentSlug,
                dropped_event: `${dropped?.event.app}.${dropped?.event.event_type}`,
            });
        }

        queue.push({
            event,
            trigger,
            queued_at: new Date(),
        });
    }

    // -------------------------------------------------------------------------
    // Private: Dispatch
    // -------------------------------------------------------------------------

    private async dispatchEvent(
        agentSlug: string,
        event: NormalizedEvent,
        trigger: AgentTriggerRow
    ): Promise<void> {
        // Update trigger stats
        await this.updateTriggerStats(trigger.id);

        // Log event dispatch for traceability
        log.info('Dispatching event', {
            app: event.app,
            event_type: event.event_type,
            agent_slug: agentSlug,
            trigger_id: trigger.id,
        });

        // Create a pending execution session for the triggered event.
        // The execution pipeline picks up pending sessions and runs them.
        // Resolve workspace_id via the user_id on the trigger row.
        try {
            await query(
                `INSERT INTO execution_sessions
                 (workspace_id, agent_slug, status, trigger_type, user_prompt, created_at)
                 SELECT w.id, $1, 'pending', 'event',
                        $3, NOW()
                 FROM workspaces w
                 WHERE w.user_id = $2
                 LIMIT 1`,
                [agentSlug, trigger.user_id, `Event: ${event.app}.${event.event_type}`]
            );
        } catch (err) {
            log.error('Failed to create execution session', {
                agent_slug: agentSlug,
                app: event.app,
                event_type: event.event_type,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private async updateTriggerStats(triggerId: number): Promise<void> {
        await query(
            `UPDATE agent_triggers
             SET last_fired_at = NOW(), fire_count = fire_count + 1, updated_at = NOW()
             WHERE id = $1`,
            [triggerId]
        );
    }
}

// Singleton
export const eventRouterService = new EventRouterService();
