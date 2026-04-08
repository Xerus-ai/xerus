// Runner Health Monitor Tests
// Tests for crash detection and automatic recovery



import {
    RunnerHealthMonitor,
    RunnerHealthMonitorDeps,
    HealthMonitorConfig,
    RunnerCrashEvent,
} from '../health-monitor';

// In-memory implementations
class InMemorySessionSender {
    public sentCommands: Array<{ sandboxId: string; input: string }> = [];
    public shouldFail = false;

    async sendCommand(sandboxId: string, input: string): Promise<void> {
        if (this.shouldFail) throw new Error('Send failed');
        this.sentCommands.push({ sandboxId, input });
    }
}

class InMemorySandboxManager {
    public killedSessions: string[] = [];
    public createdSessions: Array<{ sandboxId: string; command: string }> = [];
    public shouldFailKill = false;
    public shouldFailCreate = false;

    async killSession(sandboxId: string): Promise<void> {
        if (this.shouldFailKill) throw new Error('Kill failed');
        this.killedSessions.push(sandboxId);
    }

    async createSession(sandboxId: string, command: string): Promise<void> {
        if (this.shouldFailCreate) throw new Error('Create failed');
        this.createdSessions.push({ sandboxId, command });
    }
}

class InMemoryEventLogger {
    public events: RunnerCrashEvent[] = [];

    async logCrashEvent(event: RunnerCrashEvent): Promise<void> {
        this.events.push(event);
    }
}

function createTestConfig(overrides?: Partial<HealthMonitorConfig>): HealthMonitorConfig {
    return {
        health_timeout_ms: 200,
        health_probe_interval_ms: 100,
        max_restart_attempts: 3,
        backoff_base_ms: 50,
        backoff_max_ms: 500,
        runner_start_command: 'claude --output-format stream-json --dangerously-skip-permissions',
        ...overrides,
    };
}

describe('RunnerHealthMonitor', () => {
    let monitor: RunnerHealthMonitor;
    let sender: InMemorySessionSender;
    let sandboxManager: InMemorySandboxManager;
    let eventLogger: InMemoryEventLogger;
    let config: HealthMonitorConfig;

    beforeEach(() => {
        sender = new InMemorySessionSender();
        sandboxManager = new InMemorySandboxManager();
        eventLogger = new InMemoryEventLogger();
        config = createTestConfig();

        const deps: RunnerHealthMonitorDeps = {
            sessionSender: sender,
            sandboxManager,
            eventLogger,
        };

        monitor = new RunnerHealthMonitor(deps, config);
    });

    afterEach(() => {
        monitor.stopAll();
    });

    describe('registerSandbox', () => {
        it('should track a new sandbox for health monitoring', () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            expect(monitor.isMonitoring('sandbox-1')).toBe(true);
        });

        it('should throw when registering duplicate sandbox', () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            expect(() => monitor.registerSandbox('sandbox-1', 'user-1'))
                .toThrow('already being monitored');
        });
    });

    describe('unregisterSandbox', () => {
        it('should stop monitoring a sandbox', () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            monitor.unregisterSandbox('sandbox-1');
            expect(monitor.isMonitoring('sandbox-1')).toBe(false);
        });

        it('should not throw when unregistering unknown sandbox', () => {
            expect(() => monitor.unregisterSandbox('nonexistent')).not.toThrow();
        });
    });

    describe('recordActivity', () => {
        it('should update last activity timestamp', () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            const before = monitor.getLastActivity('sandbox-1');

            // Small delay to ensure timestamp differs
            monitor.recordActivity('sandbox-1');
            const after = monitor.getLastActivity('sandbox-1');

            expect(after).toBeGreaterThanOrEqual(before!);
        });

        it('should return undefined for unknown sandbox', () => {
            expect(monitor.getLastActivity('unknown')).toBeUndefined();
        });
    });

    describe('recordHealthResponse', () => {
        it('should mark sandbox as healthy', () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            monitor.recordHealthResponse('sandbox-1');

            const status = monitor.getStatus('sandbox-1');
            expect(status?.healthy).toBe(true);
        });
    });

    describe('sendHealthProbe', () => {
        it('should send health command to sandbox', async () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            await monitor.sendHealthProbe('sandbox-1');

            expect(sender.sentCommands).toHaveLength(1);
            expect(sender.sentCommands[0].sandboxId).toBe('sandbox-1');
            const parsed = JSON.parse(sender.sentCommands[0].input);
            expect(parsed.type).toBe('health');
        });

        it('should mark as unhealthy when send fails', async () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            sender.shouldFail = true;

            await monitor.sendHealthProbe('sandbox-1');

            const status = monitor.getStatus('sandbox-1');
            expect(status?.healthy).toBe(false);
        });
    });

    describe('checkHealth', () => {
        it('should detect stale sandbox as unhealthy', async () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            // Force last_activity to be old
            monitor.forceLastActivity('sandbox-1', Date.now() - 300_000);

            const result = await monitor.checkHealth('sandbox-1');
            expect(result.stale).toBe(true);
        });

        it('should detect active sandbox as healthy', async () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            monitor.recordActivity('sandbox-1');

            const result = await monitor.checkHealth('sandbox-1');
            expect(result.stale).toBe(false);
        });
    });

    describe('restartRunner', () => {
        it('should kill old session and create new one', async () => {
            monitor.registerSandbox('sandbox-1', 'user-1');

            await monitor.restartRunner('sandbox-1');

            expect(sandboxManager.killedSessions).toContain('sandbox-1');
            expect(sandboxManager.createdSessions).toHaveLength(1);
            expect(sandboxManager.createdSessions[0].sandboxId).toBe('sandbox-1');
        });

        it('should log crash event', async () => {
            monitor.registerSandbox('sandbox-1', 'user-1');

            await monitor.restartRunner('sandbox-1');

            expect(eventLogger.events).toHaveLength(1);
            expect(eventLogger.events[0].sandbox_id).toBe('sandbox-1');
            expect(eventLogger.events[0].user_id).toBe('user-1');
            expect(eventLogger.events[0].action).toBe('restart');
        });

        it('should increment restart count', async () => {
            monitor.registerSandbox('sandbox-1', 'user-1');

            await monitor.restartRunner('sandbox-1');
            await monitor.restartRunner('sandbox-1');

            const status = monitor.getStatus('sandbox-1');
            expect(status?.restart_count).toBe(2);
        });

        it('should throw after max restart attempts', async () => {
            monitor.registerSandbox('sandbox-1', 'user-1');

            await monitor.restartRunner('sandbox-1');
            await monitor.restartRunner('sandbox-1');
            await monitor.restartRunner('sandbox-1');

            await expect(monitor.restartRunner('sandbox-1')).rejects.toThrow(
                'exceeded maximum restart attempts'
            );
        });

        it('should log escalation event when max restarts exceeded', async () => {
            monitor.registerSandbox('sandbox-1', 'user-1');

            for (let i = 0; i < 3; i++) {
                await monitor.restartRunner('sandbox-1');
            }

            try {
                await monitor.restartRunner('sandbox-1');
            } catch {
                // Expected
            }

            const lastEvent = eventLogger.events[eventLogger.events.length - 1];
            expect(lastEvent.action).toBe('escalate');
        });
    });

    describe('calculateBackoff', () => {
        it('should calculate exponential backoff', () => {
            expect(monitor.calculateBackoff(0)).toBe(50);  // base
            expect(monitor.calculateBackoff(1)).toBe(100); // base * 2
            expect(monitor.calculateBackoff(2)).toBe(200); // base * 4
        });

        it('should cap at max backoff', () => {
            expect(monitor.calculateBackoff(10)).toBeLessThanOrEqual(500);
        });
    });

    describe('getStatus', () => {
        it('should return null for unknown sandbox', () => {
            expect(monitor.getStatus('unknown')).toBeNull();
        });

        it('should return complete status', () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            const status = monitor.getStatus('sandbox-1');

            expect(status).not.toBeNull();
            expect(status!.sandbox_id).toBe('sandbox-1');
            expect(status!.healthy).toBe(true);
            expect(status!.restart_count).toBe(0);
        });
    });

    describe('stopAll', () => {
        it('should unregister all sandboxes', () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            monitor.registerSandbox('sandbox-2', 'user-2');

            monitor.stopAll();

            expect(monitor.isMonitoring('sandbox-1')).toBe(false);
            expect(monitor.isMonitoring('sandbox-2')).toBe(false);
        });
    });

    describe('resetRestartCount', () => {
        it('should reset restart count after successful recovery', async () => {
            monitor.registerSandbox('sandbox-1', 'user-1');
            await monitor.restartRunner('sandbox-1');

            expect(monitor.getStatus('sandbox-1')?.restart_count).toBe(1);

            monitor.resetRestartCount('sandbox-1');

            expect(monitor.getStatus('sandbox-1')?.restart_count).toBe(0);
        });
    });
});
