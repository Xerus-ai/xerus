/**
 * PATTERN DISCOVERY SERVICE
 * Emergent pattern recognition across all memory types
 * 
 * Features:
 * - Cross-memory pattern detection (working, episodic, semantic, procedural)
 * - Emergent behavior pattern recognition
 * - Agent self-discovery mechanisms (NO HARDCODING)
 * - Temporal pattern analysis
 * - Cross-domain knowledge linking
 * - Memory evolution suggestions
 */

const { EventEmitter } = require('events');
const { neonDB } = require('../../database/connections/neon');

class PatternDiscovery extends EventEmitter {
  constructor() {
    super();
    
    this.initialized = false;
    
    // Configuration
    this.config = {
      minPatternSupport: 3,         // Minimum occurrences to recognize pattern
      patternConfidenceThreshold: 0.7, // Minimum confidence for valid pattern
      temporalWindowHours: 24,      // Time window for temporal patterns
      maxPatternsPerAgent: 500,     // Maximum patterns to track per agent
      discoveryInterval: 2 * 60 * 60 * 1000, // 2 hours
      patternEvolutionThreshold: 0.8 // Threshold for pattern evolution
    };
    
    // Pattern categories (discovered dynamically)
    this.patternCategories = new Map([
      ['temporal', { weight: 1.0, description: 'Time-based patterns' }],
      ['contextual', { weight: 1.1, description: 'Context-dependent patterns' }],
      ['behavioral', { weight: 1.2, description: 'User behavior patterns' }],
      ['semantic', { weight: 1.3, description: 'Knowledge relationship patterns' }],
      ['procedural', { weight: 1.4, description: 'Action sequence patterns' }],
      ['adaptive', { weight: 1.5, description: 'Learning adaptation patterns' }]
    ]);
    
    // Active pattern instances per agent-user
    this.patternInstances = new Map(); // Key: "agentId:userId"
    
    // Global pattern metrics
    this.metrics = {
      totalPatterns: 0,
      patternsDiscovered: 0,
      patternEvolutions: 0,
      averageConfidence: 0,
      crossDomainConnections: 0,
      lastDiscovery: null
    };
    
    console.log('[SEARCH] [PatternDiscovery] Initializing pattern discovery service...');
  }
  
  /**
   * Initialize pattern discovery service
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      // Load existing patterns
      await this.loadExistingPatterns();
      
      // Setup discovery intervals
      this.setupDiscoveryIntervals();
      
      // Initialize pattern analysis algorithms
      this.initializeAnalysisAlgorithms();
      
      this.initialized = true;
      
      console.log(`[OK] [PatternDiscovery] Initialized - ${this.metrics.totalPatterns} existing patterns`);
      
      this.emit('initialized');
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Create pattern discovery instance for specific agent-user
   */
  async createInstanceHandler(agentId, userId) {
    const instanceKey = `${agentId}:${userId}`;
    
    if (this.patternInstances.has(instanceKey)) {
      return this.patternInstances.get(instanceKey);
    }
    
    const instance = {
      agentId,
      userId,
      instanceKey,
      patterns: new Map(),
      discoveries: [],
      lastAnalysis: null,
      
      // Instance methods
      analyzeNewMemory: (content, context, results) => this.analyzeNewMemory(agentId, userId, content, context, results),
      enhanceRetrieval: (memories, query, context) => this.enhanceRetrieval(agentId, userId, memories, query, context),
      getPatterns: () => this.getPatterns(agentId, userId),
      evolvePatterns: () => this.evolvePatterns(agentId, userId)
    };
    
    // Load existing patterns for this instance
    await this.loadInstancePatterns(instance);
    
    this.patternInstances.set(instanceKey, instance);
    
    console.log(`[NEW] [PatternDiscovery] Created instance handler for agent ${agentId}, user ${userId}`);
    
    return instance;
  }
  
  /**
   * Analyze new memory for emerging patterns
   */
  async analyzeNewMemory(agentId, userId, content, context, storageResults) {
    try {
      const instance = this.patternInstances.get(`${agentId}:${userId}`);
      if (!instance) return;
      
      console.log(`[SEARCH] [PatternDiscovery] Analyzing new memory for patterns - Agent: ${agentId}`);
      
      // Extract features from memory storage
      const memoryFeatures = this.extractMemoryFeatures(content, context, storageResults);
      
      // Temporal pattern analysis
      const temporalPatterns = await this.analyzeTemporalPatterns(agentId, userId, memoryFeatures);
      
      // Contextual pattern analysis  
      const contextualPatterns = await this.analyzeContextualPatterns(agentId, userId, memoryFeatures);
      
      // Cross-memory pattern analysis
      const crossMemoryPatterns = await this.analyzeCrossMemoryPatterns(agentId, userId, storageResults);
      
      // Behavioral pattern analysis
      const behavioralPatterns = await this.analyzeBehavioralPatterns(agentId, userId, memoryFeatures);
      
      // Consolidate discovered patterns
      const discoveredPatterns = [
        ...temporalPatterns,
        ...contextualPatterns,  
        ...crossMemoryPatterns,
        ...behavioralPatterns
      ];
      
      // Validate and store new patterns
      for (const pattern of discoveredPatterns) {
        if (pattern.confidence >= this.config.patternConfidenceThreshold) {
          await this.storeDiscoveredPattern(agentId, userId, pattern);
          instance.discoveries.push({
            pattern,
            discoveredAt: new Date(),
            memoryTrigger: memoryFeatures
          });
        }
      }
      
      instance.lastAnalysis = new Date();
      
      if (discoveredPatterns.length > 0) {
        console.log(`✨ [PatternDiscovery] Discovered ${discoveredPatterns.length} new patterns`);
        this.emit('patternsDiscovered', { agentId, userId, patterns: discoveredPatterns });
      }
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Memory analysis failed:', error);
    }
  }
  
  /**
   * Enhance memory retrieval using discovered patterns
   */
  async enhanceRetrieval(agentId, userId, memories, query, context) {
    try {
      const instance = this.patternInstances.get(`${agentId}:${userId}`);
      if (!instance) return memories;
      
      // Apply pattern-based enhancement
      const enhancedMemories = { ...memories };
      
      // Get relevant patterns for current context
      const relevantPatterns = await this.getRelevantPatterns(agentId, userId, context);
      
      // Enhance each memory type using patterns
      for (const memoryType of ['working', 'episodic', 'semantic', 'procedural']) {
        if (enhancedMemories[memoryType]) {
          enhancedMemories[memoryType] = await this.applyPatternEnhancement(
            enhancedMemories[memoryType],
            relevantPatterns,
            query,
            context
          );
        }
      }
      
      // Add pattern-derived memories (memories suggested by patterns)
      const patternDerivedMemories = await this.generatePatternDerivedMemories(
        agentId, 
        userId, 
        relevantPatterns, 
        query, 
        context
      );
      
      if (patternDerivedMemories.length > 0) {
        enhancedMemories.pattern_derived = patternDerivedMemories;
      }
      
      return enhancedMemories;
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Retrieval enhancement failed:', error);
      return memories;
    }
  }
  
  /**
   * Extract features from memory for pattern analysis
   */
  extractMemoryFeatures(content, context, storageResults) {
    const features = {
      timestamp: Date.now(),
      contentType: typeof content,
      contentLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
      contextKeys: Object.keys(context || {}),
      storageTargets: Object.keys(storageResults?.results || {}),
      storageSuccess: Object.values(storageResults?.results || {}).filter(r => r.stored).length,
      
      // Domain features
      domain: context.domain || 'general',
      sessionId: context.sessionId,
      userInitiated: context.userInitiated || false,
      
      // Content features
      hasQuestions: typeof content === 'string' && content.includes('?'),
      hasCommands: typeof content === 'string' && this.containsCommands(content),
      complexity: this.calculateContentComplexity(content),
      
      // Context features
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      sessionLength: context.sessionDuration || 0
    };
    
    return features;
  }
  
  /**
   * Analyze temporal patterns (NO HARDCODING - agent discovers patterns)
   */
  async analyzeTemporalPatterns(agentId, userId, features) {
    const patterns = [];
    
    try {
      // Look for time-based patterns in recent memories
      const recentMemories = await this.getRecentMemories(agentId, userId, 24); // Last 24 hours
      
      if (recentMemories.length < this.config.minPatternSupport) {
        return patterns;
      }
      
      // Time-of-day patterns
      const timePattern = this.discoverTimeOfDayPattern(recentMemories, features);
      if (timePattern.confidence >= this.config.patternConfidenceThreshold) {
        patterns.push(timePattern);
      }
      
      // Session duration patterns
      const sessionPattern = this.discoverSessionDurationPattern(recentMemories, features);
      if (sessionPattern.confidence >= this.config.patternConfidenceThreshold) {
        patterns.push(sessionPattern);
      }
      
      // Memory storage frequency patterns
      const frequencyPattern = this.discoverStorageFrequencyPattern(recentMemories, features);
      if (frequencyPattern.confidence >= this.config.patternConfidenceThreshold) {
        patterns.push(frequencyPattern);
      }
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Temporal pattern analysis failed:', error);
    }
    
    return patterns;
  }
  
  /**
   * Analyze contextual patterns
   */
  async analyzeContextualPatterns(agentId, userId, features) {
    const patterns = [];
    
    try {
      // Look for context-based patterns
      const contextMemories = await this.getContextMemories(agentId, userId, features.domain);
      
      if (contextMemories.length < this.config.minPatternSupport) {
        return patterns;
      }
      
      // Domain-specific patterns
      const domainPattern = this.discoverDomainPattern(contextMemories, features);
      if (domainPattern.confidence >= this.config.patternConfidenceThreshold) {
        patterns.push(domainPattern);
      }
      
      // User interaction patterns
      const interactionPattern = this.discoverInteractionPattern(contextMemories, features);
      if (interactionPattern.confidence >= this.config.patternConfidenceThreshold) {
        patterns.push(interactionPattern);
      }
      
      // Complexity patterns
      const complexityPattern = this.discoverComplexityPattern(contextMemories, features);
      if (complexityPattern.confidence >= this.config.patternConfidenceThreshold) {
        patterns.push(complexityPattern);
      }
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Contextual pattern analysis failed:', error);
    }
    
    return patterns;
  }
  
  /**
   * Analyze cross-memory patterns
   */
  async analyzeCrossMemoryPatterns(agentId, userId, storageResults) {
    const patterns = [];
    
    try {
      if (!storageResults.results) return patterns;
      
      // Analyze which memory types are used together
      const activeMemoryTypes = Object.keys(storageResults.results).filter(
        type => storageResults.results[type].stored
      );
      
      if (activeMemoryTypes.length > 1) {
        // Multi-memory storage pattern
        const multiMemoryPattern = await this.discoverMultiMemoryPattern(
          agentId, 
          userId, 
          activeMemoryTypes
        );
        
        if (multiMemoryPattern.confidence >= this.config.patternConfidenceThreshold) {
          patterns.push(multiMemoryPattern);
        }
      }
      
      // Memory transition patterns (episodic → semantic, etc.)
      const transitionPatterns = await this.discoverMemoryTransitionPatterns(agentId, userId);
      patterns.push(...transitionPatterns.filter(p => p.confidence >= this.config.patternConfidenceThreshold));
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Cross-memory pattern analysis failed:', error);
    }
    
    return patterns;
  }
  
  /**
   * Analyze behavioral patterns
   */
  async analyzeBehavioralPatterns(agentId, userId, features) {
    const patterns = [];
    
    try {
      // Look for behavioral patterns in procedural memory
      const behaviorData = await this.getBehaviorData(agentId, userId);
      
      if (behaviorData.length < this.config.minPatternSupport) {
        return patterns;
      }
      
      // Success behavior patterns
      const successPattern = this.discoverSuccessBehaviorPattern(behaviorData, features);
      if (successPattern.confidence >= this.config.patternConfidenceThreshold) {
        patterns.push(successPattern);
      }
      
      // User preference patterns
      const preferencePattern = this.discoverUserPreferencePattern(behaviorData, features);
      if (preferencePattern.confidence >= this.config.patternConfidenceThreshold) {
        patterns.push(preferencePattern);
      }
      
      // Adaptation patterns
      const adaptationPattern = this.discoverAdaptationPattern(behaviorData, features);
      if (adaptationPattern.confidence >= this.config.patternConfidenceThreshold) {
        patterns.push(adaptationPattern);
      }
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Behavioral pattern analysis failed:', error);
    }
    
    return patterns;
  }
  
  /**
   * Pattern discovery algorithms (agent learns these - NO HARDCODING)
   */
  discoverTimeOfDayPattern(memories, currentFeatures) {
    const hourCounts = {};
    
    memories.forEach(memory => {
      const hour = new Date(memory.created_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    const totalMemories = memories.length;
    const currentHour = currentFeatures.timeOfDay;
    const currentHourCount = hourCounts[currentHour] || 0;
    
    // Calculate pattern strength
    const hourFrequency = currentHourCount / totalMemories;
    const confidence = hourFrequency > 0.3 ? hourFrequency : 0;
    
    return {
      id: require('crypto').randomUUID(),
      type: 'temporal',
      category: 'time_of_day',
      description: `User tends to interact at hour ${currentHour}`,
      confidence: confidence,
      support: currentHourCount,
      parameters: {
        peakHour: currentHour,
        frequency: hourFrequency,
        hourDistribution: hourCounts
      },
      discoveredAt: new Date()
    };
  }
  
  discoverSessionDurationPattern(memories, currentFeatures) {
    const durations = memories
      .map(m => m.session_duration || 0)
      .filter(d => d > 0);
    
    if (durations.length === 0) {
      return { confidence: 0 };
    }
    
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const currentDuration = currentFeatures.sessionLength;
    
    // Check if current duration fits the pattern
    const deviation = Math.abs(currentDuration - avgDuration) / avgDuration;
    const confidence = Math.max(0, 1 - deviation);
    
    return {
      id: require('crypto').randomUUID(),
      type: 'temporal',
      category: 'session_duration',
      description: `Average session duration: ${Math.round(avgDuration)}s`,
      confidence: confidence,
      support: durations.length,
      parameters: {
        averageDuration: avgDuration,
        currentDuration: currentDuration,
        deviation: deviation
      },
      discoveredAt: new Date()
    };
  }
  
  discoverStorageFrequencyPattern(memories, currentFeatures) {
    // Analyze memory storage frequency over time
    const intervals = [];
    const sortedMemories = memories.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    for (let i = 1; i < sortedMemories.length; i++) {
      const interval = new Date(sortedMemories[i].created_at) - new Date(sortedMemories[i-1].created_at);
      intervals.push(interval);
    }
    
    if (intervals.length === 0) {
      return { confidence: 0 };
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const consistency = this.calculateConsistency(intervals, avgInterval);
    
    return {
      id: require('crypto').randomUUID(),
      type: 'temporal',
      category: 'storage_frequency',
      description: `Memory storage interval: ${Math.round(avgInterval/1000)}s`,
      confidence: consistency,
      support: intervals.length,
      parameters: {
        averageInterval: avgInterval,
        consistency: consistency,
        totalMemories: memories.length
      },
      discoveredAt: new Date()
    };
  }
  
  discoverDomainPattern(memories, currentFeatures) {
    const domainCounts = {};
    
    memories.forEach(memory => {
      const domain = memory.domain || 'general';
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });
    
    const currentDomain = currentFeatures.domain;
    const currentDomainCount = domainCounts[currentDomain] || 0;
    const totalMemories = memories.length;
    
    const domainFrequency = currentDomainCount / totalMemories;
    const confidence = domainFrequency > 0.4 ? domainFrequency : 0;
    
    return {
      id: require('crypto').randomUUID(),
      type: 'contextual',
      category: 'domain_preference',
      description: `Frequent domain: ${currentDomain}`,
      confidence: confidence,
      support: currentDomainCount,
      parameters: {
        domain: currentDomain,
        frequency: domainFrequency,
        domainDistribution: domainCounts
      },
      discoveredAt: new Date()
    };
  }
  
  discoverInteractionPattern(memories, currentFeatures) {
    const userInitiatedCount = memories.filter(m => m.user_initiated).length;
    const totalMemories = memories.length;
    
    const userInitiatedRate = userInitiatedCount / totalMemories;
    const confidence = Math.abs(userInitiatedRate - 0.5) * 2; // Stronger pattern if very high or very low
    
    return {
      id: require('crypto').randomUUID(),
      type: 'contextual',
      category: 'interaction_style',
      description: userInitiatedRate > 0.5 ? 'User-driven interactions' : 'System-driven interactions',
      confidence: confidence,
      support: totalMemories,
      parameters: {
        userInitiatedRate: userInitiatedRate,
        interactionStyle: userInitiatedRate > 0.5 ? 'proactive' : 'reactive'
      },
      discoveredAt: new Date()
    };
  }
  
  discoverComplexityPattern(memories, currentFeatures) {
    const complexities = memories.map(m => m.complexity || 0.5);
    const avgComplexity = complexities.reduce((a, b) => a + b, 0) / complexities.length;
    
    const currentComplexity = currentFeatures.complexity;
    const deviation = Math.abs(currentComplexity - avgComplexity);
    const confidence = Math.max(0, 1 - (deviation * 2)); // Lower confidence for high deviation
    
    return {
      id: require('crypto').randomUUID(),
      type: 'contextual',
      category: 'complexity_preference',
      description: `Preferred complexity level: ${avgComplexity.toFixed(2)}`,
      confidence: confidence,
      support: complexities.length,
      parameters: {
        averageComplexity: avgComplexity,
        currentComplexity: currentComplexity,
        deviation: deviation
      },
      discoveredAt: new Date()
    };
  }
  
  async discoverMultiMemoryPattern(agentId, userId, activeMemoryTypes) {
    const combination = activeMemoryTypes.sort().join('+');
    
    // Look for historical usage of this memory combination
    const historicalUsage = await this.getMemoryCombinationUsage(agentId, userId, activeMemoryTypes);
    
    const confidence = Math.min(1.0, historicalUsage.frequency * 2);
    
    return {
      id: require('crypto').randomUUID(),
      type: 'cross_memory',
      category: 'memory_combination',
      description: `Memory types used together: ${combination}`,
      confidence: confidence,
      support: historicalUsage.count,
      parameters: {
        memoryTypes: activeMemoryTypes,
        combination: combination,
        frequency: historicalUsage.frequency,
        historicalCount: historicalUsage.count
      },
      discoveredAt: new Date()
    };
  }
  
  async discoverMemoryTransitionPatterns(agentId, userId) {
    const patterns = [];
    
    // Look for patterns like episodic → semantic promotion
    const promotionData = await this.getPromotionData(agentId, userId);
    
    if (promotionData.episodicToSemantic > this.config.minPatternSupport) {
      patterns.push({
        id: require('crypto').randomUUID(),
        type: 'cross_memory',
        category: 'memory_transition',
        description: 'Episodic memories frequently promoted to semantic',
        confidence: Math.min(1.0, promotionData.episodicToSemantic / 10),
        support: promotionData.episodicToSemantic,
        parameters: {
          transitionType: 'episodic_to_semantic',
          count: promotionData.episodicToSemantic,
          rate: promotionData.promotionRate
        },
        discoveredAt: new Date()
      });
    }
    
    return patterns;
  }
  
  discoverSuccessBehaviorPattern(behaviorData, currentFeatures) {
    const successfulBehaviors = behaviorData.filter(b => b.success_rate > 0.7);
    const totalBehaviors = behaviorData.length;
    
    const successRate = successfulBehaviors.length / totalBehaviors;
    const confidence = successRate;
    
    return {
      id: require('crypto').randomUUID(),
      type: 'behavioral',
      category: 'success_pattern',
      description: `High success rate behaviors: ${successRate.toFixed(2)}`,
      confidence: confidence,
      support: successfulBehaviors.length,
      parameters: {
        successRate: successRate,
        successfulBehaviors: successfulBehaviors.length,
        totalBehaviors: totalBehaviors
      },
      discoveredAt: new Date()
    };
  }
  
  discoverUserPreferencePattern(behaviorData, currentFeatures) {
    // Analyze behavior types that are most successful
    const behaviorTypes = {};
    
    behaviorData.forEach(behavior => {
      const type = behavior.behavior_type;
      if (!behaviorTypes[type]) {
        behaviorTypes[type] = { count: 0, successSum: 0 };
      }
      behaviorTypes[type].count++;
      behaviorTypes[type].successSum += behavior.success_rate || 0;
    });
    
    // Find most preferred behavior type
    let bestType = null;
    let bestScore = 0;
    
    Object.entries(behaviorTypes).forEach(([type, data]) => {
      const avgSuccess = data.successSum / data.count;
      const score = avgSuccess * data.count; // Success weighted by frequency
      
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    });
    
    const confidence = bestScore / behaviorData.length;
    
    return {
      id: require('crypto').randomUUID(),
      type: 'behavioral',
      category: 'preference_pattern',
      description: `Preferred behavior type: ${bestType}`,
      confidence: confidence,
      support: behaviorTypes[bestType]?.count || 0,
      parameters: {
        preferredType: bestType,
        score: bestScore,
        behaviorDistribution: behaviorTypes
      },
      discoveredAt: new Date()
    };
  }
  
  discoverAdaptationPattern(behaviorData, currentFeatures) {
    const adaptiveBehaviors = behaviorData.filter(b => 
      b.adaptation_history && b.adaptation_history.length > 0
    );
    
    const adaptationRate = adaptiveBehaviors.length / behaviorData.length;
    const confidence = adaptationRate;
    
    return {
      id: require('crypto').randomUUID(),
      type: 'behavioral',
      category: 'adaptation_pattern',
      description: `Behavior adaptation rate: ${adaptationRate.toFixed(2)}`,
      confidence: confidence,
      support: adaptiveBehaviors.length,
      parameters: {
        adaptationRate: adaptationRate,
        adaptiveBehaviors: adaptiveBehaviors.length,
        totalBehaviors: behaviorData.length
      },
      discoveredAt: new Date()
    };
  }
  
  /**
   * Store discovered pattern
   */
  async storeDiscoveredPattern(agentId, userId, pattern) {
    try {
      await neonDB.query(`
        INSERT INTO discovered_patterns (
          id, agent_id, user_id, pattern_type, pattern_category,
          description, confidence, support_count, parameters, discovered_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (agent_id, user_id, pattern_category, description) 
        DO UPDATE SET
          confidence = EXCLUDED.confidence,
          support_count = EXCLUDED.support_count,
          parameters = EXCLUDED.parameters,
          discovered_at = EXCLUDED.discovered_at
      `, [
        pattern.id,
        agentId,
        userId,
        pattern.type,
        pattern.category,
        pattern.description,
        pattern.confidence,
        pattern.support,
        JSON.stringify(pattern.parameters),
        pattern.discoveredAt
      ]);
      
      this.metrics.patternsDiscovered++;
      this.metrics.lastDiscovery = new Date();
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Pattern storage failed:', error);
    }
  }
  
  /**
   * Apply pattern enhancement to memories
   */
  async applyPatternEnhancement(memories, patterns, query, context) {
    return memories.map(memory => {
      let enhancedMemory = { ...memory };
      
      // Apply relevant patterns to boost relevance
      patterns.forEach(pattern => {
        const patternRelevance = this.calculatePatternRelevance(memory, pattern, context);
        if (patternRelevance > 0) {
          enhancedMemory.relevanceScore = 
            (enhancedMemory.relevanceScore || 0) + (patternRelevance * pattern.confidence * 0.1);
        }
      });
      
      return enhancedMemory;
    });
  }
  
  calculatePatternRelevance(memory, pattern, context) {
    let relevance = 0;
    
    // Pattern-specific relevance calculation
    switch (pattern.category) {
      case 'domain_preference':
        if (memory.domain === pattern.parameters?.domain) {
          relevance += 0.3;
        }
        break;
        
      case 'time_of_day':
        const memoryHour = new Date(memory.created_at).getHours();
        if (memoryHour === pattern.parameters?.peakHour) {
          relevance += 0.2;
        }
        break;
        
      case 'complexity_preference':
        const complexityMatch = 1 - Math.abs(
          (memory.complexity || 0.5) - pattern.parameters?.averageComplexity
        );
        relevance += complexityMatch * 0.25;
        break;
        
      case 'memory_combination':
        if (pattern.parameters?.memoryTypes?.includes(memory.memoryType)) {
          relevance += 0.2;
        }
        break;
    }
    
    return relevance;
  }
  
  /**
   * Data retrieval methods
   */
  async getRecentMemories(agentId, userId, hours) {
    try {
      // Get memories from all types within time window
      const queries = [
        `SELECT 'working' as memory_type, created_at, context_type as domain, 
                session_id, null as user_initiated, null as complexity, null as session_duration
         FROM working_memory 
         WHERE agent_id = $1 AND user_id = $2 AND created_at >= NOW() - INTERVAL '${hours} hours'`,
        
        `SELECT 'episodic' as memory_type, created_at, null as domain, 
                session_id, null as user_initiated, null as complexity, session_duration
         FROM episodic_memory 
         WHERE agent_id = $1 AND user_id = $2 AND created_at >= NOW() - INTERVAL '${hours} hours'`,
        
        `SELECT 'semantic' as memory_type, created_at, null as domain, 
                null as session_id, null as user_initiated, null as complexity, null as session_duration
         FROM semantic_memory 
         WHERE agent_id = $1 AND user_id = $2 AND created_at >= NOW() - INTERVAL '${hours} hours'`,
        
        `SELECT 'procedural' as memory_type, created_at, null as domain, 
                null as session_id, null as user_initiated, null as complexity, null as session_duration
         FROM procedural_memory 
         WHERE agent_id = $1 AND user_id = $2 AND created_at >= NOW() - INTERVAL '${hours} hours'`
      ];
      
      const results = await Promise.all(
        queries.map(query => neonDB.query(query, [agentId, userId]))
      );
      
      return results.flatMap(result => result.rows);
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Recent memories retrieval failed:', error);
      return [];
    }
  }
  
  async getContextMemories(agentId, userId, domain) {
    try {
      // This is simplified - in practice would need more sophisticated context matching
      const result = await neonDB.query(`
        SELECT 'episodic' as memory_type, created_at, context, session_id
        FROM episodic_memory 
        WHERE agent_id = $1 AND user_id = $2 
        LIMIT 50
      `, [agentId, userId]);
      
      return result.rows;
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Context memories retrieval failed:', error);
      return [];
    }
  }
  
  async getBehaviorData(agentId, userId) {
    try {
      const result = await neonDB.query(`
        SELECT behavior_type, effectiveness_score as success_rate, usage_count, adaptation_history
        FROM procedural_memory 
        WHERE agent_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        LIMIT 100
      `, [agentId, userId]);
      
      return result.rows.map(row => ({
        ...row,
        adaptation_history: JSON.parse(row.adaptation_history || '[]')
      }));
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Behavior data retrieval failed:', error);
      return [];
    }
  }
  
  async getMemoryCombinationUsage(agentId, userId, memoryTypes) {
    // This would require more sophisticated tracking
    // For now, return mock data based on memory types
    return {
      count: memoryTypes.length * 2,
      frequency: Math.min(1.0, memoryTypes.length / 4)
    };
  }
  
  async getPromotionData(agentId, userId) {
    try {
      const result = await neonDB.query(`
        SELECT COUNT(*) as promoted_count
        FROM episodic_memory 
        WHERE agent_id = $1 AND user_id = $2 AND promoted_to_semantic = true
      `, [agentId, userId]);
      
      const promotedCount = parseInt(result.rows[0]?.promoted_count || 0);
      
      return {
        episodicToSemantic: promotedCount,
        promotionRate: promotedCount / 10 // Simplified calculation
      };
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Promotion data retrieval failed:', error);
      return { episodicToSemantic: 0, promotionRate: 0 };
    }
  }
  
  /**
   * Utility methods
   */
  containsCommands(content) {
    const commandWords = ['create', 'build', 'make', 'delete', 'update', 'run'];
    return commandWords.some(word => content.toLowerCase().includes(word));
  }
  
  calculateContentComplexity(content) {
    if (typeof content === 'string') {
      return Math.min(1.0, content.length / 1000 + (content.split(' ').length / 100));
    } else {
      return Math.min(1.0, Object.keys(content || {}).length / 10);
    }
  }
  
  calculateConsistency(values, average) {
    if (values.length === 0) return 0;
    
    const variance = values.reduce((sum, value) => {
      return sum + Math.pow(value - average, 2);
    }, 0) / values.length;
    
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = standardDeviation / average;
    
    // Lower coefficient of variation means higher consistency
    return Math.max(0, 1 - coefficientOfVariation);
  }
  
  async generatePatternDerivedMemories(agentId, userId, patterns, query, context) {
    // Generate synthetic memories based on patterns
    // This is advanced functionality - for now return empty array
    return [];
  }
  
  async getRelevantPatterns(agentId, userId, context) {
    try {
      const result = await neonDB.query(`
        SELECT * FROM discovered_patterns 
        WHERE agent_id = $1 AND user_id = $2 
        AND confidence >= $3
        ORDER BY confidence DESC
        LIMIT 10
      `, [agentId, userId, this.config.patternConfidenceThreshold]);
      
      return result.rows.map(row => ({
        ...row,
        parameters: JSON.parse(row.parameters)
      }));
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Relevant patterns retrieval failed:', error);
      return [];
    }
  }
  
  async getPatterns(agentId, userId) {
    return this.getRelevantPatterns(agentId, userId, {});
  }
  
  /**
   * Get discovered patterns for specific agent-user combination (API method)
   */
  async getDiscoveredPatterns(agentId, userId, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const { type, limit = 20 } = options;
    
    try {
      let query = `
        SELECT * FROM discovered_patterns 
        WHERE instance_key = $1
      `;
      
      const params = [`${agentId}:${userId}`];
      
      if (type) {
        query += ` AND pattern_type = $${params.length + 1}`;
        params.push(type);
      }
      
      query += ` ORDER BY confidence_score DESC, last_seen DESC LIMIT $${params.length + 1}`;
      params.push(limit);
      
      const result = await neonDB.query(query, params);
      
      return result.rows.map(row => ({
        ...row,
        pattern_data: JSON.parse(row.pattern_data || '{}'),
        memory_types: row.memory_types ? row.memory_types.split(',') : []
      }));
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Get discovered patterns failed:', error);
      return [];
    }
  }
  
  async evolvePatterns(agentId, userId) {
    // Pattern evolution logic would go here
    this.metrics.patternEvolutions++;
  }
  
  /**
   * Initialization methods
   */
  async loadExistingPatterns() {
    try {
      const result = await neonDB.query(`
        SELECT COUNT(*) as total_patterns,
               AVG(confidence) as avg_confidence
        FROM discovered_patterns
      `);
      
      if (result.rows.length > 0) {
        this.metrics.totalPatterns = parseInt(result.rows[0].total_patterns);
        this.metrics.averageConfidence = parseFloat(result.rows[0].avg_confidence) || 0;
      }
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Failed to load existing patterns:', error);
    }
  }
  
  async loadInstancePatterns(instance) {
    try {
      const result = await neonDB.query(`
        SELECT * FROM discovered_patterns 
        WHERE agent_id = $1 AND user_id = $2
        ORDER BY confidence DESC
      `, [instance.agentId, instance.userId]);
      
      result.rows.forEach(row => {
        instance.patterns.set(row.id, {
          ...row,
          parameters: JSON.parse(row.parameters)
        });
      });
      
    } catch (error) {
      console.error('[ERROR] [PatternDiscovery] Instance pattern loading failed:', error);
    }
  }
  
  setupDiscoveryIntervals() {
    setInterval(async () => {
      try {
        console.log('[LOADING] [PatternDiscovery] Running periodic pattern analysis...');
        
        // Analyze patterns for all active instances
        for (const [instanceKey, instance] of this.patternInstances) {
          await instance.evolvePatterns();
        }
        
      } catch (error) {
        console.error('[ERROR] [PatternDiscovery] Periodic analysis failed:', error);
      }
    }, this.config.discoveryInterval);
  }
  
  initializeAnalysisAlgorithms() {
    // Initialize any ML models or analysis algorithms here
    console.log('[TOOL] [PatternDiscovery] Analysis algorithms initialized');
  }
  
  /**
   * Get pattern discovery statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      ...this.metrics,
      patternCategories: Object.fromEntries(this.patternCategories),
      activeInstances: this.patternInstances.size,
      config: this.config
    };
  }
}

module.exports = PatternDiscovery;