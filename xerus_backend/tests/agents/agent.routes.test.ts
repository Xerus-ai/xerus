// Agent Routes Tests - API Integration Tests
import request from 'supertest';
import { app } from '../../src/index';
import './setup';
import { createTestUser } from './setup';
import { getTestAuthHeaders } from '../setup';
import { toolsRepository } from '../../src/domains/tools/repository';

describe('Agent API Routes', () => {
  const testUserId = 'test_agent_route_' + Date.now();
  const otherUserId = 'test_agent_route_other_' + Date.now();

  const authHeaders = (userId: string) => ({
    ...getTestAuthHeaders(userId),
  });

  const validAgentPayload = {
    name: 'Test Route Agent',
    description: 'An agent created via API routes test',
    system_prompt: `# Route Test Agent - Assistant

## Role
You are a test agent for API route testing.

## Objective
Successfully test all agent API endpoints.

## Guidelines
- Always respond with helpful and accurate information

## Constraints
- Never provide harmful or misleading content`,
    ai_model: 'anthropic/claude-sonnet-4-6',
    tags: ['test', 'routes']
  };

  beforeAll(async () => {
    await createTestUser(testUserId);
    await createTestUser(otherUserId);
    await toolsRepository.upsertApp({
      name_slug: 'gmail',
      name: 'Gmail',
      description: 'Email',
      auth_type: 'oauth',
      categories: ['email'],
      featured_weight: 1,
    });
  });

  describe('POST /api/v1/agents', () => {
    it('should create agent with valid data', async () => {
      const payload = { ...validAgentPayload, name: 'Test Create Route Agent ' + Date.now() };

      const response = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send(payload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agent).toBeDefined();
      expect(response.body.data.agent.name).toBe(payload.name);
      expect(response.body.data.agent.user_id).toBe(testUserId);
      expect(response.body.data.agent.agent_type).toBe('private');
      expect(response.body.meta.request_id).toBeDefined();
      expect(response.body.meta.response_time_ms).toBeDefined();
    });

    it('should return 422 for invalid data', async () => {
      const response = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ name: '' })
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      await request(app)
        .post('/api/v1/agents')
        .send(validAgentPayload)
        .expect(401);
    });
  });

  describe('GET /api/v1/agents', () => {
    it('should list agents with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/agents')
        .set(authHeaders(testUserId))
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agents).toBeDefined();
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);
    });

    it('should filter by agent_type', async () => {
      const response = await request(app)
        .get('/api/v1/agents')
        .set(authHeaders(testUserId))
        .query({ agent_type: 'public' })
        .expect(200);

      response.body.data.agents.forEach((agent: { agent_type: string }) => {
        expect(agent.agent_type).toBe('public');
      });
    });

    it('should search by query term', async () => {
      await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test SearchableAgent ' + Date.now() });

      const response = await request(app)
        .get('/api/v1/agents')
        .set(authHeaders(testUserId))
        .query({ search: 'SearchableAgent' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should sort by different fields', async () => {
      const response = await request(app)
        .get('/api/v1/agents')
        .set(authHeaders(testUserId))
        .query({ sort_by: 'name', sort_order: 'asc' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/agents/templates', () => {
    it('should return system templates', async () => {
      const response = await request(app)
        .get('/api/v1/agents/templates')
        .set(authHeaders(testUserId))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.templates)).toBe(true);
      response.body.data.templates.forEach((t: { agent_type: string }) => {
        expect(t.agent_type).toBe('public');
      });
    });
  });

  describe('GET /api/v1/agents/marketplace', () => {
    it('should return marketplace agents', async () => {
      const response = await request(app)
        .get('/api/v1/agents/marketplace')
        .set(authHeaders(testUserId))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agents).toBeDefined();
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should filter by is_verified', async () => {
      const response = await request(app)
        .get('/api/v1/agents/marketplace')
        .set(authHeaders(testUserId))
        .query({ is_verified: 'true' })
        .expect(200);

      response.body.data.agents.forEach((agent: { is_verified: boolean }) => {
        expect(agent.is_verified).toBe(true);
      });
    });
  });

  describe('GET /api/v1/agents/mine', () => {
    it('should return user own agents', async () => {
      const mineUserId = 'test_agent_mine_' + Date.now();
      await createTestUser(mineUserId);

      await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(mineUserId))
        .send({ ...validAgentPayload, name: 'Test Mine Agent ' + Date.now() });

      const response = await request(app)
        .get('/api/v1/agents/mine')
        .set(authHeaders(mineUserId))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agents).toBeDefined();
      response.body.data.agents.forEach((agent: { user_id: string; agent_type: string }) => {
        expect(agent.user_id).toBe(mineUserId);
        expect(agent.agent_type).toBe('private');
      });
    });
  });

  describe('GET /api/v1/agents/:id', () => {
    it('should return agent detail', async () => {
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test GetById Agent ' + Date.now() });

      const agentId = createResponse.body.data.agent.id;

      const response = await request(app)
        .get(`/api/v1/agents/${agentId}`)
        .set(authHeaders(testUserId))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agent.id).toBe(agentId);
    });

    it('should return 404 for non-existent agent', async () => {
      const response = await request(app)
        .get('/api/v1/agents/999999')
        .set(authHeaders(testUserId))
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AGENT_NOT_FOUND');
    });

    it('should return 404 for invalid ID', async () => {
      await request(app)
        .get('/api/v1/agents/invalid')
        .set(authHeaders(testUserId))
        .expect(404);
    });

    it('should return 404 for private agent of another user', async () => {
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test Private Agent ' + Date.now() });

      const agentId = createResponse.body.data.agent.id;

      const response = await request(app)
        .get(`/api/v1/agents/${agentId}`)
        .set(authHeaders(otherUserId))
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/v1/agents/:id', () => {
    it('should update agent', async () => {
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test Update Route Agent ' + Date.now() });

      const agentId = createResponse.body.data.agent.id;

      const response = await request(app)
        .patch(`/api/v1/agents/${agentId}`)
        .set(authHeaders(testUserId))
        .send({ description: 'Updated via PATCH' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agent.description).toBe('Updated via PATCH');
    });

    it('should return 404 for non-owner', async () => {
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test Non-Owner Update ' + Date.now() });

      const agentId = createResponse.body.data.agent.id;

      await request(app)
        .patch(`/api/v1/agents/${agentId}`)
        .set(authHeaders(otherUserId))
        .send({ name: 'Hacked' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/agents/:id', () => {
    it('should delete agent', async () => {
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test Delete Route Agent ' + Date.now() });

      const agentId = createResponse.body.data.agent.id;

      const response = await request(app)
        .delete(`/api/v1/agents/${agentId}`)
        .set(authHeaders(testUserId))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);

      await request(app)
        .get(`/api/v1/agents/${agentId}`)
        .set(authHeaders(testUserId))
        .expect(404);
    });

    it('should return 404 for non-owner', async () => {
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test Non-Owner Delete ' + Date.now() });

      const agentId = createResponse.body.data.agent.id;

      await request(app)
        .delete(`/api/v1/agents/${agentId}`)
        .set(authHeaders(otherUserId))
        .expect(404);
    });
  });

  describe('POST /api/v1/agents/:id/clone', () => {
    it('should clone agent', async () => {
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test Clone Source ' + Date.now() });

      const sourceId = createResponse.body.data.agent.id;

      const response = await request(app)
        .post(`/api/v1/agents/${sourceId}/clone`)
        .set(authHeaders(testUserId))
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agent.id).not.toBe(sourceId);
      expect(response.body.data.source_id).toBe(sourceId);
    });

    it('should clone with custom name', async () => {
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test Clone Custom ' + Date.now() });

      const sourceId = createResponse.body.data.agent.id;

      const response = await request(app)
        .post(`/api/v1/agents/${sourceId}/clone`)
        .set(authHeaders(testUserId))
        .send({ name: 'My Custom Clone ' + Date.now() })
        .expect(201);

      expect(response.body.data.agent.name).toContain('My Custom Clone');
    });
  });

  describe('POST /api/v1/agents/:id/set-default', () => {
    it('should set agent as default', async () => {
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test Set Default ' + Date.now() });

      const agentId = createResponse.body.data.agent.id;

      const response = await request(app)
        .post(`/api/v1/agents/${agentId}/set-default`)
        .set(authHeaders(testUserId))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_default).toBe(true);
    });
  });

  describe('Tool Management Routes', () => {
    let toolAgentId: number;

    beforeAll(async () => {
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .set(authHeaders(testUserId))
        .send({ ...validAgentPayload, name: 'Test Tool Routes Agent ' + Date.now() });

      toolAgentId = createResponse.body.data.agent.id;
    });

    describe('POST /api/v1/agents/:id/tools', () => {
      it('should add tool to agent', async () => {
        const response = await request(app)
          .post(`/api/v1/agents/${toolAgentId}/tools`)
          .set(authHeaders(testUserId))
          .send({ app_slug: 'gmail' })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.added).toBe('gmail');
        expect(response.body.data.tools).toContain('gmail');
      });

      it('should return 400 without app_slug', async () => {
        await request(app)
          .post(`/api/v1/agents/${toolAgentId}/tools`)
          .set(authHeaders(testUserId))
          .send({})
          .expect(400);
      });
    });

    describe('GET /api/v1/agents/:id/tools', () => {
      it('should return agent tools', async () => {
        const response = await request(app)
          .get(`/api/v1/agents/${toolAgentId}/tools`)
          .set(authHeaders(testUserId))
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data.tools)).toBe(true);
      });
    });

    describe('DELETE /api/v1/agents/:id/tools/:appSlug', () => {
      it('should remove tool from agent', async () => {
        await request(app)
          .post(`/api/v1/agents/${toolAgentId}/tools`)
          .set(authHeaders(testUserId))
          .send({ app_slug: 'gmail' });

        const response = await request(app)
          .delete(`/api/v1/agents/${toolAgentId}/tools/gmail`)
          .set(authHeaders(testUserId))
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.removed).toBe('gmail');
      });
    });
  });

  // Knowledge base assignment moved to /workspace/connections. See
  // drive/connections.routes.ts tests for the replacement surface.

  describe('Response Envelope Format', () => {
    it('should return proper success envelope', async () => {
      const response = await request(app)
        .get('/api/v1/agents/templates')
        .set(authHeaders(testUserId))
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('request_id');
      expect(response.body.meta).toHaveProperty('response_time_ms');
      expect(typeof response.body.meta.request_id).toBe('string');
      expect(typeof response.body.meta.response_time_ms).toBe('number');
    });

    it('should return proper error envelope', async () => {
      const response = await request(app)
        .get('/api/v1/agents/999999')
        .set(authHeaders(testUserId))
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body).toHaveProperty('meta');
    });
  });
});
