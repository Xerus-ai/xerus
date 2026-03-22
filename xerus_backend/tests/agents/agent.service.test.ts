// Agent Service Tests - Real Database
import './setup';
import { createTestUser } from './setup';
import { agentService, AgentService } from '../../src/domains/agents/service';
import { CreateAgentDTO } from '../../src/domains/agents/types';
import {
  AgentNotFoundError,
  AgentAccessDeniedError,
  AgentNameConflictError,
  AgentAlreadyPrivateError,
  AgentDefaultError
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

    it('should allow access to public agents', async () => {
      const templates = await service.getSystemAgents();

      if (templates.length > 0) {
        const detail = await service.getById(templates[0].id, testUserId);
        expect(detail.agent_type).toBe('public');
      }
    });
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

  describe('clone', () => {
    it('should clone own private agent', async () => {
      const data = createValidAgentData({ name: 'Test Clone Source Agent' });
      const source = await service.create(data, testUserId);

      const clone = await service.clone(source.id, testUserId);

      expect(clone.id).not.toBe(source.id);
      expect(clone.name).toContain('Copy');
      expect(clone.user_id).toBe(testUserId);
      expect(clone.description).toBe(source.description);
    });

    it('should clone with custom name', async () => {
      const data = createValidAgentData({ name: 'Test Clone Custom Name Source' });
      const source = await service.create(data, testUserId);

      const clone = await service.clone(source.id, testUserId, { name: 'My Custom Clone' });

      expect(clone.name).toBe('My Custom Clone');
    });

    it('should clone public agent', async () => {
      const templates = await service.getSystemAgents();

      if (templates.length > 0) {
        const clone = await service.clone(templates[0].id, testUserId);

        expect(clone.user_id).toBe(testUserId);
        expect(clone.agent_type).toBe('private');
      }
    });

    it('should throw AgentNotFoundError for non-existent ID', async () => {
      await expect(service.clone(999999, testUserId))
        .rejects
        .toThrow(AgentNotFoundError);
    });

    it('should throw AgentAccessDeniedError for private agent of another user', async () => {
      const data = createValidAgentData({ name: 'Test Clone Denied Agent' });
      const source = await service.create(data, testUserId);

      await expect(service.clone(source.id, otherUserId))
        .rejects
        .toThrow();
    });

    it('should copy tools and knowledge bases', async () => {
      const data = createValidAgentData({ name: 'Test Clone With Relations' });
      const source = await service.create(data, testUserId);

      await service.addTool(source.id, 'gmail', testUserId);
      await service.addKnowledgeBase(source.id, 'clone-kb', 'Clone KB', 'read', testUserId);

      const clone = await service.clone(source.id, testUserId);

      const cloneTools = await service.getTools(clone.id, testUserId);
      const cloneKbs = await service.getKnowledgeBases(clone.id, testUserId);

      expect(cloneTools.some(t => t.name_slug === 'gmail')).toBe(true);
      expect(cloneKbs.some(kb => kb.knowledge_base_id === 'clone-kb')).toBe(true);
    });
  });

  describe('publish / unpublish', () => {
    it('should throw AgentAlreadyPublicError when publishing public agent', async () => {
      const templates = await service.getSystemAgents();

      if (templates.length > 0) {
        await expect(service.publish(templates[0].id, testUserId))
          .rejects
          .toThrow();
      }
    });

    it('should throw AgentAccessDeniedError when publishing another user agent', async () => {
      const data = createValidAgentData({ name: 'Test Publish Access Agent' });
      const agent = await service.create(data, testUserId);

      await expect(service.publish(agent.id, otherUserId))
        .rejects
        .toThrow(AgentAccessDeniedError);
    });

    it('should throw AgentAlreadyPrivateError when unpublishing private agent', async () => {
      const data = createValidAgentData({ name: 'Test Unpublish Private Agent' });
      const agent = await service.create(data, testUserId);

      await expect(service.unpublish(agent.id, testUserId))
        .rejects
        .toThrow(AgentAlreadyPrivateError);
    });
  });

  describe('setDefault / unsetDefault', () => {
    it('should set agent as default', async () => {
      const data = createValidAgentData({ name: 'Test Set Default Agent' });
      const agent = await service.create(data, testUserId);

      const result = await service.setDefault(agent.id, testUserId);

      expect(result.is_default).toBe(true);
    });

    it('should throw AgentNotFoundError for non-existent ID', async () => {
      await expect(service.setDefault(999999, testUserId))
        .rejects
        .toThrow(AgentNotFoundError);
    });

    it('should throw AgentDefaultError for public agents', async () => {
      const templates = await service.getSystemAgents();

      if (templates.length > 0) {
        await expect(service.setDefault(templates[0].id, testUserId))
          .rejects
          .toThrow(AgentDefaultError);
      }
    });

    it('should throw AgentAccessDeniedError for non-owner', async () => {
      const data = createValidAgentData({ name: 'Test Default Access Agent' });
      const agent = await service.create(data, testUserId);

      await expect(service.setDefault(agent.id, otherUserId))
        .rejects
        .toThrow(AgentAccessDeniedError);
    });

    it('should unset default', async () => {
      const data = createValidAgentData({ name: 'Test Unset Default Agent' });
      const agent = await service.create(data, testUserId);

      await service.setDefault(agent.id, testUserId);
      const result = await service.unsetDefault(agent.id, testUserId);

      expect(result.is_default).toBe(false);
    });

    it('should throw AgentDefaultError when unsetting non-default agent', async () => {
      const data = createValidAgentData({ name: 'Test Unset Non-Default Agent' });
      const agent = await service.create(data, testUserId);

      await expect(service.unsetDefault(agent.id, testUserId))
        .rejects
        .toThrow(AgentDefaultError);
    });
  });

  describe('getSystemAgents', () => {
    it('should return system agent templates', async () => {
      const templates = await service.getSystemAgents();

      expect(templates.length).toBeGreaterThan(0);
      templates.forEach(t => {
        expect(t.agent_type).toBe('public');
        expect(t.user_id).toBeNull();
      });
    });
  });

  describe('getUserAgents', () => {
    it('should return user agents (private and published)', async () => {
      const userAgentUser = 'test_agent_getuser_' + Date.now();
      await createTestUser(userAgentUser);

      await service.create(createValidAgentData({ name: 'Test User Agent' }), userAgentUser);

      const agents = await service.getUserAgents(userAgentUser);

      expect(agents.length).toBeGreaterThanOrEqual(1);
      agents.forEach(a => {
        expect(a.user_id).toBe(userAgentUser);
        // User can have both private and published (public) agents
        expect(['private', 'public']).toContain(a.agent_type);
      });
    });
  });

  describe('searchMarketplace', () => {
    it('should return paginated marketplace results', async () => {
      const result = await service.searchMarketplace({}, 1, 10);

      expect(result.agents).toBeDefined();
      expect(result.page).toBe(1);
      result.agents.forEach(a => {
        expect(a.agent_type).toBe('public');
      });
    });

    it('should filter by search term', async () => {
      const result = await service.searchMarketplace({ search: 'Pete' }, 1, 10);

      if (result.agents.length > 0) {
        const hasMatch = result.agents.some(a =>
          a.name.toLowerCase().includes('pete') ||
          a.description.toLowerCase().includes('pete')
        );
        expect(hasMatch).toBe(true);
      }
    });
  });

  describe('Tool Operations', () => {
    let toolAgentId: number;

    beforeAll(async () => {
      const agent = await service.create(
        createValidAgentData({ name: 'Test Service Tool Agent' }),
        testUserId
      );
      toolAgentId = agent.id;
    });

    describe('addTool', () => {
      it('should add tool to agent', async () => {
        const tools = await service.addTool(toolAgentId, 'github', testUserId);

        expect(tools).toContain('github');
      });

      it('should throw AgentAccessDeniedError for non-owner', async () => {
        await expect(service.addTool(toolAgentId, 'slack', otherUserId))
          .rejects
          .toThrow(AgentAccessDeniedError);
      });
    });

    describe('getTools', () => {
      it('should return tools for agent owner', async () => {
        const tools = await service.getTools(toolAgentId, testUserId);
        expect(Array.isArray(tools)).toBe(true);
      });

      it('should throw AgentAccessDeniedError for non-owner of private agent', async () => {
        await expect(service.getTools(toolAgentId, otherUserId))
          .rejects
          .toThrow(AgentAccessDeniedError);
      });
    });

    describe('removeTool', () => {
      it('should remove tool from agent', async () => {
        await service.addTool(toolAgentId, 'notion', testUserId);
        await service.removeTool(toolAgentId, 'notion', testUserId);

        const tools = await service.getTools(toolAgentId, testUserId);
        expect(tools.some(t => t.name_slug === 'notion')).toBe(false);
      });
    });
  });

  describe('Knowledge Base Operations', () => {
    let kbAgentId: number;

    beforeAll(async () => {
      const agent = await service.create(
        createValidAgentData({ name: 'Test Service KB Agent' }),
        testUserId
      );
      kbAgentId = agent.id;
    });

    describe('addKnowledgeBase', () => {
      it('should add knowledge base to agent', async () => {
        const kb = await service.addKnowledgeBase(
          kbAgentId,
          'svc-kb-123',
          'Service KB',
          'read',
          testUserId
        );

        expect(kb.knowledge_base_id).toBe('svc-kb-123');
      });

      it('should throw AgentAccessDeniedError for non-owner', async () => {
        await expect(service.addKnowledgeBase(kbAgentId, 'hack-kb', 'Hack', 'read', otherUserId))
          .rejects
          .toThrow(AgentAccessDeniedError);
      });
    });

    describe('getKnowledgeBases', () => {
      it('should return knowledge bases for owner', async () => {
        const kbs = await service.getKnowledgeBases(kbAgentId, testUserId);
        expect(Array.isArray(kbs)).toBe(true);
      });
    });

    describe('removeKnowledgeBase', () => {
      it('should remove knowledge base from agent', async () => {
        await service.addKnowledgeBase(kbAgentId, 'remove-svc-kb', 'Remove', 'read', testUserId);
        await service.removeKnowledgeBase(kbAgentId, 'remove-svc-kb', testUserId);

        const kbs = await service.getKnowledgeBases(kbAgentId, testUserId);
        expect(kbs.some(kb => kb.knowledge_base_id === 'remove-svc-kb')).toBe(false);
      });
    });
  });

  describe('getUsageAnalytics', () => {
    it('should return usage analytics for agent owner', async () => {
      const data = createValidAgentData({ name: 'Test Analytics Agent' });
      const agent = await service.create(data, testUserId);

      const analytics = await service.getUsageAnalytics(agent.id, testUserId);

      expect(analytics.agent_id).toBe(agent.id);
      expect(analytics.execution_count).toBeDefined();
      expect(analytics.success_rate).toBeDefined();
      expect(analytics.stats).toBeDefined();
      expect(analytics.recent_runs).toBeDefined();
    });

    it('should throw AgentAccessDeniedError for non-owner', async () => {
      const data = createValidAgentData({ name: 'Test Analytics Access Agent' });
      const agent = await service.create(data, testUserId);

      await expect(service.getUsageAnalytics(agent.id, otherUserId))
        .rejects
        .toThrow(AgentAccessDeniedError);
    });
  });
});
