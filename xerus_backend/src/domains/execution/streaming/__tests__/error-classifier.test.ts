// Error Classifier Tests
// Tests error classification logic for streaming events

import { classifyErrorType, classifyErrorFromObject, extractErrorCode } from '../error-classifier';

describe('classifyErrorType', () => {
    describe('explicit type', () => {
        it('should return explicit type when provided', () => {
            expect(classifyErrorType('RANDOM_CODE', 'auth_error')).toBe('auth_error');
            expect(classifyErrorType('TOOL_FAILED', 'timeout')).toBe('timeout');
        });
    });

    describe('tool errors', () => {
        it('should classify TOOL_ prefix as tool_error', () => {
            expect(classifyErrorType('TOOL_EXECUTION_FAILED')).toBe('tool_error');
            expect(classifyErrorType('TOOL_TIMEOUT')).toBe('tool_error');
        });

        it('should classify _TOOL_ infix as tool_error', () => {
            expect(classifyErrorType('BASH_TOOL_FAILED')).toBe('tool_error');
        });
    });

    describe('auth errors', () => {
        it('should classify AUTH_ prefix as auth_error', () => {
            expect(classifyErrorType('AUTH_FAILED')).toBe('auth_error');
            expect(classifyErrorType('AUTH_TOKEN_EXPIRED')).toBe('auth_error');
        });

        it('should classify _AUTH_ infix as auth_error', () => {
            expect(classifyErrorType('JWT_AUTH_INVALID')).toBe('auth_error');
        });

        it('should classify UNAUTHORIZED as auth_error', () => {
            expect(classifyErrorType('UNAUTHORIZED')).toBe('auth_error');
        });

        it('should classify FORBIDDEN as auth_error', () => {
            expect(classifyErrorType('FORBIDDEN')).toBe('auth_error');
        });
    });

    describe('validation errors', () => {
        it('should classify VALIDATION_ prefix as validation_error', () => {
            expect(classifyErrorType('VALIDATION_FAILED')).toBe('validation_error');
        });

        it('should classify _VALIDATION_ infix as validation_error', () => {
            expect(classifyErrorType('INPUT_VALIDATION_ERROR')).toBe('validation_error');
        });

        it('should classify BAD_REQUEST as validation_error', () => {
            expect(classifyErrorType('BAD_REQUEST')).toBe('validation_error');
        });
    });

    describe('timeout errors', () => {
        it('should classify TIMEOUT_ prefix as timeout', () => {
            expect(classifyErrorType('TIMEOUT_EXCEEDED')).toBe('timeout');
        });

        it('should classify _TIMEOUT_ infix as timeout', () => {
            expect(classifyErrorType('API_TIMEOUT_ERROR')).toBe('timeout');
        });

        it('should classify TIMEOUT as timeout', () => {
            expect(classifyErrorType('TIMEOUT')).toBe('timeout');
        });
    });

    describe('system errors', () => {
        it('should classify SYSTEM_ prefix as system_error', () => {
            expect(classifyErrorType('SYSTEM_FAILURE')).toBe('system_error');
        });

        it('should classify _SYSTEM_ infix as system_error', () => {
            expect(classifyErrorType('DATABASE_SYSTEM_ERROR')).toBe('system_error');
        });

        it('should classify INTERNAL_ERROR as system_error', () => {
            expect(classifyErrorType('INTERNAL_ERROR')).toBe('system_error');
        });
    });

    describe('context overflow errors', () => {
        it('should classify CONTEXT_ containing codes as context_overflow', () => {
            expect(classifyErrorType('CONTEXT_LIMIT_EXCEEDED')).toBe('context_overflow');
        });

        it('should classify CONTEXT_OVERFLOW as context_overflow', () => {
            expect(classifyErrorType('CONTEXT_OVERFLOW')).toBe('context_overflow');
        });
    });

    describe('user cancel errors', () => {
        it('should classify CANCEL containing codes as user_cancel', () => {
            expect(classifyErrorType('EXECUTION_CANCEL')).toBe('user_cancel');
            expect(classifyErrorType('CANCEL_REQUESTED')).toBe('user_cancel');
        });

        it('should classify USER_CANCEL as user_cancel', () => {
            expect(classifyErrorType('USER_CANCEL')).toBe('user_cancel');
        });
    });

    describe('default behavior', () => {
        it('should default to llm_error for unknown codes', () => {
            expect(classifyErrorType('UNKNOWN_ERROR')).toBe('llm_error');
            expect(classifyErrorType('SOMETHING_WENT_WRONG')).toBe('llm_error');
            expect(classifyErrorType('API_ERROR')).toBe('llm_error');
        });
    });
});

describe('classifyErrorFromObject', () => {
    it('should prioritize code-based classification', () => {
        const error = new Error('Test');
        error.name = 'RandomError';

        expect(classifyErrorFromObject(error, 'AUTH_FAILED')).toBe('auth_error');
        expect(classifyErrorFromObject(error, 'TOOL_ERROR')).toBe('tool_error');
    });

    it('should fall back to name-based classification when code is generic', () => {
        const timeoutError = new Error('Request timed out');
        timeoutError.name = 'TimeoutError';

        expect(classifyErrorFromObject(timeoutError, 'EXECUTION_ERROR')).toBe('timeout');
    });

    it('should classify by name containing timeout', () => {
        const error = new Error('Test');
        error.name = 'RequestTimeoutError';

        expect(classifyErrorFromObject(error, 'GENERIC_CODE')).toBe('timeout');
    });

    it('should classify by name containing auth', () => {
        const error = new Error('Test');
        error.name = 'AuthenticationError';

        expect(classifyErrorFromObject(error, 'GENERIC_CODE')).toBe('auth_error');
    });

    it('should classify by name containing permission', () => {
        const error = new Error('Test');
        error.name = 'PermissionDenied';

        expect(classifyErrorFromObject(error, 'GENERIC_CODE')).toBe('auth_error');
    });

    it('should classify by name containing validation', () => {
        const error = new Error('Test');
        error.name = 'ValidationError';

        expect(classifyErrorFromObject(error, 'GENERIC_CODE')).toBe('validation_error');
    });

    it('should classify by name containing invalid', () => {
        const error = new Error('Test');
        error.name = 'InvalidInputError';

        expect(classifyErrorFromObject(error, 'GENERIC_CODE')).toBe('validation_error');
    });

    it('should classify by name containing tool', () => {
        const error = new Error('Test');
        error.name = 'ToolExecutionError';

        expect(classifyErrorFromObject(error, 'GENERIC_CODE')).toBe('tool_error');
    });

    it('should classify by name containing context', () => {
        const error = new Error('Test');
        error.name = 'ContextOverflowError';

        expect(classifyErrorFromObject(error, 'GENERIC_CODE')).toBe('context_overflow');
    });

    it('should classify by name containing cancel', () => {
        const error = new Error('Test');
        error.name = 'CancelledError';

        expect(classifyErrorFromObject(error, 'GENERIC_CODE')).toBe('user_cancel');
    });

    it('should classify by name containing system', () => {
        const error = new Error('Test');
        error.name = 'SystemError';

        expect(classifyErrorFromObject(error, 'GENERIC_CODE')).toBe('system_error');
    });

    it('should default to llm_error when no patterns match', () => {
        const error = new Error('Test');
        error.name = 'RandomError';

        expect(classifyErrorFromObject(error, 'GENERIC_CODE')).toBe('llm_error');
    });
});

describe('extractErrorCode', () => {
    it('should extract code property from error', () => {
        const error = new Error('Test') as Error & { code: string };
        error.code = 'CUSTOM_CODE';

        expect(extractErrorCode(error)).toBe('CUSTOM_CODE');
    });

    it('should use error name when code not present', () => {
        const error = new Error('Test');
        error.name = 'CustomError';

        expect(extractErrorCode(error)).toBe('CUSTOM_ERROR');
    });

    it('should transform Error name with ERROR suffix', () => {
        const error = new Error('Test');
        error.name = 'ValidationError';

        expect(extractErrorCode(error)).toBe('VALIDATION_ERROR');
    });

    it('should default to EXECUTION_ERROR for generic Error', () => {
        const error = new Error('Test');
        error.name = 'Error';

        expect(extractErrorCode(error)).toBe('EXECUTION_ERROR');
    });

    it('should default to EXECUTION_ERROR when name is empty', () => {
        const error = new Error('Test');
        error.name = '';

        expect(extractErrorCode(error)).toBe('EXECUTION_ERROR');
    });
});
