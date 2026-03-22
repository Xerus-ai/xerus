// Execution Domain Error Classes
import { DomainError } from '../../utils/errors';
import { CoordinationMode } from './types';

// -----------------------------------------------------------------------------
// Timeout Errors
// -----------------------------------------------------------------------------

export class ExecutionTimeoutError extends DomainError {
    public readonly timeoutSeconds: number;

    constructor(timeoutSeconds: number) {
        super(`Execution exceeded timeout of ${timeoutSeconds} seconds`, 408, 'EXECUTION_TIMEOUT');
        this.timeoutSeconds = timeoutSeconds;
    }
}

export class SandboxTimeoutError extends DomainError {
    public readonly userId: string;
    public readonly timeoutSeconds: number;

    constructor(userId: string, timeoutSeconds: number) {
        super(`Sandbox for user ${userId} timed out after ${timeoutSeconds} seconds`, 408, 'SANDBOX_TIMEOUT');
        this.userId = userId;
        this.timeoutSeconds = timeoutSeconds;
    }
}

// -----------------------------------------------------------------------------
// Tool Errors
// -----------------------------------------------------------------------------

export class ToolExecutionError extends DomainError {
    public readonly toolName: string;
    public readonly server?: string;

    constructor(toolName: string, reason: string, server?: string) {
        super(`Tool '${toolName}' failed: ${reason}`, 500, 'TOOL_EXECUTION_FAILED');
        this.toolName = toolName;
        this.server = server;
    }
}

export class ToolTimeoutError extends DomainError {
    public readonly toolName: string;
    public readonly timeoutSeconds: number;

    constructor(toolName: string, timeoutSeconds: number) {
        super(`Tool '${toolName}' timed out after ${timeoutSeconds} seconds`, 500, 'TOOL_TIMEOUT');
        this.toolName = toolName;
        this.timeoutSeconds = timeoutSeconds;
    }
}

export class ToolRateLimitedError extends DomainError {
    public readonly toolName: string;
    public readonly retryAfterSeconds?: number;

    constructor(toolName: string, retryAfterSeconds?: number) {
        const retryMsg = retryAfterSeconds ? `. Retry after ${retryAfterSeconds} seconds` : '';
        super(`Tool '${toolName}' rate limited${retryMsg}`, 429, 'TOOL_RATE_LIMITED');
        this.toolName = toolName;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

// -----------------------------------------------------------------------------
// LLM Errors
// -----------------------------------------------------------------------------

export class LlmApiError extends DomainError {
    public readonly providerStatusCode?: number;

    constructor(reason: string, providerStatusCode?: number) {
        super(`LLM API error: ${reason}`, 502, 'LLM_API_ERROR');
        this.providerStatusCode = providerStatusCode;
    }
}

export class LlmRateLimitedError extends DomainError {
    public readonly retryAfterSeconds?: number;

    constructor(retryAfterSeconds?: number) {
        const retryMsg = retryAfterSeconds ? `. Retry after ${retryAfterSeconds} seconds` : '';
        super(`LLM API rate limited${retryMsg}`, 429, 'LLM_RATE_LIMITED');
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

export class ModelUnavailableError extends DomainError {
    public readonly model: string;

    constructor(model: string) {
        super(`Model '${model}' is not available`, 503, 'MODEL_UNAVAILABLE');
        this.model = model;
    }
}

// -----------------------------------------------------------------------------
// Context Errors
// -----------------------------------------------------------------------------

export class ContextOverflowError extends DomainError {
    public readonly tokensAttempted: number;
    public readonly tokensMax: number;

    constructor(tokensAttempted: number, tokensMax: number) {
        super(
            `Context exceeded maximum token budget (${tokensMax} tokens). Attempted: ${tokensAttempted}`,
            413,
            'CONTEXT_OVERFLOW'
        );
        this.tokensAttempted = tokensAttempted;
        this.tokensMax = tokensMax;
    }
}

// -----------------------------------------------------------------------------
// User Actions
// -----------------------------------------------------------------------------

export class UserCancelledError extends DomainError {
    constructor() {
        super('Execution cancelled by user', 499, 'USER_CANCELLED');
    }
}

// -----------------------------------------------------------------------------
// Sandbox Errors
// -----------------------------------------------------------------------------

export class SandboxCreationError extends DomainError {
    constructor(reason: string) {
        super(`Failed to create sandbox: ${reason}`, 500, 'SANDBOX_CREATION_FAILED');
    }
}

// -----------------------------------------------------------------------------
// SDK Errors
// -----------------------------------------------------------------------------

export class SDKExecutionError extends DomainError {
    public readonly originalError?: Error;

    constructor(reason: string, originalError?: Error) {
        super(`SDK execution failed: ${reason}`, 500, 'SDK_EXECUTION_FAILED');
        this.originalError = originalError;
    }
}

// -----------------------------------------------------------------------------
// Streaming Errors
// -----------------------------------------------------------------------------

export class StreamingError extends DomainError {
    constructor(reason: string) {
        super(`Streaming error: ${reason}`, 500, 'STREAMING_ERROR');
    }
}

// -----------------------------------------------------------------------------
// Storage Errors
// -----------------------------------------------------------------------------

export class StorageSyncError extends DomainError {
    public readonly operation: 'upload' | 'download' | 'delete' | 'copy';
    public readonly path: string;

    constructor(operation: 'upload' | 'download' | 'delete' | 'copy', path: string, reason?: string) {
        const msg = reason ? `Storage ${operation} failed for ${path}: ${reason}` : `Storage ${operation} failed for ${path}`;
        super(msg, 500, 'STORAGE_SYNC_FAILED');
        this.operation = operation;
        this.path = path;
    }
}

// -----------------------------------------------------------------------------
// Coordination Errors
// -----------------------------------------------------------------------------

export class CoordinationError extends DomainError {
    public readonly mode: CoordinationMode;

    constructor(mode: CoordinationMode, reason: string) {
        super(`Coordination (${mode}) failed: ${reason}`, 500, 'COORDINATION_ERROR');
        this.mode = mode;
    }
}

// -----------------------------------------------------------------------------
// Memory Errors
// -----------------------------------------------------------------------------

export class MemoryLoadError extends DomainError {
    public readonly agentId: string;
    public readonly memoryType: string;

    constructor(agentId: string, memoryType: string, reason?: string) {
        const msg = reason
            ? `Failed to load ${memoryType} memory for agent ${agentId}: ${reason}`
            : `Failed to load ${memoryType} memory for agent ${agentId}`;
        super(msg, 500, 'MEMORY_LOAD_FAILED');
        this.agentId = agentId;
        this.memoryType = memoryType;
    }
}

// -----------------------------------------------------------------------------
// Sandbox State Errors
// -----------------------------------------------------------------------------

export class SandboxNotFoundError extends DomainError {
    public readonly sandboxId: string;

    constructor(sandboxId: string) {
        super(`Sandbox '${sandboxId}' not found`, 404, 'SANDBOX_NOT_FOUND');
        this.sandboxId = sandboxId;
    }
}

export class SandboxPreviewError extends DomainError {
    public readonly sandboxId: string;
    public readonly port: number;

    constructor(sandboxId: string, port: number, reason: string) {
        super(`Failed to get preview URL for sandbox '${sandboxId}' port ${port}: ${reason}`, 500, 'SANDBOX_PREVIEW_FAILED');
        this.sandboxId = sandboxId;
        this.port = port;
    }
}

export class UnknownSandboxStateError extends DomainError {
    public readonly sandboxId: string;
    public readonly state: string;

    constructor(sandboxId: string, state: string) {
        super(`Unknown sandbox state '${state}' for sandbox '${sandboxId}'`, 500, 'UNKNOWN_SANDBOX_STATE');
        this.sandboxId = sandboxId;
        this.state = state;
    }
}

// -----------------------------------------------------------------------------
// Workspace Errors
// -----------------------------------------------------------------------------

export class WorkspaceNotFoundError extends DomainError {
    public readonly userId: string;

    constructor(userId: string) {
        super(`Workspace not found for user: ${userId}`, 404, 'WORKSPACE_NOT_FOUND');
        this.name = 'WorkspaceNotFoundError';
        this.userId = userId;
    }
}

// -----------------------------------------------------------------------------
// Agent Configuration Errors
// -----------------------------------------------------------------------------

export class InvalidAutonomyLevelError extends DomainError {
    public readonly autonomyLevel: string;

    constructor(autonomyLevel: string) {
        super(`Invalid autonomy level '${autonomyLevel}'. Expected: supervised, semi_autonomous, or autonomous`, 400, 'INVALID_AUTONOMY_LEVEL');
        this.autonomyLevel = autonomyLevel;
    }
}


// -----------------------------------------------------------------------------
// Agent Config Load Errors
// -----------------------------------------------------------------------------

export class AgentConfigLoadError extends DomainError {
    public readonly agentSlug: string;

    constructor(agentSlug: string, reason: string) {
        super(`Failed to load config for agent '${agentSlug}': ${reason}`, 500, 'AGENT_CONFIG_LOAD_FAILED');
        this.agentSlug = agentSlug;
    }
}

