/**
 * Enhanced Knowledge Service Integration Tests
 * Tests the enhanced knowledge service with chunking and RAG integration
 */

const KnowledgeService = require('../../services/knowledgeService');
const langchainRAGService = require('../../services/langchainRAGService');
const { neonDB } = require('../../database/connections/neon');

describe('Enhanced Knowledge Service Integration', () => {
  let knowledgeService;
  let testUserId = 1;
  let createdDocuments = [];
  let createdChunks = [];

  beforeAll(async () => {
    knowledgeService = new KnowledgeService();
    
    // Initialize services
    await langchainRAGService.initialize();
    
    console.log('[TEST] Enhanced Knowledge Service Integration Tests Starting...');
  });

  beforeEach(() => {
    // Reset arrays for each test
    createdDocuments = [];
    createdChunks = [];
  });

  afterEach(async () => {
    // Cleanup created test data
    try {
      for (const docId of createdDocuments) {
        await knowledgeService.deleteDocumentChunks(docId);
        await knowledgeService.deleteKnowledgeDocument(docId);
      }
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  });

  describe('Document Creation with Chunking', () => {
    test('should create document with automatic chunking enabled', async () => {
      const docData = {
        title: 'Chunking Test Document',
        content: `# Introduction

This is a comprehensive test document for the chunking system. It contains multiple sections and paragraphs to verify that the chunking engine works correctly.

## Section 1: Basic Information

This section contains basic information about the topic. It should be substantial enough to create multiple chunks when processed by the intelligent chunking system.

The chunking engine should identify section boundaries and create meaningful segments that preserve context while optimizing for retrieval.

## Section 2: Technical Details

This section provides technical details and implementation notes. It demonstrates how the system handles different types of content and maintains coherence across chunk boundaries.

### Subsection 2.1: Performance Considerations

Performance is critical when processing large documents. The chunking system should balance precision with efficiency.

### Subsection 2.2: Quality Metrics

Quality metrics help evaluate the effectiveness of the chunking strategy for different content types.

## Conclusion

This concludes the test document with multiple sections and detailed content for comprehensive chunking validation.`.repeat(2), // Make it longer to ensure chunking
        content_type: 'markdown',
        tags: ['test', 'chunking'],
        metadata: { test: true },
        enable_chunking: true,
        auto_index: true
      };

      const document = await knowledgeService.createKnowledgeDocument(docData, testUserId);
      createdDocuments.push(document.id);

      // Verify document creation
      expect(document).toBeDefined();
      expect(document.id).toBeDefined();
      expect(document.title).toBe(docData.title);
      expect(document.user_id).toBe(testUserId);

      // Wait a moment for chunking to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify chunks were created
      const chunks = await knowledgeService.getDocumentChunks(document.id);
      expect(chunks.length).toBeGreaterThan(1);

      console.log(`[PACKAGE] Created ${chunks.length} chunks for document: ${document.title}`);

      // Verify chunk properties
      chunks.forEach((chunk, index) => {
        expect(chunk.knowledge_base_id).toBe(document.id);
        expect(chunk.chunk_index).toBe(index);
        expect(chunk.chunk_text).toBeDefined();
        expect(chunk.chunk_tokens).toBeGreaterThan(0);
        expect(chunk.metadata).toBeDefined();

        const metadata = JSON.parse(chunk.metadata);
        expect(metadata.content_type).toBe('markdown');
        expect(metadata.source_title).toBe(document.title);
      });
    });

    test('should handle small documents without chunking', async () => {
      const smallDocData = {
        title: 'Small Test Document',
        content: 'This is a small document that should not be chunked.',
        content_type: 'text',
        enable_chunking: true,
        auto_index: true
      };

      const document = await knowledgeService.createKnowledgeDocument(smallDocData, testUserId);
      createdDocuments.push(document.id);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if chunks were created (should be 0 or 1)
      const chunks = await knowledgeService.getDocumentChunks(document.id);
      expect(chunks.length).toBeLessThanOrEqual(1);

      if (chunks.length === 1) {
        expect(chunks[0].chunk_text).toBe(smallDocData.content);
        const metadata = JSON.parse(chunks[0].metadata);
        expect(metadata.is_single_chunk).toBe(true);
      }
    });

    test('should respect enable_chunking=false', async () => {
      const docData = {
        title: 'No Chunking Document',
        content: 'This document should not be chunked even though it could be. '.repeat(100),
        content_type: 'text',
        enable_chunking: false,
        auto_index: true
      };

      const document = await knowledgeService.createKnowledgeDocument(docData, testUserId);
      createdDocuments.push(document.id);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify no chunks were created
      const chunks = await knowledgeService.getDocumentChunks(document.id);
      expect(chunks.length).toBe(0);
    });
  });

  describe('Chunk Search Functionality', () => {
    let searchTestDoc;

    beforeAll(async () => {
      // Create a document specifically for search testing
      const docData = {
        title: 'Search Test Document',
        content: `# JavaScript Programming Guide

JavaScript is a versatile programming language used for web development, server-side programming, and more.

## Variables and Data Types

In JavaScript, you can declare variables using var, let, or const keywords. Each has different scoping rules and behavior.

### String Data Type
Strings in JavaScript can be created using single quotes, double quotes, or template literals with backticks.

### Number Data Type
JavaScript has a single number type that represents both integers and floating-point numbers.

## Functions and Methods

Functions are reusable blocks of code that perform specific tasks. They can be declared in several ways in JavaScript.

### Arrow Functions
Arrow functions provide a concise way to write function expressions and have lexical this binding.

### Regular Functions
Regular functions can be declared using the function keyword and have their own this context.

## Advanced Topics

Advanced JavaScript topics include closures, prototypes, async/await, and design patterns.

### Promises and Async Programming
JavaScript handles asynchronous operations using promises, async/await, and callbacks.

### Object-Oriented Programming
JavaScript supports object-oriented programming through prototypes and ES6 classes.`,
        content_type: 'markdown',
        enable_chunking: true,
        auto_index: true
      };

      searchTestDoc = await knowledgeService.createKnowledgeDocument(docData, testUserId);
      createdDocuments.push(searchTestDoc.id);

      // Wait for indexing to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
    });

    test('should search chunks effectively', async () => {
      const searchQuery = 'arrow functions';
      
      const chunkResults = await knowledgeService.searchChunks(searchQuery, {
        user_id: testUserId,
        limit: 5,
        similarity_threshold: 0.5
      });

      expect(chunkResults.length).toBeGreaterThan(0);

      // Find the most relevant result
      const topResult = chunkResults[0];
      expect(topResult.chunk_text.toLowerCase()).toContain('arrow');
      expect(topResult.similarity_score).toBeGreaterThan(0.5);
      expect(topResult.document_title).toBe('Search Test Document');
    });

    test('should filter by document IDs', async () => {
      const searchQuery = 'JavaScript programming';
      
      const filteredResults = await knowledgeService.searchChunks(searchQuery, {
        user_id: testUserId,
        document_ids: [searchTestDoc.id],
        limit: 5
      });

      filteredResults.forEach(result => {
        expect(result.knowledge_base_id).toBe(searchTestDoc.id);
      });
    });

    test('should respect similarity threshold', async () => {
      const searchQuery = 'completely unrelated nonsense query';
      
      const highThresholdResults = await knowledgeService.searchChunks(searchQuery, {
        user_id: testUserId,
        similarity_threshold: 0.8,
        limit: 5
      });

      // Should return fewer or no results with high threshold
      expect(highThresholdResults.length).toBeLessThanOrEqual(2);
    });
  });

  describe('LangChain RAG Integration with Chunks', () => {
    let ragTestDoc;

    beforeAll(async () => {
      // Create a comprehensive document for RAG testing
      const docData = {
        title: 'API Documentation Guide',
        content: `# REST API Documentation

This guide covers RESTful API design principles and best practices.

## HTTP Methods

### GET Method
The GET method is used to retrieve data from the server. It should be safe and idempotent.

### POST Method
The POST method is used to create new resources on the server. It is not idempotent.

### PUT Method
The PUT method is used for complete resource updates. It should be idempotent.

### DELETE Method
The DELETE method is used to remove resources from the server. It should be idempotent.

## Status Codes

### 2xx Success Codes
- 200 OK: Request successful
- 201 Created: Resource created successfully
- 204 No Content: Successful request with no content

### 4xx Client Error Codes
- 400 Bad Request: Invalid request syntax
- 401 Unauthorized: Authentication required
- 404 Not Found: Resource not found

### 5xx Server Error Codes
- 500 Internal Server Error: Generic server error
- 503 Service Unavailable: Server temporarily unavailable

## Authentication and Authorization

### JWT Tokens
JSON Web Tokens provide a stateless way to authenticate API requests.

### API Keys
API keys are simple authentication tokens for identifying applications.

## Error Handling

Proper error handling includes meaningful error messages and appropriate status codes.`,
        content_type: 'markdown',
        enable_chunking: true,
        auto_index: true
      };

      ragTestDoc = await knowledgeService.createKnowledgeDocument(docData, testUserId);
      createdDocuments.push(ragTestDoc.id);

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 3000));
    });

    test('should perform enhanced RAG search with chunks', async () => {
      const query = 'What is the POST method used for?';
      
      const ragResults = await langchainRAGService.enhancedRAGSearch(query, {
        documentIds: [ragTestDoc.id],
        topK: 5,
        useMultiQuery: true,
        useCompression: true,
        useReranking: true,
        minScore: 0.6
      });

      expect(ragResults.success).toBe(true);
      expect(ragResults.results.length).toBeGreaterThan(0);

      const topResult = ragResults.results[0];
      expect(topResult.content.toLowerCase()).toContain('post');
      expect(topResult.similarity).toBeGreaterThan(0.6);
      
      // Check if chunk metadata is present
      if (topResult.metadata.is_chunk) {
        expect(topResult.metadata.chunk_index).toBeDefined();
        expect(topResult.metadata.retrieval_method).toContain('chunk');
        expect(topResult.title).toContain('Section');
      }

      console.log(`[SEARCH] RAG Search found ${ragResults.results.length} results for: "${query}"`);
      console.log(`[DATA] Query classification: ${ragResults.queryClassification.category}`);
    });

    test('should handle different query types with appropriate chunk strategies', async () => {
      const queries = [
        { text: 'How to authenticate API requests?', type: 'procedural' },
        { text: 'What are HTTP status codes?', type: 'factual' },
        { text: 'API authentication error troubleshooting', type: 'troubleshooting' }
      ];

      for (const query of queries) {
        const results = await langchainRAGService.enhancedRAGSearch(query.text, {
          documentIds: [ragTestDoc.id],
          topK: 3
        });

        expect(results.success).toBe(true);
        expect(results.queryClassification.category).toBeDefined();
        
        if (results.results.length > 0) {
          const relevantContent = results.results[0].content.toLowerCase();
          
          switch (query.type) {
            case 'procedural':
              expect(relevantContent).toMatch(/(how|step|method|process)/);
              break;
            case 'factual':
              expect(relevantContent).toMatch(/(are|is|what|definition)/);
              break;
            case 'troubleshooting':
              expect(relevantContent).toMatch(/(error|problem|issue|fix|solve)/);
              break;
          }
        }

        console.log(`[OK] Query "${query.text}" classified as: ${results.queryClassification.category}`);
      }
    });
  });

  describe('Chunk Management Operations', () => {
    test('should regenerate chunks for existing document', async () => {
      const docData = {
        title: 'Regeneration Test Document',
        content: 'Original content for regeneration testing. '.repeat(50),
        content_type: 'text',
        enable_chunking: true,
        auto_index: true
      };

      const document = await knowledgeService.createKnowledgeDocument(docData, testUserId);
      createdDocuments.push(document.id);

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get initial chunks
      const initialChunks = await knowledgeService.getDocumentChunks(document.id);
      expect(initialChunks.length).toBeGreaterThan(0);

      // Regenerate chunks
      const newChunks = await knowledgeService.regenerateDocumentChunks(document.id, {
        auto_index: true
      });

      expect(newChunks.length).toBe(initialChunks.length);
      
      // Verify chunks were recreated with new timestamps
      const regeneratedChunks = await knowledgeService.getDocumentChunks(document.id);
      expect(regeneratedChunks.length).toBe(initialChunks.length);
    });

    test('should delete chunks when document is deleted', async () => {
      const docData = {
        title: 'Deletion Test Document',
        content: 'Content for deletion testing. '.repeat(30),
        content_type: 'text',
        enable_chunking: true,
        auto_index: true
      };

      const document = await knowledgeService.createKnowledgeDocument(docData, testUserId);
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify chunks exist
      const chunks = await knowledgeService.getDocumentChunks(document.id);
      expect(chunks.length).toBeGreaterThan(0);

      // Delete document
      const deleted = await knowledgeService.deleteKnowledgeDocument(document.id);
      expect(deleted).toBe(true);

      // Verify chunks are deleted (cascade delete)
      const remainingChunks = await knowledgeService.getDocumentChunks(document.id);
      expect(remainingChunks.length).toBe(0);

      // Remove from cleanup array since already deleted
      createdDocuments = createdDocuments.filter(id => id !== document.id);
    });
  });

  describe('Performance and Quality Metrics', () => {
    test('should track chunking performance', async () => {
      const perfTestDoc = {
        title: 'Performance Test Document',
        content: 'Performance testing content. '.repeat(100), // ~2500 chars
        content_type: 'text',
        enable_chunking: true,
        auto_index: true
      };

      const startTime = Date.now();
      const document = await knowledgeService.createKnowledgeDocument(perfTestDoc, testUserId);
      createdDocuments.push(document.id);

      await new Promise(resolve => setTimeout(resolve, 3000));

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete within reasonable time (under 10 seconds)
      expect(processingTime).toBeLessThan(10000);

      const chunks = await knowledgeService.getDocumentChunks(document.id);
      expect(chunks.length).toBeGreaterThan(1);

      console.log(`[FAST] Document processed in ${processingTime}ms with ${chunks.length} chunks`);
    });

    test('should maintain search quality with chunks vs documents', async () => {
      // This test compares search quality between chunk-level and document-level search
      const testQuery = 'JavaScript functions and methods';
      
      // Get both chunk and document results
      const chunkResults = await knowledgeService.searchChunks(testQuery, {
        user_id: testUserId,
        limit: 5
      });

      const ragResults = await langchainRAGService.enhancedRAGSearch(testQuery, {
        topK: 5,
        useReranking: true
      });

      if (chunkResults.length > 0 && ragResults.results.length > 0) {
        // Both should return relevant results
        expect(chunkResults[0].similarity_score).toBeGreaterThan(0.5);
        expect(ragResults.results[0].similarity).toBeGreaterThan(0.5);

        console.log(`[DATA] Chunk search: ${chunkResults.length} results, top score: ${chunkResults[0].similarity_score.toFixed(3)}`);
        console.log(`[DATA] RAG search: ${ragResults.results.length} results, top score: ${ragResults.results[0].similarity.toFixed(3)}`);
      }
    });
  });

  afterAll(async () => {
    console.log('[TEST] Enhanced Knowledge Service Integration Tests Completed');
  });
});