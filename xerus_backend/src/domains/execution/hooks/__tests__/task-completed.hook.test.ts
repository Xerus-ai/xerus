// Task Completed Hook Tests
// Tests for task completion tracking and notification via StdoutEmitter

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import {
    TaskCompletedHandler,
    TaskCompletedHandlerDeps,
    TaskCompletedContext,
} from '../task-completed.hook';
import { TaskCompletedInput } from '../hooks.types';
import { StdoutEmitter, StdoutEvent } from '../../runner/stdout-emitter';
import { Writable } from 'stream';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestInput(overrides: Partial<TaskCompletedInput> = {}): TaskCompletedInput {
    return {
        session_id: 'session-123',
        transcript_path: '/workspace/transcript.jsonl',
        cwd: '/workspace',
        task_id: 'task-42',
        task_title: 'Implement user authentication',
        completed_by: 'backend-dev',
        deliverables: ['src/auth/login.ts', 'src/auth/login.test.ts'],
        ...overrides,
    };
}

function createTestContext(overrides: Partial<TaskCompletedContext> = {}): TaskCompletedContext {
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

describe('TaskCompletedHandler', () => {
    let handler: TaskCompletedHandler;
    let buffer: BufferWritable;
    let emitter: StdoutEmitter;
    let context: TaskCompletedContext;

    beforeEach(() => {
        buffer = new BufferWritable();
        emitter = new StdoutEmitter(buffer);
        context = createTestContext();

        const deps: TaskCompletedHandlerDeps = { emitter };
        handler = new TaskCompletedHandler(deps, context);
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

        it('should emit inbox item with task details', async () => {
            const input = createTestInput();

            await handler.handle(input);

            const inboxEvents = buffer.getEventsByType('create_inbox_item');
            expect(inboxEvents).toHaveLength(1);
            expect(inboxEvents[0].data).toMatchObject({
                channel: 'channel-main',
                priority: 'medium',
            });
        });

        it('should emit push notification', async () => {
            const input = createTestInput();

            await handler.handle(input);

            const pushEvents = buffer.getEventsByType('push_notification');
            expect(pushEvents).toHaveLength(1);
            expect(pushEvents[0].data).toMatchObject({
                user_id: 'user-456',
                title: 'Task completed: Implement user authentication',
            });
        });

        it('should emit hook log', async () => {
            const input = createTestInput();

            await handler.handle(input);

            const hookLogs = buffer.getEventsByType('hook_log');
            expect(hookLogs).toHaveLength(1);
            expect(hookLogs[0].data).toMatchObject({
                hook_event: 'TaskCompleted',
                success: true,
            });
        });
    });

    describe('inbox content', () => {
        it('should include completed_by, task_title, and task_id', async () => {
            const input = createTestInput({
                completed_by: 'frontend-dev',
                task_title: 'Build dashboard',
                task_id: 'task-88',
            });

            await handler.handle(input);

            const inboxEvents = buffer.getEventsByType('create_inbox_item');
            const content = (inboxEvents[0].data as { content: string }).content;
            expect(content).toContain('frontend-dev');
            expect(content).toContain('Build dashboard');
            expect(content).toContain('task-88');
        });

        it('should include deliverables when present', async () => {
            const input = createTestInput({
                deliverables: ['api-spec.yaml', 'README.md'],
            });

            await handler.handle(input);

            const inboxEvents = buffer.getEventsByType('create_inbox_item');
            const content = (inboxEvents[0].data as { content: string }).content;
            expect(content).toContain('api-spec.yaml');
            expect(content).toContain('README.md');
        });

        it('should handle missing deliverables', async () => {
            const input = createTestInput({ deliverables: undefined });

            await handler.handle(input);

            const inboxEvents = buffer.getEventsByType('create_inbox_item');
            const content = (inboxEvents[0].data as { content: string }).content;
            expect(content).not.toContain('Deliverables');
        });

        it('should handle empty deliverables array', async () => {
            const input = createTestInput({ deliverables: [] });

            await handler.handle(input);

            const inboxEvents = buffer.getEventsByType('create_inbox_item');
            const content = (inboxEvents[0].data as { content: string }).content;
            expect(content).not.toContain('Deliverables');
        });
    });

    describe('push notification content', () => {
        it('should include deliverable count when present', async () => {
            const input = createTestInput({
                deliverables: ['file1.ts', 'file2.ts', 'file3.ts'],
            });

            await handler.handle(input);

            const pushEvents = buffer.getEventsByType('push_notification');
            const body = (pushEvents[0].data as { body: string }).body;
            expect(body).toContain('3 deliverable(s)');
        });

        it('should use simple message when no deliverables', async () => {
            const input = createTestInput({ deliverables: undefined });

            await handler.handle(input);

            const pushEvents = buffer.getEventsByType('push_notification');
            const body = (pushEvents[0].data as { body: string }).body;
            expect(body).toContain('finished the task');
        });

        it('should include completed_by in push body', async () => {
            const input = createTestInput({ completed_by: 'security-auditor' });

            await handler.handle(input);

            const pushEvents = buffer.getEventsByType('push_notification');
            const body = (pushEvents[0].data as { body: string }).body;
            expect(body).toContain('security-auditor');
        });
    });

    describe('context routing', () => {
        it('should use primary_channel_id for inbox routing', async () => {
            const customContext = createTestContext({
                primary_channel_id: 'project-alpha',
            });
            const customHandler = new TaskCompletedHandler(
                { emitter },
                customContext,
            );
            const input = createTestInput();

            await customHandler.handle(input);

            const inboxEvents = buffer.getEventsByType('create_inbox_item');
            expect((inboxEvents[0].data as { channel: string }).channel).toBe('project-alpha');
        });

        it('should throw when primary_channel_id is missing', async () => {
            const noChannelContext = createTestContext({
                primary_channel_id: undefined,
            });
            const noChannelHandler = new TaskCompletedHandler(
                { emitter },
                noChannelContext,
            );
            const input = createTestInput();

            await expect(noChannelHandler.handle(input)).rejects.toThrow(
                'primary_channel_id is required'
            );
        });

        it('should use agent_slug from context', async () => {
            const slugContext = createTestContext({ agent_slug: 'project-manager' });
            const slugHandler = new TaskCompletedHandler({ emitter }, slugContext);
            const input = createTestInput();

            await slugHandler.handle(input);

            const hookLogs = buffer.getEventsByType('hook_log');
            expect(hookLogs[0].agent_slug).toBe('project-manager');
        });
    });

    describe('event count', () => {
        it('should emit exactly 3 events per handle call', async () => {
            const input = createTestInput();

            await handler.handle(input);

            // create_inbox_item + push_notification + hook_log
            expect(buffer.events).toHaveLength(3);
        });
    });
});
