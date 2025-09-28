/**
 * XERUS FAST CONTEXT MANAGER
 * High-performance context management for real-time AI interactions
 * 
 * Features:
 * - Sliding window context buffer
 * - Token counting and management
 * - Relevance-based context scoring
 * - Context compression algorithms
 * - Performance optimization
 */

const { EventEmitter } = require('events');
const { configManager } = require('../../main/config-manager');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { createLogger } = require('../../common/services/logger.js');

const logger = createLogger('Fast-context-manager');

class FastContextManager extends EventEmitter {
    constructor() {
        super();
        
        // Configuration
        this.config = {
            maxContextSize: configManager.getNumber('CONTEXT_WINDOW_SIZE') || 8000,
            maxBufferSize: 50, // Maximum number of context entries
            relevanceThreshold: configManager.getNumber('CONTEXT_RELEVANCE_THRESHOLD') || 0.7,
            compressionEnabled: configManager.getBoolean('CONTEXT_COMPRESSION') || true,
            persistenceEnabled: configManager.getBoolean('FAST_CONTEXT_ENABLED') || true,
            cleanupInterval: 300000 // 5 minutes
        };
        
        // Context buffer (sliding window)
        this.contextBuffer = [];
        this.currentTokenCount = 0;
        this.maxTokenCount = this.config.maxContextSize;
        
        // Performance metrics
        this.metrics = {
            retrievalTime: [],
            compressionRatio: [],
            cacheHits: 0,
            cacheMisses: 0,
            totalOperations: 0
        };
        
        // Cache for frequently accessed contexts
        this.contextCache = new Map();
        this.relevanceCache = new Map();
        
        // Initialize
        this.initialize();
    }

    /**
     * Initialize the context manager
     */
    async initialize() {
        try {
            logger.info('[FastContextManager] Initializing fast context manager...');
            
            // Load existing context if persistence is enabled
            if (this.config.persistenceEnabled) {
                await this.loadPersistedContext();
            }
            
            // Set up cleanup interval
            this.setupCleanupInterval();
            
            // Set up performance monitoring
            this.setupPerformanceMonitoring();
            
            logger.info('[FastContextManager] Fast context manager initialized');
            logger.info('Max context size:  tokens');
            logger.info('Max buffer size:  entries');
            
            this.emit('initialized');
        } catch (error) {
            logger.error('Failed to initialize:', { error });
            throw error;
        }
    }

    /**
     * Add context to the sliding window buffer
     * @param {Object} context - Context object
     * @param {string} context.type - Type of context (screenshot, audio, text, etc.)
     * @param {string} context.content - Context content
     * @param {number} context.timestamp - Timestamp
     * @param {Object} context.metadata - Additional metadata
     */
    async addContext(context) {
        const startTime = Date.now();
        
        try {
            // Validate context
            if (!this.validateContext(context)) {
                throw new Error('Invalid context format');
            }
            
            // Calculate token count
            const tokenCount = this.calculateTokenCount(context.content);
            
            // Create context entry
            const contextEntry = {
                id: this.generateContextId(),
                type: context.type,
                content: context.content,
                timestamp: context.timestamp || Date.now(),
                tokenCount: tokenCount,
                relevanceScore: 1.0, // Initial relevance score
                metadata: context.metadata || {},
                compressed: false
            };
            
            // Compress if enabled and content is large
            if (this.config.compressionEnabled && tokenCount > 500) {
                contextEntry.content = await this.compressContent(contextEntry.content);
                contextEntry.compressed = true;
                contextEntry.originalTokenCount = tokenCount;
                contextEntry.tokenCount = this.calculateTokenCount(contextEntry.content);
            }
            
            // Add to buffer
            this.contextBuffer.push(contextEntry);
            this.currentTokenCount += contextEntry.tokenCount;
            
            // Maintain buffer size limits
            await this.maintainBufferLimits();
            
            // Update relevance scores
            this.updateRelevanceScores();
            
            // Clear caches
            this.clearCaches();
            
            // Update metrics
            this.metrics.totalOperations++;
            const processingTime = Date.now() - startTime;
            this.emit('contextAdded', { contextEntry, processingTime });
            
            logger.info('Added context:  ( tokens)');
            
            return contextEntry.id;
            
        } catch (error) {
            logger.error('Failed to add context:', { error });
            throw error;
        }
    }

    /**
     * Get relevant context for AI processing
     * @param {Object} options - Retrieval options
     * @param {number} options.maxTokens - Maximum tokens to retrieve
     * @param {string} options.query - Query for relevance matching
     * @param {string[]} options.types - Context types to include
     * @param {number} options.timeWindow - Time window in milliseconds
     * @returns {Object} Retrieved context
     */
    async getRelevantContext(options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                maxTokens = this.config.maxContextSize,
                query = '',
                types = [],
                timeWindow = 3600000 // 1 hour
            } = options;
            
            // Check cache first
            const cacheKey = this.generateCacheKey(options);
            if (this.contextCache.has(cacheKey)) {
                this.metrics.cacheHits++;
                const cached = this.contextCache.get(cacheKey);
                this.emit('contextRetrieved', { fromCache: true, retrievalTime: Date.now() - startTime });
                return cached;
            }
            
            this.metrics.cacheMisses++;
            
            // Filter contexts based on criteria
            let filteredContexts = this.contextBuffer.filter(context => {
                // Time window filter
                if (timeWindow > 0 && Date.now() - context.timestamp > timeWindow) {
                    return false;
                }
                
                // Type filter
                if (types.length > 0 && !types.includes(context.type)) {
                    return false;
                }
                
                // Relevance threshold
                if (context.relevanceScore < this.config.relevanceThreshold) {
                    return false;
                }
                
                return true;
            });
            
            // Sort by relevance and recency
            filteredContexts = filteredContexts.sort((a, b) => {
                // Combine relevance score and recency
                const aScore = a.relevanceScore * 0.7 + this.calculateRecencyScore(a.timestamp) * 0.3;
                const bScore = b.relevanceScore * 0.7 + this.calculateRecencyScore(b.timestamp) * 0.3;
                return bScore - aScore;
            });
            
            // Apply query-based relevance if provided
            if (query) {
                filteredContexts = await this.applyQueryRelevance(filteredContexts, query);
            }
            
            // Select contexts within token limit
            const selectedContexts = [];
            let totalTokens = 0;
            
            for (const context of filteredContexts) {
                if (totalTokens + context.tokenCount <= maxTokens) {
                    selectedContexts.push(context);
                    totalTokens += context.tokenCount;
                } else {
                    break;
                }
            }
            
            // Decompress if needed
            const decompressedContexts = await Promise.all(
                selectedContexts.map(context => this.decompressContext(context))
            );
            
            // Build result
            const result = {
                contexts: decompressedContexts,
                totalTokens: totalTokens,
                totalEntries: decompressedContexts.length,
                timestamp: Date.now(),
                cacheKey: cacheKey
            };
            
            // Cache result
            this.contextCache.set(cacheKey, result);
            
            // Update metrics
            const retrievalTime = Date.now() - startTime;
            this.metrics.retrievalTime.push(retrievalTime);
            this.metrics.totalOperations++;
            
            this.emit('contextRetrieved', { fromCache: false, retrievalTime, totalTokens });
            
            logger.debug(`Retrieved ${result.length} contexts (${totalTokens} tokens) in ${retrievalTime}ms`);
            
            return result;
            
        } catch (error) {
            logger.error('Failed to retrieve context:', { error });
            throw error;
        }
    }

    /**
     * Validate context format
     * @param {Object} context - Context to validate
     * @returns {boolean} - Validation result
     */
    validateContext(context) {
        if (!context || typeof context !== 'object') {
            return false;
        }
        
        if (!context.type || typeof context.type !== 'string') {
            return false;
        }
        
        if (!context.content || typeof context.content !== 'string') {
            return false;
        }
        
        return true;
    }

    /**
     * Calculate token count for content
     * @param {string} content - Content to count tokens for
     * @returns {number} - Estimated token count
     */
    calculateTokenCount(content) {
        if (!content || typeof content !== 'string') {
            return 0;
        }
        
        // Simple token estimation (roughly 4 characters per token)
        // This is a simplified version - could be enhanced with proper tokenization
        return Math.ceil(content.length / 4);
    }

    /**
     * Generate unique context ID
     * @returns {string} - Unique context ID
     */
    generateContextId() {
        return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Maintain buffer size and token limits
     */
    async maintainBufferLimits() {
        // Remove oldest entries if buffer exceeds max size
        while (this.contextBuffer.length > this.config.maxBufferSize) {
            const removed = this.contextBuffer.shift();
            this.currentTokenCount -= removed.tokenCount;
            logger.info('Removed old context:  (buffer size limit)');
        }
        
        // Remove oldest entries if token count exceeds limit
        while (this.currentTokenCount > this.maxTokenCount && this.contextBuffer.length > 0) {
            const removed = this.contextBuffer.shift();
            this.currentTokenCount -= removed.tokenCount;
            logger.info('Removed old context:  (token limit)');
        }
    }

    /**
     * Update relevance scores based on age and usage
     */
    updateRelevanceScores() {
        const now = Date.now();
        
        this.contextBuffer.forEach(context => {
            // Calculate age decay (newer contexts are more relevant)
            const ageHours = (now - context.timestamp) / (1000 * 60 * 60);
            const ageDecay = Math.exp(-ageHours / 24); // Exponential decay over 24 hours
            
            // Update relevance score
            context.relevanceScore = Math.max(0.1, context.relevanceScore * ageDecay);
        });
    }

    /**
     * Calculate recency score
     * @param {number} timestamp - Timestamp to calculate recency for
     * @returns {number} - Recency score (0-1)
     */
    calculateRecencyScore(timestamp) {
        const now = Date.now();
        const ageHours = (now - timestamp) / (1000 * 60 * 60);
        return Math.max(0, 1 - (ageHours / 24)); // Linear decay over 24 hours
    }

    /**
     * Compress content using simple algorithm
     * @param {string} content - Content to compress
     * @returns {string} - Compressed content
     */
    async compressContent(content) {
        try {
            // Simple compression: remove extra whitespace and common words
            let compressed = content
                .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                .replace(/\n\s*\n/g, '\n') // Remove empty lines
                .trim();
            
            // Remove common English words for text content
            if (compressed.length > 1000) {
                const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an'];
                const words = compressed.split(' ');
                compressed = words.filter(word => 
                    !commonWords.includes(word.toLowerCase()) || words.indexOf(word) === words.lastIndexOf(word)
                ).join(' ');
            }
            
            return compressed;
        } catch (error) {
            logger.warn('Compression failed, returning original content');
            return content;
        }
    }

    /**
     * Decompress context if needed
     * @param {Object} context - Context to decompress
     * @returns {Object} - Decompressed context
     */
    async decompressContext(context) {
        if (!context.compressed) {
            return context;
        }
        
        // For simple compression, we just return the compressed content
        // In a real implementation, you would implement proper decompression
        return {
            ...context,
            content: context.content,
            tokenCount: context.originalTokenCount || context.tokenCount
        };
    }

    /**
     * Apply query-based relevance scoring
     * @param {Array} contexts - Contexts to score
     * @param {string} query - Query to match against
     * @returns {Array} - Scored contexts
     */
    async applyQueryRelevance(contexts, query) {
        if (!query || query.trim() === '') {
            return contexts;
        }
        
        const queryWords = query.toLowerCase().split(/\s+/);
        
        return contexts.map(context => {
            const contentWords = context.content.toLowerCase().split(/\s+/);
            const matches = queryWords.filter(word => 
                contentWords.some(contentWord => contentWord.includes(word))
            );
            
            // Calculate query relevance score
            const queryRelevance = matches.length / queryWords.length;
            
            // Combine with existing relevance score
            return {
                ...context,
                relevanceScore: context.relevanceScore * 0.7 + queryRelevance * 0.3
            };
        }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    /**
     * Generate cache key for context retrieval
     * @param {Object} options - Retrieval options
     * @returns {string} - Cache key
     */
    generateCacheKey(options) {
        const key = JSON.stringify({
            maxTokens: options.maxTokens,
            query: options.query,
            types: options.types,
            timeWindow: options.timeWindow
        });
        return Buffer.from(key).toString('base64');
    }

    /**
     * Clear all caches
     */
    clearCaches() {
        this.contextCache.clear();
        this.relevanceCache.clear();
    }

    /**
     * Setup cleanup interval
     */
    setupCleanupInterval() {
        setInterval(() => {
            this.performCleanup();
        }, this.config.cleanupInterval);
    }

    /**
     * Perform periodic cleanup
     */
    async performCleanup() {
        try {
            logger.info('[FastContextManager] Performing periodic cleanup...');
            
            // Clean up expired contexts
            const now = Date.now();
            const expiredThreshold = 24 * 60 * 60 * 1000; // 24 hours
            
            const before = this.contextBuffer.length;
            this.contextBuffer = this.contextBuffer.filter(context => {
                const isExpired = now - context.timestamp > expiredThreshold;
                if (isExpired) {
                    this.currentTokenCount -= context.tokenCount;
                }
                return !isExpired;
            });
            
            const removed = before - this.contextBuffer.length;
            if (removed > 0) {
                logger.info('Removed  expired contexts');
            }
            
            // Clean up cache
            this.clearCaches();
            
            // Update relevance scores
            this.updateRelevanceScores();
            
            // Persist context if enabled
            if (this.config.persistenceEnabled) {
                await this.persistContext();
            }
            
            // Log performance metrics
            this.logPerformanceMetrics();
            
        } catch (error) {
            logger.error('Cleanup failed:', { error });
        }
    }

    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        // Monitor memory usage
        setInterval(() => {
            const memoryUsage = process.memoryUsage();
            const contextMemory = JSON.stringify(this.contextBuffer).length;
            
            this.emit('performanceUpdate', {
                memoryUsage,
                contextMemory,
                bufferSize: this.contextBuffer.length,
                tokenCount: this.currentTokenCount,
                cacheSize: this.contextCache.size
            });
        }, 30000); // Every 30 seconds
    }

    /**
     * Log performance metrics
     */
    logPerformanceMetrics() {
        const avgRetrievalTime = this.metrics.retrievalTime.length > 0 
            ? this.metrics.retrievalTime.reduce((a, b) => a + b) / this.metrics.retrievalTime.length 
            : 0;
        
        const cacheHitRate = this.metrics.totalOperations > 0 
            ? (this.metrics.cacheHits / this.metrics.totalOperations) * 100 
            : 0;
        
        logger.info('Performance metrics:', {
            avgRetrievalTime: `${avgRetrievalTime.toFixed(2)}ms`,
            cacheHitRate: `${cacheHitRate.toFixed(1)}%`,
            totalOperations: this.metrics.totalOperations,
            bufferSize: this.contextBuffer.length,
            tokenCount: this.currentTokenCount
        });
    }

    /**
     * Persist context to storage
     */
    async persistContext() {
        try {
            const contextData = {
                buffer: this.contextBuffer,
                currentTokenCount: this.currentTokenCount,
                timestamp: Date.now()
            };
            
            const contextPath = path.join(os.tmpdir(), 'xerus-context.json');
            await fs.writeFile(contextPath, JSON.stringify(contextData, null, 2));
            
            logger.info('Context persisted to');
        } catch (error) {
            logger.warn('Failed to persist context:', { error });
        }
    }

    /**
     * Load persisted context from storage
     */
    async loadPersistedContext() {
        try {
            const contextPath = path.join(os.tmpdir(), 'xerus-context.json');
            const contextData = JSON.parse(await fs.readFile(contextPath, 'utf8'));
            
            // Validate loaded data
            if (contextData.buffer && Array.isArray(contextData.buffer)) {
                this.contextBuffer = contextData.buffer;
                this.currentTokenCount = contextData.currentTokenCount || 0;
                logger.info('Loaded  contexts from persistence');
            }
        } catch (error) {
            logger.info('[FastContextManager] No persisted context found or failed to load');
        }
    }

    /**
     * Get current context statistics
     * @returns {Object} - Context statistics
     */
    getContextStats() {
        return {
            bufferSize: this.contextBuffer.length,
            maxBufferSize: this.config.maxBufferSize,
            tokenCount: this.currentTokenCount,
            maxTokenCount: this.maxTokenCount,
            cacheSize: this.contextCache.size,
            metrics: this.metrics,
            oldestContext: this.contextBuffer.length > 0 ? this.contextBuffer[0].timestamp : null,
            newestContext: this.contextBuffer.length > 0 ? this.contextBuffer[this.contextBuffer.length - 1].timestamp : null
        };
    }

    /**
     * Get context manager statistics
     */
    getStats() {
        return {
            contextBufferSize: this.contextBuffer.length,
            currentTokenCount: this.currentTokenCount,
            maxTokens: this.maxTokens,
            utilization: (this.currentTokenCount / this.maxTokens * 100).toFixed(1) + '%',
            totalContextAdded: this.contextBuffer.length,
            cacheSize: this.cache ? this.cache.size : 0
        };
    }

    /**
     * Clear all context data
     */
    clearAllContext() {
        this.contextBuffer = [];
        this.currentTokenCount = 0;
        this.clearCaches();
        this.emit('contextCleared');
        logger.info('[FastContextManager] All context data cleared');
    }
}

// Export singleton instance
const fastContextManager = new FastContextManager();

module.exports = {
    fastContextManager,
    FastContextManager
};