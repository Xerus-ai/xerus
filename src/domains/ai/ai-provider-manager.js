/**
 * XERUS AI PROVIDER MANAGER
 * Intelligent AI provider selection and context optimization
 * 
 * Features:
 * - Context-aware provider selection
 * - Automatic fallback and health monitoring
 * - Performance optimization and cost tracking
 * - Integration with FastContextManager and PerformanceMonitor
 */

const { EventEmitter } = require('events');
const { PROVIDERS, createLLM, createStreamingLLM, createSTT } = require('../../common/ai/factory');
const { configManager } = require('../../main/config-manager');
const { createLogger } = require('../../common/services/logger.js');

const logger = createLogger('Ai-provider-manager');

class AIProviderManager extends EventEmitter {
    constructor() {
        super();
        
        // Configuration
        this.config = {
            defaultProvider: configManager.getString('DEFAULT_AI_PROVIDER') || 'openai',
            fallbackEnabled: configManager.getBoolean('AI_FALLBACK_ENABLED') || true,
            healthCheckInterval: 300000, // 5 minutes
            maxRetries: 3,
            timeoutMs: 30000, // 30 seconds
            costTrackingEnabled: true,
            performanceTrackingEnabled: true
        };
        
        // Provider health tracking
        this.providerHealth = new Map();
        this.providerMetrics = new Map();
        this.providerCosts = new Map();
        
        // Context optimization settings
        this.contextLimits = {
            'openai': { maxTokens: 128000, costPerToken: 0.00001 },
            'gemini': { maxTokens: 1000000, costPerToken: 0.000001 },
            'anthropic': { maxTokens: 200000, costPerToken: 0.000008 },
            'ollama': { maxTokens: 8192, costPerToken: 0 } // Local, no cost
        };
        
        // Provider preferences for different use cases
        this.providerPreferences = {
            'screenshot_analysis': ['gemini', 'openai', 'anthropic'],
            'code_review': ['anthropic', 'openai', 'gemini'],
            'conversation': ['openai', 'anthropic', 'gemini'],
            'local_processing': ['ollama']
        };
        
        // Fallback chains
        this.fallbackChains = {
            'openai': ['gemini', 'anthropic'],
            'gemini': ['openai', 'anthropic'],
            'anthropic': ['openai', 'gemini'],
            'ollama': ['openai', 'gemini', 'anthropic']
        };
        
        this.initialize();
    }

    /**
     * Initialize AI Provider Manager
     */
    async initialize() {
        try {
            logger.info('[AIProviderManager] Initializing AI provider manager...');
            
            // Initialize provider health tracking
            this.initializeProviderHealth();
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            // Setup cost tracking
            this.setupCostTracking();
            
            // Initialize performance tracking
            this.setupPerformanceTracking();
            
            logger.info('[AIProviderManager] AI provider manager initialized');
            logger.info('Default provider:');
            logger.info('Fallback enabled:');
            
            this.emit('initialized');
        } catch (error) {
            logger.error('Failed to initialize:', { error });
            throw error;
        }
    }

    /**
     * Select optimal AI provider for a request
     * @param {Object} options - Request options
     * @param {string} options.requestType - Type of request (screenshot_analysis, conversation, etc.)
     * @param {string} options.userMessage - User's message
     * @param {Object} options.context - Available context
     * @param {string} options.preferredProvider - User's preferred provider
     * @returns {string} Selected provider ID
     */
    async selectOptimalProvider(options = {}) {
        const {
            requestType = 'conversation',
            userMessage = '',
            context = null,
            preferredProvider = null
        } = options;
        
        try {
            // 1. Use preferred provider if specified and healthy
            if (preferredProvider && this.isProviderHealthy(preferredProvider)) {
                logger.info('Using preferred provider:');
                return preferredProvider;
            }
            
            // 2. Calculate context size for provider selection
            const contextSize = await this.calculateContextSize(context);
            
            // 3. Get providers suitable for request type
            const suitableProviders = this.providerPreferences[requestType] || 
                                    Object.keys(PROVIDERS).filter(p => PROVIDERS[p].llmModels.length > 0);
            
            // 4. Filter by health and context limits
            const viableProviders = suitableProviders.filter(provider => {
                const isHealthy = this.isProviderHealthy(provider);
                const canHandleContext = this.canHandleContext(provider, contextSize);
                return isHealthy && canHandleContext;
            });
            
            if (viableProviders.length === 0) {
                logger.warn('No viable providers found, using default');
                return this.config.defaultProvider;
            }
            
            // 5. Score providers based on performance metrics
            const scoredProviders = await this.scoreProviders(viableProviders, requestType, contextSize);
            
            // 6. Select best provider
            const selectedProvider = scoredProviders[0].provider;
            
            logger.info('Selected provider:  (score: )');
            return selectedProvider;
            
        } catch (error) {
            logger.error('Provider selection failed:', { error });
            return this.config.defaultProvider;
        }
    }

    /**
     * Prepare context for specific AI provider
     * @param {string} provider - Provider ID
     * @param {string} userMessage - User's message
     * @param {Object} context - Available context
     * @returns {Object} Optimized context for provider
     */
    async prepareContextForProvider(provider, userMessage, context = null) {
        try {
            // Get provider limits
            const limits = this.contextLimits[provider] || { maxTokens: 4000 };
            
            // Get relevant context using FastContextManager
            let relevantContext = null;
            if (context) {
                const { fastContextManager } = require('./fast-context-manager');
                
                relevantContext = await fastContextManager.getRelevantContext({
                    maxTokens: Math.floor(limits.maxTokens * 0.8), // Reserve 20% for response
                    query: userMessage,
                    types: ['screenshot', 'conversation', 'system', 'tool_result'],
                    timeWindow: this.getTimeWindowForProvider(provider)
                });
            }
            
            // Format context for provider
            const formattedContext = this.formatContextForProvider(provider, relevantContext);
            
            // Add context metadata
            const contextMetadata = {
                provider: provider,
                tokenEstimate: this.estimateTokens(formattedContext),
                contextEntries: relevantContext?.contexts?.length || 0,
                preparationTime: Date.now()
            };
            
            return {
                context: formattedContext,
                metadata: contextMetadata
            };
            
        } catch (error) {
            logger.error('Context preparation failed:', { error });
            return { context: null, metadata: { error: error.message } };
        }
    }

    /**
     * Create AI provider instance with enhanced features
     * @param {string} provider - Provider ID
     * @param {Object} options - Provider options
     * @param {boolean} streaming - Whether to use streaming
     * @returns {Object} AI provider instance
     */
    async createEnhancedProvider(provider, options = {}, streaming = false) {
        try {
            // Get model state for provider configuration
            const { modelStateService } = require('../../common/services/modelStateService');
            const currentSelection = modelStateService.getCurrentSelection();
            
            // Prepare enhanced options
            const enhancedOptions = {
                ...options,
                provider: provider,
                model: currentSelection.llm?.model || options.model,
                metadata: {
                    createdAt: Date.now(),
                    requestId: this.generateRequestId(),
                    contextOptimized: true
                }
            };
            
            // Create provider instance
            const providerInstance = streaming 
                ? createStreamingLLM(provider, enhancedOptions)
                : createLLM(provider, enhancedOptions);
            
            // Wrap with monitoring
            return this.wrapProviderWithMonitoring(providerInstance, provider);
            
        } catch (error) {
            logger.error('Failed to create provider ${provider}:', { error });
            
            // Try fallback if enabled
            if (this.config.fallbackEnabled) {
                const fallbackProvider = this.getFallbackProvider(provider);
                if (fallbackProvider && fallbackProvider !== provider) {
                    logger.info('Attempting fallback to');
                    return this.createEnhancedProvider(fallbackProvider, options, streaming);
                }
            }
            
            throw error;
        }
    }

    /**
     * Execute AI request with automatic optimization and fallback
     * @param {Object} request - AI request
     * @returns {Object} AI response
     */
    async executeRequest(request) {
        const startTime = Date.now();
        let selectedProvider = null;
        let attempts = 0;
        
        try {
            // Select optimal provider
            selectedProvider = await this.selectOptimalProvider(request);
            
            // Prepare optimized context
            const { context, metadata } = await this.prepareContextForProvider(
                selectedProvider, 
                request.userMessage, 
                request.context
            );
            
            // Create enhanced provider
            const provider = await this.createEnhancedProvider(
                selectedProvider, 
                request.options, 
                request.streaming
            );
            
            // Execute request
            const response = await this.executeWithProvider(provider, {
                ...request,
                context,
                metadata
            });
            
            // Track success metrics
            this.trackRequestSuccess(selectedProvider, Date.now() - startTime, metadata);
            
            return {
                response,
                provider: selectedProvider,
                metadata: {
                    ...metadata,
                    executionTime: Date.now() - startTime,
                    success: true
                }
            };
            
        } catch (error) {
            attempts++;
            
            // Track failure
            this.trackRequestFailure(selectedProvider, error, attempts);
            
            // Try fallback if available and enabled
            if (this.config.fallbackEnabled && attempts < this.config.maxRetries) {
                const fallbackProvider = this.getFallbackProvider(selectedProvider);
                if (fallbackProvider && fallbackProvider !== selectedProvider) {
                    logger.info('Attempting fallback :');
                    
                    return this.executeRequest({
                        ...request,
                        preferredProvider: fallbackProvider
                    });
                }
            }
            
            throw new Error(`AI request failed after ${attempts} attempts: ${error.message}`);
        }
    }

    /**
     * Initialize provider health tracking
     */
    initializeProviderHealth() {
        for (const providerId of Object.keys(PROVIDERS)) {
            this.providerHealth.set(providerId, {
                status: 'unknown',
                lastCheck: 0,
                responseTime: 0,
                errorRate: 0,
                consecutiveFailures: 0,
                totalRequests: 0,
                successfulRequests: 0
            });
            
            this.providerMetrics.set(providerId, {
                avgResponseTime: 0,
                requestCount: 0,
                errorCount: 0,
                lastUsed: 0
            });
            
            this.providerCosts.set(providerId, {
                totalCost: 0,
                tokensUsed: 0,
                requestCount: 0
            });
        }
    }

    /**
     * Start health monitoring for all providers
     */
    startHealthMonitoring() {
        setInterval(async () => {
            await this.performHealthChecks();
        }, this.config.healthCheckInterval);
        
        // Initial health check
        setTimeout(() => this.performHealthChecks(), 5000);
    }

    /**
     * Perform health checks on all providers
     */
    async performHealthChecks() {
        logger.info('[AIProviderManager] Performing provider health checks...');
        
        const healthPromises = Object.keys(PROVIDERS).map(async (providerId) => {
            try {
                const startTime = Date.now();
                
                // Simple test request
                const testResult = await this.testProvider(providerId);
                const responseTime = Date.now() - startTime;
                
                // Update health status
                const health = this.providerHealth.get(providerId);
                health.status = testResult.success ? 'healthy' : 'unhealthy';
                health.lastCheck = Date.now();
                health.responseTime = responseTime;
                
                if (testResult.success) {
                    health.consecutiveFailures = 0;
                } else {
                    health.consecutiveFailures++;
                }
                
                logger.info(':  (ms)');
                
            } catch (error) {
                const health = this.providerHealth.get(providerId);
                health.status = 'error';
                health.consecutiveFailures++;
                logger.warn('Health check failed for ${providerId}:', { message: error.message });
            }
        });
        
        await Promise.allSettled(healthPromises);
        this.emit('healthCheckCompleted');
    }

    /**
     * Test provider availability
     * @param {string} providerId - Provider ID
     * @returns {Object} Test result
     */
    async testProvider(providerId) {
        try {
            // Skip local providers that might not be running
            if (providerId === 'ollama' || providerId === 'whisper') {
                return { success: true, message: 'Local provider skipped' };
            }
            
            // For cloud providers, we would typically make a minimal API call
            // For now, just check if the provider can be created
            const provider = PROVIDERS[providerId];
            if (provider && provider.handler) {
                provider.handler(); // This should not throw if properly configured
                return { success: true, message: 'Provider accessible' };
            }
            
            return { success: false, message: 'Provider not available' };
            
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Check if provider is healthy
     * @param {string} providerId - Provider ID
     * @returns {boolean} Health status
     */
    isProviderHealthy(providerId) {
        const health = this.providerHealth.get(providerId);
        if (!health) return false;
        
        // Consider healthy if:
        // - Status is healthy or unknown (not tested yet)
        // - Less than 3 consecutive failures
        // - Last check was less than 10 minutes ago (or never checked)
        return (health.status === 'healthy' || health.status === 'unknown') &&
               health.consecutiveFailures < 3;
    }

    /**
     * Check if provider can handle context size
     * @param {string} providerId - Provider ID
     * @param {number} contextSize - Context size in tokens
     * @returns {boolean} Whether provider can handle context
     */
    canHandleContext(providerId, contextSize) {
        const limits = this.contextLimits[providerId];
        if (!limits) return true; // Unknown limits, assume it can handle
        
        return contextSize <= limits.maxTokens * 0.8; // Reserve 20% for response
    }

    /**
     * Calculate context size in tokens
     * @param {Object} context - Context object
     * @returns {number} Estimated token count
     */
    async calculateContextSize(context) {
        if (!context) return 0;
        
        try {
            const { fastContextManager } = require('./fast-context-manager');
            
            if (context.contexts) {
                // Context from FastContextManager
                return context.totalTokens || 0;
            } else if (typeof context === 'string') {
                // Simple string context
                return fastContextManager.calculateTokenCount(context);
            } else if (context.content) {
                // Context object
                return fastContextManager.calculateTokenCount(context.content);
            }
            
            return 0;
        } catch (error) {
            logger.warn('Failed to calculate context size:', { error });
            return 1000; // Conservative estimate
        }
    }

    /**
     * Score providers based on performance metrics
     * @param {string[]} providers - Available providers
     * @param {string} requestType - Type of request
     * @param {number} contextSize - Context size
     * @returns {Array} Scored providers sorted by score
     */
    async scoreProviders(providers, requestType, contextSize) {
        const scoredProviders = providers.map(provider => {
            const health = this.providerHealth.get(provider);
            const metrics = this.providerMetrics.get(provider);
            const limits = this.contextLimits[provider];
            
            let score = 100; // Base score
            
            // Health score (40% weight)
            if (health.status === 'healthy') score += 40;
            else if (health.status === 'unknown') score += 20;
            else score -= 20;
            
            score -= health.consecutiveFailures * 10;
            
            // Performance score (30% weight)
            if (metrics.avgResponseTime > 0) {
                const responseScore = Math.max(0, 30 - (metrics.avgResponseTime / 1000));
                score += responseScore;
            }
            
            // Cost efficiency score (20% weight)
            if (limits && limits.costPerToken > 0) {
                const costScore = Math.max(0, 20 - (limits.costPerToken * 1000000));
                score += costScore;
            } else {
                score += 20; // Free providers get max cost score
            }
            
            // Context handling score (10% weight)
            if (limits && contextSize > 0) {
                const contextRatio = contextSize / limits.maxTokens;
                if (contextRatio < 0.5) score += 10;
                else if (contextRatio < 0.8) score += 5;
            }
            
            return { provider, score };
        });
        
        return scoredProviders.sort((a, b) => b.score - a.score);
    }

    /**
     * Get fallback provider for failed provider
     * @param {string} providerId - Failed provider ID
     * @returns {string|null} Fallback provider ID
     */
    getFallbackProvider(providerId) {
        const fallbacks = this.fallbackChains[providerId] || [];
        
        for (const fallback of fallbacks) {
            if (this.isProviderHealthy(fallback)) {
                return fallback;
            }
        }
        
        return null;
    }

    /**
     * Get appropriate time window for provider
     * @param {string} providerId - Provider ID
     * @returns {number} Time window in milliseconds
     */
    getTimeWindowForProvider(providerId) {
        const limits = this.contextLimits[providerId];
        
        // Providers with larger context windows can use longer time windows
        if (limits && limits.maxTokens > 100000) {
            return 7200000; // 2 hours for large context providers
        } else if (limits && limits.maxTokens > 50000) {
            return 3600000; // 1 hour for medium context providers
        } else {
            return 1800000; // 30 minutes for smaller context providers
        }
    }

    /**
     * Format context for specific provider
     * @param {string} providerId - Provider ID
     * @param {Object} context - Context to format
     * @returns {string} Formatted context
     */
    formatContextForProvider(providerId, context) {
        if (!context || !context.contexts) {
            return '';
        }
        
        const contexts = context.contexts;
        let formatted = '';
        
        // Provider-specific formatting
        switch (providerId) {
            case 'anthropic':
                // Claude prefers structured context with clear sections
                formatted = contexts.map(ctx => {
                    return `[${ctx.type.toUpperCase()}] ${ctx.content}`;
                }).join('\n\n');
                break;
                
            case 'gemini':
                // Gemini handles multimodal content well
                formatted = contexts.map(ctx => {
                    if (ctx.type === 'screenshot') {
                        return `[SCREENSHOT] ${ctx.content}`;
                    }
                    return ctx.content;
                }).join('\n');
                break;
                
            case 'openai':
                // OpenAI GPT models prefer conversational context
                formatted = contexts.map(ctx => {
                    return ctx.content;
                }).join('\n');
                break;
                
            default:
                formatted = contexts.map(ctx => ctx.content).join('\n');
        }
        
        return formatted;
    }

    /**
     * Estimate token count for content
     * @param {string} content - Content to estimate
     * @returns {number} Estimated token count
     */
    estimateTokens(content) {
        if (!content) return 0;
        
        try {
            const { fastContextManager } = require('./fast-context-manager');
            return fastContextManager.calculateTokenCount(content);
        } catch (error) {
            // Fallback estimation: ~4 characters per token
            return Math.ceil(content.length / 4);
        }
    }

    /**
     * Wrap provider with monitoring
     * @param {Object} providerInstance - Provider instance
     * @param {string} providerId - Provider ID
     * @returns {Object} Wrapped provider
     */
    wrapProviderWithMonitoring(providerInstance, providerId) {
        const originalMethods = {};
        
        // Wrap common methods with monitoring
        ['chat', 'complete', 'stream'].forEach(method => {
            if (typeof providerInstance[method] === 'function') {
                originalMethods[method] = providerInstance[method].bind(providerInstance);
                
                providerInstance[method] = async (...args) => {
                    const startTime = Date.now();
                    
                    try {
                        const result = await originalMethods[method](...args);
                        
                        // Track success
                        this.updateProviderMetrics(providerId, Date.now() - startTime, true);
                        
                        return result;
                    } catch (error) {
                        // Track failure
                        this.updateProviderMetrics(providerId, Date.now() - startTime, false);
                        throw error;
                    }
                };
            }
        });
        
        return providerInstance;
    }

    /**
     * Update provider metrics
     * @param {string} providerId - Provider ID
     * @param {number} responseTime - Response time in ms
     * @param {boolean} success - Whether request was successful
     */
    updateProviderMetrics(providerId, responseTime, success) {
        const metrics = this.providerMetrics.get(providerId);
        const health = this.providerHealth.get(providerId);
        
        // Update metrics
        metrics.requestCount++;
        metrics.lastUsed = Date.now();
        
        if (success) {
            metrics.avgResponseTime = (metrics.avgResponseTime * (metrics.requestCount - 1) + responseTime) / metrics.requestCount;
            health.successfulRequests++;
        } else {
            metrics.errorCount++;
        }
        
        health.totalRequests++;
        health.errorRate = metrics.errorCount / health.totalRequests;
        
        // Emit metrics update
        this.emit('metricsUpdated', { providerId, metrics, health });
    }

    /**
     * Setup cost tracking
     */
    setupCostTracking() {
        if (!this.config.costTrackingEnabled) return;
        
        logger.info('[AIProviderManager] Cost tracking enabled');
        
        // Track costs for each request
        this.on('requestCompleted', (data) => {
            this.updateCostTracking(data.provider, data.tokensUsed, data.metadata);
        });
    }

    /**
     * Setup performance tracking integration
     */
    setupPerformanceTracking() {
        if (!this.config.performanceTrackingEnabled) return;
        
        try {
            const { performanceMonitor } = require('../infrastructure/performance-monitor');
            
            // Listen for performance events
            this.on('metricsUpdated', (data) => {
                performanceMonitor.emit('aiProviderMetrics', data);
            });
            
            logger.info('[AIProviderManager] Performance tracking integration enabled');
        } catch (error) {
            logger.warn('Performance tracking setup failed:', { error });
        }
    }

    /**
     * Track request success
     * @param {string} providerId - Provider ID
     * @param {number} executionTime - Execution time
     * @param {Object} metadata - Request metadata
     */
    trackRequestSuccess(providerId, executionTime, metadata) {
        this.emit('requestCompleted', {
            provider: providerId,
            success: true,
            executionTime,
            metadata,
            tokensUsed: metadata.tokenEstimate || 0
        });
    }

    /**
     * Track request failure
     * @param {string} providerId - Provider ID
     * @param {Error} error - Error object
     * @param {number} attempts - Number of attempts
     */
    trackRequestFailure(providerId, error, attempts) {
        this.emit('requestFailed', {
            provider: providerId,
            error: error.message,
            attempts
        });
    }

    /**
     * Update cost tracking
     * @param {string} providerId - Provider ID
     * @param {number} tokensUsed - Tokens used
     * @param {Object} metadata - Request metadata
     */
    updateCostTracking(providerId, tokensUsed, metadata) {
        const costs = this.providerCosts.get(providerId);
        const limits = this.contextLimits[providerId];
        
        if (limits && limits.costPerToken > 0) {
            const requestCost = tokensUsed * limits.costPerToken;
            costs.totalCost += requestCost;
        }
        
        costs.tokensUsed += tokensUsed;
        costs.requestCount++;
    }

    /**
     * Execute request with provider
     * @param {Object} provider - Provider instance
     * @param {Object} request - Request object
     * @returns {Object} Response
     */
    async executeWithProvider(provider, request) {
        // This method would be implemented based on the specific provider interface
        // For now, it's a placeholder that would call the appropriate provider method
        
        if (request.streaming && typeof provider.stream === 'function') {
            return provider.stream(request);
        } else if (typeof provider.chat === 'function') {
            return provider.chat(request);
        } else if (typeof provider.complete === 'function') {
            return provider.complete(request);
        }
        
        throw new Error('Provider does not support required methods');
    }

    /**
     * Generate unique request ID
     * @returns {string} Request ID
     */
    generateRequestId() {
        return `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get provider statistics
     * @returns {Object} Provider statistics
     */
    getProviderStatistics() {
        const stats = {};
        
        for (const [providerId, health] of this.providerHealth) {
            const metrics = this.providerMetrics.get(providerId);
            const costs = this.providerCosts.get(providerId);
            
            stats[providerId] = {
                health: {
                    status: health.status,
                    errorRate: health.errorRate,
                    consecutiveFailures: health.consecutiveFailures,
                    lastCheck: health.lastCheck
                },
                performance: {
                    avgResponseTime: metrics.avgResponseTime,
                    requestCount: metrics.requestCount,
                    errorCount: metrics.errorCount,
                    lastUsed: metrics.lastUsed
                },
                costs: {
                    totalCost: costs.totalCost,
                    tokensUsed: costs.tokensUsed,
                    requestCount: costs.requestCount
                }
            };
        }
        
        return stats;
    }

    /**
     * Get provider recommendations
     * @param {string} requestType - Type of request
     * @returns {Array} Recommended providers
     */
    getProviderRecommendations(requestType) {
        const suitableProviders = this.providerPreferences[requestType] || 
                                Object.keys(PROVIDERS).filter(p => PROVIDERS[p].llmModels.length > 0);
        
        return suitableProviders.map(provider => {
            const health = this.providerHealth.get(provider);
            const metrics = this.providerMetrics.get(provider);
            const limits = this.contextLimits[provider];
            
            return {
                provider,
                health: health.status,
                avgResponseTime: metrics.avgResponseTime,
                maxTokens: limits?.maxTokens || 'Unknown',
                costPerToken: limits?.costPerToken || 0,
                recommended: health.status === 'healthy' && health.consecutiveFailures === 0
            };
        }).sort((a, b) => {
            // Sort by health status, then by performance
            if (a.recommended && !b.recommended) return -1;
            if (!a.recommended && b.recommended) return 1;
            return a.avgResponseTime - b.avgResponseTime;
        });
    }
}

// Export singleton instance
const aiProviderManager = new AIProviderManager();

module.exports = {
    aiProviderManager,
    AIProviderManager
};