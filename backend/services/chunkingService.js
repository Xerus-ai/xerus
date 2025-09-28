/**
 * Chunking Engine - Intelligent Document Chunking Service
 * Implements content-type aware chunking strategies for optimal RAG retrieval
 * Integrates with OpenAI embeddings and pgvector storage
 */

const { RecursiveCharacterTextSplitter, TokenTextSplitter } = require('langchain/text_splitter');

class ChunkingEngine {
  constructor() {
    this.initialized = false;
    
    // Content-type specific chunking strategies
    this.chunkingStrategies = {
      'markdown': {
        chunkSize: 800,
        chunkOverlap: 100,
        separators: ['## ', '### ', '#### ', '\n\n', '\n', ' ', ''],
        tokenLimit: 200 // Conservative for better precision
      },
      'code': {
        chunkSize: 600,
        chunkOverlap: 50,
        separators: ['function ', 'class ', 'def ', 'async ', '\n\n', '\n', ' ', ''],
        tokenLimit: 150 // Smaller for code contexts
      },
      'html': {
        chunkSize: 700,
        chunkOverlap: 80,
        separators: ['</p>', '</div>', '</section>', '\n\n', '\n', ' ', ''],
        tokenLimit: 175
      },
      'pdf': {
        chunkSize: 1000,
        chunkOverlap: 150,
        separators: ['\n\n', '. ', '! ', '? ', '\n', ' ', ''],
        tokenLimit: 250 // Larger for document content
      },
      'json': {
        chunkSize: 400,
        chunkOverlap: 40,
        separators: ['},', '}', '\n', ' ', ''],
        tokenLimit: 100 // Structured data needs smaller chunks
      },
      'text': {
        chunkSize: 800,
        chunkOverlap: 100,
        separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', ''],
        tokenLimit: 200 // Default fallback
      }
    };
    
    // Performance tracking
    this.stats = {
      documentsChunked: 0,
      totalChunksCreated: 0,
      averageChunksPerDocument: 0,
      avgProcessingTime: 0,
      totalProcessingTime: 0
    };
    
    console.log('[PACKAGE] [ChunkingEngine] Intelligent chunking engine initializing...');
  }

  /**
   * Initialize the chunking engine
   */
  async initialize() {
    if (this.initialized) {
      console.log('[OK] [ChunkingEngine] Already initialized');
      return;
    }
    
    try {
      // Validate chunking strategies
      this.validateStrategies();
      
      this.initialized = true;
      console.log('[OK] [ChunkingEngine] Initialized successfully');
      console.log('[TARGET] [ChunkingEngine] Supported content types:', Object.keys(this.chunkingStrategies));
      
    } catch (error) {
      console.error('[ERROR] [ChunkingEngine] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Validate chunking strategies configuration
   */
  validateStrategies() {
    for (const [contentType, strategy] of Object.entries(this.chunkingStrategies)) {
      if (!strategy.chunkSize || !strategy.chunkOverlap || !strategy.separators) {
        throw new Error(`Invalid chunking strategy for content type: ${contentType}`);
      }
      
      if (strategy.chunkOverlap >= strategy.chunkSize) {
        throw new Error(`Chunk overlap must be smaller than chunk size for: ${contentType}`);
      }
    }
  }

  /**
   * Intelligent document chunking based on content type
   * @param {Object} document - Document object with content and metadata
   * @param {Object} options - Chunking options
   * @returns {Promise<Array>} Array of chunk objects
   */
  async chunkDocument(document, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    
    try {
      const {
        customChunkSize,
        customOverlap,
        enableOverlapTracking = true,
        preserveMetadata = true
      } = options;

      console.log(`[PACKAGE] [ChunkingEngine] Chunking document: "${document.title}" (${document.content_type})`);
      
      // Get chunking strategy for content type
      const strategy = this.getChunkingStrategy(document.content_type, {
        customChunkSize,
        customOverlap
      });

      // Determine if document needs chunking
      const shouldChunk = this.shouldChunkDocument(document, strategy);
      if (!shouldChunk) {
        console.log('[TASKS] [ChunkingEngine] Document too small for chunking, using single chunk');
        return this.createSingleChunk(document, preserveMetadata);
      }

      // Create text splitter based on content type
      const textSplitter = this.createTextSplitter(strategy, document.content_type);
      
      // Split the document content
      const splitTexts = await textSplitter.splitText(document.content);
      
      // Create chunk objects with metadata
      const chunks = this.createChunkObjects(
        splitTexts, 
        document, 
        strategy, 
        enableOverlapTracking,
        preserveMetadata
      );

      // Update performance stats
      const processingTime = Date.now() - startTime;
      this.updateStats(chunks.length, processingTime);

      console.log(`[OK] [ChunkingEngine] Created ${chunks.length} chunks in ${processingTime}ms`);
      console.log(`[DATA] [ChunkingEngine] Avg chunk size: ${Math.round(chunks.reduce((sum, c) => sum + c.chunk_size, 0) / chunks.length)} chars`);

      return chunks;

    } catch (error) {
      console.error('[ERROR] [ChunkingEngine] Document chunking failed:', error);
      throw new Error(`Document chunking failed: ${error.message}`);
    }
  }

  /**
   * Get chunking strategy for content type
   */
  getChunkingStrategy(contentType, overrides = {}) {
    const baseStrategy = this.chunkingStrategies[contentType] || this.chunkingStrategies['text'];
    
    return {
      ...baseStrategy,
      chunkSize: overrides.customChunkSize || baseStrategy.chunkSize,
      chunkOverlap: overrides.customOverlap || baseStrategy.chunkOverlap
    };
  }

  /**
   * Determine if document should be chunked
   */
  shouldChunkDocument(document, strategy) {
    // Don't chunk if content is smaller than chunk size + overlap
    const minSizeForChunking = strategy.chunkSize + strategy.chunkOverlap;
    
    return document.content && 
           document.content.length > minSizeForChunking &&
           document.word_count > 150; // Minimum word threshold
  }

  /**
   * Create single chunk for small documents
   */
  createSingleChunk(document, preserveMetadata) {
    const chunk = {
      chunk_text: document.content,
      chunk_index: 0,
      chunk_tokens: this.estimateTokenCount(document.content),
      chunk_size: document.content.length,
      overlap_start: 0,
      overlap_end: 0,
      metadata: preserveMetadata ? {
        content_type: document.content_type,
        source_title: document.title,
        is_single_chunk: true,
        original_length: document.content.length
      } : {}
    };

    return [chunk];
  }

  /**
   * Create appropriate text splitter for content type
   */
  createTextSplitter(strategy, contentType) {
    // Use RecursiveCharacterTextSplitter for most content types
    return new RecursiveCharacterTextSplitter({
      chunkSize: strategy.chunkSize,
      chunkOverlap: strategy.chunkOverlap,
      separators: strategy.separators,
      lengthFunction: (text) => text.length,
      keepSeparator: true
    });
  }

  /**
   * Create chunk objects with metadata and overlap tracking
   */
  createChunkObjects(splitTexts, document, strategy, enableOverlapTracking, preserveMetadata) {
    const chunks = [];
    let documentPosition = 0;

    for (let i = 0; i < splitTexts.length; i++) {
      const chunkText = splitTexts[i];
      const tokenCount = this.estimateTokenCount(chunkText);
      
      // Calculate overlap boundaries
      let overlapStart = 0;
      let overlapEnd = 0;
      
      if (enableOverlapTracking && i > 0) {
        overlapStart = this.calculateOverlapStart(chunkText, splitTexts[i - 1], strategy.chunkOverlap);
      }
      
      if (enableOverlapTracking && i < splitTexts.length - 1) {
        overlapEnd = this.calculateOverlapEnd(chunkText, splitTexts[i + 1], strategy.chunkOverlap);
      }

      // Build chunk metadata
      const chunkMetadata = preserveMetadata ? {
        content_type: document.content_type,
        source_title: document.title,
        source_url: document.source_url,
        chunk_strategy: strategy,
        document_position: documentPosition,
        total_chunks: splitTexts.length,
        section_info: this.extractSectionInfo(chunkText, document.content_type)
      } : {};

      const chunk = {
        chunk_text: chunkText.trim(),
        chunk_index: i,
        chunk_tokens: tokenCount,
        chunk_size: chunkText.length,
        overlap_start: overlapStart,
        overlap_end: overlapEnd,
        metadata: chunkMetadata
      };

      chunks.push(chunk);
      documentPosition += chunkText.length;
    }

    return chunks;
  }

  /**
   * Calculate overlap with previous chunk
   */
  calculateOverlapStart(currentChunk, previousChunk, maxOverlap) {
    if (!previousChunk) return 0;
    
    const currentStart = currentChunk.substring(0, maxOverlap);
    const previousEnd = previousChunk.substring(Math.max(0, previousChunk.length - maxOverlap));
    
    // Find common substring length
    let overlap = 0;
    const minLength = Math.min(currentStart.length, previousEnd.length);
    
    for (let i = 0; i < minLength; i++) {
      if (currentStart[i] === previousEnd[previousEnd.length - minLength + i]) {
        overlap++;
      } else {
        break;
      }
    }
    
    return overlap;
  }

  /**
   * Calculate overlap with next chunk
   */
  calculateOverlapEnd(currentChunk, nextChunk, maxOverlap) {
    if (!nextChunk) return 0;
    
    const currentEnd = currentChunk.substring(Math.max(0, currentChunk.length - maxOverlap));
    const nextStart = nextChunk.substring(0, maxOverlap);
    
    // Find common substring length
    let overlap = 0;
    const minLength = Math.min(currentEnd.length, nextStart.length);
    
    for (let i = 0; i < minLength; i++) {
      if (currentEnd[currentEnd.length - minLength + i] === nextStart[i]) {
        overlap++;
      } else {
        break;
      }
    }
    
    return overlap;
  }

  /**
   * Extract section information based on content type
   */
  extractSectionInfo(chunkText, contentType) {
    const sectionInfo = {};
    
    switch (contentType) {
      case 'markdown':
        const mdHeader = chunkText.match(/^(#+)\s+(.+)$/m);
        if (mdHeader) {
          sectionInfo.header_level = mdHeader[1].length;
          sectionInfo.header_text = mdHeader[2];
        }
        break;
        
      case 'html':
        const htmlHeader = chunkText.match(/<(h[1-6]).*?>(.+?)<\/\1>/i);
        if (htmlHeader) {
          sectionInfo.header_level = parseInt(htmlHeader[1].slice(1));
          sectionInfo.header_text = htmlHeader[2].replace(/<[^>]*>/g, '');
        }
        break;
        
      case 'code':
        const functionMatch = chunkText.match(/(function|def|class)\s+(\w+)/);
        if (functionMatch) {
          sectionInfo.code_type = functionMatch[1];
          sectionInfo.code_name = functionMatch[2];
        }
        break;
        
      default:
        // Extract first sentence as section identifier
        const firstSentence = chunkText.split(/[.!?]/)[0];
        if (firstSentence && firstSentence.length < 100) {
          sectionInfo.preview = firstSentence.trim();
        }
    }
    
    return sectionInfo;
  }

  /**
   * Estimate token count (approximation for planning)
   */
  estimateTokenCount(text) {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Update performance statistics
   */
  updateStats(chunkCount, processingTime) {
    this.stats.documentsChunked++;
    this.stats.totalChunksCreated += chunkCount;
    this.stats.totalProcessingTime += processingTime;
    
    this.stats.averageChunksPerDocument = this.stats.totalChunksCreated / this.stats.documentsChunked;
    this.stats.avgProcessingTime = this.stats.totalProcessingTime / this.stats.documentsChunked;
  }

  /**
   * Get chunking statistics
   */
  getStats() {
    return {
      ...this.stats,
      initialized: this.initialized,
      supportedContentTypes: Object.keys(this.chunkingStrategies),
      avgProcessingTimeMs: Math.round(this.stats.avgProcessingTime)
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.initialized) {
        return { status: 'not_initialized' };
      }

      // Test chunking with sample content
      const testDocument = {
        title: 'Test Document',
        content: 'This is a test document. '.repeat(100), // ~2500 chars
        content_type: 'text'
      };

      const chunks = await this.chunkDocument(testDocument);
      
      return {
        status: 'healthy',
        initialized: this.initialized,
        testChunkCount: chunks.length,
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

module.exports = new ChunkingEngine();