// Trigger Source Adapter Tests
import {
    BaseTriggerAdapter,
    TriggerAdapterRegistry,
} from '../trigger-source.adapter';
import type {
    TriggerProvider,
    NormalizedEvent,
    TriggerRegistration,
    TriggerRegistrationResult,
    TriggerDefinition,
    EventNormalizationMetadata,
} from '../trigger.types';

// Test implementation of BaseTriggerAdapter
class TestAdapter extends BaseTriggerAdapter {
    readonly provider: TriggerProvider = 'pipedream';
    readonly displayName = 'Test Pipedream Adapter';

    private triggers: TriggerDefinition[] = [
        {
            app: 'gmail',
            event_type: 'new_email',
            display_name: 'New Email',
            description: 'Triggered when a new email arrives',
            supports_filter: true,
        },
        {
            app: 'gmail',
            event_type: 'email_read',
            display_name: 'Email Read',
            description: 'Triggered when an email is read',
            supports_filter: false,
        },
    ];

    async listTriggers(appSlug: string): Promise<TriggerDefinition[]> {
        return this.triggers.filter((t) => t.app === appSlug);
    }

    async register(config: TriggerRegistration): Promise<TriggerRegistrationResult> {
        return {
            external_id: `sub_${config.app}_${config.event_type}_${Date.now()}`,
            webhook_url: this.buildWebhookUrl('https://api.xerus.ai', config.agent_id),
        };
    }

    async deregister(_externalId: string): Promise<void> {
        // No-op for test
    }

    normalize(rawEvent: unknown, metadata: EventNormalizationMetadata): NormalizedEvent {
        const payload = rawEvent as Record<string, unknown>;
        return this.createNormalizedEvent(
            metadata.app,
            metadata.event_type,
            payload,
            (payload.account_id as string) || 'test_account',
            payload.event_id as string | undefined
        );
    }
}

// Second test adapter for registry tests
class NativeTestAdapter extends BaseTriggerAdapter {
    readonly provider: TriggerProvider = 'native';
    readonly displayName = 'Test Native Adapter';

    async listTriggers(_appSlug: string): Promise<TriggerDefinition[]> {
        return [];
    }

    async register(_config: TriggerRegistration): Promise<TriggerRegistrationResult> {
        return { external_id: 'native_sub_123', webhook_url: 'https://test.com/hook' };
    }

    async deregister(_externalId: string): Promise<void> {}

    normalize(_rawEvent: unknown, metadata: EventNormalizationMetadata): NormalizedEvent {
        return {
            app: metadata.app,
            event_type: metadata.event_type,
            payload: {},
            source_provider: 'native',
            received_at: new Date(),
            account_id: 'native_account',
        };
    }
}

describe('TriggerSourceAdapter Interface', () => {
    describe('BaseTriggerAdapter', () => {
        let adapter: TestAdapter;

        beforeEach(() => {
            adapter = new TestAdapter();
        });

        it('should have correct provider identifier', () => {
            expect(adapter.provider).toBe('pipedream');
        });

        it('should have display name', () => {
            expect(adapter.displayName).toBe('Test Pipedream Adapter');
        });

        describe('listTriggers', () => {
            it('should list triggers for gmail', async () => {
                const triggers = await adapter.listTriggers('gmail');
                expect(triggers).toHaveLength(2);
                expect(triggers[0].event_type).toBe('new_email');
                expect(triggers[1].event_type).toBe('email_read');
            });

            it('should return empty array for unknown app', async () => {
                const triggers = await adapter.listTriggers('unknown_app');
                expect(triggers).toHaveLength(0);
            });
        });

        describe('register', () => {
            it('should register a trigger and return external_id', async () => {
                const config: TriggerRegistration = {
                    agent_id: 1,
                    user_id: 'user_123',
                    app: 'gmail',
                    event_type: 'new_email',
                    account_id: 'acct_abc',
                    webhook_url: 'https://api.xerus.ai/webhooks/triggers/pipedream/1',
                };

                const result = await adapter.register(config);
                expect(result.external_id).toContain('sub_gmail_new_email_');
                expect(result.webhook_url).toBe('https://api.xerus.ai/api/v1/webhooks/triggers/pipedream/1');
            });
        });

        describe('deregister', () => {
            it('should deregister without error', async () => {
                await expect(adapter.deregister('sub_123')).resolves.toBeUndefined();
            });
        });

        describe('normalize', () => {
            it('should normalize raw event to NormalizedEvent', () => {
                const rawEvent = {
                    from: 'test@example.com',
                    subject: 'Test',
                    account_id: 'acct_xyz',
                    event_id: 'evt_123',
                };

                const metadata: EventNormalizationMetadata = {
                    app: 'gmail',
                    event_type: 'new_email',
                };

                const normalized = adapter.normalize(rawEvent, metadata);

                expect(normalized.app).toBe('gmail');
                expect(normalized.event_type).toBe('new_email');
                expect(normalized.source_provider).toBe('pipedream');
                expect(normalized.account_id).toBe('acct_xyz');
                expect(normalized.external_event_id).toBe('evt_123');
                expect(normalized.payload).toEqual(rawEvent);
                expect(normalized.received_at).toBeInstanceOf(Date);
            });

            it('should use default account_id when not in payload', () => {
                const rawEvent = { from: 'test@example.com' };
                const metadata: EventNormalizationMetadata = {
                    app: 'gmail',
                    event_type: 'new_email',
                };

                const normalized = adapter.normalize(rawEvent, metadata);
                expect(normalized.account_id).toBe('test_account');
            });
        });

        describe('healthCheck', () => {
            it('should return true by default', async () => {
                const isHealthy = await adapter.healthCheck();
                expect(isHealthy).toBe(true);
            });
        });

        describe('helper methods', () => {
            it('buildWebhookUrl should build correct URL', async () => {
                const config: TriggerRegistration = {
                    agent_id: 42,
                    user_id: 'user_123',
                    app: 'github',
                    event_type: 'pr_opened',
                    account_id: 'acct_abc',
                    webhook_url: '',
                };

                const result = await adapter.register(config);
                expect(result.webhook_url).toBe('https://api.xerus.ai/api/v1/webhooks/triggers/pipedream/42');
            });
        });
    });
});

describe('TriggerAdapterRegistry', () => {
    let registry: TriggerAdapterRegistry;
    let pipedreamAdapter: TestAdapter;
    let nativeAdapter: NativeTestAdapter;

    beforeEach(() => {
        registry = new TriggerAdapterRegistry();
        pipedreamAdapter = new TestAdapter();
        nativeAdapter = new NativeTestAdapter();
    });

    describe('register', () => {
        it('should register an adapter', () => {
            registry.register(pipedreamAdapter);
            expect(registry.has('pipedream')).toBe(true);
        });

        it('should allow registering multiple adapters', () => {
            registry.register(pipedreamAdapter);
            registry.register(nativeAdapter);
            expect(registry.has('pipedream')).toBe(true);
            expect(registry.has('native')).toBe(true);
        });

        it('should replace existing adapter for same provider', () => {
            const adapter1 = new TestAdapter();
            const adapter2 = new TestAdapter();

            registry.register(adapter1);
            registry.register(adapter2);

            expect(registry.get('pipedream')).toBe(adapter2);
        });
    });

    describe('get', () => {
        it('should return registered adapter', () => {
            registry.register(pipedreamAdapter);
            const adapter = registry.get('pipedream');
            expect(adapter).toBe(pipedreamAdapter);
        });

        it('should throw for unregistered provider', () => {
            expect(() => registry.get('zapier' as TriggerProvider)).toThrow('No adapter registered for provider: zapier');
        });
    });

    describe('has', () => {
        it('should return true for registered adapter', () => {
            registry.register(pipedreamAdapter);
            expect(registry.has('pipedream')).toBe(true);
        });

        it('should return false for unregistered adapter', () => {
            expect(registry.has('zapier' as TriggerProvider)).toBe(false);
        });
    });

    describe('getAll', () => {
        it('should return empty array when no adapters', () => {
            const adapters = registry.getAll();
            expect(adapters).toEqual([]);
        });

        it('should return all registered adapters', () => {
            registry.register(pipedreamAdapter);
            registry.register(nativeAdapter);

            const adapters = registry.getAll();
            expect(adapters).toHaveLength(2);
            expect(adapters).toContain(pipedreamAdapter);
            expect(adapters).toContain(nativeAdapter);
        });
    });

    describe('getProviders', () => {
        it('should return empty array when no adapters', () => {
            const providers = registry.getProviders();
            expect(providers).toEqual([]);
        });

        it('should return all provider names', () => {
            registry.register(pipedreamAdapter);
            registry.register(nativeAdapter);

            const providers = registry.getProviders();
            expect(providers).toHaveLength(2);
            expect(providers).toContain('pipedream');
            expect(providers).toContain('native');
        });
    });
});
