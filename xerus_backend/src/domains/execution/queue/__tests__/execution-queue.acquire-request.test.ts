import { ExecutionQueueService } from '../execution-queue.service';

describe('ExecutionQueueService.acquireRequest', () => {
    const USER_ID = 'user-1';

    it('claims the specific enqueued request instead of shifting a different queued request', () => {
        const service = new ExecutionQueueService();

        service.enqueue({
            user_id: USER_ID,
            agent_slug: 'higher-priority-agent',
            trigger_type: 'user_message',
            prompt: 'first prompt',
        });

        const second = service.enqueue({
            user_id: USER_ID,
            agent_slug: 'sandbox-agent',
            trigger_type: 'mention',
            prompt: 'second prompt',
        });

        const lane = service.acquireRequest(USER_ID, second.request_id);

        expect(lane).not.toBeNull();
        expect(lane?.request_id).toBe(second.request_id);
        expect(lane?.agent_slug).toBe('sandbox-agent');
    });

    it('returns null when the queued request id does not exist', () => {
        const service = new ExecutionQueueService();

        service.enqueue({
            user_id: USER_ID,
            agent_slug: 'sandbox-agent',
            trigger_type: 'user_message',
            prompt: 'prompt',
        });

        expect(service.acquireRequest(USER_ID, 'missing-request')).toBeNull();
    });
});
