/**
 * PROCEDURAL MEMORY MODULE
 * Learned behaviors, patterns, and automated responses
 * 
 * Features:
 * - Dynamic behavior pattern recognition
 * - Automated response learning from successful interactions
 * - Behavioral adaptation based on user feedback
 * - Usage frequency tracking and optimization
 * - Context-aware behavior selection
 * - Agent self-improvement through pattern analysis
 */

const { EventEmitter } = require('events');
const { neonDB } = require('../../database/connections/neon');

class ProceduralMemory extends EventEmitter {
  constructor(agentId, userId) {
    super();
    
    this.agentId = agentId;
    this.userId = userId;
    this.initialized = false;
    
    // Configuration
    this.config = {
      minPatternOccurrences: 3,      // Minimum occurrences to recognize pattern
      behaviorRetentionDays: 180,    // Behavior retention period
      usageThreshold: 0.1,           // Minimum usage frequency to keep
      adaptationRate: 0.1,           // Learning rate for behavior adaptation
      maxBehaviors: 1000,            // Maximum behaviors per agent-user
      patternAnalysisInterval: 6 * 60 * 60 * 1000 // 6 hours
    };
    
    // Behavior types (discovered dynamically by agent)
    this.behaviorTypes = new Map([
      ['response_pattern', { weight: 1.0, examples: [] }],
      ['task_sequence', { weight: 1.2, examples: [] }],
      ['error_handling', { weight: 1.5, examples: [] }],
      ['user_preference', { weight: 1.3, examples: [] }],
      ['optimization', { weight: 1.1, examples: [] }],
      ['adaptation', { weight: 1.4, examples: [] }]
    ]);
    
    // Active behavior cache for fast access
    this.behaviorCache = new Map();
    
    // Performance metrics
    this.metrics = {
      totalBehaviors: 0,
      successfulBehaviors: 0,
      behaviorSuccessRate: 0,
      averageUsageCount: 0,
      patternRecognitions: 0,
      behaviorAdaptations: 0,
      lastPatternAnalysis: null
    };
    
    console.log(`[AI] [ProceduralMemory] Initializing for agent ${agentId}, user ${userId}`);
  }
  
  /**
   * Initialize procedural memory
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      // Load existing behavior patterns
      await this.loadBehaviorPatterns();
      
      // Setup pattern analysis intervals
      this.setupPatternAnalysis();
      
      // Load successful behaviors into cache
      await this.loadActiveBehaivors();
      
      // Learn behavior types from historical data
      await this.learnBehaviorTypes();
      
      this.initialized = true;
      
      console.log(`[OK] [ProceduralMemory] Initialized for agent ${this.agentId} - ${this.metrics.totalBehaviors} behaviors`);
      
      this.emit('initialized');
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Store learned behavior in procedural memory
   */
  async store(content, context, metadata = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      // Extract behavior pattern from content
      const behaviorPattern = await this.extractBehaviorPattern(content, context, metadata);
      
      // Determine behavior type (agent learns this dynamically)
      const behaviorType = await this.classifyBehaviorType(content, context, metadata);
      
      // Calculate effectiveness score
      const effectivenessScore = this.calculateEffectiveness(content, context, metadata);
      
      // Skip if effectiveness too low (unless forced)
      if (effectivenessScore < 0.3 && !metadata.forceStore) {
        console.log(`[WARNING] [ProceduralMemory] Skipping low effectiveness behavior: ${effectivenessScore.toFixed(2)}`);
        return { stored: false, reason: 'low_effectiveness', effectivenessScore };
      }
      
      // Check if similar behavior already exists
      const existingBehavior = await this.findSimilarBehavior(behaviorPattern, behaviorType);
      
      if (existingBehavior) {
        // Update existing behavior
        const updatedBehavior = await this.updateBehavior(existingBehavior, content, context, metadata);
        return {
          stored: true,
          updated: true,
          id: updatedBehavior.id,
          behaviorType,
          effectivenessScore,
          responseTime: Date.now() - startTime
        };
      }
      
      // Extract behavior triggers and conditions
      const triggers = this.extractBehaviorTriggers(content, context, metadata);
      const conditions = this.extractBehaviorConditions(content, context, metadata);
      
      // Create procedural memory record
      const behaviorRecord = {
        id: require('crypto').randomUUID(),
        agent_id: this.agentId,
        user_id: this.userId,
        procedure_name: `${behaviorType}_${Date.now()}`, // Add required procedure_name
        behavior_type: behaviorType,
        pattern: behaviorPattern,
        triggers: triggers,
        conditions: conditions,
        response_template: this.extractResponseTemplate(content, context),
        effectiveness_score: effectivenessScore,
        usage_count: 1,
        success_count: metadata.wasSuccessful ? 1 : 0,
        last_used: new Date(),
        created_at: new Date(),
        context_tags: this.extractContextTags(context),
        adaptation_history: []
      };
      
      // Store in database
      await neonDB.query(`
        INSERT INTO procedural_memory (
          id, agent_id, user_id, procedure_name, procedure_type, procedure_data, context_conditions,
          success_rate, usage_count, adaptation_history, is_active, last_used, created_at, effectiveness_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        behaviorRecord.id,
        behaviorRecord.agent_id,
        behaviorRecord.user_id,
        behaviorRecord.procedure_name,
        behaviorRecord.behavior_type || 'behavior',
        JSON.stringify({
          pattern: behaviorRecord.pattern,
          triggers: behaviorRecord.triggers,
          response_template: behaviorRecord.response_template
        }),
        JSON.stringify(behaviorRecord.conditions),
        behaviorRecord.effectiveness_score || 0.5,
        behaviorRecord.usage_count || 0,
        JSON.stringify(behaviorRecord.adaptation_history || []),
        behaviorRecord.is_active !== false,
        behaviorRecord.last_used,
        behaviorRecord.created_at,
        behaviorRecord.effectiveness_score || 0.5
      ]);
      
      // Update cache
      this.behaviorCache.set(behaviorRecord.id, behaviorRecord);
      
      // Update metrics
      this.updateMetrics('store', behaviorRecord);
      
      const responseTime = Date.now() - startTime;
      
      console.log(`[OK] [ProceduralMemory] Stored ${behaviorType} behavior - Effectiveness: ${effectivenessScore.toFixed(2)} (${responseTime}ms)`);
      
      this.emit('behaviorStored', behaviorRecord);
      
      return {
        stored: true,
        updated: false,
        id: behaviorRecord.id,
        behaviorType,
        effectivenessScore,
        responseTime
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[ERROR] [ProceduralMemory] Storage failed:', error);
      
      return {
        stored: false,
        error: error.message,
        responseTime
      };
    }
  }
  
  /**
   * Retrieve relevant behaviors for given context
   */
  async retrieve(query, context, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      const { 
        limit = 5, 
        behaviorTypes = null,
        minEffectiveness = 0.3,
        contextMatch = true,
        includeAdaptations = false
      } = options;
      
      // Extract context features for matching
      const contextFeatures = this.extractContextFeatures(context);
      
      // Build query conditions
      const conditions = [
        'agent_id = $1',
        'user_id = $2',
        `effectiveness_score >= ${minEffectiveness}`
      ];
      const params = [this.agentId, this.userId];
      
      // Behavior type filtering
      if (behaviorTypes && behaviorTypes.length > 0) {
        conditions.push(`procedure_type = ANY($${params.length + 1})`);
        params.push(behaviorTypes);
      }
      
      // Context matching (if enabled)
      if (contextMatch) {
        conditions.push(`context_tags ?| $${params.length + 1}`); // JSON overlap
        params.push(contextFeatures);
      }
      
      // Execute query with usage-based scoring
      const result = await neonDB.query(`
        SELECT *, 
               (usage_count * 0.3 + success_count * 0.4 + effectiveness_score * 0.3) as relevance_score
        FROM procedural_memory 
        WHERE ${conditions.join(' AND ')}
        ORDER BY relevance_score DESC, last_used DESC
        LIMIT $${params.length + 1}
      `, [...params, limit]);
      
      const behaviors = result.rows.map(row => ({
        ...row,
        pattern: JSON.parse(row.pattern),
        triggers: JSON.parse(row.triggers),
        conditions: JSON.parse(row.conditions),
        response_template: JSON.parse(row.response_template),
        context_tags: JSON.parse(row.context_tags),
        adaptation_history: JSON.parse(row.adaptation_history),
        memoryType: 'procedural',
        relevanceScore: row.relevance_score
      }));
      
      // Load adaptations if requested
      if (includeAdaptations) {
        for (const behavior of behaviors) {
          behavior.recent_adaptations = await this.getRecentAdaptations(behavior.id);
        }
      }
      
      const responseTime = Date.now() - startTime;
      
      console.log(`[SEARCH] [ProceduralMemory] Retrieved ${behaviors.length} behaviors (${responseTime}ms)`);
      
      return behaviors;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[ERROR] [ProceduralMemory] Retrieval failed:', error);
      
      return [];
    }
  }
  
  /**
   * Execute behavior and learn from outcome
   */
  async executeBehavior(behaviorId, context, feedback = null) {
    try {
      const behavior = await this.getBehavior(behaviorId);
      if (!behavior) {
        throw new Error('Behavior not found');
      }
      
      // Update usage count
      await neonDB.query(`
        UPDATE procedural_memory 
        SET usage_count = usage_count + 1, last_used = NOW()
        WHERE id = $1
      `, [behaviorId]);
      
      // Process feedback if provided
      if (feedback) {
        await this.processBehaviorFeedback(behaviorId, feedback, context);
      }
      
      // Update cache
      if (this.behaviorCache.has(behaviorId)) {
        const cached = this.behaviorCache.get(behaviorId);
        cached.usage_count++;
        cached.last_used = new Date();
      }
      
      this.emit('behaviorExecuted', { behaviorId, feedback });
      
      return behavior.response_template;
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Behavior execution failed:', error);
      throw error;
    }
  }
  
  /**
   * Process feedback and adapt behavior
   */
  async processBehaviorFeedback(behaviorId, feedback, context) {
    try {
      const isSuccess = feedback.success || feedback.rating > 0.7;
      
      // Update success metrics
      const updateQuery = isSuccess ? 
        'UPDATE procedural_memory SET success_count = success_count + 1 WHERE id = $1' :
        'UPDATE procedural_memory SET usage_count = usage_count WHERE id = $1'; // No success increment
      
      await neonDB.query(updateQuery, [behaviorId]);
      
      // Adapt behavior based on feedback
      if (feedback.adaptation || feedback.improvement) {
        await this.adaptBehavior(behaviorId, feedback, context);
      }
      
      // Update effectiveness score
      await this.updateEffectivenessScore(behaviorId);
      
      this.metrics.behaviorAdaptations++;
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Feedback processing failed:', error);
    }
  }
  
  /**
   * Adapt behavior based on feedback
   */
  async adaptBehavior(behaviorId, feedback, context) {
    try {
      const behavior = await this.getBehavior(behaviorId);
      if (!behavior) return;
      
      // Create adaptation record
      const adaptation = {
        timestamp: new Date(),
        feedback: feedback,
        context: this.extractContextTags(context),
        adaptationType: this.determineAdaptationType(feedback),
        changes: this.generateAdaptationChanges(behavior, feedback, context)
      };
      
      // Update adaptation history
      const adaptationHistory = behavior.adaptation_history || [];
      adaptationHistory.push(adaptation);
      
      // Apply adaptations to behavior
      const updatedBehavior = this.applyAdaptations(behavior, adaptation);
      
      // Update in database
      await neonDB.query(`
        UPDATE procedural_memory 
        SET 
          pattern = $2,
          response_template = $3,
          adaptation_history = $4,
          effectiveness_score = $5
        WHERE id = $1
      `, [
        behaviorId,
        JSON.stringify(updatedBehavior.pattern),
        JSON.stringify(updatedBehavior.response_template),
        JSON.stringify(adaptationHistory),
        updatedBehavior.effectiveness_score
      ]);
      
      // Update cache
      this.behaviorCache.set(behaviorId, updatedBehavior);
      
      console.log(`[LOADING] [ProceduralMemory] Adapted behavior ${behaviorId} - Type: ${adaptation.adaptationType}`);
      
      this.emit('behaviorAdapted', { behaviorId, adaptation });
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Behavior adaptation failed:', error);
    }
  }
  
  /**
   * Extract behavior pattern from content (NO HARDCODING - agent learns patterns)
   */
  async extractBehaviorPattern(content, context, metadata) {
    const pattern = {
      contentType: typeof content,
      contentLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
      hasStructuredData: typeof content === 'object',
      contextKeys: Object.keys(context || {}),
      interactionType: this.inferInteractionType(content, context),
      responseStyle: this.inferResponseStyle(content, context),
      complexity: this.calculateComplexity(content, context)
    };
    
    // Add pattern-specific features based on content analysis
    if (typeof content === 'string') {
      pattern.hasQuestions = content.includes('?');
      pattern.hasCommands = this.containsCommandIndicators(content);
      pattern.hasExplanations = this.containsExplanationIndicators(content);
    }
    
    return pattern;
  }
  
  /**
   * Classify behavior type (agent learns this dynamically - NO HARDCODING)
   */
  async classifyBehaviorType(content, context, metadata) {
    // Response patterns
    if (context.isResponse || metadata.isResponse) {
      return 'response_pattern';
    }
    
    // Task sequences
    if (this.containsTaskSequenceIndicators(content, context, metadata)) {
      return 'task_sequence';
    }
    
    // Error handling behaviors
    if (context.isError || this.containsErrorHandlingIndicators(content, context, metadata)) {
      return 'error_handling';
    }
    
    // User preference behaviors
    if (metadata.isUserPreference || context.userPreference) {
      return 'user_preference';
    }
    
    // Optimization behaviors
    if (this.containsOptimizationIndicators(content, context, metadata)) {
      return 'optimization';
    }
    
    // Adaptation behaviors
    if (metadata.isAdaptation || context.isAdaptation) {
      return 'adaptation';
    }
    
    // Default to response pattern
    return 'response_pattern';
  }
  
  /**
   * Calculate effectiveness score for behavior
   */
  calculateEffectiveness(content, context, metadata) {
    let effectiveness = 0.5; // Base effectiveness
    
    // Content-based effectiveness
    if (typeof content === 'string') {
      // Comprehensive responses are more effective
      if (content.length > 200) effectiveness += 0.1;
      if (content.length > 500) effectiveness += 0.1;
      
      // Clear structure indicates effectiveness
      if (this.hasGoodStructure(content)) effectiveness += 0.15;
      
      // Actionable content is more effective
      if (this.containsActionableContent(content)) effectiveness += 0.2;
    }
    
    // Context-based effectiveness
    if (context.userSatisfaction) effectiveness += context.userSatisfaction * 0.3;
    if (context.taskCompletion) effectiveness += 0.25;
    if (context.problemResolved) effectiveness += 0.3;
    if (context.userEngagement > 0.7) effectiveness += 0.15;
    
    // Metadata-based effectiveness
    if (metadata.wasSuccessful) effectiveness += 0.2;
    if (metadata.userRating && metadata.userRating > 0.8) effectiveness += 0.2;
    if (metadata.followUpReduced) effectiveness += 0.15; // Fewer follow-ups = more effective
    if (metadata.timeToResolution && metadata.timeToResolution < 30) effectiveness += 0.1;
    
    return Math.max(0.0, Math.min(1.0, effectiveness));
  }
  
  /**
   * Behavior indicator detection methods
   */
  containsTaskSequenceIndicators(content, context, metadata) {
    if (metadata.isTaskSequence || context.isTaskSequence) return true;
    
    if (typeof content === 'string') {
      const sequenceKeywords = ['first', 'then', 'next', 'finally', 'step', 'process', 'workflow'];
      return sequenceKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  containsErrorHandlingIndicators(content, context, metadata) {
    if (metadata.isErrorHandling) return true;
    
    if (typeof content === 'string') {
      const errorKeywords = ['error', 'problem', 'issue', 'fix', 'resolve', 'troubleshoot'];
      return errorKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  containsOptimizationIndicators(content, context, metadata) {
    if (metadata.isOptimization) return true;
    
    if (typeof content === 'string') {
      const optimizationKeywords = ['improve', 'optimize', 'better', 'faster', 'efficient'];
      return optimizationKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  containsCommandIndicators(content) {
    const commandWords = ['create', 'build', 'make', 'delete', 'update', 'run', 'execute'];
    return commandWords.some(word => content.toLowerCase().includes(word));
  }
  
  containsExplanationIndicators(content) {
    const explanationWords = ['because', 'reason', 'explain', 'why', 'how', 'means'];
    return explanationWords.some(word => content.toLowerCase().includes(word));
  }
  
  hasGoodStructure(content) {
    // Check for structured elements
    const structureIndicators = [
      content.includes('\n-') || content.includes('\n*'), // Lists
      content.includes(':'), // Labels/definitions
      content.match(/\d+\./), // Numbered lists
      content.includes('\n\n') // Paragraphs
    ];
    
    return structureIndicators.filter(Boolean).length >= 2;
  }
  
  containsActionableContent(content) {
    const actionWords = ['click', 'type', 'select', 'choose', 'navigate', 'open', 'close'];
    return actionWords.some(word => content.toLowerCase().includes(word));
  }
  
  /**
   * Utility methods for behavior management
   */
  extractBehaviorTriggers(content, context, metadata) {
    return {
      userActions: context.userActions || [],
      contextStates: context.contextStates || [],
      keywords: this.extractTriggerKeywords(content),
      conditions: context.conditions || []
    };
  }
  
  extractBehaviorConditions(content, context, metadata) {
    return {
      userType: context.userType || 'general',
      sessionState: context.sessionState || 'active',
      domainContext: context.domain || 'general',
      timeConstraints: context.timeConstraints || null,
      prerequisites: context.prerequisites || []
    };
  }
  
  extractResponseTemplate(content, context) {
    if (typeof content === 'string') {
      return {
        type: 'text',
        template: content,
        variables: this.extractTemplateVariables(content),
        structure: this.analyzeTextStructure(content)
      };
    } else {
      return {
        type: 'structured',
        template: content,
        schema: Object.keys(content || {}),
        format: 'json'
      };
    }
  }
  
  extractContextTags(context) {
    const tags = [];
    
    // Extract meaningful tags from context
    if (context.domain) tags.push(`domain:${context.domain}`);
    if (context.userType) tags.push(`user:${context.userType}`);
    if (context.sessionState) tags.push(`session:${context.sessionState}`);
    if (context.taskType) tags.push(`task:${context.taskType}`);
    if (context.urgency) tags.push(`urgency:${context.urgency}`);
    
    return tags;
  }
  
  extractContextFeatures(context) {
    return this.extractContextTags(context).map(tag => tag.split(':')[1]).filter(Boolean);
  }
  
  extractTriggerKeywords(content) {
    if (typeof content !== 'string') return [];
    
    // Simple keyword extraction (could be enhanced with NLP)
    const words = content.toLowerCase().match(/\b\w+\b/g) || [];
    const importantWords = words.filter(word => word.length > 3);
    
    // Return most frequent words as triggers
    const wordCount = {};
    importantWords.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }
  
  extractTemplateVariables(content) {
    // Extract potential template variables (placeholders)
    const variablePattern = /\{([^}]+)\}/g;
    const variables = [];
    let match;
    
    while ((match = variablePattern.exec(content)) !== null) {
      variables.push(match[1]);
    }
    
    return variables;
  }
  
  analyzeTextStructure(content) {
    return {
      hasList: content.includes('\n-') || content.includes('\n*'),
      hasNumbers: /\d/.test(content),
      hasQuestions: content.includes('?'),
      paragraphs: content.split('\n\n').length,
      sentences: content.split(/[.!?]/).length
    };
  }
  
  inferInteractionType(content, context) {
    if (context.interactionType) return context.interactionType;
    
    if (typeof content === 'string') {
      if (content.includes('?')) return 'question';
      if (this.containsCommandIndicators(content)) return 'command';
      if (this.containsExplanationIndicators(content)) return 'explanation';
    }
    
    return 'general';
  }
  
  inferResponseStyle(content, context) {
    if (context.responseStyle) return context.responseStyle;
    
    if (typeof content === 'string') {
      if (this.hasGoodStructure(content)) return 'structured';
      if (content.length > 500) return 'detailed';
      if (content.length < 100) return 'concise';
    }
    
    return 'standard';
  }
  
  calculateComplexity(content, context) {
    let complexity = 0;
    
    if (typeof content === 'string') {
      complexity += Math.min(content.length / 1000, 1); // Length-based
      complexity += (content.split('\n').length - 1) * 0.1; // Structure-based
    } else {
      complexity += Object.keys(content || {}).length * 0.1; // Object complexity
    }
    
    if (context.domainComplexity) complexity += context.domainComplexity * 0.5;
    
    return Math.max(0, Math.min(1, complexity));
  }
  
  /**
   * Database and caching operations
   */
  async getBehavior(behaviorId) {
    // Check cache first
    if (this.behaviorCache.has(behaviorId)) {
      return this.behaviorCache.get(behaviorId);
    }
    
    // Load from database
    try {
      const result = await neonDB.query(`
        SELECT * FROM procedural_memory WHERE id = $1
      `, [behaviorId]);
      
      if (result.rows.length > 0) {
        const behavior = {
          ...result.rows[0],
          pattern: JSON.parse(result.rows[0].pattern),
          triggers: JSON.parse(result.rows[0].triggers),
          conditions: JSON.parse(result.rows[0].conditions),
          response_template: JSON.parse(result.rows[0].response_template),
          context_tags: JSON.parse(result.rows[0].context_tags),
          adaptation_history: JSON.parse(result.rows[0].adaptation_history)
        };
        
        // Cache for future use
        this.behaviorCache.set(behaviorId, behavior);
        
        return behavior;
      }
      
      return null;
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Failed to get behavior:', error);
      return null;
    }
  }
  
  async findSimilarBehavior(pattern, behaviorType) {
    try {
      // Simple similarity check based on pattern features
      const result = await neonDB.query(`
        SELECT * FROM procedural_memory 
        WHERE agent_id = $1 AND user_id = $2 AND procedure_type = $3
        ORDER BY created_at DESC
        LIMIT 5
      `, [this.agentId, this.userId, behaviorType]);
      
      for (const row of result.rows) {
        // Extract procedure_data which contains the pattern
        if (!row.procedure_data) {
          console.warn('[ProceduralMemory] Skipping row with null/undefined procedure_data:', row.id);
          continue;
        }
        
        let procedureData;
        try {
          procedureData = this.safeJsonParse(row.procedure_data, {});
        } catch (parseError) {
          console.warn('[ProceduralMemory] Failed to parse procedure_data JSON:', row.procedure_data, parseError);
          continue;
        }
        
        // Extract pattern from procedure_data
        const existingPattern = procedureData.pattern;
        if (!existingPattern) {
          console.warn('[ProceduralMemory] Skipping row with null/undefined pattern in procedure_data:', row.id);
          continue;
        }
        
        const similarity = this.calculatePatternSimilarity(pattern, existingPattern);
        
        if (similarity > 0.8) {
          return {
            ...row,
            pattern: existingPattern,
            triggers: procedureData.triggers || [],
            conditions: this.safeJsonParse(row.context_conditions, {}),
            response_template: procedureData.response_template || {},
            context_tags: [], // Not stored in current schema
            adaptation_history: this.safeJsonParse(row.adaptation_history, [])
          };
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Similar behavior search failed:', error);
      return null;
    }
  }
  
  calculatePatternSimilarity(pattern1, pattern2) {
    let similarity = 0;
    const keys = new Set([...Object.keys(pattern1), ...Object.keys(pattern2)]);
    
    for (const key of keys) {
      if (pattern1[key] === pattern2[key]) {
        similarity += 1 / keys.size;
      }
    }
    
    return similarity;
  }
  
  async updateBehavior(existingBehavior, newContent, newContext, newMetadata) {
    try {
      // Update effectiveness based on new data
      const newEffectiveness = this.calculateEffectiveness(newContent, newContext, newMetadata);
      const updatedEffectiveness = 
        (existingBehavior.effectiveness_score * 0.7) + (newEffectiveness * 0.3);
      
      // Increment usage count
      const updatedUsageCount = existingBehavior.usage_count + 1;
      const updatedSuccessCount = existingBehavior.success_count + 
        (newMetadata.wasSuccessful ? 1 : 0);
      
      // Update in database
      await neonDB.query(`
        UPDATE procedural_memory 
        SET 
          effectiveness_score = $2,
          usage_count = $3,
          success_count = $4,
          last_used = NOW()
        WHERE id = $1
      `, [
        existingBehavior.id,
        updatedEffectiveness,
        updatedUsageCount,
        updatedSuccessCount
      ]);
      
      // Update cached version
      const updatedBehavior = {
        ...existingBehavior,
        effectiveness_score: updatedEffectiveness,
        usage_count: updatedUsageCount,
        success_count: updatedSuccessCount,
        last_used: new Date()
      };
      
      this.behaviorCache.set(existingBehavior.id, updatedBehavior);
      
      this.updateMetrics('update', updatedBehavior);
      
      console.log(`[LOADING] [ProceduralMemory] Updated behavior ${existingBehavior.id} - Effectiveness: ${updatedEffectiveness.toFixed(2)}`);
      
      return updatedBehavior;
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Behavior update failed:', error);
      throw error;
    }
  }
  
  /**
   * Behavior adaptation methods
   */
  determineAdaptationType(feedback) {
    if (feedback.improvement) return 'improvement';
    if (feedback.correction) return 'correction';
    if (feedback.optimization) return 'optimization';
    if (feedback.personalization) return 'personalization';
    
    return 'general';
  }
  
  generateAdaptationChanges(behavior, feedback, context) {
    const changes = {};
    
    // Adapt response template based on feedback
    if (feedback.responseImprovement) {
      changes.response_template = this.improveResponseTemplate(
        behavior.response_template, 
        feedback.responseImprovement
      );
    }
    
    // Adapt triggers based on context
    if (feedback.triggerAdjustment) {
      changes.triggers = this.adjustTriggers(behavior.triggers, feedback.triggerAdjustment);
    }
    
    // Adapt effectiveness based on outcome
    if (feedback.effectivenessAdjustment) {
      changes.effectiveness_score = Math.max(0, Math.min(1, 
        behavior.effectiveness_score + feedback.effectivenessAdjustment
      ));
    }
    
    return changes;
  }
  
  applyAdaptations(behavior, adaptation) {
    const adaptedBehavior = { ...behavior };
    
    // Apply changes from adaptation
    Object.keys(adaptation.changes).forEach(key => {
      adaptedBehavior[key] = adaptation.changes[key];
    });
    
    // Update effectiveness score with learning rate
    if (adaptation.changes.effectiveness_score) {
      adaptedBehavior.effectiveness_score = 
        behavior.effectiveness_score * (1 - this.config.adaptationRate) +
        adaptation.changes.effectiveness_score * this.config.adaptationRate;
    }
    
    return adaptedBehavior;
  }
  
  improveResponseTemplate(currentTemplate, improvement) {
    // Simple template improvement (could be enhanced with NLP)
    if (improvement.addStructure && currentTemplate.type === 'text') {
      return {
        ...currentTemplate,
        structure: { ...currentTemplate.structure, improved: true }
      };
    }
    
    if (improvement.addDetails) {
      return {
        ...currentTemplate,
        enhanced: true,
        details: improvement.addDetails
      };
    }
    
    return currentTemplate;
  }
  
  adjustTriggers(currentTriggers, adjustment) {
    const adjustedTriggers = { ...currentTriggers };
    
    if (adjustment.addKeywords) {
      adjustedTriggers.keywords = [
        ...adjustedTriggers.keywords,
        ...adjustment.addKeywords
      ];
    }
    
    if (adjustment.removeKeywords) {
      adjustedTriggers.keywords = adjustedTriggers.keywords.filter(
        keyword => !adjustment.removeKeywords.includes(keyword)
      );
    }
    
    return adjustedTriggers;
  }
  
  async updateEffectivenessScore(behaviorId) {
    try {
      const result = await neonDB.query(`
        SELECT usage_count, success_count FROM procedural_memory WHERE id = $1
      `, [behaviorId]);
      
      if (result.rows.length > 0) {
        const { usage_count, success_count } = result.rows[0];
        const successRate = usage_count > 0 ? success_count / usage_count : 0;
        
        // Update effectiveness based on success rate
        await neonDB.query(`
          UPDATE procedural_memory 
          SET effectiveness_score = (effectiveness_score * 0.7) + ($2 * 0.3)
          WHERE id = $1
        `, [behaviorId, successRate]);
      }
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Effectiveness update failed:', error);
    }
  }
  
  async getRecentAdaptations(behaviorId) {
    const behavior = await this.getBehavior(behaviorId);
    if (!behavior || !behavior.adaptation_history) return [];
    
    // Return last 5 adaptations
    return behavior.adaptation_history.slice(-5);
  }
  
  /**
   * Pattern analysis and learning
   */
  async loadBehaviorPatterns() {
    try {
      const result = await neonDB.query(`
        SELECT 
          COUNT(*) as total_behaviors,
          AVG(effectiveness_score) as avg_effectiveness,
          AVG(usage_count) as avg_usage,
          COUNT(CASE WHEN success_count > 0 THEN 1 END) as successful_behaviors
        FROM procedural_memory 
        WHERE agent_id = $1 AND user_id = $2
      `, [this.agentId, this.userId]);
      
      if (result.rows.length > 0) {
        const stats = result.rows[0];
        this.metrics.totalBehaviors = parseInt(stats.total_behaviors);
        this.metrics.successfulBehaviors = parseInt(stats.successful_behaviors);
        this.metrics.averageUsageCount = parseFloat(stats.avg_usage) || 0;
        this.metrics.behaviorSuccessRate = this.metrics.totalBehaviors > 0 ?
          this.metrics.successfulBehaviors / this.metrics.totalBehaviors : 0;
      }
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Failed to load behavior patterns:', error);
    }
  }
  
  async loadActiveBehaivors() {
    try {
      // Load most frequently used behaviors into cache
      const result = await neonDB.query(`
        SELECT * FROM procedural_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND effectiveness_score >= 0.5
        ORDER BY usage_count DESC
        LIMIT 50
      `, [this.agentId, this.userId]);
      
      result.rows.forEach(row => {
        const behavior = {
          ...row,
          // Extract data from the actual database structure
          pattern: row.procedure_data?.pattern || {},
          triggers: row.procedure_data?.triggers || {},
          response_template: row.procedure_data?.response_template || {},
          conditions: row.context_conditions || {},
          context_tags: row.context_conditions || {},
          adaptation_history: row.adaptation_history || []
        };
        
        this.behaviorCache.set(row.id, behavior);
      });
      
      console.log(`🔥 [ProceduralMemory] Loaded ${result.rows.length} active behaviors into cache`);
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Failed to load active behaviors:', error);
    }
  }
  
  async learnBehaviorTypes() {
    try {
      const result = await neonDB.query(`
        SELECT 
          procedure_type,
          COUNT(*) as frequency,
          AVG(success_rate) as avg_effectiveness,
          AVG(usage_count) as avg_usage
        FROM procedural_memory 
        WHERE agent_id = $1 AND user_id = $2 
        GROUP BY procedure_type
      `, [this.agentId, this.userId]);
      
      result.rows.forEach(row => {
        const currentType = this.behaviorTypes.get(row.procedure_type);
        if (currentType) {
          // Weight based on effectiveness and usage
          const performanceScore = (
            parseFloat(row.avg_effectiveness) + 
            Math.log(parseFloat(row.avg_usage) + 1) / 5
          ) / 2;
          currentType.weight = Math.max(0.5, Math.min(2.0, performanceScore * 1.5));
        } else {
          // New behavior type discovered by agent
          this.behaviorTypes.set(row.procedure_type, {
            weight: 1.0,
            examples: []
          });
        }
      });
      
      console.log(`🧠 [ProceduralMemory] Learned from ${result.rows.length} behavior types`);
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Behavior type learning failed:', error);
    }
  }
  
  setupPatternAnalysis() {
    // Periodic pattern analysis and behavior optimization
    setInterval(async () => {
      try {
        console.log('[LOADING] [ProceduralMemory] Starting pattern analysis...');
        
        // Analyze behavior patterns
        await this.analyzeUsagePatterns();
        
        // Optimize behavior cache
        await this.optimizeBehaviorCache();
        
        // Clean up low-performance behaviors
        await this.cleanupLowPerformanceBehaviors();
        
        this.metrics.lastPatternAnalysis = new Date();
        console.log('[OK] [ProceduralMemory] Pattern analysis complete');
        
      } catch (error) {
        console.error('[ERROR] [ProceduralMemory] Pattern analysis failed:', error);
      }
    }, this.config.patternAnalysisInterval);
  }
  
  async analyzeUsagePatterns() {
    // Analyze which behaviors are most/least effective
    // This could trigger automatic behavior adaptations
    this.metrics.patternRecognitions++;
  }
  
  async optimizeBehaviorCache() {
    // Keep most frequently used behaviors in cache
    const cacheSize = this.behaviorCache.size;
    if (cacheSize > 100) {
      // Remove least recently used behaviors
      const entries = Array.from(this.behaviorCache.entries());
      entries.sort(([,a], [,b]) => new Date(b.last_used) - new Date(a.last_used));
      
      // Keep top 50 most recently used
      this.behaviorCache.clear();
      entries.slice(0, 50).forEach(([id, behavior]) => {
        this.behaviorCache.set(id, behavior);
      });
      
      console.log(`[CLEAN] [ProceduralMemory] Optimized cache: ${cacheSize} → ${this.behaviorCache.size} behaviors`);
    }
  }
  
  async cleanupLowPerformanceBehaviors() {
    try {
      const result = await neonDB.query(`
        DELETE FROM procedural_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND effectiveness_score < $3
        AND usage_count < 2
        AND created_at < NOW() - INTERVAL '30 days'
      `, [this.agentId, this.userId, this.config.usageThreshold]);
      
      if (result.rowCount > 0) {
        console.log(`[CLEAN] [ProceduralMemory] Cleaned up ${result.rowCount} low-performance behaviors`);
      }
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Cleanup failed:', error);
    }
  }
  
  updateMetrics(operation, behavior) {
    if (operation === 'store') {
      this.metrics.totalBehaviors++;
    }
    
    // Update success rate
    if (behavior.success_count > 0) {
      this.metrics.behaviorSuccessRate = 
        (this.metrics.behaviorSuccessRate + (behavior.success_count / behavior.usage_count)) / 2;
    }
  }
  
  /**
   * Record behavior pattern in procedural memory (API method)
   */
  async recordBehavior(behaviorData) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Use existing store method
      const result = await this.store(behaviorData.pattern, behaviorData.context || {}, {
        success: behaviorData.success !== false,
        timestamp: behaviorData.timestamp || new Date(),
        forceStore: true
      });
      
      return result;
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Record behavior failed:', error);
      throw error;
    }
  }
  
  /**
   * Get top performing behaviors (API method)
   */
  async getTopBehaviors(limit = 10) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const result = await neonDB.query(`
        SELECT * FROM procedural_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND is_active = true
        ORDER BY success_rate DESC, usage_count DESC 
        LIMIT $3
      `, [this.agentId, this.userId, limit]);
      
      return result.rows.map(row => ({
        ...row,
        procedure_data: this.safeJsonParse(row.procedure_data, {}),
        context_conditions: this.safeJsonParse(row.context_conditions, {}),
        adaptation_history: this.safeJsonParse(row.adaptation_history, []),
        memoryType: 'procedural'
      }));
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Get top behaviors failed:', error);
      throw error;
    }
  }
  
  /**
   * Find relevant behaviors for context (API method)
   */
  async findRelevantBehaviors(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const { limit = 10 } = options;
    
    try {
      // Simple text search in procedure data and context conditions
      const result = await neonDB.query(`
        SELECT * FROM procedural_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND is_active = true
        AND (
          procedure_data::text ILIKE $3 
          OR context_conditions::text ILIKE $3
          OR procedure_name ILIKE $3
          OR procedure_type ILIKE $3
        )
        ORDER BY success_rate DESC, usage_count DESC 
        LIMIT $4
      `, [this.agentId, this.userId, `%${query}%`, limit]);
      
      return result.rows.map(row => ({
        ...row,
        procedure_data: this.safeJsonParse(row.procedure_data, {}),
        context_conditions: this.safeJsonParse(row.context_conditions, {}),
        adaptation_history: this.safeJsonParse(row.adaptation_history, []),
        memoryType: 'procedural'
      }));
      
    } catch (error) {
      console.error('[ERROR] [ProceduralMemory] Find relevant behaviors failed:', error);
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
        console.error(`[ProceduralMemory] JSON parse failed:`, {
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
    console.warn(`[ProceduralMemory] Unexpected value type for JSON parsing:`, {
      type: typeof value,
      value: String(value).substring(0, 100),
      constructor: value.constructor?.name
    });
    return defaultValue;
  }

  /**
   * Get procedural memory statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      agentId: this.agentId,
      userId: this.userId,
      ...this.metrics,
      behaviorTypes: Object.fromEntries(this.behaviorTypes),
      cacheSize: this.behaviorCache.size,
      config: this.config
    };
  }
}

module.exports = ProceduralMemory;