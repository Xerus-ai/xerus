// Agent Service Tests - Real Database
import './setup';
import { createTestUser } from './setup';
import { agentService, AgentService } from '../../src/domains/agents/service';
import { CreateAgentDTO } from '../../src/domains/agents/types';
import {
  AgentNotFoundError,
  AgentAccessDeniedError,
  AgentNameConflictError,
} from '../../src/domains/agents/errors';

describe('AgentService', () => {
  let service: AgentService;
  const testUserId = 'test_agent_svc_' + Date.now();
  const otherUserId = 'test_agent_other_' + Date.now();

  beforeAll(async () => {
    service = agentService;
    await createTestUser(testUserId);
    await createTestUser(otherUserId);
  });

  const createValidAgentData = (overrides: Partial<CreateAgentDTO> = {}): CreateAgentDTO => ({
    name: 'Test Service Agent ' + Date.now(),
    description: 'A test agent for service tests',
    system_prompt: `# Test Agent - Assistant

## Role
You are a test agent for service layer operations.

## Objective
Execute service tests correctly.

## Guidelines
- Always respond helpfully and accurately
- Never provide harmful or misleading information`,
    ai_model: 'gpt-4o',
    tags: ['test', 'service'],
    ...overrides
  });

  describe('create', () => {
    it('should create agent with valid data', async () => {
      const data = createValidAgentData({ name: 'Test Create Service Agent' });

      const agent = await service.create(data, testUserId);

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('Test Create Service Agent');
      expect(agent.user_id).toBe(testUserId);
      expect(agent.agent_type).toBe('private');
    });

    it('should validate model on create', async () => {
      const data = createValidAgentData({
        name: 'Test Invalid Model Agent',
        ai_model: 'invalid-model'
      });

      await expect(service.create(data, testUserId))
        .rejects
        .toThrow();
    });

    it('should reject duplicate name for same user', async () => {
      const uniqueName = 'Test Unique Name Agent ' + Date.now();

      await service.create(createValidAgentData({ name: uniqueName }), testUserId);

      await expect(service.create(createValidAgentData({ name: uniqueName }), testUserId))
        .rejects
        .toThrow(AgentNameConflictError);
    });

    it('should allow same name for different users', async () => {
      const sharedName = 'Test Shared Name ' + Date.now();

      const agent1 = await service.create(createValidAgentData({ name: sharedName }), testUserId);
      const agent2 = await service.create(createValidAgentData({ name: sharedName }), otherUserId);

      expect(agent1.name).toBe(sharedName);
      expect(agent2.name).toBe(sharedName);
      expect(agent1.user_id).not.toBe(agent2.user_id);
    });
  });

  describe('getById', () => {
    it('should return agent detail for owner', async () => {
      const data = createValidAgentData({ name: 'Test GetById Agent' });
      const created = await service.create(data, testUserId);

      const detail = await service.getById(created.id, testUserId);

      expect(detail.id).toBe(created.id);
      expect(detail.tools).toBeDefined();
      expect(detail.knowledge_bases).toBeDefined();
    });

    it('should throw AgentNotFoundError for non-existent ID', async () => {
      await expect(service.getById(999999, testUserId))
        .rejects
        .toThrow(AgentNotFoundError);
    });

    it('should throw AgentAccessDeniedError for private agent of another user', async () => {
      const data = createValidAgentData({ name: 'Test Private Agent' });
      const created = await service.create(data, testUserId);

      await expect(service.getById(created.id, otherUserId))
        .rejects
        .toThrow(AgentAccessDeniedError);
    });

    // Note: public agent access test removed - getSystemAgents() moved to AgentMarketplaceService
  });

  describe('list', () => {
    it('should return paginated results', async () => {
      const result = await service.list(testUserId, { page: 1, limit: 10 });

      expect(result.agents).toBeDefined();
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.total).toBeDefined();
      expect(result.total_pages).toBeDefined();
    });

    it('should apply filters', async () => {
      const result = await service.list(testUserId, {
        filters: { agent_type: 'private' }
      });

      result.agents.forEach(agent => {
        expect(agent.agent_type).toBe('private');
      });
    });

    it('should apply sorting', async () => {
      const result = await service.list(testUserId, {
        sort_by: 'name',
        sort_order: 'asc'
      });

      expect(result.agents).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update agent as owner', async () => {
      const data = createValidAgentData({ name: 'Test Update Service Agent' });
      const created = await service.create(data, testUserId);

      const updated = await service.update(created.id, {
        description: 'Updated description via service'
      }, testUserId);

      expect(updated.description).toBe('Updated description via service');
    });

    it('should throw AgentNotFoundError for non-existent ID', async () => {
      await expect(service.update(999999, { name: 'New Name' }, testUserId))
        .rejects
        .toThrow(AgentNotFoundError);
    });

    it('should throw AgentAccessDeniedError for non-owner', async () => {
      const data = createValidAgentData({ name: 'Test Access Denied Update' });
      const created = await service.create(data, testUserId);

      await expect(service.update(created.id, { name: 'Hacked' }, otherUserId))
        .rejects
        .toThrow(AgentAccessDeniedError);
    });

    it('should replace system_prompt on update', async () => {
      const data = createValidAgentData({ name: 'Test Update Prompt Agent' });
      const created = await service.create(data, testUserId);

      const newPrompt = `# Updated Agent - Assistant

## Role
You are an updated test agent.

## Objective
Test that system_prompt updates correctly.`;

      const updated = await service.update(created.id, {
        system_prompt: newPrompt
      }, testUserId);

      expect(updated.system_prompt).toBe(newPrompt);
      expect(updated.system_prompt).toContain('Updated Agent');
    });

    it('should validate model on update', async () => {
      const data = createValidAgentData({ name: 'Test Model Update Agent' });
      const created = await service.create(data, testUserId);

      await expect(service.update(created.id, { ai_model: 'invalid' }, testUserId))
        .rejects
        .toThrow();
    });

    it('should reject name conflict on update', async () => {
      const name1 = 'Test Name Conflict 1 ' + Date.now();
      const name2 = 'Test Name Conflict 2 ' + Date.now();

      await service.create(createValidAgentData({ name: name1 }), testUserId);
      const agent2 = await service.create(createValidAgentData({ name: name2 }), testUserId);

      await expect(service.update(agent2.id, { name: name1 }, testUserId))
        .rejects
        .toThrow(AgentNameConflictError);
    });
  });

  describe('delete', () => {
    it('should delete agent as owner', async () => {
      const data = createValidAgentData({ name: 'Test Delete Service Agent' });
      const created = await service.create(data, testUserId);

      await service.delete(created.id, testUserId);

      await expect(service.getById(created.id, testUserId))
        .rejects
        .toThrow(AgentNotFoundError);
    });

    it('should throw AgentNotFoundError for non-existent ID', async () => {
      await expect(service.delete(999999, testUserId))
        .rejects
        .toThrow(AgentNotFoundError);
    });

    it('should throw AgentAccessDeniedError for non-owner', async () => {
      const data = createValidAgentData({ name: 'Test Access Denied Delete' });
      const created = await service.create(data, testUserId);

      await expect(service.delete(created.id, otherUserId))
        .rejects
        .toThrow(AgentAccessDeniedError);
    });
  });

  // Note: clone, publish, unpublish, setDefault, unsetDefault, getSystemAgents,
  // getUserAgents, searchMarketplace have been extracted to AgentMarketplaceService.
  // Tool/KB operations extracted to AgentToolsService / AgentKBService.
  // getUsageAnalytics has been removed.
  // See: agent-marketplace.service.ts, agent-tools.service.ts, agent-kb.service.ts
});
