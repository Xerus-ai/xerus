// Execution Queue Service Tests — State Queries, Cleanup, Cancel, Multi-User
// Split from execution-queue.service.test.ts for the 400-line limit.

import { ExecutionQueueService } from '../execution-queue.service';
import { CreateExecutionRequest, TriggerType } from '../execution-lane.types';

describe('ExecutionQueueService — state & lifecycle', () => {
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

    describe('getQueuePosition', () => {
        it('should return correct position for queued request', () => {
            const service = new ExecutionQueueService();
            const pos1 = service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            const pos2 = service.enqueue(createRequest(TEST_AGENT_SLUG_2));
            const pos3 = service.enqueue(createRequest(TEST_AGENT_SLUG_3));

            expect(service.getQueuePosition(pos1.request_id)?.position).toBe(0);
            expect(service.getQueuePosition(pos2.request_id)?.position).toBe(1);
            expect(service.getQueuePosition(pos3.request_id)?.position).toBe(2);
        });

        it('should return null for non-existent request', () => {
            const service = new ExecutionQueueService();

            const position = service.getQueuePosition('non-existent');

            expect(position).toBeNull();
        });

        it('should return null for already acquired request', () => {
            const service = new ExecutionQueueService();
            const pos = service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.acquire(TEST_USER_ID);

            const position = service.getQueuePosition(pos.request_id);

            expect(position).toBeNull();
        });
    });

    describe('getActiveLanes', () => {
        it('should return empty array for user with no active lanes', () => {
            const service = new ExecutionQueueService();

            const lanes = service.getActiveLanes(TEST_USER_ID);

            expect(lanes).toEqual([]);
        });

        it('should return all active lanes for user', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2));

            service.acquire(TEST_USER_ID);
            service.acquire(TEST_USER_ID);

            const lanes = service.getActiveLanes(TEST_USER_ID);

            expect(lanes.length).toBe(2);
            expect(lanes.map((l) => l.agent_slug).sort()).toEqual([TEST_AGENT_SLUG_1, TEST_AGENT_SLUG_2]);
        });
    });

    describe('isAgentRunning', () => {
        it('should return false when agent not running', () => {
            const service = new ExecutionQueueService();

            expect(service.isAgentRunning(TEST_USER_ID, TEST_AGENT_SLUG_1)).toBe(false);
        });

        it('should return false when agent only queued', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));

            expect(service.isAgentRunning(TEST_USER_ID, TEST_AGENT_SLUG_1)).toBe(false);
        });

        it('should return true when agent has active lane', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.acquire(TEST_USER_ID);

            expect(service.isAgentRunning(TEST_USER_ID, TEST_AGENT_SLUG_1)).toBe(true);
        });

        it('should allow enqueue when agent is running (queued behind active)', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.acquire(TEST_USER_ID);

            const pos = service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            expect(pos.position).toBe(0);
            expect(service.getPendingCount(TEST_USER_ID)).toBe(1);
        });

        it('should allow multiple pending messages for same agent while running', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.acquire(TEST_USER_ID);
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            const pos = service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            expect(pos.position).toBe(1);
            expect(service.getPendingCount(TEST_USER_ID)).toBe(2);
        });
    });

    describe('isAgentQueued', () => {
        it('should return true when agent is in queue', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));

            expect(service.isAgentQueued(TEST_USER_ID, TEST_AGENT_SLUG_1)).toBe(true);
        });

        it('should return false when agent not in queue', () => {
            const service = new ExecutionQueueService();

            expect(service.isAgentQueued(TEST_USER_ID, TEST_AGENT_SLUG_1)).toBe(false);
        });

        it('should return false after agent acquired', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.acquire(TEST_USER_ID);

            expect(service.isAgentQueued(TEST_USER_ID, TEST_AGENT_SLUG_1)).toBe(false);
        });
    });

    describe('getUserQueueState', () => {
        it('should return complete state for user', () => {
            const service = new ExecutionQueueService({ max_concurrent: 3 });
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2));
            service.enqueue(createRequest(TEST_AGENT_SLUG_3));

            service.acquire(TEST_USER_ID);

            const state = service.getUserQueueState(TEST_USER_ID);

            expect(state.user_id).toBe(TEST_USER_ID);
            expect(state.active_lanes.length).toBe(1);
            expect(state.pending_count).toBe(2);
            expect(state.available_slots).toBe(2);
        });
    });

    describe('cleanupStaleLanes', () => {
        it('should remove lanes older than timeout', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            const lane = service.acquire(TEST_USER_ID);

            (lane as any).started_at = new Date(Date.now() - 60000);

            const cleaned = service.cleanupStaleLanes(30000);

            expect(cleaned.length).toBe(1);
            expect(cleaned[0].user_id).toBe(TEST_USER_ID);
            expect(cleaned[0].agent_slug).toBe(TEST_AGENT_SLUG_1);
            expect(cleaned[0].age_ms).toBeGreaterThanOrEqual(60000);
            expect(service.getActiveCount(TEST_USER_ID)).toBe(0);
        });

        it('should not remove lanes within timeout', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.acquire(TEST_USER_ID);

            const cleaned = service.cleanupStaleLanes(60000);

            expect(cleaned.length).toBe(0);
            expect(service.getActiveCount(TEST_USER_ID)).toBe(1);
        });

        it('should use default timeout from config', () => {
            const service = new ExecutionQueueService({ stale_timeout_ms: 1000 });
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            const lane = service.acquire(TEST_USER_ID);

            (lane as any).started_at = new Date(Date.now() - 2000);

            const cleaned = service.cleanupStaleLanes();

            expect(cleaned.length).toBe(1);
        });

        it('should include lane details for auditing', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            const lane = service.acquire(TEST_USER_ID);

            (lane as any).started_at = new Date(Date.now() - 60000);

            const cleaned = service.cleanupStaleLanes(30000);

            expect(cleaned.length).toBe(1);
            expect(cleaned[0]).toHaveProperty('lane_id');
            expect(cleaned[0]).toHaveProperty('user_id');
            expect(cleaned[0]).toHaveProperty('agent_slug');
            expect(cleaned[0]).toHaveProperty('request_id');
            expect(cleaned[0]).toHaveProperty('started_at');
            expect(cleaned[0]).toHaveProperty('age_ms');
            expect(cleaned[0]).toHaveProperty('timeout_ms');
        });
    });

    describe('cancel', () => {
        it('should remove pending request from queue', () => {
            const service = new ExecutionQueueService();
            const pos = service.enqueue(createRequest(TEST_AGENT_SLUG_1));

            const cancelled = service.cancel(pos.request_id);

            expect(cancelled).toBe(true);
            expect(service.getPendingCount(TEST_USER_ID)).toBe(0);
        });

        it('should return false for non-existent request', () => {
            const service = new ExecutionQueueService();

            expect(service.cancel('non-existent')).toBe(false);
        });

        it('should return false for already acquired request', () => {
            const service = new ExecutionQueueService();
            const pos = service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.acquire(TEST_USER_ID);

            expect(service.cancel(pos.request_id)).toBe(false);
        });

        it('should allow same agent to be enqueued after cancel', () => {
            const service = new ExecutionQueueService();
            const pos = service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.cancel(pos.request_id);

            const pos2 = service.enqueue(createRequest(TEST_AGENT_SLUG_1));

            expect(pos2.position).toBe(0);
        });
    });

    describe('getActiveCount', () => {
        it('should return 0 for user with no lanes', () => {
            const service = new ExecutionQueueService();

            expect(service.getActiveCount(TEST_USER_ID)).toBe(0);
        });

        it('should return correct count of active lanes', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2));

            service.acquire(TEST_USER_ID);
            expect(service.getActiveCount(TEST_USER_ID)).toBe(1);

            service.acquire(TEST_USER_ID);
            expect(service.getActiveCount(TEST_USER_ID)).toBe(2);
        });
    });

    describe('getPendingCount', () => {
        it('should return 0 for empty queue', () => {
            const service = new ExecutionQueueService();

            expect(service.getPendingCount(TEST_USER_ID)).toBe(0);
        });

        it('should return correct count of pending requests', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2));

            expect(service.getPendingCount(TEST_USER_ID)).toBe(2);
        });

        it('should decrease after acquire', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2));

            service.acquire(TEST_USER_ID);

            expect(service.getPendingCount(TEST_USER_ID)).toBe(1);
        });
    });

    describe('waitForAgentAvailable', () => {
        it('should resolve immediately when agent is not running', async () => {
            const service = new ExecutionQueueService();

            await service.waitForAgentAvailable(TEST_USER_ID, TEST_AGENT_SLUG_1);
        });

        it('should resolve when agent lane is released', async () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            const lane = service.acquire(TEST_USER_ID);

            const waitPromise = service.waitForAgentAvailable(TEST_USER_ID, TEST_AGENT_SLUG_1);

            setTimeout(() => service.release(lane!.lane_id), 50);

            await waitPromise;
            expect(service.isAgentRunning(TEST_USER_ID, TEST_AGENT_SLUG_1)).toBe(false);
        });

        it('should reject when abort signal fires', async () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            service.acquire(TEST_USER_ID);

            const ac = new AbortController();
            const waitPromise = service.waitForAgentAvailable(TEST_USER_ID, TEST_AGENT_SLUG_1, ac.signal);

            setTimeout(() => ac.abort(), 50);

            await expect(waitPromise).rejects.toThrow('Aborted while waiting for agent availability');
        });

        it('should emit lane_released event on release', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1));
            const lane = service.acquire(TEST_USER_ID);

            const events: { userId: string; agentSlug: string }[] = [];
            service.on('lane_released', (e) => events.push(e));

            service.release(lane!.lane_id);

            expect(events.length).toBe(1);
            expect(events[0].userId).toBe(TEST_USER_ID);
            expect(events[0].agentSlug).toBe(TEST_AGENT_SLUG_1);
        });
    });

    describe('multi-user isolation', () => {
        it('should maintain separate queues per user', () => {
            const service = new ExecutionQueueService();
            service.enqueue(createRequest(TEST_AGENT_SLUG_1, 'user_message', 'user-a'));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2, 'user_message', 'user-b'));

            expect(service.getPendingCount('user-a')).toBe(1);
            expect(service.getPendingCount('user-b')).toBe(1);
        });

        it('should maintain separate lane limits per user', () => {
            const service = new ExecutionQueueService({ max_concurrent: 1 });

            service.enqueue(createRequest(TEST_AGENT_SLUG_1, 'user_message', 'user-a'));
            service.enqueue(createRequest(TEST_AGENT_SLUG_2, 'user_message', 'user-b'));

            const laneA = service.acquire('user-a');
            const laneB = service.acquire('user-b');

            expect(laneA).not.toBeNull();
            expect(laneB).not.toBeNull();
        });
    });
});
