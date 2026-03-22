import { Writable } from 'stream';
import { StdoutEmitter, StdoutEvent } from '../stdout-emitter';

function createCapture(): { writable: Writable; lines: string[] } {
    const lines: string[] = [];
    const writable = new Writable({
        write(chunk, _encoding, callback) {
            const text = chunk.toString();
            const newLines = text.split('\n').filter((l: string) => l.trim().length > 0);
            lines.push(...newLines);
            callback();
        },
    });
    return { writable, lines };
}

function parseEvent(line: string): StdoutEvent {
    return JSON.parse(line) as StdoutEvent;
}

describe('StdoutEmitter', () => {
    it('emits JSON line with timestamp using event field', () => {
        const { writable, lines } = createCapture();
        const emitter = new StdoutEmitter(writable);

        emitter.emit({ event: 'health', data: { status: 'ok', uptime_ms: 100, active_sessions: 0 } });

        expect(lines).toHaveLength(1);
        const event = parseEvent(lines[0]);
        expect(event.event).toBe('health');
        expect(event.timestamp).toBeDefined();
        expect(new Date(event.timestamp!).getTime()).toBeGreaterThan(0);
    });

    it('emits session_started event', () => {
        const { writable, lines } = createCapture();
        const emitter = new StdoutEmitter(writable);

        emitter.sessionStarted('seo-writer', 'sess-123', 'claude-sonnet-4-5-20250929', '/workspace/agents/seo-writer');

        const event = parseEvent(lines[0]);
        expect(event.event).toBe('session_started');
        expect(event.agent_slug).toBe('seo-writer');
        expect(event.session_id).toBe('sess-123');
        expect((event.data as Record<string, unknown>).model).toBe('claude-sonnet-4-5-20250929');
    });

    it('emits session_ended event with usage', () => {
        const { writable, lines } = createCapture();
        const emitter = new StdoutEmitter(writable);

        emitter.sessionEnded('seo-writer', 'sess-123', true, 5000, {
            input_tokens: 100,
            output_tokens: 200,
            total_tokens: 300,
        });

        const event = parseEvent(lines[0]);
        expect(event.event).toBe('session_ended');
        const data = event.data as Record<string, unknown>;
        expect(data.success).toBe(true);
        expect(data.duration_ms).toBe(5000);
        const usage = data.usage as Record<string, unknown>;
        expect(usage.input_tokens).toBe(100);
        expect(usage.total_tokens).toBe(300);
    });

    it('emits agent_output event', () => {
        const { writable, lines } = createCapture();
        const emitter = new StdoutEmitter(writable);

        emitter.agentOutput('seo-writer', 'sess-123', 'text', { text: 'hello' });

        const event = parseEvent(lines[0]);
        expect(event.event).toBe('agent_output');
        expect(event.agent_slug).toBe('seo-writer');
    });

    it('emits heartbeat_fired event', () => {
        const { writable, lines } = createCapture();
        const emitter = new StdoutEmitter(writable);

        emitter.heartbeatFired('seo-writer');

        const event = parseEvent(lines[0]);
        expect(event.event).toBe('heartbeat_fired');
        expect(event.agent_slug).toBe('seo-writer');
    });

    it('emits agent_message event', () => {
        const { writable, lines } = createCapture();
        const emitter = new StdoutEmitter(writable);

        emitter.agentMessage('seo-writer', 'marketing', 'seo', 'Published report');

        const event = parseEvent(lines[0]);
        expect(event.event).toBe('agent_message');
        const data = event.data as Record<string, unknown>;
        expect(data.project).toBe('marketing');
        expect(data.channel).toBe('seo');
        expect(data.content).toBe('Published report');
    });

    it('emits error event', () => {
        const { writable, lines } = createCapture();
        const emitter = new StdoutEmitter(writable);

        emitter.error('Something failed', 'EXEC_ERROR', 'seo-writer');

        const event = parseEvent(lines[0]);
        expect(event.event).toBe('error');
        const data = event.data as Record<string, unknown>;
        expect(data.message).toBe('Something failed');
        expect(data.code).toBe('EXEC_ERROR');
        expect(data.agent_slug).toBe('seo-writer');
    });

    it('emits sessions event with unified sessions type', () => {
        const { writable, lines } = createCapture();
        const emitter = new StdoutEmitter(writable);

        emitter.sessionsList([
            { agent_slug: 'seo-writer', session_id: 's1', started_at: '2025-01-01T00:00:00Z', status: 'active' },
        ]);

        const event = parseEvent(lines[0]);
        expect(event.event).toBe('sessions');
        const data = event.data as { sessions: Array<Record<string, unknown>> };
        expect(data.sessions).toHaveLength(1);
        expect(data.sessions[0].agent_slug).toBe('seo-writer');
    });

    it('emits health event', () => {
        const { writable, lines } = createCapture();
        const emitter = new StdoutEmitter(writable);

        emitter.health(10000, 3);

        const event = parseEvent(lines[0]);
        expect(event.event).toBe('health');
        const data = event.data as Record<string, unknown>;
        expect(data.uptime_ms).toBe(10000);
        expect(data.active_sessions).toBe(3);
    });

    it('does not include type field in emitted events', () => {
        const { writable, lines } = createCapture();
        const emitter = new StdoutEmitter(writable);

        emitter.health(1000, 1);

        const raw = JSON.parse(lines[0]) as Record<string, unknown>;
        expect(raw.event).toBe('health');
        expect(raw).not.toHaveProperty('type');
    });
});
