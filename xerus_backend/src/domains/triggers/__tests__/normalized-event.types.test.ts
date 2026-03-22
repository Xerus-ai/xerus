// Normalized Event Types Tests
import type {
    NormalizedEvent,
    TriggerRegistration,
    TriggerDefinition,
    TriggerProviderRow,
    AgentTriggerRow,
    TriggerRegistrationResult,
    EventNormalizationMetadata,
    ProviderResolutionResult,
    TriggerHealth,
} from '../../heartbeat/normalized-event.types';
import {
    TRIGGER_APPS,
    TRIGGER_PROVIDERS,
    TRIGGER_STATES,
} from '../../heartbeat/normalized-event.types';

describe('Normalized Event Types', () => {
    describe('TRIGGER_APPS', () => {
        it('should have all supported apps defined', () => {
            expect(TRIGGER_APPS).toContain('gmail');
            expect(TRIGGER_APPS).toContain('github');
            expect(TRIGGER_APPS).toContain('slack');
            expect(TRIGGER_APPS).toContain('stripe');
            expect(TRIGGER_APPS).toContain('notion');
            expect(TRIGGER_APPS).toContain('linear');
            expect(TRIGGER_APPS).toContain('calendar');
            expect(TRIGGER_APPS).toContain('trello');
            expect(TRIGGER_APPS).toContain('jira');
            expect(TRIGGER_APPS).toContain('hubspot');
        });

        it('should have 10 apps', () => {
            expect(TRIGGER_APPS).toHaveLength(10);
        });
    });

    describe('TRIGGER_PROVIDERS', () => {
        it('should have all provider types defined', () => {
            expect(TRIGGER_PROVIDERS).toContain('pipedream');
            expect(TRIGGER_PROVIDERS).toContain('native');
            expect(TRIGGER_PROVIDERS).toContain('zapier');
            expect(TRIGGER_PROVIDERS).toContain('custom');
        });

        it('should have 4 providers', () => {
            expect(TRIGGER_PROVIDERS).toHaveLength(4);
        });
    });

    describe('TRIGGER_STATES', () => {
        it('should have all trigger states defined', () => {
            expect(TRIGGER_STATES).toContain('active');
            expect(TRIGGER_STATES).toContain('inactive');
            expect(TRIGGER_STATES).toContain('error');
            expect(TRIGGER_STATES).toContain('rate_limited');
        });

        it('should have 4 states', () => {
            expect(TRIGGER_STATES).toHaveLength(4);
        });
    });

    describe('NormalizedEvent', () => {
        it('should accept valid normalized event', () => {
            const event: NormalizedEvent = {
                app: 'gmail',
                event_type: 'new_email',
                payload: {
                    from: 'test@example.com',
                    subject: 'Test Subject',
                },
                source_provider: 'pipedream',
                received_at: new Date(),
                account_id: 'acct_123',
            };

            expect(event.app).toBe('gmail');
            expect(event.event_type).toBe('new_email');
            expect(event.payload.from).toBe('test@example.com');
            expect(event.source_provider).toBe('pipedream');
            expect(event.account_id).toBe('acct_123');
        });

        it('should accept event with optional fields', () => {
            const event: NormalizedEvent = {
                app: 'github',
                event_type: 'pr_opened',
                payload: { pr_number: 42 },
                source_provider: 'native',
                received_at: new Date(),
                account_id: 'acct_456',
                external_event_id: 'evt_abc123',
                agent_id: 1,
            };

            expect(event.external_event_id).toBe('evt_abc123');
            expect(event.agent_id).toBe(1);
        });
    });

    describe('TriggerRegistration', () => {
        it('should accept valid trigger registration', () => {
            const registration: TriggerRegistration = {
                agent_id: 1,
                user_id: 'user_123',
                app: 'gmail',
                event_type: 'new_email',
                account_id: 'acct_abc',
                webhook_url: 'https://api.xerus.ai/webhooks/triggers/pipedream/1',
            };

            expect(registration.agent_id).toBe(1);
            expect(registration.user_id).toBe('user_123');
            expect(registration.app).toBe('gmail');
            expect(registration.event_type).toBe('new_email');
            expect(registration.webhook_url).toContain('/webhooks/triggers/');
        });

        it('should accept registration with filter', () => {
            const registration: TriggerRegistration = {
                agent_id: 2,
                user_id: 'user_456',
                app: 'gmail',
                event_type: 'new_email',
                account_id: 'acct_def',
                webhook_url: 'https://api.xerus.ai/webhooks/triggers/pipedream/2',
                filter: { from: 'vip-list', label: 'important' },
            };

            expect(registration.filter).toEqual({ from: 'vip-list', label: 'important' });
        });
    });

    describe('TriggerDefinition', () => {
        it('should accept valid trigger definition', () => {
            const definition: TriggerDefinition = {
                app: 'gmail',
                event_type: 'new_email',
                display_name: 'New Email',
                description: 'Triggered when a new email arrives in inbox',
                supports_filter: true,
                filter_schema: {
                    type: 'object',
                    properties: {
                        from: { type: 'string' },
                        label: { type: 'string' },
                    },
                },
            };

            expect(definition.display_name).toBe('New Email');
            expect(definition.supports_filter).toBe(true);
            expect(definition.filter_schema).toBeDefined();
        });

        it('should accept definition without filter support', () => {
            const definition: TriggerDefinition = {
                app: 'stripe',
                event_type: 'payment_failed',
                display_name: 'Payment Failed',
                description: 'Triggered when a payment fails',
                supports_filter: false,
            };

            expect(definition.supports_filter).toBe(false);
            expect(definition.filter_schema).toBeUndefined();
        });
    });

    describe('TriggerProviderRow', () => {
        it('should accept valid provider row', () => {
            const row: TriggerProviderRow = {
                id: 1,
                slug: 'pipedream',
                display_name: 'Pipedream Connect',
                adapter_class: 'PipedreamTriggerAdapter',
                adapter_config: { base_url: 'https://api.pipedream.com' },
                is_active: true,
                created_at: new Date(),
            };

            expect(row.slug).toBe('pipedream');
            expect(row.is_active).toBe(true);
        });
    });

    describe('AgentTriggerRow', () => {
        it('should accept valid agent trigger row', () => {
            const row: AgentTriggerRow = {
                id: 1,
                agent_id: 1,
                user_id: 'user_123',
                provider_id: 2,
                app_slug: 'gmail',
                event_type: 'new_email',
                external_id: 'sub_abc123',
                webhook_url: 'https://api.xerus.ai/webhooks/triggers/pipedream/1',
                filter_config: { from: 'vip' },
                account_id: 'acct_xyz',
                enabled: true,
                last_fired_at: null,
                fire_count: 0,
                created_at: new Date(),
                updated_at: new Date(),
            };

            expect(row.agent_id).toBe(1);
            expect(row.app_slug).toBe('gmail');
            expect(row.enabled).toBe(true);
            expect(row.fire_count).toBe(0);
        });

        it('should accept row with null optional fields', () => {
            const row: AgentTriggerRow = {
                id: 2,
                agent_id: 1,
                user_id: 'user_123',
                provider_id: null,
                app_slug: 'github',
                event_type: 'pr_opened',
                external_id: null,
                webhook_url: null,
                filter_config: {},
                account_id: null,
                enabled: false,
                last_fired_at: null,
                fire_count: 5,
                created_at: new Date(),
                updated_at: new Date(),
            };

            expect(row.provider_id).toBeNull();
            expect(row.external_id).toBeNull();
            expect(row.fire_count).toBe(5);
        });
    });

    describe('TriggerRegistrationResult', () => {
        it('should accept valid registration result', () => {
            const result: TriggerRegistrationResult = {
                external_id: 'sub_abc123',
                webhook_url: 'https://api.xerus.ai/webhooks/triggers/pipedream/1',
            };

            expect(result.external_id).toBe('sub_abc123');
            expect(result.webhook_url).toContain('/webhooks/triggers/');
        });
    });

    describe('EventNormalizationMetadata', () => {
        it('should accept valid metadata', () => {
            const metadata: EventNormalizationMetadata = {
                app: 'gmail',
                event_type: 'new_email',
                agent_id: 1,
            };

            expect(metadata.app).toBe('gmail');
            expect(metadata.agent_id).toBe(1);
        });

        it('should accept metadata without agent_id', () => {
            const metadata: EventNormalizationMetadata = {
                app: 'github',
                event_type: 'pr_opened',
            };

            expect(metadata.agent_id).toBeUndefined();
        });
    });

    describe('ProviderResolutionResult', () => {
        it('should accept valid resolution result', () => {
            const result: ProviderResolutionResult = {
                provider: 'pipedream',
                provider_id: 1,
                account_id: 'acct_abc123',
            };

            expect(result.provider).toBe('pipedream');
            expect(result.provider_id).toBe(1);
            expect(result.account_id).toBe('acct_abc123');
        });
    });

    describe('TriggerHealth', () => {
        it('should accept valid trigger health', () => {
            const health: TriggerHealth = {
                trigger_id: '123e4567-e89b-12d3-a456-426614174000',
                state: 'active',
                last_fired_at: new Date(),
                fire_count: 42,
            };

            expect(health.state).toBe('active');
            expect(health.fire_count).toBe(42);
        });

        it('should accept health with error info', () => {
            const health: TriggerHealth = {
                trigger_id: '123e4567-e89b-12d3-a456-426614174000',
                state: 'error',
                last_fired_at: null,
                fire_count: 0,
                error_message: 'Connection failed',
                error_count: 3,
            };

            expect(health.state).toBe('error');
            expect(health.error_message).toBe('Connection failed');
            expect(health.error_count).toBe(3);
        });
    });
});
