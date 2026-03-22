// Heartbeat Runner (v2)
// Per-agent timers that fire query() on schedule inside the sandbox.
// Reads schedule + active_hours from agents/{slug}/config.json
// Checks HEARTBEAT.md for self-prompting support
// Emits heartbeat_fired / heartbeat_skipped via StdoutEmitter
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 4

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import type { HeartbeatConfig, ActiveHoursConfig } from './runner.types';
import type { StdoutEmitter } from './stdout-emitter';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function readFileIfExists(filePath: string): string {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface AgentHeartbeatEntry {
    agent_slug: string;
    config: HeartbeatConfig;
    active_hours: ActiveHoursConfig | null;
    timer: NodeJS.Timeout | null;
    last_fired: string | null;
}

export interface HeartbeatRunnerOptions {
    emitter?: StdoutEmitter;
}

// -----------------------------------------------------------------------------
// Heartbeat Runner
// -----------------------------------------------------------------------------

export class HeartbeatRunner extends EventEmitter {
    private workspacePath: string;
    private heartbeats = new Map<string, AgentHeartbeatEntry>();
    private scanInterval: NodeJS.Timeout | null = null;
    private stopped = false;
    private emitter: StdoutEmitter | null;

    constructor(workspacePath: string, options?: HeartbeatRunnerOptions) {
        super();
        this.workspacePath = workspacePath;
        this.emitter = options?.emitter ?? null;
    }

    start(): void {
        this.stopped = false;
        this.scanAgents();
        this.scanInterval = setInterval(() => this.scanAgents(), 60_000);
    }

    stop(): void {
        this.stopped = true;
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        for (const [, hb] of this.heartbeats) {
            if (hb.timer) {
                clearInterval(hb.timer);
                hb.timer = null;
            }
        }
        this.heartbeats.clear();
    }

    // -------------------------------------------------------------------------
    // Agent scanning
    // -------------------------------------------------------------------------

    private scanAgents(): void {
        const agentsDir = path.join(this.workspacePath, 'agents');
        if (!fs.existsSync(agentsDir)) return;

        const entries = fs.readdirSync(agentsDir);

        for (const slug of entries) {
            if (slug === 'index.json') continue;
            const configPath = path.join(agentsDir, slug, 'config.json');
            if (!fs.existsSync(configPath)) continue;

            const parsed = this.readAgentConfig(configPath);
            if (!parsed) continue;

            const existing = this.heartbeats.get(slug);
            if (existing && this.configMatches(existing.config, parsed.heartbeat)) continue;

            if (existing?.timer) {
                clearInterval(existing.timer);
            }

            this.setupHeartbeat(slug, parsed.heartbeat, parsed.active_hours);
        }
    }

    private readAgentConfig(
        configPath: string
    ): { heartbeat: HeartbeatConfig; active_hours: ActiveHoursConfig | null } | null {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const hb = parsed.heartbeat as Record<string, unknown> | undefined;
        if (!hb) return null;

        const heartbeat: HeartbeatConfig = {
            enabled: hb.enabled === true,
            interval_minutes: Number(hb.interval_minutes) || 60,
            offset_minutes: hb.offset_minutes != null
                ? Number(hb.offset_minutes)
                : undefined,
        };

        let active_hours: ActiveHoursConfig | null = null;
        const ah = parsed.active_hours as Record<string, unknown> | undefined;
        if (ah) {
            active_hours = {
                timezone: String(ah.timezone || 'UTC'),
                start_hour: Number(ah.start_hour) || 0,
                end_hour: Number(ah.end_hour) || 24,
                days: Array.isArray(ah.days) ? (ah.days as number[]) : [0, 1, 2, 3, 4, 5, 6],
            };
        }

        return { heartbeat, active_hours };
    }

    private configMatches(a: HeartbeatConfig, b: HeartbeatConfig): boolean {
        return a.enabled === b.enabled
            && a.interval_minutes === b.interval_minutes
            && a.offset_minutes === b.offset_minutes;
    }

    // -------------------------------------------------------------------------
    // Timer setup
    // -------------------------------------------------------------------------

    private setupHeartbeat(
        agentSlug: string,
        config: HeartbeatConfig,
        activeHours: ActiveHoursConfig | null
    ): void {
        const entry: AgentHeartbeatEntry = {
            agent_slug: agentSlug,
            config,
            active_hours: activeHours,
            timer: null,
            last_fired: null,
        };

        if (config.enabled) {
            const intervalMs = config.interval_minutes * 60 * 1000;
            const offsetMs = (config.offset_minutes || 0) * 60 * 1000;
            const initialDelay = Math.min(offsetMs, intervalMs);

            const startTimer = (): void => {
                entry.timer = setInterval(() => {
                    if (this.stopped) return;
                    this.fireHeartbeat(agentSlug);
                }, intervalMs);
            };

            if (initialDelay > 0) {
                setTimeout(() => {
                    if (this.stopped) return;
                    this.fireHeartbeat(agentSlug);
                    startTimer();
                }, initialDelay);
            } else {
                startTimer();
            }
        }

        this.heartbeats.set(agentSlug, entry);
    }

    // -------------------------------------------------------------------------
    // Heartbeat firing
    // -------------------------------------------------------------------------

    private fireHeartbeat(agentSlug: string): void {
        const entry = this.heartbeats.get(agentSlug);
        if (!entry) return;

        // Check active hours before firing
        if (entry.active_hours && !isWithinActiveHours(entry.active_hours, new Date())) {
            this.emitter?.heartbeatSkipped(agentSlug, 'outside_active_hours');
            this.emit('skip', { agent_slug: agentSlug, reason: 'outside_active_hours' });
            return;
        }

        entry.last_fired = new Date().toISOString();
        const prompt = this.buildHeartbeatPrompt(agentSlug);

        this.emitter?.heartbeatFired(agentSlug);
        this.emit('fire', { agent_slug: agentSlug, prompt });
    }

    private buildHeartbeatPrompt(agentSlug: string): string {
        const agentDir = path.join(this.workspacePath, 'agents', agentSlug);
        const heartbeatMd = readFileIfExists(path.join(agentDir, 'HEARTBEAT.md')).trim();
        const statusMd = readFileIfExists(path.join(agentDir, 'STATUS.md')).trim();
        const soulMd = readFileIfExists(path.join(agentDir, 'SOUL.md')).trim();

        const sections: string[] = [`[Heartbeat] ${agentSlug}`];

        if (statusMd) {
            sections.push(`== Your Current State ==\n${statusMd}`);
        }
        if (soulMd) {
            sections.push(`== Your Identity ==\n${soulMd}`);
        }
        if (heartbeatMd) {
            sections.push(`== Your Schedule ==\n${heartbeatMd}`);
        }

        sections.push('Review your scheduled tasks and pending events. Act on anything due.\nAfter completing heartbeat tasks, update your STATUS.md with current state.');

        return sections.join('\n\n');
    }

    // -------------------------------------------------------------------------
    // Query methods
    // -------------------------------------------------------------------------

    getHeartbeatInfo(agentSlug: string): AgentHeartbeatEntry | undefined {
        return this.heartbeats.get(agentSlug);
    }

    listHeartbeats(): Array<{
        agent_slug: string;
        enabled: boolean;
        interval_minutes: number;
        last_fired: string | null;
    }> {
        return Array.from(this.heartbeats.values()).map(hb => ({
            agent_slug: hb.agent_slug,
            enabled: hb.config.enabled,
            interval_minutes: hb.config.interval_minutes,
            last_fired: hb.last_fired,
        }));
    }
}

// -----------------------------------------------------------------------------
// Active Hours Check (pure function)
// -----------------------------------------------------------------------------

export function isWithinActiveHours(config: ActiveHoursConfig, now: Date = new Date()): boolean {

    // Get current hour and day in the agent's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: config.timezone,
        hour: 'numeric',
        hour12: false,
    });
    const hourStr = formatter.format(now);
    const currentHour = parseInt(hourStr, 10);

    const dayFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: config.timezone,
        weekday: 'short',
    });
    const dayStr = dayFormatter.format(now);
    const dayMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const currentDay = dayMap[dayStr] ?? 0;

    // Check day
    if (!config.days.includes(currentDay)) {
        return false;
    }

    // Check hours (handles wrap-around like start=22, end=6)
    if (config.start_hour <= config.end_hour) {
        return currentHour >= config.start_hour && currentHour < config.end_hour;
    }
    // Wrap-around: active from start to midnight, then midnight to end
    return currentHour >= config.start_hour || currentHour < config.end_hour;
}
