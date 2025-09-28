/**
 * EPISODIC MEMORY MODULE
 * Session-specific memories and interaction events
 * 
 * Features:
 * - Session-scoped memory storage
 * - Episode type classification (conversation, task, error, success)
 * - User satisfaction tracking
 * - Memory consolidation and promotion to semantic memory
 * - Temporal sequencing and context relationships
 */

const { EventEmitter } = require('events');
const { neonDB } = require('../../database/connections/neon');

class EpisodicMemory extends EventEmitter {
  constructor(agentId, userId) {
    super();
    
    this.agentId = agentId;
    this.userId = userId;
    this.initialized = false;
    
    // Configuration
    this.config = {
      maxEpisodesPerSession: 100,   // Limit episodes per session
      promotionThreshold: 0.8,      // Threshold for promotion to semantic
      importanceDecayDays: 30,      // Days before importance starts decaying
      consolidationInterval: 24 * 60 * 60 * 1000, // Daily consolidation
      sessionTimeoutMinutes: 30     // Session timeout
    };
    
    // Episode type classification (learned dynamically by agent)
    this.episodeTypes = new Map([
      ['conversation', { weight: 1.0, examples: [] }],
      ['task', { weight: 1.2, examples: [] }],
      ['error', { weight: 1.5, examples: [] }],
      ['success', { weight: 1.3, examples: [] }],
      ['learning', { weight: 1.4, examples: [] }],
      ['discovery', { weight: 1.6, examples: [] }]
    ]);
    
    // Current session tracking
    this.currentSession = {
      sessionId: null,
      startTime: null,
      episodeCount: 0,
      context: {},
      goals: [],
      achievements: []
    };
    
    // Performance metrics
    this.metrics = {
      totalEpisodes: 0,
      sessionsActive: 0,
      averageEpisodeImportance: 0,
      promotedToSemantic: 0,
      consolidationCount: 0,
      averageSessionDuration: 0
    };
    
    console.log(`📚 [EpisodicMemory] Initializing for agent ${agentId}, user ${userId}`);
  }
  
  /**
   * Initialize episodic memory
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      // Load recent session data
      await this.loadRecentSessions();
      
      // Setup consolidation intervals
      this.setupConsolidation();
      
      // Initialize episode type learning
      await this.learnEpisodeTypes();
      
      this.initialized = true;
      
      console.log(`[OK] [EpisodicMemory] Initialized for agent ${this.agentId} - ${this.metrics.totalEpisodes} episodes`);
      
      this.emit('initialized');
      
    } catch (error) {
      console.error('[ERROR] [EpisodicMemory] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Store episode in episodic memory
   */
  async store(content, context, metadata = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      // Determine episode type (agent learns this dynamically)
      const episodeType = await this.classifyEpisode(content, context, metadata);
      
      // Calculate importance score
      const importanceScore = this.calculateImportance(content, context, metadata, episodeType);
      
      // Extract user satisfaction signals
      const userSatisfaction = this.extractUserSatisfaction(context, metadata);
      
      // Create episode record
      const episode = {
        id: require('crypto').randomUUID(),
        agent_id: this.agentId,
        user_id: this.userId,
        session_id: context.sessionId || this.generateSessionId(),
        episode_type: episodeType,
        content: typeof content === 'string' ? { text: content } : content,
        context: this.sanitizeContext(context),
        outcome: metadata.outcome || this.inferOutcome(content, context),
        user_satisfaction: userSatisfaction,
        importance_score: importanceScore,
        created_at: new Date(),
        session_duration: this.calculateSessionDuration(context),
        promoted_to_semantic: false
      };
      
      // Store in database
      await neonDB.query(`
        INSERT INTO episodic_memory (
          id, agent_id, user_id, session_id, episode_type,
          content, context, outcome, user_satisfaction, 
          importance_score, created_at, session_duration, promoted_to_semantic
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        episode.id,
        episode.agent_id,
        episode.user_id,
        episode.session_id,
        episode.episode_type,
        JSON.stringify(episode.content),
        JSON.stringify(episode.context),
        episode.outcome,
        episode.user_satisfaction,
        episode.importance_score,
        episode.created_at,
        episode.session_duration,
        episode.promoted_to_semantic
      ]);
      
      // Update session tracking
      this.updateSessionTracking(episode);
      
      // Check for promotion to semantic memory
      if (importanceScore >= this.config.promotionThreshold) {
        setImmediate(() => this.considerPromotion(episode));
      }
      
      // Update metrics
      this.updateMetrics(episode);
      
      const responseTime = Date.now() - startTime;
      
      console.log(`[OK] [EpisodicMemory] Stored ${episodeType} episode - Importance: ${importanceScore.toFixed(2)}, Satisfaction: ${userSatisfaction?.toFixed(2) || 'N/A'} (${responseTime}ms)`);
      
      this.emit('episodeStored', episode);
      
      return {
        stored: true,
        id: episode.id,
        episodeType,
        importanceScore,
        userSatisfaction,
        responseTime
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[ERROR] [EpisodicMemory] Storage failed:', error);
      
      return {
        stored: false,
        error: error.message,
        responseTime
      };
    }
  }
  
  /**
   * Retrieve relevant episodes for query/context
   */
  async retrieve(query, context, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      const { 
        limit = 10, 
        sessionId = null,
        episodeTypes = null,
        minImportance = 0.1,
        timeRangeHours = null,
        includePromoted = false
      } = options;
      
      // Build query conditions
      const conditions = [
        'agent_id = $1',
        'user_id = $2',
        `importance_score >= ${minImportance}`
      ];
      const params = [this.agentId, this.userId];
      
      // Session filtering
      if (sessionId) {
        conditions.push(`session_id = $${params.length + 1}`);
        params.push(sessionId);
      }
      
      // Episode type filtering
      if (episodeTypes && episodeTypes.length > 0) {
        conditions.push(`episode_type = ANY($${params.length + 1})`);
        params.push(episodeTypes);
      }
      
      // Time range filtering
      if (timeRangeHours) {
        conditions.push(`created_at >= NOW() - INTERVAL '${timeRangeHours} hours'`);
      }
      
      // Promotion filtering
      if (!includePromoted) {
        conditions.push('promoted_to_semantic = false');
      }
      
      // Execute query with relevance-based ordering
      const result = await neonDB.query(`
        SELECT *, 
               CASE 
                 WHEN session_id = $${params.length + 1} THEN 1.0 
                 ELSE 0.8 
               END as session_bonus
        FROM episodic_memory 
        WHERE ${conditions.join(' AND ')}
        ORDER BY 
          (importance_score + CASE 
                                WHEN session_id = $${params.length + 1} THEN 1.0 
                                ELSE 0.8 
                              END) DESC,
          created_at DESC
        LIMIT $${params.length + 2}
      `, [...params, context.sessionId || '', limit]);
      
      const episodes = result.rows.map(row => ({
        ...row,
        content: this.safeJsonParse(row.content),
        context: this.safeJsonParse(row.context, {}),
        memoryType: 'episodic',
        relevanceScore: row.importance_score + (row.session_bonus || 0)
      }));
      
      const responseTime = Date.now() - startTime;
      
      console.log(`[SEARCH] [EpisodicMemory] Retrieved ${episodes.length} episodes (${responseTime}ms)`);
      
      return episodes;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[ERROR] [EpisodicMemory] Retrieval failed:', error);
      
      return [];
    }
  }
  
  /**
   * Classify episode type (agent learns this dynamically - NO HARDCODING)
   */
  async classifyEpisode(content, context, metadata) {
    // Start with basic classification, agent improves this over time
    
    // Error episodes
    if (this.containsErrorSignals(content, context, metadata)) {
      return 'error';
    }
    
    // Success episodes
    if (this.containsSuccessSignals(content, context, metadata)) {
      return 'success';
    }
    
    // Task episodes
    if (this.containsTaskSignals(content, context, metadata)) {
      return 'task';
    }
    
    // Learning episodes
    if (this.containsLearningSignals(content, context, metadata)) {
      return 'learning';
    }
    
    // Discovery episodes  
    if (this.containsDiscoverySignals(content, context, metadata)) {
      return 'discovery';
    }
    
    // Default to conversation
    return 'conversation';
  }
  
  /**
   * Calculate importance score for episode
   */
  calculateImportance(content, context, metadata, episodeType) {
    let importance = 0.5; // Base importance
    
    // Episode type weighting (agent learns these weights)
    const typeWeight = this.episodeTypes.get(episodeType)?.weight || 1.0;
    importance *= typeWeight;
    
    // Content-based importance
    if (typeof content === 'string') {
      // Length indicates depth
      if (content.length > 200) importance += 0.1;
      if (content.length > 500) importance += 0.1;
      
      // Question/answer patterns
      if (content.includes('?') && content.includes('.')) importance += 0.15;
      
      // Technical terms (agent will learn domain-specific terms)
      const technicalTerms = ['function', 'error', 'solution', 'method', 'process'];
      if (technicalTerms.some(term => content.toLowerCase().includes(term))) {
        importance += 0.1;
      }
    }
    
    // Context-based importance
    if (context.isUserInitiated) importance += 0.1;
    if (context.hasScreenshot) importance += 0.15;
    if (context.sessionStart) importance += 0.2;
    if (context.conversationLength > 5) importance += 0.1;
    
    // Metadata-based importance
    if (metadata.isTaskCompletion) importance += 0.3;
    if (metadata.userRating && metadata.userRating > 0.7) importance += 0.2;
    if (metadata.isLearningMoment) importance += 0.25;
    if (metadata.problemSolved) importance += 0.2;
    
    // Temporal importance (recent errors are very important)
    if (episodeType === 'error') {
      const age = Date.now() - (context.timestamp || Date.now());
      if (age < 5 * 60 * 1000) importance += 0.3; // Recent errors
    }
    
    // Ensure importance is within bounds
    return Math.max(0.0, Math.min(1.0, importance));
  }
  
  /**
   * Extract user satisfaction signals
   */
  extractUserSatisfaction(context, metadata) {
    // Explicit signals
    if (metadata.userRating !== undefined) {
      return metadata.userRating;
    }
    
    if (context.userFeedback !== undefined) {
      return context.userFeedback;
    }
    
    // Implicit signals (agent learns these patterns)
    let satisfaction = null;
    
    // Conversation continuation signals positive satisfaction
    if (context.conversationContinued) {
      satisfaction = 0.7;
    }
    
    // Quick follow-up questions suggest confusion
    if (context.quickFollowUp && context.quickFollowUp < 30) { // 30 seconds
      satisfaction = 0.3;
    }
    
    // Session duration can indicate engagement
    if (context.sessionDuration) {
      if (context.sessionDuration > 300) satisfaction = 0.8; // 5+ minutes
      else if (context.sessionDuration < 30) satisfaction = 0.2; // <30 seconds
    }
    
    // Task completion indicates success
    if (metadata.taskCompleted) {
      satisfaction = 0.9;
    }
    
    return satisfaction;
  }
  
  /**
   * Episode signal detection methods (agent learns these patterns)
   */
  containsErrorSignals(content, context, metadata) {
    if (metadata.isError || context.isError) return true;
    
    if (typeof content === 'string') {
      const errorKeywords = ['error', 'failed', 'broke', 'problem', 'issue', 'bug'];
      return errorKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  containsSuccessSignals(content, context, metadata) {
    if (metadata.isSuccess || context.taskCompleted) return true;
    
    if (typeof content === 'string') {
      const successKeywords = ['success', 'complete', 'finished', 'solved', 'working', 'done'];
      return successKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  containsTaskSignals(content, context, metadata) {
    if (metadata.isTask || context.isTask) return true;
    
    if (typeof content === 'string') {
      const taskKeywords = ['create', 'build', 'make', 'implement', 'design', 'develop'];
      return taskKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  containsLearningSignals(content, context, metadata) {
    if (metadata.isLearning || context.isLearning) return true;
    
    if (typeof content === 'string') {
      const learningKeywords = ['how to', 'explain', 'what is', 'why', 'teach', 'learn'];
      return learningKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  containsDiscoverySignals(content, context, metadata) {
    if (metadata.isDiscovery || context.newFeature) return true;
    
    if (typeof content === 'string') {
      const discoveryKeywords = ['found', 'discovered', 'new', 'interesting', 'unexpected'];
      return discoveryKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  /**
   * Consider promotion of episode to semantic memory
   */
  async considerPromotion(episode) {
    try {
      // Check if this episode represents generalizable knowledge
      const shouldPromote = await this.evaluateForPromotion(episode);
      
      if (shouldPromote) {
        // Mark as promoted
        await neonDB.query(`
          UPDATE episodic_memory 
          SET promoted_to_semantic = true 
          WHERE id = $1
        `, [episode.id]);
        
        this.metrics.promotedToSemantic++;
        
        console.log(`⬆️ [EpisodicMemory] Episode ${episode.id} promoted to semantic memory`);
        
        this.emit('promotedToSemantic', episode);
      }
      
    } catch (error) {
      console.error('[ERROR] [EpisodicMemory] Promotion evaluation failed:', error);
    }
  }
  
  /**
   * Evaluate if episode should be promoted to semantic memory
   */
  async evaluateForPromotion(episode) {
    // High importance episodes are candidates
    if (episode.importance_score < this.config.promotionThreshold) {
      return false;
    }
    
    // Successful task completions should be promoted
    if (episode.episode_type === 'success' && episode.user_satisfaction > 0.7) {
      return true;
    }
    
    // Learning episodes with high satisfaction should be promoted
    if (episode.episode_type === 'learning' && episode.user_satisfaction > 0.6) {
      return true;
    }
    
    // Discoveries should be promoted
    if (episode.episode_type === 'discovery') {
      return true;
    }
    
    // Check if similar episodes exist (pattern indicates generalizable knowledge)
    const similarEpisodes = await this.findSimilarEpisodes(episode);
    if (similarEpisodes.length >= 3) { // Pattern of 3+ similar episodes
      return true;
    }
    
    return false;
  }
  
  /**
   * Find similar episodes for pattern detection
   */
  async findSimilarEpisodes(episode) {
    try {
      const result = await neonDB.query(`
        SELECT * FROM episodic_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND episode_type = $3 
        AND importance_score > $4
        AND id != $5
        AND created_at >= NOW() - INTERVAL '30 days'
      `, [
        this.agentId, 
        this.userId, 
        episode.episode_type, 
        episode.importance_score - 0.1,
        episode.id
      ]);
      
      return result.rows;
      
    } catch (error) {
      console.error('[ERROR] [EpisodicMemory] Similar episode search failed:', error);
      return [];
    }
  }
  
  /**
   * Load recent sessions data
   */
  async loadRecentSessions() {
    try {
      const result = await neonDB.query(`
        SELECT 
          session_id,
          COUNT(*) as episode_count,
          AVG(importance_score) as avg_importance,
          AVG(user_satisfaction) as avg_satisfaction,
          MAX(created_at) as last_activity
        FROM episodic_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY session_id
        ORDER BY last_activity DESC
      `, [this.agentId, this.userId]);
      
      console.log(`[DATA] [EpisodicMemory] Loaded ${result.rows.length} recent sessions`);
      
      // Update metrics
      this.metrics.sessionsActive = result.rows.length;
      this.metrics.totalEpisodes = result.rows.reduce((sum, row) => sum + parseInt(row.episode_count), 0);
      
      if (result.rows.length > 0) {
        this.metrics.averageEpisodeImportance = 
          result.rows.reduce((sum, row) => sum + parseFloat(row.avg_importance), 0) / result.rows.length;
      }
      
    } catch (error) {
      console.error('[ERROR] [EpisodicMemory] Failed to load recent sessions:', error);
    }
  }
  
  /**
   * Learn episode types from historical data (agent self-improvement)
   */
  async learnEpisodeTypes() {
    try {
      // Analyze historical episodes to learn better classification
      const result = await neonDB.query(`
        SELECT 
          episode_type,
          COUNT(*) as frequency,
          AVG(importance_score) as avg_importance,
          AVG(user_satisfaction) as avg_satisfaction
        FROM episodic_memory 
        WHERE agent_id = $1 AND user_id = $2 
        GROUP BY episode_type
      `, [this.agentId, this.userId]);
      
      // Update episode type weights based on historical performance
      result.rows.forEach(row => {
        const currentType = this.episodeTypes.get(row.episode_type);
        if (currentType) {
          // Weight based on importance and satisfaction
          const performanceScore = (parseFloat(row.avg_importance) + (parseFloat(row.avg_satisfaction) || 0.5)) / 2;
          currentType.weight = Math.max(0.5, Math.min(2.0, performanceScore * 1.5));
        } else {
          // New episode type discovered by agent
          this.episodeTypes.set(row.episode_type, {
            weight: 1.0,
            examples: []
          });
        }
      });
      
      console.log(`🧠 [EpisodicMemory] Learned from ${result.rows.length} episode types`);
      
    } catch (error) {
      console.error('[ERROR] [EpisodicMemory] Episode type learning failed:', error);
    }
  }
  
  /**
   * Utilities
   */
  sanitizeContext(context) {
    // Remove large data from context to avoid storage bloat
    const sanitized = { ...context };
    
    // Remove large objects
    delete sanitized.screenshot;
    delete sanitized.audio;
    delete sanitized.rawData;
    
    // Limit string lengths
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
        sanitized[key] = sanitized[key].substring(0, 500) + '...';
      }
    });
    
    return sanitized;
  }
  
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  calculateSessionDuration(context) {
    if (context.sessionDuration) return context.sessionDuration;
    if (context.sessionStart && context.timestamp) {
      return Math.floor((context.timestamp - context.sessionStart) / 1000);
    }
    return null;
  }
  
  inferOutcome(content, context) {
    // Agent learns to infer outcomes from context
    if (context.taskCompleted) return 'success';
    if (context.isError) return 'failure';
    if (context.conversationContinued) return 'ongoing';
    
    return 'completed';
  }
  
  updateSessionTracking(episode) {
    if (this.currentSession.sessionId !== episode.session_id) {
      this.currentSession = {
        sessionId: episode.session_id,
        startTime: episode.created_at,
        episodeCount: 1,
        context: episode.context,
        goals: [],
        achievements: []
      };
    } else {
      this.currentSession.episodeCount++;
    }
  }
  
  updateMetrics(episode) {
    // Update running metrics
    const alpha = 0.1; // Smoothing factor
    
    this.metrics.averageEpisodeImportance = 
      alpha * episode.importance_score + 
      (1 - alpha) * this.metrics.averageEpisodeImportance;
    
    if (episode.session_duration) {
      this.metrics.averageSessionDuration = 
        alpha * episode.session_duration + 
        (1 - alpha) * this.metrics.averageSessionDuration;
    }
  }
  
  setupConsolidation() {
    // Daily consolidation process
    setInterval(async () => {
      try {
        console.log('[LOADING] [EpisodicMemory] Starting daily consolidation...');
        
        // Learn from recent episodes
        await this.learnEpisodeTypes();
        
        // Update promotion candidates
        const candidates = await neonDB.query(`
          SELECT * FROM episodic_memory 
          WHERE agent_id = $1 AND user_id = $2 
          AND importance_score >= $3 
          AND promoted_to_semantic = false 
          AND created_at >= NOW() - INTERVAL '24 hours'
        `, [this.agentId, this.userId, this.config.promotionThreshold]);
        
        for (const candidate of candidates.rows) {
          await this.considerPromotion(candidate);
        }
        
        this.metrics.consolidationCount++;
        console.log(`[OK] [EpisodicMemory] Consolidation complete - ${candidates.rows.length} candidates evaluated`);
        
      } catch (error) {
        console.error('[ERROR] [EpisodicMemory] Consolidation failed:', error);
      }
    }, this.config.consolidationInterval);
  }
  
  /**
   * Store episode in episodic memory (API method)
   */
  async storeEpisode(episode) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Use existing store method
      const result = await this.store(episode.content, episode.context || {}, {
        response: episode.response,
        importance: episode.importance || 0.5,
        timestamp: episode.timestamp || new Date(),
        forceStore: true
      });
      
      return result.id || result.episodeId;
      
    } catch (error) {
      console.error('[ERROR] [EpisodicMemory] Store episode failed:', error);
      throw error;
    }
  }
  
  /**
   * Get recent episodes (API method)
   */
  async getRecentEpisodes(limit = 10) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const result = await neonDB.query(`
        SELECT * FROM episodic_memory 
        WHERE agent_id = $1 AND user_id = $2 
        ORDER BY created_at DESC 
        LIMIT $3
      `, [this.agentId, this.userId, limit]);
      
      return result.rows.map(row => ({
        ...row,
        content: this.safeJsonParse(row.content),
        context: this.safeJsonParse(row.context, {}),
        memoryType: 'episodic'
      }));
      
    } catch (error) {
      console.error('[ERROR] [EpisodicMemory] Get recent episodes failed:', error);
      throw error;
    }
  }
  
  /**
   * Search episodes by query (API method)
   */
  async searchEpisodes(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const { limit = 10, offset = 0 } = options;
    
    try {
      // Simple text search in content and context
      const result = await neonDB.query(`
        SELECT * FROM episodic_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND (
          content::text ILIKE $3 
          OR context::text ILIKE $3 
          OR outcome ILIKE $3
        )
        ORDER BY importance_score DESC, created_at DESC 
        LIMIT $4 OFFSET $5
      `, [this.agentId, this.userId, `%${query}%`, limit, offset]);
      
      return result.rows.map(row => ({
        ...row,
        content: this.safeJsonParse(row.content),
        context: this.safeJsonParse(row.context, {}),
        memoryType: 'episodic'
      }));
      
    } catch (error) {
      console.error('[ERROR] [EpisodicMemory] Search episodes failed:', error);
      throw error;
    }
  }
  
  /**
   * Safe JSON parsing utility
   * @param {any} value - Value to parse
   * @param {any} defaultValue - Default value if parsing fails
   * @returns {any} Parsed value or default
   */
  safeJsonParse(value, defaultValue = null) {
    // If already an object, return as-is
    if (typeof value === 'object' && value !== null) {
      return value;
    }
    
    // If string, try to parse
    if (typeof value === 'string') {
      // Handle empty strings
      if (value.trim() === '') {
        return defaultValue;
      }
      
      try {
        return JSON.parse(value);
      } catch (error) {
        console.error(`[EpisodicMemory] JSON parse failed:`, {
          valueType: typeof value,
          valueLength: value.length,
          valuePreview: value.substring(0, 200),
          error: error.message
        });
        return defaultValue;
      }
    }
    
    // Handle null and undefined
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    // For other types, log warning and return default
    console.warn(`[EpisodicMemory] Unexpected value type for JSON parsing:`, {
      type: typeof value,
      value: String(value).substring(0, 100),
      constructor: value.constructor?.name
    });
    return defaultValue;
  }
  
  /**
   * Get episodic memory statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      agentId: this.agentId,
      userId: this.userId,
      ...this.metrics,
      episodeTypes: Object.fromEntries(this.episodeTypes),
      config: this.config,
      currentSession: this.currentSession
    };
  }
}

module.exports = EpisodicMemory;