// PipedreamTriggerAdapter Tests
// Tests the Pipedream trigger adapter using a fake BackendClient

import { PipedreamTriggerAdapter } from '../adapters/pipedream-trigger.adapter';
import type {
    TriggerRegistration,
    EventNormalizationMetadata,
} from '../trigger.types';
import { TriggerRegistrationError, TriggerDeregistrationError, EventNormalizationError, TriggerAdapterError } from '../trigger.errors';
import { ToolNotConnectedError } from '../../tools/errors';

// -----------------------------------------------------------------------------
// Fake Pipedream Client for Testing
// (Not a mock - a full in-memory implementation of the methods we use)
// -----------------------------------------------------------------------------

type DeployedTrigger = {
    id: string;
    user_id: string;
    trigger_key: string;
    configured_props: Record<string, unknown>;
    webhook_url: string;
    active: boolean;
};

function createFakeClient(options?: {
    deployError?: Error;
    deleteError?: Error;
    healthError?: Error;
}) {
    const deployedTriggers: DeployedTrigger[] = [];
    let deployCallCount = 0;

    return {
        deployedTriggers,
        getDeployCallCount: () => deployCallCount,

        getComponents: async (opts: { app?: string; componentType?: string }) => {
            const components = FAKE_COMPONENTS.filter(
                (c) =>
                    (!opts.app || c.key.startsWith(opts.app)) &&
                    (!opts.componentType || c.component_type === opts.componentType)
            );
            return {
                data: components,
                page_info: { total_count: components.length, count: components.length, start_cursor: '', end_cursor: '' },
            };
        },

        deployTrigger: async (opts: {
            externalUserId: string;
            triggerId: { key: string };
            configuredProps: Record<string, unknown>;
            webhookUrl?: string;
        }) => {
            deployCallCount++;

            if (options?.deployError) {
                throw options.deployError;
            }

            const id = `dc_${opts.triggerId.key}_${Date.now()}`;
            const trigger: DeployedTrigger = {
                id,
                user_id: opts.externalUserId,
                trigger_key: opts.triggerId.key,
                configured_props: opts.configuredProps,
                webhook_url: opts.webhookUrl ?? '',
                active: true,
            };
            deployedTriggers.push(trigger);

            return {
                data: {
                    id,
                    owner_id: opts.externalUserId,
                    component_id: opts.triggerId.key,
                    configurable_props: [],
                    configured_props: opts.configuredProps,
                    active: true,
                    created_at: Date.now(),
                    updated_at: Date.now(),
                    name: opts.triggerId.key,
                    name_slug: opts.triggerId.key,
                    endpoint_url: opts.webhookUrl,
                },
            };
        },

        deleteTrigger: async (opts: { id: string; externalUserId: string }) => {
            if (options?.deleteError) {
                throw options.deleteError;
            }

            const index = deployedTriggers.findIndex(
                (t) => t.id === opts.id && t.user_id === opts.externalUserId
            );
            if (index === -1) {
                throw new Error(`Trigger ${opts.id} not found for user ${opts.externalUserId}`);
            }
            deployedTriggers.splice(index, 1);
        },

        getApps: async (_opts?: { limit?: number }) => {
            if (options?.healthError) {
                throw options.healthError;
            }
            return {
                data: [{ name_slug: 'test', name: 'Test App' }],
                page_info: { total_count: 1, count: 1, start_cursor: '', end_cursor: '' },
            };
        },
    };
}

const FAKE_COMPONENTS = [
    {
        key: 'gmail-new-email',
        name: 'New Email',
        version: '0.1.0',
        description: 'Triggered when a new email arrives',
        component_type: 'trigger',
        configurable_props: [
            { name: 'gmail', type: 'app', app: 'gmail' },
            { name: 'label', type: 'string', label: 'Label', optional: true },
        ],
    },
    {
        key: 'gmail-new-email-matching-search',
        name: 'New Email Matching Search',
        version: '0.1.0',
        description: 'Triggered when a new email matches a search query',
        component_type: 'trigger',
        configurable_props: [
            { name: 'gmail', type: 'app', app: 'gmail' },
            { name: 'q', type: 'string', label: 'Search Query', optional: false },
        ],
    },
    {
        key: 'gmail-send-email',
        name: 'Send Email',
        version: '0.1.0',
        description: 'Send an email',
        component_type: 'action',
        configurable_props: [
            { name: 'gmail', type: 'app', app: 'gmail' },
            { name: 'to', type: 'string[]', label: 'To' },
        ],
    },
    {
        key: 'github-new-issue',
        name: 'New Issue',
        version: '0.1.0',
        description: 'Triggered when a new issue is created',
        component_type: 'trigger',
        configurable_props: [
            { name: 'github', type: 'app', app: 'github' },
            { name: 'repoFullname', type: 'string', label: 'Repository' },
        ],
    },
];

// Set env var for base URL
const ORIGINAL_ENV = process.env;

beforeAll(() => {
    process.env = { ...ORIGINAL_ENV, XERUS_API_BASE_URL: 'https://api.xerus.test' };
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('PipedreamTriggerAdapter', () => {
    describe('provider and displayName', () => {
        it('should have provider set to pipedream', () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);
            expect(adapter.provider).toBe('pipedream');
        });

        it('should have displayName set to Pipedream', () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);
            expect(adapter.displayName).toBe('Pipedream');
        });
    });

    describe('listTriggers', () => {
        it('should list trigger components for an app', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const triggers = await adapter.listTriggers('gmail');

            expect(triggers).toHaveLength(2);
            expect(triggers[0].app).toBe('gmail');
            expect(triggers[0].event_type).toBe('new-email');
            expect(triggers[0].display_name).toBe('New Email');
            expect(triggers[0].description).toBe('Triggered when a new email arrives');
        });

        it('should only return triggers, not actions', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const triggers = await adapter.listTriggers('gmail');

            const actionTriggers = triggers.filter((t) => t.event_type === 'send-email');
            expect(actionTriggers).toHaveLength(0);
        });

        it('should return triggers for a different app', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const triggers = await adapter.listTriggers('github');

            expect(triggers).toHaveLength(1);
            expect(triggers[0].app).toBe('github');
            expect(triggers[0].event_type).toBe('new-issue');
        });

        it('should return empty array for app with no triggers', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const triggers = await adapter.listTriggers('nonexistent');

            expect(triggers).toHaveLength(0);
        });

        it('should set supports_filter based on configurable props', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const triggers = await adapter.listTriggers('gmail');

            // gmail-new-email has a 'label' string prop (filterable)
            const newEmail = triggers.find((t) => t.event_type === 'new-email');
            expect(newEmail?.supports_filter).toBe(true);

            // gmail-new-email-matching-search has a 'q' string prop (filterable)
            const matchingSearch = triggers.find((t) => t.event_type === 'new-email-matching-search');
            expect(matchingSearch?.supports_filter).toBe(true);
        });
    });

    describe('register', () => {
        const baseConfig: TriggerRegistration = {
            agent_id: 42,
            user_id: 'user_abc',
            app: 'gmail',
            event_type: 'new-email',
            account_id: 'apn_xyz',
            webhook_url: '',
        };

        it('should deploy a trigger and return external_id with webhook_url', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const result = await adapter.register(baseConfig);

            expect(result.external_id).toContain('user_abc:dc_gmail-new-email_');
            expect(result.webhook_url).toBe('https://api.xerus.test/api/v1/webhooks/triggers/pipedream/42');
        });

        it('should pass correct configuredProps including auth', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            await adapter.register(baseConfig);

            expect(fakeClient.deployedTriggers).toHaveLength(1);
            expect(fakeClient.deployedTriggers[0].configured_props).toEqual({
                gmail: { authProvisionId: 'apn_xyz' },
            });
        });

        it('should pass filter config as additional props', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const configWithFilter: TriggerRegistration = {
                ...baseConfig,
                filter: { q: 'is:unread label:important' },
            };

            await adapter.register(configWithFilter);

            expect(fakeClient.deployedTriggers[0].configured_props).toEqual({
                gmail: { authProvisionId: 'apn_xyz' },
                q: 'is:unread label:important',
            });
        });

        it('should throw ToolNotConnectedError for 401 errors', async () => {
            const fakeClient = createFakeClient({
                deployError: new Error('HTTP error! status: 401, body: {"error": "Unauthorized"}'),
            });
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            await expect(adapter.register(baseConfig)).rejects.toThrow(ToolNotConnectedError);
        });

        it('should throw TriggerAdapterError for rate limit errors', async () => {
            const fakeClient = createFakeClient({
                deployError: new Error('HTTP error! status: 429, body: {"error": "rate limit exceeded"}'),
            });
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            await expect(adapter.register(baseConfig)).rejects.toThrow(TriggerAdapterError);
        });

        it('should retry once on generic deployment failure', async () => {
            let callCount = 0;
            const fakeClient = createFakeClient();
            // Override deployTrigger to fail on first call, succeed on second
            const originalDeploy = fakeClient.deployTrigger;
            fakeClient.deployTrigger = async (opts: any) => {
                callCount++;
                if (callCount === 1) {
                    throw new Error('Temporary API failure');
                }
                return originalDeploy(opts);
            };

            const adapter = new PipedreamTriggerAdapter(fakeClient as any);
            const result = await adapter.register(baseConfig);

            expect(callCount).toBe(2);
            expect(result.external_id).toContain('dc_gmail-new-email_');
        });

        it('should throw TriggerRegistrationError after all retries exhausted', async () => {
            const fakeClient = createFakeClient({
                deployError: new Error('Persistent API failure'),
            });
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            await expect(adapter.register(baseConfig)).rejects.toThrow(TriggerRegistrationError);
            // Should have tried twice (initial + 1 retry)
            expect(fakeClient.getDeployCallCount()).toBe(2);
        });
    });

    describe('deregister', () => {
        it('should delete a deployed trigger', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            // First register a trigger
            const config: TriggerRegistration = {
                agent_id: 1,
                user_id: 'user_123',
                app: 'gmail',
                event_type: 'new-email',
                account_id: 'apn_abc',
                webhook_url: '',
            };
            const result = await adapter.register(config);
            expect(fakeClient.deployedTriggers).toHaveLength(1);

            // Now deregister
            await adapter.deregister(result.external_id);
            expect(fakeClient.deployedTriggers).toHaveLength(0);
        });

        it('should throw TriggerDeregistrationError for invalid external_id format', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            await expect(adapter.deregister('invalid_id_no_colon')).rejects.toThrow(TriggerDeregistrationError);
        });

        it('should throw TriggerDeregistrationError when deletion fails', async () => {
            const fakeClient = createFakeClient({
                deleteError: new Error('Not found'),
            });
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            await expect(adapter.deregister('user_123:dc_xxx')).rejects.toThrow(TriggerDeregistrationError);
        });
    });

    describe('normalize', () => {
        const metadata: EventNormalizationMetadata = {
            app: 'gmail',
            event_type: 'new_email',
            agent_id: 42,
        };

        it('should normalize a standard webhook payload', () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const rawEvent = {
                from: 'sender@example.com',
                subject: 'Test Email',
                account_id: 'acct_123',
                id: 'evt_456',
            };

            const normalized = adapter.normalize(rawEvent, metadata);

            expect(normalized.app).toBe('gmail');
            expect(normalized.event_type).toBe('new_email');
            expect(normalized.source_provider).toBe('pipedream');
            expect(normalized.account_id).toBe('acct_123');
            expect(normalized.external_event_id).toBe('evt_456');
            expect(normalized.payload).toEqual(rawEvent);
            expect(normalized.received_at).toBeInstanceOf(Date);
        });

        it('should extract payload from V1EmittedEvent format (e field)', () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const rawEvent = {
                e: {
                    from: 'sender@example.com',
                    subject: 'Wrapped Event',
                },
                k: 'emit',
                ts: Date.now(),
                id: 'evt_789',
                account_id: 'acct_456',
            };

            const normalized = adapter.normalize(rawEvent, metadata);

            expect(normalized.payload).toEqual({
                from: 'sender@example.com',
                subject: 'Wrapped Event',
            });
            expect(normalized.account_id).toBe('acct_456');
            expect(normalized.external_event_id).toBe('evt_789');
        });

        it('should use owner_id as fallback for account_id', () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const rawEvent = {
                owner_id: 'owner_999',
                data: 'test',
            };

            const normalized = adapter.normalize(rawEvent, metadata);
            expect(normalized.account_id).toBe('owner_999');
        });

        it('should use "unknown" when no account identifier present', () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const rawEvent = { data: 'test' };

            const normalized = adapter.normalize(rawEvent, metadata);
            expect(normalized.account_id).toBe('unknown');
        });

        it('should throw EventNormalizationError for null input', () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            expect(() => adapter.normalize(null, metadata)).toThrow(EventNormalizationError);
        });

        it('should throw EventNormalizationError for non-object input', () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            expect(() => adapter.normalize('not-an-object', metadata)).toThrow(EventNormalizationError);
        });

        it('should throw EventNormalizationError for undefined input', () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            expect(() => adapter.normalize(undefined, metadata)).toThrow(EventNormalizationError);
        });
    });

    describe('healthCheck', () => {
        it('should return true when Pipedream API is reachable', async () => {
            const fakeClient = createFakeClient();
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const result = await adapter.healthCheck();
            expect(result).toBe(true);
        });

        it('should return false when Pipedream API is unreachable', async () => {
            const fakeClient = createFakeClient({
                healthError: new Error('Network error'),
            });
            const adapter = new PipedreamTriggerAdapter(fakeClient as any);

            const result = await adapter.healthCheck();
            expect(result).toBe(false);
        });
    });
});
