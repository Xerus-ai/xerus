// Pipedream Connect Webhook Integration Tests
// Exercises POST /api/v1/tools/webhook/connected against the real app and DB.
// The webhook is unauthenticated and never calls Pipedream, so no mocks are used.
// Every request carries a real x-pd-signature computed with the same helper the
// route verifies against — so signing and verification can never silently drift.

import request from 'supertest';
import { app } from '../../src/index';
import { getTestAuthHeaders, query } from '../setup';
import { toolsRepository } from '../../src/domains/tools/repository';
import { signPipedreamWebhookBody } from '../../src/domains/tools/pipedream-webhook';

const WEBHOOK_SECRET = 'whsec_test_pipedream_signing_key';
const WEBHOOK_PATH = '/api/v1/tools/webhook/connected';

let originalSecret: string | undefined;

function buildSuccessPayload(externalUserId: string, pipedreamAccountId: string) {
    return {
        event: 'CONNECTION_SUCCESS',
        connect_token: 'ctok_test_token',
        account: {
            id: pipedreamAccountId,
            name: 'My Notion Workspace',
            external_id: externalUserId,
            healthy: true,
            dead: false,
            app: {
                name_slug: 'notion',
                name: 'Notion',
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
    };
}

// Sends the payload as the exact raw bytes the signature is computed over, so the
// route verifies against identical input. `signature: null` omits the header entirely.
function postSignedWebhook(
    payload: unknown,
    opts: { secret?: string; timestamp?: number; signature?: string | null } = {},
) {
    const rawBody = JSON.stringify(payload);
    const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
    const signature = opts.signature === undefined
        ? signPipedreamWebhookBody(rawBody, opts.secret ?? WEBHOOK_SECRET, timestamp)
        : opts.signature;

    const req = request(app).post(WEBHOOK_PATH).set('Content-Type', 'application/json');
    if (signature !== null) {
        req.set('x-pd-signature', signature);
    }
    return req.send(rawBody);
}

describe('POST /api/v1/tools/webhook/connected', () => {
    const testUserId = 'test_webhook_' + Date.now();
    const testEmail = `webhook_${Date.now()}@example.com`;
    const createdAccountIds: string[] = [];

    beforeAll(async () => {
        originalSecret = process.env.PIPEDREAM_WEBHOOK_SECRET;
        process.env.PIPEDREAM_WEBHOOK_SECRET = WEBHOOK_SECRET;

        await request(app)
            .post('/api/v1/users/find-or-create')
            .set(getTestAuthHeaders(testUserId))
            .send({
                uid: testUserId,
                email: testEmail,
                display_name: 'Webhook Test User',
            });
    });

    afterAll(async () => {
        for (const accountId of createdAccountIds) {
            await query('DELETE FROM connected_accounts WHERE pipedream_account_id = $1', [accountId]);
        }
        await query('DELETE FROM users WHERE user_id = $1', [testUserId]);

        if (originalSecret === undefined) {
            delete process.env.PIPEDREAM_WEBHOOK_SECRET;
        } else {
            process.env.PIPEDREAM_WEBHOOK_SECRET = originalSecret;
        }
    });

    it('writes a connected_accounts row from a signed, nested CONNECTION_SUCCESS payload', async () => {
        const pipedreamAccountId = 'apn_success_' + Date.now();
        createdAccountIds.push(pipedreamAccountId);

        const response = await postSignedWebhook(buildSuccessPayload(testUserId, pipedreamAccountId)).expect(200);

        expect(response.body.status).toBe('connected');

        const saved = await toolsRepository.getConnectionByPipedreamId(pipedreamAccountId);
        expect(saved).not.toBeNull();
        expect(saved!.user_id).toBe(testUserId);
        expect(saved!.app_slug).toBe('notion');
        expect(saved!.app_name).toBe('My Notion Workspace');
        expect(saved!.pipedream_account_id).toBe(pipedreamAccountId);
    });

    it('is idempotent — a repeated payload reports already_connected and writes no duplicate', async () => {
        const pipedreamAccountId = 'apn_dupe_' + Date.now();
        createdAccountIds.push(pipedreamAccountId);
        const payload = buildSuccessPayload(testUserId, pipedreamAccountId);

        const first = await postSignedWebhook(payload).expect(200);
        expect(first.body.status).toBe('connected');

        const second = await postSignedWebhook(payload).expect(200);
        expect(second.body.status).toBe('already_connected');

        const countResult = await query<{ count: string }>(
            'SELECT COUNT(*) as count FROM connected_accounts WHERE pipedream_account_id = $1',
            [pipedreamAccountId]
        );
        expect(parseInt(countResult.rows[0].count, 10)).toBe(1);
    });

    it('ignores a CONNECTION_ERROR event without writing a row', async () => {
        const pipedreamAccountId = 'apn_error_' + Date.now();
        createdAccountIds.push(pipedreamAccountId);

        const response = await postSignedWebhook({
            event: 'CONNECTION_ERROR',
            connect_token: 'ctok_test_token',
            error: 'user_denied_access',
            account: {
                id: pipedreamAccountId,
                external_id: testUserId,
                app: { name_slug: 'notion', name: 'Notion' },
            },
        }).expect(200);

        expect(response.body.status).toBe('ignored');

        const saved = await toolsRepository.getConnectionByPipedreamId(pipedreamAccountId);
        expect(saved).toBeNull();
    });

    it('rejects a malformed payload with no account (fail-fast 400)', async () => {
        const response = await postSignedWebhook({ event: 'CONNECTION_SUCCESS' }).expect(400);
        expect(response.body.error).toBeDefined();
    });

    it('rejects a payload whose account is missing required identity fields (fail-fast 400)', async () => {
        const response = await postSignedWebhook({
            event: 'CONNECTION_SUCCESS',
            account: {
                name: 'Nameless',
                app: { name: 'Notion' },
            },
        }).expect(400);

        expect(response.body.error).toBeDefined();
    });

    it('rejects a request with no x-pd-signature header (401, writes no row)', async () => {
        const pipedreamAccountId = 'apn_nosig_' + Date.now();
        createdAccountIds.push(pipedreamAccountId);

        const response = await postSignedWebhook(
            buildSuccessPayload(testUserId, pipedreamAccountId),
            { signature: null },
        ).expect(401);

        expect(response.body.error).toBe('Invalid webhook signature');
        const saved = await toolsRepository.getConnectionByPipedreamId(pipedreamAccountId);
        expect(saved).toBeNull();
    });

    it('rejects a request signed with the wrong secret (401, writes no row)', async () => {
        const pipedreamAccountId = 'apn_badsig_' + Date.now();
        createdAccountIds.push(pipedreamAccountId);

        const response = await postSignedWebhook(
            buildSuccessPayload(testUserId, pipedreamAccountId),
            { secret: 'whsec_wrong_key' },
        ).expect(401);

        expect(response.body.error).toBe('Invalid webhook signature');
        const saved = await toolsRepository.getConnectionByPipedreamId(pipedreamAccountId);
        expect(saved).toBeNull();
    });

    it('rejects a request whose signature timestamp is stale (401, replay protection)', async () => {
        const pipedreamAccountId = 'apn_stale_' + Date.now();
        createdAccountIds.push(pipedreamAccountId);

        const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
        const response = await postSignedWebhook(
            buildSuccessPayload(testUserId, pipedreamAccountId),
            { timestamp: staleTimestamp },
        ).expect(401);

        expect(response.body.error).toBe('Invalid webhook signature');
        const saved = await toolsRepository.getConnectionByPipedreamId(pipedreamAccountId);
        expect(saved).toBeNull();
    });
});
