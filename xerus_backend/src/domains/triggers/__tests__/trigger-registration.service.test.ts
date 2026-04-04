// Trigger Registration Service Tests
// Tests the reconciliation logic that syncs HEARTBEAT.md events with agent_triggers table
import { pool } from '../../../database/connection';
import { TriggerRegistrationService } from '../trigger-registration.service';
import type { ParsedEventEntry } from '../trigger-registration.service';
import type { AgentTriggerRow } from '../trigger.types';

// Test constants
const TEST_USER_ID = 'test_trigger_reg_user';
const TEST_AGENT_ID = 99901;
const TEST_AGENT_ID_2 = 99902;

// Helper to insert a trigger row with required provider_id
async function insertTestTrigger(
    agentId: number,
    userId: string,
    appSlug: string,
    eventType: string,
    filterConfig: string = '{}',
    providerId?: string
): Promise<void> {
    const pid = providerId ?? await getTestProviderId();
    await pool.query(
        `INSERT INTO agent_triggers (agent_id, user_id, app_slug, event_type, provider_id, filter_config, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [agentId, userId, appSlug, eventType, pid, filterConfig]
    );
}

let cachedProviderId: string | null = null;
async function getTestProviderId(): Promise<string> {
    if (cachedProviderId) return cachedProviderId;
    const result = await pool.query<{ id: string }>(
        `SELECT id FROM trigger_providers WHERE slug = 'pipedream' LIMIT 1`
    );
    cachedProviderId = result.rows[0].id;
    return cachedProviderId;
}

describe('TriggerRegistrationService', () => {
    let service: TriggerRegistrationService;

    beforeAll(async () => {
        // Ensure tables exist
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

        await pool.query(`
            INSERT INTO trigger_providers (slug, display_name, adapter_class, adapter_config, is_active)
            VALUES
                ('pipedream', 'Pipedream Connect', 'PipedreamTriggerAdapter', '{"base_url": "https://api.pipedream.com"}', true),
                ('native', 'Native Webhooks', 'NativeWebhookAdapter', '{"supported_apps": ["github", "stripe", "slack"]}', true)
            ON CONFLICT (slug) DO UPDATE SET
                adapter_config = EXCLUDED.adapter_config,
                is_active = EXCLUDED.is_active
        `);

        // Ensure user exists (must come before agents due to FK constraint)
        await pool.query(`
            INSERT INTO users (user_id, email) VALUES ($1, 'trigger-reg-test@test.com')
            ON CONFLICT (user_id) DO NOTHING
        `, [TEST_USER_ID]);

        // Ensure agent_registry has test entries
        await pool.query(`
            INSERT INTO agent_registry (id, slug, user_id, agent_type)
            VALUES ($1, $2, $3, 'private')
            ON CONFLICT (id) DO NOTHING
        `, [TEST_AGENT_ID, 'test-agent-trigger-reg', TEST_USER_ID]);

        await pool.query(`
            INSERT INTO agent_registry (id, slug, user_id, agent_type)
            VALUES ($1, $2, $3, 'private')
            ON CONFLICT (id) DO NOTHING
        `, [TEST_AGENT_ID_2, 'test-agent-trigger-reg-2', TEST_USER_ID]);

        // Setup connected_accounts for test user (used by trigger-resolver.service.ts)
        await pool.query(`
            INSERT INTO connected_accounts (user_id, pipedream_account_id, app_slug, app_name, created_at)
            VALUES
                ($1, 'acct_gmail_reg', 'gmail', 'Gmail', NOW()),
                ($1, 'acct_github_reg', 'github', 'GitHub', NOW()),
                ($1, 'acct_slack_reg', 'slack', 'Slack', NOW()),
                ($1, 'acct_stripe_reg', 'stripe', 'Stripe', NOW())
            ON CONFLICT DO NOTHING
        `, [TEST_USER_ID]);
    });

    beforeEach(async () => {
        service = new TriggerRegistrationService();

        // Clean agent_triggers for test agents before each test
        await pool.query(
            `DELETE FROM agent_triggers WHERE agent_id IN ($1, $2)`,
            [TEST_AGENT_ID, TEST_AGENT_ID_2]
        );
    });

    afterAll(async () => {
        // Clean up test data
        await pool.query(`DELETE FROM agent_triggers WHERE agent_id IN ($1, $2)`, [TEST_AGENT_ID, TEST_AGENT_ID_2]);
        await pool.query(`DELETE FROM connected_accounts WHERE user_id = $1`, [TEST_USER_ID]);
    });

    // -------------------------------------------------------------------------
    // reconcileTriggers()
    // -------------------------------------------------------------------------

    describe('reconcileTriggers()', () => {
        it('should register new triggers from parsed events', async () => {
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: null },
            ];

            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            expect(result.registered).toHaveLength(1);
            expect(result.registered[0].app).toBe('gmail');
            expect(result.registered[0].event_type).toBe('new_email');
            expect(result.deregistered).toHaveLength(0);
            expect(result.unchanged).toHaveLength(0);

            // Verify DB row was created
            const dbResult = await pool.query<AgentTriggerRow>(
                `SELECT * FROM agent_triggers WHERE agent_id = $1 AND app_slug = 'gmail'`,
                [TEST_AGENT_ID]
            );
            expect(dbResult.rows).toHaveLength(1);
            expect(dbResult.rows[0].event_type).toBe('new_email');
            expect(dbResult.rows[0].enabled).toBe(true);
            expect(dbResult.rows[0].user_id).toBe(TEST_USER_ID);
        });

        it('should register multiple triggers at once', async () => {
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: null },
                { app: 'github', event_type: 'pr_opened', filter: null },
            ];

            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            expect(result.registered).toHaveLength(2);
            expect(result.deregistered).toHaveLength(0);
        });

        it('should deregister triggers removed from HEARTBEAT.md', async () => {
            // First register a trigger
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email');

            // Now reconcile with empty events (trigger was removed from HEARTBEAT.md)
            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, []);

            expect(result.deregistered).toHaveLength(1);
            expect(result.deregistered[0].app).toBe('gmail');
            expect(result.registered).toHaveLength(0);

            // Verify DB row was deleted
            const dbResult = await pool.query(
                `SELECT * FROM agent_triggers WHERE agent_id = $1 AND app_slug = 'gmail'`,
                [TEST_AGENT_ID]
            );
            expect(dbResult.rows).toHaveLength(0);
        });

        it('should keep unchanged triggers intact', async () => {
            // Insert existing trigger
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email');

            // Reconcile with the same event
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: null },
            ];

            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            expect(result.unchanged).toHaveLength(1);
            expect(result.unchanged[0].app).toBe('gmail');
            expect(result.registered).toHaveLength(0);
            expect(result.deregistered).toHaveLength(0);
        });

        it('should handle filter changes by deregistering and re-registering', async () => {
            // Insert existing trigger with a filter
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email', '{"raw": "from:old-filter"}');

            // Reconcile with changed filter
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: 'from:new-filter' },
            ];

            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            expect(result.deregistered).toHaveLength(1);
            expect(result.registered).toHaveLength(1);
            expect(result.registered[0].app).toBe('gmail');

            // Verify DB row has new filter
            const dbResult = await pool.query<AgentTriggerRow>(
                `SELECT * FROM agent_triggers WHERE agent_id = $1 AND app_slug = 'gmail'`,
                [TEST_AGENT_ID]
            );
            expect(dbResult.rows).toHaveLength(1);
            expect(dbResult.rows[0].filter_config).toEqual({ raw: 'from:new-filter' });
        });

        it('should handle mixed scenario: add some, remove some, keep some', async () => {
            // Existing: gmail.new_email, github.pr_opened
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email');
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'github', 'pr_opened');

            // Desired: gmail.new_email (keep), stripe.payment_failed (add), github removed
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: null },
                { app: 'stripe', event_type: 'payment_failed', filter: null },
            ];

            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            expect(result.unchanged).toHaveLength(1);
            expect(result.unchanged[0].app).toBe('gmail');
            expect(result.registered).toHaveLength(1);
            expect(result.registered[0].app).toBe('stripe');
            expect(result.deregistered).toHaveLength(1);
            expect(result.deregistered[0].app).toBe('github');
        });

        it('should include warnings for apps not connected', async () => {
            // 'notion' is not connected for this test user
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'notion', event_type: 'page_updated', filter: null },
            ];

            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('notion');
            expect(result.registered).toHaveLength(0);
        });

        it('should store filter_config as raw when filter is provided', async () => {
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: 'from:vip-list' },
            ];

            await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            const dbResult = await pool.query<AgentTriggerRow>(
                `SELECT filter_config FROM agent_triggers WHERE agent_id = $1 AND app_slug = 'gmail'`,
                [TEST_AGENT_ID]
            );
            expect(dbResult.rows[0].filter_config).toEqual({ raw: 'from:vip-list' });
        });

        it('should store empty filter_config when no filter', async () => {
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: null },
            ];

            await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            const dbResult = await pool.query<AgentTriggerRow>(
                `SELECT filter_config FROM agent_triggers WHERE agent_id = $1 AND app_slug = 'gmail'`,
                [TEST_AGENT_ID]
            );
            expect(dbResult.rows[0].filter_config).toEqual({});
        });

        it('should handle adding filter where none existed before', async () => {
            // Existing trigger with no filter
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email');

            // Now add a filter
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: 'from:boss' },
            ];

            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            expect(result.deregistered).toHaveLength(1);
            expect(result.registered).toHaveLength(1);
        });

        it('should handle removing filter where one existed before', async () => {
            // Existing trigger with filter
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email', '{"raw": "from:boss"}');

            // Now remove the filter
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: null },
            ];

            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            expect(result.deregistered).toHaveLength(1);
            expect(result.registered).toHaveLength(1);

            const dbResult = await pool.query<AgentTriggerRow>(
                `SELECT filter_config FROM agent_triggers WHERE agent_id = $1 AND app_slug = 'gmail'`,
                [TEST_AGENT_ID]
            );
            expect(dbResult.rows[0].filter_config).toEqual({});
        });

        it('should not affect triggers belonging to other agents', async () => {
            // Insert trigger for agent 2
            await insertTestTrigger(TEST_AGENT_ID_2, TEST_USER_ID, 'gmail', 'new_email');

            // Reconcile for agent 1 (no events)
            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, []);

            expect(result.deregistered).toHaveLength(0);

            // Verify agent 2's trigger is untouched
            const dbResult = await pool.query(
                `SELECT * FROM agent_triggers WHERE agent_id = $1`,
                [TEST_AGENT_ID_2]
            );
            expect(dbResult.rows).toHaveLength(1);
        });
    });

    // -------------------------------------------------------------------------
    // syncFromEvents() - end-to-end from event list
    // -------------------------------------------------------------------------

    describe('syncFromEvents()', () => {
        it('should reconcile events list with DB triggers', async () => {
            const events: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: null },
                { app: 'github', event_type: 'pr_opened', filter: null },
            ];

            const result = await service.syncFromEvents(TEST_AGENT_ID, TEST_USER_ID, events);

            expect(result.registered).toHaveLength(2);
            expect(result.registered[0].app).toBe('gmail');
            expect(result.registered[1].app).toBe('github');
        });

        it('should deregister when events list is empty', async () => {
            // First register a trigger manually
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email');

            // Sync with empty events - should deregister
            const result = await service.syncFromEvents(TEST_AGENT_ID, TEST_USER_ID, []);

            expect(result.deregistered).toHaveLength(1);
            expect(result.deregistered[0].app).toBe('gmail');
        });

        it('should handle events with filter', async () => {
            const events: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: 'from:vip-list' },
            ];

            const result = await service.syncFromEvents(TEST_AGENT_ID, TEST_USER_ID, events);

            expect(result.registered).toHaveLength(1);

            const dbResult = await pool.query<AgentTriggerRow>(
                `SELECT filter_config FROM agent_triggers WHERE agent_id = $1`,
                [TEST_AGENT_ID]
            );
            expect(dbResult.rows[0].filter_config).toEqual({ raw: 'from:vip-list' });
        });
    });

    // -------------------------------------------------------------------------
    // getRegisteredTriggers()
    // -------------------------------------------------------------------------

    describe('getRegisteredTriggers()', () => {
        it('should return all triggers for an agent', async () => {
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email');
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'github', 'pr_opened');

            const triggers = await service.getRegisteredTriggers(TEST_AGENT_ID);

            expect(triggers).toHaveLength(2);
            expect(triggers.map(t => t.app_slug).sort()).toEqual(['github', 'gmail']);
        });

        it('should return empty array when no triggers registered', async () => {
            const triggers = await service.getRegisteredTriggers(TEST_AGENT_ID);

            expect(triggers).toEqual([]);
        });
    });

});
