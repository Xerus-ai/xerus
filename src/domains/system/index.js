/**
 * System Domain - Main Export
 * System Management & Infrastructure Domain
 * 
 * This domain handles:
 * - Memory management and optimization
 * - Performance monitoring and metrics  
 * - AI provider management
 * - System health and diagnostics
 * - Resource allocation and cleanup
 */

// Import existing services to be integrated
const { memoryManager } = require('../conversation/memory-manager.js');
const { AIProviderManager } = require('../ai/ai-provider-manager.js');

// Create AI Provider Manager instance
const aiProviderManager = new AIProviderManager();

// Create domain interface
class SystemDomain {
  constructor() {
    this.memoryManager = memoryManager;
    this.aiProviderManager = aiProviderManager;
    this.initialized = false;
  }

  /**
   * Initialize the system domain
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize memory manager
      if (this.memoryManager && !this.memoryManager.initialized) {
        await this.memoryManager.initialize();
      }

      // Initialize performance monitor
      // if (this.performanceMonitor && !this.performanceMonitor.initialized) {

      // Initialize AI provider manager
      if (this.aiProviderManager && !this.aiProviderManager.initialized) {
        await this.aiProviderManager.initialize();
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize system domain: ${error.message}`);
    }
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    if (!this.memoryManager) {
      return {
        available: false,
        error: 'Memory manager not available'
      };
    }

    return this.memoryManager.getMemoryStats();
  }

  /**
   * Get system health status
   */
  getHealthStatus() {
    const status = {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: Date.now(),
      memory: { available: false },
      performance: { available: false }
    };

    if (this.memoryManager) {
      status.memory = this.memoryManager.getHealthStatus();
    }


    // Determine overall status
    if (!this.memoryManager) {
      status.status = 'unknown';
    }

    return status;
  }

  /**
   * Force memory cleanup
   */
  async forceCleanup(severity = 'moderate') {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.memoryManager) {
      return await this.memoryManager.forceCleanup(severity);
    }

    throw new Error('Memory manager not available');
  }

  /**
   * Toggle cleanup strategy
   */
  toggleCleanupStrategy(strategyName, enabled) {
    if (this.memoryManager) {
      return this.memoryManager.toggleCleanupStrategy(strategyName, enabled);
    }

    throw new Error('Memory manager not available');
  }

  /**
   * Reset system statistics
   */
  resetStats() {
    if (this.memoryManager) {
      this.memoryManager.resetStats();
    }
    
    // TODO: Implement performance monitor
    // if (this.performanceMonitor) {
    //   this.performanceMonitor.resetMetrics();
    // }
  }

  /**
   * Get memory optimization recommendations
   */
  getOptimizationRecommendations() {
    if (!this.memoryManager) {
      return [];
    }

    return this.memoryManager.getOptimizationRecommendations();
  }

  /**
   * Configure memory limits
   */
  configureMemoryLimits(config) {
    if (this.memoryManager) {
      return this.memoryManager.updateConfig(config);
    }

    throw new Error('Memory manager not available');
  }

  // === AI Provider Manager Methods ===

  /**
   * Select optimal AI provider
   */
  async selectOptimalProvider(options = {}) {
    if (!this.aiProviderManager) {
      throw new Error('AI provider manager not available');
    }

    return await this.aiProviderManager.selectOptimalProvider(options);
  }

  /**
   * Get AI provider status
   */
  getProviderStatus() {
    if (!this.aiProviderManager) {
      return {
        available: false,
        error: 'AI provider manager not available'
      };
    }

    return this.aiProviderManager.getProviderStatus();
  }

  /**
   * Get AI provider metrics
   */
  getProviderMetrics() {
    if (!this.aiProviderManager) {
      return {
        available: false,
        error: 'AI provider manager not available'
      };
    }

    return this.aiProviderManager.getProviderMetrics();
  }

  /**
   * Get AI provider costs
   */
  getProviderCosts() {
    if (!this.aiProviderManager) {
      return {
        available: false,
        error: 'AI provider manager not available'
      };
    }

    return this.aiProviderManager.getProviderCosts();
  }

  // === Performance Monitor Methods ===

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      available: false,
      error: 'Performance monitor not implemented yet'
    };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    return {
      available: false,
      error: 'Performance monitor not implemented yet'
    };
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    return {
      available: false,
      error: 'Performance monitor not implemented yet'
    };
  }

  /**
   * Run performance benchmark
   */
  async runBenchmark(name, operation, iterations = 100) {
    if (!this.initialized) {
      await this.initialize();
    }

    // TODO: Implement performance monitor
    throw new Error('Performance monitor not available - feature not implemented yet');
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    // TODO: Implement performance monitor
    // if (this.performanceMonitor) {
    //   this.performanceMonitor.startMonitoring();
    // }
  }

  /**
   * Stop performance monitoring
   */
  stopPerformanceMonitoring() {
    // TODO: Implement performance monitor
    // if (this.performanceMonitor) {
    //   this.performanceMonitor.stopMonitoring();
    // }
  }

  /**
   * Get domain status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      memoryManager: {
        available: !!this.memoryManager,
        initialized: this.memoryManager?.initialized || false,
        monitoring: this.memoryManager?.config?.monitoringEnabled || false,
        memoryLimit: this.memoryManager?.config?.memoryLimit || 0,
        peakMemory: this.memoryManager?.memoryStats?.peakMemory || 0
      },
      performanceMonitor: {
        available: !!this.performanceMonitor,
        initialized: this.performanceMonitor?.initialized || false,
        monitoring: this.performanceMonitor?.config?.monitoringEnabled || false,
        sampleInterval: this.performanceMonitor?.config?.sampleInterval || 0,
        historySize: this.performanceMonitor?.config?.historySize || 0
      },
      aiProviderManager: {
        available: !!this.aiProviderManager,
        initialized: this.aiProviderManager?.initialized || false,
        defaultProvider: this.aiProviderManager?.config?.defaultProvider || 'openai',
        fallbackEnabled: this.aiProviderManager?.config?.fallbackEnabled || false,
        costTracking: this.aiProviderManager?.config?.costTrackingEnabled || false
      }
    };
  }

  /**
   * Shutdown the system domain
   */
  async shutdown() {
    try {
      // TODO: Implement performance monitor
      // if (this.performanceMonitor) {
      //   await this.performanceMonitor.shutdown();
      // }

      if (this.memoryManager) {
        await this.memoryManager.shutdown();
      }

      if (this.aiProviderManager) {
        await this.aiProviderManager.shutdown();
      }

      this.initialized = false;
    } catch (error) {
      throw new Error(`Failed to shutdown system domain: ${error.message}`);
    }
  }
}

// Create singleton instance
const systemDomain = new SystemDomain();

// Export domain interface and individual services
module.exports = {
  systemDomain,
  SystemDomain,
  
  // Re-export individual services for backward compatibility
  memoryManager,
  // performanceMonitor, // TODO: Implement performance monitor
  aiProviderManager,
  
  // Memory Management Convenience Functions
  getMemoryStats() {
    return systemDomain.getMemoryStats();
  },
  
  getHealthStatus() {
    return systemDomain.getHealthStatus();
  },
  
  async forceCleanup(severity) {
    return await systemDomain.forceCleanup(severity);
  },
  
  toggleCleanupStrategy(strategyName, enabled) {
    return systemDomain.toggleCleanupStrategy(strategyName, enabled);
  },
  
  resetStats() {
    return systemDomain.resetStats();
  },
  
  getOptimizationRecommendations() {
    return systemDomain.getOptimizationRecommendations();
  },
  
  configureMemoryLimits(config) {
    return systemDomain.configureMemoryLimits(config);
  },

  // Performance Monitoring Convenience Functions (TODO: Implement performance monitor)
  getPerformanceMetrics() {
    return systemDomain.getPerformanceMetrics();
  },
  
  getPerformanceSummary() {
    return systemDomain.getPerformanceSummary();
  },
  
  generatePerformanceReport() {
    return systemDomain.generatePerformanceReport();
  },
  
  async runBenchmark(name, operation, iterations) {
    return await systemDomain.runBenchmark(name, operation, iterations);
  },
  
  startPerformanceMonitoring() {
    return systemDomain.startPerformanceMonitoring();
  },
  
  stopPerformanceMonitoring() {
    return systemDomain.stopPerformanceMonitoring();
  },

  // AI Provider Manager Convenience Functions
  async selectOptimalProvider(options) {
    return await systemDomain.selectOptimalProvider(options);
  },
  
  getProviderStatus() {
    return systemDomain.getProviderStatus();
  },
  
  getProviderMetrics() {
    return systemDomain.getProviderMetrics();
  },
  
  getProviderCosts() {
    return systemDomain.getProviderCosts();
  }
};