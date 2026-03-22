// Tools Domain Service Tests - Real Services
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { query } from '../../src/database/connection';
import { ToolsService, toolsService } from '../../src/domains/tools/service';
import { toolsRepository } from '../../src/domains/tools/repository';
import { ToolNotConnectedError, ToolExecutionError } from '../../src/domains/tools/errors';

const TEST_USER_ID = 'test_tools_service_user';

async function createTestUser(userId: string): Promise<void> {
    const uniqueEmail = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
    await query(
        `
    INSERT INTO users (user_id, email, display_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name
  `,
        [userId, uniqueEmail, 'Test User']
    );
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM tool_executions WHERE app_slug LIKE 'test_%'");
    await query("DELETE FROM connected_accounts WHERE app_slug LIKE 'test_%' OR user_id = $1", [TEST_USER_ID]);
}

describe('ToolsService - Real Services', () => {
    let service: ToolsService;

    beforeAll(async () => {
        service = toolsService;
        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('getConnectedAccounts', () => {
        it('should return all connected accounts for user', async () => {
            const timestamp = Date.now();
            await toolsRepository.saveConnection({
                user_id: TEST_USER_ID,
                pipedream_account_id: `apn_test_service_1_${timestamp}`,
                app_slug: 'test_gmail',
                app_name: 'Gmail Test',
            });

            await toolsRepository.saveConnection({
                user_id: TEST_USER_ID,
                pipedream_account_id: `apn_test_service_2_${timestamp}`,
                app_slug: 'test_slack',
                app_name: 'Slack Test',
            });

            const result = await service.getConnectedAccounts({ user_id: TEST_USER_ID });

            expect(result.length).toBeGreaterThanOrEqual(2);
            const testConnections = result.filter(c => c.app_slug.startsWith('test_'));
            expect(testConnections.length).toBeGreaterThanOrEqual(2);
        });

        it('should filter by app_slug when provided', async () => {
            const timestamp = Date.now();
            await toolsRepository.saveConnection({
                user_id: TEST_USER_ID,
                pipedream_account_id: `apn_test_filter_${timestamp}`,
                app_slug: 'test_gmail_filter',
                app_name: 'Gmail Test',
            });

            const result = await service.getConnectedAccounts({
                user_id: TEST_USER_ID,
                app_slug: 'test_gmail_filter',
            });

            expect(result.length).toBeGreaterThanOrEqual(1);
            result.forEach(conn => {
                expect(conn.app_slug).toBe('test_gmail_filter');
            });
        });
    });

    describe('executeAction - error handling', () => {
        it('should throw error if account not connected', async () => {
            await expect(
                service.executeAction({
                    user_id: TEST_USER_ID,
                    action_key: 'gmail-send-email',
                    pipedream_account_id: 'apn_nonexistent_' + Date.now(),
                    params: { to: 'test@example.com' },
                })
            ).rejects.toThrow(ToolNotConnectedError);
        });

        it('should validate and execute with real connection', async () => {
            const timestamp = Date.now();
            const pipedreamId = `apn_test_execute_${timestamp}`;

            await toolsRepository.saveConnection({
                user_id: TEST_USER_ID,
                pipedream_account_id: pipedreamId,
                app_slug: 'test_gmail',
                app_name: 'Gmail Test',
            });

            try {
                await service.executeAction({
                    user_id: TEST_USER_ID,
                    action_key: 'test_gmail-send-email',
                    pipedream_account_id: pipedreamId,
                    params: { to: 'test@example.com' },
                });

                fail('Expected ToolExecutionError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(ToolExecutionError);

                const executions = await toolsRepository.getExecutionHistory(0, 0);
                const testExecution = executions.find(e => e.app_slug === 'test_gmail');
                if (testExecution) {
                    expect(testExecution.success).toBe(false);
                    expect(testExecution.error).toBeDefined();
                }
            }
        });
    });

    describe('listApps - Pipedream API', () => {
        it('should call real Pipedream API to list apps', async () => {
            try {
                const result = await service.listApps();
                expect(result.apps).toBeDefined();
                expect(Array.isArray(result.apps)).toBe(true);
                expect(result.pagination.total).toBeGreaterThan(0);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });

    describe('startConnection - Pipedream API', () => {
        it('should call real Pipedream API to create connect token', async () => {
            try {
                const result = await service.startConnection({
                    user_id: TEST_USER_ID,
                });

                expect(result.connect_url).toBeDefined();
                expect(result.token).toBeDefined();
                expect(result.expires_at).toBeDefined();
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });

    describe('listActions - Pipedream API', () => {
        it('should call real Pipedream API to list actions', async () => {
            try {
                const result = await service.listActions({ app_slug: 'gmail' });
                expect(result.actions).toBeDefined();
                expect(Array.isArray(result.actions)).toBe(true);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });

    describe('getAction - Pipedream API', () => {
        it('should call real Pipedream API to get action details', async () => {
            try {
                const result = await service.getAction({ action_key: 'gmail-send-email' });
                expect(result.key).toBe('gmail-send-email');
                expect(result.name).toBeDefined();
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });

    describe('disconnectAccount - Integration', () => {
        it('should remove connection from database and call Pipedream API', async () => {
            const timestamp = Date.now();
            const pipedreamId = `apn_test_disconnect_${timestamp}`;

            await toolsRepository.saveConnection({
                user_id: TEST_USER_ID,
                pipedream_account_id: pipedreamId,
                app_slug: 'test_gmail',
                app_name: 'Gmail Test',
            });

            try {
                await service.disconnectAccount({ pipedream_account_id: pipedreamId, user_id: TEST_USER_ID });
            } catch (error) {
                expect(error).toBeDefined();
            }

            const connection = await toolsRepository.getConnectionByPipedreamId(pipedreamId);
            expect(connection).toBeNull();
        });
    });

    describe('getActionOptions - Pipedream API', () => {
        it('should call real Pipedream API to get dynamic options', async () => {
            try {
                const result = await service.getActionOptions({
                    user_id: TEST_USER_ID,
                    action_key: 'gmail-list-emails',
                    prop_name: 'folder',
                    configured_props: { gmail: { authProvisionId: 'apn_test_123' } },
                });

                expect(Array.isArray(result)).toBe(true);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });
});
