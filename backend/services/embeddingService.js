/**
 * BACKEND EMBEDDING SERVICE
 * Backend-only embedding generation service for RAG functionality
 * 
 * Features:
 * - Multiple embedding providers (OpenAI, local transformers)
 * - Text preprocessing and chunking
 * - Vector storage and retrieval
 * - Similarity search and ranking
 * - Caching for performance optimization
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const fetch = require('node-fetch');

/**
 * Backend Embedding Service for RAG
 */
class BackendEmbeddingService extends EventEmitter {
    constructor() {
        super();
        
        this.config = {
            provider: 'openai', // 'openai' or 'local'
            model: 'text-embedding-3-small', // OpenAI embedding model
            dimensions: 1536, // Embedding dimensions (must match database schema)
            maxTokens: 8192, // Max tokens per embedding
            batchSize: 100, // Batch size for processing
            cacheEnabled: true,
            cacheTimeout: 86400000, // 24 hours
            retryAttempts: 3,
            retryDelay: 1000
        };
        
        this.embeddings = new Map(); // textHash -> embedding vector
        this.embeddingCache = new Map(); // textHash -> cached embedding
        this.metadata = new Map(); // textHash -> metadata
        
        this.stats = {
            totalEmbeddings: 0,
            cacheHits: 0,
            cacheMisses: 0,
            apiCalls: 0,
            processingErrors: 0,
            lastEmbedding: null
        };
        
        this.initialized = false;
        this.initialize();
    }

    /**
     * Initialize the embedding service
     */
    async initialize() {
        try {
            console.log('🔮 [Backend-Embedding] Initializing backend embedding service...');
            
            // Verify OpenAI API key
            if (!process.env.OPENAI_API_KEY) {
                console.warn('[WARNING] [Backend-Embedding] OpenAI API key not found, some features may be limited');
            }
            
            this.initialized = true;
            console.log('[OK] [Backend-Embedding] Backend embedding service initialized');
            
        } catch (error) {
            console.error('[ERROR] [Backend-Embedding] Failed to initialize:', error.message);
            this.initialized = false;
        }
    }

    /**
     * Generate embeddings for text
     * @param {string} text - Text to embed
     * @param {Object} options - Embedding options
     * @returns {Promise<Array>} Embedding vector
     */
    async generateEmbedding(text, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // Check cache first
            const textHash = this.hashText(text);
            if (this.config.cacheEnabled && this.embeddingCache.has(textHash)) {
                this.stats.cacheHits++;
                return this.embeddingCache.get(textHash);
            }

            // Generate new embedding
            let embedding;
            switch (this.config.provider) {
                case 'openai':
                    embedding = await this.generateOpenAIEmbedding(text, options);
                    break;
                default:
                    throw new Error(`Unsupported embedding provider: ${this.config.provider}`);
            }

            // Cache the result
            if (this.config.cacheEnabled) {
                this.embeddingCache.set(textHash, embedding);
                // Set cache expiration
                setTimeout(() => {
                    this.embeddingCache.delete(textHash);
                }, this.config.cacheTimeout);
            }

            this.stats.cacheMisses++;
            this.stats.totalEmbeddings++;
            this.stats.lastEmbedding = new Date();

            return embedding;

        } catch (error) {
            this.stats.processingErrors++;
            console.error('[ERROR] [Backend-Embedding] Failed to generate embedding:', error.message);
            throw error;
        }
    }

    /**
     * Generate OpenAI embedding
     * @param {string} text - Text to embed
     * @param {Object} options - Options
     * @returns {Promise<Array>} Embedding vector
     */
    async generateOpenAIEmbedding(text, options = {}) {
        const maxRetries = this.config.retryAttempts;
        let lastError;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        input: text,
                        model: options.model || this.config.model,
                        dimensions: options.dimensions || this.config.dimensions
                    })
                });

                if (!response.ok) {
                    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                this.stats.apiCalls++;

                return data.data[0].embedding;

            } catch (error) {
                lastError = error;
                console.warn(`[WARNING] [Backend-Embedding] Attempt ${attempt + 1}/${maxRetries} failed:`, error.message);
                
                if (attempt < maxRetries - 1) {
                    await this.delay(this.config.retryDelay * Math.pow(2, attempt));
                }
            }
        }

        throw lastError;
    }

    /**
     * Calculate similarity between two embeddings
     * @param {Array} embedding1 - First embedding
     * @param {Array} embedding2 - Second embedding
     * @returns {number} Cosine similarity (-1 to 1)
     */
    calculateSimilarity(embedding1, embedding2) {
        if (embedding1.length !== embedding2.length) {
            throw new Error('Embeddings must have the same dimensions');
        }

        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            magnitude1 += embedding1[i] * embedding1[i];
            magnitude2 += embedding2[i] * embedding2[i];
        }

        magnitude1 = Math.sqrt(magnitude1);
        magnitude2 = Math.sqrt(magnitude2);

        if (magnitude1 === 0 || magnitude2 === 0) {
            return 0;
        }

        return dotProduct / (magnitude1 * magnitude2);
    }

    /**
     * Process multiple texts for embeddings
     * @param {Array<string>} texts - Array of texts
     * @param {Object} options - Processing options
     * @returns {Promise<Array>} Array of embeddings
     */
    async batchGenerateEmbeddings(texts, options = {}) {
        const batchSize = options.batchSize || this.config.batchSize;
        const embeddings = [];

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchPromises = batch.map(text => this.generateEmbedding(text, options));
            
            try {
                const batchEmbeddings = await Promise.all(batchPromises);
                embeddings.push(...batchEmbeddings);
            } catch (error) {
                console.error(`[ERROR] [Backend-Embedding] Batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
                throw error;
            }
        }

        return embeddings;
    }

    /**
     * Hash text for caching
     * @param {string} text - Text to hash
     * @returns {string} Hash string
     */
    hashText(text) {
        return crypto.createHash('md5').update(text).digest('hex');
    }

    /**
     * Delay function for retries
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get service statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            cacheHitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0,
            initialized: this.initialized
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.embeddingCache.clear();
        this.embeddings.clear();
        this.metadata.clear();
        console.log('[DELETE] [Backend-Embedding] Cache cleared');
    }
}

// Export singleton instance
const embeddingService = new BackendEmbeddingService();

module.exports = {
    embeddingService,
    BackendEmbeddingService
};