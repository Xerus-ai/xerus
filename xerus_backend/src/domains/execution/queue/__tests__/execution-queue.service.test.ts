// Execution Queue Service Tests — Core Operations
// Tests constructor, enqueue, priority ordering, acquire, release.
// State queries, cleanup, cancel, and multi-user tests are in execution-queue-state.test.ts.

import { ExecutionQueueService } from '../execution-queue.service';
import { CreateExecutionRequest, TRIGGER_PRIORITIES, TriggerType } from '../execution-lane.types';
import { QueueFullError, LaneNotFoundError } from '../execution-queue.errors';

describe('ExecutionQueueService', () => {
    const TEST_USER_ID = 'test-user-001';
    const TEST_AGENT_SLUG_1 = 'agent-1001';
    const TEST_AGENT_SLUG_2 = 'agent-1002';
    const TEST_AGENT_SLUG_3 = 'agent-1003';

    function createRequest(
        agentSlug: string,
        trigger_type: TriggerType = 'user_message',
        userId: string = TEST_USER_ID
    ): CreateExecutionRequest {
        return {
            user_id: userId,
            agent_slug: agentSlug,
            trigger_type,
            prompt: `Test prompt for agent ${agentSlug}`,
        };
    }

    describe('constructor', () => {
        it('should use default config when none provided', () => {
            const service = new ExecutionQueueService();
            const state = service.getUserQueueState(TEST_USER_ID);

            expect(state.available_slots).toBe(3); // Default max_concurrent
        });

        it('should merge provided config with defaults', () => {
            const service = new ExecutionQueueService({ max_concurrent: 5 });
            const state = service.getUserQueueState(TEST_USER_ID);

            expect(state.available_slots).toBe(5);
        });
    });

    describe('enqueue', () => {
        it('should add request to queue and return position', () => {
            const service = new ExecutionQueueService();
            const request = createRequest(TEST_AGENT_SLUG_1);

            const result = service.enqueue(request);

            expect(result.request_id).toBeDefined();
            expect(result.position).toBe(0);
        });

        it('should increment position for subsequent requests', () => {
            const service = new ExecutionQueueService();

            const pos1 = service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            const pos2 = service.enqueue(createRequest(TEST_AGENT_SLUG_2));
            const pos3 = service.enqueue(createRequest(TEST_AGENT_SLUG_3));

            expect(pos1.position).toBe(0);
            expect(pos2.position).toBe(1);
            expect(pos3.position).toBe(2);
        });

        it('should allow multiple pending messages for the same agent', () => {
            const service = new ExecutionQueueService();
            const pos1 = service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            const pos2 = service.enqueue(createRequest(TEST_AGENT_SLUG_1));

            expect(pos1.position).toBe(0);
            expect(pos2.position).toBe(1);
            expect(service.getPendingCount(TEST_USER_ID)).toBe(2);
        });

        it('should throw QueueFullError when queue limit reached', () => {
            const service = new ExecutionQueueService({ max_queue_size: 2 });
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2));

            expect(() => service.enqueue(createRequest(TEST_AGENT_SLUG_3))).toThrow(QueueFullError);
        });

        it('should allow same agent for different users', () => {
            const service = new ExecutionQueueService();
            const pos1 = service.enqueue(createRequest(TEST_AGENT_SLUG_1, 'user_message', 'user-a'));
            const pos2 = service.enqueue(createRequest(TEST_AGENT_SLUG_1, 'user_message', 'user-b'));

            expect(pos1.position).toBe(0);
            expect(pos2.position).toBe(0);
        });
    });

    describe('priority ordering', () => {
        it('should order by priority (lower number = higher priority)', () => {
            const service = new ExecutionQueueService();

            service.enqueue(createRequest(TEST_AGENT_SLUG_1, 'heartbeat')); // priority 5
            service.enqueue(createRequest(TEST_AGENT_SLUG_2, 'user_message')); // priority 1
            service.enqueue(createRequest(TEST_AGENT_SLUG_3, 'schedule')); // priority 4

            const lane1 = service.acquire(TEST_USER_ID);
            expect(lane1?.agent_slug).toBe(TEST_AGENT_SLUG_2); // user_message (priority 1)

            const lane2 = service.acquire(TEST_USER_ID);
            expect(lane2?.agent_slug).toBe(TEST_AGENT_SLUG_3); // schedule (priority 4)

            const lane3 = service.acquire(TEST_USER_ID);
            expect(lane3?.agent_slug).toBe(TEST_AGENT_SLUG_1); // heartbeat (priority 5)
        });

        it('should use FIFO within same priority', () => {
            const service = new ExecutionQueueService();

            service.enqueue(createRequest(TEST_AGENT_SLUG_1, 'heartbeat'));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2, 'heartbeat'));
            service.enqueue(createRequest(TEST_AGENT_SLUG_3, 'heartbeat'));

            const lane1 = service.acquire(TEST_USER_ID);
            const lane2 = service.acquire(TEST_USER_ID);
            const lane3 = service.acquire(TEST_USER_ID);

            expect(lane1?.agent_slug).toBe(TEST_AGENT_SLUG_1);
            expect(lane2?.agent_slug).toBe(TEST_AGENT_SLUG_2);
            expect(lane3?.agent_slug).toBe(TEST_AGENT_SLUG_3);
        });

        it('should correctly prioritize all trigger types', () => {
            const service = new ExecutionQueueService({ max_concurrent: 5 });

            service.enqueue(createRequest('agent-1005', 'heartbeat')); // 5
            service.enqueue(createRequest('agent-1004', 'schedule')); // 4
            service.enqueue(createRequest('agent-1003', 'team')); // 3
            service.enqueue(createRequest('agent-1002', 'mention')); // 2
            service.enqueue(createRequest('agent-1001', 'user_message')); // 1

            expect(TRIGGER_PRIORITIES.user_message).toBe(1);
            expect(TRIGGER_PRIORITIES.mention).toBe(2);
            expect(TRIGGER_PRIORITIES.team).toBe(3);
            expect(TRIGGER_PRIORITIES.schedule).toBe(4);
            expect(TRIGGER_PRIORITIES.heartbeat).toBe(5);

            for (let i = 1001; i <= 1005; i++) {
                const lane = service.acquire(TEST_USER_ID);
                expect(lane?.agent_slug).toBe(`agent-${i}`);
            }
        });
    });

    describe('acquire', () => {
        it('should return lane when slot available', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));

            const lane = service.acquire(TEST_USER_ID);

            expect(lane).not.toBeNull();
            expect(lane!.user_id).toBe(TEST_USER_ID);
            expect(lane!.agent_slug).toBe(TEST_AGENT_SLUG_1);
            expect(lane!.status).toBe('running');
        });

        it('should return null when queue is empty', () => {
            const service = new ExecutionQueueService();

            const lane = service.acquire(TEST_USER_ID);

            expect(lane).toBeNull();
        });

        it('should return null when all lanes are full', () => {
            const service = new ExecutionQueueService({ max_concurrent: 2 });
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2));
            service.enqueue(createRequest(TEST_AGENT_SLUG_3));

            service.acquire(TEST_USER_ID);
            service.acquire(TEST_USER_ID);
            const lane3 = service.acquire(TEST_USER_ID);

            expect(lane3).toBeNull();
        });

        it('should remove request from queue when acquired', () => {
            const service = new ExecutionQueueService();
            const pos = service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.acquire(TEST_USER_ID);

            const position = service.getQueuePosition(pos.request_id);

            expect(position).toBeNull();
        });
    });

    describe('release', () => {
        it('should free lane for new executions', () => {
            const service = new ExecutionQueueService({ max_concurrent: 1 });
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2));

            const lane1 = service.acquire(TEST_USER_ID);
            expect(service.acquire(TEST_USER_ID)).toBeNull(); // No slots

            service.release(lane1!.lane_id);
            const lane2 = service.acquire(TEST_USER_ID);

            expect(lane2).not.toBeNull();
            expect(lane2!.agent_slug).toBe(TEST_AGENT_SLUG_2);
        });

        it('should throw LaneNotFoundError for invalid lane_id', () => {
            const service = new ExecutionQueueService();

            expect(() => service.release('non-existent-lane')).toThrow(LaneNotFoundError);
        });

        it('should decrease active count after release', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));

            const lane = service.acquire(TEST_USER_ID);
            expect(service.getActiveCount(TEST_USER_ID)).toBe(1);

            service.release(lane!.lane_id);
            expect(service.getActiveCount(TEST_USER_ID)).toBe(0);
        });
    });
});
