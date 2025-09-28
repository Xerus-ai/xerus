/**
 * XERUS AGENT DATA MANAGER
 * Unified AI Agent Data Management - SQLite + Neon PostgreSQL Integration
 * 
 * Features:
 * - Dual database architecture (PostgreSQL production + SQLite guest/offline)
 * - Intelligent connection routing based on user context
 * - Data synchronization between databases
 * - Agent personality persistence across sessions
 * - Offline mode support with automatic sync
 * - Production-ready with comprehensive error handling
 */

const { EventEmitter } = require('events');
const { createLogger } = require('../../common/services/logger.js');
const { agentPersonalityManager } = require('./agent-personality-manager.js');

// Import the agents API client for API-only communication
const { AgentsApiClient } = require('./api-client.js');

// API client instance - Phase 1 Fix: API-only architecture
let agentsApiClient = null;

const loadConnections = async () => {
    // Phase 1 Fix: API-only communication - no direct database access
    try {
        agentsApiClient = new AgentsApiClient({
            baseUrl: process.env.BACKEND_URL || 'http://localhost:5001',
            timeout: 30000
        });
        
        logger.info('[AgentDataManager] API client initialized successfully');
        logger.info('[AgentDataManager] Phase 1 Fix: API-only agent data access');
        
    } catch (error) {
        logger.error('[AgentDataManager] Failed to initialize API client:', error);
        throw error; // Don't fallback to memory mode - ensure backend is working
    }
};

const logger = createLogger('AgentDataManager');

class AgentDataManager extends EventEmitter {
    constructor() {
        super();
        
        this.state = {
            isInitialized: false,
            connectionMode: 'api', // 'api' or 'memory'
            connectionHealth: {
                api: false
            }
        };
        
        this._initializing = false; // Track concurrent initialization attempts
        
        this.agentCache = new Map();
        
        logger.info('[AgentDataManager] Agent data manager created');
    }

    /**
     * Initialize the agent data management system (singleton pattern)
     */
    async initialize(options = {}) {
        // Prevent multiple concurrent initializations
        if (this.state.isInitialized) {
            logger.info('[AgentDataManager] Already initialized, skipping');
            return;
        }
        
        if (this._initializing) {
            logger.info('[AgentDataManager] Already initializing, waiting...');
            return new Promise((resolve, reject) => {
                this.once('initialized', resolve);
                this.once('initializationFailed', reject);
            });
        }
        
        this._initializing = true;

        try {
            logger.info('[AgentDataManager] Initializing agent data manager...');
            
            // Initialize API client
            await loadConnections();
            
            // Set API-only mode
            this.state.connectionMode = 'api';
            this.state.connectionHealth = { api: true };
            
            // Initialize agent personality manager integration
            await this.initializePersonalityIntegration();
            
            // Load initial agent data from API
            await this.loadInitialAgentData();
            
            this.state.isInitialized = true;
            this._initializing = false;
            
            logger.info('[AgentDataManager] Agent data manager initialized successfully', {
                connectionMode: this.state.connectionMode,
                healthStatus: this.state.connectionHealth
            });
            
            this.emit('initialized', {
                connectionMode: this.state.connectionMode,
                healthStatus: this.state.connectionHealth
            });
            
        } catch (error) {
            this._initializing = false;
            logger.error('Failed to initialize agent data manager:', { error });
            this.emit('initializationFailed', error);
            throw error;
        }
    }

    /**
     * Check health of API connection
     */
    async checkConnectionHealth() {
        try {
            // Simple API health check - attempt to get agents
            const agents = await agentsApiClient.getAgents({ limit: 1 });
            this.state.connectionHealth.api = true;
            logger.info('[AgentDataManager] API connection healthy');
        } catch (error) {
            this.state.connectionHealth.api = false;
            logger.warn('API health check failed:', { error: error.message });
        }
    }

    /**
     * Determine connection mode - API-only architecture
     */
    determineConnectionMode() {
        return this.state.connectionHealth.api ? 'api' : 'memory';
    }

    /**
     * Initialize personality manager integration
     */
    async initializePersonalityIntegration() {
        try {
            // Ensure personality manager is initialized
            if (agentPersonalityManager && !agentPersonalityManager.initialized) {
                await agentPersonalityManager.initialize();
            }

            // Subscribe to personality events if available
            if (agentPersonalityManager) {
                agentPersonalityManager.on('personalitySwitched', (data) => {
                    this.onPersonalitySwitched(data);
                });

                agentPersonalityManager.on('personalityApplied', (data) => {
                    this.onPersonalityApplied(data);
                });
            }

            logger.info('[AgentDataManager] Personality integration initialized');
        } catch (error) {
            logger.warn('Personality integration failed, continuing without it:', { error: error.message });
            // Don't throw error, continue without personality integration
        }
    }

    /**
     * Load initial agent data from available databases
     */
    async loadInitialAgentData() {
        try {
            const agents = await this.getAllAgents();
            
            // Cache agents for quick access
            agents.forEach(agent => {
                this.agentCache.set(agent.id, agent);
            });
            
            logger.info(`[AgentDataManager] Loaded ${agents.length} agents into cache`);
        } catch (error) {
            logger.error('Failed to load initial agent data:', { error });
            // Continue initialization even if agent loading fails
        }
    }

    /**
     * Get all agents from API
     */
    async getAllAgents(filters = {}) {
        try {
            if (this.state.connectionMode === 'api') {
                const agents = await agentsApiClient.getAgents(filters);
                return agents;
            } else {
                return this.getAgentsFromCache(filters);
            }
        } catch (error) {
            logger.error('Failed to get all agents:', { error });
            return this.getAgentsFromCache(filters);
        }
    }


    /**
     * Get agents from memory cache (fallback)
     */
    getAgentsFromCache(filters = {}) {
        let agents = Array.from(this.agentCache.values());
        
        // Apply filters
        if (filters.personality_type) {
            agents = agents.filter(agent => agent.personality_type === filters.personality_type);
        }
        
        if (filters.is_active !== undefined) {
            agents = agents.filter(agent => agent.is_active === filters.is_active);
        }
        
        if (filters.ai_model) {
            agents = agents.filter(agent => agent.ai_model === filters.ai_model);
        }
        
        // Apply pagination
        const offset = filters.offset || 0;
        const limit = filters.limit || 50;
        
        return agents
            .sort((a, b) => {
                if (a.is_default !== b.is_default) return b.is_default - a.is_default;
                if (a.usage_count !== b.usage_count) return b.usage_count - a.usage_count;
                return a.name.localeCompare(b.name);
            })
            .slice(offset, offset + limit);
    }

    /**
     * Get agent by ID from API
     */
    async getAgentById(id) {
        try {
            // Check cache first
            if (this.agentCache.has(id)) {
                return this.agentCache.get(id);
            }

            if (this.state.connectionMode === 'api') {
                const agent = await agentsApiClient.getAgent(id);
                if (agent) this.agentCache.set(id, agent);
                return agent;
            } else {
                return this.agentCache.get(id) || null;
            }
        } catch (error) {
            logger.error('Failed to get agent by ID:', { id, error });
            return this.agentCache.get(id) || null;
        }
    }

    /**
     * Create new agent via API
     */
    async createAgent(agentData) {
        try {
            if (this.state.connectionMode !== 'api') {
                throw new Error('API connection not available for create operation');
            }

            const result = await agentsApiClient.createAgent(agentData);
            
            if (result.success && result.agent) {
                // Update cache
                this.agentCache.set(result.agent.id, result.agent);
                this.emit('agentCreated', result.agent);
                return result.agent;
            } else {
                throw new Error(result.error?.message || 'Agent creation failed');
            }
        } catch (error) {
            logger.error('Failed to create agent:', { error });
            throw error;
        }
    }


    /**
     * Update agent via API
     */
    async updateAgent(id, updateData) {
        try {
            if (this.state.connectionMode !== 'api') {
                throw new Error('API connection not available for update operation');
            }

            const result = await agentsApiClient.updateAgent(id, updateData);
            
            if (result.success && result.agent) {
                // Update cache
                this.agentCache.set(id, result.agent);
                this.emit('agentUpdated', result.agent);
                return result.agent;
            } else {
                throw new Error(result.error?.message || 'Agent update failed');
            }
        } catch (error) {
            logger.error('Failed to update agent:', { id, error });
            throw error;
        }
    }


    /**
     * Delete agent via API
     */
    async deleteAgent(id) {
        try {
            if (this.state.connectionMode !== 'api') {
                throw new Error('API connection not available for delete operation');
            }

            const result = await agentsApiClient.deleteAgent(id);
            
            if (result.success) {
                // Remove from cache
                this.agentCache.delete(id);
                this.emit('agentDeleted', { id });
                return true;
            } else {
                throw new Error(result.error?.message || 'Agent deletion failed');
            }
        } catch (error) {
            logger.error('Failed to delete agent:', { id, error });
            throw error;
        }
    }



    /**
     * Handle personality switch events
     */
    onPersonalitySwitched(data) {
        logger.info('[AgentDataManager] Personality switched:', {
            from: data.previous,
            to: data.current
        });
        
        this.emit('personalitySwitched', data);
    }

    /**
     * Handle personality applied events
     */
    onPersonalityApplied(data) {
        logger.debug('[AgentDataManager] Personality applied:', {
            personality: data.personality.id,
            traits: data.traits
        });
        
        this.emit('personalityApplied', data);
    }

    /**
     * Get system status
     */
    getStatus() {
        return {
            isInitialized: this.state.isInitialized,
            connectionMode: this.state.connectionMode,
            connectionHealth: this.state.connectionHealth,
            cacheSize: this.agentCache.size
        };
    }

    /**
     * Shutdown the agent data manager
     */
    async shutdown() {
        logger.info('[AgentDataManager] Shutting down agent data manager...');
        
        try {
            // Clear cache
            this.agentCache.clear();
            
            // Remove event listeners
            this.removeAllListeners();
            
            this.state.isInitialized = false;
            
            logger.info('[AgentDataManager] Agent data manager shutdown completed');
        } catch (error) {
            logger.error('Error during agent data manager shutdown:', { error });
        }
    }
}


// Export singleton instance
const agentDataManager = new AgentDataManager();

module.exports = {
    agentDataManager,
    AgentDataManager
};