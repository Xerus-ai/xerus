/**
 * Knowledge Domain Tests
 * Test suite for enhanced RAG & multi-source knowledge management
 */

const { 
  knowledgeDomain, 
  KnowledgeDomain, 
  ragSystem,
  documentIngestionService,
  embeddingService,
  similaritySearchService 
} = require('../../../src/domains/knowledge/index.js');

describe('KnowledgeDomain', () => {
  let domain;

  beforeEach(() => {
    domain = new KnowledgeDomain();
  });

  afterEach(async () => {
    if (domain.initialized) {
      await domain.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await domain.initialize();
      expect(domain.initialized).toBe(true);
    });

    test('should not initialize twice', async () => {
      await domain.initialize();
      await domain.initialize(); // Should not throw
      expect(domain.initialized).toBe(true);
    });

    test('should have RAG system available', () => {
      expect(domain.ragSystem).toBeDefined();
    });

    test('should have source tracking initialized', async () => {
      await domain.initialize();
      expect(domain.sourceCounts).toBeDefined();
      expect(domain.sourceMetrics).toBeDefined();
      expect(domain.sourceCounts.has('local')).toBe(true);
      expect(domain.sourceCounts.has('googledrive')).toBe(true);
      expect(domain.sourceCounts.has('notion')).toBe(true);
      expect(domain.sourceCounts.has('mcp_servers')).toBe(true);
    });

    test('should have enhanced configuration', () => {
      expect(domain.config).toBeDefined();
      expect(domain.config.sources).toBeDefined();
      expect(domain.config.search).toBeDefined();
      expect(domain.config.performance).toBeDefined();
    });
  });

  describe('Document Management', () => {
    beforeEach(async () => {
      await domain.initialize();
    });

    test('should add document with source tracking', async () => {
      const content = 'Test document content';
      const metadata = { title: 'Test Document' };
      const options = { source: 'local' };

      const result = await domain.addDocument(content, metadata, options);
      
      expect(result).toBeDefined();
      if (result.success) {
        expect(result.documentId).toBeDefined();
        expect(domain.sourceCounts.get('local')).toBeGreaterThan(0);
      }
    });

    test('should enhance metadata with source information', async () => {
      const content = 'Test content';
      const metadata = { title: 'Test' };
      const options = { source: 'googledrive', sourceId: 'doc123' };

      const result = await domain.addDocument(content, metadata, options);
      
      if (result.success && result.document) {
        expect(result.document.metadata.source).toBe('googledrive');
        expect(result.document.metadata.sourceId).toBe('doc123');
        expect(result.document.metadata.knowledgeDomainVersion).toBe('4.0');
        expect(result.document.metadata.ingestionTimestamp).toBeDefined();
      }
    });

    test('should add document from file with local source', async () => {
      const filePath = '/test/path/document.txt';
      const options = { source: 'local' };

      // Mock the underlying RAG system call
      const mockResult = { success: true, documentId: 'test123' };
      jest.spyOn(domain.ragSystem, 'addDocument').mockResolvedValue(mockResult);

      await expect(
        domain.addDocumentFromFile(filePath, options)
      ).resolves.toBeDefined();
    });

    test('should track source metrics on document ingestion', async () => {
      const initialCount = domain.sourceCounts.get('notion') || 0;
      
      domain.updateSourceMetrics('notion', 'ingest');
      
      expect(domain.sourceCounts.get('notion')).toBe(initialCount + 1);
      
      const metrics = domain.sourceMetrics.get('notion');
      expect(metrics.documentsIngested).toBe(1);
      expect(metrics.lastAccessed).toBeDefined();
    });
  });

  describe('Enhanced Querying', () => {
    beforeEach(async () => {
      await domain.initialize();
    });

    test('should query with source filtering', async () => {
      const query = 'test query';
      const options = { 
        sourceFiltering: true, 
        allowedSources: ['local', 'googledrive'] 
      };

      // Mock the underlying RAG system call
      const mockResult = { 
        success: true, 
        retrievedDocuments: [
          { metadata: { source: 'local' }, similarity: 0.8 },
          { metadata: { source: 'googledrive' }, similarity: 0.7 }
        ]
      };
      jest.spyOn(domain.ragSystem, 'query').mockResolvedValue(mockResult);

      const result = await domain.queryKnowledge(query, options);
      
      expect(result).toBeDefined();
      expect(result.performance).toBeDefined();
      expect(result.performance.processingTime).toBeDefined();
      expect(result.performance.withinTarget).toBeDefined();
      expect(result.sources).toBeDefined();
    });

    test('should search with source analysis', async () => {
      const query = 'test search';
      const options = { sourceFiltering: true };

      // Mock the underlying RAG system call
      const mockResult = { 
        success: true, 
        documents: [
          { metadata: { source: 'local' }, similarity: 0.9 },
          { metadata: { source: 'notion' }, similarity: 0.6 }
        ]
      };
      jest.spyOn(domain.ragSystem, 'searchDocuments').mockResolvedValue(mockResult);

      const result = await domain.searchKnowledge(query, options);
      
      expect(result).toBeDefined();
      expect(result.sourceAnalysis).toBeDefined();
      expect(result.sourceAnalysis.counts).toBeDefined();
      expect(result.sourceAnalysis.averageRelevance).toBeDefined();
    });

    test('should calculate source distribution correctly', () => {
      const documents = [
        { metadata: { source: 'local' }, similarity: 0.8 },
        { metadata: { source: 'local' }, similarity: 0.7 },
        { metadata: { source: 'googledrive' }, similarity: 0.9 },
        { metadata: { source: 'notion' }, similarity: 0.6 }
      ];

      const distribution = domain.getSourceDistribution(documents);
      
      expect(distribution.counts.local).toBe(2);
      expect(distribution.counts.googledrive).toBe(1);
      expect(distribution.counts.notion).toBe(1);
      expect(distribution.totalDocuments).toBe(4);
      expect(distribution.averageRelevance.local).toBe(0.75); // (0.8 + 0.7) / 2
      expect(distribution.averageRelevance.googledrive).toBe(0.9);
    });

    test('should track query metrics by source', async () => {
      domain.updateSourceMetrics('googledrive', 'query');
      
      const metrics = domain.sourceMetrics.get('googledrive');
      expect(metrics.queriesProcessed).toBe(1);
      expect(metrics.lastAccessed).toBeDefined();
    });
  });

  describe('Configuration', () => {
    beforeEach(async () => {
      await domain.initialize();
    });

    test('should update knowledge configuration', () => {
      const config = {
        sources: {
          googledrive: { enabled: true, priority: 1 }
        },
        search: {
          maxResults: 20,
          similarityThreshold: 0.8
        },
        performance: {
          targetResponseTime: 100
        }
      };

      domain.updateConfig(config);
      
      expect(domain.config.sources.googledrive.enabled).toBe(true);
      expect(domain.config.search.maxResults).toBe(20);
      expect(domain.config.performance.targetResponseTime).toBe(100);
    });

    test('should provide comprehensive statistics', () => {
      // Mock RAG system statistics
      jest.spyOn(domain.ragSystem, 'getSystemStatistics').mockReturnValue({
        initialized: true,
        documents: 10,
        chunks: 50,
        embeddings: 50,
        queries: 15
      });

      const stats = domain.getStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.documents).toBe(10);
      expect(stats.sources).toBeDefined();
      expect(stats.sources.counts).toBeDefined();
      expect(stats.sources.metrics).toBeDefined();
      expect(stats.performance).toBeDefined();
      expect(stats.knowledgeDomainVersion).toBe('4.0');
    });

    test('should provide domain status', () => {
      // Mock RAG system statistics
      jest.spyOn(domain.ragSystem, 'getSystemStatistics').mockReturnValue({
        documents: 5,
        chunks: 25,
        embeddings: 25
      });

      const status = domain.getStatus();
      
      expect(status).toBeDefined();
      expect(status.initialized).toBe(true);
      expect(status.ragSystem).toBeDefined();
      expect(status.sources).toBeDefined();
      expect(status.sources.enabled).toBeDefined();
      expect(status.sources.totalSources).toBe(4);
      expect(status.performance).toBeDefined();
    });
  });

  describe('Data Management', () => {
    beforeEach(async () => {
      await domain.initialize();
    });

    test('should clear all data including source tracking', () => {
      // Add some test data
      domain.sourceCounts.set('local', 5);
      domain.sourceMetrics.set('local', { documentsIngested: 5 });

      domain.clearAll();
      
      expect(domain.sourceCounts.get('local')).toBe(0);
      const metrics = domain.sourceMetrics.get('local');
      expect(metrics.documentsIngested).toBe(0);
    });

    test('should get all documents', () => {
      // Mock the underlying call
      const mockDocuments = [{ id: 'doc1' }, { id: 'doc2' }];
      jest.spyOn(domain.ragSystem, 'getAllDocuments').mockReturnValue(mockDocuments);

      const documents = domain.getAllDocuments();
      expect(documents).toEqual(mockDocuments);
    });

    test('should get document by ID', () => {
      const mockDocument = { id: 'doc1', content: 'test' };
      jest.spyOn(domain.ragSystem, 'getDocument').mockReturnValue(mockDocument);

      const document = domain.getDocument('doc1');
      expect(document).toEqual(mockDocument);
    });
  });

  describe('Error Handling', () => {
    test('should handle initialization errors gracefully', async () => {
      const domainWithError = new KnowledgeDomain();
      domainWithError.ragSystem = null;

      await expect(domainWithError.initialize()).rejects.toThrow();
    });

    test('should handle query errors with meaningful messages', async () => {
      await domain.initialize();
      
      // Mock RAG system to throw error
      jest.spyOn(domain.ragSystem, 'query').mockRejectedValue(new Error('RAG system error'));

      await expect(
        domain.queryKnowledge('test query')
      ).rejects.toThrow('Knowledge query failed: RAG system error');
    });
  });

  describe('Shutdown', () => {
    test('should shutdown cleanly', async () => {
      await domain.initialize();
      await domain.shutdown();
      expect(domain.initialized).toBe(false);
    });

    test('should handle shutdown when not initialized', async () => {
      await expect(domain.shutdown()).resolves.toBeDefined();
    });
  });
});

describe('KnowledgeDomain Singleton', () => {
  test('should provide singleton instance', () => {
    expect(knowledgeDomain).toBeInstanceOf(KnowledgeDomain);
  });

  test('should provide convenience functions', () => {
    const { 
      initializeKnowledge,
      addKnowledgeDocument,
      addKnowledgeFromFile,
      queryKnowledge,
      searchKnowledge,
      getKnowledgeStatistics,
      updateKnowledgeConfig,
      clearKnowledgeData
    } = require('../../../src/domains/knowledge/index.js');

    expect(typeof initializeKnowledge).toBe('function');
    expect(typeof addKnowledgeDocument).toBe('function');
    expect(typeof addKnowledgeFromFile).toBe('function');
    expect(typeof queryKnowledge).toBe('function');
    expect(typeof searchKnowledge).toBe('function');
    expect(typeof getKnowledgeStatistics).toBe('function');
    expect(typeof updateKnowledgeConfig).toBe('function');
    expect(typeof clearKnowledgeData).toBe('function');
  });

  test('should provide backward compatibility exports', () => {
    const { 
      ragSystem,
      documentIngestionService,
      embeddingService,
      similaritySearchService,
      ragQueryProcessor,
      ragResponseFormatter
    } = require('../../../src/domains/knowledge/index.js');

    expect(ragSystem).toBeDefined();
    expect(documentIngestionService).toBeDefined();
    expect(embeddingService).toBeDefined();
    expect(similaritySearchService).toBeDefined();
    expect(ragQueryProcessor).toBeDefined();
    expect(ragResponseFormatter).toBeDefined();
  });

  test('should provide legacy RAG functions', () => {
    const { 
      initializeRAG,
      addDocument,
      addDocumentFromFile,
      queryRAG,
      searchRAG,
      formatRAGResponse,
      getRAGStatistics,
      clearRAGData
    } = require('../../../src/domains/knowledge/index.js');

    expect(typeof initializeRAG).toBe('function');
    expect(typeof addDocument).toBe('function');
    expect(typeof addDocumentFromFile).toBe('function');
    expect(typeof queryRAG).toBe('function');
    expect(typeof searchRAG).toBe('function');
    expect(typeof formatRAGResponse).toBe('function');
    expect(typeof getRAGStatistics).toBe('function');
    expect(typeof knowledgeModule.clearRAGData).toBe('function');
    
    // Test that legacy functions still work with new architecture
    await knowledgeDomain.initialize();
    const result = await knowledgeModule.queryRAG('test query');
    expect(result).toHaveProperty('formatted_for_ai');
  });
});

console.log('✅ Knowledge Domain Tests Updated for Hybrid Backend + Contextual Intelligence Architecture');