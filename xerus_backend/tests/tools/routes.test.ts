// Tools Domain Routes Integration Tests
// Current-contract tests with local Pipedream mocks

const mockPipedreamClient = {
    createConnectToken: jest.fn(),
    getApps: jest.fn(),
    getAccounts: jest.fn(),
    deleteAccount: jest.fn(),
    getComponents: jest.fn(),
    getComponent: jest.fn(),
    runAction: jest.fn(),
    configureComponent: jest.fn(),
};

jest.mock('../../src/shared/clients/pipedream', () => ({
    getPipedreamClient: () => mockPipedreamClient,
    resetPipedreamClient: jest.fn(),
}));

import request from 'supertest';
import { app } from '../../src/index';
import { getTestAuthHeaders } from '../setup';
import { toolsRepository } from '../../src/domains/tools/repository';

const gmailAccount = {
    id: 'apn_test_123',
    name: 'Test Gmail',
    external_id: 'external-user',
    healthy: true,
    dead: false,
    app: {
        name_slug: 'gmail',
        name: 'Gmail',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

function setupMockPipedreamClient(): void {
    mockPipedreamClient.createConnectToken.mockResolvedValue({
        token: 'test-connect-token',
        expires_at: '2026-03-09T00:00:00.000Z',
        connect_link_url: 'https://connect.pipedream.test/session',
    });
    mockPipedreamClient.getApps.mockImplementation(async ({ q, after }: { q?: string; after?: string }) => {
        if (after) {
            return { data: [], page_info: { end_cursor: undefined, total_count: q ? 1 : 2 } };
        }

        const apps = q
            ? [{ name_slug: 'gmail', name: 'Gmail', categories: ['email'] }]
            : [
                { name_slug: 'gmail', name: 'Gmail', categories: ['email'] },
                { name_slug: 'slack', name: 'Slack', categories: ['communication'] },
            ];

        return { data: apps, page_info: { end_cursor: undefined, total_count: apps.length } };
    });
    mockPipedreamClient.getAccounts.mockImplementation(async ({ app }: { app?: string }) => ({
        data: app ? [gmailAccount].filter((account) => account.app.name_slug === app) : [gmailAccount],
    }));
    mockPipedreamClient.deleteAccount.mockResolvedValue(undefined);
    mockPipedreamClient.getComponents.mockImplementation(async ({ app, componentType, q }: { app: string; componentType: string; q?: string }) => ({
        data: [{ key: componentType === 'action' ? `${app}-send-email` : `${app}-new-email`, name: q ? 'Filtered Component' : 'Test Component' }],
    }));
    mockPipedreamClient.getComponent.mockImplementation(async ({ key }: { key: string }) => ({
        data: { key, name: 'Send Email' },
    }));
    mockPipedreamClient.runAction.mockResolvedValue({
        ret: { id: 'exec_123', ok: true },
        os: ['ran action'],
    });
    mockPipedreamClient.configureComponent.mockResolvedValue({
        options: [{ label: 'Inbox', value: 'INBOX' }],
    });
}

describe('Tools API Routes', () => {
    const testUserId = 'test_tools_' + Date.now();
    const testEmail = `tools_${Date.now()}@example.com`;

    beforeAll(async () => {
        setupMockPipedreamClient();

        await request(app)
            .post('/api/v1/users/find-or-create')
            .set(getTestAuthHeaders(testUserId))
            .send({
                uid: testUserId,
                email: testEmail,
                display_name: 'Tools Test User',
            });

        await toolsRepository.saveConnection({
            user_id: testUserId,
            pipedream_account_id: 'apn_test_123',
            app_slug: 'gmail',
            app_name: 'Gmail',
        });

        await toolsRepository.upsertApp({
            name_slug: 'gmail',
            name: 'Gmail',
            description: 'Email',
            auth_type: 'oauth',
            img_src: null,
            categories: ['email'],
            featured_weight: 1,
        });

        await toolsRepository.upsertApp({
            name_slug: 'slack',
            name: 'Slack',
            description: 'Chat',
            auth_type: 'oauth',
            img_src: null,
            categories: ['communication'],
            featured_weight: 1,
        });
    });

    beforeEach(() => {
        setupMockPipedreamClient();
    });

    describe('POST /api/v1/tools/apps', () => {
        it('should list apps with authentication', async () => {
            const response = await request(app)
                .post('/api/v1/tools/apps')
                .set(getTestAuthHeaders(testUserId))
                .send({ limit: 10 })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data.apps)).toBe(true);
            expect(response.body.data.pagination.total).toBeDefined();
            expect(response.body.meta.request_id).toBeDefined();
        });

        it('should list apps with search query', async () => {
            const response = await request(app)
                .post('/api/v1/tools/apps')
                .set(getTestAuthHeaders(testUserId))
                .send({ query: 'gmail', limit: 5 })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.apps[0].name_slug).toBe('gmail');
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app).post('/api/v1/tools/apps').send({ limit: 10 }).expect(401);
            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/v1/tools/connect-token', () => {
        it('should generate a connect token', async () => {
            const response = await request(app)
                .post('/api/v1/tools/connect-token')
                .set(getTestAuthHeaders(testUserId))
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.connect_url).toBeDefined();
            expect(response.body.data.token).toBeDefined();
            expect(response.body.data.expires_at).toBeDefined();
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app)
                .post('/api/v1/tools/connect-token')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/tools/accounts', () => {
        it('should get all connected accounts', async () => {
            const response = await request(app)
                .get('/api/v1/tools/accounts')
                .set(getTestAuthHeaders(testUserId))
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data[0].app.name_slug).toBe('gmail');
            expect(response.body.data[0].id).toBe('apn_test_123');
        });

        it('should filter by app', async () => {
            const response = await request(app)
                .get('/api/v1/tools/accounts')
                .query({ app: 'gmail' })
                .set(getTestAuthHeaders(testUserId))
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data[0].app.name_slug).toBe('gmail');
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app).get('/api/v1/tools/accounts').expect(401);
            expect(response.body.success).toBe(false);
        });
    });

    describe('DELETE /api/v1/tools/accounts/:pipedream_account_id', () => {
        it('should disconnect account', async () => {
            const testAccountId = 'apn_test_delete_' + Date.now();

            await toolsRepository.saveConnection({
                user_id: testUserId,
                pipedream_account_id: testAccountId,
                app_slug: 'slack',
                app_name: 'Slack',
            });

            const response = await request(app)
                .delete(`/api/v1/tools/accounts/${testAccountId}`)
                .set(getTestAuthHeaders(testUserId))
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.message).toContain('disconnected');

            const connection = await toolsRepository.getConnectionByPipedreamId(testAccountId);
            expect(connection).toBeNull();
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app).delete('/api/v1/tools/accounts/apn_test_123').expect(401);
            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/tools/actions/:app_slug', () => {
        it('should list actions for app', async () => {
            const response = await request(app)
                .get('/api/v1/tools/actions/gmail')
                .set(getTestAuthHeaders(testUserId))
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data.actions)).toBe(true);
            expect(response.body.data.total).toBeDefined();
        });

        it('should list actions with search query', async () => {
            const response = await request(app)
                .get('/api/v1/tools/actions/gmail')
                .query({ query: 'send', limit: 5 })
                .set(getTestAuthHeaders(testUserId))
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.actions[0].key).toBe('gmail-send-email');
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app).get('/api/v1/tools/actions/gmail').expect(401);
            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/tools/action/:action_key', () => {
        it('should get action details', async () => {
            const response = await request(app)
                .get('/api/v1/tools/action/gmail-send-email')
                .set(getTestAuthHeaders(testUserId))
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.key).toBe('gmail-send-email');
            expect(response.body.data.name).toBeDefined();
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app).get('/api/v1/tools/action/gmail-send-email').expect(401);
            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/v1/tools/execute', () => {
        it('should execute action successfully', async () => {
            const response = await request(app)
                .post('/api/v1/tools/execute')
                .set(getTestAuthHeaders(testUserId))
                .send({
                    action_key: 'gmail-send-email',
                    pipedream_account_id: 'apn_test_123',
                    params: {
                        to: 'test@example.com',
                        subject: 'Test Email',
                        body: 'Hello from test',
                    },
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.success).toBe(true);
            expect(response.body.data.data).toEqual({ id: 'exec_123', ok: true });
        });

        it('should return 400 if account not connected', async () => {
            const response = await request(app)
                .post('/api/v1/tools/execute')
                .set(getTestAuthHeaders(testUserId))
                .send({
                    action_key: 'gmail-send-email',
                    pipedream_account_id: 'apn_invalid',
                    params: { to: 'test@example.com' },
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('TOOL_NOT_CONNECTED');
        });

        it('should validate required fields', async () => {
            const response = await request(app)
                .post('/api/v1/tools/execute')
                .set(getTestAuthHeaders(testUserId))
                .send({})
                .expect(422);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('TOOL_VALIDATION_ERROR');
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app)
                .post('/api/v1/tools/execute')
                .send({ action_key: 'gmail-send-email', pipedream_account_id: 'apn_test_123', params: {} })
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/v1/tools/options', () => {
        it('should get dynamic action options', async () => {
            const response = await request(app)
                .post('/api/v1/tools/options')
                .set(getTestAuthHeaders(testUserId))
                .send({
                    action_key: 'gmail-list-emails',
                    prop_name: 'folder',
                    configured_props: {
                        gmail: { authProvisionId: 'apn_test_123' },
                    },
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data[0].value).toBe('INBOX');
        });

        it('should validate required fields', async () => {
            const response = await request(app)
                .post('/api/v1/tools/options')
                .set(getTestAuthHeaders(testUserId))
                .send({})
                .expect(422);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('TOOL_VALIDATION_ERROR');
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app)
                .post('/api/v1/tools/options')
                .send({ action_key: 'gmail-list-emails', prop_name: 'folder', configured_props: {} })
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });
});
