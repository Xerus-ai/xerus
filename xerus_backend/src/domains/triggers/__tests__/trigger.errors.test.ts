// Trigger Domain Errors Tests
import { DomainError } from '../../../utils/errors';
import {
    TriggerError,
    TriggerAdapterError,
    TriggerProviderNotFoundError,
    TriggerRegistrationError,
    TriggerDeregistrationError,
    TriggerResolutionError,
    EventNormalizationError,
    TriggerNotFoundError,
    TriggerAlreadyExistsError,
    TriggerDisabledError,
} from '../trigger.errors';

describe('Trigger Domain Errors', () => {
    describe('TriggerError (base class)', () => {
        it('should extend DomainError', () => {
            const error = new TriggerError('Test error', 500, 'TEST_ERROR');
            expect(error).toBeInstanceOf(DomainError);
            expect(error).toBeInstanceOf(Error);
        });

        it('should have correct properties', () => {
            const error = new TriggerError('Test error', 400, 'TRIGGER_TEST');
            expect(error.message).toBe('Test error');
            expect(error.statusCode).toBe(400);
            expect(error.code).toBe('TRIGGER_TEST');
        });
    });

    describe('TriggerAdapterError', () => {
        it('should have correct status code 500', () => {
            const error = new TriggerAdapterError('pipedream', 'Connection failed');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('TRIGGER_ADAPTER_ERROR');
            expect(error.provider).toBe('pipedream');
        });

        it('should format message with provider', () => {
            const error = new TriggerAdapterError('native', 'API unavailable');
            expect(error.message).toBe("Trigger adapter 'native' error: API unavailable");
        });
    });

    describe('TriggerProviderNotFoundError', () => {
        it('should have correct status code 404', () => {
            const error = new TriggerProviderNotFoundError('zapier');
            expect(error.statusCode).toBe(404);
            expect(error.code).toBe('TRIGGER_PROVIDER_NOT_FOUND');
            expect(error.provider).toBe('zapier');
        });

        it('should format message with provider', () => {
            const error = new TriggerProviderNotFoundError('unknown');
            expect(error.message).toBe("Trigger provider 'unknown' not found or not registered");
        });
    });

    describe('TriggerRegistrationError', () => {
        it('should have correct status code 500', () => {
            const error = new TriggerRegistrationError('gmail', 'new_email', 'Webhook creation failed');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('TRIGGER_REGISTRATION_FAILED');
            expect(error.app).toBe('gmail');
            expect(error.eventType).toBe('new_email');
        });

        it('should format message with app and event_type', () => {
            const error = new TriggerRegistrationError('github', 'pr_opened', 'Auth failed');
            expect(error.message).toBe('Failed to register trigger github.pr_opened: Auth failed');
        });
    });

    describe('TriggerDeregistrationError', () => {
        it('should have correct status code 500', () => {
            const error = new TriggerDeregistrationError('sub_abc123', 'Not found');
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('TRIGGER_DEREGISTRATION_FAILED');
            expect(error.externalId).toBe('sub_abc123');
        });

        it('should format message with external_id', () => {
            const error = new TriggerDeregistrationError('sub_xyz', 'API error');
            expect(error.message).toBe('Failed to deregister trigger sub_xyz: API error');
        });
    });

    describe('TriggerResolutionError', () => {
        it('should have correct status code 400', () => {
            const error = new TriggerResolutionError('gmail', 'new_email', 'No connected account');
            expect(error.statusCode).toBe(400);
            expect(error.code).toBe('TRIGGER_RESOLUTION_FAILED');
            expect(error.app).toBe('gmail');
            expect(error.eventType).toBe('new_email');
        });

        it('should format message with app and event_type', () => {
            const error = new TriggerResolutionError('slack', 'message', 'User not connected');
            expect(error.message).toBe('Cannot resolve trigger for slack.message: User not connected');
        });
    });

    describe('EventNormalizationError', () => {
        it('should have correct status code 400', () => {
            const error = new EventNormalizationError('gmail', 'new_email', 'Invalid payload');
            expect(error.statusCode).toBe(400);
            expect(error.code).toBe('EVENT_NORMALIZATION_FAILED');
            expect(error.app).toBe('gmail');
            expect(error.eventType).toBe('new_email');
        });

        it('should format message with app and event_type', () => {
            const error = new EventNormalizationError('stripe', 'payment_failed', 'Missing customer_id');
            expect(error.message).toBe('Failed to normalize event stripe.payment_failed: Missing customer_id');
        });
    });

    describe('TriggerNotFoundError', () => {
        it('should have correct status code 404', () => {
            const error = new TriggerNotFoundError('123e4567-e89b-12d3-a456-426614174000');
            expect(error.statusCode).toBe(404);
            expect(error.code).toBe('TRIGGER_NOT_FOUND');
            expect(error.triggerId).toBe('123e4567-e89b-12d3-a456-426614174000');
        });

        it('should format message with trigger_id', () => {
            const error = new TriggerNotFoundError('trigger_xyz');
            expect(error.message).toBe('Trigger trigger_xyz not found');
        });
    });

    describe('TriggerAlreadyExistsError', () => {
        it('should have correct status code 409', () => {
            const error = new TriggerAlreadyExistsError(1, 'gmail', 'new_email');
            expect(error.statusCode).toBe(409);
            expect(error.code).toBe('TRIGGER_ALREADY_EXISTS');
            expect(error.agentId).toBe(1);
            expect(error.app).toBe('gmail');
            expect(error.eventType).toBe('new_email');
        });

        it('should format message with details', () => {
            const error = new TriggerAlreadyExistsError(42, 'github', 'pr_opened');
            expect(error.message).toBe('Trigger github.pr_opened already registered for agent 42');
        });
    });

    describe('TriggerDisabledError', () => {
        it('should have correct status code 400', () => {
            const error = new TriggerDisabledError('123e4567-e89b-12d3-a456-426614174000');
            expect(error.statusCode).toBe(400);
            expect(error.code).toBe('TRIGGER_DISABLED');
            expect(error.triggerId).toBe('123e4567-e89b-12d3-a456-426614174000');
        });

        it('should format message with trigger_id', () => {
            const error = new TriggerDisabledError('trigger_abc');
            expect(error.message).toBe('Trigger trigger_abc is disabled');
        });
    });
});
