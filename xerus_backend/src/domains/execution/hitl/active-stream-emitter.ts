// Active Stream Emitter
// Routes HITLHandler guidance events to the correct execution SSE stream.
// Implements HITLSSEEmitter so the singleton HITLHandler can emit to
// whichever stream is handling the current execution.

import type { HITLSSEEmitter } from './hitl.handler';
import type { StreamEvent, StreamEventType } from '../types';
import type { StreamingResponse } from '../streaming/stream.handler';

export class ActiveStreamEmitter implements HITLSSEEmitter {
    private streams = new Map<string, StreamingResponse>();

    /** Register an execution's stream. Call when execution starts. */
    register(executionId: string, stream: StreamingResponse): void {
        this.streams.set(executionId, stream);
    }

    /** Unregister an execution's stream. Call when execution ends. */
    unregister(executionId: string): void {
        this.streams.delete(executionId);
    }

    /** Emit a StreamEvent to the registered stream for that execution_id. */
    emit(event: StreamEvent): void {
        const stream = this.streams.get(event.execution_id);
        if (!stream || stream.isClosed()) {
            console.warn(
                `[ActiveStreamEmitter] No active stream for execution ${event.execution_id}, dropping ${event.type} event`,
            );
            return;
        }
        stream.send(event.type as StreamEventType, event.content, event.meta);
    }
}
