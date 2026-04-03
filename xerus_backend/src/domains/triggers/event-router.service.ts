// Event Router Service
// Receives normalized events, matches them to agent triggers, manages
// per-agent event queues, and dispatches to the heartbeat runner.

import { query } from '../../database/connection';
import type { NormalizedEvent, AgentTriggerRow } from './trigger.types';

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
    private queues: Map<number, QueuedEvent[]> = new Map();
    private processing: Set<number> = new Set();
    private rateLimits: Map<number, RateLimitEntry> = new Map();

    /**
     * Route a normalized event to the matching agent trigger.
     *
     * Steps:
     * 1. Look up agent_triggers for agent_id + app_slug + event_type
     * 2. If not found or disabled: return silently (no error)
     * 3. Check rate limit per agent
     * 4. Check concurrency gate: if agent busy, queue the event
     * 5. If agent idle: dispatch immediately
     * 6. Update trigger stats (last_fired_at, fire_count)
     *
     * @returns Object with routed status and optional reason
     */
    async routeEvent(
        agentId: number,
        event: NormalizedEvent
    ): Promise<{ routed: boolean; reason?: string }> {
        // 1. Match trigger
        const trigger = await this.matchTrigger(agentId, event.app, event.event_type);
        if (!trigger) {
            return { routed: false, reason: 'no_matching_trigger' };
        }

        if (!trigger.enabled) {
            return { routed: false, reason: 'trigger_disabled' };
        }

        // 2. Check rate limit
        const maxPerHour = await this.getMaxEventsPerHour(agentId);
        if (this.isRateLimited(agentId, maxPerHour)) {
            console.warn(
                `[EventRouter] Rate limited: agent ${agentId} exceeded ${maxPerHour} events/hour`
            );
            return { routed: false, reason: 'rate_limited' };
        }

        // 3. Record this event against rate limit
        this.recordRateLimitHit(agentId);

        // 4. Check concurrency: is agent currently executing?
        const isLocked = await this.isAgentBusy(agentId);
        if (isLocked) {
            this.enqueue(agentId, event, trigger);
            return { routed: true, reason: 'queued' };
        }

        // 5. Dispatch immediately
        await this.dispatchEvent(agentId, event, trigger);

        return { routed: true };
    }

    /**
     * Process queued events for an agent after its current execution completes.
     * Called by heartbeat runner after execution finishes.
     */
    async processQueue(agentId: number): Promise<number> {
        if (this.processing.has(agentId)) {
            return 0;
        }

        const queue = this.queues.get(agentId);
        if (!queue || queue.length === 0) {
            return 0;
        }

        this.processing.add(agentId);
        let processed = 0;

        try {
            while (queue.length > 0) {
                const isLocked = await this.isAgentBusy(agentId);
                if (isLocked) {
                    break;
                }

                const entry = queue.shift();
                if (!entry) {
                    break;
                }

                await this.dispatchEvent(agentId, entry.event, entry.trigger);
                processed++;
            }
        } finally {
            this.processing.delete(agentId);
        }

        return processed;
    }

    /**
     * Get the current queue depth for an agent.
     */
    getQueueDepth(agentId: number): number {
        return this.queues.get(agentId)?.length ?? 0;
    }

    /**
     * Clear the event queue for an agent.
     */
    clearQueue(agentId: number): void {
        this.queues.delete(agentId);
    }

    // -------------------------------------------------------------------------
    // Private: Trigger Matching
    // -------------------------------------------------------------------------

    private async matchTrigger(
        agentId: number,
        appSlug: string,
        eventType: string
    ): Promise<AgentTriggerRow | null> {
        const result = await query<AgentTriggerRow>(
            `SELECT * FROM agent_triggers
             WHERE agent_id = $1 AND app_slug = $2 AND event_type = $3
             LIMIT 1`,
            [agentId, appSlug, eventType]
        );

        return result.rows[0] ?? null;
    }

    // -------------------------------------------------------------------------
    // Private: Rate Limiting (in-memory, per agent)
    // -------------------------------------------------------------------------

    private isRateLimited(agentId: number, maxPerHour: number): boolean {
        const entry = this.rateLimits.get(agentId);
        if (!entry) {
            return false;
        }

        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        // Window expired, reset
        if (now - entry.window_start > oneHour) {
            this.rateLimits.delete(agentId);
            return false;
        }

        return entry.count >= maxPerHour;
    }

    private recordRateLimitHit(agentId: number): void {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const entry = this.rateLimits.get(agentId);

        if (!entry || now - entry.window_start > oneHour) {
            this.rateLimits.set(agentId, { count: 1, window_start: now });
            return;
        }

        entry.count++;
    }

    private async getMaxEventsPerHour(_agentId: number): Promise<number> {
        // Heartbeat tables deprecated in migration 081. Use sensible default.
        return 60;
    }

    // -------------------------------------------------------------------------
    // Private: Concurrency Gate
    // -------------------------------------------------------------------------

    private async isAgentBusy(agentId: number): Promise<boolean> {
        // Check if agent has a running execution session
        const result = await query<{ count: string }>(
            `SELECT COUNT(*) as count FROM execution_sessions es
             JOIN agent_registry ar ON ar.slug = es.agent_slug
             WHERE ar.id = $1 AND es.status = 'running'`,
            [agentId]
        );
        return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
    }

    // -------------------------------------------------------------------------
    // Private: Event Queue
    // -------------------------------------------------------------------------

    private enqueue(agentId: number, event: NormalizedEvent, trigger: AgentTriggerRow): void {
        let queue = this.queues.get(agentId);
        if (!queue) {
            queue = [];
            this.queues.set(agentId, queue);
        }

        if (queue.length >= MAX_QUEUE_SIZE) {
            const dropped = queue.shift();
            console.warn(
                `[EventRouter] Queue full for agent ${agentId}, dropping oldest event: ` +
                `${dropped?.event.app}.${dropped?.event.event_type}`
            );
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
        agentId: number,
        event: NormalizedEvent,
        trigger: AgentTriggerRow
    ): Promise<void> {
        // Update trigger stats
        await this.updateTriggerStats(trigger.id);

        // Log event dispatch for traceability
        console.log(
            `[EventRouter] Dispatching ${event.app}.${event.event_type} to agent ${agentId} ` +
            `(trigger ${trigger.id})`
        );

        // Create a pending execution session for the triggered event.
        // The execution pipeline picks up pending sessions and runs them.
        try {
            await query(
                `INSERT INTO execution_sessions
                 (workspace_id, agent_slug, status, trigger_type, user_prompt, created_at)
                 SELECT w.id, ar.slug, 'pending', 'event',
                        $3, NOW()
                 FROM agent_registry ar
                 JOIN workspaces w ON w.user_id = ar.user_id
                 WHERE ar.id = $1
                 LIMIT 1`,
                [agentId, trigger.id, `Event: ${event.app}.${event.event_type}`]
            );
        } catch (err) {
            console.error(
                `[EventRouter] Failed to create execution session for agent ${agentId} ` +
                `(${event.app}.${event.event_type}):`,
                err instanceof Error ? err.message : err
            );
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
