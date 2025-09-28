/**
 * User Agent Isolation Test
 * Tests the user privacy fix for agent isolation
 */

const AgentService = require('../services/agentService');

describe('Agent User Isolation', () => {
  let agentService;

  beforeEach(() => {
    agentService = new AgentService();
  });

  describe('Agent Creation with User Context', () => {
    test('should create user-specific agent', async () => {
      const agentData = {
        name: 'Test Personal Agent',
        personality_type: 'assistant',
        description: 'My personal AI assistant',
        system_prompt: 'You are my personal assistant'
      };

      const user1Agent = await agentService.createAgent(agentData, 'user123');
      
      expect(user1Agent.agent_type).toBe('user');
      expect(user1Agent.user_id).toBe('user123');
      expect(user1Agent.created_by).toBe('user123');
    });

    test('should create system agent for admin users', async () => {
      const agentData = {
        name: 'System Assistant',
        personality_type: 'assistant',
        description: 'System-wide assistant',
        system_prompt: 'You are a helpful system assistant',
        agent_type: 'system'
      };

      const systemAgent = await agentService.createAgent(agentData, 'admin_user');
      
      expect(systemAgent.agent_type).toBe('system');
      expect(systemAgent.user_id).toBeNull();
      expect(systemAgent.created_by).toBe('admin_user');
    });

    test('should reject system agent creation for regular users', async () => {
      const agentData = {
        name: 'Attempted System Agent',
        personality_type: 'assistant',
        agent_type: 'system'
      };

      await expect(
        agentService.createAgent(agentData, 'regular_user')
      ).rejects.toThrow('Only administrators can create system agents');
    });
  });

  describe('Agent Access Control', () => {
    test('should only return user-accessible agents', async () => {
      // User should see:
      // - System agents (available to all)
      // - Their own user agents
      // - Shared agents
      // BUT NOT other users' private agents

      const user1Filters = { user_id: 'user123', include_system_agents: true };
      const user1Agents = await agentService.getAgents(user1Filters);

      // Should not contain other users' private agents
      const hasOtherUserAgents = user1Agents.some(
        agent => agent.agent_type === 'user' && agent.user_id !== 'user123'
      );
      
      expect(hasOtherUserAgents).toBe(false);

      // Should contain system agents
      const hasSystemAgents = user1Agents.some(
        agent => agent.agent_type === 'system'
      );
      
      expect(hasSystemAgents).toBe(true);
    });

    test('should validate agent access by user', async () => {
      // Mock agents
      const systemAgent = { agent_type: 'system', user_id: null };
      const user1Agent = { agent_type: 'user', user_id: 'user123' };
      const user2Agent = { agent_type: 'user', user_id: 'user456' };
      const sharedAgent = { agent_type: 'shared', user_id: null };

      // User 1 access tests
      expect(agentService.canUserAccessAgent(systemAgent, 'user123')).toBe(true);
      expect(agentService.canUserAccessAgent(user1Agent, 'user123')).toBe(true);
      expect(agentService.canUserAccessAgent(user2Agent, 'user123')).toBe(false); // ← Key privacy fix!
      expect(agentService.canUserAccessAgent(sharedAgent, 'user123')).toBe(true);

      // User 2 access tests
      expect(agentService.canUserAccessAgent(systemAgent, 'user456')).toBe(true);
      expect(agentService.canUserAccessAgent(user1Agent, 'user456')).toBe(false); // ← Key privacy fix!
      expect(agentService.canUserAccessAgent(user2Agent, 'user456')).toBe(true);
      expect(agentService.canUserAccessAgent(sharedAgent, 'user456')).toBe(true);
    });
  });

  describe('Privacy Scenarios', () => {
    test('should demonstrate the original privacy issue (now fixed)', async () => {
      // Before the fix: All users could see each other's agents
      // After the fix: Users only see their own agents + system agents

      // Simulate what would happen in the old system
      const oldSystemFilters = {}; // No user filtering
      
      // In the new system with user isolation
      const newSystemUser1Filters = { user_id: 'user123' };
      const newSystemUser2Filters = { user_id: 'user456' };

      const user1Agents = await agentService.getAgents(newSystemUser1Filters);
      const user2Agents = await agentService.getAgents(newSystemUser2Filters);

      // Each user should only see their own + system agents
      const user1PrivateAgents = user1Agents.filter(
        agent => agent.agent_type === 'user' && agent.user_id !== 'user123'
      );
      
      const user2PrivateAgents = user2Agents.filter(
        agent => agent.agent_type === 'user' && agent.user_id !== 'user456'
      );

      expect(user1PrivateAgents).toHaveLength(0);
      expect(user2PrivateAgents).toHaveLength(0);
    });
  });
});

/**
 * Integration Test: Full User Isolation Workflow
 */
describe('Full User Isolation Workflow', () => {
  test('complete user agent isolation workflow', async () => {
    const agentService = new AgentService();

    // Step 1: Two users create personal agents
    const user1AgentData = {
      name: 'Alice Personal Assistant',
      personality_type: 'assistant',
      description: 'Alice\'s private AI helper'
    };
    
    const user2AgentData = {
      name: 'Bob Work Assistant',
      personality_type: 'technical',
      description: 'Bob\'s work-focused assistant'
    };

    const aliceAgent = await agentService.createAgent(user1AgentData, 'alice123');
    const bobAgent = await agentService.createAgent(user2AgentData, 'bob456');

    // Step 2: Each user gets their own agent list
    const aliceAgents = await agentService.getAgents({ user_id: 'alice123' });
    const bobAgents = await agentService.getAgents({ user_id: 'bob456' });

    // Step 3: Verify privacy isolation
    const aliceSeesOwnAgent = aliceAgents.some(a => a.id === aliceAgent.id);
    const aliceSeesBobAgent = aliceAgents.some(a => a.id === bobAgent.id);
    const bobSeesOwnAgent = bobAgents.some(a => a.id === bobAgent.id);
    const bobSeesAliceAgent = bobAgents.some(a => a.id === aliceAgent.id);

    expect(aliceSeesOwnAgent).toBe(true);   // [OK] Users see their own agents
    expect(aliceSeesBobAgent).toBe(false);  // [OK] Users DON'T see others' agents
    expect(bobSeesOwnAgent).toBe(true);     // [OK] Users see their own agents
    expect(bobSeesAliceAgent).toBe(false);  // [OK] Users DON'T see others' agents

    console.log('🔒 Agent privacy isolation working correctly!');
    console.log(`Alice has ${aliceAgents.length} accessible agents`);
    console.log(`Bob has ${bobAgents.length} accessible agents`);
  });
});

// Export for manual testing
module.exports = {
  testUserIsolation: async () => {
    console.log('[TEST] Testing User Agent Isolation...');
    
    const agentService = new AgentService();
    
    // Test the privacy fix
    const testAgent1 = { agent_type: 'user', user_id: 'user1' };
    const testAgent2 = { agent_type: 'user', user_id: 'user2' };
    const systemAgent = { agent_type: 'system', user_id: null };
    
    console.log('User1 can access User1 agent:', agentService.canUserAccessAgent(testAgent1, 'user1')); // Should be true
    console.log('User1 can access User2 agent:', agentService.canUserAccessAgent(testAgent2, 'user1')); // Should be false [OK]
    console.log('User1 can access System agent:', agentService.canUserAccessAgent(systemAgent, 'user1')); // Should be true
    
    console.log('[OK] User isolation test completed!');
  }
};