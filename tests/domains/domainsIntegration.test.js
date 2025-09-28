/**
 * Domains Integration Test Suite
 * Test unified domain orchestration and cross-domain interactions
 */

const { domainsManager, DomainsManager } = require('../../src/domains/index.js');

describe('DomainsManager Integration', () => {
  let manager;

  beforeEach(() => {
    manager = new DomainsManager();
  });

  afterEach(async () => {
    if (manager.initialized) {
      // Mock shutdown to avoid actual service shutdowns in tests
      manager.initialized = false;
    }
  });

  describe('Domain Availability', () => {
    test('should have all required domains available', () => {
      expect(manager.agents).toBeDefined();
      expect(manager.knowledge).toBeDefined();
      expect(manager.tools).toBeDefined();
      expect(manager.conversation).toBeDefined();
      expect(manager.system).toBeDefined();
    });

    test('should provide domain access through properties', () => {
      expect(manager.agents).toBe(manager.agents);
      expect(manager.knowledge).toBe(manager.knowledge);
      expect(manager.tools).toBe(manager.tools);
      expect(manager.conversation).toBe(manager.conversation);
      expect(manager.system).toBe(manager.system);
    });
  });

  describe('Initialization Order', () => {
    test('should initialize domains in correct dependency order', async () => {
      const initializationOrder = [];
      
      // Mock domain initialization to track order
      manager.system.initialize = jest.fn().mockImplementation(() => {
        initializationOrder.push('system');
        return Promise.resolve();
      });
      
      manager.agents.initialize = jest.fn().mockImplementation(() => {
        initializationOrder.push('agents');
        return Promise.resolve();
      });
      
      manager.knowledge.initialize = jest.fn().mockImplementation(() => {
        initializationOrder.push('knowledge');
        return Promise.resolve();
      });
      
      manager.tools.initialize = jest.fn().mockImplementation(() => {
        initializationOrder.push('tools');
        return Promise.resolve();
      });
      
      manager.conversation.initialize = jest.fn().mockImplementation(() => {
        initializationOrder.push('conversation');
        return Promise.resolve();
      });

      await manager.initialize();
      
      expect(initializationOrder).toEqual(['system', 'agents', 'knowledge', 'tools', 'conversation']);
      expect(manager.initialized).toBe(true);
    });

    test('should not initialize twice', async () => {
      // Mock all domains to track calls
      Object.keys(manager).forEach(domain => {
        if (manager[domain] && typeof manager[domain].initialize === 'function') {
          manager[domain].initialize = jest.fn().mockResolvedValue();
        }
      });

      await manager.initialize();
      expect(manager.initialized).toBe(true);

      // Second initialization should not call domain initialize methods
      await manager.initialize();
      
      // Verify no additional calls were made
      expect(manager.system.initialize).toHaveBeenCalledTimes(1);
      expect(manager.agents.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('Status Reporting', () => {
    test('should provide comprehensive status from all domains', () => {
      // Mock all domains to return status
      manager.system.getStatus = jest.fn().mockReturnValue({
        initialized: true,
        memoryManager: { available: true }
      });
      
      manager.agents.getStatus = jest.fn().mockReturnValue({
        initialized: true,
        personalityManager: { available: true },
        dataManager: { available: true }
      });
      
      manager.knowledge.getStatus = jest.fn().mockReturnValue({
        initialized: true,
        ragSystem: { available: true, documentCount: 5 }
      });
      
      manager.tools.getStatus = jest.fn().mockReturnValue({
        initialized: true,
        orchestrator: { available: true }
      });
      
      manager.conversation.getStatus = jest.fn().mockReturnValue({
        initialized: true,
        enhancedAsk: { available: true }
      });

      const status = manager.getStatus();
      
      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('system');
      expect(status).toHaveProperty('agents');
      expect(status).toHaveProperty('knowledge');
      expect(status).toHaveProperty('tools');
      expect(status).toHaveProperty('conversation');
      
      expect(status.system.memoryManager.available).toBe(true);
      expect(status.agents.personalityManager.available).toBe(true);
      expect(status.knowledge.ragSystem.documentCount).toBe(5);
    });
  });

  describe('Shutdown Process', () => {
    test('should shutdown domains in reverse order', async () => {
      const shutdownOrder = [];
      
      // Mock domain shutdown to track order
      manager.conversation.shutdown = jest.fn().mockImplementation(() => {
        shutdownOrder.push('conversation');
        return Promise.resolve();
      });
      
      manager.tools.shutdown = jest.fn().mockImplementation(() => {
        shutdownOrder.push('tools');
        return Promise.resolve();
      });
      
      manager.knowledge.shutdown = jest.fn().mockImplementation(() => {
        shutdownOrder.push('knowledge');
        return Promise.resolve();
      });
      
      manager.agents.shutdown = jest.fn().mockImplementation(() => {
        shutdownOrder.push('agents');
        return Promise.resolve();
      });
      
      manager.system.shutdown = jest.fn().mockImplementation(() => {
        shutdownOrder.push('system');
        return Promise.resolve();
      });

      manager.initialized = true;
      await manager.shutdown();
      
      expect(shutdownOrder).toEqual(['conversation', 'tools', 'knowledge', 'agents', 'system']);
      expect(manager.initialized).toBe(false);
    });

    test('should handle shutdown errors gracefully', async () => {
      manager.tools.shutdown = jest.fn().mockRejectedValue(new Error('Tools shutdown error'));
      
      manager.conversation.shutdown = jest.fn().mockResolvedValue();
      manager.knowledge.shutdown = jest.fn().mockResolvedValue();
      manager.agents.shutdown = jest.fn().mockResolvedValue();
      manager.system.shutdown = jest.fn().mockResolvedValue();

      manager.initialized = true;
      
      await expect(manager.shutdown()).rejects.toThrow('Failed to shutdown domains: Tools shutdown error');
    });
  });

  describe('Error Handling', () => {
    test('should handle initialization errors', async () => {
      manager.agents.initialize = jest.fn().mockRejectedValue(new Error('Agents init error'));
      
      await expect(manager.initialize()).rejects.toThrow('Failed to initialize domains: Agents init error');
      expect(manager.initialized).toBe(false);
    });
  });
});

describe('DomainsManager Singleton', () => {
  test('should provide singleton instance', () => {
    expect(domainsManager).toBeInstanceOf(DomainsManager);
  });

  test('should provide convenience functions', () => {
    const { initializeAllDomains, getAllDomainsStatus } = require('../../src/domains/index.js');
    
    expect(typeof initializeAllDomains).toBe('function');
    expect(typeof getAllDomainsStatus).toBe('function');
  });

  test('should export individual domains', () => {
    const { 
      agentsDomain, 
      knowledgeDomain, 
      toolsDomain, 
      conversationDomain,
      systemDomain 
    } = require('../../src/domains/index.js');
    
    expect(agentsDomain).toBeDefined();
    expect(knowledgeDomain).toBeDefined();
    expect(toolsDomain).toBeDefined();
    expect(conversationDomain).toBeDefined();
    expect(systemDomain).toBeDefined();
  });

  test('should provide convenience access properties', () => {
    const { agents, knowledge, tools, conversation, system } = require('../../src/domains/index.js');
    
    expect(agents).toBeDefined();
    expect(knowledge).toBeDefined();
    expect(tools).toBeDefined();
    expect(conversation).toBeDefined();
    expect(system).toBeDefined();
  });
});