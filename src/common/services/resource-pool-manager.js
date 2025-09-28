/**
 * RESOURCE POOL MANAGER
 * Manages HTTP connections and prevents EPIPE errors through intelligent resource pooling
 * 
 * Features:
 * - Connection pooling with keep-alive
 * - Request queuing to prevent resource exhaustion
 * - Timeout management
 * - EPIPE error recovery
 * - Resource pressure monitoring
 */

const { createLogger } = require('./logger.js');

const logger = createLogger('ResourcePoolManager');

class ResourcePoolManager {
    constructor(options = {}) {
        this.maxConcurrentRequests = options.maxConcurrentRequests || 10;
        this.requestTimeout = options.requestTimeout || 60000;
        this.keepAliveTimeout = options.keepAliveTimeout || 30000;
        this.maxSockets = options.maxSockets || 5;
        this.maxFreeSockets = options.maxFreeSockets || 2;
        
        this.requestQueue = [];
        this.activeRequests = 0;
        this.totalRequests = 0;
        this.failedRequests = 0;
        
        // Cache fetch function to avoid repeated imports
        this.fetchFunction = null;
        this.initializeFetch();
        
        // Create HTTP agent with connection pooling
        this.httpAgent = new (require('http').Agent)({
            keepAlive: true,
            maxSockets: this.maxSockets,
            maxFreeSockets: this.maxFreeSockets,
            timeout: this.keepAliveTimeout,
            keepAliveMsecs: 10000
        });

        // Create HTTPS agent with connection pooling
        this.httpsAgent = new (require('https').Agent)({
            keepAlive: true,
            maxSockets: this.maxSockets,
            maxFreeSockets: this.maxFreeSockets,
            timeout: this.keepAliveTimeout,
            keepAliveMsecs: 10000,
            rejectUnauthorized: false // For development with self-signed certificates
        });

        logger.info('Resource pool manager created', {
            maxConcurrentRequests: this.maxConcurrentRequests,
            maxSockets: this.maxSockets,
            requestTimeout: this.requestTimeout
        });
    }

    /**
     * Queue HTTP request with resource management
     */
    async queuedFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            const requestData = {
                url,
                options: {
                    ...options,
                    timeout: this.requestTimeout,
                    agent: url.startsWith('https:') ? this.httpsAgent : this.httpAgent
                },
                resolve,
                reject,
                timestamp: Date.now()
            };

            this.requestQueue.push(requestData);
            this.totalRequests++;
            
            logger.debug('Request queued', { 
                url, 
                queueLength: this.requestQueue.length,
                activeRequests: this.activeRequests 
            });

            this.processQueue();
        });
    }

    /**
     * Process request queue with concurrency control
     */
    async processQueue() {
        if (this.activeRequests >= this.maxConcurrentRequests || this.requestQueue.length === 0) {
            return;
        }

        this.activeRequests++;
        const requestData = this.requestQueue.shift();
        const { url, options, resolve, reject, timestamp } = requestData;

        // Check for stale requests (older than 60 seconds)
        if (Date.now() - timestamp > 60000) {
            logger.warn('Dropping stale request', { url, age: Date.now() - timestamp });
            reject(new Error('Request timeout - dropped from queue'));
            this.activeRequests--;
            setImmediate(() => this.processQueue());
            return;
        }

        logger.debug('Processing request', { url, activeRequests: this.activeRequests });

        try {
            // Use cached fetch function
            const fetch = this.fetchFunction || await this.getFetchModule();
            
            const response = await Promise.race([
                fetch(url, options),
                new Promise((_, timeoutReject) => 
                    setTimeout(() => timeoutReject(new Error('Request timeout')), this.requestTimeout)
                )
            ]);

            logger.debug('Request completed successfully', { url, status: response.status });
            resolve(response);

        } catch (error) {
            this.failedRequests++;
            
            if (error.code === 'EPIPE' || error.message.includes('broken pipe')) {
                logger.warn('EPIPE error detected in HTTP request', { url, error: error.message });
                
                // Recreate agents to recover from EPIPE
                this.recreateAgents();
            } else {
                logger.error('Request failed', { url, error: error.message });
            }
            
            reject(error);
        } finally {
            this.activeRequests--;
            
            // Process next queued request
            setImmediate(() => this.processQueue());
        }
    }

    /**
     * Initialize fetch function on startup
     */
    async initializeFetch() {
        try {
            this.fetchFunction = await this.getFetchModule();
            logger.debug('Fetch function initialized');
        } catch (error) {
            logger.warn('Failed to initialize fetch function:', error.message);
        }
    }

    /**
     * Get fetch module (handles different Node.js versions)
     */
    async getFetchModule() {
        try {
            // Try Node.js 18+ built-in fetch first
            if (globalThis.fetch) {
                return globalThis.fetch;
            }
            
            // Fallback to node-fetch
            const { default: fetch } = await import('node-fetch');
            return fetch;
        } catch (error) {
            // Ultimate fallback - use require for node-fetch
            return require('node-fetch');
        }
    }

    /**
     * Recreate HTTP agents to recover from EPIPE errors
     */
    recreateAgents() {
        logger.info('Recreating HTTP agents due to EPIPE error');
        
        // Destroy existing agents
        this.httpAgent.destroy();
        this.httpsAgent.destroy();
        
        // Create new agents
        this.httpAgent = new (require('http').Agent)({
            keepAlive: true,
            maxSockets: this.maxSockets,
            maxFreeSockets: this.maxFreeSockets,
            timeout: this.keepAliveTimeout,
            keepAliveMsecs: 10000
        });

        this.httpsAgent = new (require('https').Agent)({
            keepAlive: true,
            maxSockets: this.maxSockets,
            maxFreeSockets: this.maxFreeSockets,
            timeout: this.keepAliveTimeout,
            keepAliveMsecs: 10000,
            rejectUnauthorized: false
        });
    }

    /**
     * Get pool statistics for monitoring
     */
    getStats() {
        return {
            activeRequests: this.activeRequests,
            queuedRequests: this.requestQueue.length,
            totalRequests: this.totalRequests,
            failedRequests: this.failedRequests,
            successRate: this.totalRequests > 0 ? 
                ((this.totalRequests - this.failedRequests) / this.totalRequests * 100).toFixed(2) + '%' : '100%'
        };
    }

    /**
     * Clear request queue and reset counters
     */
    reset() {
        logger.info('Resetting resource pool', this.getStats());
        
        // Reject all queued requests
        this.requestQueue.forEach(({ reject }) => {
            reject(new Error('Request cancelled - pool reset'));
        });
        
        this.requestQueue = [];
        this.totalRequests = 0;
        this.failedRequests = 0;
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        logger.info('Shutting down resource pool manager', this.getStats());
        
        // Wait for active requests to complete
        let attempts = 0;
        while (this.activeRequests > 0 && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        // Force reject any remaining requests
        this.reset();
        
        // Destroy agents
        this.httpAgent.destroy();
        this.httpsAgent.destroy();
    }
}

// Create singleton instance
const resourcePoolManager = new ResourcePoolManager();

// Monitor resource pressure
setInterval(() => {
    const stats = resourcePoolManager.getStats();
    if (stats.queuedRequests > 10 || stats.activeRequests >= 3) {
        logger.warn('High resource pressure detected', stats);
    }
}, 5000);

module.exports = {
    ResourcePoolManager,
    resourcePoolManager
};