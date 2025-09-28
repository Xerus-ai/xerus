/**
 * Infrastructure Domain - Main Export
 * System Infrastructure and Integration Domain
 * 
 * This domain handles:
 * - Performance monitoring and optimization
 * - Feature integration and coordination
 * - Testing infrastructure and validation
 * - System resource management
 * - Cross-service integration
 */

const { performanceMonitor, PerformanceMonitor } = require('./performance-monitor.js');
const { featureIntegrationService, FeatureIntegrationService } = require('./feature-integration.js');
const { integrationTestRunner, IntegrationTestRunner } = require('./test-integration.js');

/**
 * Infrastructure Domain
 */
class InfrastructureDomain {
    constructor() {
        this.performanceMonitor = performanceMonitor;
        this.featureIntegrationService = featureIntegrationService;
        this.integrationTestRunner = integrationTestRunner;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        this.initialized = true;
    }

    getStatus() {
        return {
            initialized: this.initialized,
            performanceMonitor: !!this.performanceMonitor,
            featureIntegrationService: !!this.featureIntegrationService,
            integrationTestRunner: !!this.integrationTestRunner
        };
    }

    async shutdown() {
        this.initialized = false;
    }
}

const infrastructureDomain = new InfrastructureDomain();

module.exports = {
    infrastructureDomain,
    InfrastructureDomain,
    
    // Re-export individual services
    performanceMonitor,
    PerformanceMonitor,
    featureIntegrationService,
    FeatureIntegrationService,
    integrationTestRunner,
    IntegrationTestRunner
};