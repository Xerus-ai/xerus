// Agent Domain Error Classes
import { AppError } from '../../utils/errors';

export class AgentError extends AppError {
    constructor(message: string, statusCode: number, code: string) {
        super(message, statusCode, code);
    }
}

export class AgentNotFoundError extends AgentError {
    constructor(id: number | string) {
        super(`Agent ${id} not found`, 404, 'AGENT_NOT_FOUND');
    }
}

export class AgentAccessDeniedError extends AgentError {
    constructor(id: number | string) {
        super(`Access denied to agent ${id}`, 403, 'AGENT_ACCESS_DENIED');
    }
}

export class AgentUnauthorizedError extends AgentError {
    constructor() {
        super('Authentication required', 401, 'UNAUTHORIZED');
    }
}

export class AgentNotClonableError extends AgentError {
    constructor(id: number | string) {
        super(`Agent ${id} cannot be cloned`, 403, 'AGENT_NOT_CLONABLE');
    }
}

export class AgentAlreadyPublicError extends AgentError {
    constructor(id: number | string) {
        super(`Agent ${id} is already public`, 400, 'AGENT_ALREADY_PUBLIC');
    }
}

export class AgentAlreadyPrivateError extends AgentError {
    constructor(id: number | string) {
        super(`Agent ${id} is already private`, 400, 'AGENT_ALREADY_PRIVATE');
    }
}

export class AgentNameConflictError extends AgentError {
    constructor(name: string) {
        super(`An agent with name "${name}" already exists`, 409, 'AGENT_NAME_CONFLICT');
    }
}

export class InvalidModelError extends AgentError {
    constructor(model: string) {
        super(`Invalid or unsupported model: ${model}`, 400, 'INVALID_MODEL');
    }
}

export class InvalidToolsError extends AgentError {
    public readonly invalidTools: string[];

    constructor(tools: string[]) {
        super(`Unknown or invalid tools: ${tools.join(', ')}`, 400, 'INVALID_TOOLS');
        this.invalidTools = tools;
    }
}

export class PublishRequirementsError extends AgentError {
    public readonly requirements: string[];

    constructor(requirements: string[]) {
        super(`Publishing requirements not met: ${requirements.join('; ')}`, 400, 'PUBLISH_REQUIREMENTS_NOT_MET');
        this.requirements = requirements;
    }
}

export class ProtectedFieldError extends AgentError {
    public readonly field: string;

    constructor(field: string) {
        super(`Cannot update protected field: ${field}`, 400, 'PROTECTED_FIELD');
        this.field = field;
    }
}

export class AgentValidationError extends AgentError {
    public readonly validationErrors: Array<{ field: string; message: string }>;

    constructor(errors: Array<{ field: string; message: string }>) {
        const message = errors.map(e => `${e.field}: ${e.message}`).join('; ');
        super(`Agent validation failed: ${message}`, 422, 'AGENT_VALIDATION_ERROR');
        this.validationErrors = errors;
    }
}

export class AgentLimitExceededError extends AgentError {
    constructor(limit: number, agentType: string) {
        super(`Maximum number of ${agentType} agents (${limit}) exceeded`, 403, 'AGENT_LIMIT_EXCEEDED');
    }
}

export class AgentDefaultError extends AgentError {
    constructor(message: string) {
        super(message, 400, 'AGENT_DEFAULT_ERROR');
    }
}

export class AgentChannelNotFoundError extends AgentError {
    constructor(channelId: string) {
        super(`Channel ${channelId} not found or not accessible`, 404, 'CHANNEL_NOT_FOUND');
    }
}

export class AgentChannelNotAssignedError extends AgentError {
    constructor(channelId: string) {
        super(`Channel ${channelId} is not assigned to this agent`, 400, 'CHANNEL_NOT_ASSIGNED');
    }
}
