/**
 * Unit Tests for KnowledgeService
 * TDD Implementation - Backend Separation Project
 * Test Agent 🧪
 */

const KnowledgeService = require('../../../services/knowledgeService');
const { neonDB } = require('../../../database/connections/neon');

// Mock database connection
jest.mock('../../../database/connections/neon');

describe('KnowledgeService', () => {
  let knowledgeService;

  beforeEach(() => {
    knowledgeService = new KnowledgeService();
    jest.clearAllMocks();
  });

  describe('getKnowledgeDocuments', () => {
    it('should return list of knowledge documents with default filters', async () => {
      // Arrange - TDD RED Phase
      const mockDocuments = [
        testUtils.createMockKnowledgeDocument(),
        { 
          ...testUtils.createMockKnowledgeDocument(), 
          id: 2, 
          title: 'Advanced JavaScript Concepts',
          content_type: 'markdown'
        }
      ];
      neonDB.query.mockResolvedValue({ rows: mockDocuments });

      // Act - TDD GREEN Phase
      const result = await knowledgeService.getKnowledgeDocuments({});

      // Assert - TDD REFACTOR Phase
      expect(result).toEqual(mockDocuments);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM knowledge_base WHERE 1=1 ORDER BY updated_at DESC LIMIT $1 OFFSET $2'),
        [50, 0]
      );
    });

    it('should filter documents by content type', async () => {
      // Arrange
      const filters = { content_type: 'text' };
      const mockDocuments = [testUtils.createMockKnowledgeDocument()];
      neonDB.query.mockResolvedValue({ rows: mockDocuments });

      // Act
      const result = await knowledgeService.getKnowledgeDocuments(filters);

      // Assert
      expect(result).toEqual(mockDocuments);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM knowledge_base WHERE 1=1 AND content_type = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3'),
        ['text', 50, 0]
      );
    });

    it('should filter documents by indexed status', async () => {
      // Arrange
      const filters = { is_indexed: true };
      const mockDocuments = [testUtils.createMockKnowledgeDocument()];
      neonDB.query.mockResolvedValue({ rows: mockDocuments });

      // Act
      const result = await knowledgeService.getKnowledgeDocuments(filters);

      // Assert
      expect(result).toEqual(mockDocuments);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM knowledge_base WHERE 1=1 AND is_indexed = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3'),
        [true, 50, 0]
      );
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      neonDB.query.mockRejectedValue(dbError);

      // Act & Assert
      await expect(knowledgeService.getKnowledgeDocuments({})).rejects.toThrow('Database connection failed');
    });

    it('should return empty array when no documents found', async () => {
      // Arrange
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await knowledgeService.getKnowledgeDocuments({});

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getKnowledgeDocumentById', () => {
    it('should return document by id', async () => {
      // Arrange
      const documentId = 1;
      const mockDocument = testUtils.createMockKnowledgeDocument();
      neonDB.query.mockResolvedValue({ rows: [mockDocument] });

      // Act
      const result = await knowledgeService.getKnowledgeDocumentById(documentId);

      // Assert
      expect(result).toEqual(mockDocument);
      expect(neonDB.query).toHaveBeenCalledWith(
        'SELECT * FROM knowledge_base WHERE id = $1',
        [documentId]
      );
    });

    it('should return null when document not found', async () => {
      // Arrange
      const documentId = 999;
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await knowledgeService.getKnowledgeDocumentById(documentId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('createKnowledgeDocument', () => {
    it('should create new knowledge document successfully', async () => {
      // Arrange
      const documentData = {
        title: 'New Knowledge Document',
        content: 'This is comprehensive knowledge about machine learning algorithms and their applications.',
        content_type: 'text'
      };
      
      // Calculate expected word and character counts like the service does
      const expectedWordCount = documentData.content.split(/\s+/).filter(word => word.length > 0).length; // 11 words
      const expectedCharCount = documentData.content.length; // 89 characters
      
      const mockCreatedDocument = { 
        ...testUtils.createMockKnowledgeDocument(), 
        ...documentData, 
        id: 3,
        word_count: expectedWordCount,
        character_count: expectedCharCount
      };
      neonDB.query.mockResolvedValue({ rows: [mockCreatedDocument] });

      // Act
      const result = await knowledgeService.createKnowledgeDocument(documentData);

      // Assert
      expect(result).toEqual(mockCreatedDocument);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO knowledge_base'),
        [
          documentData.title,
          documentData.content,
          documentData.content_type,
          null, // source_url
          null, // file_path
          '[]', // tags (JSON string)
          '{}', // metadata (JSON string)
          expectedWordCount,
          expectedCharCount
        ]
      );
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidDocumentData = {
        content: 'Content without title'
        // Missing required 'title' field
      };

      // Act & Assert
      await expect(knowledgeService.createKnowledgeDocument(invalidDocumentData)).rejects.toThrow('Title is required');
    });

    it('should validate content type enum', async () => {
      // Arrange
      const invalidDocumentData = {
        title: 'Test Document',
        content: 'Test content',
        content_type: 'invalid_type'
      };

      // Act & Assert
      await expect(knowledgeService.createKnowledgeDocument(invalidDocumentData)).rejects.toThrow('Invalid content type');
    });

    it('should calculate word and character counts', async () => {
      // Arrange
      const documentData = {
        title: 'Word Count Test',
        content: 'This is a test document with exactly ten words.',
        content_type: 'text'
      };
      
      // Calculate actual word and character counts
      const expectedWordCount = documentData.content.split(/\s+/).filter(word => word.length > 0).length; // 9 words
      const expectedCharCount = documentData.content.length; // 47 characters
      
      neonDB.query.mockResolvedValue({ 
        rows: [{ 
          ...testUtils.createMockKnowledgeDocument(), 
          ...documentData,
          word_count: expectedWordCount,
          character_count: expectedCharCount
        }] 
      });

      // Act
      await knowledgeService.createKnowledgeDocument(documentData);

      // Assert
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO knowledge_base'),
        [
          documentData.title,
          documentData.content,
          documentData.content_type,
          null, // source_url
          null, // file_path
          '[]', // tags (JSON string)
          '{}', // metadata (JSON string)
          expectedWordCount,
          expectedCharCount
        ]
      );
    });
  });

  describe('updateKnowledgeDocument', () => {
    it('should update document successfully', async () => {
      // Arrange
      const documentId = 1;
      const updateData = {
        title: 'Updated Document Title',
        content: 'Updated content with more information.'
      };
      const mockUpdatedDocument = { 
        ...testUtils.createMockKnowledgeDocument(), 
        ...updateData,
        updated_at: '2025-01-21T11:00:00Z',
        word_count: 6,
        character_count: 41
      };
      neonDB.query.mockResolvedValue({ rows: [mockUpdatedDocument] });

      // Act
      const result = await knowledgeService.updateKnowledgeDocument(documentId, updateData);

      // Assert
      expect(result).toEqual(mockUpdatedDocument);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE knowledge_base SET'),
        expect.arrayContaining([
          updateData.title, 
          updateData.content, 
          6, // word_count
          41, // character_count
          documentId
        ])
      );
    });

    it('should return null when document not found', async () => {
      // Arrange
      const documentId = 999;
      const updateData = { title: 'Updated Title' };
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await knowledgeService.updateKnowledgeDocument(documentId, updateData);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('deleteKnowledgeDocument', () => {
    it('should delete document successfully', async () => {
      // Arrange
      const documentId = 1;
      neonDB.query.mockResolvedValue({ rowCount: 1 });

      // Act
      const result = await knowledgeService.deleteKnowledgeDocument(documentId);

      // Assert
      expect(result).toBe(true);
      expect(neonDB.query).toHaveBeenCalledWith(
        'DELETE FROM knowledge_base WHERE id = $1',
        [documentId]
      );
    });

    it('should return false when document not found', async () => {
      // Arrange
      const documentId = 999;
      neonDB.query.mockResolvedValue({ rowCount: 0 });

      // Act
      const result = await knowledgeService.deleteKnowledgeDocument(documentId);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle cascade delete for related queries', async () => {
      // Arrange
      const documentId = 1;
      neonDB.query
        .mockResolvedValueOnce({ rowCount: 5 }) // Delete knowledge_queries
        .mockResolvedValueOnce({ rowCount: 3 }) // Delete agent_knowledge_access
        .mockResolvedValueOnce({ rowCount: 1 }); // Delete document

      // Act
      const result = await knowledgeService.deleteKnowledgeDocument(documentId);

      // Assert
      expect(result).toBe(true);
      expect(neonDB.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('searchKnowledge', () => {
    it('should perform basic text search in knowledge base', async () => {
      // Arrange
      const query = 'machine learning';
      const searchOptions = { limit: 5 };
      const mockResults = [
        { 
          ...testUtils.createMockKnowledgeDocument(),
          relevance_score: 0.85,
          snippet: 'Machine learning is a powerful technique...'
        },
        { 
          ...testUtils.createMockKnowledgeDocument(),
          id: 2,
          title: 'Advanced ML Techniques',
          relevance_score: 0.72,
          snippet: 'Advanced machine learning algorithms...'
        }
      ];
      
      neonDB.query.mockResolvedValue({ rows: mockResults });

      // Act
      const result = await knowledgeService.searchKnowledge(query, searchOptions);

      // Assert
      expect(result).toEqual(mockResults);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT *, ts_rank_cd(to_tsvector(content), plainto_tsquery($1))'),
        ['machine learning', 5]
      );
    });

    it('should handle empty search query', async () => {
      // Arrange
      const emptyQuery = '';

      // Act & Assert
      await expect(knowledgeService.searchKnowledge(emptyQuery)).rejects.toThrow('Search query cannot be empty');
    });

    it('should apply search filters', async () => {
      // Arrange
      const query = 'javascript';
      const searchOptions = { 
        content_type: 'markdown',
        is_indexed: true,
        limit: 10
      };
      const mockResults = [testUtils.createMockKnowledgeDocument()];
      
      neonDB.query.mockResolvedValue({ rows: mockResults });

      // Act
      const result = await knowledgeService.searchKnowledge(query, searchOptions);

      // Assert
      expect(result).toEqual(mockResults);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE content_type = $2 AND is_indexed = $3'),
        ['javascript', 'markdown', true, 10]
      );
    });

    it('should log search query for analytics', async () => {
      // Arrange
      const query = 'machine learning';
      const searchOptions = {};
      const mockResults = [testUtils.createMockKnowledgeDocument()];
      
      neonDB.query
        .mockResolvedValueOnce({ rows: mockResults }) // Search results
        .mockResolvedValueOnce({ rows: [{ id: 456 }] }); // Log query

      // Act
      await knowledgeService.searchKnowledge(query, searchOptions);

      // Assert
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO knowledge_queries'),
        expect.arrayContaining([query, mockResults.length])
      );
    });

    it('should handle search with no results', async () => {
      // Arrange
      const query = 'nonexistent topic';
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await knowledgeService.searchKnowledge(query);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('reindexDocument', () => {
    it('should reindex document successfully', async () => {
      // Arrange
      const documentId = 1;
      const mockDocument = testUtils.createMockKnowledgeDocument();
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockDocument] }) // Get document
        .mockResolvedValueOnce({ rows: [{ ...mockDocument, is_indexed: true }] }); // Update index

      // Act
      const result = await knowledgeService.reindexDocument(documentId);

      // Assert
      expect(result).toBe(true);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE knowledge_base SET is_indexed = true'),
        [documentId]
      );
    });

    it('should return false when document not found', async () => {
      // Arrange
      const documentId = 999;
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await knowledgeService.reindexDocument(documentId);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('bulkIndexDocuments', () => {
    it('should bulk index multiple documents', async () => {
      // Arrange
      const documentIds = [1, 2, 3];
      
      neonDB.query.mockResolvedValue({ rowCount: 3 });

      // Act
      const result = await knowledgeService.bulkIndexDocuments(documentIds);

      // Assert
      expect(result).toEqual({ indexed_count: 3, total_requested: 3 });
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE knowledge_base SET is_indexed = true WHERE id = ANY($1)'),
        [documentIds]
      );
    });

    it('should handle partial bulk indexing', async () => {
      // Arrange
      const documentIds = [1, 2, 999]; // 999 doesn't exist
      
      neonDB.query.mockResolvedValue({ rowCount: 2 });

      // Act
      const result = await knowledgeService.bulkIndexDocuments(documentIds);

      // Assert
      expect(result).toEqual({ indexed_count: 2, total_requested: 3 });
    });
  });

  describe('getKnowledgeAnalytics', () => {
    it('should return knowledge base analytics', async () => {
      // Arrange
      const mockAnalytics = {
        total_documents: 150,
        indexed_documents: 142,
        total_searches: 1250,
        avg_search_results: 4.2,
        top_search_terms: ['machine learning', 'javascript', 'python'],
        content_type_distribution: {
          text: 85,
          markdown: 45,
          pdf: 20
        }
      };
      
      neonDB.query.mockResolvedValue({ rows: [mockAnalytics] });

      // Act
      const result = await knowledgeService.getKnowledgeAnalytics();

      // Assert
      expect(result).toEqual(mockAnalytics);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as total_documents')
      );
    });

    it('should handle empty knowledge base', async () => {
      // Arrange
      const mockAnalytics = {
        total_documents: 0,
        indexed_documents: 0,
        total_searches: 0,
        avg_search_results: 0,
        top_search_terms: [],
        content_type_distribution: {}
      };
      
      neonDB.query.mockResolvedValue({ rows: [mockAnalytics] });

      // Act
      const result = await knowledgeService.getKnowledgeAnalytics();

      // Assert
      expect(result).toEqual(mockAnalytics);
    });
  });
});