// StreamingResponse Tests
// Tests for SSE streaming handler

import { Response } from 'express';
import { StreamingResponse } from '../stream.handler';

// -----------------------------------------------------------------------------
// Test Utilities
// -----------------------------------------------------------------------------

interface MockResponse {
    headers: Record<string, string>;
    chunks: string[];
    ended: boolean;
    closeHandler: (() => void) | null;
}

function createMockResponse(): Response & { _mock: MockResponse } {
    const mock: MockResponse = {
        headers: {},
        chunks: [],
        ended: false,
        closeHandler: null,
    };

    const res = {
        _mock: mock,
        setHeader: (key: string, value: string) => {
            mock.headers[key] = value;
        },
        flushHeaders: () => {},
        write: (chunk: string) => {
            mock.chunks.push(chunk);
            return true;
        },
        end: () => {
            mock.ended = true;
        },
        on: (event: string, handler: () => void) => {
            if (event === 'close') {
                mock.closeHandler = handler;
            }
            return res;
        },
    } as unknown as Response & { _mock: MockResponse };

    return res;
}

function parseSSEData(chunk: string): unknown {
    const match = chunk.match(/^data: (.+)\n\n$/);
    if (!match) {
        throw new Error(`Invalid SSE format: ${chunk}`);
    }
    return JSON.parse(match[1]);
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('StreamingResponse', () => {
    describe('constructor', () => {
        it('should set SSE headers', () => {
            const res = createMockResponse();
            new StreamingResponse(res);

            expect(res._mock.headers['Content-Type']).toBe('text/event-stream');
            expect(res._mock.headers['Cache-Control']).toBe('no-cache');
            expect(res._mock.headers['Connection']).toBe('keep-alive');
            expect(res._mock.headers['X-Accel-Buffering']).toBe('no');
        });

        it('should generate execution ID when not provided', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res);

            expect(stream.getExecutionId()).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
            );
        });

        it('should use provided execution ID', () => {
            const res = createMockResponse();
            const executionId = 'test-execution-123';
            const stream = new StreamingResponse(res, executionId);

            expect(stream.getExecutionId()).toBe(executionId);
        });
    });

    describe('send', () => {
        it('should write event in SSE format', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.send('token', { text: 'Hello', tokenCount: 1 });

            expect(res._mock.chunks).toHaveLength(1);
            const event = parseSSEData(res._mock.chunks[0]);
            expect(event).toMatchObject({
                type: 'token',
                success: true,
                execution_id: 'exec-123',
                content: { text: 'Hello', tokenCount: 1 },
            });
        });

        it('should include sequence number in meta', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.send('token', { text: 'Hello', tokenCount: 1 });
            stream.send('token', { text: ' World', tokenCount: 1 });

            const event1 = parseSSEData(res._mock.chunks[0]) as { meta: { sequence: number } };
            const event2 = parseSSEData(res._mock.chunks[1]) as { meta: { sequence: number } };

            expect(event1.meta.sequence).toBe(1);
            expect(event2.meta.sequence).toBe(2);
        });

        it('should include custom meta', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.send('progress', { phase: 'start', message: 'Starting', percent: 0 }, { custom: 'value' });

            const event = parseSSEData(res._mock.chunks[0]) as { meta: Record<string, unknown> };
            expect(event.meta.custom).toBe('value');
            expect(event.meta.sequence).toBe(1);
        });

        it('should include parent_tool_use_id when set', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.setParentToolUseId('tool-456');
            stream.send('token', { text: 'Hello', tokenCount: 1 });

            const event = parseSSEData(res._mock.chunks[0]) as { meta: { parent_tool_use_id: string } };
            expect(event.meta.parent_tool_use_id).toBe('tool-456');
        });

        it('should not include parent_tool_use_id after cleared', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.setParentToolUseId('tool-456');
            stream.clearParentToolUseId();
            stream.send('token', { text: 'Hello', tokenCount: 1 });

            const event = parseSSEData(res._mock.chunks[0]) as { meta: Record<string, unknown> };
            expect(event.meta.parent_tool_use_id).toBeUndefined();
        });

        it('should not write after close', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.close();
            stream.send('token', { text: 'Hello', tokenCount: 1 });

            expect(res._mock.chunks).toHaveLength(0);
        });
    });

    describe('sendError', () => {
        it('should send done event with error', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            const error = new Error('Something went wrong');
            stream.sendError(error);

            expect(res._mock.chunks).toHaveLength(1);
            const event = parseSSEData(res._mock.chunks[0]) as {
                type: string;
                success: boolean;
                content: { error: { message: string } };
            };

            expect(event.type).toBe('done');
            expect(event.success).toBe(false);
            expect(event.content.error.message).toBe('Something went wrong');
        });

        it('should keep stream open after error (stream belongs to conversation)', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.sendError(new Error('Error'));

            expect(res._mock.ended).toBe(false);
            expect(stream.isClosed()).toBe(false);
        });

        it('should accept ExecutionErrorInfo', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            const error = {
                message: 'Timeout exceeded',
                code: 'TIMEOUT',
                type: 'timeout' as const,
            };
            stream.sendError(error);

            const event = parseSSEData(res._mock.chunks[0]) as {
                content: { error: { message: string; code: string; type: string } };
            };

            expect(event.content.error.message).toBe('Timeout exceeded');
            expect(event.content.error.code).toBe('TIMEOUT');
            expect(event.content.error.type).toBe('timeout');
        });
    });

    describe('sendDone', () => {
        it('should send done event with final response', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.sendDone(
                'Task completed successfully',
                {
                    totalTokens: 1500,
                    durationMs: 5000,
                    toolCalls: 3,
                    agentsUsed: 1,
                },
                { runId: 42, responseTimeMs: 5000 }
            );

            const event = parseSSEData(res._mock.chunks[0]) as {
                type: string;
                success: boolean;
                content: {
                    finalResponse: string;
                    summary: { totalTokens: number };
                };
                meta: { runId: number };
            };

            expect(event.type).toBe('done');
            expect(event.success).toBe(true);
            expect(event.content.finalResponse).toBe('Task completed successfully');
            expect(event.content.summary.totalTokens).toBe(1500);
            expect(event.meta.runId).toBe(42);
        });

        it('should keep stream open after done (stream belongs to conversation)', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.sendDone('Done', {
                totalTokens: 100,
                durationMs: 1000,
                toolCalls: 0,
                agentsUsed: 1,
            });

            expect(res._mock.ended).toBe(false);
            expect(stream.isClosed()).toBe(false);
        });

        it('should include databaseUpdated flag', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.sendDone(
                'Done',
                { totalTokens: 100, durationMs: 1000, toolCalls: 0, agentsUsed: 1 },
                {},
                { databaseUpdated: true }
            );

            const event = parseSSEData(res._mock.chunks[0]) as {
                content: { databaseUpdated: boolean };
            };
            expect(event.content.databaseUpdated).toBe(true);
        });
    });

    describe('close', () => {
        it('should end response', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.close();

            expect(res._mock.ended).toBe(true);
            expect(stream.isClosed()).toBe(true);
        });

        it('should be idempotent', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            stream.close();
            stream.close();

            expect(res._mock.ended).toBe(true);
        });
    });

    describe('client disconnect', () => {
        it('should mark closed when client disconnects', () => {
            const res = createMockResponse();
            const stream = new StreamingResponse(res, 'exec-123');

            // Simulate client disconnect
            res._mock.closeHandler?.();

            expect(stream.isClosed()).toBe(true);
        });
    });
});
