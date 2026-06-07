// Trigger Domain Error Classes
import { DomainError } from '../../utils/errors';

// -----------------------------------------------------------------------------
// Base Trigger Error
// -----------------------------------------------------------------------------

export class TriggerError extends DomainError {
    constructor(message: string, statusCode: number, code: string) {
        super(message, statusCode, code);
    }
}

// -----------------------------------------------------------------------------
// Adapter Errors
// -----------------------------------------------------------------------------

export class TriggerAdapterError extends TriggerError {
    public readonly provider: string;

    constructor(provider: string, reason: string) {
        super(`Trigger adapter '${provider}' error: ${reason}`, 500, 'TRIGGER_ADAPTER_ERROR');
        this.provider = provider;
    }
}

export class TriggerProviderNotFoundError extends TriggerError {
    public readonly provider: string;

    constructor(provider: string) {
        super(`Trigger provider '${provider}' not found or not registered`, 404, 'TRIGGER_PROVIDER_NOT_FOUND');
        this.provider = provider;
    }
}

// -----------------------------------------------------------------------------
// Registration Errors
// -----------------------------------------------------------------------------

export class TriggerRegistrationError extends TriggerError {
    public readonly app: string;
    public readonly eventType: string;

    constructor(app: string, eventType: string, reason: string) {
        super(`Failed to register trigger ${app}.${eventType}: ${reason}`, 500, 'TRIGGER_REGISTRATION_FAILED');
        this.app = app;
        this.eventType = eventType;
    }
}

export class TriggerDeregistrationError extends TriggerError {
    public readonly externalId: string;

    constructor(externalId: string, reason: string) {
        super(`Failed to deregister trigger ${externalId}: ${reason}`, 500, 'TRIGGER_DEREGISTRATION_FAILED');
        this.externalId = externalId;
    }
}

// -----------------------------------------------------------------------------
// Resolution Errors
// -----------------------------------------------------------------------------

export class TriggerResolutionError extends TriggerError {
    public readonly app: string;
    public readonly eventType: string;

    constructor(app: string, eventType: string, reason: string) {
        super(`Cannot resolve trigger for ${app}.${eventType}: ${reason}`, 400, 'TRIGGER_RESOLUTION_FAILED');
        this.app = app;
        this.eventType = eventType;
    }
}

// -----------------------------------------------------------------------------
// Normalization Errors
// -----------------------------------------------------------------------------

export class EventNormalizationError extends TriggerError {
    public readonly app: string;
    public readonly eventType: string;

    constructor(app: string, eventType: string, reason: string) {
        super(`Failed to normalize event ${app}.${eventType}: ${reason}`, 400, 'EVENT_NORMALIZATION_FAILED');
        this.app = app;
        this.eventType = eventType;
    }
}

// -----------------------------------------------------------------------------
// Trigger Not Found
// -----------------------------------------------------------------------------

export class TriggerNotFoundError extends TriggerError {
    public readonly triggerId: string;

    constructor(triggerId: string) {
        super(`Trigger ${triggerId} not found`, 404, 'TRIGGER_NOT_FOUND');
        this.triggerId = triggerId;
    }
}

// -----------------------------------------------------------------------------
// Trigger Already Exists
// -----------------------------------------------------------------------------

export class TriggerAlreadyExistsError extends TriggerError {
    public readonly agentSlug: string;
    public readonly app: string;
    public readonly eventType: string;

    constructor(agentSlug: string, app: string, eventType: string) {
        super(
            `Trigger ${app}.${eventType} already registered for agent ${agentSlug}`,
            409,
            'TRIGGER_ALREADY_EXISTS'
        );
        this.agentSlug = agentSlug;
        this.app = app;
        this.eventType = eventType;
    }
}

// -----------------------------------------------------------------------------
// Trigger Disabled
// -----------------------------------------------------------------------------

export class TriggerDisabledError extends TriggerError {
    public readonly triggerId: string;

    constructor(triggerId: string) {
        super(`Trigger ${triggerId} is disabled`, 400, 'TRIGGER_DISABLED');
        this.triggerId = triggerId;
    }
}
