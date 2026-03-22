// Command Queue Service Tests
// Tests backpressure, deadlock prevention, and metrics for command queue

import { CommandQueueService } from '../command-queue.service';
import {
    CreateExecutionRequest,
    TriggerType,
} from '../execution-lane.types';
import { DEFAULT_COMMAND_QUEUE_CONFIG } from '../command-queue.types';
import {
    BackpressureRejectedError,
    QueueOverflowError,
    NestedCallDeadlockError,
} from '../command-queue.errors';

describe('CommandQueueService', () => {
    const TEST_USER_ID = 'test-user-001';
    const TEST_AGENT_SLUG_1 = 'agent-1001';
    const TEST_AGENT_SLUG_2 = 'agent-1002';
    const TEST_AGENT_SLUG_3 = 'agent-1003';

    function createRequest(
        agentSlug: string,
        trigger_type: TriggerType = 'user_message',
        userId: string = TEST_USER_ID,
        parentLaneId?: string
    ): CreateExecutionRequest & { parent_lane_id?: string } {
        return {
            user_id: userId,
            agent_slug: agentSlug,
            trigger_type,
            prompt: `Test prompt for agent ${agentSlug}`,
            parent_lane_id: parentLaneId,
        };
    }

    describe('constructor', () => {
        it('should use default config when none provided', () => {
            const service = new CommandQueueService();
            const metrics = service.getMetrics(TEST_USER_ID);

            expect(metrics.max_queue_size).toBe(DEFAULT_COMMAND_QUEUE_CONFIG.max_queue_size);
        });

        it('should merge provided config with defaults', () => {
            const service = new CommandQueueService({ max_queue_size: 10 });
            const metrics = service.getMetrics(TEST_USER_ID);

            expect(metrics.max_queue_size).toBe(10);
        });
    });

    describe('enqueueCommandInLane', () => {
        it('should add request to queue and return position', () => {
            const service = new CommandQueueService();
            const request = createRequest(TEST_AGENT_SLUG_1);

            const result = service.enqueueCommandInLane(request);

            expect(result.request_id).toBeDefined();
            expect(result.position).toBe(0);
            expect(result.backpressure_action).toBe('accept');
        });

        it('should increment position for subsequent requests', () => {
            const service = new CommandQueueService();

            const pos1 = service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            const pos2 = service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_2));
            const pos3 = service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_3));

            expect(pos1.position).toBe(0);
            expect(pos2.position).toBe(1);
            expect(pos3.position).toBe(2);
        });

        it('should allow same agent for different users', () => {
            const service = new CommandQueueService();
            const pos1 = service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1, 'user_message', 'user-a'));
            const pos2 = service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1, 'user_message', 'user-b'));

            expect(pos1.position).toBe(0);
            expect(pos2.position).toBe(0);
        });
    });

    describe('getQueueSize', () => {
        it('should return 0 for empty queue', () => {
            const service = new CommandQueueService();

            expect(service.getQueueSize(TEST_USER_ID)).toBe(0);
        });

        it('should return correct count of pending requests', () => {
            const service = new CommandQueueService();
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_2));

            expect(service.getQueueSize(TEST_USER_ID)).toBe(2);
        });

        it('should decrease after request is acquired', () => {
            const service = new CommandQueueService();
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_2));

            service.acquireFromQueue(TEST_USER_ID);

            expect(service.getQueueSize(TEST_USER_ID)).toBe(1);
        });
    });

    describe('backpressure detection', () => {
        it('should return accept action when queue is below soft threshold', () => {
            const service = new CommandQueueService({
                max_queue_size: 20,
                soft_limit: 10,
                hard_limit: 15,
            });

            // Add 5 requests (below soft_limit of 10)
            for (let i = 0; i < 5; i++) {
                const result = service.enqueueCommandInLane(createRequest(`agent-${1000 + i}`));
                expect(result.backpressure_action).toBe('accept');
            }
        });

        it('should return delay action when queue is between soft and hard threshold', () => {
            const service = new CommandQueueService({
                max_queue_size: 20,
                soft_limit: 5,
                hard_limit: 10,
            });

            // Fill up to soft limit
            for (let i = 0; i < 5; i++) {
                service.enqueueCommandInLane(createRequest(`agent-${1000 + i}`));
            }

            // Next requests should be delayed
            const result = service.enqueueCommandInLane(createRequest('agent-1005'));
            expect(result.backpressure_action).toBe('delay');
            expect(result.estimated_wait_ms).toBeGreaterThan(0);
        });

        it('should return reject action when queue is at hard threshold', () => {
            const service = new CommandQueueService({
                max_queue_size: 20,
                soft_limit: 5,
                hard_limit: 10,
            });

            // Fill up to hard limit
            for (let i = 0; i < 10; i++) {
                service.enqueueCommandInLane(createRequest(`agent-${1000 + i}`));
            }

            // Next request should be rejected
            expect(() => {
                service.enqueueCommandInLane(createRequest('agent-1010'));
            }).toThrow(BackpressureRejectedError);
        });

        it('should throw QueueOverflowError when max_queue_size is exceeded', () => {
            const service = new CommandQueueService({
                max_queue_size: 5,
                soft_limit: 3,
                hard_limit: 10, // Hard limit > max_queue_size intentionally
            });

            // Fill up to max
            for (let i = 0; i < 5; i++) {
                service.enqueueCommandInLane(createRequest(`agent-${1000 + i}`));
            }

            expect(() => {
                service.enqueueCommandInLane(createRequest('agent-1005'));
            }).toThrow(QueueOverflowError);
        });
    });

    describe('setMaxConcurrency', () => {
        it('should update max concurrent lanes for a user', () => {
            const service = new CommandQueueService({ max_concurrent: 3 });

            service.setMaxConcurrency(TEST_USER_ID, 5);

            const metrics = service.getMetrics(TEST_USER_ID);
            expect(metrics.max_concurrent).toBe(5);
        });

        it('should apply new concurrency limit to future acquisitions', () => {
            const service = new CommandQueueService({ max_concurrent: 1 });

            // Enqueue requests
            for (let i = 0; i < 5; i++) {
                service.enqueueCommandInLane(createRequest(`agent-${1000 + i}`));
            }

            // Acquire one (uses initial max_concurrent of 1)
            service.acquireFromQueue(TEST_USER_ID);

            // Can't acquire more with max_concurrent = 1
            expect(service.acquireFromQueue(TEST_USER_ID)).toBeNull();

            // Increase concurrency
            service.setMaxConcurrency(TEST_USER_ID, 3);

            // Now should be able to acquire more
            const lane2 = service.acquireFromQueue(TEST_USER_ID);
            const lane3 = service.acquireFromQueue(TEST_USER_ID);

            expect(lane2).not.toBeNull();
            expect(lane3).not.toBeNull();
        });

        it('should validate concurrency limits', () => {
            const service = new CommandQueueService();

            expect(() => service.setMaxConcurrency(TEST_USER_ID, 0)).toThrow();
            expect(() => service.setMaxConcurrency(TEST_USER_ID, -1)).toThrow();
            expect(() => service.setMaxConcurrency(TEST_USER_ID, 100)).toThrow(); // exceeds max allowed
        });
    });

    describe('deadlock prevention', () => {
        it('should allow nested agent calls that dont block parent lane', () => {
            const service = new CommandQueueService({ max_concurrent: 1 });

            // Parent request gets a lane
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            const parentLane = service.acquireFromQueue(TEST_USER_ID);

            // Nested call from parent should succeed even though max_concurrent is 1
            const nestedRequest = createRequest(TEST_AGENT_SLUG_2, 'team', TEST_USER_ID, parentLane!.lane_id);
            const nestedResult = service.enqueueCommandInLane(nestedRequest);

            expect(nestedResult.backpressure_action).toBe('accept');

            // Nested call should be able to acquire a lane (bypasses normal limit)
            const nestedLane = service.acquireFromQueue(TEST_USER_ID, parentLane!.lane_id);
            expect(nestedLane).not.toBeNull();
        });

        it('should detect and prevent circular nested calls', () => {
            const service = new CommandQueueService({ max_concurrent: 3 });

            // Parent request gets a lane
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            const parentLane = service.acquireFromQueue(TEST_USER_ID);

            // Nested call from parent
            const nested1Request = createRequest(TEST_AGENT_SLUG_2, 'team', TEST_USER_ID, parentLane!.lane_id);
            service.enqueueCommandInLane(nested1Request);
            const nested1Lane = service.acquireFromQueue(TEST_USER_ID, parentLane!.lane_id);

            // Nested call from nested1
            const nested2Request = createRequest(TEST_AGENT_SLUG_3, 'team', TEST_USER_ID, nested1Lane!.lane_id);
            service.enqueueCommandInLane(nested2Request);
            const nested2Lane = service.acquireFromQueue(TEST_USER_ID, nested1Lane!.lane_id);

            // Circular call back to original agent should be prevented
            const circularRequest = createRequest(TEST_AGENT_SLUG_1, 'team', TEST_USER_ID, nested2Lane!.lane_id);

            expect(() => {
                service.enqueueCommandInLane(circularRequest);
            }).toThrow(NestedCallDeadlockError);
        });

        it('should track nesting depth and prevent excessive depth', () => {
            const service = new CommandQueueService({
                max_concurrent: 10,
                max_nesting_depth: 3,
            });

            // Create a chain of nested calls
            service.enqueueCommandInLane(createRequest('agent-1000'));
            const lane0 = service.acquireFromQueue(TEST_USER_ID);

            service.enqueueCommandInLane(createRequest('agent-1001', 'team', TEST_USER_ID, lane0!.lane_id));
            const lane1 = service.acquireFromQueue(TEST_USER_ID, lane0!.lane_id);

            service.enqueueCommandInLane(createRequest('agent-1002', 'team', TEST_USER_ID, lane1!.lane_id));
            const lane2 = service.acquireFromQueue(TEST_USER_ID, lane1!.lane_id);

            // This exceeds max_nesting_depth of 3
            expect(() => {
                service.enqueueCommandInLane(createRequest('agent-1003', 'team', TEST_USER_ID, lane2!.lane_id));
            }).toThrow(NestedCallDeadlockError);
        });
    });

    describe('queue overflow protection', () => {
        it('should enforce max_queue_size pending per user', () => {
            // Default hard_limit is 15, max_queue_size is 20
            // We need to set hard_limit higher than max_queue_size to test overflow
            const service = new CommandQueueService({
                max_queue_size: 20,
                soft_limit: 10,
                hard_limit: 25, // Higher than max to test overflow specifically
            });

            // Add 20 requests (default max)
            for (let i = 0; i < 20; i++) {
                service.enqueueCommandInLane(createRequest(`agent-${1000 + i}`));
            }

            // 21st should overflow
            expect(() => {
                service.enqueueCommandInLane(createRequest('agent-1020'));
            }).toThrow(QueueOverflowError);
        });

        it('should allow configurable overflow limit', () => {
            const service = new CommandQueueService({ max_queue_size: 5 });

            // Add 5 requests
            for (let i = 0; i < 5; i++) {
                service.enqueueCommandInLane(createRequest(`agent-${1000 + i}`));
            }

            // 6th should overflow
            expect(() => {
                service.enqueueCommandInLane(createRequest('agent-1005'));
            }).toThrow(QueueOverflowError);
        });
    });

    describe('metrics', () => {
        it('should track queue depth', () => {
            const service = new CommandQueueService();

            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_2));

            const metrics = service.getMetrics(TEST_USER_ID);
            expect(metrics.queue_depth).toBe(2);
        });

        it('should calculate average wait time', () => {
            const service = new CommandQueueService();

            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_2));

            // Acquire first request
            service.acquireFromQueue(TEST_USER_ID);

            const metrics = service.getMetrics(TEST_USER_ID);
            expect(metrics.avg_wait_time_ms).toBeGreaterThanOrEqual(0);
        });

        it('should track lane utilization', () => {
            const service = new CommandQueueService({ max_concurrent: 3 });

            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_2));

            service.acquireFromQueue(TEST_USER_ID);
            service.acquireFromQueue(TEST_USER_ID);

            const metrics = service.getMetrics(TEST_USER_ID);
            expect(metrics.lane_utilization).toBeCloseTo(2 / 3);
            expect(metrics.active_lanes).toBe(2);
        });

        it('should track total processed count', () => {
            const service = new CommandQueueService();

            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            const lane = service.acquireFromQueue(TEST_USER_ID);
            service.releaseFromQueue(lane!.lane_id);

            const metrics = service.getMetrics(TEST_USER_ID);
            expect(metrics.total_processed).toBe(1);
        });

        it('should track total rejected count', () => {
            const service = new CommandQueueService({
                max_queue_size: 2,
                soft_limit: 1,
                hard_limit: 2,
            });

            // Fill queue
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_2));

            // Try to add more (will be rejected)
            try {
                service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_3));
            } catch {
                // Expected
            }

            const metrics = service.getMetrics(TEST_USER_ID);
            expect(metrics.total_rejected).toBe(1);
        });

        it('should calculate estimated wait time based on average processing', () => {
            // Use config where soft_limit triggers delay action
            const service = new CommandQueueService({
                soft_limit: 2,
                hard_limit: 10,
                max_queue_size: 20,
            });

            // Process some requests to build history
            for (let i = 0; i < 3; i++) {
                service.enqueueCommandInLane(createRequest(`agent-${1000 + i}`));
                const lane = service.acquireFromQueue(TEST_USER_ID);
                service.releaseFromQueue(lane!.lane_id, 100); // 100ms processing time
            }

            // Add requests until we hit soft_limit for delay
            service.enqueueCommandInLane(createRequest('agent-2000'));
            service.enqueueCommandInLane(createRequest('agent-2001'));
            // This one should trigger delay (position 2, past soft_limit of 2)
            const result = service.enqueueCommandInLane(createRequest('agent-2002'));

            // Should estimate based on position and average processing time
            expect(result.backpressure_action).toBe('delay');
            expect(result.estimated_wait_ms).toBeGreaterThan(0);
        });
    });

    describe('priority ordering', () => {
        it('should maintain priority ordering from underlying queue', () => {
            const service = new CommandQueueService({ max_concurrent: 5 });

            // Enqueue in reverse priority order
            service.enqueueCommandInLane(createRequest('agent-1001', 'heartbeat')); // priority 5
            service.enqueueCommandInLane(createRequest('agent-1002', 'user_message')); // priority 1
            service.enqueueCommandInLane(createRequest('agent-1003', 'schedule')); // priority 4

            // Acquire should return highest priority first
            const lane1 = service.acquireFromQueue(TEST_USER_ID);
            expect(lane1?.agent_slug).toBe('agent-1002'); // user_message (priority 1)

            const lane2 = service.acquireFromQueue(TEST_USER_ID);
            expect(lane2?.agent_slug).toBe('agent-1003'); // schedule (priority 4)

            const lane3 = service.acquireFromQueue(TEST_USER_ID);
            expect(lane3?.agent_slug).toBe('agent-1001'); // heartbeat (priority 5)
        });
    });

    describe('global metrics', () => {
        it('should aggregate metrics across all users', () => {
            const service = new CommandQueueService();

            // User A
            service.enqueueCommandInLane(createRequest('agent-1001', 'user_message', 'user-a'));
            service.enqueueCommandInLane(createRequest('agent-1002', 'user_message', 'user-a'));

            // User B
            service.enqueueCommandInLane(createRequest('agent-1003', 'user_message', 'user-b'));

            const globalMetrics = service.getGlobalMetrics();

            expect(globalMetrics.total_queue_depth).toBe(3);
            expect(globalMetrics.total_users).toBe(2);
        });
    });

    describe('release', () => {
        it('should free lane for new executions', () => {
            const service = new CommandQueueService({ max_concurrent: 1 });

            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_2));

            const lane1 = service.acquireFromQueue(TEST_USER_ID);
            expect(service.acquireFromQueue(TEST_USER_ID)).toBeNull(); // No slots

            service.releaseFromQueue(lane1!.lane_id);
            const lane2 = service.acquireFromQueue(TEST_USER_ID);

            expect(lane2).not.toBeNull();
            expect(lane2!.agent_slug).toBe(TEST_AGENT_SLUG_2);
        });

        it('should accept processing time for metrics', () => {
            const service = new CommandQueueService();

            service.enqueueCommandInLane(createRequest(TEST_AGENT_SLUG_1));
            const lane = service.acquireFromQueue(TEST_USER_ID);

            service.releaseFromQueue(lane!.lane_id, 150); // 150ms processing time

            const metrics = service.getMetrics(TEST_USER_ID);
            expect(metrics.avg_processing_time_ms).toBe(150);
        });
    });
});
