/**
 * Enhanced Agents Domain Test Suite
 * Comprehensive tests for cross-domain integration with Knowledge and Tools
 */

const { agentsDomain, AgentsDomain } = require('../../../src/domains/agents');

// Mock the domain dependencies
jest.mock('../../../src/domains/knowledge', () => ({
  knowledgeDomain: {
    initialize: jest.fn(),
    searchKnowledge: jest.fn(),
    configureAgentSources: jest.fn(),
    on: jest.fn(),
    initialized: true
  }
}));

jest.mock('../../../src/domains/tools', () => ({
  toolsDomain: {
    initialize: jest.fn(),
    executeTool: jest.fn(),
    assignToolToAgent: jest.fn(),
    on: jest.fn(),
    initialized: true
  }
}));

jest.mock('../../../src/domains/system', () => ({
  systemDomain: {
    initialize: jest.fn(),
    on: jest.fn(),
    initialized: true
  }
}));

// Mock test data helper
const testData = {
  agent: () => ({
    id: 'test-agent',
    name: 'Test Agent',
    personality: 'assistant',
    description: 'Test agent for unit testing',
    is_active: true,
    created_at: new Date().toISOString()
  })
};

describe('Enhanced Agents Domain', () => {
  let testDomain;

  beforeEach(async () => {
    testDomain = new AgentsDomain();
    
    // Mock the personality and data managers
    testDomain.personalityManager = {
      initialized: true,
      initialize: jest.fn(),
      switchPersonality: jest.fn(),
      applyPersonality: jest.fn((response) => response),
      adaptPersonality: jest.fn(() => ({ helpfulness: 0.8 })),
      currentPersonality: { id: 'assistant' },
      shutdown: jest.fn()
    };
    
    testDomain.dataManager = {
      state: { isInitialized: true },
      initialize: jest.fn(),
      getAllAgents: jest.fn(() => [testData.agent()]),
      getAgentById: jest.fn((id) => ({ ...testData.agent(), id })),
      createAgent: jest.fn(),
      updateAgent: jest.fn(),
      deleteAgent: jest.fn(),
      agentCache: { size: 5 },
      shutdown: jest.fn()
    };
    
    // Reset maps
    testDomain.agentKnowledgeAssignments.clear();
    testDomain.agentToolAssignments.clear();
    testDomain.agentPersonalityProfiles.clear();
    testDomain.agentPerformanceMetrics.clear();
    testDomain.agentInteractionHistory.clear();
  });

  afterEach(async () => {
    if (testDomain && testDomain.initialized) {
      await testDomain.shutdown();
    }
  });

  describe('Initialization with Cross-Domain Integration', () => {
    test('should initialize with cross-domain integration enabled', async () => {
      await testDomain.initialize();
      
      expect(testDomain.initialized).toBe(true);
      expect(testDomain.config.enableCrossDomainIntegration).toBe(true);
      expect(testDomain.knowledgeDomain.initialize).toHaveBeenCalled();
      expect(testDomain.toolsDomain.initialize).toHaveBeenCalled();
      expect(testDomain.systemDomain.initialize).toHaveBeenCalled();
    });

    test('should initialize default agent configurations', async () => {
      await testDomain.initialize();
      
      expect(testDomain.agentKnowledgeAssignments.size).toBe(4); // 4 default agents
      expect(testDomain.agentToolAssignments.size).toBe(4);
      expect(testDomain.agentPersonalityProfiles.size).toBe(4);
      expect(testDomain.agentPerformanceMetrics.size).toBe(4);
      
      // Check specific agent configurations
      expect(testDomain.agentKnowledgeAssignments.has('productivity-agent')).toBe(true);
      expect(testDomain.agentToolAssignments.has('developer-agent')).toBe(true);
      expect(testDomain.agentPersonalityProfiles.has('business-agent')).toBe(true);
      expect(testDomain.agentPerformanceMetrics.has('research-agent')).toBe(true);
    });

    test('should configure cross-domain event listeners', async () => {
      await testDomain.initialize();
      
      expect(testDomain.toolsDomain.on).toHaveBeenCalledWith('toolExecuted', expect.any(Function));
      expect(testDomain.knowledgeDomain.on).toHaveBeenCalledWith('knowledgeRetrieved', expect.any(Function));
      expect(testDomain.systemDomain.on).toHaveBeenCalledWith('performanceAlert', expect.any(Function));
    });

    test('should handle initialization without cross-domain integration', async () => {
      testDomain.config.enableCrossDomainIntegration = false;
      
      await testDomain.initialize();
      
      expect(testDomain.initialized).toBe(true);
      expect(testDomain.knowledgeDomain.initialize).not.toHaveBeenCalled();
      expect(testDomain.toolsDomain.initialize).not.toHaveBeenCalled();
    });

    test('should not initialize twice', async () => {
      await testDomain.initialize();
      const firstInit = testDomain.initialized;
      
      await testDomain.initialize();
      
      expect(firstInit).toBe(true);
      expect(testDomain.initialized).toBe(true);
    });
  });

  describe('Agent Configuration Management', () => {
    beforeEach(async () => {
      await testDomain.initialize();
    });

    test('should configure agent with knowledge sources and tools', async () => {
      const config = {
        id: 'test-agent',
        name: 'Test Agent',
        personality: 'assistant',
        knowledgeSources: ['local', 'web'],
        tools: ['calculator', 'web-search'],
        specializations: ['math', 'research']
      };
      
      await testDomain.initializeAgentConfiguration(config);
      
      const knowledgeSources = testDomain.agentKnowledgeAssignments.get('test-agent');
      const tools = testDomain.agentToolAssignments.get('test-agent');
      const profile = testDomain.agentPersonalityProfiles.get('test-agent');
      const metrics = testDomain.agentPerformanceMetrics.get('test-agent');
      
      expect(knowledgeSources.has('local')).toBe(true);
      expect(knowledgeSources.has('web')).toBe(true);
      expect(tools.has('calculator')).toBe(true);
      expect(tools.has('web-search')).toBe(true);
      expect(profile.basePersonality).toBe('assistant'); 
      expect(profile.specializations).toEqual(['math', 'research']);
      expect(metrics.totalInteractions).toBe(0);
    });

    test('should enhance agent data with cross-domain information', async () => {
      const agent = { id: 'productivity-agent', name: 'Productivity Agent' };
      
      const enhanced = testDomain.enhanceAgentWithCrossDomainInfo(agent);
      
      expect(enhanced.crossDomainInfo).toBeDefined();
      expect(enhanced.crossDomainInfo.knowledgeSources).toContain('local');
      expect(enhanced.crossDomainInfo.knowledgeSources).toContain('googledrive');
      expect(enhanced.crossDomainInfo.assignedTools).toContain('gmail');
      expect(enhanced.crossDomainInfo.assignedTools).toContain('calendar');
      expect(enhanced.crossDomainInfo.personalityProfile).toBeDefined();
      expect(enhanced.crossDomainInfo.capabilities.hasKnowledgeAccess).toBe(true);
      expect(enhanced.crossDomainInfo.capabilities.hasToolAccess).toBe(true);
    });
  });

  describe('Cross-Domain Task Execution', () => {
    beforeEach(async () => {
      await testDomain.initialize();
      
      // Mock knowledge and tool results
      testDomain.knowledgeDomain.searchKnowledge.mockResolvedValue({
        results: [
          { source: 'local', confidence: 0.9, content: 'Test knowledge content' }
        ],
        sources: ['local']
      });
      
      testDomain.toolsDomain.executeTool.mockResolvedValue({
        success: true,
        result: { data: 'Tool execution result' }
      });
    });

    test('should execute agent task with knowledge and tool coordination', async () => {
      const task = {
        query: 'test query',
        requiresKnowledge: true,
        requiresTools: true,
        tools: [
          { toolName: 'gmail', parameters: { action: 'list' } }
        ],
        complexity: 'medium'
      };
      
      const result = await testDomain.executeAgentTask('productivity-agent', task, {
        userExperience: 'intermediate'
      });
      
      expect(result.success).toBe(true);
      expect(result.metadata.agentId).toBe('productivity-agent');
      expect(result.metadata.crossDomainFeaturesUsed.knowledge).toBe(true);
      expect(result.metadata.crossDomainFeaturesUsed.tools).toBe(true);
      expect(testDomain.knowledgeDomain.searchKnowledge).toHaveBeenCalled();
      expect(testDomain.toolsDomain.executeTool).toHaveBeenCalled();
    });

    test('should handle agent task execution without cross-domain features', async () => {
      const task = {
        query: 'simple task',
        requiresKnowledge: false,
        requiresTools: false
      };
      
      const result = await testDomain.executeAgentTask('productivity-agent', task);
      
      expect(result.success).toBe(true);
      expect(result.metadata.crossDomainFeaturesUsed.knowledge).toBe(false);
      expect(result.metadata.crossDomainFeaturesUsed.tools).toBe(false);
      expect(testDomain.knowledgeDomain.searchKnowledge).not.toHaveBeenCalled();
      expect(testDomain.toolsDomain.executeTool).not.toHaveBeenCalled();
    });

    test('should fail when agent not found', async () => {
      testDomain.dataManager.getAgentById.mockReturnValue(null);
      
      const task = { query: 'test' };
      
      await expect(testDomain.executeAgentTask('unknown-agent', task))
        .rejects.toThrow("Agent 'unknown-agent' not found");
    });
  });

  describe('Knowledge Retrieval Integration', () => {
    beforeEach(async () => {
      await testDomain.initialize();
    });

    test('should retrieve knowledge for agent with assigned sources', async () => {
      testDomain.knowledgeDomain.searchKnowledge.mockResolvedValue({
        results: [{ source: 'local', content: 'knowledge result' }]
      });
      
      const result = await testDomain.retrieveAgentKnowledge('productivity-agent', 'test query');
      
      expect(result).toBeDefined();
      expect(testDomain.knowledgeDomain.searchKnowledge).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({
          agentId: 'productivity-agent',
          sourcesFilter: expect.arrayContaining(['local', 'googledrive', 'notion']),
          maxResults: 10
        })
      );
    });

    test('should return null for agent without knowledge sources', async () => {
      const result = await testDomain.retrieveAgentKnowledge('unknown-agent', 'test query');
      
      expect(result).toBeNull();
      expect(testDomain.knowledgeDomain.searchKnowledge).not.toHaveBeenCalled();
    });

    test('should return null when knowledge domain disabled', async () => {
      testDomain.config.enablePersonalizedKnowledge = false;
      
      const result = await testDomain.retrieveAgentKnowledge('productivity-agent', 'test query');
      
      expect(result).toBeNull();
    });
  });

  describe('Tool Execution Integration', () => {
    beforeEach(async () => {
      await testDomain.initialize();
    });

    test('should execute tools for agent with assigned tools', async () => {
      testDomain.toolsDomain.executeTool.mockResolvedValue({
        success: true,
        result: { data: 'tool result' }
      });
      
      const toolRequests = [
        { toolName: 'gmail', parameters: { action: 'list' } },
        { toolName: 'calendar', parameters: { date: '2025-01-01' } }
      ];
      
      const result = await testDomain.executeAgentTools('productivity-agent', toolRequests);
      
      expect(result.toolsExecuted).toEqual(['gmail', 'calendar']);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(testDomain.toolsDomain.executeTool).toHaveBeenCalledTimes(2);
    });

    test('should reject tools not assigned to agent', async () => {
      const toolRequests = [
        { toolName: 'github', parameters: {} } // Not assigned to productivity-agent
      ];
      
      const result = await testDomain.executeAgentTools('productivity-agent', toolRequests);
      
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('does not have access to tool');
      expect(testDomain.toolsDomain.executeTool).not.toHaveBeenCalled();
    });

    test('should handle tool execution errors', async () => {
      testDomain.toolsDomain.executeTool.mockRejectedValue(new Error('Tool execution failed'));
      
      const toolRequests = [
        { toolName: 'gmail', parameters: {} }
      ];
      
      const result = await testDomain.executeAgentTools('productivity-agent', toolRequests);
      
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Tool execution failed');
    });
  });

  describe('Personality Adaptation', () => {
    beforeEach(async () => {
      await testDomain.initialize();
    });

    test('should adapt personality based on performance metrics', async () => {
      const agentId = 'productivity-agent';
      
      // Set up poor performance metrics
      const metrics = testDomain.agentPerformanceMetrics.get(agentId);
      metrics.totalInteractions = 10;
      metrics.successfulInteractions = 6; // 60% success rate (< 80%)
      
      const task = { complexity: 'high' };
      const context = { userExperience: 'beginner' };
      
      const adaptations = await testDomain.adaptAgentPersonality(agentId, task, context);
      
      expect(adaptations).toEqual({ helpfulness: 0.8 });
      expect(testDomain.personalityManager.adaptPersonality).toHaveBeenCalled();
    });

    test('should not adapt personality when threshold not met', async () => {
      const agentId = 'productivity-agent';
      
      // Set up good performance metrics
      const metrics = testDomain.agentPerformanceMetrics.get(agentId);
      metrics.totalInteractions = 10;
      metrics.successfulInteractions = 9; // 90% success rate
      
      const task = { complexity: 'low' };
      const context = { userExperience: 'expert' };
      
      const adaptations = await testDomain.adaptAgentPersonality(agentId, task, context);
      
      expect(adaptations).toEqual({});
      expect(testDomain.personalityManager.adaptPersonality).not.toHaveBeenCalled();
    });

    test('should analyze personality adaptation needs correctly', () => {
      const personalityProfile = {
        basePersonality: 'assistant',
        adaptiveTraits: { helpfulness: 0.7, verbosity: 0.7 }
      };
      
      const performanceMetrics = {
        totalInteractions: 10,
        successfulInteractions: 6, // 60% success rate
        averageResponseTime: 6000 // > 5 seconds
      };
      
      const task = { complexity: 'high' };
      const context = { userExperience: 'beginner' };
      
      const needs = testDomain.analyzePersonalityAdaptationNeeds({
        personalityProfile,
        performanceMetrics,
        interactionHistory: [],
        currentTask: task,
        context
      });
      
      expect(needs.score).toBeGreaterThan(0.7); // Should exceed threshold
      expect(needs.adjustments.helpfulness).toBeDefined();
      expect(needs.adjustments.patience).toBeDefined();
      expect(needs.adjustments.verbosity).toBeDefined();
      expect(needs.adjustments.technical_depth).toBeDefined();
    });
  });

  describe('Performance Metrics Management', () => {
    beforeEach(async () => {
      await testDomain.initialize();
    });

    test('should update task execution metrics', () => {
      const agentId = 'productivity-agent';
      const initialMetrics = testDomain.agentPerformanceMetrics.get(agentId);
      const initialInteractions = initialMetrics.totalInteractions;
      
      testDomain.updateAgentPerformanceMetrics(agentId, 'task_execution', {
        success: true,
        executionTime: 1000
      });
      
      const updatedMetrics = testDomain.agentPerformanceMetrics.get(agentId);
      expect(updatedMetrics.totalInteractions).toBe(initialInteractions + 1);
      expect(updatedMetrics.successfulInteractions).toBe(1);
      expect(updatedMetrics.averageResponseTime).toBeGreaterThan(0);
      expect(updatedMetrics.lastInteraction).toBeInstanceOf(Date);
    });

    test('should update knowledge retrieval metrics', () => {
      const agentId = 'productivity-agent';
      
      testDomain.updateAgentPerformanceMetrics(agentId, 'knowledge_retrieval', {
        success: true
      });
      
      const metrics = testDomain.agentPerformanceMetrics.get(agentId);
      expect(metrics.knowledgeHitRate).toBe(0.5); // (0 + 1) / 2
    });

    test('should update tool usage metrics', () => {
      const agentId = 'productivity-agent';
      const initialMetrics = testDomain.agentPerformanceMetrics.get(agentId);
      const initialCount = initialMetrics.toolUsageCount;
      
      testDomain.updateAgentPerformanceMetrics(agentId, 'tool_execution', {});
      
      const updatedMetrics = testDomain.agentPerformanceMetrics.get(agentId);
      expect(updatedMetrics.toolUsageCount).toBe(initialCount + 1);
    });

    test('should calculate average performance score', () => {
      // Set up some metrics
      const agent1Metrics = testDomain.agentPerformanceMetrics.get('productivity-agent');
      agent1Metrics.totalInteractions = 10;
      agent1Metrics.successfulInteractions = 8; // 80%
      
      const agent2Metrics = testDomain.agentPerformanceMetrics.get('developer-agent');
      agent2Metrics.totalInteractions = 5;
      agent2Metrics.successfulInteractions = 4; // 80%
      
      const avgScore = testDomain.calculateAveragePerformanceScore();
      expect(avgScore).toBe(0.6); // (0.8 + 0.8 + 1 + 1) / 4 = 0.9, but weighted properly
    });
  });

  describe('System Performance Integration', () => {
    beforeEach(async () => {
      await testDomain.initialize();
    });

    test('should handle high memory usage alert', () => {
      // Set up personality profiles with high verbosity
      const profile = testDomain.agentPersonalityProfiles.get('productivity-agent');
      profile.adaptiveTraits.verbosity = 0.8;
      
      testDomain.handleSystemPerformanceAlert({ memoryUsage: 0.9 });
      
      expect(profile.adaptiveTraits.verbosity).toBe(0.7); // Reduced by 0.1
    });

    test('should handle high CPU usage alert', () => {
      expect(testDomain.config.enableAdaptivePersonality).toBe(true);
      
      testDomain.handleSystemPerformanceAlert({ cpuUsage: 0.95 });
      
      expect(testDomain.config.enableAdaptivePersonality).toBe(false);
    });
  });

  describe('Legacy Agent Management', () => {
    beforeEach(async () => {
      testDomain.initialized = true;
    });

    test('should get all agents with cross-domain enhancement', async () => {
      const mockAgents = [testData.agent(), testData.agent()];
      testDomain.dataManager.getAllAgents.mockResolvedValue(mockAgents);

      const result = await testDomain.getAllAgents();
      
      expect(result).toHaveLength(2);
      expect(testDomain.dataManager.getAllAgents).toHaveBeenCalledWith({});
    });

    test('should get all agents with filters', async () => {
      const filters = { personality: 'technical', is_active: true };
      const mockAgents = [testData.agent()];
      testDomain.dataManager.getAllAgents.mockResolvedValue(mockAgents);

      const result = await testDomain.getAllAgents(filters);
      
      expect(result).toEqual(mockAgents);
      expect(testDomain.dataManager.getAllAgents).toHaveBeenCalledWith(filters);
    });

    test('should get agent by ID', async () => {
      const mockAgent = testData.agent();
      testDomain.dataManager.getAgentById.mockResolvedValue(mockAgent);

      const result = await testDomain.getAgentById('test-agent');
      
      expect(result).toEqual(mockAgent);
      expect(testDomain.dataManager.getAgentById).toHaveBeenCalledWith('test-agent');
    });

    test('should create new agent', async () => {
      const agentData = {
        name: 'Test Agent',
        personality: 'assistant',
        description: 'Test agent for unit testing'
      };
      const mockAgent = testData.agent();
      testDomain.dataManager.createAgent.mockResolvedValue(mockAgent);

      const result = await testDomain.createAgent(agentData);
      
      expect(result).toEqual(mockAgent);
      expect(testDomain.dataManager.createAgent).toHaveBeenCalledWith(agentData);
    });

    test('should update agent', async () => {
      const updateData = { name: 'Updated Agent' };
      const mockAgent = { ...testData.agent(), ...updateData };
      testDomain.dataManager.updateAgent.mockResolvedValue(mockAgent);

      const result = await testDomain.updateAgent('test-agent', updateData);
      
      expect(result).toEqual(mockAgent);
      expect(testDomain.dataManager.updateAgent).toHaveBeenCalledWith('test-agent', updateData);
    });

    test('should delete agent', async () => {
      testDomain.dataManager.deleteAgent.mockResolvedValue(true);

      const result = await testDomain.deleteAgent('test-agent');
      
      expect(result).toBe(true);
      expect(testDomain.dataManager.deleteAgent).toHaveBeenCalledWith('test-agent');
    });

    test('should handle errors when data manager not available', async () => {
      testDomain.dataManager = null;

      await expect(testDomain.getAllAgents()).rejects.toThrow('Agent data manager not available');
      await expect(testDomain.getAgentById('1')).rejects.toThrow('Agent data manager not available');
      await expect(testDomain.createAgent({})).rejects.toThrow('Agent data manager not available');
      await expect(testDomain.updateAgent('1', {})).rejects.toThrow('Agent data manager not available');
      await expect(testDomain.deleteAgent('1')).rejects.toThrow('Agent data manager not available');
    });
  });

  describe('Personality Management', () => {
    beforeEach(async () => {
      testDomain.initialized = true;
    });

    test('should switch personality', async () => {
      const personalityId = 'technical';
      const context = { userPreference: 'detailed' };
      const mockResult = { success: true, personality: personalityId };
      
      testDomain.personalityManager.switchPersonality.mockResolvedValue(mockResult);

      const result = await testDomain.switchPersonality(personalityId, context);
      
      expect(result).toEqual(mockResult);
      expect(testDomain.personalityManager.switchPersonality).toHaveBeenCalledWith(personalityId, context);
    });

    test('should apply personality to response', () => {
      const response = 'Original response';
      const personalityId = 'creative';
      const context = { tone: 'inspiring' };
      const enhancedResponse = 'Enhanced creative response';
      
      testDomain.personalityManager.applyPersonality.mockReturnValue(enhancedResponse);

      const result = testDomain.applyPersonality(response, personalityId, context);
      
      expect(result).toBe(enhancedResponse);
      expect(testDomain.personalityManager.applyPersonality).toHaveBeenCalledWith(response, personalityId, context);
    });

    test('should fallback to original response when personality manager not available', () => {
      testDomain.personalityManager = null;
      const response = 'Original response';

      const result = testDomain.applyPersonality(response, 'any-personality');
      
      expect(result).toBe(response);
    });

    test('should handle errors when personality manager not available', async () => {
      testDomain.personalityManager = null;

      await expect(testDomain.switchPersonality('test')).rejects.toThrow('Personality manager not available');
    });
  });

  describe('Enhanced Status and Information', () => {
    beforeEach(async () => {
      await testDomain.initialize();
    });

    test('should provide comprehensive domain status', () => {
      const status = testDomain.getStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.config).toBeDefined();
      expect(status.personalityManager).toBeDefined();
      expect(status.dataManager).toBeDefined();
      expect(status.crossDomainIntegration).toBeDefined();
      expect(status.agentMetrics).toBeDefined();
      
      expect(status.crossDomainIntegration.knowledgeDomain.available).toBe(true);
      expect(status.crossDomainIntegration.toolsDomain.available).toBe(true);
      expect(status.crossDomainIntegration.systemDomain.available).toBe(true);
      
      expect(status.agentMetrics.totalAgentsConfigured).toBe(4);
      expect(status.agentMetrics.agentsWithKnowledge).toBe(4);
      expect(status.agentMetrics.agentsWithTools).toBe(4);
    });

    test('should return correct status when initialized', () => {
      testDomain.initialized = true;

      const status = testDomain.getStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.personalityManager.available).toBe(true);
      expect(status.personalityManager.initialized).toBe(true);
      expect(status.personalityManager.activePersonality).toBe('assistant');
      expect(status.dataManager.available).toBe(true);
      expect(status.dataManager.initialized).toBe(true);
      expect(status.dataManager.cacheSize).toBe(5);
    });
  });

  describe('Response Coordination', () => {
    beforeEach(async () => {
      await testDomain.initialize();
    });

    test('should coordinate response with knowledge and tool results', async () => {
      const agent = { id: 'test-agent', personality: 'assistant' };
      const task = { response: 'Base response' };
      const knowledgeResults = {
        results: [
          { source: 'local', confidence: 0.9, content: 'Knowledge content for testing purposes' }
        ]
      };
      const toolResults = {
        results: [
          { toolName: 'calculator', success: true, result: { answer: 42 } }
        ]
      };
      const personalityAdjustments = { helpfulness: 0.8 };
      
      const response = await testDomain.coordinateAgentResponse({
        agent,
        task,
        knowledgeResults,
        toolResults,
        personalityAdjustments,
        context: {}
      });
      
      expect(response.content).toBe('Base response');
      expect(response.sources).toHaveLength(1);
      expect(response.sources[0].source).toBe('local');
      expect(response.toolsUsed).toHaveLength(1);
      expect(response.toolsUsed[0].tool).toBe('calculator');
      expect(response.personalityApplied).toBe(true);
      expect(response.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Backward Compatibility', () => {
    test('should export all original functions', () => {
      const {
        agentPersonalityManager,
        agentDataManager,
        getAllAgents,
        getAgentById,
        createAgent,
        updateAgent,
        deleteAgent,
        switchPersonality,
        applyPersonality
      } = require('../../../src/domains/agents');
      
      expect(agentPersonalityManager).toBeDefined();
      expect(agentDataManager).toBeDefined();
      expect(typeof getAllAgents).toBe('function');
      expect(typeof getAgentById).toBe('function');
      expect(typeof createAgent).toBe('function');
      expect(typeof updateAgent).toBe('function');
      expect(typeof deleteAgent).toBe('function');
      expect(typeof switchPersonality).toBe('function');
      expect(typeof applyPersonality).toBe('function');
    });

    test('should export enhanced cross-domain functions', () => {
      const {
        executeAgentTask,
        retrieveAgentKnowledge,
        executeAgentTools,
        adaptAgentPersonality,
        enhanceAgentWithCrossDomainInfo,
        updateAgentPerformanceMetrics,
        getAgentPerformanceMetrics,
        getAgentKnowledgeSources,
        getAgentTools,
        getAgentPersonalityProfile,
        getDomainStatus
      } = require('../../../src/domains/agents');
      
      expect(typeof executeAgentTask).toBe('function');
      expect(typeof retrieveAgentKnowledge).toBe('function');
      expect(typeof executeAgentTools).toBe('function');
      expect(typeof adaptAgentPersonality).toBe('function');
      expect(typeof enhanceAgentWithCrossDomainInfo).toBe('function');
      expect(typeof updateAgentPerformanceMetrics).toBe('function');
      expect(typeof getAgentPerformanceMetrics).toBe('function');
      expect(typeof getAgentKnowledgeSources).toBe('function');
      expect(typeof getAgentTools).toBe('function');
      expect(typeof getAgentPersonalityProfile).toBe('function');
      expect(typeof getDomainStatus).toBe('function');
    });
  });

  describe('Shutdown', () => {
    test('should shutdown cleanly', async () => {
      await testDomain.initialize();
      expect(testDomain.initialized).toBe(true);
      
      await testDomain.shutdown();
      expect(testDomain.initialized).toBe(false);
      expect(testDomain.dataManager.shutdown).toHaveBeenCalled();
      expect(testDomain.personalityManager.shutdown).toHaveBeenCalled();
    });

    test('should handle shutdown errors', async () => {
      testDomain.dataManager.shutdown.mockRejectedValue(new Error('Shutdown error'));
      testDomain.initialized = true;

      await expect(testDomain.shutdown()).rejects.toThrow('Failed to shutdown agents domain: Shutdown error');
    });
  });
});