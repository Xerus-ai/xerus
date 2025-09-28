/**
 * XERUS PERFORMANCE MONITOR
 * Performance monitoring and optimization for context management
 * 
 * Features:
 * - Real-time performance metrics
 * - Context retrieval optimization
 * - Performance alerts and recommendations
 * - Bottleneck detection
 * - System resource monitoring
 */

const { EventEmitter } = require('events');
const { configManager } = require('../../main/config-manager');
const os = require('os');
const { performance } = require('perf_hooks');
const { createLogger } = require('../../common/services/logger.js');

const logger = createLogger('Performance-monitor');

class PerformanceMonitor extends EventEmitter {
    constructor() {
        super();
        
        // Configuration
        this.config = {
            monitoringEnabled: true,
            sampleInterval: 5000, // 5 seconds
            alertThresholds: {
                contextRetrievalTime: 100, // ms
                memoryUsagePercent: 80,
                cpuUsagePercent: 70,
                cacheHitRate: 60 // percent
            },
            historySize: 100,
            reportInterval: 300000 // 5 minutes
        };
        
        // Performance metrics
        this.metrics = {
            contextRetrieval: {
                totalOperations: 0,
                totalTime: 0,
                averageTime: 0,
                minTime: Infinity,
                maxTime: 0,
                recentTimes: [],
                slowOperations: 0
            },
            contextAddition: {
                totalOperations: 0,
                totalTime: 0,
                averageTime: 0,
                minTime: Infinity,
                maxTime: 0,
                recentTimes: [],
                slowOperations: 0
            },
            cachePerformance: {
                hits: 0,
                misses: 0,
                hitRate: 0,
                totalRequests: 0
            },
            systemResources: {
                cpuUsage: 0,
                memoryUsage: 0,
                memoryPercent: 0,
                loadAverage: [0, 0, 0],
                freeMemory: 0,
                totalMemory: 0
            },
            alerts: [],
            recommendations: []
        };
        
        // Performance history
        this.performanceHistory = [];
        this.benchmarkResults = new Map();
        
        // Monitoring state
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.reportInterval = null;
        
        this.initialize();
    }

    /**
     * Initialize performance monitor
     */
    initialize() {
        logger.info('[PerformanceMonitor] Initializing performance monitor...');
        
        // Set up event listeners for context manager
        this.setupContextManagerListeners();
        
        // Set up system monitoring
        this.setupSystemMonitoring();
        
        // Set up performance reporting
        this.setupPerformanceReporting();
        
        logger.info('[PerformanceMonitor] Performance monitor initialized');
        this.emit('initialized');
    }

    /**
     * Set up context manager event listeners
     */
    setupContextManagerListeners() {
        try {
            const { fastContextManager } = require('../ai/fast-context-manager');
            
            // Monitor context addition performance
            fastContextManager.on('contextAdded', (data) => {
                this.recordContextAddition(data.processingTime);
            });
            
            // Monitor context retrieval performance
            fastContextManager.on('contextRetrieved', (data) => {
                this.recordContextRetrieval(data.retrievalTime, data.fromCache);
            });
            
            // Monitor performance updates
            fastContextManager.on('performanceUpdate', (data) => {
                this.updateSystemMetrics(data);
            });
            
            logger.info('[PerformanceMonitor] Context manager listeners set up');
        } catch (error) {
            logger.warn('Could not set up context manager listeners:', { error });
        }
    }

    /**
     * Start monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) {
            logger.info('[PerformanceMonitor] Already monitoring');
            return;
        }
        
        this.isMonitoring = true;
        
        // Start system monitoring
        this.monitoringInterval = setInterval(() => {
            this.updateSystemResources();
            this.analyzePerformance();
            this.generateRecommendations();
        }, this.config.sampleInterval);
        
        logger.info('[PerformanceMonitor] Monitoring started');
        this.emit('monitoringStarted');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            logger.info('[PerformanceMonitor] Not currently monitoring');
            return;
        }
        
        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        logger.info('[PerformanceMonitor] Monitoring stopped');
        this.emit('monitoringStopped');
    }

    /**
     * Record context addition performance
     * @param {number} processingTime - Processing time in milliseconds
     */
    recordContextAddition(processingTime) {
        const metrics = this.metrics.contextAddition;
        
        metrics.totalOperations++;
        metrics.totalTime += processingTime;
        metrics.averageTime = metrics.totalTime / metrics.totalOperations;
        
        if (processingTime < metrics.minTime) {
            metrics.minTime = processingTime;
        }
        
        if (processingTime > metrics.maxTime) {
            metrics.maxTime = processingTime;
        }
        
        // Track recent times
        metrics.recentTimes.push(processingTime);
        if (metrics.recentTimes.length > this.config.historySize) {
            metrics.recentTimes.shift();
        }
        
        // Count slow operations
        if (processingTime > 50) { // 50ms threshold for context addition
            metrics.slowOperations++;
        }
        
        this.emit('contextAdditionRecorded', {
            processingTime,
            averageTime: metrics.averageTime,
            isSlowOperation: processingTime > 50
        });
    }

    /**
     * Record context retrieval performance
     * @param {number} retrievalTime - Retrieval time in milliseconds
     * @param {boolean} fromCache - Whether retrieved from cache
     */
    recordContextRetrieval(retrievalTime, fromCache) {
        const metrics = this.metrics.contextRetrieval;
        
        metrics.totalOperations++;
        metrics.totalTime += retrievalTime;
        metrics.averageTime = metrics.totalTime / metrics.totalOperations;
        
        if (retrievalTime < metrics.minTime) {
            metrics.minTime = retrievalTime;
        }
        
        if (retrievalTime > metrics.maxTime) {
            metrics.maxTime = retrievalTime;
        }
        
        // Track recent times
        metrics.recentTimes.push(retrievalTime);
        if (metrics.recentTimes.length > this.config.historySize) {
            metrics.recentTimes.shift();
        }
        
        // Count slow operations
        if (retrievalTime > this.config.alertThresholds.contextRetrievalTime) {
            metrics.slowOperations++;
        }
        
        // Update cache performance
        const cacheMetrics = this.metrics.cachePerformance;
        cacheMetrics.totalRequests++;
        
        if (fromCache) {
            cacheMetrics.hits++;
        } else {
            cacheMetrics.misses++;
        }
        
        cacheMetrics.hitRate = (cacheMetrics.hits / cacheMetrics.totalRequests) * 100;
        
        this.emit('contextRetrievalRecorded', {
            retrievalTime,
            fromCache,
            averageTime: metrics.averageTime,
            cacheHitRate: cacheMetrics.hitRate,
            isSlowOperation: retrievalTime > this.config.alertThresholds.contextRetrievalTime
        });
    }

    /**
     * Update system resource metrics
     */
    updateSystemResources() {
        const memoryUsage = process.memoryUsage();
        const systemMemory = os.totalmem();
        const freeMemory = os.freemem();
        const loadAverage = os.loadavg();
        
        // Update system metrics
        this.metrics.systemResources = {
            cpuUsage: this.calculateCPUUsage(),
            memoryUsage: memoryUsage.heapUsed,
            memoryPercent: (memoryUsage.heapUsed / systemMemory) * 100,
            loadAverage: loadAverage,
            freeMemory: freeMemory,
            totalMemory: systemMemory
        };
        
        // Add to performance history
        this.performanceHistory.push({
            timestamp: Date.now(),
            contextRetrieval: this.metrics.contextRetrieval.averageTime,
            contextAddition: this.metrics.contextAddition.averageTime,
            cacheHitRate: this.metrics.cachePerformance.hitRate,
            memoryUsage: memoryUsage.heapUsed,
            cpuUsage: this.metrics.systemResources.cpuUsage
        });
        
        // Maintain history size
        if (this.performanceHistory.length > this.config.historySize) {
            this.performanceHistory.shift();
        }
        
        this.emit('systemResourcesUpdated', this.metrics.systemResources);
    }

    /**
     * Calculate CPU usage percentage
     * @returns {number} CPU usage percentage
     */
    calculateCPUUsage() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        }
        
        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        
        return Math.max(0, 100 - (idle / total) * 100);
    }

    /**
     * Update system metrics from context manager
     * @param {Object} data - System metrics data
     */
    updateSystemMetrics(data) {
        if (data.memoryUsage) {
            this.metrics.systemResources.memoryUsage = data.memoryUsage.heapUsed;
            this.metrics.systemResources.memoryPercent = (data.memoryUsage.heapUsed / os.totalmem()) * 100;
        }
    }

    /**
     * Analyze performance and generate alerts
     */
    analyzePerformance() {
        const alerts = [];
        const thresholds = this.config.alertThresholds;
        
        // Check context retrieval time
        if (this.metrics.contextRetrieval.averageTime > thresholds.contextRetrievalTime) {
            alerts.push({
                type: 'slow_context_retrieval',
                severity: 'warning',
                message: `Context retrieval averaging ${this.metrics.contextRetrieval.averageTime.toFixed(2)}ms (threshold: ${thresholds.contextRetrievalTime}ms)`,
                timestamp: Date.now(),
                value: this.metrics.contextRetrieval.averageTime
            });
        }
        
        // Check memory usage
        if (this.metrics.systemResources.memoryPercent > thresholds.memoryUsagePercent) {
            alerts.push({
                type: 'high_memory_usage',
                severity: 'warning',
                message: `Memory usage at ${this.metrics.systemResources.memoryPercent.toFixed(1)}% (threshold: ${thresholds.memoryUsagePercent}%)`,
                timestamp: Date.now(),
                value: this.metrics.systemResources.memoryPercent
            });
        }
        
        // Check CPU usage
        if (this.metrics.systemResources.cpuUsage > thresholds.cpuUsagePercent) {
            alerts.push({
                type: 'high_cpu_usage',
                severity: 'warning',
                message: `CPU usage at ${this.metrics.systemResources.cpuUsage.toFixed(1)}% (threshold: ${thresholds.cpuUsagePercent}%)`,
                timestamp: Date.now(),
                value: this.metrics.systemResources.cpuUsage
            });
        }
        
        // Check cache hit rate
        if (this.metrics.cachePerformance.hitRate < thresholds.cacheHitRate) {
            alerts.push({
                type: 'low_cache_hit_rate',
                severity: 'info',
                message: `Cache hit rate at ${this.metrics.cachePerformance.hitRate.toFixed(1)}% (threshold: ${thresholds.cacheHitRate}%)`,
                timestamp: Date.now(),
                value: this.metrics.cachePerformance.hitRate
            });
        }
        
        // Add new alerts
        for (const alert of alerts) {
            this.metrics.alerts.push(alert);
            this.emit('performanceAlert', alert);
        }
        
        // Keep only recent alerts
        if (this.metrics.alerts.length > 50) {
            this.metrics.alerts = this.metrics.alerts.slice(-50);
        }
    }

    /**
     * Generate performance recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        
        // Context retrieval recommendations
        if (this.metrics.contextRetrieval.averageTime > 100) {
            recommendations.push({
                type: 'context_retrieval_optimization',
                priority: 'high',
                message: 'Context retrieval is slow - consider enabling caching or reducing context buffer size',
                action: 'optimize_context_retrieval'
            });
        }
        
        // Cache recommendations
        if (this.metrics.cachePerformance.hitRate < 60) {
            recommendations.push({
                type: 'cache_optimization',
                priority: 'medium',
                message: 'Low cache hit rate - consider increasing cache size or improving cache key generation',
                action: 'optimize_cache'
            });
        }
        
        // Memory recommendations
        if (this.metrics.systemResources.memoryPercent > 80) {
            recommendations.push({
                type: 'memory_optimization',
                priority: 'high',
                message: 'High memory usage - consider reducing context buffer size or enabling compression',
                action: 'optimize_memory'
            });
        }
        
        // Performance trends
        if (this.performanceHistory.length >= 10) {
            const recentHistory = this.performanceHistory.slice(-10);
            const avgRecentRetrieval = recentHistory.reduce((sum, entry) => sum + entry.contextRetrieval, 0) / recentHistory.length;
            const avgOldRetrieval = this.performanceHistory.slice(-20, -10).reduce((sum, entry) => sum + entry.contextRetrieval, 0) / 10;
            
            if (avgRecentRetrieval > avgOldRetrieval * 1.2) {
                recommendations.push({
                    type: 'performance_degradation',
                    priority: 'medium',
                    message: 'Performance degradation detected - consider cleanup or optimization',
                    action: 'investigate_degradation'
                });
            }
        }
        
        this.metrics.recommendations = recommendations;
        
        if (recommendations.length > 0) {
            this.emit('recommendationsGenerated', recommendations);
        }
    }

    /**
     * Setup system monitoring
     */
    setupSystemMonitoring() {
        if (this.config.monitoringEnabled) {
            this.startMonitoring();
        }
    }

    /**
     * Setup performance reporting
     */
    setupPerformanceReporting() {
        this.reportInterval = setInterval(() => {
            this.generatePerformanceReport();
        }, this.config.reportInterval);
        
        // Clean up on exit
        process.on('exit', () => {
            if (this.reportInterval) {
                clearInterval(this.reportInterval);
            }
        });
    }

    /**
     * Generate performance report
     */
    generatePerformanceReport() {
        const report = {
            timestamp: Date.now(),
            contextRetrieval: {
                avgTime: this.metrics.contextRetrieval.averageTime.toFixed(2) + 'ms',
                totalOps: this.metrics.contextRetrieval.totalOperations,
                slowOps: this.metrics.contextRetrieval.slowOperations,
                minTime: this.metrics.contextRetrieval.minTime.toFixed(2) + 'ms',
                maxTime: this.metrics.contextRetrieval.maxTime.toFixed(2) + 'ms'
            },
            contextAddition: {
                avgTime: this.metrics.contextAddition.averageTime.toFixed(2) + 'ms',
                totalOps: this.metrics.contextAddition.totalOperations,
                slowOps: this.metrics.contextAddition.slowOperations
            },
            cachePerformance: {
                hitRate: this.metrics.cachePerformance.hitRate.toFixed(1) + '%',
                totalRequests: this.metrics.cachePerformance.totalRequests,
                hits: this.metrics.cachePerformance.hits,
                misses: this.metrics.cachePerformance.misses
            },
            systemResources: {
                cpuUsage: this.metrics.systemResources.cpuUsage.toFixed(1) + '%',
                memoryUsage: Math.round(this.metrics.systemResources.memoryUsage / 1024 / 1024) + 'MB',
                memoryPercent: this.metrics.systemResources.memoryPercent.toFixed(1) + '%',
                loadAverage: this.metrics.systemResources.loadAverage.map(avg => avg.toFixed(2))
            },
            alerts: this.metrics.alerts.slice(-5),
            recommendations: this.metrics.recommendations
        };
        
        logger.info('[PerformanceMonitor] Performance Report:', JSON.stringify(report, null, 2));
        this.emit('performanceReport', report);
        
        return report;
    }

    /**
     * Run performance benchmark
     * @param {string} name - Benchmark name
     * @param {Function} operation - Operation to benchmark
     * @param {number} iterations - Number of iterations
     */
    async runBenchmark(name, operation, iterations = 100) {
        logger.info('Running benchmark:  ( iterations)');
        
        const times = [];
        const startTime = performance.now();
        
        for (let i = 0; i < iterations; i++) {
            const iterationStart = performance.now();
            await operation();
            const iterationEnd = performance.now();
            times.push(iterationEnd - iterationStart);
        }
        
        const endTime = performance.now();
        const totalTime = endTime - startTime;
        
        const results = {
            name,
            iterations,
            totalTime,
            averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
            minTime: Math.min(...times),
            maxTime: Math.max(...times),
            medianTime: times.sort((a, b) => a - b)[Math.floor(times.length / 2)],
            standardDeviation: this.calculateStandardDeviation(times),
            timestamp: Date.now()
        };
        
        this.benchmarkResults.set(name, results);
        
        logger.info('Benchmark completed:', {
            avgTime: results.averageTime.toFixed(2) + 'ms',
            minTime: results.minTime.toFixed(2) + 'ms',
            maxTime: results.maxTime.toFixed(2) + 'ms',
            medianTime: results.medianTime.toFixed(2) + 'ms'
        });
        
        this.emit('benchmarkCompleted', results);
        return results;
    }

    /**
     * Calculate standard deviation
     * @param {number[]} values - Array of values
     * @returns {number} Standard deviation
     */
    calculateStandardDeviation(values) {
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / squaredDiffs.length;
        return Math.sqrt(avgSquaredDiff);
    }

    /**
     * Get performance metrics
     * @returns {Object} Performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            performanceHistory: this.performanceHistory,
            benchmarkResults: Object.fromEntries(this.benchmarkResults),
            isMonitoring: this.isMonitoring
        };
    }

    /**
     * Get performance summary
     * @returns {Object} Performance summary
     */
    getPerformanceSummary() {
        return {
            contextRetrieval: {
                avgTime: this.metrics.contextRetrieval.averageTime,
                totalOps: this.metrics.contextRetrieval.totalOperations,
                slowOpsPercent: this.metrics.contextRetrieval.totalOperations > 0 ? 
                    (this.metrics.contextRetrieval.slowOperations / this.metrics.contextRetrieval.totalOperations) * 100 : 0
            },
            cachePerformance: {
                hitRate: this.metrics.cachePerformance.hitRate,
                totalRequests: this.metrics.cachePerformance.totalRequests
            },
            systemResources: {
                cpuUsage: this.metrics.systemResources.cpuUsage,
                memoryPercent: this.metrics.systemResources.memoryPercent
            },
            alertsCount: this.metrics.alerts.length,
            recommendationsCount: this.metrics.recommendations.length,
            overallHealthScore: this.calculateHealthScore()
        };
    }

    /**
     * Calculate overall health score
     * @returns {number} Health score (0-100)
     */
    calculateHealthScore() {
        let score = 100;
        
        // Deduct points for slow context retrieval
        if (this.metrics.contextRetrieval.averageTime > 100) {
            score -= 20;
        } else if (this.metrics.contextRetrieval.averageTime > 50) {
            score -= 10;
        }
        
        // Deduct points for low cache hit rate
        if (this.metrics.cachePerformance.hitRate < 60) {
            score -= 15;
        } else if (this.metrics.cachePerformance.hitRate < 80) {
            score -= 5;
        }
        
        // Deduct points for high resource usage
        if (this.metrics.systemResources.memoryPercent > 80) {
            score -= 20;
        } else if (this.metrics.systemResources.memoryPercent > 60) {
            score -= 10;
        }
        
        if (this.metrics.systemResources.cpuUsage > 80) {
            score -= 15;
        } else if (this.metrics.systemResources.cpuUsage > 60) {
            score -= 5;
        }
        
        // Deduct points for active alerts
        score -= this.metrics.alerts.length * 2;
        
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            contextRetrieval: {
                totalOperations: 0,
                totalTime: 0,
                averageTime: 0,
                minTime: Infinity,
                maxTime: 0,
                recentTimes: [],
                slowOperations: 0
            },
            contextAddition: {
                totalOperations: 0,
                totalTime: 0,
                averageTime: 0,
                minTime: Infinity,
                maxTime: 0,
                recentTimes: [],
                slowOperations: 0
            },
            cachePerformance: {
                hits: 0,
                misses: 0,
                hitRate: 0,
                totalRequests: 0
            },
            systemResources: {
                cpuUsage: 0,
                memoryUsage: 0,
                memoryPercent: 0,
                loadAverage: [0, 0, 0],
                freeMemory: 0,
                totalMemory: 0
            },
            alerts: [],
            recommendations: []
        };
        
        this.performanceHistory = [];
        this.benchmarkResults.clear();
        
        logger.info('[PerformanceMonitor] Metrics reset');
        this.emit('metricsReset');
    }
}

// Export singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = {
    performanceMonitor,
    PerformanceMonitor
};