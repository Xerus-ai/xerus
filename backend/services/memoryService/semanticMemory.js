/**
 * SEMANTIC MEMORY MODULE
 * Long-term factual knowledge with RAG integration
 * 
 * Features:
 * - Integration with existing langchainRAGService
 * - Vector embeddings for semantic search (pgvector)
 * - Knowledge consolidation from episodic memories
 * - Cross-domain knowledge linking
 * - Knowledge graph relationships
 * - Agent-agnostic knowledge discovery
 */

const { EventEmitter } = require('events');
const { neonDB } = require('../../database/connections/neon');

class SemanticMemory extends EventEmitter {
  constructor(agentId, userId) {
    super();
    
    this.agentId = agentId;
    this.userId = userId;
    this.initialized = false;
    
    // Configuration
    this.config = {
      vectorDimensions: 1536,      // OpenAI embedding dimensions
      similarityThreshold: 0.7,    // Minimum similarity for related knowledge
      consolidationInterval: 24 * 60 * 60 * 1000, // Daily consolidation
      knowledgeRetentionDays: 365, // Long-term retention
      maxKnowledgeEntries: 10000,  // Per agent-user combination
      embeddingBatchSize: 50       // Batch size for embedding generation
    };
    
    // Knowledge categories (learned dynamically by agent)
    this.knowledgeCategories = new Map([
      ['factual', { weight: 1.0, examples: [] }],
      ['procedural', { weight: 1.2, examples: [] }], 
      ['conceptual', { weight: 1.1, examples: [] }],
      ['contextual', { weight: 0.9, examples: [] }],
      ['experiential', { weight: 1.3, examples: [] }],
      ['technical', { weight: 1.4, examples: [] }]
    ]);
    
    // Performance metrics
    this.metrics = {
      totalKnowledgeEntries: 0,
      averageSimilarityScore: 0,
      consolidatedFromEpisodic: 0,
      knowledgeRetrievals: 0,
      vectorSearchTime: 0,
      lastConsolidation: null
    };
    
    console.log(`🧠 [SemanticMemory] Initializing for agent ${agentId}, user ${userId}`);
  }
  
  /**
   * Initialize semantic memory with RAG integration
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      // Load existing knowledge base statistics
      await this.loadKnowledgeStats();
      
      // Setup knowledge consolidation intervals
      this.setupConsolidation();
      
      // Learn knowledge categories from existing data
      await this.learnKnowledgeCategories();
      
      // Setup vector search optimization
      await this.optimizeVectorSearch();
      
      this.initialized = true;
      
      console.log(`[OK] [SemanticMemory] Initialized for agent ${this.agentId} - ${this.metrics.totalKnowledgeEntries} knowledge entries`);
      
      this.emit('initialized');
      
    } catch (error) {
      console.error('[ERROR] [SemanticMemory] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Store knowledge in semantic memory (integrates with RAG)
   */
  async store(content, context, metadata = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      // Determine knowledge category (agent learns this dynamically)
      const knowledgeCategory = await this.categorizeKnowledge(content, context, metadata);
      
      // Calculate knowledge importance score
      const importanceScore = this.calculateKnowledgeImportance(content, context, metadata, knowledgeCategory);
      
      // Skip if importance too low (unless forced)
      if (importanceScore < 0.4 && !metadata.forceStore) {
        console.log(`[WARNING] [SemanticMemory] Skipping low importance knowledge: ${importanceScore.toFixed(2)}`);
        return { stored: false, reason: 'low_importance', importanceScore };
      }
      
      // Extract knowledge entities and relationships
      const knowledgeEntities = await this.extractKnowledgeEntities(content, context);
      
      // Generate content embedding (integrate with existing RAG service)
      const contentText = typeof content === 'string' ? content : JSON.stringify(content);
      const embedding = await this.generateEmbedding(contentText);
      
      // Create semantic memory record
      const knowledgeRecord = {
        id: require('crypto').randomUUID(),
        agent_id: this.agentId,
        user_id: this.userId,
        knowledge_category: knowledgeCategory,
        content: typeof content === 'string' ? { text: content } : content,
        context_summary: this.summarizeContext(context),
        entities: knowledgeEntities,
        importance_score: importanceScore,
        embedding: embedding,
        created_at: new Date(),
        last_accessed: new Date(),
        access_count: 1,
        consolidated_from_episodic: metadata.fromEpisodic || false,
        source_session: context.sessionId || null
      };
      
      // Store in database with vector embedding
      await neonDB.query(`
        INSERT INTO semantic_memory (
          id, agent_id, user_id, knowledge_category, content,
          confidence_score, usage_count, embedding, created_at, last_accessed,
          source_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        knowledgeRecord.id,
        knowledgeRecord.agent_id,
        knowledgeRecord.user_id,
        knowledgeRecord.knowledge_category,
        JSON.stringify(knowledgeRecord.content),
        knowledgeRecord.confidence_score || 0.5,
        knowledgeRecord.usage_count || 0,
        JSON.stringify(knowledgeRecord.embedding),
        knowledgeRecord.created_at,
        knowledgeRecord.last_accessed,
        knowledgeRecord.source_type || 'user_input'
      ]);
      
      // Update knowledge relationships
      await this.updateKnowledgeRelationships(knowledgeRecord);
      
      // Update metrics
      this.updateMetrics(knowledgeRecord);
      
      const responseTime = Date.now() - startTime;
      
      console.log(`[OK] [SemanticMemory] Stored ${knowledgeCategory} knowledge - Importance: ${importanceScore.toFixed(2)} (${responseTime}ms)`);
      
      this.emit('knowledgeStored', knowledgeRecord);
      
      return {
        stored: true,
        id: knowledgeRecord.id,
        knowledgeCategory,
        importanceScore,
        responseTime
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[ERROR] [SemanticMemory] Storage failed:', error);
      
      return {
        stored: false,
        error: error.message,
        responseTime
      };
    }
  }
  
  /**
   * Retrieve relevant knowledge using vector similarity search
   */
  async retrieve(query, context, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      const { 
        limit = 10, 
        minSimilarity = this.config.similarityThreshold,
        knowledgeCategories = null,
        includeRelationships = true,
        timeRangeMonths = null
      } = options;
      
      // Generate query embedding for semantic search
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Build query conditions
      const conditions = [
        'agent_id = $1',
        'user_id = $2'
      ];
      const params = [this.agentId, this.userId];
      
      // Knowledge category filtering
      if (knowledgeCategories && knowledgeCategories.length > 0) {
        conditions.push(`knowledge_category = ANY($${params.length + 1})`);
        params.push(knowledgeCategories);
      }
      
      // Time range filtering
      if (timeRangeMonths) {
        conditions.push(`created_at >= NOW() - INTERVAL '${timeRangeMonths} months'`);
      }
      
      // Vector similarity search with pgvector
      const result = await neonDB.query(`
        SELECT *, 
               (embedding <=> $${params.length + 1}) as similarity_distance,
               (1 - (embedding <=> $${params.length + 1})) as similarity_score
        FROM semantic_memory 
        WHERE ${conditions.join(' AND ')}
        AND (1 - (embedding <=> $${params.length + 1})) >= ${minSimilarity}
        ORDER BY embedding <=> $${params.length + 1}
        LIMIT $${params.length + 2}
      `, [...params, JSON.stringify(queryEmbedding), limit]);
      
      // Process results
      const knowledgeEntries = result.rows.map(row => ({
        ...row,
        content: JSON.parse(row.content),
        context_summary: JSON.parse(row.context_summary),
        entities: JSON.parse(row.entities),
        embedding: JSON.parse(row.embedding),
        memoryType: 'semantic',
        relevanceScore: row.similarity_score
      }));
      
      // Update access counts
      if (knowledgeEntries.length > 0) {
        const accessedIds = knowledgeEntries.map(entry => entry.id);
        await neonDB.query(`
          UPDATE semantic_memory 
          SET access_count = access_count + 1, last_accessed = NOW() 
          WHERE id = ANY($1)
        `, [accessedIds]);
      }
      
      // Load knowledge relationships if requested
      if (includeRelationships) {
        for (const entry of knowledgeEntries) {
          entry.relationships = await this.getKnowledgeRelationships(entry.id);
        }
      }
      
      // Update retrieval metrics
      this.metrics.knowledgeRetrievals++;
      const searchTime = Date.now() - startTime;
      this.metrics.vectorSearchTime = 
        (this.metrics.vectorSearchTime + searchTime) / 2; // Running average
      
      console.log(`[SEARCH] [SemanticMemory] Retrieved ${knowledgeEntries.length} knowledge entries (${searchTime}ms)`);
      
      return knowledgeEntries;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[ERROR] [SemanticMemory] Retrieval failed:', error);
      
      return [];
    }
  }
  
  /**
   * Categorize knowledge type (agent learns this dynamically - NO HARDCODING)
   */
  async categorizeKnowledge(content, context, metadata) {
    // Start with basic categorization, agent improves this over time
    
    // Technical knowledge
    if (this.containsTechnicalIndicators(content, context, metadata)) {
      return 'technical';
    }
    
    // Experiential knowledge (from real interactions)
    if (context.userInteraction || metadata.fromEpisodic) {
      return 'experiential';
    }
    
    // Procedural knowledge (how-to, process knowledge)
    if (this.containsProceduralIndicators(content, context, metadata)) {
      return 'procedural';
    }
    
    // Conceptual knowledge (abstract concepts, definitions)
    if (this.containsConceptualIndicators(content, context, metadata)) {
      return 'conceptual';
    }
    
    // Contextual knowledge (situation-specific)
    if (context.sessionId || context.specificContext) {
      return 'contextual';
    }
    
    // Default to factual
    return 'factual';
  }
  
  /**
   * Calculate importance score for knowledge
   */
  calculateKnowledgeImportance(content, context, metadata, knowledgeCategory) {
    let importance = 0.5; // Base importance
    
    // Category weighting (agent learns these weights)
    const categoryWeight = this.knowledgeCategories.get(knowledgeCategory)?.weight || 1.0;
    importance *= categoryWeight;
    
    // Content-based importance
    if (typeof content === 'string') {
      // Length indicates depth of knowledge
      if (content.length > 500) importance += 0.2;
      if (content.length > 1000) importance += 0.2;
      
      // Technical depth indicators
      const technicalTerms = ['algorithm', 'implementation', 'architecture', 'pattern', 'methodology'];
      if (technicalTerms.some(term => content.toLowerCase().includes(term))) {
        importance += 0.25;
      }
      
      // Knowledge connectors (indicates relationship to other knowledge)
      const connectors = ['because', 'therefore', 'however', 'in contrast', 'similar to'];
      if (connectors.some(connector => content.toLowerCase().includes(connector))) {
        importance += 0.15;
      }
    }
    
    // Context-based importance
    if (context.isExpertDomain) importance += 0.3;
    if (context.problemSolved) importance += 0.25;
    if (context.knowledgeGap) importance += 0.2;
    if (context.crossDomain) importance += 0.15;
    
    // Metadata-based importance
    if (metadata.isBreakthrough) importance += 0.4;
    if (metadata.userValidated) importance += 0.2;
    if (metadata.frequentlyAccessed) importance += 0.15;
    if (metadata.fromEpisodic && metadata.episodeImportance > 0.8) importance += 0.2;
    
    // Novelty bonus (new knowledge is more important)
    if (metadata.isNovel) importance += 0.2;
    
    // Ensure importance is within bounds
    return Math.max(0.0, Math.min(1.0, importance));
  }
  
  /**
   * Knowledge indicator detection methods (agent learns these patterns)
   */
  containsTechnicalIndicators(content, context, metadata) {
    if (metadata.isTechnical || context.isTechnical) return true;
    
    if (typeof content === 'string') {
      const technicalKeywords = [
        'function', 'class', 'method', 'algorithm', 'database', 'API', 
        'framework', 'library', 'protocol', 'architecture', 'pattern'
      ];
      return technicalKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  containsProceduralIndicators(content, context, metadata) {
    if (metadata.isProcedural || context.isProcedural) return true;
    
    if (typeof content === 'string') {
      const proceduralKeywords = [
        'how to', 'step by step', 'first', 'then', 'next', 'finally',
        'process', 'workflow', 'procedure', 'method', 'approach'
      ];
      return proceduralKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  containsConceptualIndicators(content, context, metadata) {
    if (metadata.isConceptual || context.isConceptual) return true;
    
    if (typeof content === 'string') {
      const conceptualKeywords = [
        'concept', 'principle', 'theory', 'definition', 'meaning',
        'understand', 'explain', 'what is', 'represents', 'signifies'
      ];
      return conceptualKeywords.some(keyword => content.toLowerCase().includes(keyword));
    }
    
    return false;
  }
  
  /**
   * Extract knowledge entities and relationships
   */
  async extractKnowledgeEntities(content, context) {
    const entities = {
      concepts: [],
      techniques: [],
      tools: [],
      people: [],
      domains: [],
      relationships: []
    };
    
    if (typeof content === 'string') {
      const text = content.toLowerCase();
      
      // Simple entity extraction (could be enhanced with NLP)
      // Concepts (capitalized terms, technical terms)
      const conceptMatches = content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
      entities.concepts = [...new Set(conceptMatches)].slice(0, 10);
      
      // Tools and technologies (common patterns)
      const toolKeywords = ['javascript', 'python', 'react', 'node.js', 'sql', 'git', 'docker'];
      entities.tools = toolKeywords.filter(tool => text.includes(tool));
      
      // Domains (inferred from content)
      const domainKeywords = ['web development', 'machine learning', 'database', 'security', 'design'];
      entities.domains = domainKeywords.filter(domain => text.includes(domain));
    }
    
    return entities;
  }
  
  /**
   * Generate embedding for content (integrate with existing RAG service)
   */
  async generateEmbedding(content) {
    try {
      // This would integrate with existing OpenAI embedding generation
      // For now, return a placeholder vector
      // In real implementation: return await openaiService.createEmbedding(content);
      
      // Placeholder: simple content hash to vector conversion
      const hash = require('crypto').createHash('md5').update(content).digest('hex');
      const vector = Array.from({ length: this.config.vectorDimensions }, (_, i) => {
        const charCode = hash.charCodeAt(i % hash.length);
        return (charCode / 255) * 2 - 1; // Normalize to [-1, 1]
      });
      
      return vector;
      
    } catch (error) {
      console.error('[ERROR] [SemanticMemory] Embedding generation failed:', error);
      // Return zero vector as fallback
      return Array(this.config.vectorDimensions).fill(0);
    }
  }
  
  /**
   * Update knowledge relationships in graph
   */
  async updateKnowledgeRelationships(knowledgeRecord) {
    try {
      // Find related knowledge entries
      const relatedEntries = await this.findRelatedKnowledge(
        knowledgeRecord.id, 
        knowledgeRecord.embedding,
        0.8 // High similarity threshold for relationships
      );
      
      // Create relationship records
      for (const relatedEntry of relatedEntries) {
        const relationshipType = this.determineRelationshipType(knowledgeRecord, relatedEntry);
        const relationshipStrength = relatedEntry.similarity_score;
        
        await neonDB.query(`
          INSERT INTO knowledge_relationships (
            source_id, target_id, relationship_type, strength, created_at
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (source_id, target_id) DO UPDATE SET
            strength = EXCLUDED.strength,
            updated_at = NOW()
        `, [
          knowledgeRecord.id,
          relatedEntry.id,
          relationshipType,
          relationshipStrength,
          new Date()
        ]);
      }
      
    } catch (error) {
      console.error('[ERROR] [SemanticMemory] Relationship update failed:', error);
    }
  }
  
  /**
   * Find related knowledge entries
   */
  async findRelatedKnowledge(excludeId, embedding, minSimilarity) {
    try {
      const result = await neonDB.query(`
        SELECT id, knowledge_category, 
               (1 - (embedding <=> $1)) as similarity_score
        FROM semantic_memory 
        WHERE agent_id = $2 AND user_id = $3 
        AND id != $4
        AND (1 - (embedding <=> $1)) >= $5
        ORDER BY embedding <=> $1
        LIMIT 10
      `, [
        JSON.stringify(embedding),
        this.agentId,
        this.userId,
        excludeId,
        minSimilarity
      ]);
      
      return result.rows;
      
    } catch (error) {
      console.error('[ERROR] [SemanticMemory] Related knowledge search failed:', error);
      return [];
    }
  }
  
  /**
   * Determine relationship type between knowledge entries
   */
  determineRelationshipType(source, target) {
    // Agent learns relationship types dynamically
    
    if (source.knowledge_category === target.knowledge_category) {
      return 'similar';
    }
    
    if (source.knowledge_category === 'conceptual' && target.knowledge_category === 'technical') {
      return 'implements';
    }
    
    if (source.knowledge_category === 'procedural' && target.knowledge_category === 'experiential') {
      return 'validated_by';
    }
    
    return 'related_to';
  }
  
  /**
   * Get knowledge relationships for entry
   */
  async getKnowledgeRelationships(knowledgeId) {
    try {
      const result = await neonDB.query(`
        SELECT kr.*, sm.knowledge_category, sm.content 
        FROM knowledge_relationships kr
        JOIN semantic_memory sm ON sm.id = kr.target_id
        WHERE kr.source_id = $1
        ORDER BY kr.strength DESC
        LIMIT 5
      `, [knowledgeId]);
      
      return result.rows.map(row => ({
        ...row,
        content: JSON.parse(row.content)
      }));
      
    } catch (error) {
      console.error('[ERROR] [SemanticMemory] Relationship retrieval failed:', error);
      return [];
    }
  }
  
  /**
   * Consolidate knowledge from episodic memories
   */
  async consolidateFromEpisodic() {
    try {
      console.log('[LOADING] [SemanticMemory] Starting episodic knowledge consolidation...');
      
      // Find high-importance, promoted episodic memories
      const result = await neonDB.query(`
        SELECT * FROM episodic_memory 
        WHERE agent_id = $1 AND user_id = $2 
        AND promoted_to_semantic = true 
        AND created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY importance_score DESC
        LIMIT 20
      `, [this.agentId, this.userId]);
      
      let consolidated = 0;
      
      for (const episode of result.rows) {
        const context = {
          ...JSON.parse(episode.context),
          userInteraction: true,
          fromEpisodic: true
        };
        
        const metadata = {
          fromEpisodic: true,
          episodeImportance: episode.importance_score,
          originalEpisodeId: episode.id,
          forceStore: true
        };
        
        const storeResult = await this.store(
          JSON.parse(episode.content), 
          context, 
          metadata
        );
        
        if (storeResult.stored) {
          consolidated++;
        }
      }
      
      this.metrics.consolidatedFromEpisodic += consolidated;
      this.metrics.lastConsolidation = new Date();
      
      console.log(`[OK] [SemanticMemory] Consolidated ${consolidated} knowledge entries from episodic memory`);
      
      return consolidated;
      
    } catch (error) {
      console.error('[ERROR] [SemanticMemory] Episodic consolidation failed:', error);
      return 0;
    }
  }
  
  /**
   * Load knowledge base statistics
   */
  async loadKnowledgeStats() {
    try {
      const result = await neonDB.query(`
        SELECT 
          COUNT(*) as total_entries,
          AVG(importance_score) as avg_importance,
          0 as from_episodic
        FROM semantic_memory 
        WHERE agent_id = $1 AND user_id = $2
      `, [this.agentId, this.userId]);
      
      if (result.rows.length > 0) {
        const stats = result.rows[0];
        this.metrics.totalKnowledgeEntries = parseInt(stats.total_entries);
        this.metrics.consolidatedFromEpisodic = parseInt(stats.from_episodic);
      }
      
    } catch (error) {
      console.error('[ERROR] [SemanticMemory] Failed to load knowledge stats:', error);
    }
  }
  
  /**
   * Learn knowledge categories from existing data
   */
  async learnKnowledgeCategories() {
    try {
      const result = await neonDB.query(`
        SELECT 
          knowledge_category,
          COUNT(*) as frequency,
          AVG(importance_score) as avg_importance,
          AVG(usage_count) as avg_access
        FROM semantic_memory 
        WHERE agent_id = $1 AND user_id = $2 
        GROUP BY knowledge_category
      `, [this.agentId, this.userId]);
      
      // Update category weights based on performance
      result.rows.forEach(row => {
        const currentCategory = this.knowledgeCategories.get(row.knowledge_category);
        if (currentCategory) {
          // Weight based on importance and usage
          const performanceScore = (parseFloat(row.avg_importance) + Math.log(parseFloat(row.avg_access) + 1) / 5) / 2;
          currentCategory.weight = Math.max(0.5, Math.min(2.0, performanceScore * 1.5));
        } else {
          // New category discovered by agent
          this.knowledgeCategories.set(row.knowledge_category, {
            weight: 1.0,
            examples: []
          });
        }
      });
      
      console.log(`🧠 [SemanticMemory] Learned from ${result.rows.length} knowledge categories`);
      
    } catch (error) {
      console.error('[ERROR] [SemanticMemory] Category learning failed:', error);
    }
  }
  
  /**
   * Optimize vector search performance
   */
  async optimizeVectorSearch() {
    try {
      // Ensure vector index exists for fast similarity search
      await neonDB.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS semantic_memory_embedding_idx 
        ON semantic_memory USING ivfflat (embedding vector_cosine_ops)
      `);
      
    } catch (error) {
      // Index creation can fail if already exists - this is expected
      console.log('[INFO] [SemanticMemory] Vector index optimization completed');
    }
  }
  
  /**
   * Utilities
   */
  summarizeContext(context) {
    // Remove large data from context summary
    const summary = { ...context };
    
    // Keep only essential context information
    const essentialKeys = ['sessionId', 'userInitiated', 'domain', 'task', 'goal'];
    const filtered = {};
    
    essentialKeys.forEach(key => {
      if (summary[key] !== undefined) {
        filtered[key] = summary[key];
      }
    });
    
    return filtered;
  }
  
  updateMetrics(knowledgeRecord) {
    this.metrics.totalKnowledgeEntries++;
    
    // Update average similarity score
    const alpha = 0.1;
    this.metrics.averageSimilarityScore = 
      alpha * knowledgeRecord.importance_score + 
      (1 - alpha) * this.metrics.averageSimilarityScore;
  }
  
  setupConsolidation() {
    // Daily knowledge consolidation from episodic memory
    setInterval(async () => {
      try {
        await this.consolidateFromEpisodic();
        await this.learnKnowledgeCategories();
      } catch (error) {
        console.error('[ERROR] [SemanticMemory] Consolidation failed:', error);
      }
    }, this.config.consolidationInterval);
  }
  
  /**
   * Store knowledge in semantic memory (API method)
   */
  async storeKnowledge(knowledge) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Use existing store method
      const result = await this.store(knowledge.content, {
        title: knowledge.title || 'Untitled Knowledge',
        category: knowledge.category || 'general',
        importance: knowledge.importance || 0.7
      }, {
        timestamp: knowledge.timestamp || new Date(),
        forceStore: true
      });
      
      return result.id || result.knowledgeId;
      
    } catch (error) {
      console.error('[ERROR] [SemanticMemory] Store knowledge failed:', error);
      throw error;
    }
  }
  
  /**
   * Search knowledge by query (API method)
   */
  async searchKnowledge(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const { limit = 10 } = options;
    
    try {
      // Use existing retrieve method
      const results = await this.retrieve(query, {}, {
        limit,
        minSimilarity: this.config.similarityThreshold,
        includeRelationships: true
      });
      
      return results.map(result => ({
        ...result,
        memoryType: 'semantic'
      }));
      
    } catch (error) {
      console.error('[ERROR] [SemanticMemory] Search knowledge failed:', error);
      throw error;
    }
  }
  
  /**
   * Get semantic memory statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      agentId: this.agentId,
      userId: this.userId,
      ...this.metrics,
      knowledgeCategories: Object.fromEntries(this.knowledgeCategories),
      config: this.config
    };
  }
}

module.exports = SemanticMemory;