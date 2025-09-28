/**
 * System Domain Tests
 * Test suite for system management domain
 */

const { systemDomain, SystemDomain, performanceMonitor, aiProviderManager } = require('../../../src/domains/system/index.js');

describe('SystemDomain', () => {
  let domain;

  beforeEach(() => {
    domain = new SystemDomain();
  });

  afterEach(async () => {
    if (domain.initialized) {
      await domain.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await domain.initialize();
      expect(domain.initialized).toBe(true);
    });

    test('should not initialize twice', async () => {
      await domain.initialize();
      await domain.initialize(); // Should not throw
      expect(domain.initialized).toBe(true);
    });

    test('should have memory manager available', () => {
      expect(domain.memoryManager).toBeDefined();
    });

    test('should have performance monitor available', () => {
      expect(domain.performanceMonitor).toBeDefined();
    });

    test('should have AI provider manager available', () => {
      expect(domain.aiProviderManager).toBeDefined();
    });
  });

  describe('Memory Management', () => {
    beforeEach(async () => {
      await domain.initialize();
    });

    test('should get memory statistics', () => {
      const stats = domain.getMemoryStats();
      expect(stats).toBeDefined();
      
      if (stats.available !== false) {
        expect(stats).toHaveProperty('heapUsed');
        expect(stats).toHaveProperty('heapTotal');
        expect(stats).toHaveProperty('rss');
      }
    });

    test('should get health status', () => {
      const health = domain.getHealthStatus();
      expect(health).toBeDefined();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('memory');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('timestamp');
    });

    test('should handle cleanup operations', async () => {
      // Test cleanup without throwing
      await expect(domain.forceCleanup('moderate')).resolves.toBeDefined();
    });

    test('should handle cleanup strategy toggling', () => {
      // Should not throw
      expect(() => {
        domain.toggleCleanupStrategy('testStrategy', true);
      }).not.toThrow();
    });

    test('should reset statistics', () => {
      // Should not throw
      expect(() => {
        domain.resetStats();
      }).not.toThrow();
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await domain.initialize();
    });

    test('should get performance metrics', () => {
      const metrics = domain.getPerformanceMetrics();
      expect(metrics).toBeDefined();
      
      if (metrics.available !== false) {
        expect(metrics).toHaveProperty('contextRetrieval');
      }
    });

    test('should get performance summary', () => {
      const summary = domain.getPerformanceSummary();
      expect(summary).toBeDefined();
      
      if (summary.available !== false) {
        expect(summary).toHaveProperty('overall');
      }
    });

    test('should generate performance report', () => {
      const report = domain.generatePerformanceReport();
      expect(report).toBeDefined();
      
      if (report.available !== false) {
        expect(report).toHaveProperty('summary');
      }
    });

    test('should handle performance monitoring controls', () => {
      // Should not throw
      expect(() => {
        domain.startPerformanceMonitoring();
        domain.stopPerformanceMonitoring();
      }).not.toThrow();
    });

    test('should handle benchmark operations', async () => {
      const mockOperation = () => Promise.resolve('test');
      
      await expect(
        domain.runBenchmark('test-benchmark', mockOperation, 5)
      ).resolves.toBeDefined();
    });

    test('should handle errors when performance monitor not available', () => {
      const domainWithoutPerf = new SystemDomain();
      domainWithoutPerf.performanceMonitor = null;

      const metrics = domainWithoutPerf.getPerformanceMetrics();
      expect(metrics.available).toBe(false);
      expect(metrics.error).toBeDefined();

      const summary = domainWithoutPerf.getPerformanceSummary();
      expect(summary.available).toBe(false);
      expect(summary.error).toBeDefined();
    });
  });

  describe('AI Provider Management', () => {
    beforeEach(async () => {
      await domain.initialize();
    });

    test('should select optimal provider', async () => {
      const options = {
        requestType: 'conversation',
        userMessage: 'Hello',
        preferredProvider: 'openai'
      };

      await expect(
        domain.selectOptimalProvider(options)
      ).resolves.toBeDefined();
    });

    test('should get provider status', () => {
      const status = domain.getProviderStatus();
      expect(status).toBeDefined();
      
      if (status.available !== false) {
        expect(status).toHaveProperty('providers');
      }
    });

    test('should get provider metrics', () => {
      const metrics = domain.getProviderMetrics();
      expect(metrics).toBeDefined();
      
      if (metrics.available !== false) {
        expect(metrics).toHaveProperty('total');
      }
    });

    test('should get provider costs', () => {
      const costs = domain.getProviderCosts();
      expect(costs).toBeDefined();
      
      if (costs.available !== false) {
        expect(costs).toHaveProperty('totalCost');
      }
    });

    test('should handle errors when AI provider manager not available', () => {
      const domainWithoutAI = new SystemDomain();
      domainWithoutAI.aiProviderManager = null;

      const status = domainWithoutAI.getProviderStatus();
      expect(status.available).toBe(false);
      expect(status.error).toBeDefined();

      const metrics = domainWithoutAI.getProviderMetrics();
      expect(metrics.available).toBe(false);
      expect(metrics.error).toBeDefined();

      const costs = domainWithoutAI.getProviderCosts();
      expect(costs.available).toBe(false);
      expect(costs.error).toBeDefined();
    });

    test('should throw error when selecting provider without AI manager', async () => {
      const domainWithoutAI = new SystemDomain();
      domainWithoutAI.aiProviderManager = null;

      await expect(
        domainWithoutAI.selectOptimalProvider({})
      ).rejects.toThrow('AI provider manager not available');
    });
  });

  describe('Configuration', () => {
    beforeEach(async () => {
      await domain.initialize();
    });

    test('should provide optimization recommendations', () => {
      const recommendations = domain.getOptimizationRecommendations();
      expect(Array.isArray(recommendations)).toBe(true);
    });

    test('should configure memory limits', () => {
      const config = {
        memoryLimit: 256 * 1024 * 1024, // 256 MB
        warningThreshold: 0.8
      };

      expect(() => {
        domain.configureMemoryLimits(config);
      }).not.toThrow();
    });
  });

  describe('Status and Monitoring', () => {
    test('should provide domain status', () => {
      const status = domain.getStatus();
      expect(status).toBeDefined();
      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('memoryManager');
      expect(status).toHaveProperty('performanceMonitor');
      expect(status).toHaveProperty('aiProviderManager');
      expect(status.memoryManager).toHaveProperty('available');
      expect(status.performanceMonitor).toHaveProperty('available');
      expect(status.aiProviderManager).toHaveProperty('available');
    });

    test('should show uninitialized status initially', () => {
      const status = domain.getStatus();
      expect(status.initialized).toBe(false);
    });

    test('should show initialized status after initialization', async () => {
      await domain.initialize();
      const status = domain.getStatus();
      expect(status.initialized).toBe(true);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown cleanly', async () => {
      await domain.initialize();
      await domain.shutdown();
      expect(domain.initialized).toBe(false);
    });

    test('should handle shutdown when not initialized', async () => {
      await expect(domain.shutdown()).resolves.toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle missing memory manager gracefully', () => {
      const domainWithoutMemory = new SystemDomain();
      domainWithoutMemory.memoryManager = null;

      const stats = domainWithoutMemory.getMemoryStats();
      expect(stats.available).toBe(false);
      expect(stats.error).toBeDefined();
    });

    test('should handle health check without memory manager', () => {
      const domainWithoutMemory = new SystemDomain();
      domainWithoutMemory.memoryManager = null;

      const health = domainWithoutMemory.getHealthStatus();
      expect(health.status).toBe('unknown');
      expect(health.memory.available).toBe(false);
    });
  });
});

describe('SystemDomain Singleton', () => {
  test('should provide singleton instance', () => {
    expect(systemDomain).toBeInstanceOf(SystemDomain);
  });

  test('should provide convenience functions', () => {
    const { 
      getMemoryStats, 
      getHealthStatus, 
      forceCleanup,
      toggleCleanupStrategy,
      resetStats,
      getOptimizationRecommendations,
      configureMemoryLimits,
      getPerformanceMetrics,
      getPerformanceSummary,
      generatePerformanceReport,
      runBenchmark,
      startPerformanceMonitoring,
      stopPerformanceMonitoring,
      selectOptimalProvider,
      getProviderStatus,
      getProviderMetrics,
      getProviderCosts
    } = require('../../../src/domains/system/index.js');

    expect(typeof getMemoryStats).toBe('function');
    expect(typeof getHealthStatus).toBe('function');
    expect(typeof forceCleanup).toBe('function');
    expect(typeof toggleCleanupStrategy).toBe('function');
    expect(typeof resetStats).toBe('function');
    expect(typeof getOptimizationRecommendations).toBe('function');
    expect(typeof configureMemoryLimits).toBe('function');
    expect(typeof getPerformanceMetrics).toBe('function');
    expect(typeof getPerformanceSummary).toBe('function');
    expect(typeof generatePerformanceReport).toBe('function');
    expect(typeof runBenchmark).toBe('function');
    expect(typeof startPerformanceMonitoring).toBe('function');
    expect(typeof stopPerformanceMonitoring).toBe('function');
    expect(typeof selectOptimalProvider).toBe('function');
    expect(typeof getProviderStatus).toBe('function');
    expect(typeof getProviderMetrics).toBe('function');
    expect(typeof getProviderCosts).toBe('function');
  });

  test('should provide backward compatibility exports', () => {
    const { memoryManager, performanceMonitor, aiProviderManager } = require('../../../src/domains/system/index.js');
    expect(memoryManager).toBeDefined();
    expect(performanceMonitor).toBeDefined();
    expect(aiProviderManager).toBeDefined();
  });
});