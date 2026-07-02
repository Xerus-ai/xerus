// Connected-accounts reconciliation tests.
// Exercises toolsRepository.reconcileConnections against the real Neon test DB.
// The Pipedream fetch (toolsService.reconcileConnectedAccounts) needs live Pipedream,
// so we test the convergence logic directly with injected account data — no mocks.

import { query } from '../setup';
import { toolsRepository } from '../../src/domains/tools/repository';
import type { SaveConnectionInput } from '../../src/domains/tools/types';

const userA = 'test_recon_a_' + Date.now();
const userB = 'test_recon_b_' + Date.now();

function acct(userId: string, id: string, appSlug: string, appName: string): SaveConnectionInput {
    return { user_id: userId, pipedream_account_id: id, app_slug: appSlug, app_name: appName };
}

async function insertUser(userId: string): Promise<void> {
    await query(
        `INSERT INTO users (user_id, email, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, `${userId}@example.com`, 'Reconciliation Test'],
    );
}

async function seed(userId: string, id: string, appSlug: string, appName: string): Promise<void> {
    await query(
        `INSERT INTO connected_accounts (user_id, pipedream_account_id, app_slug, app_name, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, id, appSlug, appName],
    );
}

async function accountsFor(userId: string): Promise<Array<{ pipedream_account_id: string; app_slug: string; app_name: string }>> {
    const result = await query<{ pipedream_account_id: string; app_slug: string; app_name: string }>(
        `SELECT pipedream_account_id, app_slug, app_name
         FROM connected_accounts WHERE user_id = $1 ORDER BY pipedream_account_id`,
        [userId],
    );
    return result.rows;
}

describe('toolsRepository.reconcileConnections', () => {
    beforeAll(async () => {
        await insertUser(userA);
        await insertUser(userB);
    });

    beforeEach(async () => {
        await query('DELETE FROM connected_accounts WHERE user_id = ANY($1::text[])', [[userA, userB]]);
    });

    afterAll(async () => {
        // ON DELETE CASCADE clears connected_accounts for these users.
        await query('DELETE FROM users WHERE user_id = ANY($1::text[])', [[userA, userB]]);
    });

    it('backfills every account the DB is missing (repair for the webhook parse bug)', async () => {
        const remote = [
            acct(userA, `${userA}_1`, 'notion', 'Notion WS'),
            acct(userA, `${userA}_2`, 'gmail', 'Work Gmail'),
        ];

        const summary = await toolsRepository.reconcileConnections(userA, remote);

        expect(summary.added).toBe(2);
        expect(summary.removed).toBe(0);
        expect(summary.total).toBe(2);

        const rows = await accountsFor(userA);
        expect(rows.map((r) => r.pipedream_account_id)).toEqual([`${userA}_1`, `${userA}_2`]);
        expect(rows.map((r) => r.app_slug)).toEqual(['notion', 'gmail']);
    });

    it('is idempotent — a second reconcile with the same set changes nothing', async () => {
        const remote = [acct(userA, `${userA}_1`, 'notion', 'Notion WS')];

        await toolsRepository.reconcileConnections(userA, remote);
        const second = await toolsRepository.reconcileConnections(userA, remote);

        expect(second.added).toBe(0);
        expect(second.removed).toBe(0);
        expect(second.total).toBe(1);
        expect(await accountsFor(userA)).toHaveLength(1);
    });

    it('removes local rows the authoritative set no longer contains', async () => {
        await seed(userA, `${userA}_stale`, 'slack', 'Old Slack');
        await seed(userA, `${userA}_keep`, 'notion', 'Notion WS');

        const remote = [acct(userA, `${userA}_keep`, 'notion', 'Notion WS')];
        const summary = await toolsRepository.reconcileConnections(userA, remote);

        expect(summary.added).toBe(0);
        expect(summary.removed).toBe(1);
        expect(summary.total).toBe(1);

        const rows = await accountsFor(userA);
        expect(rows.map((r) => r.pipedream_account_id)).toEqual([`${userA}_keep`]);
    });

    it('repairs drifted app_slug / app_name on an existing account', async () => {
        await seed(userA, `${userA}_1`, 'wrong_slug', 'Stale Name');

        const remote = [acct(userA, `${userA}_1`, 'notion', 'Correct Name')];
        const summary = await toolsRepository.reconcileConnections(userA, remote);

        expect(summary.added).toBe(0);
        expect(summary.removed).toBe(0);

        const rows = await accountsFor(userA);
        expect(rows).toHaveLength(1);
        expect(rows[0].app_slug).toBe('notion');
        expect(rows[0].app_name).toBe('Correct Name');
    });

    it('clears all of a user\'s rows when the authoritative set is empty', async () => {
        await seed(userA, `${userA}_1`, 'notion', 'Notion WS');
        await seed(userA, `${userA}_2`, 'gmail', 'Gmail');

        const summary = await toolsRepository.reconcileConnections(userA, []);

        expect(summary.added).toBe(0);
        expect(summary.removed).toBe(2);
        expect(summary.total).toBe(0);
        expect(await accountsFor(userA)).toHaveLength(0);
    });

    it('never touches another user\'s rows', async () => {
        await seed(userB, `${userB}_1`, 'github', 'Personal GitHub');

        await toolsRepository.reconcileConnections(userA, [acct(userA, `${userA}_1`, 'notion', 'Notion WS')]);

        const bRows = await accountsFor(userB);
        expect(bRows.map((r) => r.pipedream_account_id)).toEqual([`${userB}_1`]);
    });
});
