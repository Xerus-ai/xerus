// Teammate Idle Hook Tests
// Tests for teammate idle notification routing via StdoutEmitter



import {
    TeammateIdleHandler,
    TeammateIdleHandlerDeps,
    TeammateIdleContext,
} from '../teammate-idle.hook';
import { TeammateIdleInput } from '../hooks.types';
import { StdoutEmitter, StdoutEvent } from '../../runner/stdout-emitter';
import { Writable } from 'stream';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestInput(overrides: Partial<TeammateIdleInput> = {}): TeammateIdleInput {
    return {
        session_id: 'session-123',
        transcript_path: '/workspace/transcript.jsonl',
        cwd: '/workspace',
        teammate_id: 'teammate-abc',
        teammate_name: 'code-reviewer',
        last_task_id: 'task-42',
        output_summary: 'Reviewed PR #15 and approved with minor comments.',
        ...overrides,
    };
}

function createTestContext(overrides: Partial<TeammateIdleContext> = {}): TeammateIdleContext {
    return {
        agent_slug: 'team-lead',
        user_id: 'user-456',
        primary_channel_id: 'channel-main',
        ...overrides,
    };
}

class BufferWritable extends Writable {
    public events: StdoutEvent[] = [];

    _write(chunk: Buffer, _encoding: string, callback: () => void): void {
        const line = chunk.toString().trim();
        if (line) {
            this.events.push(JSON.parse(line) as StdoutEvent);
        }
        callback();
    }

    getEventsByType(type: string): StdoutEvent[] {
        return this.events.filter((e) => e.event === type);
    }

    clear(): void {
        this.events = [];
    }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('TeammateIdleHandler', () => {
    let handler: TeammateIdleHandler;
    let buffer: BufferWritable;
    let emitter: StdoutEmitter;
    let context: TeammateIdleContext;

    beforeEach(() => {
        buffer = new BufferWritable();
        emitter = new StdoutEmitter(buffer);
        context = createTestContext();

        const deps: TeammateIdleHandlerDeps = { emitter };
        handler = new TeammateIdleHandler(deps, context);
    });

    afterEach(() => {
        buffer.clear();
    });

    describe('handle', () => {
        it('should return success', async () => {
            const input = createTestInput();

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
        });

        it('should emit push notification with teammate name', async () => {
            const input = createTestInput({ teammate_name: 'data-analyst' });

            await handler.handle(input);

            const pushEvents = buffer.getEventsByType('push_notification');
            expect(pushEvents).toHaveLength(1);
            expect(pushEvents[0].data).toMatchObject({
                user_id: 'user-456',
                title: 'data-analyst is idle',
            });
        });

        it('should emit inbox item for the channel', async () => {
            const input = createTestInput();

            await handler.handle(input);

            const inboxEvents = buffer.getEventsByType('create_inbox_item');
            expect(inboxEvents).toHaveLength(1);
            expect(inboxEvents[0].data).toMatchObject({
                channel: 'channel-main',
                priority: 'low',
            });
        });

        it('should emit hook log', async () => {
            const input = createTestInput();

            await handler.handle(input);

            const hookLogs = buffer.getEventsByType('hook_log');
            expect(hookLogs).toHaveLength(1);
            expect(hookLogs[0].data).toMatchObject({
                hook_event: 'TeammateIdle',
                success: true,
            });
        });
    });

    describe('notification content', () => {
        it('should include output summary in push body when available', async () => {
            const input = createTestInput({
                output_summary: 'Completed code review for auth module.',
            });

            await handler.handle(input);

            const pushEvents = buffer.getEventsByType('push_notification');
            expect((pushEvents[0].data as { body: string }).body).toContain(
                'Completed code review for auth module.'
            );
        });

        it('should use default body when no output summary', async () => {
            const input = createTestInput({ output_summary: undefined });

            await handler.handle(input);

            const pushEvents = buffer.getEventsByType('push_notification');
            expect((pushEvents[0].data as { body: string }).body).toContain(
                'available for new work'
            );
        });

        it('should include task id and summary in inbox content', async () => {
            const input = createTestInput({
                teammate_name: 'researcher',
                last_task_id: 'task-99',
                output_summary: 'Found 3 relevant papers.',
            });

            await handler.handle(input);

            const inboxEvents = buffer.getEventsByType('create_inbox_item');
            const content = (inboxEvents[0].data as { content: string }).content;
            expect(content).toContain('researcher');
            expect(content).toContain('task-99');
            expect(content).toContain('Found 3 relevant papers.');
        });

        it('should handle missing last_task_id gracefully', async () => {
            const input = createTestInput({ last_task_id: undefined });

            await handler.handle(input);

            const inboxEvents = buffer.getEventsByType('create_inbox_item');
            const content = (inboxEvents[0].data as { content: string }).content;
            expect(content).toContain('unknown');
        });
    });

    describe('context routing', () => {
        it('should use primary_channel_id for inbox routing', async () => {
            const customContext = createTestContext({
                primary_channel_id: 'custom-channel',
            });
            const customHandler = new TeammateIdleHandler(
                { emitter },
                customContext,
            );
            const input = createTestInput();

            await customHandler.handle(input);

            const inboxEvents = buffer.getEventsByType('create_inbox_item');
            expect((inboxEvents[0].data as { channel: string }).channel).toBe('custom-channel');
        });

        it('should throw when primary_channel_id is missing', async () => {
            const noChannelContext = createTestContext({
                primary_channel_id: undefined,
            });
            const noChannelHandler = new TeammateIdleHandler(
                { emitter },
                noChannelContext,
            );
            const input = createTestInput();

            await expect(noChannelHandler.handle(input)).rejects.toThrow(
                'primary_channel_id is required'
            );
        });

        it('should use agent_slug from context for emitter calls', async () => {
            const slugContext = createTestContext({ agent_slug: 'xerus-master' });
            const slugHandler = new TeammateIdleHandler({ emitter }, slugContext);
            const input = createTestInput();

            await slugHandler.handle(input);

            const hookLogs = buffer.getEventsByType('hook_log');
            expect(hookLogs[0].agent_slug).toBe('xerus-master');
        });
    });

    describe('event count', () => {
        it('should emit exactly 3 events per handle call', async () => {
            const input = createTestInput();

            await handler.handle(input);

            // push_notification + create_inbox_item + hook_log
            expect(buffer.events).toHaveLength(3);
        });
    });
});
