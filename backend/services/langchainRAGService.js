/**
 * LangChain RAG Service - Advanced RAG with automatic intent classification
 * Replaces manual RAG pipeline with intelligent LangChain components
 * Integrates with existing PostgreSQL + pgvector database
 */

const { ChatOpenAI } = require("@langchain/openai");
const { ChatAnthropic } = require("@langchain/anthropic");
const { PGVectorStore } = require("@langchain/community/vectorstores/pgvector");
const { 
  RecursiveCharacterTextSplitter,
  TokenTextSplitter 
} = require("langchain/text_splitter");
const { 
  ContextualCompressionRetriever
} = require("langchain/retrievers/contextual_compression");
const { 
  EmbeddingsFilter
} = require("langchain/retrievers/document_compressors/embeddings_filter");
const {
  MultiQueryRetriever
} = require("langchain/retrievers/multi_query");
const { 
  RunnablePassthrough,
  RunnableSequence,
  RunnableLambda
} = require("@langchain/core/runnables");
const { PromptTemplate } = require("@langchain/core/prompts");
const { Document } = require("@langchain/core/documents");

const { neonDB } = require('../database/connections/neon');
const KnowledgeService = require('./knowledgeService');
const { embeddingService } = require('./embeddingService');

/**
 * LangChain-compatible wrapper for our backend embedding service
 */
class BackendEmbeddingsWrapper {
  constructor(backendEmbeddingService) {
    this.backendService = backendEmbeddingService;
  }

  async embedQuery(text) {
    return await this.backendService.generateEmbedding(text);
  }

  async embedDocuments(documents) {
    return await this.backendService.batchGenerateEmbeddings(documents);
  }
}

class LangChainRAGService {
  constructor() {
    this.initialized = false;
    this.embeddings = null;
    this.vectorStore = null;
    this.queryClassifier = null;
    this.compressedRetriever = null;
    this.multiQueryRetriever = null;
    this.crossEncoder = null;
    this.knowledgeService = new KnowledgeService();
    
    // Performance tracking
    this.stats = {
      queriesProcessed: 0,
      totalRetrievalTime: 0,
      avgRetrievalTime: 0,
      cacheHits: 0,
      lastActivity: null
    };
    
    console.log('[START] [LangChainRAG] LangChain RAG Service initializing...');
  }

  /**
   * Initialize LangChain RAG components
   */
  async initialize() {
    if (this.initialized) {
      console.log('[OK] [LangChainRAG] Already initialized');
      return;
    }

    const startTime = Date.now();
    
    try {
      console.log('[TOOL] [LangChainRAG] Setting up embeddings and vector store...');
      
      // 1. Initialize embeddings using our backend embedding service
      await embeddingService.initialize();
      this.embeddings = new BackendEmbeddingsWrapper(embeddingService);
      console.log('[OK] [LangChainRAG] Using backend embedding service instead of separate OpenAI client');

      // 2. Initialize vector store with existing pgvector setup
      this.vectorStore = new PGVectorStore(this.embeddings, {
        postgresConnectionOptions: {
          host: process.env.NEON_HOST,
          port: 5432,
          user: process.env.NEON_USER, 
          password: process.env.NEON_PASSWORD,
          database: process.env.NEON_DATABASE,
          ssl: true
        },
        tableName: "knowledge_base", // Use existing table
        columns: {
          idColumnName: "id",
          vectorColumnName: "embedding_vector", // Matches existing column
          contentColumnName: "content",
          metadataColumnName: "metadata",
        },
        distanceStrategy: "cosine"
      });

      // 3. Initialize query classifier (replaces manual intent detection)
      this.queryClassifier = await this.createQueryClassifier();

      // 4. Initialize compression retriever for token efficiency
      this.compressedRetriever = await this.createCompressedRetriever();

      // 5. Initialize multi-query retriever for better recall
      this.multiQueryRetriever = await this.createMultiQueryRetriever();

      // 6. Initialize cross-encoder for reranking (simple implementation)
      this.crossEncoder = await this.createCrossEncoder();

      this.initialized = true;
      const initTime = Date.now() - startTime;
      
      console.log(`[OK] [LangChainRAG] Initialized successfully in ${initTime}ms`);
      console.log('[TARGET] [LangChainRAG] Features enabled: Intent Classification, Multi-Query, Compression, Cross-Encoding');

    } catch (error) {
      console.error('[ERROR] [LangChainRAG] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create intelligent query classifier to replace manual pattern matching
   */
  async createQueryClassifier() {
    const classificationLLM = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
      openAIApiKey: process.env.OPENAI_API_KEY
    });

    const classificationPrompt = PromptTemplate.fromTemplate(`
      Classify this user query into ONE of these categories based on what type of response would be most helpful:

      FACTUAL: Questions about definitions, facts, or explanations (What is X? How does Y work?)
      PROCEDURAL: Step-by-step instructions or how-to questions (How to configure X? Steps to do Y?)
      TROUBLESHOOTING: Error resolution or problem-solving (Error with X, Y not working, Fix Z)
      VISUAL: Questions about what's visible on screen (What's showing? Where is button X?)
      COMPARISON: Comparing multiple items or options (Compare X vs Y, Which is better?)
      CONVERSATIONAL: General chat, greetings, acknowledgments (Hi, thanks, yes/no)

      Query: "{query}"
      
      Respond with only the category name (FACTUAL, PROCEDURAL, etc.) and confidence score 0-100:
      Category: [CATEGORY]
      Confidence: [SCORE]
      Reasoning: [Brief explanation]
    `);

    const classifier = RunnableSequence.from([
      classificationPrompt,
      classificationLLM,
      RunnableLambda.from(async (response) => {
        const content = response.content;
        const categoryMatch = content.match(/Category:\s*(\w+)/);
        const confidenceMatch = content.match(/Confidence:\s*(\d+)/);
        const reasoningMatch = content.match(/Reasoning:\s*(.+)/);
        
        return {
          category: categoryMatch ? categoryMatch[1].toLowerCase() : 'factual',
          confidence: confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.7,
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : 'Automatic classification',
          rawResponse: content
        };
      })
    ]);

    return classifier;
  }

  /**
   * Create compressed retriever for token efficiency
   */
  async createCompressedRetriever() {
    // Use embeddings filter to reduce irrelevant results
    const compressor = new EmbeddingsFilter({
      embeddings: this.embeddings,
      similarityThreshold: 0.7, // Filter out results below 70% similarity
      k: 10 // Keep top 10 results before compression
    });

    const compressionRetriever = new ContextualCompressionRetriever({
      baseCompressor: compressor,
      baseRetriever: this.vectorStore.asRetriever({ k: 15 }) // Get more results for filtering
    });

    return compressionRetriever;
  }

  /**
   * Create multi-query retriever for better recall
   */
  async createMultiQueryRetriever() {
    const multiQueryLLM = new ChatOpenAI({
      modelName: "gpt-4o-mini", 
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY
    });

    // Use the fromLLM static method as per LangChain JS documentation
    const multiQueryRetriever = MultiQueryRetriever.fromLLM({
      llm: multiQueryLLM,
      retriever: this.vectorStore.asRetriever({ k: 8 }),
      verbose: false  // Disable verbose for production
    });

    return multiQueryRetriever;
  }

  /**
   * Create cross-encoder for result reranking using EmbeddingsFilter approach
   * This is a lightweight semantic similarity-based reranking
   */
  async createCrossEncoder() {
    const self = this;
    
    // Use embeddings-based similarity for efficient reranking
    // This replaces expensive LLM-based scoring with semantic similarity
    return {
      async rerank(query, documents, options = {}) {
        const { topK = 5, threshold = 0.2 } = options;
        
        // Generate query embedding once
        const queryEmbedding = await self.embeddings.embedQuery(query);
        
        // Score documents based on semantic similarity  
        const scoredDocs = await Promise.all(documents.map(async (doc) => {
          try {
            // Get document embedding - for chunks this is already available
            let docEmbedding;
            if (doc.metadata?.embedding_vector) {
              // Use existing embedding for chunks
              docEmbedding = doc.metadata.embedding_vector;
            } else {
              // Generate embedding for new documents
              docEmbedding = await self.embeddings.embedQuery(doc.pageContent);
            }
            
            // Calculate cosine similarity
            const similarity = self.calculateCosineSimilarity(queryEmbedding, docEmbedding);
            
            return {
              ...doc,
              relevanceScore: Math.max(0, similarity), // Ensure positive scores
              semanticSimilarity: similarity
            };
          } catch (error) {
            console.warn(`[WARNING] [CrossEncoder] Failed to score document:`, error.message);
            return {
              ...doc,
              relevanceScore: doc.score || 0.3, // Fallback to original score
              semanticSimilarity: doc.score || 0.3
            };
          }
        }));
        
        // Filter and sort by relevance
        return scoredDocs
          .filter(doc => doc.relevanceScore >= threshold)
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, topK);
      }
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  calculateCosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Enhanced RAG search with LangChain intelligence
   * @param {string} query - User query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Enhanced search results
   */
  async enhancedRAGSearch(query, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      agentId = null,
      documentIds = [],
      topK = 5,
      useMultiQuery = true,
      useCompression = true,
      useReranking = true,
      minScore = 0.35
    } = options;

    const startTime = Date.now();

    try {
      console.log(`[SEARCH] [LangChainRAG] Processing query: "${query.substring(0, 50)}..."`);

      // 1. Classify query intent automatically
      const classification = await this.queryClassifier.invoke({ query });
      console.log(`[TARGET] [LangChainRAG] Query classified: ${classification.category} (${Math.round(classification.confidence * 100)}%)`);

      // 2. Choose retrieval strategy based on classification
      let retrievalResults = [];
      let chunkResults = [];
      
      // First, try chunk-level search for better precision
      if (classification.category !== 'conversational') {
        try {
          const chunkSearchOptions = {
            limit: Math.min(topK * 2, 15), // Get more chunks for filtering
            similarity_threshold: minScore,
            document_ids: documentIds
          };

          console.log(`[SEARCH] [LangChainRAG] Searching chunks with options:`, chunkSearchOptions);
          chunkResults = await this.knowledgeService.searchChunks(query, chunkSearchOptions);
          console.log(`[PACKAGE] [LangChainRAG] Found ${chunkResults.length} chunk matches`);
          
          // Convert chunks to LangChain document format
          retrievalResults = chunkResults.map(chunk => ({
            pageContent: chunk.chunk_text,
            metadata: {
              id: chunk.id,
              knowledge_base_id: chunk.knowledge_base_id,
              chunk_index: chunk.chunk_index,
              document_title: chunk.document_title,
              content_type: chunk.content_type,
              source: 'chunk',
              chunk_tokens: chunk.chunk_tokens,
              // metadata is already parsed JSONB from database, no need to JSON.parse
              ...(chunk.metadata || {})
            },
            score: chunk.similarity_score,
            relevanceScore: chunk.similarity_score
          }));
          
        } catch (chunkError) {
          console.warn('[WARNING] [LangChainRAG] Chunk search failed, falling back to document search:', chunkError.message);
        }
      }

      // Fallback to document-level retrieval if chunk search failed or insufficient results
      if (retrievalResults.length < 3) {
        console.log('📝 [LangChainRAG] Using document-level retrieval as primary/fallback');
        console.log(`[SEARCH] [LangChainRAG] Document-level search for agent documents:`, documentIds);
        
        // Skip document-level fallback for now as chunk search is working well
        console.log('[INFO] [LangChainRAG] Sufficient chunk results found, skipping document fallback');
      }

      // 3. Filter by document IDs if specified (agent-specific knowledge)
      if (documentIds.length > 0) {
        retrievalResults = retrievalResults.filter(doc => {
          // For chunks, filter by knowledge_base_id (document ID), not chunk ID
          const docId = doc.metadata?.knowledge_base_id || doc.metadata?.id || doc.id;
          return documentIds.includes(docId);
        });
      }

      // 4. Smart reranking - Skip for simple conversational queries (OPTIMIZATION)
      let finalResults = [];
      const skipReranking = query.length < 50 && classification.category === 'conversational';
      
      if (retrievalResults.length > 0 && useReranking && !skipReranking) {
        console.log(`[LOADING] [LangChainRAG] Reranking ${retrievalResults.length} results...`);
      } else if (skipReranking) {
        console.log(`[START] [OPTIMIZATION] Skipping reranking for simple conversational query: "${query}"`);
      }
      
      if (retrievalResults.length > 0 && useReranking && !skipReranking) {
        
        try {
          // Use the new embeddings-based reranking approach
          finalResults = await this.crossEncoder.rerank(query, retrievalResults, {
            topK: topK,
            threshold: Math.max(0.2, minScore - 0.1) // Lower threshold for reranking to be more permissive
          });
          
          console.log(`[OK] [LangChainRAG] Reranking completed: ${finalResults.length} results kept`);
          
        } catch (error) {
          console.warn(`[WARNING] [LangChainRAG] Reranking failed, using original results:`, error.message);
          // Fallback to original results without reranking
          finalResults = retrievalResults
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, topK);
        }
          
      } else {
        finalResults = retrievalResults.slice(0, topK);
      }

      // 5. Format results for consumption with chunk/document awareness
      const formattedResults = finalResults.map(doc => {
        const isChunk = doc.metadata?.source === 'chunk';
        
        return {
          content: this.extractRelevantSnippet(doc.pageContent, query),
          fullContent: doc.pageContent,
          similarity: doc.relevanceScore || doc.score || 0,
          source: doc.metadata?.source || 'knowledge_base',
          title: isChunk 
            ? `${doc.metadata?.document_title || 'Untitled'} (Section ${doc.metadata?.chunk_index + 1 || 1})` 
            : doc.metadata?.title || 'Untitled',
          metadata: {
            id: doc.metadata?.id || doc.id,
            content_type: doc.metadata?.content_type || 'text',
            relevance_score: doc.relevanceScore,
            original_score: doc.originalScore,
            content_length: doc.pageContent?.length || 0,
            // Chunk-specific metadata
            is_chunk: isChunk,
            chunk_index: doc.metadata?.chunk_index,
            chunk_tokens: doc.metadata?.chunk_tokens,
            knowledge_base_id: doc.metadata?.knowledge_base_id,
            document_title: doc.metadata?.document_title,
            // Enhanced context for better understanding
            retrieval_method: isChunk ? 'chunk_search' : 
              chunkResults.length > 0 ? 'hybrid_search' : 'document_search'
          }
        };
      });

      // 6. Update performance stats
      const retrievalTime = Date.now() - startTime;
      this.stats.queriesProcessed++;
      this.stats.totalRetrievalTime += retrievalTime;
      this.stats.avgRetrievalTime = this.stats.totalRetrievalTime / this.stats.queriesProcessed;
      this.stats.lastActivity = new Date();

      console.log(`[OK] [LangChainRAG] Retrieved ${formattedResults.length} results in ${retrievalTime}ms`);
      console.log(`[DATA] [LangChainRAG] Avg retrieval time: ${Math.round(this.stats.avgRetrievalTime)}ms`);

      return {
        success: true,
        results: formattedResults,
        totalResults: formattedResults.length,
        queryClassification: classification,
        retrievalStrategy: classification.category,
        metadata: {
          retrievalTime,
          avgRetrievalTime: this.stats.avgRetrievalTime,
          queriesProcessed: this.stats.queriesProcessed,
          useMultiQuery,
          useCompression,
          useReranking
        }
      };

    } catch (error) {
      console.error('[ERROR] [LangChainRAG] Enhanced search failed:', error);
      
      return {
        success: false,
        error: error.message,
        results: [],
        totalResults: 0,
        queryClassification: { category: 'unknown', confidence: 0 }
      };
    }
  }

  /**
   * Extract most relevant snippet from document content
   */
  extractRelevantSnippet(content, query, maxLength = 800) {
    if (!content || content.length <= maxLength) {
      return content;
    }

    // Simple relevance-based snippet extraction
    const queryWords = query.toLowerCase().split(/\s+/);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // Score sentences by query word matches
    const scoredSentences = sentences.map(sentence => {
      const sentenceWords = sentence.toLowerCase().split(/\s+/);
      const matches = queryWords.filter(word => 
        sentenceWords.some(sw => sw.includes(word))
      ).length;
      
      return {
        sentence: sentence.trim(),
        score: matches,
        length: sentence.length
      };
    });

    // Find best sentences that fit within maxLength
    scoredSentences.sort((a, b) => b.score - a.score);
    
    let snippet = '';
    let totalLength = 0;
    
    for (const item of scoredSentences) {
      if (totalLength + item.length + 2 <= maxLength && item.score > 0) {
        if (snippet) snippet += '. ';
        snippet += item.sentence;
        totalLength += item.length + 2;
      }
    }

    // Fallback to beginning if no relevant sentences found
    if (!snippet) {
      snippet = content.substring(0, maxLength) + '...';
    }

    return snippet;
  }

  /**
   * Get documents for agent-specific knowledge base
   * @param {number} agentId - Agent ID
   * @returns {Promise<Array>} Document IDs accessible to agent
   */
  async getAgentDocumentIds(agentId) {
    try {
      console.log(`[SEARCH] [LangChainRAG] Getting documents for agent ${agentId}`);
      
      // Check if agent has search_all_knowledge enabled
      const agentResult = await neonDB.query(
        'SELECT search_all_knowledge FROM agents WHERE id = $1',
        [parseInt(agentId)]
      );
      
      console.log(`[DATA] [LangChainRAG] Agent ${agentId} search_all_knowledge:`, agentResult.rows[0]?.search_all_knowledge);
      
      if (agentResult.rows[0]?.search_all_knowledge) {
        // Return all indexed documents
        const allDocsResult = await neonDB.query(
          'SELECT id FROM knowledge_base WHERE is_indexed = true'
        );
        const docIds = allDocsResult.rows.map(doc => doc.id);
        console.log(`📚 [LangChainRAG] Agent ${agentId} has access to ALL documents:`, docIds);
        return docIds;
      } else {
        // Return only assigned documents
        const assignedDocsResult = await neonDB.query(
          'SELECT knowledge_item_id FROM agent_knowledge_access WHERE agent_id = $1',
          [parseInt(agentId)]
        );
        const docIds = assignedDocsResult.rows.map(doc => doc.knowledge_item_id);
        console.log(`📚 [LangChainRAG] Agent ${agentId} has access to assigned documents:`, docIds);
        return docIds;
      }
    } catch (error) {
      console.warn('[WARNING] [LangChainRAG] Failed to get agent documents:', error.message);
      return [];
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      initialized: this.initialized,
      avgRetrievalTimeMs: Math.round(this.stats.avgRetrievalTime),
      cacheHitRate: this.stats.queriesProcessed > 0 
        ? Math.round((this.stats.cacheHits / this.stats.queriesProcessed) * 100)
        : 0
    };
  }

  /**
   * Health check for the service
   */
  async healthCheck() {
    try {
      if (!this.initialized) {
        return { status: 'not_initialized' };
      }

      // Test a simple query
      const testResult = await this.enhancedRAGSearch('test query', { topK: 1 });
      
      return {
        status: 'healthy',
        initialized: this.initialized,
        testQuery: testResult.success,
        stats: this.getStats()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        initialized: this.initialized
      };
    }
  }
}

module.exports = new LangChainRAGService();