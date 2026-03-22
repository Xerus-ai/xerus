// Heartbeat Stagger Service
// Distributes scheduled heartbeats across intervals to prevent resource spikes.
// Only applies to scheduled heartbeats - event and manual triggers bypass stagger.

import { createHash } from 'crypto';
import { HeartbeatConfigRepository, heartbeatConfigRepository } from './heartbeat-config.repository';
import { HeartbeatConfigNotFoundError } from './errors';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const DEFAULT_MAX_CONCURRENT_HEARTBEATS = 10;

// -----------------------------------------------------------------------------
// Pure Functions (exported for testing)
// -----------------------------------------------------------------------------

/**
 * Convert a cron expression to an approximate interval in milliseconds.
 * Handles common patterns: every N minutes, every N hours, daily, weekly.
 * Falls back to 24 hours for complex/unrecognized patterns.
 */
export function cronToIntervalMs(cronExpression: string): number {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) {
        return 24 * 60 * 60 * 1000;
    }

    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

    // Weekly: specific day of week (e.g., "0 9 * * 1")
    if (dayOfWeek !== '*' && !dayOfWeek.startsWith('*/')) {
        return 7 * 24 * 60 * 60 * 1000;
    }

    // Monthly or specific day-of-month: treat as daily
    if (dayOfMonth !== '*' && !dayOfMonth.startsWith('*/')) {
        return 24 * 60 * 60 * 1000;
    }

    // Every N minutes: "*/N * * * *"
    const minuteStep = parseStep(minute);
    if (minuteStep !== null && hour === '*') {
        return minuteStep * 60 * 1000;
    }

    // Every N hours: "0 */N * * *" or "M */N * * *"
    const hourStep = parseStep(hour);
    if (hourStep !== null) {
        return hourStep * 60 * 60 * 1000;
    }

    // Hourly: "0 * * * *" or "N * * * *"
    if (hour === '*' && !minute.includes('/') && !minute.includes(',')) {
        return 60 * 60 * 1000;
    }

    // Daily: specific hour, wildcard day (e.g., "0 9 * * *")
    if (!hour.includes('/') && !hour.includes(',') && !hour.includes('*')) {
        return 24 * 60 * 60 * 1000;
    }

    // Fallback: treat as daily
    return 24 * 60 * 60 * 1000;
}

/**
 * Compute a deterministic stagger offset for an agent within an interval.
 * Uses consistent hashing so the same agent always gets the same slot.
 */
export function computeStaggerOffset(
    agentId: string,
    totalAgents: number,
    intervalMs: number
): number {
    if (totalAgents <= 1) {
        return 0;
    }

    const hash = hashCode(agentId + ':' + intervalMs);
    const slotSize = Math.floor(intervalMs / totalAgents);
    const slotIndex = Math.abs(hash) % totalAgents;

    return slotIndex * slotSize;
}

// -----------------------------------------------------------------------------
// Stagger Offset Result
// -----------------------------------------------------------------------------

export interface StaggerOffsetResult {
    agent_id: number;
    cron_expression: string;
    interval_ms: number;
    stagger_offset_ms: number;
}

// -----------------------------------------------------------------------------
// Service Class
// -----------------------------------------------------------------------------

export class HeartbeatStaggerService {
    private maxConcurrent: number;

    constructor(
        private configRepository: HeartbeatConfigRepository = heartbeatConfigRepository,
        maxConcurrentHeartbeats: number = DEFAULT_MAX_CONCURRENT_HEARTBEATS
    ) {
        this.maxConcurrent = maxConcurrentHeartbeats;
    }

    /**
     * Recalculate stagger offsets for all enabled heartbeat configs belonging to a user.
     * Persists computed offsets to the heartbeat_configs table.
     * Should be called when agents are added, removed, or have their cron changed.
     */
    async recalculateForUser(userId: string): Promise<StaggerOffsetResult[]> {
        const configs = await this.configRepository.listByUserId(userId);
        const enabledConfigs = configs.filter((c) => c.enabled);

        if (enabledConfigs.length === 0) {
            return [];
        }

        // Group configs by cron expression (agents with same interval share the stagger pool)
        const cronGroups = new Map<string, typeof enabledConfigs>();
        for (const config of enabledConfigs) {
            const group = cronGroups.get(config.cron_expression) ?? [];
            group.push(config);
            cronGroups.set(config.cron_expression, group);
        }

        const results: StaggerOffsetResult[] = [];
        const batchUpdates: Array<{ agentId: number; offset: number }> = [];

        for (const [cronExpr, group] of cronGroups) {
            const intervalMs = cronToIntervalMs(cronExpr);

            for (const config of group) {
                const offsetMs = computeStaggerOffset(
                    String(config.agent_id),
                    group.length,
                    intervalMs
                );

                batchUpdates.push({ agentId: config.agent_id, offset: offsetMs });

                results.push({
                    agent_id: config.agent_id,
                    cron_expression: cronExpr,
                    interval_ms: intervalMs,
                    stagger_offset_ms: offsetMs,
                });
            }
        }

        await this.configRepository.batchUpdateOffsets(batchUpdates);

        return results;
    }

    /**
     * Compute the stagger offset for a single agent given the total number
     * of agents sharing the same interval. Does NOT persist - caller decides.
     */
    async computeForAgent(agentId: number, totalAgentsInGroup: number): Promise<number> {
        const config = await this.configRepository.getByAgentId(agentId);
        if (!config) {
            throw new HeartbeatConfigNotFoundError(agentId);
        }

        const intervalMs = cronToIntervalMs(config.cron_expression);
        return computeStaggerOffset(String(agentId), totalAgentsInGroup, intervalMs);
    }

    /**
     * Check if the current time falls within the agent's configured active hours.
     * Returns true if no active hours are set (always active).
     */
    isWithinActiveHours(
        activeHoursStart: string | null,
        activeHoursEnd: string | null,
        timezone: string
    ): boolean {
        if (!activeHoursStart || !activeHoursEnd) {
            return true;
        }

        const now = getCurrentTimeInTimezone(timezone);
        const startMinutes = parseTimeToMinutes(activeHoursStart);
        const endMinutes = parseTimeToMinutes(activeHoursEnd);
        const nowMinutes = now.hours * 60 + now.minutes;

        // Normal window (e.g., 09:00 to 17:00)
        if (startMinutes <= endMinutes) {
            return nowMinutes >= startMinutes && nowMinutes < endMinutes;
        }

        // Overnight window (e.g., 22:00 to 06:00)
        return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    }

    /**
     * Returns the configured maximum concurrent heartbeats per user.
     */
    getMaxConcurrentHeartbeats(): number {
        return this.maxConcurrent;
    }
}

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

/**
 * Parse a cron field step value. Returns the step number for "* /N" patterns, null otherwise.
 */
function parseStep(field: string): number | null {
    const match = field.match(/^\*\/(\d+)$/);
    if (match) {
        return parseInt(match[1], 10);
    }
    return null;
}

/**
 * Simple string hash that produces a 32-bit integer.
 * Deterministic across Node.js versions (uses SHA-256 and takes first 4 bytes).
 */
function hashCode(input: string): number {
    const digest = createHash('sha256').update(input).digest();
    // Read first 4 bytes as unsigned 32-bit integer
    return digest.readUInt32BE(0);
}

/**
 * Parse "HH:MM" string to total minutes since midnight.
 */
function parseTimeToMinutes(timeStr: string): number {
    const [hoursStr, minutesStr] = timeStr.split(':');
    return parseInt(hoursStr, 10) * 60 + parseInt(minutesStr, 10);
}

/**
 * Get current hours and minutes in the given timezone.
 */
function getCurrentTimeInTimezone(timezone: string): { hours: number; minutes: number } {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hours = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const minutes = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);

    return { hours, minutes };
}

// -----------------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------------

export const heartbeatStaggerService = new HeartbeatStaggerService();
