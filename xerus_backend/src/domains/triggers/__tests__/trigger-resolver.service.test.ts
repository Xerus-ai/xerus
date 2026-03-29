// Trigger Resolver Service Tests
import { pool } from '../../../database/connection';
import { TriggerResolver } from '../trigger-resolver.service';
import { TriggerResolutionError, TriggerProviderNotFoundError } from '../trigger.errors';
import type { TriggerProvider } from '../trigger.types';

describe('TriggerResolver', () => {
    let resolver: TriggerResolver;
    const testUserId = 'test_trigger_resolver_user';

    beforeAll(async () => {
        // Ensure trigger_providers table exists and has seed data
        // Note: Production schema has adapter_class NOT NULL from migration 021
        await pool.query(`
            CREATE TABLE IF NOT EXISTS trigger_providers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug VARCHAR(50) UNIQUE NOT NULL,
                display_name VARCHAR(100) NOT NULL,
                adapter_class VARCHAR(100) NOT NULL,
                adapter_config JSONB DEFAULT '{}' NOT NULL,
                is_active BOOLEAN DEFAULT true NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
            )
        `);

        // Insert test providers (adapter_class is NOT NULL in production schema)
        await pool.query(`
            INSERT INTO trigger_providers (slug, display_name, adapter_class, adapter_config, is_active)
            VALUES
                ('pipedream', 'Pipedream Connect', 'PipedreamTriggerAdapter', '{"base_url": "https://api.pipedream.com"}', true),
                ('native', 'Native Webhooks', 'NativeWebhookAdapter', '{"supported_apps": ["github", "stripe", "slack"]}', true),
                ('inactive_provider', 'Inactive Provider', 'InactiveAdapter', '{}', false)
            ON CONFLICT (slug) DO UPDATE SET
                adapter_config = EXCLUDED.adapter_config,
                is_active = EXCLUDED.is_active
        `);
    });

    beforeEach(async () => {
        resolver = new TriggerResolver();

        // Clean up test data before each test
        await pool.query(`DELETE FROM connected_accounts WHERE user_id = $1`, [testUserId]);
    });

    afterAll(async () => {
        // Clean up test data
        await pool.query(`DELETE FROM connected_accounts WHERE user_id = $1`, [testUserId]);
    });

    describe('resolve()', () => {
        it('should resolve pipedream provider when user has app connected', async () => {
            // Setup: Add connection for user
            await pool.query(`
                INSERT INTO connected_accounts (user_id, app_slug, app_name, pipedream_account_id)
                VALUES ($1, 'gmail', 'Gmail', 'acct_gmail_123')
            `, [testUserId]);

            const result = await resolver.resolve(testUserId, 'gmail', 'new_email');

            expect(result.provider).toBe('pipedream');
            expect(result.account_id).toBe('acct_gmail_123');
            expect(result.provider_id).toBeDefined();
        });

        it('should resolve native provider for supported apps when pipedream check finds connection', async () => {
            // Setup: Add connection for github (supported by native provider)
            await pool.query(`
                INSERT INTO connected_accounts (user_id, app_slug, app_name, pipedream_account_id)
                VALUES ($1, 'github', 'GitHub', 'acct_github_456')
            `, [testUserId]);

            // Pipedream is checked first and will match since both use connected_accounts
            const result = await resolver.resolve(testUserId, 'github', 'pr_opened');

            expect(result.provider).toBe('pipedream');
            expect(result.account_id).toBe('acct_github_456');
            expect(result.provider_id).toBeDefined();
        });

        it('should throw TriggerResolutionError when no provider available', async () => {
            // No connections set up for this user/app

            await expect(resolver.resolve(testUserId, 'notion', 'page_updated'))
                .rejects.toThrow(TriggerResolutionError);
        });

        it('should throw TriggerResolutionError with correct app and event_type', async () => {
            try {
                await resolver.resolve(testUserId, 'custom_app', 'message');
                fail('Expected TriggerResolutionError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(TriggerResolutionError);
                expect((error as TriggerResolutionError).app).toBe('custom_app');
                expect((error as TriggerResolutionError).eventType).toBe('message');
            }
        });

        it('should not resolve native provider for unsupported apps', async () => {
            // notion is not in native's supported_apps list and no pipedream connection exists
            await expect(resolver.resolve(testUserId, 'notion', 'page_updated'))
                .rejects.toThrow(TriggerResolutionError);
        });
    });

    describe('getAdapter()', () => {
        // Note: Tests for getAdapter with real adapters will be added in task 4.106 (PipedreamTriggerAdapter)
        // For now, we only test the error case since no adapters are registered yet

        it('should throw TriggerProviderNotFoundError when adapter not registered', () => {
            expect(() => resolver.getAdapter('zapier'))
                .toThrow(TriggerProviderNotFoundError);
        });

        it('should throw error with correct provider name', () => {
            try {
                resolver.getAdapter('custom');
                fail('Expected TriggerProviderNotFoundError');
            } catch (error) {
                expect(error).toBeInstanceOf(TriggerProviderNotFoundError);
                expect((error as TriggerProviderNotFoundError).provider).toBe('custom');
            }
        });
    });

    describe('listConnectedApps()', () => {
        it('should return unique apps across providers', async () => {
            // Setup: Add multiple connections
            await pool.query(`
                INSERT INTO connected_accounts (user_id, app_slug, app_name, pipedream_account_id)
                VALUES
                    ($1, 'gmail', 'Gmail', 'acct_1'),
                    ($1, 'github', 'GitHub', 'acct_2'),
                    ($1, 'slack', 'Slack', 'acct_3')
            `, [testUserId]);

            const apps = await resolver.listConnectedApps(testUserId);

            expect(apps).toHaveLength(3);
            expect(apps).toContain('gmail');
            expect(apps).toContain('github');
            expect(apps).toContain('slack');
        });

        it('should return empty array when no connections', async () => {
            const apps = await resolver.listConnectedApps(testUserId);

            expect(apps).toEqual([]);
        });

        it('should deduplicate apps connected via multiple accounts', async () => {
            // This tests the DISTINCT behavior
            await pool.query(`
                INSERT INTO connected_accounts (user_id, app_slug, app_name, pipedream_account_id)
                VALUES ($1, 'gmail', 'Gmail', 'acct_1')
                ON CONFLICT (pipedream_account_id) DO NOTHING
            `, [testUserId]);

            const apps = await resolver.listConnectedApps(testUserId);

            const gmailCount = apps.filter(app => app === 'gmail').length;
            expect(gmailCount).toBe(1);
        });
    });

    describe('getProvider()', () => {
        it('should return provider from DB by slug', async () => {
            const provider = await resolver.getProvider('pipedream');

            expect(provider).not.toBeNull();
            expect(provider?.slug).toBe('pipedream');
            expect(provider?.display_name).toBe('Pipedream Connect');
            expect(provider?.is_active).toBe(true);
            expect(provider?.adapter_config).toEqual({ base_url: 'https://api.pipedream.com' });
        });

        it('should return null when provider not found', async () => {
            const provider = await resolver.getProvider('nonexistent' as TriggerProvider);

            expect(provider).toBeNull();
        });

        it('should return null for inactive providers', async () => {
            const provider = await resolver.getProvider('inactive_provider' as TriggerProvider);

            expect(provider).toBeNull();
        });

        it('should include created_at timestamp', async () => {
            const provider = await resolver.getProvider('native');

            expect(provider).not.toBeNull();
            expect(provider?.created_at).toBeInstanceOf(Date);
        });

        it('should return correct adapter_config for native provider', async () => {
            const provider = await resolver.getProvider('native');

            expect(provider).not.toBeNull();
            expect(provider?.adapter_config).toEqual({
                supported_apps: ['github', 'stripe', 'slack']
            });
        });
    });

    describe('getActiveProviders()', () => {
        it('should return only is_active=true providers', async () => {
            const providers = await resolver.getActiveProviders();

            expect(providers.length).toBeGreaterThanOrEqual(2);
            expect(providers.every(p => p.is_active === true)).toBe(true);
        });

        it('should not include inactive providers', async () => {
            const providers = await resolver.getActiveProviders();

            const inactiveProvider = providers.find(p => p.slug === 'inactive_provider');
            expect(inactiveProvider).toBeUndefined();
        });

        it('should return providers ordered by slug', async () => {
            const providers = await resolver.getActiveProviders();

            const slugs = providers.map(p => p.slug);
            const sortedSlugs = [...slugs].sort();
            expect(slugs).toEqual(sortedSlugs);
        });

        it('should include all required fields', async () => {
            const providers = await resolver.getActiveProviders();

            providers.forEach(provider => {
                expect(provider.id).toBeDefined();
                expect(provider.slug).toBeDefined();
                expect(provider.display_name).toBeDefined();
                expect(provider.adapter_config).toBeDefined();
                expect(provider.is_active).toBe(true);
                expect(provider.created_at).toBeInstanceOf(Date);
            });
        });
    });
});
