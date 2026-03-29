// Process Registry
// Tracks spawned CLI subprocesses, handles interrupt/kill lifecycle
// Reference: Ductor process_registry.py (PID tracking, SIGTERM->SIGKILL)

import type { ChildProcess } from 'child_process';
import type { Interface as ReadlineInterface } from 'readline';
import type { AdapterType } from './cli-adapters/types';

interface TrackedProcess {
    process: ChildProcess;
    agentSlug: string;
    sessionId: string;
    startedAt: number;
    adapter: AdapterType;
    readline?: ReadlineInterface;
}

/** Grace period between SIGTERM and SIGKILL */
const KILL_GRACE_MS = 2000;

export class ProcessRegistry {
    private readonly processes = new Map<string, TrackedProcess>();

    register(
        agentSlug: string,
        sessionId: string,
        proc: ChildProcess,
        adapter: AdapterType,
    ): void {
        const key = this.key(agentSlug);

        // Kill existing process for same agent (one execution per agent)
        const existing = this.processes.get(key);
        if (existing && existing.process.exitCode === null) {
            // Close readline interface to prevent stale events
            if (existing.readline) {
                existing.readline.close();
            }
            existing.process.kill('SIGTERM');
        }

        this.processes.set(key, {
            process: proc,
            agentSlug,
            sessionId,
            startedAt: Date.now(),
            adapter,
        });

        proc.on('exit', () => {
            // Only delete if this is still the registered process
            const current = this.processes.get(key);
            if (current?.sessionId === sessionId) {
                // Close readline interface on exit
                if (current.readline) {
                    current.readline.close();
                }
                this.processes.delete(key);
            }
        });
    }

    /** Set the readline interface for a tracked process */
    setReadline(agentSlug: string, rl: ReadlineInterface): void {
        const tracked = this.processes.get(this.key(agentSlug));
        if (tracked) {
            tracked.readline = rl;
        }
    }

    findProcess(agentSlug: string): TrackedProcess | undefined {
        return this.processes.get(this.key(agentSlug));
    }

    isRunning(agentSlug: string): boolean {
        const tracked = this.processes.get(this.key(agentSlug));
        return tracked !== undefined && tracked.process.exitCode === null;
    }

    /** Send SIGINT (graceful interrupt) to the agent's CLI process */
    interrupt(agentSlug: string): boolean {
        const tracked = this.processes.get(this.key(agentSlug));
        if (tracked && tracked.process.exitCode === null) {
            tracked.process.kill('SIGINT');
            return true;
        }
        return false;
    }

    /** Send SIGTERM then SIGKILL after grace period */
    kill(agentSlug: string): boolean {
        const tracked = this.processes.get(this.key(agentSlug));
        if (!tracked || tracked.process.exitCode !== null) {
            return false;
        }

        tracked.process.kill('SIGTERM');
        const proc = tracked.process;
        setTimeout(() => {
            if (proc.exitCode === null) {
                proc.kill('SIGKILL');
            }
        }, KILL_GRACE_MS);
        return true;
    }

    /** Kill all tracked processes and wait for them to exit */
    async killAll(): Promise<number> {
        const exitPromises: Promise<void>[] = [];
        let killed = 0;

        for (const [, tracked] of this.processes) {
            if (tracked.process.exitCode === null) {
                const proc = tracked.process;
                // Create promise that resolves when process exits
                const exitPromise = new Promise<void>((resolve) => {
                    const onExit = () => {
                        proc.removeListener('exit', onExit);
                        proc.removeListener('error', onExit);
                        resolve();
                    };
                    proc.once('exit', onExit);
                    proc.once('error', onExit);
                });
                exitPromises.push(exitPromise);

                // Send SIGTERM, escalate to SIGKILL after grace period
                proc.kill('SIGTERM');
                setTimeout(() => {
                    if (proc.exitCode === null) {
                        proc.kill('SIGKILL');
                    }
                }, KILL_GRACE_MS);

                killed++;
            }
        }

        // Wait for all processes to exit
        await Promise.all(exitPromises);
        return killed;
    }

    /** Get all currently active processes */
    getActive(): Array<{
        agentSlug: string;
        sessionId: string;
        startedAt: number;
        adapter: AdapterType;
    }> {
        return Array.from(this.processes.values())
            .filter(t => t.process.exitCode === null)
            .map(t => ({
                agentSlug: t.agentSlug,
                sessionId: t.sessionId,
                startedAt: t.startedAt,
                adapter: t.adapter,
            }));
    }

    /** Write to a running process's stdin (for HITL responses) */
    writeStdin(agentSlug: string, data: string): boolean {
        const tracked = this.processes.get(this.key(agentSlug));
        if (!tracked || tracked.process.exitCode !== null || !tracked.process.stdin) {
            return false;
        }
        tracked.process.stdin.write(data);
        return true;
    }

    private key(agentSlug: string): string {
        return agentSlug;
    }
}
