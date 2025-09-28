/**
 * XERUS MEMORY API CLIENT
 * Frontend client for backend memory microservice
 * 
 * Integrates with:
 * - POST /api/memory/working/:agentId/:userId (store references)
 * - POST /api/memory/episodic/:agentId/:userId (store full visual data)
 * - POST /api/memory/semantic/:agentId/:userId (store knowledge)
 * - POST /api/memory/procedural/:agentId/:userId/behavior (store patterns)
 * - GET /api/memory/instance/:agentId/:userId (get stats)
 * - GET /api/memory/health (system health)
 */

const { createLogger } = require('../../common/services/logger.js');

const logger = createLogger('MemoryApiClient');

class MemoryApiClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:5001';
        this.apiVersion = options.apiVersion || 'v1/memory'; // /api/v1/memory/* endpoints
        this.timeout = options.timeout || 30000;
        
        // Authentication context
        this.authToken = null;
        this.userId = null;
        this.userPermissions = [];
        this.isGuest = false;
        
        logger.info('[MemoryApiClient] API client created', {
            baseUrl: this.baseUrl,
            apiVersion: this.apiVersion
        });
    }
    
    /**
     * Set authentication context
     */
    setAuthContext(authContext = {}) {
        this.authToken = authContext.token || null;
        this.userId = authContext.userId || null;
        this.userPermissions = authContext.permissions || [];
        this.isGuest = authContext.isGuest || false;
        
        logger.info('[MemoryApiClient] Auth context updated', {
            hasToken: !!this.authToken,
            userId: this.userId,
            isGuest: this.isGuest,
            permissions: this.userPermissions
        });
    }
    
    // =============================================================================
    // WORKING MEMORY OPERATIONS (References Only)
    // =============================================================================
    
    /**
     * Store reference in working memory (no image duplication)
     */
    async storeWorkingMemory(agentId, userId, referenceData) {
        try {
            const url = this._buildUrl(`/working/${agentId}/${userId}`);
            
            const payload = {
                type: referenceData.type || 'visual_reference',
                content: referenceData.content || referenceData,
                metadata: {
                    ...referenceData.metadata,
                    timestamp: new Date(),
                    source: 'frontend_memory_client'
                }
            };
            
            const response = await this._makeRequest('POST', url, payload);
            
            if (!response.ok) {
                throw new Error(`Memory API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            logger.info('[MemoryApiClient] Working memory reference stored', {
                agentId,
                userId,
                type: payload.type,
                success: result.success
            });
            
            return result;
            
        } catch (error) {
            logger.error('[MemoryApiClient] Failed to store working memory:', { error });
            throw new Error(`Failed to store working memory reference: ${error.message}`);
        }
    }
    
    /**
     * Get working memory context
     */
    async getWorkingMemory(agentId, userId, options = {}) {
        try {
            const limit = options.limit || 10;
            const url = this._buildUrl(`/working/${agentId}/${userId}`, { limit });
            
            const response = await this._makeRequest('GET', url);
            
            if (!response.ok) {
                throw new Error(`Memory API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            logger.info('[MemoryApiClient] Working memory retrieved', {
                agentId,
                userId,
                itemCount: result.data?.context?.length || 0
            });
            
            return result.data;
            
        } catch (error) {
            logger.error('[MemoryApiClient] Failed to get working memory:', { error });
            throw new Error(`Failed to retrieve working memory: ${error.message}`);
        }
    }
    
    // =============================================================================
    // EPISODIC MEMORY OPERATIONS (Full Visual Data Storage)
    // =============================================================================
    
    /**
     * Store full visual data in episodic memory (single source of truth)
     */
    async storeEpisodicMemory(agentId, userId, episodicData) {
        try {
            const url = this._buildUrl(`/episodic/${agentId}/${userId}`);
            
            const payload = {
                content: episodicData.content || episodicData,
                response: episodicData.response || null,
                context: episodicData.context || {},
                importance: episodicData.importance || 0.7 // Higher importance for visual memories
            };
            
            const response = await this._makeRequest('POST', url, payload);
            
            if (!response.ok) {
                throw new Error(`Memory API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            logger.info('[MemoryApiClient] Episodic memory stored', {
                agentId,
                userId,
                episodeId: result.episodeId,
                type: episodicData.content?.type,
                hasScreenshot: !!episodicData.content?.screenshot
            });
            
            return {
                success: result.success,
                id: result.episodeId,
                message: result.message
            };
            
        } catch (error) {
            logger.error('[MemoryApiClient] Failed to store episodic memory:', { 
                error: error.message,
                stack: error.stack,
                agentId,
                userId,
                url,
                payload: JSON.stringify(payload, null, 2)
            });
            throw new Error(`Failed to store episodic memory: ${error.message}`);
        }
    }
    
    /**
     * Search episodic memories
     */
    async searchEpisodicMemory(agentId, userId, query, options = {}) {
        try {
            const limit = options.limit || 10;
            const offset = options.offset || 0;
            
            const url = this._buildUrl(`/episodic/${agentId}/${userId}`, { 
                query, 
                limit, 
                offset 
            });
            
            const response = await this._makeRequest('GET', url);
            
            if (!response.ok) {
                throw new Error(`Memory API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            logger.info('[MemoryApiClient] Episodic memory searched', {
                agentId,
                userId,
                query,
                resultCount: result.data?.episodes?.length || 0
            });
            
            return result.data;
            
        } catch (error) {
            logger.error('[MemoryApiClient] Failed to search episodic memory:', { error });
            throw new Error(`Failed to search episodic memory: ${error.message}`);
        }
    }
    
    // =============================================================================
    // SEMANTIC MEMORY OPERATIONS (Knowledge Storage)
    // =============================================================================
    
    /**
     * Store knowledge in semantic memory
     */
    async storeSemanticMemory(agentId, userId, knowledgeData) {
        try {
            const url = this._buildUrl(`/semantic/${agentId}/${userId}`);
            
            const payload = {
                content: knowledgeData.content || knowledgeData,
                title: knowledgeData.title || 'Untitled Knowledge',
                category: knowledgeData.category || 'general',
                importance: knowledgeData.importance || 0.7
            };
            
            const response = await this._makeRequest('POST', url, payload);
            
            if (!response.ok) {
                throw new Error(`Memory API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            logger.info('[MemoryApiClient] Semantic memory stored', {
                agentId,
                userId,
                knowledgeId: result.knowledgeId,
                title: payload.title
            });
            
            return {
                success: result.success,
                id: result.knowledgeId,
                message: result.message
            };
            
        } catch (error) {
            logger.error('[MemoryApiClient] Failed to store semantic memory:', { error });
            throw new Error(`Failed to store semantic memory: ${error.message}`);
        }
    }
    
    // =============================================================================
    // PROCEDURAL MEMORY OPERATIONS (Behavior Patterns)
    // =============================================================================
    
    /**
     * Record behavior pattern in procedural memory
     */
    async storeProceduralMemory(agentId, userId, behaviorData) {
        try {
            const url = this._buildUrl(`/procedural/${agentId}/${userId}/behavior`);
            
            const payload = {
                pattern: behaviorData.pattern || behaviorData,
                context: behaviorData.context || {},
                success: behaviorData.success !== undefined ? behaviorData.success : true
            };
            
            const response = await this._makeRequest('POST', url, payload);
            
            if (!response.ok) {
                throw new Error(`Memory API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            logger.info('[MemoryApiClient] Procedural memory recorded', {
                agentId,
                userId,
                pattern: typeof payload.pattern === 'string' ? payload.pattern : 'object',
                success: payload.success
            });
            
            return result;
            
        } catch (error) {
            logger.error('[MemoryApiClient] Failed to store procedural memory:', { error });
            throw new Error(`Failed to store procedural memory: ${error.message}`);
        }
    }
    
    // =============================================================================
    // MEMORY SYSTEM UTILITIES
    // =============================================================================
    
    /**
     * Get memory instance statistics
     */
    async getMemoryStats(agentId, userId) {
        try {
            const url = this._buildUrl(`/instance/${agentId}/${userId}`);
            
            const response = await this._makeRequest('GET', url);
            
            if (!response.ok) {
                throw new Error(`Memory API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            return result.data;
            
        } catch (error) {
            logger.error('[MemoryApiClient] Failed to get memory stats:', { error });
            throw new Error(`Failed to get memory statistics: ${error.message}`);
        }
    }
    
    /**
     * Check memory system health
     */
    async checkMemoryHealth() {
        try {
            const url = this._buildUrl('/health');
            
            const response = await this._makeRequest('GET', url);
            
            if (!response.ok) {
                throw new Error(`Memory API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            return result.data;
            
        } catch (error) {
            logger.error('[MemoryApiClient] Health check failed:', { error });
            throw new Error(`Memory health check failed: ${error.message}`);
        }
    }
    
    // =============================================================================
    // HELPER METHODS
    // =============================================================================
    
    /**
     * Build API URL with query parameters
     */
    _buildUrl(endpoint, params = {}) {
        let url = `${this.baseUrl}/api/${this.apiVersion}${endpoint}`;
        
        const queryString = new URLSearchParams();
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                queryString.append(key, params[key]);
            }
        });
        
        const query = queryString.toString();
        if (query) {
            url += `?${query}`;
        }
        
        return url;
    }
    
    /**
     * Make HTTP request with resource pool management
     */
    async _makeRequest(method, url, body = null) {
        try {
            logger.info('[MemoryApiClient] Making HTTP request', {
                method,
                url,
                hasBody: !!body,
                bodyType: typeof body,
                timeout: this.timeout
            });

            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Xerus-Memory-Client/1.0'
            };
            
            // Add authentication if available
            if (this.authToken) {
                headers['Authorization'] = `Bearer ${this.authToken}`;
            }
            
            // Add user context headers
            if (this.userId) {
                headers['X-User-ID'] = this.userId;
            }
            if (this.isGuest) {
                headers['X-Guest-Mode'] = 'true';
            }
            
            const options = {
                method,
                headers
            };
            
            if (body && (method === 'POST' || method === 'PUT')) {
                options.body = JSON.stringify(body);
            }
            
            logger.info('[MemoryApiClient] Fetch options', {
                method: options.method,
                url,
                headers: Object.keys(headers),
                hasBody: !!options.body,
                bodyLength: options.body ? options.body.length : 0
            });
            
            const response = await fetch(url, options);
            
            logger.info('[MemoryApiClient] HTTP response received', {
                url,
                status: response.status,
                statusText: response.statusText,
                ok: response.ok
            });
            
            return response;
        } catch (error) {
            logger.error('[MemoryApiClient] HTTP request failed', {
                method,
                url,
                error: error.message,
                stack: error.stack,
                name: error.name,
                code: error.code
            });
            throw error;
        }
    }
}

module.exports = MemoryApiClient;