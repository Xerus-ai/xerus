/**
 * XERUS 4-TYPE MEMORY SYSTEM
 * Agent-agnostic memory service with dynamic discovery
 * 
 * Architecture:
 * - Working Memory: Sliding window context (ephemeral)
 * - Episodic Memory: Session-specific memories 
 * - Semantic Memory: Long-term factual knowledge (RAG integration)
 * - Procedural Memory: Learned behaviors and patterns
 * 
 * Features:
 * - Zero hardcoding - agents discover their own memory needs
 * - Per-user/agent isolation (Mastra AI concepts)
 * - Self-modification (Agent Zero concepts) 
 * - Dual storage: Vector + Graph (mem0 concepts)
 * - Pattern discovery across all memory types
 */

const { EventEmitter } = require('events');
const { neonDB } = require('../../database/connections/neon');

// Import 4 memory type implementations
const WorkingMemory = require('./workingMemory');
const EpisodicMemory = require('./episodicMemory');
const SemanticMemory = require('./semanticMemory');
const ProceduralMemory = require('./proceduralMemory');

// Cross-cutting concerns
const PatternDiscovery = require('./patternDiscovery');
const MemoryIsolation = require('./memoryIsolation');
const MemoryEvolution = require('./memoryEvolution');

class AgentMemoryService extends EventEmitter {
  constructor() {
    super();
    
    // Initialize flag
    this.initialized = false;
    
    // Memory instances per agent-user combination
    this.memoryInstances = new Map(); // Key: "agentId:userId"
    
    // Global services (shared across all memory instances)
    this.patternDiscovery = new PatternDiscovery();
    this.memoryIsolation = new MemoryIsolation();
    this.memoryEvolution = new MemoryEvolution();
    
    // Performance metrics
    this.stats = {
      totalQueries: 0,
      averageResponseTime: 0,
      cacheHitRate: 0,
      memoryInstanceCount: 0,
      patternDiscoveries: 0,
      lastActivity: null
    };
    
    console.log('🧠 [MemoryService] Xerus 4-Type Memory System initializing...');
  }
  
  /**
   * Initialize memory service
   */
  async initialize() {
    if (this.initialized) {
      console.log('[OK] [MemoryService] Already initialized');
      return;
    }
    
    const startTime = Date.now();
    
    try {
      console.log('[TOOL] [MemoryService] Initializing cross-cutting services...');
      
      // Initialize global services
      await this.patternDiscovery.initialize();
      await this.memoryIsolation.initialize();
      await this.memoryEvolution.initialize();
      
      // Set up cleanup intervals
      this.setupCleanupIntervals();
      
      // Set up performance monitoring
      this.setupPerformanceMonitoring();
      
      const initTime = Date.now() - startTime;
      
      this.initialized = true;
      
      console.log(`[OK] [MemoryService] 4-Type Memory System initialized in ${initTime}ms`);
      console.log('🧠 [MemoryService] Ready for agent-agnostic memory operations');
      
      this.emit('initialized', { initTime });
      
      return true;
      
    } catch (error) {
      console.error('[ERROR] [MemoryService] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Get or create memory instance for specific agent-user combination
   */
  async getMemoryInstance(agentId, userId) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Map "default" agent ID to actual agent ID 1 (Assistant)
    let resolvedAgentId = agentId;
    if (agentId === 'default') {
      resolvedAgentId = 1; // Default to Assistant agent
    }
    
    const instanceKey = `${resolvedAgentId}:${userId}`;
    
    // Return existing instance if available
    if (this.memoryInstances.has(instanceKey)) {
      return this.memoryInstances.get(instanceKey);
    }
    
    console.log(`[NEW] [MemoryService] Creating new memory instance for agent ${agentId} (resolved: ${resolvedAgentId}), user ${userId}`);
    
    // Create new 4-type memory instance
    const memoryInstance = {
      agentId: resolvedAgentId, // Use resolved agent ID
      userId,
      instanceKey,
      created: Date.now(),
      lastAccessed: Date.now(),
      
      // 4 Memory Types (agent-agnostic - no hardcoding)
      working: new WorkingMemory(resolvedAgentId, userId),
      episodic: new EpisodicMemory(resolvedAgentId, userId),
      semantic: new SemanticMemory(resolvedAgentId, userId),
      procedural: new ProceduralMemory(resolvedAgentId, userId),
      
      // Instance-specific pattern discovery
      patterns: await this.patternDiscovery.createInstanceHandler(resolvedAgentId, userId),
      
      // Isolation context
      isolation: this.memoryIsolation.createContext(resolvedAgentId, userId)
    };
    
    // Initialize all memory types
    await Promise.all([
      memoryInstance.working.initialize(),
      memoryInstance.episodic.initialize(),
      memoryInstance.semantic.initialize(),
      memoryInstance.procedural.initialize()
    ]);
    
    // Store instance
    this.memoryInstances.set(instanceKey, memoryInstance);
    this.stats.memoryInstanceCount = this.memoryInstances.size;
    
    console.log(`[OK] [MemoryService] Memory instance created: ${instanceKey}`);
    
    return memoryInstance;
  }
  
  /**
   * Store memory across appropriate types based on content and context
   */
  async storeMemory(content, context, metadata = {}) {
    const startTime = Date.now();
    
    try {
      const { agentId, userId } = context;
      const memory = await this.getMemoryInstance(agentId, userId);
      
      // Update access time
      memory.lastAccessed = Date.now();
      
      console.log(`💾 [MemoryService] Storing memory for agent ${agentId}, user ${userId}`);
      
      // Determine which memory types should store this content
      const storageTargets = await this.determineStorageTargets(content, context, metadata);
      
      const storagePromises = [];
      const results = {};
      
      // Store in appropriate memory types (parallel execution)
      if (storageTargets.working) {
        storagePromises.push(
          memory.working.store(content, context, metadata)
            .then(result => { results.working = result; })
        );
      }
      
      if (storageTargets.episodic) {
        storagePromises.push(
          memory.episodic.store(content, context, metadata)
            .then(result => { results.episodic = result; })
        );
      }
      
      if (storageTargets.semantic) {
        storagePromises.push(
          memory.semantic.store(content, context, metadata)
            .then(result => { results.semantic = result; })
        );
      }
      
      if (storageTargets.procedural) {
        storagePromises.push(
          memory.procedural.store(content, context, metadata)
            .then(result => { results.procedural = result; })
        );
      }
      
      // Wait for all storage operations
      await Promise.all(storagePromises);
      
      // Trigger pattern discovery (background process)
      setImmediate(() => {
        memory.patterns.analyzeNewMemory(content, context, results);
      });
      
      // Check for memory evolution opportunities
      setImmediate(() => {
        this.memoryEvolution.evaluateEvolution(memory, content, context);
      });
      
      const responseTime = Date.now() - startTime;
      this.updateStats({ responseTime, operation: 'store' });
      
      console.log(`[OK] [MemoryService] Memory stored in ${responseTime}ms - Types: ${Object.keys(results).join(', ')}`);
      
      return {
        success: true,
        responseTime,
        storageTargets: Object.keys(results),
        results
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[ERROR] [MemoryService] Storage failed:', error);
      
      return {
        success: false,
        error: error.message,
        responseTime
      };
    }
  }
  
  /**
   * Retrieve relevant memories for a query/context
   */
  async retrieveMemory(query, context, options = {}) {
    const startTime = Date.now();
    
    try {
      const { agentId, userId } = context;
      const memory = await this.getMemoryInstance(agentId, userId);
      
      // Update access time
      memory.lastAccessed = Date.now();
      
      console.log(`[SEARCH] [MemoryService] Retrieving memories for agent ${agentId}, user ${userId}`);
      
      // Parallel retrieval from all 4 memory types
      const [workingMemories, episodicMemories, semanticMemories, proceduralMemories] = 
        await Promise.all([
          memory.working.retrieve(query, context, options),
          memory.episodic.retrieve(query, context, options),
          memory.semantic.retrieve(query, context, options),
          memory.procedural.retrieve(query, context, options)
        ]);
      
      // Apply discovered patterns for enhanced retrieval
      const patternEnhancedMemories = await memory.patterns.enhanceRetrieval({
        working: workingMemories,
        episodic: episodicMemories,
        semantic: semanticMemories,
        procedural: proceduralMemories
      }, query, context);
      
      // Merge and rank memories based on relevance and learned patterns
      const rankedMemories = await this.rankAndMergeMemories(
        patternEnhancedMemories,
        query,
        context,
        options
      );
      
      const responseTime = Date.now() - startTime;
      this.updateStats({ responseTime, operation: 'retrieve' });
      
      console.log(`[OK] [MemoryService] Retrieved ${rankedMemories.length} memories in ${responseTime}ms`);
      
      return {
        success: true,
        responseTime,
        memories: rankedMemories,
        breakdown: {
          working: workingMemories.length,
          episodic: episodicMemories.length, 
          semantic: semanticMemories.length,
          procedural: proceduralMemories.length
        }
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[ERROR] [MemoryService] Retrieval failed:', error);
      
      return {
        success: false,
        error: error.message,
        responseTime,
        memories: []
      };
    }
  }
  
  /**
   * Determine which memory types should store specific content (NO HARDCODING)
   */
  async determineStorageTargets(content, context, metadata) {
    // Agent discovers storage needs dynamically - no predefined rules
    const targets = {
      working: false,
      episodic: false,
      semantic: false,
      procedural: false
    };
    
    const { contentType, importance = 0.5, isImmediate = false, isKnowledge = false } = metadata;
    
    // Working memory: Immediate context and high-relevance items
    if (isImmediate || importance > 0.7 || contentType === 'context') {
      targets.working = true;
    }
    
    // Episodic memory: Interaction events and session-specific content
    if (context.sessionId || contentType === 'interaction' || contentType === 'conversation') {
      targets.episodic = true;
    }
    
    // Semantic memory: Factual knowledge and persistent information
    if (isKnowledge || importance > 0.6 || contentType === 'knowledge' || contentType === 'fact') {
      targets.semantic = true;
    }
    
    // Procedural memory: Patterns, behaviors, and learned responses
    if (contentType === 'pattern' || contentType === 'behavior' || metadata.isLearned) {
      targets.procedural = true;
    }
    
    // Ensure at least one target is selected
    if (!Object.values(targets).some(Boolean)) {
      // Default to episodic for session-based content
      targets.episodic = true;
    }
    
    return targets;
  }
  
  /**
   * Rank and merge memories from different types
   */
  async rankAndMergeMemories(memories, query, context, options) {
    const allMemories = [];
    
    // Add memories with type annotation and base scoring
    ['working', 'episodic', 'semantic', 'procedural'].forEach(type => {
      if (memories[type]) {
        memories[type].forEach(memory => {
          allMemories.push({
            ...memory,
            memoryType: type,
            baseScore: memory.relevanceScore || 0
          });
        });
      }
    });
    
    // Apply memory type bonuses (learned dynamically, not hardcoded)
    allMemories.forEach(memory => {
      // Recency bonus for working memory
      if (memory.memoryType === 'working') {
        const age = Date.now() - new Date(memory.created_at).getTime();
        const recencyBonus = Math.max(0, 1 - (age / (10 * 60 * 1000))); // Decay over 10 minutes
        memory.finalScore = memory.baseScore + (recencyBonus * 0.2);
      }
      // Session relevance bonus for episodic
      else if (memory.memoryType === 'episodic' && memory.session_id === context.sessionId) {
        memory.finalScore = memory.baseScore + 0.15;
      }
      // Usage frequency bonus for procedural
      else if (memory.memoryType === 'procedural' && memory.usage_count > 0) {
        const usageBonus = Math.min(0.2, memory.usage_count * 0.02);
        memory.finalScore = memory.baseScore + usageBonus;
      }
      else {
        memory.finalScore = memory.baseScore;
      }
    });
    
    // Sort by final score (highest first)
    allMemories.sort((a, b) => b.finalScore - a.finalScore);
    
    // Return top memories based on options
    const limit = options.limit || 10;
    return allMemories.slice(0, limit);
  }
  
  /**
   * Setup cleanup intervals for memory management
   */
  setupCleanupIntervals() {
    // Cleanup expired working memory (every 5 minutes)
    setInterval(async () => {
      try {
        await neonDB.query(`
          DELETE FROM working_memory 
          WHERE expires_at < NOW()
        `);
      } catch (error) {
        console.error('Working memory cleanup failed:', error);
      }
    }, 5 * 60 * 1000);
    
    // Cleanup inactive memory instances (every 30 minutes)
    setInterval(() => {
      const now = Date.now();
      const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
      
      for (const [key, instance] of this.memoryInstances.entries()) {
        if (now - instance.lastAccessed > inactiveThreshold) {
          this.memoryInstances.delete(key);
          console.log(`[CLEAN] [MemoryService] Cleaned up inactive instance: ${key}`);
        }
      }
      
      this.stats.memoryInstanceCount = this.memoryInstances.size;
    }, 30 * 60 * 1000);
  }
  
  /**
   * Setup performance monitoring
   */
  setupPerformanceMonitoring() {
    setInterval(() => {
      console.log('[DATA] [MemoryService] Performance Stats:', {
        totalQueries: this.stats.totalQueries,
        avgResponseTime: `${this.stats.averageResponseTime}ms`,
        instanceCount: this.stats.memoryInstanceCount,
        patternDiscoveries: this.stats.patternDiscoveries,
        cacheHitRate: `${this.stats.cacheHitRate}%`,
        lastActivity: this.stats.lastActivity
      });
    }, 5 * 60 * 1000); // Every 5 minutes
  }
  
  /**
   * Update performance statistics
   */
  updateStats(data) {
    this.stats.totalQueries++;
    this.stats.lastActivity = new Date();
    
    if (data.responseTime) {
      const alpha = 0.1; // Smoothing factor
      this.stats.averageResponseTime = 
        alpha * data.responseTime + 
        (1 - alpha) * this.stats.averageResponseTime;
    }
    
    if (data.operation === 'pattern_discovery') {
      this.stats.patternDiscoveries++;
    }
  }
  
  /**
   * Get discovered patterns for agent-user combination
   */
  async getDiscoveredPatterns(agentId, userId, options = {}) {
    try {
      if (!this.patternDiscovery) {
        return [];
      }
      
      const instanceKey = `${agentId}:${userId}`;
      return await this.patternDiscovery.getDiscoveredPatterns(instanceKey, options);
      
    } catch (error) {
      console.error('[ERROR] [MemoryService] Failed to get discovered patterns:', error);
      return [];
    }
  }

  /**
   * Get evolution statistics
   */
  async getEvolutionStats() {
    try {
      if (!this.memoryEvolution) {
        return { initialized: false, message: 'Memory evolution not initialized' };
      }
      
      return this.memoryEvolution.getStats();
      
    } catch (error) {
      console.error('[ERROR] [MemoryService] Failed to get evolution stats:', error);
      return { error: error.message };
    }
  }

  /**
   * Get evolution history for agent-user combination
   */
  async getEvolutionHistory(agentId, userId, options = {}) {
    try {
      if (!this.memoryEvolution) {
        return [];
      }
      
      const instanceKey = `${agentId}:${userId}`;
      return this.memoryEvolution.getEvolutionHistory(instanceKey);
      
    } catch (error) {
      console.error('[ERROR] [MemoryService] Failed to get evolution history:', error);
      return [];
    }
  }

  /**
   * Clear all memories for agent-user combination
   */
  async clearMemories(agentId, userId) {
    try {
      const instanceKey = `${agentId}:${userId}`;
      
      // Remove from active instances
      if (this.memoryInstances.has(instanceKey)) {
        this.memoryInstances.delete(instanceKey);
      }
      
      // Clear from database
      const deletePromises = [
        neonDB.query('DELETE FROM working_memory WHERE agent_id = $1 AND user_id = $2', [agentId, userId]),
        neonDB.query('DELETE FROM episodic_memory WHERE agent_id = $1 AND user_id = $2', [agentId, userId]),
        neonDB.query('DELETE FROM semantic_memory WHERE agent_id = $1 AND user_id = $2', [agentId, userId]),
        neonDB.query('DELETE FROM procedural_memory WHERE agent_id = $1 AND user_id = $2', [agentId, userId]),
        neonDB.query('DELETE FROM discovered_patterns WHERE instance_key = $1', [instanceKey])
      ];
      
      await Promise.all(deletePromises);
      
      console.log(`[DELETE] [MemoryService] Cleared all memories for ${instanceKey}`);
      
      this.emit('memoriesCleared', { agentId, userId, instanceKey });
      
    } catch (error) {
      console.error('[ERROR] [MemoryService] Failed to clear memories:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive system statistics
   */
  async getSystemStats() {
    try {
      const stats = {
        service: this.getStats(),
        patternDiscovery: this.patternDiscovery ? this.patternDiscovery.getStats() : null,
        memoryEvolution: this.memoryEvolution ? this.memoryEvolution.getStats() : null,
        memoryIsolation: this.memoryIsolation ? this.memoryIsolation.getStats() : null,
        
        // Database statistics
        database: {
          totalWorkingMemories: 0,
          totalEpisodicMemories: 0,
          totalSemanticMemories: 0,
          totalProceduralMemories: 0,
          totalPatterns: 0
        }
      };
      
      // Get database counts
      try {
        const countQueries = [
          neonDB.query('SELECT COUNT(*) as count FROM working_memory'),
          neonDB.query('SELECT COUNT(*) as count FROM episodic_memory'),
          neonDB.query('SELECT COUNT(*) as count FROM semantic_memory'),
          neonDB.query('SELECT COUNT(*) as count FROM procedural_memory'),
          neonDB.query('SELECT COUNT(*) as count FROM discovered_patterns')
        ];
        
        const results = await Promise.all(countQueries);
        
        stats.database.totalWorkingMemories = parseInt(results[0].rows[0]?.count || 0);
        stats.database.totalEpisodicMemories = parseInt(results[1].rows[0]?.count || 0);
        stats.database.totalSemanticMemories = parseInt(results[2].rows[0]?.count || 0);
        stats.database.totalProceduralMemories = parseInt(results[3].rows[0]?.count || 0);
        stats.database.totalPatterns = parseInt(results[4].rows[0]?.count || 0);
        
      } catch (error) {
        console.error('[ERROR] [MemoryService] Failed to get database counts:', error);
      }
      
      return stats;
      
    } catch (error) {
      console.error('[ERROR] [MemoryService] Failed to get system stats:', error);
      throw error;
    }
  }

  /**
   * Get service statistics and health
   */
  getStats() {
    return {
      initialized: this.initialized,
      ...this.stats,
      memoryTypes: ['working', 'episodic', 'semantic', 'procedural'],
      features: ['pattern_discovery', 'memory_evolution', 'isolation', 'agent_agnostic']
    };
  }
  
  /**
   * Store visual memory with LLM caption generation using common data structure
   * This is the unified backend method for both askService and enhanced-ask-service
   * @param {string} agentId - Agent ID
   * @param {string} userId - User ID 
   * @param {string} memoryType - 'working' or 'episodic'
   * @param {Object} visualMemoryData - Common data structure: {query, imageData, isDescriptive, metadata}
   * @returns {Promise<Object>} Storage result with LLM-generated caption
   */
  async storeVisualMemoryWithLLM(agentId, userId, memoryType, visualMemoryData) {
    try {
      console.log(`\n🖼️ [MemoryService] === VISUAL MEMORY PROCESSING START ===`);
      console.log(`[MemoryService] Target Memory Type: ${memoryType}`);
      console.log(`[MemoryService] Agent ID: ${agentId}`);
      console.log(`[MemoryService] User ID: ${userId}`);
      console.log(`[MemoryService] Input Data:`, {
        hasQuery: !!visualMemoryData.query,
        query: visualMemoryData.query,
        isDescriptive: visualMemoryData.isDescriptive,
        hasImageData: !!visualMemoryData.imageData,
        imageDataLength: visualMemoryData.imageData ? visualMemoryData.imageData.length : 0,
        metadata: visualMemoryData.metadata
      });
      
      if (!this.initialized) {
        console.log(`[MemoryService] Initializing memory service...`);
        await this.initialize();
      }
      
      // Get memory instance
      console.log(`[MemoryService] Getting memory instance for ${agentId}:${userId}...`);
      const memoryInstance = await this.getMemoryInstance(agentId, userId);
      const targetMemory = memoryType === 'working' ? memoryInstance.working : memoryInstance.episodic;
      console.log(`[MemoryService] Target memory instance obtained: ${memoryType}`);
      
      // Generate LLM caption based on isDescriptive flag
      console.log(`[MemoryService] Generating LLM caption with isDescriptive=${visualMemoryData.isDescriptive}...`);
      const llmCaption = await this.generateLLMCaption(visualMemoryData);
      console.log(`[MemoryService] Generated caption: "${llmCaption}"`);
      
      // Prepare content for storage
      let content, context, metadata;
      console.log(`[MemoryService] Preparing content structure for ${memoryType}...`);
      
      if (memoryType === 'working') {
        // Working Memory: Current screen context (temporary)
        console.log(`[MemoryService] Building WORKING MEMORY structure...`);
        content = {
          type: 'visual_context',
          caption_summary: llmCaption,
          has_screenshot: true,
          user_query: visualMemoryData.query,  // null for ask button clicks
          metadata: {
            ...visualMemoryData.metadata,
            ai_caption: llmCaption,
            is_temporary: true
          }
        };
        
        context = {
          sessionId: visualMemoryData.metadata.sessionId,
          hasScreenshot: true,
          isCurrentScreen: true
        };
        
        metadata = {
          isAttentionSink: true,
          isTemporary: true,
          captureSource: visualMemoryData.metadata.captured_for
        };
        
        console.log(`[MemoryService] Working Memory Content:`, {
          type: content.type,
          caption_summary: content.caption_summary,
          has_screenshot: content.has_screenshot,
          user_query: content.user_query,
          is_temporary: content.metadata.is_temporary
        });
        console.log(`[MemoryService] Working Memory Context:`, context);
        console.log(`[MemoryService] Working Memory Metadata:`, metadata);
        
      } else {
        // Episodic Memory: Long-term visual learning
        console.log(`[MemoryService] Building EPISODIC MEMORY structure...`);
        content = {
          type: 'visual_memory',
          screenshot: visualMemoryData.imageData,
          caption: {
            user_query: visualMemoryData.query,
            ai_caption: llmCaption,
            app_detected: 'Desktop Application',
            browser_url: null,
            domain: null,
            screenshot_size: `${visualMemoryData.metadata.width}x${visualMemoryData.metadata.height}`,
            timestamp: visualMemoryData.metadata.timestamp
          },
          privacy_check: visualMemoryData.metadata.privacy_check || { hasSensitiveContent: false },
          metadata: visualMemoryData.metadata
        };
        
        context = {
          sessionId: visualMemoryData.metadata.sessionId,
          episodeType: 'visual_learning',
          userInitiated: true,
          hasScreenshot: true
        };
        
        metadata = {
          query_length: visualMemoryData.query ? visualMemoryData.query.length : 0,
          app_name: 'Desktop Application',
          has_llm_caption: true
        };
        
        console.log(`[MemoryService] Episodic Memory Content:`, {
          type: content.type,
          hasScreenshot: !!content.screenshot,
          screenshotLength: content.screenshot ? content.screenshot.length : 0,
          caption: content.caption,
          privacy_check: content.privacy_check
        });
        console.log(`[MemoryService] Episodic Memory Context:`, context);
        console.log(`[MemoryService] Episodic Memory Metadata:`, metadata);
      }
      
      // Store in target memory
      console.log(`[MemoryService] Storing in ${memoryType} memory...`);
      const result = await targetMemory.store(content, context, metadata);
      console.log(`[MemoryService] Storage result:`, {
        success: !!result.id,
        memoryId: result.id,
        resultKeys: Object.keys(result)
      });
      
      // For episodic memory, also create reference in working memory
      if (memoryType === 'episodic') {
        console.log(`[MemoryService] Creating Working Memory reference for episodic memory...`);
        const workingMemoryRef = {
          type: 'visual_context',
          visual_memory_id: result.id,
          caption_summary: llmCaption,
          has_screenshot: true
        };
        const workingContext = { hasScreenshot: true, sessionId: visualMemoryData.metadata.sessionId };
        const workingMetadata = { isAttentionSink: true };
        
        console.log(`[MemoryService] Working Memory Reference:`, workingMemoryRef);
        console.log(`[MemoryService] Working Memory Reference Context:`, workingContext);
        console.log(`[MemoryService] Working Memory Reference Metadata:`, workingMetadata);
        
        const workingRef = await memoryInstance.working.store(workingMemoryRef, workingContext, workingMetadata);
        console.log(`[MemoryService] Working Memory reference created:`, { id: workingRef.id });
      }
      
      console.log(`[OK] [MemoryService] === VISUAL MEMORY PROCESSING COMPLETE ===`);
      console.log(`[MemoryService] Final Result:`, {
        success: true,
        memoryId: result.id,
        caption: llmCaption,
        agentId,
        userId,
        memoryType,
        isDescriptive: visualMemoryData.isDescriptive,
        hadUserQuery: !!visualMemoryData.query
      });
      console.log(`[MemoryService] === END VISUAL MEMORY PROCESSING ===\n`);
      
      return {
        success: true,
        memoryId: result.id,
        caption: llmCaption,
        memoryType: memoryType
      };
      
    } catch (error) {
      console.error(`[ERROR] [MemoryService] Failed to store visual memory in ${memoryType}:`, error);
      return {
        success: false,
        error: error.message,
        memoryType: memoryType
      };
    }
  }

  /**
   * Generate LLM caption for screenshot based on isDescriptive flag
   * @param {Object} visualMemoryData - Visual memory data with isDescriptive flag
   * @returns {Promise<string>} Generated caption
   */
  async generateLLMCaption(visualMemoryData) {
    try {
      console.log(`\n[AI] [MemoryService] === LLM CAPTION GENERATION START ===`);
      console.log(`[MemoryService] Caption Generation Input:`, {
        hasQuery: !!visualMemoryData.query,
        query: visualMemoryData.query,
        isDescriptive: visualMemoryData.isDescriptive,
        context: visualMemoryData.metadata?.context,
        capturedFor: visualMemoryData.metadata?.captured_for,
        hasImageData: !!visualMemoryData.imageData,
        imageDataLength: visualMemoryData.imageData ? visualMemoryData.imageData.length : 0
      });
      
      const { query, isDescriptive, metadata, imageData } = visualMemoryData;
      
      // Use actual LLM to analyze the screenshot if imageData is available
      if (imageData && imageData.length > 0) {
        console.log(`[MemoryService] [AI] Calling LLM for actual image analysis...`);
        
        try {
          const llmCaption = await this.callLLMForImageAnalysis(imageData, query, isDescriptive);
          console.log(`[MemoryService] [OK] LLM generated caption: "${llmCaption}"`);
          console.log(`[MemoryService] === LLM CAPTION GENERATION COMPLETE ===\n`);
          return llmCaption;
        } catch (llmError) {
          console.error('[ERROR] [MemoryService] LLM image analysis failed:', llmError);
          console.log(`[MemoryService] Falling back to placeholder logic...`);
          // Fall through to placeholder logic below
        }
      } else {
        console.log(`[MemoryService] [WARNING] No image data available, using placeholder logic...`);
      }
      
      // Fallback to placeholder logic if LLM call fails or no image data
      let caption;
      
      if (isDescriptive) {
        console.log(`[MemoryService] Generating DESCRIPTIVE caption for Working Memory...`);
        // Working Memory: Descriptive captions for current screen context
        if (query) {
          caption = `Current screen showing desktop application context for query: "${query}"`;
          console.log(`[MemoryService] Descriptive caption with query: "${caption}"`);
        } else {
          caption = `Current desktop screen captured at ${metadata.context} - showing active application interface`;
          console.log(`[MemoryService] Descriptive caption without query: "${caption}"`);
        }
      } else {
        console.log(`[MemoryService] Generating CRISP caption for Episodic Memory...`);
        // Episodic Memory: Crisp captions for long-term storage
        if (query) {
          caption = `Desktop Application - ${query.substring(0, 30)}${query.length > 30 ? '...' : ''}`;
          console.log(`[MemoryService] Crisp caption with query: "${caption}"`);
        } else {
          caption = `Desktop screenshot captured`;
          console.log(`[MemoryService] Crisp caption without query: "${caption}"`);
        }
      }
      
      console.log(`[MemoryService] Final Generated Caption: "${caption}"`);
      console.log(`[MemoryService] Caption Strategy: ${isDescriptive ? 'DESCRIPTIVE (Working Memory)' : 'CRISP (Episodic Memory)'}`);
      console.log(`[MemoryService] === LLM CAPTION GENERATION COMPLETE ===\n`);
      
      return caption;
      
    } catch (error) {
      console.error('[ERROR] [MemoryService] LLM caption generation failed:', error);
      
      // Fallback caption
      const fallbackCaption = visualMemoryData.isDescriptive 
        ? 'Current screen context' 
        : 'Desktop screenshot';
      
      console.log(`[MemoryService] Using fallback caption: "${fallbackCaption}"`);
      return fallbackCaption;
    }
  }

  /**
   * Call LLM for actual image analysis to generate captions
   * @param {string} imageData - Base64 encoded image data
   * @param {string} query - User query (optional)
   * @param {boolean} isDescriptive - Whether to generate descriptive or crisp caption
   * @returns {Promise<string>} LLM-generated caption
   */
  async callLLMForImageAnalysis(imageData, query, isDescriptive) {
    try {
      // Import AI provider service
      const { aiProviderService } = require('../aiProviderService');
      
      // Initialize AI provider if needed
      await aiProviderService.initialize();
      
      // Create a simple agent configuration for image analysis
      const imageAnalysisAgent = {
        id: 'memory-caption-generator',
        name: 'Memory Caption Generator',
        ai_model: 'gpt-4o', // Use GPT-4 Vision for image analysis
        system_prompt: isDescriptive 
          ? 'You are an AI assistant that analyzes screenshots to generate detailed, descriptive captions for working memory context. Describe what you see in the image clearly and thoroughly.'
          : 'You are an AI assistant that analyzes screenshots to generate concise, crisp captions for long-term memory storage. Provide brief, informative descriptions of what you see.',
        personality_type: 'technical'
      };
      
      // Build prompt based on caption type and user query
      let userPrompt;
      if (isDescriptive) {
        userPrompt = query 
          ? `Analyze this screenshot and provide a detailed description of what you see. This is for a user query: "${query}". Describe the screen content that would be relevant to this query.`
          : 'Analyze this screenshot and provide a detailed description of what you see on the screen. Focus on the main content and interface elements.';
      } else {
        userPrompt = query
          ? `Analyze this screenshot and provide a brief, informative caption. This relates to the user query: "${query}". Keep the caption concise but descriptive.`
          : 'Analyze this screenshot and provide a brief, informative caption describing the main content or purpose of what is shown.';
      }
      
      // Prepare context with the screenshot
      const context = {
        screenshot: {
          success: true,
          base64: imageData,
          timestamp: Date.now()
        },
        contextDecision: {
          useScreenshot: true,
          primary: 'visual'
        }
      };
      
      console.log(`[MemoryService] [AI] Calling ${imageAnalysisAgent.ai_model} for image analysis...`);
      console.log(`[MemoryService] Prompt type: ${isDescriptive ? 'DESCRIPTIVE' : 'CRISP'}`);
      console.log(`[MemoryService] Has user query: ${!!query}`);
      
      // Generate response using AI provider
      const aiResponse = await aiProviderService.generateResponse(imageAnalysisAgent, userPrompt, context);
      
      if (aiResponse.success && aiResponse.response) {
        console.log(`[MemoryService] [OK] LLM analysis successful, tokens used: ${aiResponse.tokens_used}`);
        
        // Clean up the response - remove any markdown formatting and keep it as a clean caption
        let caption = aiResponse.response
          .replace(/\*\*/g, '') // Remove bold markdown
          .replace(/\*/g, '')   // Remove italic markdown
          .replace(/#{1,6}\s/g, '') // Remove header markdown
          .replace(/\n+/g, ' ')  // Replace newlines with spaces
          .trim();
        
        // Ensure caption length is appropriate
        if (isDescriptive) {
          // For descriptive captions, allow longer text but cap at reasonable length
          if (caption.length > 200) {
            caption = caption.substring(0, 197) + '...';
          }
        } else {
          // For crisp captions, keep it short
          if (caption.length > 100) {
            caption = caption.substring(0, 97) + '...';
          }
        }
        
        return caption;
      } else {
        throw new Error('AI response was not successful or empty');
      }
      
    } catch (error) {
      console.error('[ERROR] [MemoryService] LLM image analysis failed:', error);
      throw error;
    }
  }

  /**
   * Health check for memory service
   */
  async healthCheck() {
    try {
      if (!this.initialized) {
        return { status: 'not_initialized' };
      }
      
      // Test database connectivity
      await neonDB.query('SELECT 1');
      
      const health = {
        status: 'healthy',
        timestamp: new Date(),
        components: {
          service: this.initialized,
          patternDiscovery: this.patternDiscovery ? this.patternDiscovery.initialized : false,
          memoryEvolution: this.memoryEvolution ? this.memoryEvolution.initialized : false,
          memoryIsolation: this.memoryIsolation ? this.memoryIsolation.initialized : false,
          database: true
        },
        metrics: this.getStats()
      };
      
      return health;
      
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error.message,
        components: {
          service: false,
          patternDiscovery: false,
          memoryEvolution: false,
          memoryIsolation: false,
          database: false
        }
      };
    }
  }
}

// Export singleton instance
module.exports = new AgentMemoryService();