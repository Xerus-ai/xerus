// Runner Health Monitor
// Detects runner process crashes and triggers automatic restart
// Monitors via stdout activity + health probes
// Spec: glass-y5v.4.146

import type { HealthCommand } from './stdin-parser';
import { SANDBOX_CONFIG } from '../sandbox/sandbox.config';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface HealthMonitorConfig {
    health_timeout_ms: number;
    health_probe_interval_ms: number;
    max_restart_attempts: number;
    backoff_base_ms: number;
    backoff_max_ms: number;
    runner_start_command: string;
}

export interface RunnerCrashEvent {
    sandbox_id: string;
    user_id: string;
    action: 'restart' | 'escalate';
    restart_attempt: number;
    timestamp: string;
    reason: string;
}

export interface SandboxHealthStatus {
    sandbox_id: string;
    user_id: string;
    healthy: boolean;
    last_activity: number;
    last_probe_sent: number | null;
    restart_count: number;
}

export interface HealthCheckResult {
    stale: boolean;
    ms_since_activity: number;
}

// Dependency interfaces
export interface HealthMonitorSessionSender {
    sendCommand(sandboxId: string, input: string): Promise<void>;
}

export interface HealthMonitorSandboxManager {
    killSession(sandboxId: string): Promise<void>;
    createSession(sandboxId: string, command: string): Promise<void>;
}

export interface HealthMonitorEventLogger {
    logCrashEvent(event: RunnerCrashEvent): Promise<void>;
}

export interface RunnerHealthMonitorDeps {
    sessionSender: HealthMonitorSessionSender;
    sandboxManager: HealthMonitorSandboxManager;
    eventLogger: HealthMonitorEventLogger;
}

// Internal tracking entry per sandbox
interface MonitorEntry {
    sandbox_id: string;
    user_id: string;
    healthy: boolean;
    last_activity: number;
    last_probe_sent: number | null;
    restart_count: number;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_CONFIG: HealthMonitorConfig = {
    health_timeout_ms: 60_000,
    health_probe_interval_ms: 30_000,
    max_restart_attempts: 3,
    backoff_base_ms: 1_000,
    backoff_max_ms: 30_000,
    runner_start_command: `node ${SANDBOX_CONFIG.runnerScriptPath}`,
};

// -----------------------------------------------------------------------------
// Runner Health Monitor
// -----------------------------------------------------------------------------

export class RunnerHealthMonitor {
    private readonly deps: RunnerHealthMonitorDeps;
    private readonly config: HealthMonitorConfig;
    private entries = new Map<string, MonitorEntry>();

    constructor(deps: RunnerHealthMonitorDeps, config?: Partial<HealthMonitorConfig>) {
        this.deps = deps;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // -------------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------------

    registerSandbox(sandboxId: string, userId: string): void {
        if (this.entries.has(sandboxId)) {
            throw new Error(`Sandbox ${sandboxId} is already being monitored`);
        }

        this.entries.set(sandboxId, {
            sandbox_id: sandboxId,
            user_id: userId,
            healthy: true,
            last_activity: Date.now(),
            last_probe_sent: null,
            restart_count: 0,
        });
    }

    unregisterSandbox(sandboxId: string): void {
        this.entries.delete(sandboxId);
    }

    isMonitoring(sandboxId: string): boolean {
        return this.entries.has(sandboxId);
    }

    // -------------------------------------------------------------------------
    // Activity Tracking
    // -------------------------------------------------------------------------

    recordActivity(sandboxId: string): void {
        const entry = this.entries.get(sandboxId);
        if (entry) {
            entry.last_activity = Date.now();
            entry.healthy = true;
        }
    }

    recordHealthResponse(sandboxId: string): void {
        const entry = this.entries.get(sandboxId);
        if (entry) {
            entry.last_activity = Date.now();
            entry.healthy = true;
        }
    }

    getLastActivity(sandboxId: string): number | undefined {
        return this.entries.get(sandboxId)?.last_activity;
    }

    forceLastActivity(sandboxId: string, timestamp: number): void {
        const entry = this.entries.get(sandboxId);
        if (entry) {
            entry.last_activity = timestamp;
        }
    }

    // -------------------------------------------------------------------------
    // Health Probing
    // -------------------------------------------------------------------------

    async sendHealthProbe(sandboxId: string): Promise<void> {
        const entry = this.entries.get(sandboxId);
        if (!entry) return;

        const command: HealthCommand = { type: 'health' };

        try {
            await this.deps.sessionSender.sendCommand(
                sandboxId,
                JSON.stringify(command)
            );
            entry.last_probe_sent = Date.now();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[HealthMonitor] Health probe failed for ${sandboxId}: ${msg}`);
            entry.healthy = false;
        }
    }

    async checkHealth(sandboxId: string): Promise<HealthCheckResult> {
        const entry = this.entries.get(sandboxId);
        if (!entry) {
            return { stale: true, ms_since_activity: Infinity };
        }

        const msSinceActivity = Date.now() - entry.last_activity;
        const stale = msSinceActivity > this.config.health_timeout_ms;

        if (stale) {
            entry.healthy = false;
        }

        return { stale, ms_since_activity: msSinceActivity };
    }

    // -------------------------------------------------------------------------
    // Crash Recovery
    // -------------------------------------------------------------------------

    async restartRunner(sandboxId: string): Promise<void> {
        const entry = this.entries.get(sandboxId);
        if (!entry) {
            throw new Error(`Sandbox ${sandboxId} is not being monitored`);
        }

        if (entry.restart_count >= this.config.max_restart_attempts) {
            const escalationEvent: RunnerCrashEvent = {
                sandbox_id: sandboxId,
                user_id: entry.user_id,
                action: 'escalate',
                restart_attempt: entry.restart_count,
                timestamp: new Date().toISOString(),
                reason: `Runner exceeded maximum restart attempts (${this.config.max_restart_attempts})`,
            };
            await this.deps.eventLogger.logCrashEvent(escalationEvent);

            throw new Error(
                `Runner for sandbox ${sandboxId} exceeded maximum restart attempts (${this.config.max_restart_attempts})`
            );
        }

        // Kill old session
        try {
            await this.deps.sandboxManager.killSession(sandboxId);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[HealthMonitor] killSession failed for ${sandboxId} (continuing restart): ${msg}`);
        }

        // Start new session
        await this.deps.sandboxManager.createSession(
            sandboxId,
            this.config.runner_start_command
        );

        entry.restart_count++;
        entry.last_activity = Date.now();
        entry.healthy = true;

        const crashEvent: RunnerCrashEvent = {
            sandbox_id: sandboxId,
            user_id: entry.user_id,
            action: 'restart',
            restart_attempt: entry.restart_count,
            timestamp: new Date().toISOString(),
            reason: 'Runner process unresponsive; restarted',
        };
        await this.deps.eventLogger.logCrashEvent(crashEvent);
    }

    // -------------------------------------------------------------------------
    // Backoff Calculation
    // -------------------------------------------------------------------------

    calculateBackoff(attemptNumber: number): number {
        const delay = this.config.backoff_base_ms * Math.pow(2, attemptNumber);
        return Math.min(delay, this.config.backoff_max_ms);
    }

    // -------------------------------------------------------------------------
    // Status
    // -------------------------------------------------------------------------

    getStatus(sandboxId: string): SandboxHealthStatus | null {
        const entry = this.entries.get(sandboxId);
        if (!entry) return null;

        return {
            sandbox_id: entry.sandbox_id,
            user_id: entry.user_id,
            healthy: entry.healthy,
            last_activity: entry.last_activity,
            last_probe_sent: entry.last_probe_sent,
            restart_count: entry.restart_count,
        };
    }

    resetRestartCount(sandboxId: string): void {
        const entry = this.entries.get(sandboxId);
        if (entry) {
            entry.restart_count = 0;
        }
    }

    stopAll(): void {
        this.entries.clear();
    }
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

export function createRunnerHealthMonitor(
    deps: RunnerHealthMonitorDeps,
    config?: Partial<HealthMonitorConfig>
): RunnerHealthMonitor {
    return new RunnerHealthMonitor(deps, config);
}
