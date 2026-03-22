// Trigger Registration Service Tests
// Tests the reconciliation logic that syncs HEARTBEAT.md events with agent_triggers table
import { pool } from '../../../database/connection';
import { TriggerRegistrationService } from '../trigger-registration.service';
import { parseHeartbeatMd, type ParsedEventEntry } from '../../heartbeat/heartbeat-md-parser';
import type { AgentTriggerRow } from '../../heartbeat/normalized-event.types';

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_pipedream_connections (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR(255) NOT NULL,
                app_slug VARCHAR(100) NOT NULL,
                account_id VARCHAR(255) NOT NULL,
                is_active BOOLEAN DEFAULT true NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
                UNIQUE(user_id, app_slug)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_native_connections (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR(255) NOT NULL,
                app_slug VARCHAR(100) NOT NULL,
                account_id VARCHAR(255) NOT NULL,
                is_active BOOLEAN DEFAULT true NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
                UNIQUE(user_id, app_slug)
            )
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

        // Setup pipedream connections for test user
        await pool.query(`
            INSERT INTO user_pipedream_connections (user_id, app_slug, account_id, is_active)
            VALUES
                ($1, 'gmail', 'acct_gmail_reg', true),
                ($1, 'github', 'acct_github_reg', true),
                ($1, 'slack', 'acct_slack_reg', true),
                ($1, 'stripe', 'acct_stripe_reg', true)
            ON CONFLICT (user_id, app_slug) DO UPDATE SET
                account_id = EXCLUDED.account_id,
                is_active = EXCLUDED.is_active
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
        await pool.query(`DELETE FROM user_pipedream_connections WHERE user_id = $1`, [TEST_USER_ID]);
    });

    // -------------------------------------------------------------------------
    // parseHeartbeatMd integration (verify the parser returns what we expect)
    // -------------------------------------------------------------------------

    describe('HEARTBEAT.md event parsing', () => {
        it('should parse simple event entries', () => {
            const md = `## Events\n### On: gmail.new_email\n- Check inbox`;
            const result = parseHeartbeatMd(md);

            expect(result.events).toHaveLength(1);
            expect(result.events[0].app).toBe('gmail');
            expect(result.events[0].event_type).toBe('new_email');
            expect(result.events[0].filter).toBeNull();
        });

        it('should parse event entries with filters', () => {
            const md = `## Events\n### On: gmail.new_email [filter: "from:vip-list"]\n- Handle VIP`;
            const result = parseHeartbeatMd(md);

            expect(result.events).toHaveLength(1);
            expect(result.events[0].filter).toBe('from:vip-list');
        });

        it('should parse multiple event entries', () => {
            const md = [
                '## Events',
                '### On: gmail.new_email',
                '- Check inbox',
                '### On: github.check_suite.failure',
                '- Investigate failure',
                '### On: stripe.payment_failed',
                '- Alert user',
            ].join('\n');
            const result = parseHeartbeatMd(md);

            expect(result.events).toHaveLength(3);
            expect(result.events[0].app).toBe('gmail');
            expect(result.events[1].app).toBe('github');
            expect(result.events[1].event_type).toBe('check_suite.failure');
            expect(result.events[2].app).toBe('stripe');
        });

        it('should return empty events for HEARTBEAT.md with no events section', () => {
            const md = `## Identity\nI am a helpful agent\n## Scheduled\n### Every 30 minutes\n- Check stuff`;
            const result = parseHeartbeatMd(md);

            expect(result.events).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------------
    // reconcileTriggers()
    // -------------------------------------------------------------------------

    describe('reconcileTriggers()', () => {
        it('should register new triggers from parsed events', async () => {
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: null, instructions: ['Check inbox'] },
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
                { app: 'gmail', event_type: 'new_email', filter: null, instructions: [] },
                { app: 'github', event_type: 'pr_opened', filter: null, instructions: [] },
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
                { app: 'gmail', event_type: 'new_email', filter: null, instructions: [] },
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
                { app: 'gmail', event_type: 'new_email', filter: 'from:new-filter', instructions: [] },
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
                { app: 'gmail', event_type: 'new_email', filter: null, instructions: [] },
                { app: 'stripe', event_type: 'payment_failed', filter: null, instructions: [] },
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
                { app: 'notion', event_type: 'page_updated', filter: null, instructions: [] },
            ];

            const result = await service.reconcileTriggers(TEST_AGENT_ID, TEST_USER_ID, desiredEvents);

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('notion');
            expect(result.registered).toHaveLength(0);
        });

        it('should store filter_config as raw when filter is provided', async () => {
            const desiredEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: 'from:vip-list', instructions: [] },
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
                { app: 'gmail', event_type: 'new_email', filter: null, instructions: [] },
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
                { app: 'gmail', event_type: 'new_email', filter: 'from:boss', instructions: [] },
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
                { app: 'gmail', event_type: 'new_email', filter: null, instructions: [] },
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
    // syncFromHeartbeatMd() - end-to-end from raw markdown
    // -------------------------------------------------------------------------

    describe('syncFromHeartbeatMd()', () => {
        it('should parse HEARTBEAT.md content and reconcile triggers', async () => {
            const heartbeatMd = [
                '## Identity',
                'I am a helpful agent',
                '## Scheduled',
                '### Every 30 minutes',
                '- Check stuff',
                '## Events',
                '### On: gmail.new_email',
                '- Check inbox',
                '### On: github.pr_opened',
                '- Review PR',
            ].join('\n');

            const result = await service.syncFromHeartbeatMd(TEST_AGENT_ID, TEST_USER_ID, heartbeatMd);

            expect(result.registered).toHaveLength(2);
            expect(result.registered[0].app).toBe('gmail');
            expect(result.registered[1].app).toBe('github');
        });

        it('should handle HEARTBEAT.md with no events section', async () => {
            const heartbeatMd = [
                '## Identity',
                'I am a helpful agent',
                '## Scheduled',
                '### Every 30 minutes',
                '- Check stuff',
            ].join('\n');

            // First register a trigger manually
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email');

            // Sync with md that has no events - should deregister
            const result = await service.syncFromHeartbeatMd(TEST_AGENT_ID, TEST_USER_ID, heartbeatMd);

            expect(result.deregistered).toHaveLength(1);
            expect(result.deregistered[0].app).toBe('gmail');
        });

        it('should handle HEARTBEAT.md with filter syntax', async () => {
            const heartbeatMd = [
                '## Events',
                '### On: gmail.new_email [filter: "from:vip-list"]',
                '- Handle VIP mail',
            ].join('\n');

            const result = await service.syncFromHeartbeatMd(TEST_AGENT_ID, TEST_USER_ID, heartbeatMd);

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

    // -------------------------------------------------------------------------
    // detectDrift()
    // -------------------------------------------------------------------------

    describe('detectDrift()', () => {
        it('should detect no drift when DB matches parsed events', async () => {
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email');

            const parsedEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: null, instructions: [] },
            ];

            const drift = await service.detectDrift(TEST_AGENT_ID, parsedEvents);

            expect(drift.inDbOnly).toHaveLength(0);
            expect(drift.inMdOnly).toHaveLength(0);
            expect(drift.hasDrift).toBe(false);
        });

        it('should detect triggers in DB but not in HEARTBEAT.md', async () => {
            await insertTestTrigger(TEST_AGENT_ID, TEST_USER_ID, 'gmail', 'new_email');

            const drift = await service.detectDrift(TEST_AGENT_ID, []);

            expect(drift.inDbOnly).toHaveLength(1);
            expect(drift.inDbOnly[0]).toBe('gmail.new_email');
            expect(drift.hasDrift).toBe(true);
        });

        it('should detect triggers in HEARTBEAT.md but not in DB', async () => {
            const parsedEvents: ParsedEventEntry[] = [
                { app: 'gmail', event_type: 'new_email', filter: null, instructions: [] },
            ];

            const drift = await service.detectDrift(TEST_AGENT_ID, parsedEvents);

            expect(drift.inMdOnly).toHaveLength(1);
            expect(drift.inMdOnly[0]).toBe('gmail.new_email');
            expect(drift.hasDrift).toBe(true);
        });
    });
});
