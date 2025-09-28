/**
 * Agents Domain - Enhanced Cross-Domain Integration
 * AI Agent Management Domain with Knowledge & Tools Integration
 * 
 * This domain handles:
 * - Agent personality management and behavioral adaptation
 * - Agent data persistence (dual database: SQLite + PostgreSQL)
 * - Agent execution and lifecycle management
 * - Integration with backend agent services
 * - Cross-domain coordination with Knowledge and Tools domains
 * - Agent-specific knowledge base assignment and management
 * - Agent-specific tool assignment and permission management
 * - Personalized AI agent ecosystem with specialized capabilities
 */

// Import existing services to be integrated
const { agentPersonalityManager } = require('./agent-personality-manager.js');
const { agentDataManager } = require('./agent-data-manager.js');
const { promptManager } = require('./prompt-manager.js');
const { agentsApiClient } = require('./api-client.js');
const { createLogger } = require('../../common/services/logger.js');

const logger = createLogger('AgentsDomain');

// Import other domains for cross-domain integration
const { systemDomain } = require('../system');
const { conversationDomain, memoryManager } = require('../conversation');

// Create enhanced domain interface with cross-domain integration
class AgentsDomain {
  constructor() {
    this.personalityManager = agentPersonalityManager;
    this.dataManager = agentDataManager;
    this.promptManager = promptManager;
    this.apiClient = agentsApiClient;
    
    // Cross-domain integration references
        this.systemDomain = systemDomain;
    this.conversationDomain = conversationDomain;
    this.memoryManager = memoryManager;
    
    this.initialized = false;
    
    // Enhanced agent coordination system
    this.config = {
      enableCrossDomainIntegration: true,
      enablePersonalizedTools: true,
      enableAdaptivePersonality: true,
      enableConversationMemory: true,
      enableCrossSessionContext: true,
      maxToolsPerAgent: 20,
      personalityAdaptationThreshold: 0.7,
      conversationMemoryRetention: 24 * 60 * 60 * 1000, // 24 hours
      contextMemoryLimit: 100 // Max conversation turns to remember
    };
    
    // Agent-specific configurations and assignments
    this.agentToolAssignments = new Map();      // agentId -> tools assigned  
    this.agentPersonalityProfiles = new Map();  // agentId -> personality config
    this.agentInteractionHistory = new Map();   // agentId -> interaction patterns
    this.agentPerformanceMetrics = new Map();   // agentId -> performance data
    this.agentConversationMemory = new Map();   // agentId -> conversation context
    this.agentContextualState = new Map();      // agentId -> cross-session context
  }

  /**
   * Initialize the enhanced agents domain with cross-domain integration
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize personality manager
      if (this.personalityManager && !this.personalityManager.initialized) {
        await this.personalityManager.initialize();
      }

      // Initialize data manager
      if (this.dataManager && !this.dataManager.state.isInitialized) {
        await this.dataManager.initialize();
      }
      
      // Initialize API client with authentication context
      this.initializeApiClient();
      
      // Initialize cross-domain integrations if enabled
      if (this.config.enableCrossDomainIntegration) {
        // Initialize system domain for performance monitoring
        if (this.systemDomain) {
          await this.systemDomain.initialize();
        }
        
        // Initialize memory manager for conversation tracking
        if (this.config.enableConversationMemory && this.memoryManager) {
          await this.initializeMemoryManager();
        }
        
        // Initialize agent-specific configurations
        await this.initializeAgentConfigurations();
        
        // Set up cross-domain event listeners
        this.setupCrossDomainEventListeners();
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize agents domain: ${error.message}`);
    }
  }
  
  /**
   * Initialize agent-specific configurations and assignments
   */
  async initializeAgentConfigurations() {
    // Initialize default agent configurations
    const defaultAgentConfigs = [
      {
        id: 'productivity-agent',
        name: 'Productivity Assistant',
        personality: 'assistant',
        knowledgeSources: ['local', 'googledrive', 'notion'],
        tools: ['gmail', 'calendar', 'notion', 'asana', 'trello'],
        specializations: ['task_management', 'scheduling', 'document_organization']
      },
      {
        id: 'developer-agent', 
        name: 'Development Assistant',
        personality: 'technical_expert',
        knowledgeSources: ['local', 'github', 'documentation'],
        tools: ['github', 'gitlab', 'docker', 'jira', 'postgres'],
        specializations: ['code_analysis', 'debugging', 'architecture_review']
      },
      {
        id: 'business-agent',
        name: 'Business Assistant', 
        personality: 'professional',
        knowledgeSources: ['local', 'crm', 'business_docs'],
        tools: ['salesforce', 'hubspot', 'slack', 'jira'],
        specializations: ['client_management', 'sales_analysis', 'reporting']
      },
      {
        id: 'research-agent',
        name: 'Research Assistant',
        personality: 'analytical',
        knowledgeSources: ['local', 'web_search', 'academic_papers'],
        tools: ['web-search', 'document-search', 'calculator'],
        specializations: ['data_analysis', 'research', 'fact_checking']
      }
    ];
    
    // Initialize configurations for each agent
    for (const config of defaultAgentConfigs) {
      await this.initializeAgentConfiguration(config);
    }
  }
  
  /**
   * Initialize configuration for a specific agent
   */
  async initializeAgentConfiguration(config) {
    const { id, knowledgeSources, tools, personality, specializations } = config;
    
    // Set up tool assignments  
    if (this.config.enablePersonalizedTools && tools) {
      this.agentToolAssignments.set(id, new Set(tools));
      
    }
    
    // Set up personality profile
    if (personality) {
      this.agentPersonalityProfiles.set(id, {
        basePersonality: personality,
        specializations: specializations || [],
        adaptiveTraits: {},
        lastAdaptation: Date.now()
      });
    }
    
    // Initialize performance tracking
    this.agentPerformanceMetrics.set(id, {
      totalInteractions: 0,
      successfulInteractions: 0,
      averageResponseTime: 0,
      knowledgeHitRate: 0,
      toolUsageCount: 0,
      userSatisfactionScore: 0,
      lastInteraction: null
    });
  }
  
  /**
   * Initialize Memory Manager integration
   */
  async initializeMemoryManager() {
    if (!this.memoryManager || !this.config.enableConversationMemory) {
      return;
    }

    try {
      // Initialize memory manager if not already initialized
      if (!this.memoryManager.initialized) {
        await this.memoryManager.initialize();
      }

      // Register agent-specific memory cleanup strategies
      this.memoryManager.registerCleanupStrategy('agent-conversations', {
        priority: 4,
        description: 'Clean old agent conversation memory',
        execute: async () => {
          const now = Date.now();
          let cleaned = 0;
          
          // Clean expired conversation memory
          for (const [agentId, memory] of this.agentConversationMemory) {
            if (memory.lastActivity && (now - memory.lastActivity) > this.config.conversationMemoryRetention) {
              this.agentConversationMemory.delete(agentId);
              cleaned++;
            }
          }
          
          // Limit contextual state entries per agent
          for (const [agentId, contexts] of this.agentContextualState) {
            if (contexts.length > this.config.contextMemoryLimit) {
              const excess = contexts.length - this.config.contextMemoryLimit;
              contexts.splice(0, excess); // Remove oldest entries
              cleaned += excess;
            }
          }
          
          return cleaned;
        }
      });

      // Listen to memory events
      this.memoryManager.on('memoryWarning', (data) => {
        this.handleMemoryWarning(data);
      });

      this.memoryManager.on('emergencyCleanupCompleted', () => {
        this.handleEmergencyMemoryCleanup();
      });

    } catch (error) {
      logger.error('Failed to initialize memory manager integration:', { error });
    }
  }

  /**
   * Handle memory warning events
   */
  handleMemoryWarning(data) {
    if (data.level === 'critical') {
      // Disable memory-intensive features temporarily
      this.config.enableAdaptivePersonality = false;
      
      // Clear non-essential agent memory
      this.clearNonEssentialMemory();
      
      logger.warn(`[AgentsDomain] Critical memory warning: ${data.percent * 100}% usage, disabled adaptive personality`);
    } else if (data.level === 'warning') {
      // Reduce memory usage
      this.optimizeMemoryUsage();
      
      logger.info(`[AgentsDomain] Memory warning: ${data.percent * 100}% usage, optimizing memory`);
    }
  }

  /**
   * Handle emergency memory cleanup
   */
  handleEmergencyMemoryCleanup() {
    // Clear all non-essential agent data
    this.agentInteractionHistory.clear();
    
    // Reset personality profiles to base state
    for (const [agentId, profile] of this.agentPersonalityProfiles) {
      profile.adaptiveTraits = {};
    }
    
    // Re-enable adaptive personality after cleanup
    setTimeout(() => {
      this.config.enableAdaptivePersonality = true;
    }, 30000); // Re-enable after 30 seconds
    
    logger.info('[AgentsDomain] Emergency cleanup completed, reset agent memory');
  }

  /**
   * Clear non-essential memory to free up resources
   */
  clearNonEssentialMemory() {
    const now = Date.now();
    let cleared = 0;
    
    // Clear old interaction history
    for (const [agentId, history] of this.agentInteractionHistory) {
      const oldLength = history.length;
      const recentHistory = history.filter(interaction => 
        (now - interaction.timestamp) < (this.config.conversationMemoryRetention / 2)
      );
      this.agentInteractionHistory.set(agentId, recentHistory);
      cleared += oldLength - recentHistory.length;
    }
    
    // Clear old conversation memory
    for (const [agentId, memory] of this.agentConversationMemory) {
      if (memory.contexts && memory.contexts.length > 10) {
        memory.contexts = memory.contexts.slice(-10); // Keep only last 10 contexts
        cleared += memory.contexts.length - 10;
      }
    }
    
    logger.info(`[AgentsDomain] Cleared ${cleared} non-essential memory entries`);
  }

  /**
   * Optimize memory usage by reducing cache sizes
   */
  optimizeMemoryUsage() {
    // Reduce verbosity in personality profiles to save memory
    for (const [agentId, profile] of this.agentPersonalityProfiles) {
      if (profile.adaptiveTraits.verbosity > 0.5) {
        profile.adaptiveTraits.verbosity = Math.max(0.5, profile.adaptiveTraits.verbosity - 0.2);
      }
    }
    
    // Limit context memory per agent
    for (const [agentId, contexts] of this.agentContextualState) {
      if (contexts.length > this.config.contextMemoryLimit / 2) {
        const targetSize = Math.floor(this.config.contextMemoryLimit / 2);
        contexts.splice(0, contexts.length - targetSize);
      }
    }
  }

  /**
   * Record conversation turn for agent memory
   */
  recordConversationTurn(agentId, turn) {
    if (!this.config.enableConversationMemory) {
      return;
    }

    const now = Date.now();
    
    // Get or create conversation memory for this agent
    if (!this.agentConversationMemory.has(agentId)) {
      this.agentConversationMemory.set(agentId, {
        contexts: [],
        lastActivity: now,
        totalTurns: 0
      });
    }
    
    const memory = this.agentConversationMemory.get(agentId);
    
    // Add turn to memory
    memory.contexts.push({
      timestamp: now,
      userInput: turn.userInput || '',
      agentResponse: turn.agentResponse || '',
      tools: turn.toolsUsed || [],
      knowledge: turn.knowledgeSources || [],
      confidence: turn.confidence || 0.8
    });
    
    // Limit context size
    if (memory.contexts.length > this.config.contextMemoryLimit) {
      memory.contexts.shift();
    }
    
    memory.lastActivity = now;
    memory.totalTurns++;
  }

  /**
   * Get conversation memory for an agent
   */
  getAgentConversationMemory(agentId, limit = 10) {
    if (!this.config.enableConversationMemory || !this.agentConversationMemory.has(agentId)) {
      return [];
    }
    
    const memory = this.agentConversationMemory.get(agentId);
    return memory.contexts.slice(-limit);
  }

  /**
   * Store cross-session context for an agent
   */
  storeAgentContext(agentId, context) {
    if (!this.config.enableCrossSessionContext) {
      return;
    }

    if (!this.agentContextualState.has(agentId)) {
      this.agentContextualState.set(agentId, []);
    }
    
    const contexts = this.agentContextualState.get(agentId);
    contexts.push({
      timestamp: Date.now(),
      context,
      sessionId: Date.now().toString() // Simple session ID
    });
    
    // Limit context entries
    if (contexts.length > this.config.contextMemoryLimit) {
      contexts.shift();
    }
  }

  /**
   * Get cross-session context for an agent
   */
  getAgentContext(agentId, sessionLimit = 5) {
    if (!this.config.enableCrossSessionContext || !this.agentContextualState.has(agentId)) {
      return [];
    }
    
    const contexts = this.agentContextualState.get(agentId);
    return contexts.slice(-sessionLimit);
  }

  /**
   * Clear agent memory data
   */
  clearAgentMemory(agentId) {
    this.agentConversationMemory.delete(agentId);
    this.agentContextualState.delete(agentId);
    this.agentInteractionHistory.delete(agentId);
  }

  /**
   * Get memory statistics for monitoring
   */
  getMemoryStats() {
    return {
      conversationMemorySize: this.agentConversationMemory.size,
      contextualStateSize: this.agentContextualState.size,
      interactionHistorySize: this.agentInteractionHistory.size,
      totalConversationTurns: Array.from(this.agentConversationMemory.values())
        .reduce((sum, memory) => sum + memory.totalTurns, 0),
      totalContextEntries: Array.from(this.agentContextualState.values())
        .reduce((sum, contexts) => sum + contexts.length, 0),
      memoryManagerStatus: this.memoryManager ? this.memoryManager.getMemoryStats() : null
    };
  }

  /**
   * Set up cross-domain event listeners for coordination
   */
  setupCrossDomainEventListeners() {
    // Listen to tool execution events for performance tracking
    
    // Listen to system performance events
    if (this.systemDomain) {
      this.systemDomain.on('performanceAlert', (data) => {
        this.handleSystemPerformanceAlert(data);
      });
    }
  }

  /**
   * Get all agents with enhanced cross-domain information
   */
  async getAllAgents(filters = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    let agents = [];
    
    // Use data manager if available, otherwise fallback to backend API
    if (this.dataManager) {
      agents = await this.dataManager.getAllAgents(filters);
    } else {
      // TODO: Integrate with backend API service
      throw new Error('Agent data manager not available and backend integration not implemented');
    }
    
    // Enhance agents with cross-domain information
    if (this.config.enableCrossDomainIntegration) {
      agents = agents.map(agent => this.enhanceAgentWithCrossDomainInfo(agent));
    }
    
    return agents;
  }
  
  /**
   * Enhance agent data with cross-domain information
   */
  enhanceAgentWithCrossDomainInfo(agent) {
    const agentId = agent.id;
    
    return {
      ...agent,
      crossDomainInfo: {
        // Knowledge sources managed by backend
        assignedTools: Array.from(this.agentToolAssignments.get(agentId) || []), 
        personalityProfile: this.agentPersonalityProfiles.get(agentId) || null,
        performanceMetrics: this.agentPerformanceMetrics.get(agentId) || null,
        capabilities: {
          // Knowledge access managed by backend
          hasToolAccess: this.agentToolAssignments.has(agentId),
          hasPersonalityAdaptation: this.agentPersonalityProfiles.has(agentId),
          canAccessCrossDomainFeatures: this.config.enableCrossDomainIntegration
        }
      }
    };
  }

  /**
   * Get agent by ID
   */
  async getAgentById(id) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.dataManager) {
      return await this.dataManager.getAgentById(id);
    }

    throw new Error('Agent data manager not available');
  }

  /**
   * Create new agent
   */
  async createAgent(agentData) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.dataManager) {
      return await this.dataManager.createAgent(agentData);
    }

    throw new Error('Agent data manager not available');
  }

  /**
   * Update agent
   */
  async updateAgent(id, updateData) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.dataManager) {
      return await this.dataManager.updateAgent(id, updateData);
    }

    throw new Error('Agent data manager not available');
  }

  /**
   * Delete agent
   */
  async deleteAgent(id) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.dataManager) {
      return await this.dataManager.deleteAgent(id);
    }

    throw new Error('Agent data manager not available');
  }

  /**
   * Switch agent personality
   */
  async switchPersonality(personalityId, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.personalityManager) {
      return await this.personalityManager.switchPersonality(personalityId, context);
    }

    throw new Error('Personality manager not available');
  }

  /**
   * Apply personality traits to response
   */
  applyPersonality(response, personalityId, context = {}) {
    if (this.personalityManager) {
      return this.personalityManager.applyPersonality(response, personalityId, context);
    }

    return response; // Fallback to original response
  }

  /**
   * Execute agent with coordinated knowledge and tool access
   */
  async executeAgentTask(agentId, task, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      // Get agent configuration
      const agent = await this.getAgentById(agentId);
      if (!agent) {
        throw new Error(`Agent '${agentId}' not found`);
      }
      
      // Get agent's personality profile
      const personalityProfile = this.agentPersonalityProfiles.get(agentId);
      
      // Prepare enhanced context with cross-domain capabilities
      const enhancedContext = {
        ...context,
        agentId,
        agent,
        personalityProfile,
        // Knowledge access managed by backend
        toolAccess: this.agentToolAssignments.get(agentId),
        crossDomainEnabled: this.config.enableCrossDomainIntegration
      };
      
      // Step 1: Knowledge Retrieval (if enabled and needed)
      let knowledgeResults = null;
      if (this.config.enablePersonalizedKnowledge && task.requiresKnowledge) {
        knowledgeResults = await this.retrieveAgentKnowledge(agentId, task.query, enhancedContext);
      }
      
      
      // Step 3: Apply personality adaptation
      let personalityAdjustments = {};
      if (this.config.enableAdaptivePersonality && personalityProfile) {
        personalityAdjustments = await this.adaptAgentPersonality(agentId, task, enhancedContext);
      }
      
      // Step 3: Coordinate response generation
      const response = await this.coordinateAgentResponse({
        agent,
        task,
        knowledgeResults,
        personalityAdjustments,
        context: enhancedContext
      });
      
      // Step 4: Record conversation turn for memory
      if (this.config.enableConversationMemory) {
        this.recordConversationTurn(agentId, {
          userInput: task.query || task.input,
          agentResponse: response.content,
          knowledgeSources: knowledgeResults?.sources?.map(s => s.source) || [],
          confidence: response.confidence
        });
      }
      
      // Step 5: Store cross-session context if applicable
      if (this.config.enableCrossSessionContext && enhancedContext.storeContext) {
        this.storeAgentContext(agentId, {
          taskType: task.type,
          outcome: response.content.substring(0, 200),
          knowledgeUsed: !!knowledgeResults,
          personalityAdapted: Object.keys(personalityAdjustments).length > 0
        });
      }
      
      // Step 6: Update performance metrics
      const executionTime = Date.now() - startTime;
      this.updateAgentPerformanceMetrics(agentId, 'task_execution', {
        executionTime,
        success: true,
        knowledgeUsed: !!knowledgeResults,
        personalityAdapted: Object.keys(personalityAdjustments).length > 0
      });
      
      return {
        success: true,
        response,
        metadata: {
          agentId,
          executionTime,
          knowledgeResults: knowledgeResults?.sources || [],
          toolsUsed: toolResults?.toolsExecuted || [],
          personalityApplied: personalityProfile?.basePersonality || 'default',
          crossDomainFeaturesUsed: {
            knowledge: !!knowledgeResults,
            tools: !!toolResults,
            personality: Object.keys(personalityAdjustments).length > 0
          }
        }
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateAgentPerformanceMetrics(agentId, 'task_execution', {
        executionTime,
        success: false,
        error: error.message
      });
      
      throw new Error(`Agent task execution failed: ${error.message}`);
    }
  }
  

  /**
   * Record knowledge access for agent learning
   */
  recordKnowledgeAccess(agentId, query, resultCount) {
    if (!this.agentInteractionHistory.has(agentId)) {
      this.agentInteractionHistory.set(agentId, []);
    }
    
    const history = this.agentInteractionHistory.get(agentId);
    history.push({
      type: 'knowledge_access',
      timestamp: Date.now(),
      query: query.substring(0, 100), // Store first 100 chars
      resultCount,
      successful: resultCount > 0
    });
    
    // Keep only last 50 knowledge access records per agent
    if (history.length > 50) {
      history.shift();
    }
  }
  
  
  /**
   * Adapt agent personality based on context and interaction history
   */
  async adaptAgentPersonality(agentId, task, context = {}) {
    if (!this.personalityManager || !this.config.enableAdaptivePersonality) {
      return {};
    }
    
    const personalityProfile = this.agentPersonalityProfiles.get(agentId);
    if (!personalityProfile) {
      return {};
    }
    
    const performanceMetrics = this.agentPerformanceMetrics.get(agentId);
    const interactionHistory = this.agentInteractionHistory.get(agentId) || [];
    
    // Analyze adaptation needs
    const adaptationNeeds = this.analyzePersonalityAdaptationNeeds({
      personalityProfile,
      performanceMetrics,
      interactionHistory,
      currentTask: task,
      context
    });
    
    // Apply personality adaptations if threshold is met
    if (adaptationNeeds.score >= this.config.personalityAdaptationThreshold) {
      const adaptations = await this.personalityManager.adaptPersonality(
        personalityProfile.basePersonality,
        adaptationNeeds.adjustments,
        context
      );
      
      // Update agent's personality profile
      personalityProfile.adaptiveTraits = {
        ...personalityProfile.adaptiveTraits,
        ...adaptations
      };
      personalityProfile.lastAdaptation = Date.now();
      
      return adaptations;
    }
    
    return {};
  }
  
  /**
   * Analyze personality adaptation needs
   */
  analyzePersonalityAdaptationNeeds({ personalityProfile, performanceMetrics, interactionHistory, currentTask, context }) {
    let score = 0;
    const adjustments = {};
    
    // Analyze performance trends
    if (performanceMetrics) {
      const successRate = performanceMetrics.totalInteractions > 0 
        ? performanceMetrics.successfulInteractions / performanceMetrics.totalInteractions 
        : 1;
      
      if (successRate < 0.8) {
        score += 0.3;
        adjustments.helpfulness = Math.min(1.0, (personalityProfile.adaptiveTraits.helpfulness || 0.7) + 0.1);
        adjustments.patience = Math.min(1.0, (personalityProfile.adaptiveTraits.patience || 0.7) + 0.1);
      }
      
      if (performanceMetrics.averageResponseTime > 5000) { // > 5 seconds
        score += 0.2;
        adjustments.verbosity = Math.max(0.1, (personalityProfile.adaptiveTraits.verbosity || 0.7) - 0.1);
      }
    }
    
    // Analyze task complexity
    if (currentTask.complexity === 'high') {
      score += 0.2;
      adjustments.technical_depth = Math.min(1.0, (personalityProfile.adaptiveTraits.technical_depth || 0.6) + 0.2);
    }
    
    // Analyze user context
    if (context.userExperience === 'beginner') {
      score += 0.3;
      adjustments.patience = Math.min(1.0, (personalityProfile.adaptiveTraits.patience || 0.7) + 0.2);
      adjustments.explanationLevel = 'detailed';
    }
    
    return { score, adjustments };
  }
  
  /**
   * Coordinate agent response generation
   */
  async coordinateAgentResponse({ agent, task, knowledgeResults, toolResults, personalityAdjustments, context }) {
    // Base response structure
    let response = {
      content: task.response || '',
      confidence: 0.8,
      sources: [],
      toolsUsed: [],
      personalityApplied: false
    };
    
    // Enhance with knowledge results
    if (knowledgeResults && knowledgeResults.results) {
      response.sources = knowledgeResults.results.map(r => ({
        source: r.source,
        confidence: r.confidence,
        excerpt: r.content.substring(0, 200)
      }));
      response.confidence = Math.min(1.0, response.confidence + 0.1);
    }
    
    // Enhance with tool results
    if (toolResults && toolResults.results) {
      response.toolsUsed = toolResults.results
        .filter(r => r.success)
        .map(r => ({
          tool: r.toolName,
          result: r.result
        }));
      response.confidence = Math.min(1.0, response.confidence + 0.1);
    }
    
    // Apply personality adjustments
    if (Object.keys(personalityAdjustments).length > 0) {
      response = this.personalityManager.applyPersonality(response, agent.personality, {
        ...context,
        adaptiveTraits: personalityAdjustments
      });
      response.personalityApplied = true;
    }
    
    return response;
  }
  
  /**
   * Update agent performance metrics
   */
  updateAgentPerformanceMetrics(agentId, eventType, data) {
    if (!this.agentPerformanceMetrics.has(agentId)) {
      return;
    }
    
    const metrics = this.agentPerformanceMetrics.get(agentId);
    
    switch (eventType) {
      case 'task_execution':
        metrics.totalInteractions++;
        if (data.success) {
          metrics.successfulInteractions++;
        }
        if (data.executionTime) {
          metrics.averageResponseTime = 
            (metrics.averageResponseTime + data.executionTime) / 2;
        }
        break;
        
      case 'knowledge_retrieval':
        if (data.success) {
          metrics.knowledgeHitRate = 
            (metrics.knowledgeHitRate + 1) / 2;
        }
        break;
        
      case 'tool_execution':
        metrics.toolUsageCount++;
        break;
    }
    
    metrics.lastInteraction = new Date();
  }
  
  /**
   * Handle system performance alerts
   */
  handleSystemPerformanceAlert(data) {
    // Adjust agent configurations based on system performance
    if (data.memoryUsage > 0.8) {
      // Reduce agent cache sizes
      for (const [agentId, profile] of this.agentPersonalityProfiles) {
        if (profile.adaptiveTraits.verbosity > 0.3) {
          profile.adaptiveTraits.verbosity = Math.max(0.3, profile.adaptiveTraits.verbosity - 0.1);
        }
      }
    }
    
    if (data.cpuUsage > 0.9) {
      // Temporarily disable adaptive personality for performance
      this.config.enableAdaptivePersonality = false;
      setTimeout(() => {
        this.config.enableAdaptivePersonality = true;
      }, 60000); // Re-enable after 1 minute
    }
  }
  
  /**
   * Get comprehensive domain status with cross-domain information
   */
  getStatus() {
    return {
      initialized: this.initialized,
      config: this.config,
      personalityManager: {
        available: !!this.personalityManager,
        initialized: this.personalityManager?.initialized || false,
        activePersonality: this.personalityManager?.currentPersonality?.id || null
      },
      dataManager: {
        available: !!this.dataManager,
        initialized: this.dataManager?.state?.isInitialized || false,
        connectionMode: this.dataManager?.state?.connectionMode || 'unknown',
        cacheSize: this.dataManager?.agentCache?.size || 0
      },
      crossDomainIntegration: {
        // Knowledge handled by backend
        systemDomain: {
          available: !!this.systemDomain,
          initialized: this.systemDomain?.initialized || false
        },
        memoryManager: {
          available: !!this.memoryManager,
          initialized: this.memoryManager?.initialized || false,
          memoryStats: this.memoryManager ? this.memoryManager.getMemoryStats() : null
        }
      },
      memoryIntegration: {
        conversationMemoryEnabled: this.config.enableConversationMemory,
        crossSessionContextEnabled: this.config.enableCrossSessionContext,
        memoryStats: this.getMemoryStats()
      },
      agentMetrics: {
        totalAgentsConfigured: this.agentPersonalityProfiles.size,
        agentsWithTools: this.agentToolAssignments.size,
        averagePerformanceScore: this.calculateAveragePerformanceScore()
      }
    };
  }
  
  /**
   * Calculate average performance score across all agents
   */
  calculateAveragePerformanceScore() {
    if (this.agentPerformanceMetrics.size === 0) return 0;
    
    let totalScore = 0;
    for (const metrics of this.agentPerformanceMetrics.values()) {
      const successRate = metrics.totalInteractions > 0 
        ? metrics.successfulInteractions / metrics.totalInteractions 
        : 1;
      totalScore += successRate;
    }
    
    return Math.round((totalScore / this.agentPerformanceMetrics.size) * 100) / 100;
  }

  /**
   * Shutdown the agents domain
   */
  async shutdown() {
    try {
      // Clean up memory manager integration
      if (this.memoryManager) {
        this.memoryManager.unregisterCleanupStrategy('agent-conversations');
      }
      
      if (this.dataManager) {
        await this.dataManager.shutdown();
      }

      if (this.personalityManager) {
        await this.personalityManager.shutdown();
      }

      // Clear agent memory data
      this.agentConversationMemory.clear();
      this.agentContextualState.clear();
      this.agentInteractionHistory.clear();

      this.initialized = false;
    } catch (error) {
      throw new Error(`Failed to shutdown agents domain: ${error.message}`);
    }
  }

  // ====================================================================
  // BACKEND SYNCHRONIZATION METHODS (Phase 3: 3-Component Sync)
  // ====================================================================

  /**
   * Initialize API client with authentication context
   */
  async initializeApiClient() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get current authentication context from authService
      const authService = require('../../common/services/authService');
      const currentUser = authService.getCurrentUser();
      
      // Set auth context in API client
      this.apiClient.setAuthContext({
        token: currentUser.isLoggedIn ? await this._getFirebaseToken() : null,
        userId: currentUser.isLoggedIn ? currentUser.uid : 'anonymous',
        permissions: ['authenticated'], // Guest permission restrictions removed - unified permissions
        isGuest: !currentUser.isLoggedIn
      });

      logger.info('[AgentsDomain] API client initialized with auth context', {
        hasToken: !!currentUser.isLoggedIn,
        isGuest: !currentUser.isLoggedIn,
        mode: currentUser.mode
      });

      return { success: true };
    } catch (error) {
      logger.error('[AgentsDomain] Failed to initialize API client:', { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync all agents from backend to local storage
   */
  async syncAgentsFromBackend() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      logger.info('[AgentsDomain] Starting sync from backend to local');
      
      // Initialize API client if needed
      await this.initializeApiClient();
      
      // Fetch agents from backend
      const backendAgents = await this.apiClient.getAgents();
      logger.info(`[AgentsDomain] Fetched ${backendAgents.length} agents from backend`);
      
      // Sync each agent to local storage
      let syncedCount = 0;
      let errorCount = 0;
      const syncResults = [];
      
      for (const backendAgent of backendAgents) {
        try {
          // Check if agent exists locally
          const localAgent = await this.dataManager.getAgentById(backendAgent.id);
          
          if (localAgent) {
            // Update local agent if backend is newer
            const backendTime = new Date(backendAgent.updatedAt).getTime();
            const localTime = new Date(localAgent.updated_at || localAgent.updatedAt).getTime();
            
            if (backendTime > localTime) {
              await this.dataManager.updateAgent(backendAgent.id, {
                name: backendAgent.name,
                description: backendAgent.description,
                personality_type: backendAgent.personalityType,
                ai_model: backendAgent.aiModel,
                system_prompt: backendAgent.systemPrompt,
                is_active: backendAgent.isActive,
                capabilities: backendAgent.capabilities,
                knowledge_sources: backendAgent.knowledgeSources,
                tool_assignments: backendAgent.toolAssignments,
                updated_at: backendAgent.updatedAt
              });
              
              syncResults.push({
                agentId: backendAgent.id,
                action: 'updated',
                success: true
              });
              syncedCount++;
            } else {
              syncResults.push({
                agentId: backendAgent.id,
                action: 'skipped',
                reason: 'local_newer'
              });
            }
          } else {
            // Create new local agent
            await this.dataManager.createAgent({
              agent_id: backendAgent.id,
              name: backendAgent.name,
              description: backendAgent.description,
              personality_type: backendAgent.personalityType,
              ai_model: backendAgent.aiModel,
              system_prompt: backendAgent.systemPrompt,
              is_active: backendAgent.isActive,
              capabilities: backendAgent.capabilities,
              knowledge_sources: backendAgent.knowledgeSources,
              tool_assignments: backendAgent.toolAssignments,
              created_at: backendAgent.createdAt,
              updated_at: backendAgent.updatedAt
            });
            
            syncResults.push({
              agentId: backendAgent.id,
              action: 'created',
              success: true
            });
            syncedCount++;
          }
        } catch (agentError) {
          logger.error(`[AgentsDomain] Failed to sync agent ${backendAgent.id}:`, { error: agentError });
          syncResults.push({
            agentId: backendAgent.id,
            action: 'error',
            error: agentError.message
          });
          errorCount++;
        }
      }
      
      logger.info('[AgentsDomain] Backend to local sync completed', {
        totalAgents: backendAgents.length,
        syncedCount,
        errorCount,
        syncResults
      });
      
      return {
        success: true,
        totalAgents: backendAgents.length,
        syncedCount,
        errorCount,
        syncResults
      };
      
    } catch (error) {
      logger.error('[AgentsDomain] Failed to sync agents from backend:', { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync specific agent to backend
   */
  async syncAgentToBackend(agentId) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      logger.info(`[AgentsDomain] Syncing agent ${agentId} to backend`);
      
      // Initialize API client if needed
      await this.initializeApiClient();
      
      // Get local agent
      const localAgent = await this.dataManager.getAgentById(agentId);
      if (!localAgent) {
        throw new Error(`Agent ${agentId} not found locally`);
      }
      
      // Check if agent exists on backend
      const backendAgent = await this.apiClient.getAgent(agentId);
      
      if (backendAgent) {
        // Update backend agent
        const updateResult = await this.apiClient.updateAgent(agentId, {
          name: localAgent.name,
          description: localAgent.description,
          personalityType: localAgent.personality_type,
          aiModel: localAgent.ai_model,
          systemPrompt: localAgent.system_prompt,
          isActive: localAgent.is_active,
          capabilities: localAgent.capabilities,
          knowledgeSources: localAgent.knowledge_sources,
          toolAssignments: localAgent.tool_assignments
        });
        
        if (updateResult.success) {
          // Update local agent with backend timestamps
          await this.dataManager.updateAgent(agentId, {
            updated_at: updateResult.agent.updatedAt
          });
          
          logger.info(`[AgentsDomain] Agent ${agentId} updated on backend`);
          return { success: true, action: 'updated' };
        } else {
          throw new Error(updateResult.error.message);
        }
      } else {
        // Create agent on backend
        const createResult = await this.apiClient.createAgent({
          name: localAgent.name,
          description: localAgent.description,
          personalityType: localAgent.personality_type,
          aiModel: localAgent.ai_model,
          systemPrompt: localAgent.system_prompt,
          isActive: localAgent.is_active,
          capabilities: localAgent.capabilities,
          knowledgeSources: localAgent.knowledge_sources,
          toolAssignments: localAgent.tool_assignments
        });
        
        if (createResult.success) {
          // Update local agent with backend ID and timestamps
          await this.dataManager.updateAgent(agentId, {
            agent_id: createResult.agent.id,
            created_at: createResult.agent.createdAt,
            updated_at: createResult.agent.updatedAt
          });
          
          logger.info(`[AgentsDomain] Agent ${agentId} created on backend with ID ${createResult.agent.id}`);
          return { success: true, action: 'created', backendId: createResult.agent.id };
        } else {
          throw new Error(createResult.error.message);
        }
      }
      
    } catch (error) {
      logger.error(`[AgentsDomain] Failed to sync agent ${agentId} to backend:`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute agent using backend API
   */
  async executeAgentViaBackend(agentId, message, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      logger.info(`[AgentsDomain] Executing agent ${agentId} via backend`);
      
      // Initialize API client if needed
      await this.initializeApiClient();
      
      // Execute agent on backend
      const result = await this.apiClient.executeAgent(agentId, {
        message,
        conversationHistory: context.conversationHistory || [],
        context: {
          ...context,
          source: 'electron',
          timestamp: new Date().toISOString()
        }
      });
      
      if (result.success) {
        logger.info(`[AgentsDomain] Agent ${agentId} executed successfully via backend`);
        return {
          success: true,
          response: result.response,
          metadata: result.metadata
        };
      } else {
        throw new Error(result.error.message);
      }
      
    } catch (error) {
      logger.error(`[AgentsDomain] Failed to execute agent ${agentId} via backend:`, { error });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Firebase ID token for authentication
   */
  async _getFirebaseToken() {
    try {
      const authService = require('../../common/services/authService');
      const currentUser = authService.currentUser;
      
      if (currentUser && currentUser.getIdToken) {
        return await currentUser.getIdToken(true);
      }
      
      return null;
    } catch (error) {
      logger.warn('[AgentsDomain] Failed to get Firebase token:', { error });
      return null;
    }
  }

  /**
   * Check backend connection and sync status
   */
  async checkBackendSync() {
    try {
      // Initialize API client if needed
      await this.initializeApiClient();
      
      // Test backend connection
      const backendAgents = await this.apiClient.getAgents({ limit: 1 });
      const localAgents = await this.getAllAgents({ limit: 1 });
      
      return {
        connected: true,
        backendAgentCount: backendAgents.length,
        localAgentCount: localAgents.length,
        lastChecked: new Date().toISOString(),
        apiClientStats: this.apiClient.getStatistics()
      };
      
    } catch (error) {
      logger.error('[AgentsDomain] Backend sync check failed:', { error });
      return {
        connected: false,
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const agentsDomain = new AgentsDomain();

// Export enhanced domain interface and individual services
module.exports = {
  agentsDomain,
  AgentsDomain,
  
  // Re-export individual services for backward compatibility
  agentPersonalityManager,
  agentDataManager,
  promptManager,
  agentsApiClient,
  
  // Enhanced Cross-Domain Convenience Functions
  async initializeAgentsDomain() {
    return await agentsDomain.initialize();
  },
  
  async getAllAgents(filters) {
    return await agentsDomain.getAllAgents(filters);
  },
  
  async getAgentById(id) {
    return await agentsDomain.getAgentById(id);
  },
  
  async createAgent(agentData) {
    return await agentsDomain.createAgent(agentData);
  },
  
  async updateAgent(id, updateData) {
    return await agentsDomain.updateAgent(id, updateData);
  },
  
  async deleteAgent(id) {
    return await agentsDomain.deleteAgent(id);
  },
  
  async switchPersonality(personalityId, context) {
    return await agentsDomain.switchPersonality(personalityId, context);
  },
  
  applyPersonality(response, personalityId, context) {
    return agentsDomain.applyPersonality(response, personalityId, context);
  },
  
  // Enhanced Cross-Domain Functions
  async executeAgentTask(agentId, task, context) {
    return await agentsDomain.executeAgentTask(agentId, task, context);
  },
  
  async retrieveAgentKnowledge(agentId, query, context) {
    return await agentsDomain.retrieveAgentKnowledge(agentId, query, context);
  },
  
  
  async adaptAgentPersonality(agentId, task, context) {
    return await agentsDomain.adaptAgentPersonality(agentId, task, context);
  },
  
  enhanceAgentWithCrossDomainInfo(agent) {
    return agentsDomain.enhanceAgentWithCrossDomainInfo(agent);
  },
  
  updateAgentPerformanceMetrics(agentId, eventType, data) {
    return agentsDomain.updateAgentPerformanceMetrics(agentId, eventType, data);
  },
  
  getAgentPerformanceMetrics(agentId) {
    return agentsDomain.agentPerformanceMetrics.get(agentId) || null;
  },
  
  getAgentKnowledgeSources(agentId) {
    // Knowledge sources managed by backend - return empty array for compatibility
    return [];
  },
  
  
  getAgentPersonalityProfile(agentId) {
    return agentsDomain.agentPersonalityProfiles.get(agentId) || null;
  },
  
  getDomainStatus() {
    return agentsDomain.getStatus();
  },
  
  // Memory Manager Integration Functions
  recordConversationTurn(agentId, turn) {
    return agentsDomain.recordConversationTurn(agentId, turn);
  },
  
  getAgentConversationMemory(agentId, limit) {
    return agentsDomain.getAgentConversationMemory(agentId, limit);
  },
  
  storeAgentContext(agentId, context) {
    return agentsDomain.storeAgentContext(agentId, context);
  },
  
  getAgentContext(agentId, sessionLimit) {
    return agentsDomain.getAgentContext(agentId, sessionLimit);
  },
  
  clearAgentMemory(agentId) {
    return agentsDomain.clearAgentMemory(agentId);
  },
  
  getMemoryStats() {
    return agentsDomain.getMemoryStats();
  }
};