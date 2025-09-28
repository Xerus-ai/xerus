/**
 * XERUS MEMORY MANAGER
 * Memory optimization and monitoring for context management
 * 
 * Features:
 * - Memory usage monitoring
 * - Context cleanup strategies
 * - Memory limit enforcement
 * - Performance optimization
 * - Garbage collection coordination
 */

const { EventEmitter } = require('events');
const { configManager } = require('../../main/config-manager');
const os = require('os');
const { createLogger } = require('../../common/services/logger.js');

const logger = createLogger('Memory-manager');

class MemoryManager extends EventEmitter {
    constructor() {
        super();
        
        // Configuration
        this.config = {
            memoryLimit: (configManager.getNumber('MEMORY_LIMIT') || 200) * 1024 * 1024, // Convert MB to bytes
            warningThreshold: 0.8, // 80% of memory limit
            criticalThreshold: 0.95, // 95% of memory limit
            cleanupInterval: 60000, // 1 minute
            gcInterval: 300000, // 5 minutes
            monitoringEnabled: true,
            logInterval: 300000 // 5 minutes
        };
        
        // Memory tracking
        this.memoryStats = {
            heapUsed: 0,
            heapTotal: 0,
            external: 0,
            arrayBuffers: 0,
            rss: 0,
            contextMemory: 0,
            lastGC: Date.now(),
            peakMemory: 0,
            averageMemory: 0,
            memoryHistory: []
        };
        
        // Cleanup strategies
        this.cleanupStrategies = new Map();
        this.monitoringInterval = null;
        this.gcInterval = null;
        this.logInterval = null;
        this.initialized = false;
        
        this.registerDefaultCleanupStrategies();
    }

    /**
     * Initialize memory manager
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        logger.info('[MemoryManager] Initializing memory manager...');
        
        try {
            // Start monitoring if enabled
            if (this.config.monitoringEnabled) {
                this.startMonitoring();
            }
            
            // Start garbage collection interval
            this.startGCInterval();
            
            // Start logging interval
            this.startLoggingInterval();
            
            this.initialized = true;
            logger.info('[MemoryManager] Memory manager initialized');
            this.emit('initialized');
            
        } catch (error) {
            logger.error('Failed to initialize memory manager:', { error });
            throw error;
        }
    }

    /**
     * Register default cleanup strategies
     */
    registerDefaultCleanupStrategies() {
        // Context cleanup strategy
        this.cleanupStrategies.set('context', {
            priority: 1,
            description: 'Clean old context entries',
            execute: async () => {
                try {
                    const { fastContextManager } = require('../ai');
                    
                    if (fastContextManager && typeof fastContextManager.cleanup === 'function') {
                        const cleaned = await fastContextManager.cleanup();
                        logger.info(`[MemoryManager] Context cleanup: ${cleaned} entries removed`);
                        return cleaned;
                    }
                } catch (error) {
                    logger.warn('Context cleanup failed:', { error });
                }
                return 0;
            }
        });

        // Memory buffer cleanup strategy
        this.cleanupStrategies.set('buffers', {
            priority: 2,
            description: 'Clean memory buffers',
            execute: async () => {
                try {
                    // Force garbage collection if available
                    if (global.gc) {
                        global.gc();
                        logger.info('[MemoryManager] Forced garbage collection');
                        return 1;
                    }
                } catch (error) {
                    logger.warn('Buffer cleanup failed:', { error });
                }
                return 0;
            }
        });

        // Cache cleanup strategy
        this.cleanupStrategies.set('cache', {
            priority: 3,
            description: 'Clean various caches',
            execute: async () => {
                try {
                    let cleaned = 0;
                    
                    // Clear module cache for non-core modules (if safe to do so)
                    // This is generally not recommended in production
                    
                    // Clear any application-specific caches here
                    // Example: Clear screenshot cache, request cache, etc.
                    
                    logger.info(`[MemoryManager] Cache cleanup: ${cleaned} items removed`);
                    return cleaned;
                } catch (error) {
                    logger.warn('Cache cleanup failed:', { error });
                }
                return 0;
            }
        });
    }

    /**
     * Start memory monitoring
     */
    startMonitoring() {
        if (this.monitoringInterval) {
            return;
        }

        this.monitoringInterval = setInterval(() => {
            this.updateMemoryStats();
            this.checkMemoryLimits();
        }, this.config.cleanupInterval);

        logger.info('[MemoryManager] Memory monitoring started');
    }

    /**
     * Stop memory monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            logger.info('[MemoryManager] Memory monitoring stopped');
        }
    }

    /**
     * Start garbage collection interval
     */
    startGCInterval() {
        if (this.gcInterval) {
            return;
        }

        this.gcInterval = setInterval(() => {
            this.performGarbageCollection();
        }, this.config.gcInterval);

        logger.info('[MemoryManager] GC interval started');
    }

    /**
     * Stop garbage collection interval
     */
    stopGCInterval() {
        if (this.gcInterval) {
            clearInterval(this.gcInterval);
            this.gcInterval = null;
            logger.info('[MemoryManager] GC interval stopped');
        }
    }

    /**
     * Start logging interval
     */
    startLoggingInterval() {
        if (this.logInterval) {
            return;
        }

        this.logInterval = setInterval(() => {
            this.logMemoryStats();
        }, this.config.logInterval);

        logger.info('[MemoryManager] Memory logging started');
    }

    /**
     * Stop logging interval
     */
    stopLoggingInterval() {
        if (this.logInterval) {
            clearInterval(this.logInterval);
            this.logInterval = null;
            logger.info('[MemoryManager] Memory logging stopped');
        }
    }

    /**
     * Update memory statistics
     */
    updateMemoryStats() {
        const memoryUsage = process.memoryUsage();
        const systemMemory = os.totalmem();
        const freeMemory = os.freemem();

        this.memoryStats = {
            ...this.memoryStats,
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
            external: memoryUsage.external,
            arrayBuffers: memoryUsage.arrayBuffers,
            rss: memoryUsage.rss,
            systemTotal: systemMemory,
            systemFree: freeMemory,
            systemUsed: systemMemory - freeMemory,
            timestamp: Date.now()
        };

        // Update peak memory
        if (this.memoryStats.heapUsed > this.memoryStats.peakMemory) {
            this.memoryStats.peakMemory = this.memoryStats.heapUsed;
        }

        // Update memory history
        this.memoryStats.memoryHistory.push({
            timestamp: Date.now(),
            heapUsed: this.memoryStats.heapUsed,
            heapTotal: this.memoryStats.heapTotal,
            rss: this.memoryStats.rss
        });

        // Keep only last 100 entries
        if (this.memoryStats.memoryHistory.length > 100) {
            this.memoryStats.memoryHistory.shift();
        }

        // Update average memory
        if (this.memoryStats.memoryHistory.length > 0) {
            const totalMemory = this.memoryStats.memoryHistory.reduce((sum, entry) => sum + entry.heapUsed, 0);
            this.memoryStats.averageMemory = totalMemory / this.memoryStats.memoryHistory.length;
        }

        this.emit('memoryStatsUpdated', this.memoryStats);
    }

    /**
     * Check memory limits and trigger cleanup if needed
     */
    checkMemoryLimits() {
        const memoryUsage = this.memoryStats.heapUsed;
        const memoryPercent = memoryUsage / this.config.memoryLimit;

        if (memoryPercent >= this.config.criticalThreshold) {
            logger.warn(`[MemoryManager] Critical memory usage: ${(memoryPercent * 100).toFixed(1)}%`);
            this.emit('memoryWarning', {
                level: 'critical',
                usage: memoryUsage,
                percent: memoryPercent,
                limit: this.config.memoryLimit
            });
            
            // Perform emergency cleanup
            this.performEmergencyCleanup();
            
        } else if (memoryPercent >= this.config.warningThreshold) {
            logger.warn(`[MemoryManager] High memory usage: ${(memoryPercent * 100).toFixed(1)}%`);
            this.emit('memoryWarning', {
                level: 'warning',
                usage: memoryUsage,
                percent: memoryPercent,
                limit: this.config.memoryLimit
            });
            
            // Perform regular cleanup
            this.performCleanup();
        }
    }

    /**
     * Perform regular cleanup
     */
    async performCleanup() {
        logger.info('[MemoryManager] Performing regular cleanup...');
        
        const startMemory = this.memoryStats.heapUsed;
        let totalCleaned = 0;

        // Execute cleanup strategies in priority order
        const strategies = Array.from(this.cleanupStrategies.entries())
            .sort(([, a], [, b]) => a.priority - b.priority);

        for (const [name, strategy] of strategies) {
            try {
                const cleaned = await strategy.execute();
                totalCleaned += cleaned;
                logger.info(`[MemoryManager] ${name} cleanup: ${cleaned} items cleaned`);
            } catch (error) {
                logger.error(`Cleanup strategy '${name}' failed:`, { error });
            }
        }

        // Update memory stats after cleanup
        this.updateMemoryStats();
        const endMemory = this.memoryStats.heapUsed;
        const memoryFreed = startMemory - endMemory;

        logger.info(`[MemoryManager] Cleanup completed: ${totalCleaned} items, ${memoryFreed} bytes freed`);
        
        this.emit('cleanupCompleted', {
            itemsCleaned: totalCleaned,
            memoryFreed,
            startMemory,
            endMemory
        });
    }

    /**
     * Perform emergency cleanup
     */
    async performEmergencyCleanup() {
        logger.warn('[MemoryManager] Performing emergency cleanup...');
        
        // Perform regular cleanup first
        await this.performCleanup();
        
        // Force garbage collection
        if (global.gc) {
            global.gc();
            logger.info('[MemoryManager] Emergency GC performed');
        }
        
        // Additional emergency measures could be added here
        // such as clearing larger caches, reducing buffer sizes, etc.
        
        this.emit('emergencyCleanupCompleted');
    }

    /**
     * Perform garbage collection
     */
    performGarbageCollection() {
        if (global.gc) {
            const beforeMemory = process.memoryUsage().heapUsed;
            global.gc();
            const afterMemory = process.memoryUsage().heapUsed;
            const freed = beforeMemory - afterMemory;
            
            this.memoryStats.lastGC = Date.now();
            
            logger.debug(`[MemoryManager] GC performed: ${freed} bytes freed`);
            
            this.emit('garbageCollectionCompleted', {
                memoryFreed: freed,
                beforeMemory,
                afterMemory
            });
        } else {
            logger.debug('[MemoryManager] GC not available');
        }
    }

    /**
     * Log current memory statistics
     */
    logMemoryStats() {
        const stats = this.getMemoryStats();
        const memoryMB = Math.round(stats.heapUsed / 1024 / 1024);
        const peakMB = Math.round(stats.peakMemory / 1024 / 1024);
        const avgMB = Math.round(stats.averageMemory / 1024 / 1024);
        const limitMB = Math.round(this.config.memoryLimit / 1024 / 1024);
        const usagePercent = ((stats.heapUsed / this.config.memoryLimit) * 100).toFixed(1);

        logger.info(`[MemoryManager] Memory: ${memoryMB}MB/${limitMB}MB (${usagePercent}%), Peak: ${peakMB}MB, Avg: ${avgMB}MB`);
    }

    /**
     * Register a custom cleanup strategy
     * @param {string} name - Strategy name
     * @param {Object} strategy - Strategy configuration
     */
    registerCleanupStrategy(name, strategy) {
        if (!strategy.execute || typeof strategy.execute !== 'function') {
            throw new Error('Cleanup strategy must have an execute function');
        }

        this.cleanupStrategies.set(name, {
            priority: strategy.priority || 999,
            description: strategy.description || 'Custom cleanup strategy',
            execute: strategy.execute
        });

        logger.info(`[MemoryManager] Registered cleanup strategy: ${name}`);
    }

    /**
     * Unregister a cleanup strategy
     * @param {string} name - Strategy name
     */
    unregisterCleanupStrategy(name) {
        if (this.cleanupStrategies.has(name)) {
            this.cleanupStrategies.delete(name);
            logger.info(`[MemoryManager] Unregistered cleanup strategy: ${name}`);
        }
    }

    /**
     * Get current memory statistics
     * @returns {Object} Memory statistics
     */
    getMemoryStats() {
        return { ...this.memoryStats };
    }

    /**
     * Get memory configuration
     * @returns {Object} Memory configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Update memory configuration
     * @param {Object} updates - Configuration updates
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        logger.info('[MemoryManager] Configuration updated');
        this.emit('configUpdated', this.config);
    }

    /**
     * Get cleanup strategies
     * @returns {Array} Cleanup strategies
     */
    getCleanupStrategies() {
        return Array.from(this.cleanupStrategies.entries()).map(([name, strategy]) => ({
            name,
            priority: strategy.priority,
            description: strategy.description
        }));
    }

    /**
     * Force immediate cleanup
     */
    async forceCleanup() {
        logger.info('[MemoryManager] Force cleanup requested');
        await this.performCleanup();
    }

    /**
     * Force immediate garbage collection
     */
    forceGarbageCollection() {
        logger.info('[MemoryManager] Force GC requested');
        this.performGarbageCollection();
    }

    /**
     * Get memory health score
     * @returns {number} Health score (0-100)
     */
    getHealthScore() {
        const memoryPercent = this.memoryStats.heapUsed / this.config.memoryLimit;
        
        if (memoryPercent >= this.config.criticalThreshold) {
            return 0; // Critical
        } else if (memoryPercent >= this.config.warningThreshold) {
            return 30; // Warning
        } else if (memoryPercent >= 0.6) {
            return 70; // Fair
        } else {
            return 100; // Good
        }
    }

    /**
     * Shutdown memory manager
     */
    async shutdown() {
        logger.info('[MemoryManager] Shutting down memory manager...');
        
        this.stopMonitoring();
        this.stopGCInterval();
        this.stopLoggingInterval();
        
        // Perform final cleanup
        await this.performCleanup();
        
        this.initialized = false;
        this.emit('shutdown');
        
        logger.info('[MemoryManager] Memory manager shutdown completed');
    }
}

// Export singleton instance
const memoryManager = new MemoryManager();

module.exports = {
    memoryManager,
    MemoryManager
};