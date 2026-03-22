// Trigger Tools Tests
// Tests error classes, singleton lifecycle, and service contract compliance

import {
    TriggerService,
    getTriggerService,
    resetTriggerService,
    TriggerNotFoundError,
    AgentNotFoundError,
    TriggerAlreadyExistsError,
    UnauthorizedTriggerAccessError,
} from '../trigger.tools';
import type { TriggerServicePort } from '../../platform-tool.types';

// -----------------------------------------------------------------------------
// Error Classes
// -----------------------------------------------------------------------------

describe('TriggerNotFoundError', () => {
    it('should set name and message', () => {
        const error = new TriggerNotFoundError(42);
        expect(error.name).toBe('TriggerNotFoundError');
        expect(error.message).toBe('Trigger not found: 42');
        expect(error).toBeInstanceOf(Error);
    });
});

describe('AgentNotFoundError', () => {
    it('should set name and message', () => {
        const error = new AgentNotFoundError('agent-99');
        expect(error.name).toBe('AgentNotFoundError');
        expect(error.message).toBe('Agent not found: agent-99');
        expect(error).toBeInstanceOf(Error);
    });
});

describe('TriggerAlreadyExistsError', () => {
    it('should set name and message with all identifiers', () => {
        const error = new TriggerAlreadyExistsError('agent-1', 'stripe', 'invoice.created');
        expect(error.name).toBe('TriggerAlreadyExistsError');
        expect(error.message).toBe('Trigger already exists for agent agent-1: stripe.invoice.created');
        expect(error).toBeInstanceOf(Error);
    });
});

describe('UnauthorizedTriggerAccessError', () => {
    it('should set name and message', () => {
        const error = new UnauthorizedTriggerAccessError(7);
        expect(error.name).toBe('UnauthorizedTriggerAccessError');
        expect(error.message).toBe('Unauthorized access to trigger: 7');
        expect(error).toBeInstanceOf(Error);
    });
});

// -----------------------------------------------------------------------------
// Service Contract Compliance
// -----------------------------------------------------------------------------

describe('TriggerService', () => {
    it('should implement TriggerServicePort interface', () => {
        const service = new TriggerService();
        const port: TriggerServicePort = service;
        expect(typeof port.registerTrigger).toBe('function');
        expect(typeof port.listTriggers).toBe('function');
        expect(typeof port.deregisterTrigger).toBe('function');
    });
});

// -----------------------------------------------------------------------------
// Singleton Lifecycle
// -----------------------------------------------------------------------------

describe('getTriggerService / resetTriggerService', () => {
    afterEach(() => {
        resetTriggerService();
    });

    it('should return same instance on repeated calls', () => {
        const a = getTriggerService();
        const b = getTriggerService();
        expect(a).toBe(b);
    });

    it('should return new instance after reset', () => {
        const a = getTriggerService();
        resetTriggerService();
        const b = getTriggerService();
        expect(a).not.toBe(b);
    });

    it('should return TriggerService instance', () => {
        const service = getTriggerService();
        expect(service).toBeInstanceOf(TriggerService);
    });
});
