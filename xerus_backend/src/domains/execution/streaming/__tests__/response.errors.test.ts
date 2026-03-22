// Response Error Builder Tests
// Tests for error response serialization and classification

import {
    serializeErrorResponse,
    serializeSSEErrorEvent,
    classifyRecoverable,
    mapErrorToHttpStatus,
} from '../response.errors';
import { ErrorType } from '../../types';
import {
    ExecutionTimeoutError,
    ToolExecutionError,
    LlmApiError,
    SandboxTimeoutError,
    SDKExecutionError,
} from '../../errors';

// -----------------------------------------------------------------------------
// Error Response Serialization
// -----------------------------------------------------------------------------

describe('serializeErrorResponse', () => {
    it('should create standard error response from error code and message', () => {
        const result = serializeErrorResponse({
            errorCode: 'EXECUTION_TIMEOUT',
            message: 'Execution exceeded timeout of 300 seconds',
            executionId: 'exec-err-1',
            errorType: 'timeout',
        });

        expect(result.error_code).toBe('EXECUTION_TIMEOUT');
        expect(result.message).toBe('Execution exceeded timeout of 300 seconds');
        expect(result.execution_id).toBe('exec-err-1');
        expect(result.recoverable).toBe(true); // timeouts are recoverable
    });

    it('should include details when provided', () => {
        const result = serializeErrorResponse({
            errorCode: 'TOOL_EXECUTION_FAILED',
            message: "Tool 'web_search' failed",
            executionId: 'exec-err-2',
            errorType: 'tool_error',
            details: { tool_name: 'web_search', server: 'brave_search' },
        });

        expect(result.details).toEqual({ tool_name: 'web_search', server: 'brave_search' });
    });

    it('should omit details when not provided', () => {
        const result = serializeErrorResponse({
            errorCode: 'USER_CANCELLED',
            message: 'Execution cancelled by user',
            executionId: 'exec-err-3',
            errorType: 'user_cancel',
        });

        expect(result.details).toBeUndefined();
    });

    it('should set recoverable based on error type', () => {
        const recoverableTypes: ErrorType[] = ['timeout', 'tool_error', 'llm_error'];
        const nonRecoverableTypes: ErrorType[] = ['context_overflow', 'user_cancel', 'auth_error', 'validation_error', 'system_error'];

        for (const type of recoverableTypes) {
            const result = serializeErrorResponse({
                errorCode: 'TEST',
                message: 'Test',
                executionId: 'exec-test',
                errorType: type,
            });
            expect(result.recoverable).toBe(true);
        }

        for (const type of nonRecoverableTypes) {
            const result = serializeErrorResponse({
                errorCode: 'TEST',
                message: 'Test',
                executionId: 'exec-test',
                errorType: type,
            });
            expect(result.recoverable).toBe(false);
        }
    });

    it('should allow explicit recoverable override', () => {
        const result = serializeErrorResponse({
            errorCode: 'SYSTEM_ERROR',
            message: 'Internal error',
            executionId: 'exec-err-4',
            errorType: 'system_error',
            recoverable: true,
        });

        expect(result.recoverable).toBe(true);
    });
});

// -----------------------------------------------------------------------------
// SSE Error Event Serialization
// -----------------------------------------------------------------------------

describe('serializeSSEErrorEvent', () => {
    it('should create SSE error done event from ExecutionError', () => {
        const error = new ExecutionTimeoutError(300);
        const result = serializeSSEErrorEvent({
            error,
            executionId: 'exec-sse-err-1',
            agentSlug: 'test-agent',
            sequence: 10,
            meta: {
                runId: null,
                requestId: 'req-1',
                traceId: 'trace-1',
                responseTimeMs: 300000,
            },
        });

        expect(result.type).toBe('done');
        expect(result.success).toBe(false);
        expect(result.execution_id).toBe('exec-sse-err-1');
        expect(result.content.error.message).toBe('Execution exceeded timeout of 300 seconds');
        expect(result.content.error.code).toBe('EXECUTION_TIMEOUT');
        expect(result.content.error.type).toBe('timeout');
        expect(result.content.error.recoverable).toBe(true);
        expect(result.content.summary.totalTokens).toBe(0);
        expect(result.content.databaseUpdated).toBe(false);
        expect(result.meta.sequence).toBe(10);
        expect(result.meta.agent_slug).toBe('test-agent');
    });

    it('should include partial summary when provided', () => {
        const error = new ToolExecutionError('web_search', 'Rate limited');
        const result = serializeSSEErrorEvent({
            error,
            executionId: 'exec-sse-err-2',
            agentSlug: 'test-agent',
            sequence: 5,
            meta: {
                runId: 10,
                requestId: 'req-2',
                traceId: 'trace-2',
                responseTimeMs: 5000,
            },
            partialSummary: {
                totalTokens: 1200,
                durationMs: 5000,
                toolCalls: 2,
                agentsUsed: 1,
            },
        });

        expect(result.content.summary.totalTokens).toBe(1200);
        expect(result.content.summary.toolCalls).toBe(2);
    });

    it('should handle plain Error objects', () => {
        const error = new Error('Unexpected failure');
        const result = serializeSSEErrorEvent({
            error,
            executionId: 'exec-sse-err-3',
            agentSlug: 'test-agent',
            sequence: 1,
            meta: {
                runId: null,
                requestId: 'req-3',
                traceId: 'trace-3',
                responseTimeMs: 100,
            },
        });

        expect(result.content.error.message).toBe('Unexpected failure');
        expect(result.content.error.code).toBe('EXECUTION_ERROR');
        expect(result.content.error.type).toBe('system_error');
    });

    it('should handle SandboxTimeoutError', () => {
        const error = new SandboxTimeoutError('user-123', 300);
        const result = serializeSSEErrorEvent({
            error,
            executionId: 'exec-sse-err-4',
            agentSlug: 'test-agent',
            sequence: 1,
            meta: {
                runId: null,
                requestId: 'req-4',
                traceId: 'trace-4',
                responseTimeMs: 300000,
            },
        });

        expect(result.content.error.code).toBe('SANDBOX_TIMEOUT');
        expect(result.content.error.type).toBe('timeout');
        expect(result.content.error.recoverable).toBe(true);
    });

    it('should handle LlmApiError', () => {
        const error = new LlmApiError('Internal Server Error', 500);
        const result = serializeSSEErrorEvent({
            error,
            executionId: 'exec-sse-err-5',
            agentSlug: 'test-agent',
            sequence: 1,
            meta: {
                runId: null,
                requestId: 'req-5',
                traceId: 'trace-5',
                responseTimeMs: 2000,
            },
        });

        expect(result.content.error.code).toBe('LLM_API_ERROR');
        expect(result.content.error.type).toBe('llm_error');
        expect(result.content.error.recoverable).toBe(true);
    });

    it('should handle SDKExecutionError', () => {
        const error = new SDKExecutionError('SDK query failed');
        const result = serializeSSEErrorEvent({
            error,
            executionId: 'exec-sse-err-6',
            agentSlug: 'test-agent',
            sequence: 1,
            meta: {
                runId: null,
                requestId: 'req-6',
                traceId: 'trace-6',
                responseTimeMs: 1000,
            },
        });

        expect(result.content.error.code).toBe('SDK_EXECUTION_FAILED');
        expect(result.content.error.type).toBe('system_error');
    });
});

// -----------------------------------------------------------------------------
// classifyRecoverable
// -----------------------------------------------------------------------------

describe('classifyRecoverable', () => {
    it('should classify timeout as recoverable', () => {
        expect(classifyRecoverable('timeout')).toBe(true);
    });

    it('should classify tool_error as recoverable', () => {
        expect(classifyRecoverable('tool_error')).toBe(true);
    });

    it('should classify llm_error as recoverable', () => {
        expect(classifyRecoverable('llm_error')).toBe(true);
    });

    it('should classify context_overflow as not recoverable', () => {
        expect(classifyRecoverable('context_overflow')).toBe(false);
    });

    it('should classify user_cancel as not recoverable', () => {
        expect(classifyRecoverable('user_cancel')).toBe(false);
    });

    it('should classify auth_error as not recoverable', () => {
        expect(classifyRecoverable('auth_error')).toBe(false);
    });

    it('should classify validation_error as not recoverable', () => {
        expect(classifyRecoverable('validation_error')).toBe(false);
    });

    it('should classify system_error as not recoverable', () => {
        expect(classifyRecoverable('system_error')).toBe(false);
    });
});

// -----------------------------------------------------------------------------
// mapErrorToHttpStatus
// -----------------------------------------------------------------------------

describe('mapErrorToHttpStatus', () => {
    it('should map timeout to 408', () => {
        expect(mapErrorToHttpStatus('timeout')).toBe(408);
    });

    it('should map tool_error to 500', () => {
        expect(mapErrorToHttpStatus('tool_error')).toBe(500);
    });

    it('should map llm_error to 502', () => {
        expect(mapErrorToHttpStatus('llm_error')).toBe(502);
    });

    it('should map context_overflow to 413', () => {
        expect(mapErrorToHttpStatus('context_overflow')).toBe(413);
    });

    it('should map user_cancel to 499', () => {
        expect(mapErrorToHttpStatus('user_cancel')).toBe(499);
    });

    it('should map auth_error to 401', () => {
        expect(mapErrorToHttpStatus('auth_error')).toBe(401);
    });

    it('should map validation_error to 400', () => {
        expect(mapErrorToHttpStatus('validation_error')).toBe(400);
    });

    it('should map system_error to 500', () => {
        expect(mapErrorToHttpStatus('system_error')).toBe(500);
    });
});
