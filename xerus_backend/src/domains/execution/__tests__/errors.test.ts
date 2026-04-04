// Execution Domain Errors Tests
import { AppError, DomainError } from '../../../utils/errors';
import {
    ToolExecutionError,
    ExecutionTimeoutError,
    ToolTimeoutError,
    ToolRateLimitedError,
    LlmApiError,
    LlmRateLimitedError,
    ModelUnavailableError,
    ContextOverflowError,
    UserCancelledError,
    SandboxCreationError,
    SandboxTimeoutError,
    SDKExecutionError,
    StreamingError,
    StorageSyncError,
    CoordinationError,
    MemoryLoadError,
} from '../errors';

describe('Execution Domain Errors', () => {
    describe('DomainError (base class)', () => {
        it('should extend AppError', () => {
            const error = new DomainError('Test error', 500, 'TEST_ERROR');
            expect(error).toBeInstanceOf(AppError);
            expect(error).toBeInstanceOf(Error);
        });

        it('should have correct properties', () => {
            const error = new DomainError('Test error', 500, 'TEST_ERROR');
            expect(error.message).toBe('Test error');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('TEST_ERROR');
        });
    });

    describe('ExecutionTimeoutError', () => {
        it('should have correct status code 408', () => {
            const error = new ExecutionTimeoutError(300);
            expect(error.statusCode).toBe(408);
            expect(error.code).toBe('EXECUTION_TIMEOUT');
            expect(error.message).toBe('Execution exceeded timeout of 300 seconds');
            expect(error.timeoutSeconds).toBe(300);
        });

        it('should extend DomainError', () => {
            const error = new ExecutionTimeoutError(60);
            expect(error).toBeInstanceOf(DomainError);
        });
    });

    describe('ToolExecutionError', () => {
        it('should have correct status code 500', () => {
            const error = new ToolExecutionError('web_search', 'Rate limit exceeded', 'brave_search');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('TOOL_EXECUTION_FAILED');
            expect(error.toolName).toBe('web_search');
            expect(error.server).toBe('brave_search');
        });

        it('should format message with tool name', () => {
            const error = new ToolExecutionError('gmail', 'Authentication failed');
            expect(error.message).toBe("Tool 'gmail' failed: Authentication failed");
        });
    });

    describe('ToolTimeoutError', () => {
        it('should have correct status code 500', () => {
            const error = new ToolTimeoutError('web_search', 30);
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('TOOL_TIMEOUT');
            expect(error.toolName).toBe('web_search');
            expect(error.timeoutSeconds).toBe(30);
        });
    });

    describe('ToolRateLimitedError', () => {
        it('should have correct status code 429', () => {
            const error = new ToolRateLimitedError('slack', 60);
            expect(error.statusCode).toBe(429);
            expect(error.code).toBe('TOOL_RATE_LIMITED');
            expect(error.toolName).toBe('slack');
            expect(error.retryAfterSeconds).toBe(60);
        });

        it('should work without retry after', () => {
            const error = new ToolRateLimitedError('slack');
            expect(error.retryAfterSeconds).toBeUndefined();
        });
    });

    describe('LlmApiError', () => {
        it('should have correct status code 502', () => {
            const error = new LlmApiError('Internal Server Error', 500);
            expect(error.statusCode).toBe(502);
            expect(error.code).toBe('LLM_API_ERROR');
            expect(error.providerStatusCode).toBe(500);
        });
    });

    describe('LlmRateLimitedError', () => {
        it('should have correct status code 429', () => {
            const error = new LlmRateLimitedError(120);
            expect(error.statusCode).toBe(429);
            expect(error.code).toBe('LLM_RATE_LIMITED');
            expect(error.retryAfterSeconds).toBe(120);
        });
    });

    describe('ModelUnavailableError', () => {
        it('should have correct status code 503', () => {
            const error = new ModelUnavailableError('claude-3-opus');
            expect(error.statusCode).toBe(503);
            expect(error.code).toBe('MODEL_UNAVAILABLE');
            expect(error.model).toBe('claude-3-opus');
            expect(error.message).toBe("Model 'claude-3-opus' is not available");
        });
    });

    describe('ContextOverflowError', () => {
        it('should have correct status code 413', () => {
            const error = new ContextOverflowError(135420, 128000);
            expect(error.statusCode).toBe(413);
            expect(error.code).toBe('CONTEXT_OVERFLOW');
            expect(error.tokensAttempted).toBe(135420);
            expect(error.tokensMax).toBe(128000);
        });

        it('should format message with token counts', () => {
            const error = new ContextOverflowError(150000, 128000);
            expect(error.message).toBe('Context exceeded maximum token budget (128000 tokens). Attempted: 150000');
        });
    });

    describe('UserCancelledError', () => {
        it('should have correct status code 499', () => {
            const error = new UserCancelledError();
            expect(error.statusCode).toBe(499);
            expect(error.code).toBe('USER_CANCELLED');
            expect(error.message).toBe('Execution cancelled by user');
        });
    });

    describe('SandboxCreationError', () => {
        it('should have correct status code 500', () => {
            const error = new SandboxCreationError('Failed to provision sandbox');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('SANDBOX_CREATION_FAILED');
        });
    });

    describe('SandboxTimeoutError', () => {
        it('should have correct status code 408', () => {
            const error = new SandboxTimeoutError('user-123', 300);
            expect(error.statusCode).toBe(408);
            expect(error.code).toBe('SANDBOX_TIMEOUT');
            expect(error.userId).toBe('user-123');
            expect(error.timeoutSeconds).toBe(300);
        });
    });

    describe('SDKExecutionError', () => {
        it('should have correct status code 500', () => {
            const error = new SDKExecutionError('SDK query failed');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('SDK_EXECUTION_FAILED');
        });

        it('should preserve original error', () => {
            const originalError = new Error('Network error');
            const error = new SDKExecutionError('SDK query failed', originalError);
            expect(error.originalError).toBe(originalError);
        });
    });

    describe('StreamingError', () => {
        it('should have correct status code 500', () => {
            const error = new StreamingError('Connection lost');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('STREAMING_ERROR');
        });
    });

    describe('StorageSyncError', () => {
        it('should have correct status code 500', () => {
            const error = new StorageSyncError('upload', 's3://bucket/path');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('STORAGE_SYNC_FAILED');
            expect(error.operation).toBe('upload');
            expect(error.path).toBe('s3://bucket/path');
        });
    });

    describe('CoordinationError', () => {
        it('should have correct status code 500', () => {
            const error = new CoordinationError('parallel', 'Team synchronization failed');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('COORDINATION_ERROR');
            expect(error.mode).toBe('parallel');
        });
    });

    describe('MemoryLoadError', () => {
        it('should have correct status code 500', () => {
            const error = new MemoryLoadError('agent-123', 'working');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('MEMORY_LOAD_FAILED');
            expect(error.agentId).toBe('agent-123');
            expect(error.memoryType).toBe('working');
        });
    });
});
