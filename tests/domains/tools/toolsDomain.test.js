/**
 * Tools Domain Test Suite
 * Comprehensive tests for backend API integration and tool management
 */

const { toolsDomain, ToolsDomain } = require('../../../src/domains/tools');

describe('Tools Domain', () => {
  let testDomain;

  beforeEach(async () => {
    testDomain = new ToolsDomain();
    // Reset any existing state - API-backed architecture
    if (testDomain.toolRegistry && testDomain.toolRegistry.toolsCache) {
      testDomain.toolRegistry.toolsCache.clear();
      testDomain.toolRegistry.schemasCache.clear();
      testDomain.toolRegistry.lastCacheUpdate = null;
    }
  });

  afterEach(async () => {
    if (testDomain && testDomain.initialized) {
      await testDomain.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should have correct initial state', () => {
      expect(testDomain.initialized).toBe(false);
      expect(testDomain.toolRegistry).toBeDefined();
      expect(testDomain.apiClient).toBeDefined();
    });

    test('should handle backend connection failure gracefully', async () => {
      // This should fail gracefully when backend is not running
      await expect(testDomain.initialize()).rejects.toThrow();
      expect(testDomain.initialized).toBe(false);
    });

    test('should not initialize twice', async () => {
      try {
        await testDomain.initialize();
        const firstInit = testDomain.initialized;
        
        await testDomain.initialize();
        
        expect(firstInit).toBe(testDomain.initialized);
      } catch (error) {
        // Expected when backend is offline
        expect(error.message).toContain('Failed to initialize tools domain');
      }
    });
  });

  describe('API Client Integration', () => {
    test('should have configured API client', () => {
      const stats = testDomain.apiClient.getStatistics();
      
      expect(stats.baseUrl).toBe('http://localhost:3000');
      expect(stats.apiVersion).toBe('v1');
      expect(stats.hasAuth).toBe(false);
      expect(stats.isGuest).toBe(false);
    });

    test('should support authentication context', () => {
      testDomain.apiClient.setAuthContext({
        token: 'test-token',
        permissions: ['authenticated'],
        isGuest: false
      });

      const stats = testDomain.apiClient.getStatistics();
      expect(stats.hasAuth).toBe(true);
      expect(stats.isGuest).toBe(false);
    });
  });

  describe('Tool Registry', () => {
    test('should have API-backed registry', () => {
      const registry = testDomain.toolRegistry;
      
      expect(registry.toolsCache).toBeDefined();
      expect(registry.schemasCache).toBeDefined();
      expect(registry.cacheTimeout).toBe(5 * 60 * 1000); // 5 minutes
      expect(registry.initialized).toBe(false);
    });

    test('should track statistics', () => {
      const stats = testDomain.toolRegistry.getStatistics();
      
      expect(stats).toHaveProperty('totalExecutions');
      expect(stats).toHaveProperty('successfulExecutions');
      expect(stats).toHaveProperty('registeredTools');
      expect(stats).toHaveProperty('apiCalls');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('initialized');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('cacheAge');
      expect(stats).toHaveProperty('apiClientStats');
    });
  });

  describe('Domain Methods', () => {
    test('should have all required methods', () => {
      expect(typeof testDomain.initialize).toBe('function');
      expect(typeof testDomain.getAvailableTools).toBe('function');
      expect(typeof testDomain.executeTool).toBe('function');
      expect(typeof testDomain.getAIFunctionSchemas).toBe('function');
      expect(typeof testDomain.registerCustomTool).toBe('function');
      expect(typeof testDomain.getStatus).toBe('function');
      expect(typeof testDomain.shutdown).toBe('function');
    });

    test('should handle getAvailableTools gracefully when offline', async () => {
      const result = await testDomain.getAvailableTools(['guest']);
      expect(Array.isArray(result)).toBe(true);
      // Should be empty array when backend is offline
    });

    test('should handle getAIFunctionSchemas gracefully when offline', async () => {
      const result = await testDomain.getAIFunctionSchemas(['authenticated']);
      expect(Array.isArray(result)).toBe(true);
      // Should be empty array when backend is offline
    });

    test('should handle tool execution gracefully when offline', async () => {
      const result = await testDomain.executeTool('test_tool', {}, { userPermissions: ['authenticated'] });
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('metadata');
      expect(result.success).toBe(false);
    });
  });

  describe('Status and Shutdown', () => {
    test('should return correct status', () => {
      const status = testDomain.getStatus();
      
      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('toolRegistry');
      expect(status.initialized).toBe(false);
      expect(status.toolRegistry.available).toBe(true);
    });

    test('should shutdown cleanly', async () => {
      await testDomain.shutdown();
      expect(testDomain.initialized).toBe(false);
    });
  });
});

// Test singleton instance
describe('Tools Domain Singleton', () => {
  test('should export singleton instance', () => {
    expect(toolsDomain).toBeDefined();
    expect(toolsDomain).toBeInstanceOf(ToolsDomain);
  });

  test('should have same reference across imports', () => {
    const { toolsDomain: secondImport } = require('../../../src/domains/tools');
    expect(toolsDomain).toBe(secondImport);
  });
});

console.log('✅ Tools Domain Tests Updated for Backend API Architecture');