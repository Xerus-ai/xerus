// Persistent Log Buffer
// Extracted from daytona-runner.ts — buffers runner stdout into structured events.
// Started once per runner handle. Subsequent executions read from their start
// position without replaying old events.

import { setMaxListeners } from 'events';
import type { RunnerEvent, ErrorEvent, AgentOutputEvent } from '../../../execution/runner/runner.types';

/**
 * Max buffer entries before trimming old events.
 * At ~200 bytes/event average, 50K entries ~ 10MB.
 * Trim removes the first half when exceeded.
 */
const MAX_BUFFER_SIZE = 50_000;

/**
 * Max lineBuffer size (bytes) before force-flushing as transport output.
 * Protects against malformed streams that never send a newline.
 * 1MB accommodates large tool_result payloads while capping memory.
 */
const MAX_LINE_BUFFER_SIZE = 1_048_576;

// Transport-level synthetic event factories (v2 format)
function transportError(message: string, code: string, recoverable = false): ErrorEvent {
    return { event: 'error', message, code, recoverable };
}

function transportOutput(message: string, phase: string): AgentOutputEvent {
    return {
        event: 'agent_output',
        agent: '_transport',
        session_id: '_transport',
        data: { type: phase, message },
    };
}

type StreamLogsFn = (
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
) => Promise<void>;

/**
 * Persistent log buffer - started once per runner handle.
 * Buffers all stdout events so subsequent executions can read
 * from their start position without replaying old events.
 *
 * When the buffer exceeds MAX_BUFFER_SIZE, entries from the front
 * are trimmed and a `trimOffset` tracks the logical-to-physical
 * index mapping so callers' offsets remain valid.
 */
export class PersistentLogBuffer {
    private buffer: (RunnerEvent | null)[] = [];
    private trimOffset = 0;
    private waiters: (() => void)[] = [];
    private closed = false;
    private lineBuffer = '';

    start(streamLogs: StreamLogsFn): void {
        streamLogs(
            (chunk) => this.onStdout(chunk),
            (chunk) => this.onStderr(chunk),
        ).then(() => {
            this.close();
        }).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            this.buffer.push(transportError(
                `Log stream failed: ${message}`, 'STREAM_ERROR', true,
            ));
            this.close();
        });
    }

    /** Logical position (accounts for trimmed entries). */
    get position(): number {
        return this.trimOffset + this.buffer.length;
    }

    /** Parse a complete line as JSON or wrap as transport output. */
    private pushLine(line: string): void {
        try {
            this.buffer.push(JSON.parse(line) as RunnerEvent);
        } catch {
            this.buffer.push(transportOutput(line, 'stdout'));
        }
    }

    private onStdout(chunk: string): void {
        this.lineBuffer += chunk;
        const lines = this.lineBuffer.split('\n');
        this.lineBuffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            this.pushLine(trimmed);
        }
        if (this.lineBuffer.length > MAX_LINE_BUFFER_SIZE) {
            const overflow = this.lineBuffer.trim();
            if (overflow) this.pushLine(overflow);
            this.lineBuffer = '';
        }
        this.trimIfNeeded();
        this.notifyAll();
    }

    private onStderr(chunk: string): void {
        const trimmed = chunk.trim();
        if (trimmed) {
            this.buffer.push(transportOutput(trimmed, 'stderr'));
            this.trimIfNeeded();
            this.notifyAll();
        }
    }

    private close(): void {
        if (this.closed) return;
        const remaining = this.lineBuffer.trim();
        if (remaining) {
            this.pushLine(remaining);
            this.lineBuffer = '';
        }
        this.closed = true;
        this.buffer.push(null);
        this.notifyAll();
    }

    private notifyAll(): void {
        const fns = this.waiters;
        this.waiters = [];
        for (const fn of fns) fn();
    }

    private trimIfNeeded(): void {
        if (this.buffer.length > MAX_BUFFER_SIZE) {
            const trimCount = Math.floor(this.buffer.length / 2);
            this.buffer = this.buffer.slice(trimCount);
            this.trimOffset += trimCount;
        }
    }

    private toPhysical(logicalPos: number): number {
        return logicalPos - this.trimOffset;
    }

    peek(pos: number): RunnerEvent | null | undefined {
        const physical = this.toPhysical(pos);
        if (physical < 0) return undefined;
        if (physical < this.buffer.length) return this.buffer[physical];
        if (this.closed) return null;
        return undefined;
    }

    async *readFrom(offset: number, abortSignal?: AbortSignal): AsyncGenerator<RunnerEvent> {
        if (abortSignal) {
            try { setMaxListeners(50, abortSignal); } catch { /* Node < 19 fallback */ }
        }
        let pos = Math.max(offset, this.trimOffset);
        while (true) {
            const physical = this.toPhysical(pos);
            if (physical >= 0 && physical < this.buffer.length) {
                const ev = this.buffer[physical];
                pos++;
                if (ev === null) return;
                yield ev;
            } else if (this.closed) {
                return;
            } else {
                if (abortSignal?.aborted) return;
                await new Promise<void>((resolve) => {
                    this.waiters.push(resolve);
                    abortSignal?.addEventListener('abort', () => resolve(), { once: true });
                });
                if (abortSignal?.aborted) return;
            }
        }
    }
}
