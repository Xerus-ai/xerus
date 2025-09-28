/**
 * XERUS AGENTS API CLIENT
 * Frontend client for backend agents microservice
 * 
 * Integrates with:
 * - GET /api/v1/agents (list agents)
 * - GET /api/v1/agents/:id (get agent)
 * - POST /api/v1/agents (create agent)
 * - PUT /api/v1/agents/:id (update agent)
 * - DELETE /api/v1/agents/:id (delete agent)
 * - POST /api/v1/agents/:id/execute (execute agent chat)
 * - GET /api/v1/agents/:id/analytics (get analytics)
 * - POST /api/v1/agents/:id/set-default (set as default)
 * - GET/POST /api/v1/agents/:id/knowledge (knowledge management)
 * - GET/POST /api/v1/agents/:id/tools (tool management)
 */

const { createLogger } = require('../../common/services/logger.js');
const { resourcePoolManager } = require('../../common/services/resource-pool-manager.js');

const logger = createLogger('AgentsApiClient');

class AgentsApiClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:5001';
        this.apiVersion = options.apiVersion || 'v1';
        this.timeout = options.timeout || 30000;
        
        // Authentication context
        this.authToken = null;
        this.userId = null;
        this.userPermissions = [];
        this.isGuest = false;
        
        logger.info('[AgentsApiClient] API client created', {
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
        
        logger.info('[AgentsApiClient] Auth context updated', {
            hasToken: !!this.authToken,
            userId: this.userId,
            isGuest: this.isGuest,
            permissions: this.userPermissions
        });
    }
    
    /**
     * Get all agents with filtering
     */
    async getAgents(filters = {}) {
        try {
            const url = this._buildUrl('/agents', filters);
            const response = await this._makeRequest('GET', url);
            
            if (!response.ok) {
                throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
            }
            
            const agents = await response.json();
            logger.info(`[AgentsApiClient] Retrieved ${agents.length} agents from backend`);
            
            return agents.map(agent => ({
                id: agent.id, // Backend returns 'id', not 'agent_id'
                name: agent.name, // Backend returns 'name', not 'agent_name'  
                description: agent.description,
                personalityType: agent.personality_type,
                isActive: agent.is_active,
                aiModel: agent.ai_model,
                systemPrompt: agent.system_prompt,
                ttsEnabled: agent.tts_enabled || false, // Map TTS enabled setting
                capabilities: agent.capabilities || [],
                knowledgeSources: agent.knowledge_sources || [],
                toolAssignments: agent.tool_assignments || [],
                tools: agent.tools || [], // Add tools field
                createdAt: agent.created_at,
                updatedAt: agent.updated_at
            }));
            
        } catch (error) {
            logger.error('[AgentsApiClient] Failed to get agents:', { error });
            throw new Error(`Failed to fetch agents: ${error.message}`);
        }
    }
    
    /**
     * Get agent by ID
     */
    async getAgent(agentId) {
        try {
            const url = this._buildUrl(`/agents/${agentId}`);
            const response = await this._makeRequest('GET', url);
            
            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
            }
            
            const agent = await response.json();
            return {
                id: agent.id, // Backend returns 'id', not 'agent_id'
                name: agent.name, // Backend returns 'name', not 'agent_name'
                description: agent.description,
                personalityType: agent.personality_type,
                isActive: agent.is_active,
                aiModel: agent.ai_model,
                systemPrompt: agent.system_prompt,
                capabilities: agent.capabilities || [],
                knowledgeSources: agent.knowledge_sources || [],
                toolAssignments: agent.tool_assignments || [],
                tools: agent.tools || [], // Add tools field
                createdAt: agent.created_at,
                updatedAt: agent.updated_at
            };
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Failed to get agent ${agentId}:`, { error });
            throw error;
        }
    }
    
    /**
     * Create new agent
     */
    async createAgent(agentData) {
        try {
            const url = this._buildUrl('/agents');
            const payload = {
                agent_name: agentData.name,
                description: agentData.description,
                personality_type: agentData.personalityType,
                ai_model: agentData.aiModel,
                system_prompt: agentData.systemPrompt,
                capabilities: agentData.capabilities || [],
                knowledge_sources: agentData.knowledgeSources || [],
                tool_assignments: agentData.toolAssignments || [],
                is_active: agentData.isActive !== undefined ? agentData.isActive : true
            };
            
            logger.info('[AgentsApiClient] Creating agent:', { name: agentData.name });
            
            const response = await this._makeRequest('POST', url, payload);
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    const errorData = await response.json();
                    return {
                        success: false,
                        error: {
                            message: errorData.message || 'Permission denied',
                            code: errorData.code || 'AUTH_REQUIRED',
                            type: 'AuthenticationError'
                        }
                    };
                }
                
                throw new Error(`Agent creation failed: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            logger.info('[AgentsApiClient] Agent created successfully:', { agentId: result.agent_id });
            
            return {
                success: true,
                agent: {
                    id: result.agent_id,
                    name: result.agent_name,
                    description: result.description,
                    personalityType: result.personality_type,
                    isActive: result.is_active,
                    aiModel: result.ai_model,
                    systemPrompt: result.system_prompt,
                    capabilities: result.capabilities || [],
                    knowledgeSources: result.knowledge_sources || [],
                    toolAssignments: result.tool_assignments || [],
                    createdAt: result.created_at,
                    updatedAt: result.updated_at
                }
            };
            
        } catch (error) {
            logger.error('[AgentsApiClient] Agent creation failed:', { error });
            return {
                success: false,
                error: {
                    message: error.message,
                    type: error.constructor.name
                }
            };
        }
    }
    
    /**
     * Update agent
     */
    async updateAgent(agentId, agentData) {
        try {
            const url = this._buildUrl(`/agents/${agentId}`);
            const payload = {
                agent_name: agentData.name,
                description: agentData.description,
                personality_type: agentData.personalityType,
                ai_model: agentData.aiModel,
                system_prompt: agentData.systemPrompt,
                capabilities: agentData.capabilities || [],
                knowledge_sources: agentData.knowledgeSources || [],
                tool_assignments: agentData.toolAssignments || [],
                is_active: agentData.isActive
            };
            
            logger.info(`[AgentsApiClient] Updating agent: ${agentId}`);
            
            const response = await this._makeRequest('PUT', url, payload);
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    const errorData = await response.json();
                    return {
                        success: false,
                        error: {
                            message: errorData.message || 'Permission denied',
                            code: errorData.code || 'AUTH_REQUIRED',
                            type: 'AuthenticationError'
                        }
                    };
                }
                
                throw new Error(`Agent update failed: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            logger.info('[AgentsApiClient] Agent updated successfully:', { agentId });
            
            return {
                success: true,
                agent: {
                    id: result.agent_id,
                    name: result.agent_name,
                    description: result.description,
                    personalityType: result.personality_type,
                    isActive: result.is_active,
                    aiModel: result.ai_model,
                    systemPrompt: result.system_prompt,
                    capabilities: result.capabilities || [],
                    knowledgeSources: result.knowledge_sources || [],
                    toolAssignments: result.tool_assignments || [],
                    createdAt: result.created_at,
                    updatedAt: result.updated_at
                }
            };
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Agent update failed: ${agentId}:`, { error });
            return {
                success: false,
                error: {
                    message: error.message,
                    type: error.constructor.name
                }
            };
        }
    }
    
    /**
     * Delete agent
     */
    async deleteAgent(agentId) {
        try {
            const url = this._buildUrl(`/agents/${agentId}`);
            
            logger.info(`[AgentsApiClient] Deleting agent: ${agentId}`);
            
            const response = await this._makeRequest('DELETE', url);
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    const errorData = await response.json();
                    return {
                        success: false,
                        error: {
                            message: errorData.message || 'Permission denied',
                            code: errorData.code || 'AUTH_REQUIRED',
                            type: 'AuthenticationError'
                        }
                    };
                }
                
                throw new Error(`Agent deletion failed: ${response.status} ${response.statusText}`);
            }
            
            logger.info('[AgentsApiClient] Agent deleted successfully:', { agentId });
            
            return {
                success: true,
                message: 'Agent deleted successfully'
            };
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Agent deletion failed: ${agentId}:`, { error });
            return {
                success: false,
                error: {
                    message: error.message,
                    type: error.constructor.name
                }
            };
        }
    }
    
    /**
     * Execute agent chat
     */
    async executeAgent(agentId, chatRequest) {
        try {
            const url = this._buildUrl(`/agents/${agentId}/execute`);
            const payload = {
                input: chatRequest.message,
                conversation_history: chatRequest.conversationHistory || [],
                context: chatRequest.context || {}
            };
            
            logger.info(`[AgentsApiClient] Executing agent chat: ${agentId}`);
            
            const response = await this._makeRequest('POST', url, payload);
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    const errorData = await response.json();
                    return {
                        success: false,
                        error: {
                            message: errorData.message || 'Permission denied',
                            code: errorData.code || 'AUTH_REQUIRED',
                            type: 'AuthenticationError'
                        }
                    };
                }
                
                throw new Error(`Agent execution failed: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            logger.info('[AgentsApiClient] Agent execution completed:', { agentId });
            
            return {
                success: true,
                response: result.response,
                metadata: {
                    agentId,
                    executionTime: result.execution_time,
                    timestamp: result.timestamp,
                    tokensUsed: result.tokens_used
                }
            };
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Agent execution failed: ${agentId}:`, { error });
            return {
                success: false,
                error: {
                    message: error.message,
                    type: error.constructor.name
                }
            };
        }
    }
    
    /**
     * Get agent analytics
     */
    async getAgentAnalytics(agentId) {
        try {
            const url = this._buildUrl(`/agents/${agentId}/analytics`);
            const response = await this._makeRequest('GET', url);
            
            if (!response.ok) {
                throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Failed to get agent analytics for ${agentId}:`, { error });
            return null;
        }
    }
    
    /**
     * Set agent as default
     */
    async setDefaultAgent(agentId) {
        try {
            const url = this._buildUrl(`/agents/${agentId}/set-default`);
            const response = await this._makeRequest('POST', url);
            
            if (!response.ok) {
                throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            logger.info('[AgentsApiClient] Default agent set:', { agentId });
            
            return {
                success: true,
                message: result.message
            };
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Failed to set default agent ${agentId}:`, { error });
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get agent knowledge sources
     */
    async getAgentKnowledge(agentId) {
        try {
            const url = this._buildUrl(`/agents/${agentId}/knowledge`);
            const response = await this._makeRequest('GET', url);
            
            if (!response.ok) {
                throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Failed to get agent knowledge for ${agentId}:`, { error });
            return [];
        }
    }
    
    /**
     * Update agent knowledge sources
     */
    async updateAgentKnowledge(agentId, knowledgeSources) {
        try {
            const url = this._buildUrl(`/agents/${agentId}/knowledge`);
            const payload = { knowledge_sources: knowledgeSources };
            
            const response = await this._makeRequest('POST', url, payload);
            
            if (!response.ok) {
                throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            logger.info('[AgentsApiClient] Agent knowledge updated:', { agentId });
            
            return {
                success: true,
                message: result.message
            };
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Failed to update agent knowledge for ${agentId}:`, { error });
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get agent tools
     */
    async getAgentTools(agentId) {
        try {
            const url = this._buildUrl(`/agents/${agentId}/tools`);
            const response = await this._makeRequest('GET', url);
            
            if (!response.ok) {
                throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Failed to get agent tools for ${agentId}:`, { error });
            return [];
        }
    }
    
    /**
     * Update agent tools
     */
    async updateAgentTools(agentId, toolAssignments) {
        try {
            const url = this._buildUrl(`/agents/${agentId}/tools`);
            const payload = { tool_assignments: toolAssignments };
            
            const response = await this._makeRequest('POST', url, payload);
            
            if (!response.ok) {
                throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            logger.info('[AgentsApiClient] Agent tools updated:', { agentId });
            
            return {
                success: true,
                message: result.message
            };
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Failed to update agent tools for ${agentId}:`, { error });
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Build API URL with query parameters
     */
    _buildUrl(endpoint, params = {}) {
        const url = new URL(`/api/${this.apiVersion}${endpoint}`, this.baseUrl);
        
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, value);
            }
        });
        
        return url.toString();
    }
    
    /**
     * Make HTTP request with authentication using ResourcePoolManager
     */
    async _makeRequest(method, url, body = null) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        // Add authentication if available
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        
        // Add user ID header for authentication
        if (this.userId) {
            headers['X-User-ID'] = this.userId;
        }
        
        // Add guest mode indicator
        if (this.isGuest) {
            headers['X-Guest-Mode'] = 'true';
        }
        
        const config = {
            method,
            headers,
            signal: AbortSignal.timeout(this.timeout)
        };
        
        if (body && method !== 'GET') {
            config.body = JSON.stringify(body);
        }
        
        try {
            // For local backend calls, use direct fetch to avoid unnecessary queuing overhead
            const isLocalBackend = url.includes('localhost') || url.includes('127.0.0.1');
            
            let response;
            if (isLocalBackend) {
                logger.debug(`[AgentsApiClient] Making direct ${method} request to local backend: ${url}`);
                
                // Use direct fetch for local backend - no need for resource pooling
                const fetchFn = globalThis.fetch || require('node-fetch');
                response = await fetchFn(url, config);
            } else {
                // Use ResourcePoolManager for external API calls
                logger.debug(`[AgentsApiClient] Making ${method} request to external API: ${url} via ResourcePoolManager`);
                response = await resourcePoolManager.queuedFetch(url, config);
            }
            
            logger.debug(`[AgentsApiClient] Request completed: ${method} ${url} - Status: ${response.status}`);
            return response;
            
        } catch (error) {
            logger.error(`[AgentsApiClient] Request failed: ${method} ${url}`, { 
                error: error.message,
                code: error.code 
            });
            
            // Re-throw for upstream error handling
            throw error;
        }
    }
    
    /**
     * Get client statistics
     */
    getStatistics() {
        return {
            baseUrl: this.baseUrl,
            apiVersion: this.apiVersion,
            hasAuth: !!this.authToken,
            isGuest: this.isGuest,
            permissions: this.userPermissions.length
        };
    }
}

// Export singleton instance
const agentsApiClient = new AgentsApiClient();

module.exports = {
    AgentsApiClient,
    agentsApiClient
};