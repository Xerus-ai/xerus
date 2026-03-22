// HITL Handler Tests
// Tests for pause/resume approval workflow
// NO MOCKS - uses real in-memory implementations

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import {
    HITLHandler,
    HITLHandlerDeps,
    HITLPauseRepository,
    HITLSSEEmitter,
} from '../hitl.handler';
import {
    HITLRequest,
    HITLResponse,
    HITLPauseState,
    HITLRequestData,
} from '../hitl.types';
import {
    PauseStateNotFoundError,
    PauseStateAlreadyResolvedError,
    NoPendingApprovalError,
} from '../hitl.errors';
import type { PauseResolution } from '../../../history/sessions/session.types';
import { StreamEvent } from '../../types';

// -----------------------------------------------------------------------------
// In-Memory Test Dependencies
// -----------------------------------------------------------------------------

class InMemoryPauseRepository implements HITLPauseRepository {
    private states: Map<string, HITLPauseState> = new Map();
    private counter = 0;

    async createPauseState(
        executionId: string,
        reason: string,
        requestData: HITLRequestData
    ): Promise<{ id: string; paused_at: string }> {
        const id = `pause-${++this.counter}`;
        const paused_at = new Date().toISOString();

        const state: HITLPauseState = {
            id,
            execution_id: executionId,
            paused_at,
            reason: reason as HITLPauseState['reason'],
            request_data: requestData,
            resolved_at: null,
            resolution: null,
            resolved_by: null,
        };

        this.states.set(id, state);
        return { id, paused_at };
    }

    async getPendingPauseState(pauseId: string): Promise<HITLPauseState | null> {
        return this.states.get(pauseId) ?? null;
    }

    async getPendingForExecution(executionId: string): Promise<HITLPauseState | null> {
        for (const state of this.states.values()) {
            if (state.execution_id === executionId && state.resolved_at === null) {
                return state;
            }
        }
        return null;
    }

    async resolvePauseState(
        pauseId: string,
        resolution: PauseResolution,
        resolvedBy: string,
        feedback?: string
    ): Promise<{ resolved_at: string }> {
        const state = this.states.get(pauseId);
        if (!state) {
            throw new Error(`Pause state not found: ${pauseId}`);
        }

        const resolved_at = new Date().toISOString();
        state.resolved_at = resolved_at;
        state.resolution = resolution;
        state.resolved_by = resolvedBy;
        if (feedback) {
            state.request_data = { ...state.request_data, expanded_context: feedback };
        }

        return { resolved_at };
    }

    getAll(): HITLPauseState[] {
        return [...this.states.values()];
    }

    clear(): void {
        this.states.clear();
        this.counter = 0;
    }
}

class InMemorySSEEmitter implements HITLSSEEmitter {
    public events: StreamEvent[] = [];

    emit(event: StreamEvent): void {
        this.events.push(event);
    }

    getLastEvent(): StreamEvent | undefined {
        return this.events[this.events.length - 1];
    }

    clear(): void {
        this.events = [];
    }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function createTestRequest(overrides: Partial<HITLRequest> = {}): HITLRequest {
    return {
        execution_id: 'exec-123',
        agent_id: 1,
        agent_slug: 'test-agent',
        user_id: 'user-456',
        scenario: 'agent_creation',
        question: 'Create agent "Scout Sally"?',
        tool_name: 'platform.create_agent',
        tool_input: { name: 'Scout Sally', description: 'Research agent' },
        ...overrides,
    };
}

function createTestResponse(pauseId: string, overrides: Partial<HITLResponse> = {}): HITLResponse {
    return {
        pause_id: pauseId,
        approved: true,
        resolved_by: 'user-456',
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('HITLHandler', () => {
    let handler: HITLHandler;
    let pauseRepo: InMemoryPauseRepository;
    let sseEmitter: InMemorySSEEmitter;

    beforeEach(() => {
        pauseRepo = new InMemoryPauseRepository();
        sseEmitter = new InMemorySSEEmitter();

        const deps: HITLHandlerDeps = {
            pauseRepository: pauseRepo,
            sseEmitter,
        };

        handler = new HITLHandler(deps);
    });

    afterEach(() => {
        pauseRepo.clear();
        sseEmitter.clear();
    });

    describe('requestApproval', () => {
        it('should create a pause state and return pause ID', async () => {
            const request = createTestRequest();

            const pauseId = await handler.requestApproval(request);

            expect(pauseId).toBe('pause-1');
            const states = pauseRepo.getAll();
            expect(states).toHaveLength(1);
            expect(states[0].execution_id).toBe('exec-123');
            expect(states[0].reason).toBe('approval_required');
            expect(states[0].resolved_at).toBeNull();
        });

        it('should store request data in pause state', async () => {
            const request = createTestRequest({
                scenario: 'destructive_operation',
                question: 'Delete all files?',
                tool_name: 'Bash',
                tool_input: { command: 'rm -rf /' },
            });

            await handler.requestApproval(request);

            const states = pauseRepo.getAll();
            expect(states[0].request_data.scenario).toBe('destructive_operation');
            expect(states[0].request_data.question).toBe('Delete all files?');
            expect(states[0].request_data.tool_name).toBe('Bash');
        });

        it('should emit guidance SSE event', async () => {
            const request = createTestRequest({
                options: ['Approve', 'Reject'],
                timeout_seconds: 120,
            });

            await handler.requestApproval(request);

            expect(sseEmitter.events).toHaveLength(1);
            const event = sseEmitter.getLastEvent()!;
            expect(event.type).toBe('guidance');
            expect(event.execution_id).toBe('exec-123');

            const content = event.content as Record<string, unknown>;
            expect(content.question).toBe('Create agent "Scout Sally"?');
            expect(content.options).toEqual(['Approve', 'Reject']);
            expect(content.timeout_seconds).toBe(120);
        });

        it('should include metadata in SSE event', async () => {
            const request = createTestRequest({
                requires_auth: true,
                scenario: 'external_service_auth',
            });

            await handler.requestApproval(request);

            const event = sseEmitter.getLastEvent()!;
            const meta = event.meta as Record<string, unknown>;
            expect(meta.pause_id).toBe('pause-1');
            expect(meta.scenario).toBe('external_service_auth');
            expect(meta.tool_name).toBe('platform.create_agent');
            expect(meta.requires_auth).toBe(true);
        });

        it('should use permission_denied reason for auth-required requests', async () => {
            const request = createTestRequest({ requires_auth: true });

            await handler.requestApproval(request);

            const states = pauseRepo.getAll();
            expect(states[0].reason).toBe('permission_denied');
        });

        it('should use default timeout when not specified', async () => {
            const { timeout_seconds, ...requestWithoutTimeout } = createTestRequest();
            const request: HITLRequest = requestWithoutTimeout as HITLRequest;

            await handler.requestApproval(request);

            const event = sseEmitter.getLastEvent()!;
            const content = event.content as Record<string, unknown>;
            expect(content.timeout_seconds).toBe(300);
        });
    });

    describe('resolveApproval', () => {
        it('should resolve an approval with approved=true', async () => {
            const pauseId = await handler.requestApproval(createTestRequest());
            const response = createTestResponse(pauseId, { approved: true });

            const result = await handler.resolveApproval(response);

            expect(result.pause_id).toBe(pauseId);
            expect(result.approved).toBe(true);
            expect(result.resolution).toBe('approved');
            expect(result.resolved_at).toBeDefined();
        });

        it('should resolve an approval with approved=false', async () => {
            const pauseId = await handler.requestApproval(createTestRequest());
            const response = createTestResponse(pauseId, {
                approved: false,
                feedback: 'Too risky',
            });

            const result = await handler.resolveApproval(response);

            expect(result.approved).toBe(false);
            expect(result.resolution).toBe('rejected');
            expect(result.feedback).toBe('Too risky');
        });

        it('should throw PauseStateNotFoundError for invalid pause ID', async () => {
            const response = createTestResponse('nonexistent-id');

            await expect(handler.resolveApproval(response)).rejects.toThrow(
                PauseStateNotFoundError
            );
        });

        it('should throw PauseStateAlreadyResolvedError for already-resolved state', async () => {
            const pauseId = await handler.requestApproval(createTestRequest());
            await handler.resolveApproval(createTestResponse(pauseId));

            await expect(
                handler.resolveApproval(createTestResponse(pauseId))
            ).rejects.toThrow(PauseStateAlreadyResolvedError);
        });
    });

    describe('getPendingApproval', () => {
        it('should return pending pause state for execution', async () => {
            const request = createTestRequest({ execution_id: 'exec-abc' });
            await handler.requestApproval(request);

            const pauseState = await handler.getPendingApproval('exec-abc');

            expect(pauseState.execution_id).toBe('exec-abc');
            expect(pauseState.resolved_at).toBeNull();
        });

        it('should throw NoPendingApprovalError when no pending approval exists', async () => {
            await expect(
                handler.getPendingApproval('exec-nonexistent')
            ).rejects.toThrow(NoPendingApprovalError);
        });

        it('should not return resolved approvals', async () => {
            const request = createTestRequest({ execution_id: 'exec-done' });
            const pauseId = await handler.requestApproval(request);
            await handler.resolveApproval(createTestResponse(pauseId));

            await expect(
                handler.getPendingApproval('exec-done')
            ).rejects.toThrow(NoPendingApprovalError);
        });
    });

    describe('error types', () => {
        it('PauseStateNotFoundError should have correct properties', () => {
            const error = new PauseStateNotFoundError('pause-xyz');
            expect(error.pauseId).toBe('pause-xyz');
            expect(error.statusCode).toBe(404);
            expect(error.code).toBe('PAUSE_STATE_NOT_FOUND');
        });

        it('PauseStateAlreadyResolvedError should have correct properties', () => {
            const error = new PauseStateAlreadyResolvedError('pause-1', 'approved');
            expect(error.pauseId).toBe('pause-1');
            expect(error.resolution).toBe('approved');
            expect(error.statusCode).toBe(409);
        });

        it('NoPendingApprovalError should have correct properties', () => {
            const error = new NoPendingApprovalError('exec-123');
            expect(error.executionId).toBe('exec-123');
            expect(error.statusCode).toBe(404);
        });
    });
});
