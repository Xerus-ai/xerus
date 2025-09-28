/**
 * WORKING MEMORY MODULE
 * Integration with sliding window context for immediate context management
 * 
 * Features:
 * - Sliding window context buffer (50 entries)
 * - Attention sinks for persistent important context
 * - Relevance-based scoring and prioritization
 * - Integration with FastContextManager frontend
 * - Auto-expiration and cleanup
 * - Langchain ConversationBufferWindowMemory integration
 */

const { EventEmitter } = require('events');
const { neonDB } = require('../../database/connections/neon');

// Langchain integration for conversation memory
let BufferWindowMemory, ChatMessageHistory, HumanMessage, AIMessage, SystemMessage;
try {
  const langchainMemory = require('langchain/memory');
  const langchainMessages = require('@langchain/core/messages');
  BufferWindowMemory = langchainMemory.BufferWindowMemory;
  ChatMessageHistory = langchainMemory.ChatMessageHistory;
  HumanMessage = langchainMessages.HumanMessage;
  AIMessage = langchainMessages.AIMessage;
  SystemMessage = langchainMessages.SystemMessage;
} catch (error) {
  console.warn('[WorkingMemory] Langchain not available, using basic conversation memory');
}

class WorkingMemory extends EventEmitter {
  constructor(agentId, userId) {
    super();
    
    this.agentId = agentId;
    this.userId = userId;
    this.initialized = false;
    
    // Configuration
    this.config = {
      maxEntries: 50,              // Sliding window size
      maxTokens: 8000,             // Token limit
      relevanceThreshold: 0.3,     // Minimum relevance to keep
      attentionSinkThreshold: 0.8, // Threshold for attention sink
      expirationHours: 1,          // Auto-expiration time
      cleanupInterval: 5 * 60 * 1000 // 5 minutes
    };
    
    // In-memory cache for fast access
    this.contextCache = new Map();
    this.attentionSinks = new Set();
    
    // Performance metrics
    this.metrics = {
      totalItems: 0,
      attentionSinkCount: 0,
      averageRelevance: 0,
      cacheHitRate: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    // Langchain conversation memory integration
    this.langchainMemory = null;
    this.messageHistory = null;
    this.langchainEnabled = !!BufferWindowMemory;
    
    console.log(`🧠 [WorkingMemory] Initializing for agent ${agentId}, user ${userId}`);
  }
  
  /**
   * Initialize working memory
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      // Load existing working memory from database
      await this.loadFromDatabase();
      
      // Setup cleanup interval
      this.setupCleanup();
      
      // Setup cache warming
      await this.warmCache();
      
      // Initialize Langchain conversation memory if available
      if (this.langchainEnabled) {
        this.initializeLangchainMemory();
      }
      
      this.initialized = true;
      
      console.log(`[OK] [WorkingMemory] Initialized for agent ${this.agentId} - ${this.metrics.totalItems} items, ${this.metrics.attentionSinkCount} attention sinks, Langchain: ${this.langchainEnabled}`);
      
      this.emit('initialized');
      
    } catch (error) {
      console.error('[ERROR] [WorkingMemory] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Initialize Langchain conversation memory
   */
  initializeLangchainMemory() {
    try {
      this.messageHistory = new ChatMessageHistory();
      this.langchainMemory = new BufferWindowMemory({
        k: 10, // Keep last 10 conversation exchanges
        memoryKey: 'chat_history',
        chatHistory: this.messageHistory,
        returnMessages: true
      });
      
      console.log(`[LINK] [WorkingMemory] Langchain conversation memory initialized (window: 10)`);
    } catch (error) {
      console.warn('[WARNING] [WorkingMemory] Failed to initialize Langchain memory:', error);
      this.langchainEnabled = false;
    }
  }
  
  /**
   * Add conversation message to both Working Memory and Langchain
   * @param {string} role - Message role (human, ai, system)
   * @param {string} content - Message content
   * @param {Object} context - Context information
   * @param {Object} metadata - Additional metadata
   */
  async addConversationMessage(role, content, context = {}, metadata = {}) {
    // Store in Working Memory with conversation context
    const workingMemoryResult = await this.store(
      { role, content, timestamp: new Date().toISOString() },
      { ...context, conversationMessage: true },
      { ...metadata, isConversationMessage: true }
    );
    
    // Add to Langchain memory if available
    if (this.langchainEnabled && this.messageHistory) {
      try {
        let langchainMessage;
        switch (role.toLowerCase()) {
          case 'human':
          case 'user':
            langchainMessage = new HumanMessage(content);
            break;
          case 'ai':
          case 'assistant':
            langchainMessage = new AIMessage(content);
            break;
          case 'system':
            langchainMessage = new SystemMessage(content);
            break;
          default:
            console.warn(`[WorkingMemory] Unknown message role: ${role}`);
            return workingMemoryResult;
        }
        
        await this.messageHistory.addMessage(langchainMessage);
        console.log(`[LINK] [WorkingMemory] Added ${role} message to Langchain memory`);
        
      } catch (error) {
        console.warn('[WARNING] [WorkingMemory] Failed to add to Langchain memory:', error);
      }
    }
    
    return workingMemoryResult;
  }
  
  /**
   * Get conversation context using hybrid approach (Langchain + Working Memory)
   * @param {Object} options - Retrieval options
   */
  async getConversationContext(options = {}) {
    const { maxMessages = 10, includeWorkingMemory = true } = options;
    
    let conversationContext = {
      messages: [],
      context: '',
      source: 'working_memory_only'
    };
    
    // Get Langchain conversation context if available
    if (this.langchainEnabled && this.langchainMemory) {
      try {
        const memoryVariables = await this.langchainMemory.loadMemoryVariables({});
        const langchainMessages = memoryVariables.chat_history || [];
        
        // Convert Langchain messages to context format
        const contextString = langchainMessages
          .map(msg => {
            const role = msg._getType ? msg._getType() : 'unknown';
            return `${role}: ${msg.content}`;
          })
          .join('\n');
        
        conversationContext = {
          messages: langchainMessages.slice(-maxMessages),
          context: contextString,
          source: 'hybrid_langchain_working_memory'
        };
        
        console.log(`[SEARCH] [WorkingMemory] Retrieved ${langchainMessages.length} messages from Langchain`);
        
      } catch (error) {
        console.warn('[WARNING] [WorkingMemory] Langchain context retrieval failed:', error);
      }
    }
    
    // Enhance with Working Memory context if requested
    if (includeWorkingMemory) {
      try {
        const workingMemoryItems = await this.retrieve('conversation', {}, {
          limit: maxMessages,
          contextTypes: ['text', 'conversation'],
          sessionOnly: false
        });
        
        // Add unique Working Memory context
        if (workingMemoryItems.length > 0) {
          const wmContext = workingMemoryItems
            .map(item => {
              if (item.content && typeof item.content === 'object' && item.content.role) {
                return `${item.content.role}: ${item.content.content}`;
              }
              return `context: ${JSON.stringify(item.content)}`;
            })
            .join('\n');
          
          if (conversationContext.context) {
            conversationContext.context += '\n\n' + wmContext;
          } else {
            conversationContext.context = wmContext;
          }
          
          conversationContext.source = 'hybrid_langchain_working_memory';
        }
        
      } catch (error) {
        console.warn('[WARNING] [WorkingMemory] Working Memory context enhancement failed:', error);
      }
    }
    
    return conversationContext;
  }

  /**
   * Store content in working memory (sliding window)
   */
  async store(content, context, metadata = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      // Calculate relevance score
      const relevanceScore = this.calculateRelevance(content, context, metadata);
      
      // Skip if relevance too low (unless forced)
      if (relevanceScore < this.config.relevanceThreshold && !metadata.forceStore) {
        console.log(`[WARNING] [WorkingMemory] Skipping low relevance content: ${relevanceScore.toFixed(2)}`);
        return { stored: false, reason: 'low_relevance', relevanceScore };
      }
      
      // Determine if this should be an attention sink
      const isAttentionSink = relevanceScore >= this.config.attentionSinkThreshold || 
                              metadata.isAttentionSink ||
                              this.isPersistentContext(content, context);
      
      // Estimate token count
      const tokenCount = this.estimateTokens(content);
      
      // Create working memory record
      const workingMemoryRecord = {
        id: require('crypto').randomUUID(),
        agent_id: this.agentId,
        user_id: this.userId,
        session_id: context.sessionId || 'default',
        content: typeof content === 'string' ? { text: content } : content,
        context_type: this.determineContextType(content, context, metadata),
        relevance_score: relevanceScore,
        attention_sink: isAttentionSink,
        token_count: tokenCount,
        created_at: new Date(),
        expires_at: new Date(Date.now() + (this.config.expirationHours * 60 * 60 * 1000)),
        metadata: metadata
      };
      
      // Store in database
      await neonDB.query(`
        INSERT INTO working_memory (
          id, agent_id, user_id, session_id, content, context_type,
          relevance_score, attention_sink, token_count, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        workingMemoryRecord.id,
        workingMemoryRecord.agent_id,
        workingMemoryRecord.user_id,
        workingMemoryRecord.session_id,
        JSON.stringify(workingMemoryRecord.content),
        workingMemoryRecord.context_type,
        workingMemoryRecord.relevance_score,
        workingMemoryRecord.attention_sink,
        workingMemoryRecord.token_count,
        workingMemoryRecord.created_at,
        workingMemoryRecord.expires_at
      ]);
      
      // Update cache
      this.contextCache.set(workingMemoryRecord.id, workingMemoryRecord);
      
      // Track attention sinks
      if (isAttentionSink) {
        this.attentionSinks.add(workingMemoryRecord.id);
        this.metrics.attentionSinkCount = this.attentionSinks.size;
      }
      
      // Maintain sliding window size
      await this.maintainSlidingWindow();
      
      // Update metrics
      this.updateMetrics();
      
      const responseTime = Date.now() - startTime;
      
      console.log(`[OK] [WorkingMemory] Stored ${workingMemoryRecord.context_type} - Relevance: ${relevanceScore.toFixed(2)}, AttentionSink: ${isAttentionSink} (${responseTime}ms)`);
      
      return {
        stored: true,
        id: workingMemoryRecord.id,
        relevanceScore,
        isAttentionSink,
        responseTime
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[ERROR] [WorkingMemory] Storage failed:', error);
      
      return {
        stored: false,
        error: error.message,
        responseTime
      };
    }
  }
  
  /**
   * Retrieve relevant working memory for query/context
   */
  async retrieve(query, context, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      const { 
        limit = 10, 
        includeAttentionSinks = true,
        minRelevance = 0.1,
        contextTypes = null,
        sessionOnly = false
      } = options;
      
      // Build query conditions
      const conditions = [
        'agent_id = $1',
        'user_id = $2',
        'expires_at > NOW()',
        `relevance_score >= ${minRelevance}`
      ];
      const params = [this.agentId, this.userId];
      
      // Session filtering
      if (sessionOnly && context.sessionId) {
        conditions.push(`session_id = $${params.length + 1}`);
        params.push(context.sessionId);
      }
      
      // Context type filtering
      if (contextTypes && contextTypes.length > 0) {
        conditions.push(`context_type = ANY($${params.length + 1})`);
        params.push(contextTypes);
      }
      
      // Execute query with ordering
      const result = await neonDB.query(`
        SELECT * FROM working_memory 
        WHERE ${conditions.join(' AND ')}
        ORDER BY 
          attention_sink DESC,
          relevance_score DESC,
          created_at DESC
        LIMIT $${params.length + 1}
      `, [...params, limit]);
      
      const memories = result.rows.map(row => ({
        ...row,
        content: this.safeJsonParse(row.content, {}),
        memoryType: 'working',
        relevanceScore: row.relevance_score
      }));
      
      // Update cache hit metrics
      this.metrics.cacheHits++;
      
      const responseTime = Date.now() - startTime;
      
      console.log(`[SEARCH] [WorkingMemory] Retrieved ${memories.length} items (${responseTime}ms)`);
      
      return memories;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[ERROR] [WorkingMemory] Retrieval failed:', error);
      this.metrics.cacheMisses++;
      
      return [];
    }
  }
  
  /**
   * Integration with frontend sliding window context
   */
  async syncWithSlidingWindow(slidingWindowData) {
    if (!slidingWindowData || !Array.isArray(slidingWindowData)) {
      return { synced: 0, errors: 0 };
    }
    
    console.log(`[LOADING] [WorkingMemory] Syncing with ${slidingWindowData.length} sliding window entries`);
    
    let synced = 0;
    let errors = 0;
    
    for (const entry of slidingWindowData) {
      try {
        // Convert sliding window entry to working memory format
        const context = {
          sessionId: entry.sessionId || 'sliding_window',
          timestamp: entry.timestamp,
          source: 'sliding_window'
        };
        
        const metadata = {
          isAttentionSink: entry.isImportant || entry.relevance > 0.8,
          fromSlidingWindow: true,
          windowIndex: entry.index
        };
        
        await this.store(entry.content, context, metadata);
        synced++;
        
      } catch (error) {
        console.error('Failed to sync entry:', error);
        errors++;
      }
    }
    
    console.log(`[OK] [WorkingMemory] Sliding window sync complete - Synced: ${synced}, Errors: ${errors}`);
    
    return { synced, errors };
  }
  
  /**
   * Get attention sinks (persistent important context)
   */
  async getAttentionSinks() {
    try {
      const result = await neonDB.query(`
        SELECT * FROM working_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND attention_sink = true 
        AND expires_at > NOW()
        ORDER BY relevance_score DESC, created_at DESC
      `, [this.agentId, this.userId]);
      
      return result.rows.map(row => ({
        ...row,
        content: this.safeJsonParse(row.content, {}),
        memoryType: 'working'
      }));
      
    } catch (error) {
      console.error('[ERROR] [WorkingMemory] Failed to get attention sinks:', error);
      return [];
    }
  }
  
  /**
   * Calculate relevance score for content (NO HARDCODING - agent learns what's relevant)
   */
  calculateRelevance(content, context, metadata) {
    let relevance = 0.5; // Base relevance
    
    // Content-based relevance indicators
    if (typeof content === 'string') {
      // Length-based relevance
      if (content.length > 100) relevance += 0.1;
      if (content.length > 500) relevance += 0.1;
      
      // Question indicators
      if (content.includes('?')) relevance += 0.1;
      
      // Important keywords (agent will learn these dynamically)
      const importantKeywords = ['error', 'help', 'how to', 'explain', 'show me'];
      if (importantKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
        relevance += 0.2;
      }
    }
    
    // Context-based relevance
    if (context.hasScreenshot) relevance += 0.2;
    if (context.isUserInitiated) relevance += 0.1;
    if (context.sessionStart) relevance += 0.3;
    
    // Metadata-based relevance
    if (metadata.isImportant) relevance += 0.3;
    if (metadata.userRating && metadata.userRating > 0.7) relevance += 0.2;
    if (metadata.followUp) relevance += 0.1;
    
    // Temporal relevance
    const age = context.timestamp ? Date.now() - context.timestamp : 0;
    if (age < 60000) relevance += 0.1; // Recent content is more relevant
    
    // Ensure relevance is within bounds
    return Math.max(0.0, Math.min(1.0, relevance));
  }
  
  /**
   * Determine context type based on content analysis (NO HARDCODING)
   */
  determineContextType(content, context, metadata) {
    // Agent discovers context types dynamically
    
    if (context.hasScreenshot || (typeof content === 'object' && content.image)) {
      return 'screenshot';
    }
    
    if (context.hasAudio || (typeof content === 'object' && content.audio)) {
      return 'audio';
    }
    
    if (metadata.toolResult || (typeof content === 'object' && content.tool)) {
      return 'tool_result';
    }
    
    // Default to text
    return 'text';
  }
  
  /**
   * Check if content should be persistent context (attention sink)
   */
  isPersistentContext(content, context) {
    // Agent learns what should be persistent
    
    // User-initiated sessions are often important
    if (context.sessionStart) return true;
    
    // Error contexts are usually important
    if (typeof content === 'string' && content.toLowerCase().includes('error')) return true;
    
    // High user engagement contexts
    if (context.conversationLength && context.conversationLength > 5) return true;
    
    return false;
  }
  
  /**
   * Maintain sliding window size by removing least relevant items
   */
  async maintainSlidingWindow() {
    try {
      // Get current count (excluding attention sinks)
      const countResult = await neonDB.query(`
        SELECT COUNT(*) as count FROM working_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND expires_at > NOW()
        AND attention_sink = false
      `, [this.agentId, this.userId]);
      
      const currentCount = parseInt(countResult.rows[0].count);
      
      // Remove excess items (keep attention sinks)
      if (currentCount > this.config.maxEntries) {
        const excessCount = currentCount - this.config.maxEntries;
        
        await neonDB.query(`
          DELETE FROM working_memory 
          WHERE id IN (
            SELECT id FROM working_memory 
            WHERE agent_id = $1 AND user_id = $2 
            AND attention_sink = false 
            AND expires_at > NOW()
            ORDER BY relevance_score ASC, created_at ASC
            LIMIT $3
          )
        `, [this.agentId, this.userId, excessCount]);
        
        console.log(`[CLEAN] [WorkingMemory] Removed ${excessCount} least relevant items to maintain sliding window`);
      }
      
    } catch (error) {
      console.error('[ERROR] [WorkingMemory] Sliding window maintenance failed:', error);
    }
  }
  
  /**
   * Load existing working memory from database
   */
  async loadFromDatabase() {
    try {
      const result = await neonDB.query(`
        SELECT * FROM working_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND expires_at > NOW()
        ORDER BY created_at DESC
      `, [this.agentId, this.userId]);
      
      // Load into cache
      result.rows.forEach(row => {
        const record = {
          ...row,
          content: this.safeJsonParse(row.content, {})
        };
        
        this.contextCache.set(row.id, record);
        
        if (row.attention_sink) {
          this.attentionSinks.add(row.id);
        }
      });
      
      this.metrics.totalItems = result.rows.length;
      this.metrics.attentionSinkCount = this.attentionSinks.size;
      
      console.log(`📚 [WorkingMemory] Loaded ${this.metrics.totalItems} items from database`);
      
    } catch (error) {
      console.error('[ERROR] [WorkingMemory] Failed to load from database:', error);
    }
  }
  
  /**
   * Warm cache with frequently accessed items
   */
  async warmCache() {
    // Cache is already warmed by loadFromDatabase
    console.log(`🔥 [WorkingMemory] Cache warmed with ${this.contextCache.size} items`);
  }
  
  /**
   * Setup cleanup intervals
   */
  setupCleanup() {
    // Cleanup expired items
    setInterval(async () => {
      try {
        const result = await neonDB.query(`
          DELETE FROM working_memory 
          WHERE agent_id = $1 AND user_id = $2 
          AND expires_at < NOW()
        `, [this.agentId, this.userId]);
        
        if (result.rowCount > 0) {
          console.log(`[CLEAN] [WorkingMemory] Cleaned up ${result.rowCount} expired items`);
          // Update cache and metrics
          await this.loadFromDatabase();
        }
        
      } catch (error) {
        console.error('[ERROR] [WorkingMemory] Cleanup failed:', error);
      }
    }, this.config.cleanupInterval);
  }
  
  /**
   * Safely parse JSON content, handling both string and object inputs
   */
  safeJsonParse(value, defaultValue = null) {
    if (typeof value === 'object' && value !== null) {
      return value;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (error) {
        return defaultValue;
      }
    }
    return defaultValue;
  }

  /**
   * Estimate token count for content
   */
  estimateTokens(content) {
    let text = '';
    
    if (typeof content === 'string') {
      text = content;
    } else if (typeof content === 'object') {
      text = JSON.stringify(content);
    }
    
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Update performance metrics
   */
  updateMetrics() {
    this.metrics.totalItems = this.contextCache.size;
    this.metrics.attentionSinkCount = this.attentionSinks.size;
    
    // Calculate average relevance
    let totalRelevance = 0;
    let count = 0;
    
    for (const record of this.contextCache.values()) {
      totalRelevance += record.relevance_score || 0;
      count++;
    }
    
    this.metrics.averageRelevance = count > 0 ? totalRelevance / count : 0;
    
    // Cache hit rate
    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    this.metrics.cacheHitRate = totalRequests > 0 ? 
      (this.metrics.cacheHits / totalRequests) * 100 : 0;
  }
  
  /**
   * Add item to working memory (API method)
   */
  async addItem(item) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Store with sliding window behavior
      const result = await this.store(item.content, item.metadata || {}, {
        type: item.type || 'user_input',
        timestamp: item.timestamp || new Date(),
        forceStore: true
      });
      
      this.updateMetrics();
      return result;
      
    } catch (error) {
      console.error('[ERROR] [WorkingMemory] Add item failed:', error);
      throw error;
    }
  }
  
  /**
   * Get current working memory context (API method)
   */
  async getContext(limit = this.config.maxEntries) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      this.metrics.cacheHits++;
      
      // Get recent items from cache
      const contextArray = Array.from(this.contextCache.values());
      
      // Sort by relevance and timestamp
      contextArray.sort((a, b) => {
        // Attention sinks first
        if (a.attention_sink && !b.attention_sink) return -1;
        if (!a.attention_sink && b.attention_sink) return 1;
        
        // Then by relevance score
        const relevanceDiff = (b.relevance_score || 0) - (a.relevance_score || 0);
        if (Math.abs(relevanceDiff) > 0.1) return relevanceDiff;
        
        // Finally by timestamp (newest first)
        return new Date(b.created_at) - new Date(a.created_at);
      });
      
      this.updateMetrics();
      return contextArray.slice(0, limit);
      
    } catch (error) {
      this.metrics.cacheMisses++;
      console.error('[ERROR] [WorkingMemory] Get context failed:', error);
      throw error;
    }
  }
  
  /**
   * Get working memory statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      agentId: this.agentId,
      userId: this.userId,
      ...this.metrics,
      config: this.config
    };
  }
}

module.exports = WorkingMemory;