// Heartbeat Routes Tests
// Integration tests for heartbeat API endpoints

import request from 'supertest';
import { app } from '../../../index';
import { query } from '../../../database/connection';
import { getTestAuthHeaders } from '../../../../tests/setup';

const authHeaders = (userId: string) => getTestAuthHeaders(userId);

describe('Heartbeat Routes', () => {
    let testUserId: string;
    let testAgentId: number;

    beforeAll(async () => {
        testUserId = `test-heartbeat-${Date.now()}`;

        await query(
            `INSERT INTO users (user_id, email, display_name, role, plan_type)
             VALUES ($1, $2, $3, 'user', 'starter')
             ON CONFLICT (user_id) DO NOTHING`,
            [testUserId, `${testUserId}@test.com`, 'Test User']
        );

        const agentResult = await query<{ id: number }>(
            `INSERT INTO agent_registry (slug, user_id, agent_type)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [`test-agent-${Date.now()}`, testUserId, 'private']
        );
        testAgentId = agentResult.rows[0].id;
    });

    afterAll(async () => {
        await query('DELETE FROM heartbeat_configs WHERE agent_id = $1', [testAgentId]);
        await query('DELETE FROM agent_registry WHERE id = $1', [testAgentId]);
        await query('DELETE FROM users WHERE user_id = $1', [testUserId]);
    });

    describe('GET /api/v1/agents/:id/heartbeat', () => {
        it('should return 404 when no config exists', async () => {
            const response = await request(app)
                .get(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('HEARTBEAT_CONFIG_NOT_FOUND');
        });

        it('should return 404 for invalid agent ID', async () => {
            const response = await request(app)
                .get('/api/v1/agents/invalid/heartbeat')
                .set(authHeaders(testUserId));

            expect(response.status).toBe(404);
        });

        it('should return 404 for non-existent agent', async () => {
            const response = await request(app)
                .get('/api/v1/agents/999999/heartbeat')
                .set(authHeaders(testUserId));

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('AGENT_NOT_FOUND');
        });
    });

    describe('PUT /api/v1/agents/:id/heartbeat', () => {
        afterEach(async () => {
            await query('DELETE FROM heartbeat_configs WHERE agent_id = $1', [testAgentId]);
        });

        it('should create heartbeat config with valid data', async () => {
            const response = await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: true,
                    cron_expression: '0 */30 * * *',
                    timezone: 'America/New_York',
                    prompt: 'Check for updates',
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.heartbeat_config.enabled).toBe(true);
            expect(response.body.data.heartbeat_config.cron_expression).toBe('0 */30 * * *');
            expect(response.body.data.heartbeat_config.timezone).toBe('America/New_York');
            expect(response.body.data.heartbeat_config.prompt).toBe('Check for updates');
        });

        it('should update existing config on second PUT', async () => {
            await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: true,
                    cron_expression: '0 * * * *',
                });

            const response = await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: false,
                    cron_expression: '0 */15 * * *',
                    prompt: 'Updated prompt',
                });

            expect(response.status).toBe(200);
            expect(response.body.data.heartbeat_config.enabled).toBe(false);
            expect(response.body.data.heartbeat_config.cron_expression).toBe('0 */15 * * *');
            expect(response.body.data.heartbeat_config.prompt).toBe('Updated prompt');
        });

        it('should reject missing enabled field', async () => {
            const response = await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    cron_expression: '0 * * * *',
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('HEARTBEAT_VALIDATION_ERROR');
        });

        it('should reject missing cron_expression', async () => {
            const response = await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: true,
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('HEARTBEAT_VALIDATION_ERROR');
        });

        it('should reject invalid cron_expression format', async () => {
            const response = await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: true,
                    cron_expression: 'invalid',
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('HEARTBEAT_VALIDATION_ERROR');
        });

        it('should reject invalid active_hours_start format', async () => {
            const response = await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: true,
                    cron_expression: '0 * * * *',
                    active_hours_start: '25:00',
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('HEARTBEAT_VALIDATION_ERROR');
        });

        it('should accept valid active_hours format', async () => {
            const response = await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: true,
                    cron_expression: '0 * * * *',
                    active_hours_start: '09:00',
                    active_hours_end: '17:30',
                });

            expect(response.status).toBe(200);
            expect(response.body.data.heartbeat_config.active_hours_start).toBe('09:00:00');
            expect(response.body.data.heartbeat_config.active_hours_end).toBe('17:30:00');
        });

        it('should accept optional fields', async () => {
            const response = await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: true,
                    cron_expression: '0 9 * * *',
                    max_duration_seconds: 600,
                    token_budget: 4000,
                    weekdays_only: true,
                    tool_allowlist: ['WebSearch', 'Read'],
                });

            expect(response.status).toBe(200);
            expect(response.body.data.heartbeat_config.max_duration_seconds).toBe(600);
            expect(response.body.data.heartbeat_config.token_budget).toBe(4000);
            expect(response.body.data.heartbeat_config.weekdays_only).toBe(true);
            expect(response.body.data.heartbeat_config.tool_allowlist).toEqual(['WebSearch', 'Read']);
        });

        it('should reject negative max_duration_seconds', async () => {
            const response = await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: true,
                    cron_expression: '0 * * * *',
                    max_duration_seconds: -1,
                });

            expect(response.status).toBe(400);
        });
    });

    describe('DELETE /api/v1/agents/:id/heartbeat', () => {
        it('should delete existing config and return 204', async () => {
            await request(app)
                .put(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: true,
                    cron_expression: '0 * * * *',
                });

            const response = await request(app)
                .delete(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(204);

            const getResponse = await request(app)
                .get(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId));

            expect(getResponse.status).toBe(404);
        });

        it('should return 204 even if config does not exist', async () => {
            const response = await request(app)
                .delete(`/api/v1/agents/${testAgentId}/heartbeat`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(204);
        });
    });

    describe('GET /api/v1/agents/:id/heartbeat/executions', () => {
        it('should return empty list when no executions exist', async () => {
            const response = await request(app)
                .get(`/api/v1/agents/${testAgentId}/heartbeat/executions`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(200);
            expect(response.body.data.executions).toEqual([]);
            expect(response.body.data.total).toBe(0);
        });

        it('should accept pagination parameters', async () => {
            const response = await request(app)
                .get(`/api/v1/agents/${testAgentId}/heartbeat/executions?limit=10&offset=5`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(200);
            expect(response.body.data.limit).toBe(10);
            expect(response.body.data.offset).toBe(5);
        });

        it('should reject limit over 100', async () => {
            const response = await request(app)
                .get(`/api/v1/agents/${testAgentId}/heartbeat/executions?limit=150`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(400);
        });

        it('should reject negative offset', async () => {
            const response = await request(app)
                .get(`/api/v1/agents/${testAgentId}/heartbeat/executions?offset=-1`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(400);
        });

        it('should accept status filter', async () => {
            const response = await request(app)
                .get(`/api/v1/agents/${testAgentId}/heartbeat/executions?status=completed`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(200);
        });
    });

    describe('Authorization', () => {
        let otherUserId: string;
        let otherAgentId: number;

        beforeAll(async () => {
            otherUserId = `test-heartbeat-other-${Date.now()}`;

            await query(
                `INSERT INTO users (user_id, email, display_name, role, plan_type)
                 VALUES ($1, $2, $3, 'user', 'starter')
                 ON CONFLICT (user_id) DO NOTHING`,
                [otherUserId, `${otherUserId}@test.com`, 'Other User']
            );

            const agentResult = await query<{ id: number }>(
                `INSERT INTO agent_registry (slug, user_id, agent_type)
                 VALUES ($1, $2, $3)
                 RETURNING id`,
                [`other-agent-${Date.now()}`, otherUserId, 'private']
            );
            otherAgentId = agentResult.rows[0].id;
        });

        afterAll(async () => {
            await query('DELETE FROM heartbeat_configs WHERE agent_id = $1', [otherAgentId]);
            await query('DELETE FROM agent_registry WHERE id = $1', [otherAgentId]);
            await query('DELETE FROM users WHERE user_id = $1', [otherUserId]);
        });

        it('should deny access to other users agent for GET', async () => {
            const response = await request(app)
                .get(`/api/v1/agents/${otherAgentId}/heartbeat`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('AGENT_ACCESS_DENIED');
        });

        it('should deny access to other users agent for PUT', async () => {
            const response = await request(app)
                .put(`/api/v1/agents/${otherAgentId}/heartbeat`)
                .set(authHeaders(testUserId))
                .send({
                    enabled: true,
                    cron_expression: '0 * * * *',
                });

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('AGENT_ACCESS_DENIED');
        });

        it('should deny access to other users agent for DELETE', async () => {
            const response = await request(app)
                .delete(`/api/v1/agents/${otherAgentId}/heartbeat`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('AGENT_ACCESS_DENIED');
        });

        it('should deny access to other users agent for executions', async () => {
            const response = await request(app)
                .get(`/api/v1/agents/${otherAgentId}/heartbeat/executions`)
                .set(authHeaders(testUserId));

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('AGENT_ACCESS_DENIED');
        });
    });
});
