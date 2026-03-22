// SSE Registry
// Maps userId:conversationId to a long-lived StreamingResponse.
// One SSE connection per conversation. Multiple executions share the stream.

import type { StreamingResponse } from './stream.handler';

function buildKey(userId: string, conversationId: string): string {
    return `${userId}:${conversationId}`;
}

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class SseRegistry {
    private readonly streams = new Map<string, StreamingResponse>();
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.startSweep();
    }

    private startSweep(): void {
        this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
        this.sweepTimer.unref();
    }

    private sweep(): void {
        for (const [key, stream] of this.streams) {
            if (stream.isClosed()) {
                this.streams.delete(key);
            }
        }
    }

    shutdown(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
    }

    register(userId: string, conversationId: string, stream: StreamingResponse): void {
        const key = buildKey(userId, conversationId);
        const existing = this.streams.get(key);
        if (existing && !existing.isClosed()) {
            existing.close();
        }
        this.streams.set(key, stream);
    }

    get(userId: string, conversationId: string): StreamingResponse | undefined {
        const key = buildKey(userId, conversationId);
        const stream = this.streams.get(key);
        if (stream && stream.isClosed()) {
            this.streams.delete(key);
            return undefined;
        }
        return stream;
    }

    has(userId: string, conversationId: string): boolean {
        return this.get(userId, conversationId) !== undefined;
    }

    unregister(userId: string, conversationId: string): void {
        const key = buildKey(userId, conversationId);
        this.streams.delete(key);
    }

    countForUser(userId: string): number {
        const prefix = `${userId}:`;
        let count = 0;
        const closedKeys: string[] = [];
        for (const [key, stream] of this.streams) {
            if (key.startsWith(prefix)) {
                if (stream.isClosed()) {
                    closedKeys.push(key);
                } else {
                    count++;
                }
            }
        }
        for (const key of closedKeys) {
            this.streams.delete(key);
        }
        return count;
    }

    size(): number {
        return this.streams.size;
    }
}

export const sseRegistry = new SseRegistry();
