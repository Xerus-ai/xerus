// Agent Repository Tests - Real Database
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { query } from '../../src/database/connection';
import { agentRepository, AgentRepository } from '../../src/domains/agents/repository';
import { CreateAgentDTO } from '../../src/domains/agents/types';

const TEST_USER_ID = 'test_agent_repo_user';

async function createTestUser(userId: string): Promise<void> {
  const uniqueEmail = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
  await query(`
    INSERT INTO users (user_id, email, display_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name
  `, [userId, uniqueEmail, 'Test User']);
}

async function cleanupTestData(): Promise<void> {
  await query("DELETE FROM agent_runs WHERE agent_id IN (SELECT id FROM agents WHERE name LIKE 'Test%')");
  await query("DELETE FROM agent_tools WHERE agent_id IN (SELECT id FROM agents WHERE name LIKE 'Test%')");
  await query("DELETE FROM agent_knowledge_bases WHERE agent_id IN (SELECT id FROM agents WHERE name LIKE 'Test%')");
  await query("DELETE FROM agents WHERE name LIKE 'Test%'");
}

describe('AgentRepository', () => {
  let repository: AgentRepository;

  beforeAll(async () => {
    repository = agentRepository;
    await cleanupTestData();
    await createTestUser(TEST_USER_ID);
  });

  afterAll(async () => {
    await cleanupTestData();
    // Don't close pool here - global setup handles it
  });

  const createValidAgentData = (overrides: Partial<CreateAgentDTO> = {}): CreateAgentDTO => ({
    name: 'Test Agent ' + Date.now(),
    description: 'A test agent for repository tests',
    system_prompt: `# Test Agent - Assistant

## Role
You are a test agent for repository operations.

## Objective
Execute repository tests correctly.

## Guidelines
- Always respond helpfully
- Never provide harmful information`,
    ai_model: 'gpt-4o',
    tags: ['test', 'repository'],
    ...overrides
  });

  describe('create', () => {
    it('should create agent with valid data', async () => {
      const data = createValidAgentData({ name: 'Test Create Agent' });

      const agent = await repository.create(data, TEST_USER_ID);

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('Test Create Agent');
      expect(agent.description).toBe(data.description);
      expect(agent.user_id).toBe(TEST_USER_ID);
      expect(agent.agent_type).toBe('private');
      expect(agent.ai_model).toBe('gpt-4o');
      expect(agent.execution_count).toBe(0);
      expect(parseFloat(String(agent.success_rate))).toBe(0);
      expect(agent.clone_count).toBe(0);
      expect(agent.is_default).toBe(false);
      expect(agent.is_verified).toBe(false);
      expect(agent.tags).toContain('test');
    });

    it('should apply default system_prompt values', async () => {
      const data = createValidAgentData({
        name: 'Test Defaults Agent',
        system_prompt: undefined
      });

      const agent = await repository.create(data, TEST_USER_ID);

      // system_prompt is now a string (empty string is the default)
      expect(agent.system_prompt).toBeDefined();
      expect(typeof agent.system_prompt).toBe('string');
    });

    it('should apply default capabilities values', async () => {
      const data = createValidAgentData({
        name: 'Test Capabilities Agent',
        capabilities: undefined
      });

      const agent = await repository.create(data, TEST_USER_ID);

      expect(agent.capabilities).toBeDefined();
      expect(agent.capabilities.tools).toEqual([]);
      expect(agent.capabilities.skills).toEqual([]);
    });

    it('should apply default workflow_config values', async () => {
      const data = createValidAgentData({
        name: 'Test Workflow Agent',
        workflow_config: undefined
      });

      const agent = await repository.create(data, TEST_USER_ID);

      expect(agent.workflow_config).toBeDefined();
      expect(agent.workflow_config.executionMode).toBe('simple');
      expect(agent.workflow_config.coordinationMode).toBe('sequential');
    });
  });

  describe('findById', () => {
    it('should find existing agent by ID', async () => {
      const data = createValidAgentData({ name: 'Test FindById Agent' });
      const created = await repository.create(data, TEST_USER_ID);

      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('Test FindById Agent');
    });

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById(999999);
      expect(found).toBeNull();
    });
  });

  describe('findByIdEnriched', () => {
    it('should return enriched agent with counts and relations', async () => {
      const data = createValidAgentData({ name: 'Test Enriched Agent' });
      const created = await repository.create(data, TEST_USER_ID);

      const enriched = await repository.findByIdEnriched(created.id);

      expect(enriched).not.toBeNull();
      expect(enriched!.id).toBe(created.id);
      expect(enriched!.tool_count).toBeDefined();
      expect(enriched!.kb_count).toBeDefined();
      expect(enriched!.tools).toBeDefined();
      expect(enriched!.knowledge_bases).toBeDefined();
    });

    it('should include tools and knowledge bases arrays', async () => {
      const data = createValidAgentData({ name: 'Test Relations Agent' });
      const created = await repository.create(data, TEST_USER_ID);

      await repository.addTool(created.id, 'web_search');
      await repository.addKnowledgeBase(created.id, 'kb-123', 'Test KB', 'read');

      const enriched = await repository.findByIdEnriched(created.id);

      expect(enriched!.tools).toHaveLength(1);
      expect(enriched!.tools![0]).toBe('web_search');
      expect(enriched!.knowledge_bases).toHaveLength(1);
      expect(enriched!.knowledge_bases![0].knowledge_base_id).toBe('kb-123');
    });

    it('should return null for non-existent ID', async () => {
      const enriched = await repository.findByIdEnriched(999999);
      expect(enriched).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should find agent by name (case-insensitive)', async () => {
      const data = createValidAgentData({ name: 'Test UniqueNameAgent' });
      await repository.create(data, TEST_USER_ID);

      const found = await repository.findByName('test uniquenameagent', TEST_USER_ID);

      expect(found).not.toBeNull();
      expect(found!.name).toBe('Test UniqueNameAgent');
    });

    it('should find agent by name and user_id', async () => {
      const data = createValidAgentData({ name: 'Test NameUserId Agent' });
      await repository.create(data, TEST_USER_ID);

      const found = await repository.findByName('Test NameUserId Agent', TEST_USER_ID);
      expect(found).not.toBeNull();

      const notFound = await repository.findByName('Test NameUserId Agent', 'other_user');
      expect(notFound).toBeNull();
    });

    it('should find agent by name and agent_type', async () => {
      const data = createValidAgentData({ name: 'Test NameType Agent' });
      await repository.create(data, TEST_USER_ID);

      const found = await repository.findByName('Test NameType Agent', TEST_USER_ID, 'private');
      expect(found).not.toBeNull();

      const notFound = await repository.findByName('Test NameType Agent', TEST_USER_ID, 'public');
      expect(notFound).toBeNull();
    });

    it('should return null when name does not exist', async () => {
      const found = await repository.findByName('NonExistentAgent12345', TEST_USER_ID);
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update agent fields', async () => {
      const data = createValidAgentData({ name: 'Test Update Agent' });
      const created = await repository.create(data, TEST_USER_ID);

      const updated = await repository.update(created.id, {
        name: 'Test Updated Name',
        description: 'Updated description'
      });

      expect(updated.name).toBe('Test Updated Name');
      expect(updated.description).toBe('Updated description');
    });

    it('should update system_prompt', async () => {
      const data = createValidAgentData({ name: 'Test Update Prompt Agent' });
      const created = await repository.create(data, TEST_USER_ID);

      const newPrompt = `# Updated Agent - Updated Role

## Role
You are an updated agent with a new purpose.

## Objective
Updated purpose for testing.`;

      const updated = await repository.update(created.id, {
        system_prompt: newPrompt
      });

      expect(updated.system_prompt).toContain('Updated Agent');
      expect(updated.system_prompt).toContain('Updated Role');
    });

    it('should update tags', async () => {
      const data = createValidAgentData({ name: 'Test Update Tags Agent' });
      const created = await repository.create(data, TEST_USER_ID);

      const updated = await repository.update(created.id, {
        tags: ['new-tag', 'updated']
      });

      expect(updated.tags).toContain('new-tag');
      expect(updated.tags).toContain('updated');
    });

    it('should return existing agent when no fields to update', async () => {
      const data = createValidAgentData({ name: 'Test No Update Agent' });
      const created = await repository.create(data, TEST_USER_ID);

      const result = await repository.update(created.id, {});

      expect(result.id).toBe(created.id);
    });
  });

  describe('delete', () => {
    it('should delete agent', async () => {
      const data = createValidAgentData({ name: 'Test Delete Agent' });
      const created = await repository.create(data, TEST_USER_ID);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should cascade delete tools and knowledge bases', async () => {
      const data = createValidAgentData({ name: 'Test Cascade Delete Agent' });
      const created = await repository.create(data, TEST_USER_ID);

      await repository.addTool(created.id, 'test_tool');
      await repository.addKnowledgeBase(created.id, 'kb-cascade', 'Cascade KB', 'read');

      await repository.delete(created.id);

      const tools = await query(
        'SELECT * FROM agent_tools WHERE agent_id = $1',
        [created.id]
      );
      expect(tools.rows).toHaveLength(0);

      const kbs = await query(
        'SELECT * FROM agent_knowledge_bases WHERE agent_id = $1',
        [created.id]
      );
      expect(kbs.rows).toHaveLength(0);
    });
  });

  describe('list', () => {
    const listTestUser = 'test_agent_list_' + Date.now();

    beforeAll(async () => {
      await createTestUser(listTestUser);

      for (let i = 0; i < 5; i++) {
        await repository.create(
          createValidAgentData({ name: `Test List Agent ${i}` }),
          listTestUser
        );
      }
    });

    it('should return paginated results', async () => {
      const result = await repository.list(listTestUser, {
        page: 1,
        limit: 3
      });

      expect(result.agents.length).toBeLessThanOrEqual(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
      expect(result.total).toBeGreaterThanOrEqual(5);
      expect(result.total_pages).toBeGreaterThanOrEqual(2);
    });

    it('should filter by agent_type', async () => {
      const result = await repository.list(listTestUser, {
        filters: { agent_type: 'private' }
      });

      result.agents.forEach(agent => {
        expect(agent.agent_type).toBe('private');
      });
    });

    it('should filter by search term', async () => {
      const result = await repository.list(listTestUser, {
        filters: { search: 'List Agent' }
      });

      expect(result.agents.length).toBeGreaterThan(0);
      result.agents.forEach(agent => {
        expect(agent.name.toLowerCase()).toContain('list agent');
      });
    });

    it('should sort by different columns', async () => {
      const byName = await repository.list(listTestUser, {
        sort_by: 'name',
        sort_order: 'asc'
      });

      expect(byName.agents.length).toBeGreaterThan(0);
    });
  });

  describe('listByUser', () => {
    it('should return user owned agents (private and public)', async () => {
      const userAgentsUser = 'test_agent_listbyuser_' + Date.now();
      await createTestUser(userAgentsUser);

      await repository.create(
        createValidAgentData({ name: 'Test ListByUser Agent' }),
        userAgentsUser
      );

      const agents = await repository.listByUser(userAgentsUser);

      expect(agents.length).toBeGreaterThanOrEqual(1);
      agents.forEach(agent => {
        expect(agent.user_id).toBe(userAgentsUser);
        // User can own both private and public agents
        expect(['private', 'public']).toContain(agent.agent_type);
      });
    });
  });

  describe('listSystemAgents', () => {
    it('should return public agents with null user_id', async () => {
      const agents = await repository.listSystemAgents();

      expect(agents.length).toBeGreaterThan(0);
      agents.forEach(agent => {
        expect(agent.agent_type).toBe('public');
        expect(agent.user_id).toBeNull();
      });
    });
  });

  describe('listMarketplace', () => {
    it('should return only public agents', async () => {
      const result = await repository.listMarketplace({}, 1, 20);

      result.agents.forEach(agent => {
        expect(agent.agent_type).toBe('public');
      });
    });

    it('should filter by is_verified', async () => {
      const result = await repository.listMarketplace({ is_verified: true }, 1, 20);

      result.agents.forEach(agent => {
        expect(agent.is_verified).toBe(true);
      });
    });

    it('should search by name or description', async () => {
      const result = await repository.listMarketplace({ search: 'Pete' }, 1, 20);

      if (result.agents.length > 0) {
        const matchesSearch = result.agents.some(a =>
          a.name.toLowerCase().includes('pete') ||
          a.description.toLowerCase().includes('pete')
        );
        expect(matchesSearch).toBe(true);
      }
    });
  });

  describe('countByUser', () => {
    it('should count user agents', async () => {
      const countUser = 'test_agent_count_' + Date.now();
      await createTestUser(countUser);

      await repository.create(createValidAgentData({ name: 'Test Count Agent 1' }), countUser);
      await repository.create(createValidAgentData({ name: 'Test Count Agent 2' }), countUser);

      const count = await repository.countByUser(countUser);

      expect(count).toBeGreaterThanOrEqual(2);
    });

    it('should count by agent_type', async () => {
      const count = await repository.countByUser(TEST_USER_ID, 'private');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('setDefault', () => {
    it('should set agent as default and unset others', async () => {
      const defaultUser = 'test_agent_default_' + Date.now();
      await createTestUser(defaultUser);

      const agent1 = await repository.create(
        createValidAgentData({ name: 'Test Default Agent 1' }),
        defaultUser
      );
      const agent2 = await repository.create(
        createValidAgentData({ name: 'Test Default Agent 2' }),
        defaultUser
      );

      await repository.setDefault(agent1.id, defaultUser);

      let found1 = await repository.findById(agent1.id);
      expect(found1!.is_default).toBe(true);

      await repository.setDefault(agent2.id, defaultUser);

      found1 = await repository.findById(agent1.id);
      const found2 = await repository.findById(agent2.id);

      expect(found1!.is_default).toBe(false);
      expect(found2!.is_default).toBe(true);
    });
  });

  describe('incrementCloneCount', () => {
    it('should increment clone_count', async () => {
      const data = createValidAgentData({ name: 'Test Clone Count Agent' });
      const created = await repository.create(data, TEST_USER_ID);

      expect(created.clone_count).toBe(0);

      await repository.incrementCloneCount(created.id);

      const updated = await repository.findById(created.id);
      expect(updated!.clone_count).toBe(1);

      await repository.incrementCloneCount(created.id);
      await repository.incrementCloneCount(created.id);

      const updated2 = await repository.findById(created.id);
      expect(updated2!.clone_count).toBe(3);
    });
  });

  describe('Tool Operations', () => {
    let toolAgentId: number;

    beforeAll(async () => {
      const agent = await repository.create(
        createValidAgentData({ name: 'Test Tool Operations Agent' }),
        TEST_USER_ID
      );
      toolAgentId = agent.id;
    });

    describe('addTool', () => {
      it('should add tool to agent', async () => {
        const tools = await repository.addTool(toolAgentId, 'gmail');

        expect(tools).toContain('gmail');
      });

      it('should handle duplicate tool gracefully', async () => {
        await repository.addTool(toolAgentId, 'slack');

        const tools = await repository.addTool(toolAgentId, 'slack');

        // Returns current tools array (with slack already in it)
        expect(tools).toContain('slack');
      });
    });

    describe('getTools', () => {
      it('should return tools for agent', async () => {
        await repository.addTool(toolAgentId, 'github');

        const tools = await repository.getTools(toolAgentId);

        expect(tools.length).toBeGreaterThan(0);
        expect(tools).toContain('github');
        tools.forEach(tool => {
          expect(typeof tool).toBe('string');
        });
      });
    });

    describe('removeTool', () => {
      it('should remove tool from agent', async () => {
        await repository.addTool(toolAgentId, 'notion');

        let tools = await repository.getTools(toolAgentId);
        expect(tools).toContain('notion');

        await repository.removeTool(toolAgentId, 'notion');

        tools = await repository.getTools(toolAgentId);
        expect(tools).not.toContain('notion');
      });
    });
  });

  describe('Knowledge Base Operations', () => {
    let kbAgentId: number;

    beforeAll(async () => {
      const agent = await repository.create(
        createValidAgentData({ name: 'Test KB Operations Agent' }),
        TEST_USER_ID
      );
      kbAgentId = agent.id;
    });

    describe('addKnowledgeBase', () => {
      it('should add knowledge base to agent', async () => {
        const kb = await repository.addKnowledgeBase(
          kbAgentId,
          'kb-test-123',
          'Test Knowledge Base',
          'read'
        );

        expect(kb.agent_id).toBe(kbAgentId);
        expect(kb.knowledge_base_id).toBe('kb-test-123');
        expect(kb.kb_name).toBe('Test Knowledge Base');
        expect(kb.access_mode).toBe('read');
      });

      it('should update on conflict', async () => {
        await repository.addKnowledgeBase(kbAgentId, 'kb-conflict', 'Original', 'read');

        const updated = await repository.addKnowledgeBase(
          kbAgentId,
          'kb-conflict',
          'Updated Name',
          'write'
        );

        expect(updated.kb_name).toBe('Updated Name');
        expect(updated.access_mode).toBe('write');
      });
    });

    describe('getKnowledgeBases', () => {
      it('should return knowledge bases for agent', async () => {
        await repository.addKnowledgeBase(kbAgentId, 'kb-get-test', 'Get Test KB', 'read');

        const kbs = await repository.getKnowledgeBases(kbAgentId);

        expect(kbs.length).toBeGreaterThan(0);
        kbs.forEach(kb => {
          expect(kb.agent_id).toBe(kbAgentId);
        });
      });
    });

    describe('removeKnowledgeBase', () => {
      it('should remove knowledge base from agent', async () => {
        await repository.addKnowledgeBase(kbAgentId, 'kb-remove-test', 'Remove Test', 'read');

        await repository.removeKnowledgeBase(kbAgentId, 'kb-remove-test');

        const kbs = await repository.getKnowledgeBases(kbAgentId);
        const stillHas = kbs.some(kb => kb.knowledge_base_id === 'kb-remove-test');
        expect(stillHas).toBe(false);
      });
    });
  });

  describe('Run Operations', () => {
    let runAgentId: number;

    beforeAll(async () => {
      const agent = await repository.create(
        createValidAgentData({ name: 'Test Run Operations Agent' }),
        TEST_USER_ID
      );
      runAgentId = agent.id;

      await query(`
        INSERT INTO agent_runs (agent_id, user_id, status, tokens_used, duration_ms)
        VALUES ($1, $2, 'completed', 100, 500),
               ($1, $2, 'completed', 200, 600),
               ($1, $2, 'failed', 50, 300)
      `, [runAgentId, TEST_USER_ID]);
    });

    describe('getRecentRuns', () => {
      it('should return recent runs ordered by created_at desc', async () => {
        const runs = await repository.getRecentRuns(runAgentId, 10);

        expect(runs.length).toBeGreaterThanOrEqual(3);
        runs.forEach(run => {
          expect(run.agent_id).toBe(runAgentId);
        });
      });

      it('should respect limit parameter', async () => {
        const runs = await repository.getRecentRuns(runAgentId, 2);
        expect(runs.length).toBeLessThanOrEqual(2);
      });
    });

    describe('getRunStats', () => {
      it('should return aggregated run statistics', async () => {
        const stats = await repository.getRunStats(runAgentId);

        expect(stats.total_runs).toBeGreaterThanOrEqual(3);
        expect(stats.completed_runs).toBeGreaterThanOrEqual(2);
        expect(stats.failed_runs).toBeGreaterThanOrEqual(1);
        expect(stats.avg_duration_ms).toBeGreaterThan(0);
        expect(stats.total_tokens).toBeGreaterThan(0);
      });
    });
  });

  describe('Behaviour Configuration', () => {
    describe('create with thinking_level and autonomy_level', () => {
      it('should create agent with default thinking_level (medium)', async () => {
        const data = createValidAgentData({ name: 'Test Default Thinking Agent' });

        const agent = await repository.create(data, TEST_USER_ID);

        expect(agent.thinking_level).toBe('medium');
      });

      it('should create agent with default autonomy_level (supervised)', async () => {
        const data = createValidAgentData({ name: 'Test Default Autonomy Agent' });

        const agent = await repository.create(data, TEST_USER_ID);

        expect(agent.autonomy_level).toBe('supervised');
      });

      it('should create agent with explicit thinking_level', async () => {
        const data = createValidAgentData({
          name: 'Test High Thinking Agent',
          thinking_level: 'high'
        });

        const agent = await repository.create(data, TEST_USER_ID);

        expect(agent.thinking_level).toBe('high');
      });

      it('should create agent with explicit autonomy_level', async () => {
        const data = createValidAgentData({
          name: 'Test Autonomous Agent',
          autonomy_level: 'autonomous'
        });

        const agent = await repository.create(data, TEST_USER_ID);

        expect(agent.autonomy_level).toBe('autonomous');
      });

      it('should create agent with both levels specified', async () => {
        const data = createValidAgentData({
          name: 'Test Both Levels Agent',
          thinking_level: 'low',
          autonomy_level: 'semi_autonomous'
        });

        const agent = await repository.create(data, TEST_USER_ID);

        expect(agent.thinking_level).toBe('low');
        expect(agent.autonomy_level).toBe('semi_autonomous');
      });
    });

    describe('update thinking_level and autonomy_level', () => {
      it('should update thinking_level', async () => {
        const data = createValidAgentData({ name: 'Test Update Thinking Agent' });
        const created = await repository.create(data, TEST_USER_ID);

        const updated = await repository.update(created.id, {
          thinking_level: 'high'
        });

        expect(updated.thinking_level).toBe('high');
      });

      it('should update autonomy_level', async () => {
        const data = createValidAgentData({ name: 'Test Update Autonomy Agent' });
        const created = await repository.create(data, TEST_USER_ID);

        const updated = await repository.update(created.id, {
          autonomy_level: 'autonomous'
        });

        expect(updated.autonomy_level).toBe('autonomous');
      });

      it('should update both levels simultaneously', async () => {
        const data = createValidAgentData({ name: 'Test Update Both Levels Agent' });
        const created = await repository.create(data, TEST_USER_ID);

        const updated = await repository.update(created.id, {
          thinking_level: 'low',
          autonomy_level: 'semi_autonomous'
        });

        expect(updated.thinking_level).toBe('low');
        expect(updated.autonomy_level).toBe('semi_autonomous');
      });
    });

    describe('cloneAgent copies behaviour config', () => {
      it('should copy thinking_level from source agent', async () => {
        const sourceData = createValidAgentData({
          name: 'Test Clone Source Thinking',
          thinking_level: 'high'
        });
        const source = await repository.create(sourceData, TEST_USER_ID);

        const clone = await repository.cloneAgent(
          source.id,
          { name: 'Test Clone Thinking Copy', description: 'Cloned' },
          TEST_USER_ID
        );

        expect(clone.thinking_level).toBe('high');
      });

      it('should copy autonomy_level from source agent', async () => {
        const sourceData = createValidAgentData({
          name: 'Test Clone Source Autonomy',
          autonomy_level: 'autonomous'
        });
        const source = await repository.create(sourceData, TEST_USER_ID);

        const clone = await repository.cloneAgent(
          source.id,
          { name: 'Test Clone Autonomy Copy', description: 'Cloned' },
          TEST_USER_ID
        );

        expect(clone.autonomy_level).toBe('autonomous');
      });

      it('should copy both levels from source agent', async () => {
        const sourceData = createValidAgentData({
          name: 'Test Clone Source Both',
          thinking_level: 'low',
          autonomy_level: 'semi_autonomous'
        });
        const source = await repository.create(sourceData, TEST_USER_ID);

        const clone = await repository.cloneAgent(
          source.id,
          { name: 'Test Clone Both Copy', description: 'Cloned' },
          TEST_USER_ID
        );

        expect(clone.thinking_level).toBe('low');
        expect(clone.autonomy_level).toBe('semi_autonomous');
      });
    });

    describe('findById returns behaviour config', () => {
      it('should return thinking_level and autonomy_level', async () => {
        const data = createValidAgentData({
          name: 'Test FindById Behaviour',
          thinking_level: 'high',
          autonomy_level: 'autonomous'
        });
        const created = await repository.create(data, TEST_USER_ID);

        const found = await repository.findById(created.id);

        expect(found).not.toBeNull();
        expect(found!.thinking_level).toBe('high');
        expect(found!.autonomy_level).toBe('autonomous');
      });
    });

    describe('findByIdEnriched returns behaviour config', () => {
      it('should include thinking_level and autonomy_level in enriched response', async () => {
        const data = createValidAgentData({
          name: 'Test Enriched Behaviour',
          thinking_level: 'low',
          autonomy_level: 'semi_autonomous'
        });
        const created = await repository.create(data, TEST_USER_ID);

        const enriched = await repository.findByIdEnriched(created.id);

        expect(enriched).not.toBeNull();
        expect(enriched!.thinking_level).toBe('low');
        expect(enriched!.autonomy_level).toBe('semi_autonomous');
      });
    });
  });

  describe('createSystemAgent', () => {
    it('should create system agent with null user_id', async () => {
      const agent = await repository.createSystemAgent({
        name: 'Test System Agent ' + Date.now(),
        description: 'A test system agent',
        system_prompt: `# System Agent - Helper

## Role
You are a system agent for testing system agent creation.

## Objective
Test system agents.

## Guidelines
- Be helpful
- Be safe`,
        agent_type: 'public'
      });

      expect(agent.user_id).toBeNull();
      expect(agent.agent_type).toBe('public');
      expect(agent.is_verified).toBe(true);
    });

    it('should create internal agent', async () => {
      const agent = await repository.createSystemAgent({
        name: 'Test Internal Agent ' + Date.now(),
        description: 'An internal agent',
        system_prompt: `# Internal Agent - Internal

## Role
You are an internal agent for internal operations.

## Objective
Handle internal tasks.

## Guidelines
- Internal use only
- System only`,
        agent_type: 'internal'
      });

      expect(agent.user_id).toBeNull();
      expect(agent.agent_type).toBe('internal');
      expect(agent.is_verified).toBe(false);
    });
  });
});
