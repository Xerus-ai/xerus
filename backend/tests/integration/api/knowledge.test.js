/**
 * Integration Tests for Knowledge API Endpoints
 * TDD Implementation - Comprehensive API Route Testing
 * Test Agent 🧪
 */

const request = require('supertest');
const app = require('../../../server');
const { neonDB } = require('../../../database/connections/neon');

// Mock database for integration tests
jest.mock('../../../database/connections/neon');

describe('Knowledge API Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    neonDB.query.mockClear();
    neonDB.initialize = jest.fn().mockResolvedValue();
  });

  describe('GET /api/v1/knowledge', () => {
    it('should return list of knowledge documents', async () => {
      // Arrange
      const mockDocuments = [
        testUtils.createMockKnowledgeDocument(),
        { 
          ...testUtils.createMockKnowledgeDocument(), 
          id: 2, 
          title: 'Advanced AI Concepts',
          content_type: 'markdown'
        }
      ];
      neonDB.query.mockResolvedValue({ rows: mockDocuments });

      // Act
      const response = await request(app)
        .get('/api/v1/knowledge')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('title');
      expect(response.body[0]).toHaveProperty('content_type');
    });

    it('should filter documents by content type', async () => {
      // Arrange
      const mockDocuments = [testUtils.createMockKnowledgeDocument()];
      neonDB.query.mockResolvedValue({ rows: mockDocuments });

      // Act
      const response = await request(app)
        .get('/api/v1/knowledge?content_type=text')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      response.body.forEach(doc => {
        expect(doc.content_type).toBe('text');
      });
    });

    it('should support pagination', async () => {
      // Arrange
      const mockDocuments = Array.from({ length: 3 }, (_, i) => ({
        ...testUtils.createMockKnowledgeDocument(),
        id: i + 1,
        title: `Document ${i + 1}`
      }));
      neonDB.query.mockResolvedValue({ rows: mockDocuments });

      // Act
      const response = await request(app)
        .get('/api/v1/knowledge?limit=3&offset=0')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toHaveLength(3);
    });

    it('should require authentication', async () => {
      // Act & Assert
      await request(app)
        .get('/api/v1/knowledge')
        .expect(401);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      neonDB.query.mockRejectedValue(dbError);

      // Act
      const response = await request(app)
        .get('/api/v1/knowledge')
        .set('Authorization', testUtils.createAuthToken())
        .expect(500);

      // Assert
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/knowledge/:id', () => {
    it('should return specific knowledge document by id', async () => {
      // Arrange
      const documentId = 1;
      const mockDocument = testUtils.createMockKnowledgeDocument();
      neonDB.query.mockResolvedValue({ rows: [mockDocument] });

      // Act
      const response = await request(app)
        .get(`/api/v1/knowledge/${documentId}`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toEqual(mockDocument);
      expect(response.body.id).toBe(documentId);
    });

    it('should return 404 when document not found', async () => {
      // Arrange
      const documentId = 999;
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await request(app)
        .get(`/api/v1/knowledge/${documentId}`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(404);
    });

    it('should validate document id parameter', async () => {
      // Arrange
      const invalidId = 'invalid';

      // Act & Assert
      await request(app)
        .get(`/api/v1/knowledge/${invalidId}`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(400);
    });
  });

  describe('POST /api/v1/knowledge', () => {
    it('should create new knowledge document successfully', async () => {
      // Arrange
      const newDocumentData = {
        title: 'New Knowledge Document',
        content: 'This is comprehensive knowledge about machine learning algorithms.',
        content_type: 'text'
      };
      
      const mockCreatedDocument = { 
        ...testUtils.createMockKnowledgeDocument(), 
        ...newDocumentData, 
        id: 3,
        word_count: 11,
        character_count: 89
      };
      neonDB.query.mockResolvedValue({ rows: [mockCreatedDocument] });

      // Act
      const response = await request(app)
        .post('/api/v1/knowledge')
        .set('Authorization', testUtils.createAuthToken())
        .send(newDocumentData)
        .expect(201);

      // Assert
      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(newDocumentData.title);
      expect(response.body.content_type).toBe(newDocumentData.content_type);
      expect(response.body).toHaveProperty('word_count');
      expect(response.body).toHaveProperty('character_count');
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidDocumentData = {
        content: 'Content without title'
        // Missing required 'title' field
      };

      // Act
      const response = await request(app)
        .post('/api/v1/knowledge')
        .set('Authorization', testUtils.createAuthToken())
        .send(invalidDocumentData)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('title');
    });

    it('should validate content type enum', async () => {
      // Arrange
      const invalidDocumentData = {
        title: 'Test Document',
        content: 'Test content',
        content_type: 'invalid_type'
      };

      // Act
      const response = await request(app)
        .post('/api/v1/knowledge')
        .set('Authorization', testUtils.createAuthToken())
        .send(invalidDocumentData)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('content_type');
    });

    it('should handle duplicate document titles', async () => {
      // Arrange
      const duplicateDocumentData = {
        title: 'Existing Document Title',
        content: 'Content'
      };
      
      const duplicateError = new Error('duplicate key value violates unique constraint "knowledge_title_key"');
      neonDB.query.mockRejectedValue(duplicateError);

      // Act
      const response = await request(app)
        .post('/api/v1/knowledge')
        .set('Authorization', testUtils.createAuthToken())
        .send(duplicateDocumentData)
        .expect(409);

      // Assert
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/knowledge/:id', () => {
    it('should update knowledge document successfully', async () => {
      // Arrange
      const documentId = 1;
      const updateData = {
        title: 'Updated Knowledge Document',
        content: 'Updated content with more comprehensive information.'
      };
      
      const mockUpdatedDocument = { 
        ...testUtils.createMockKnowledgeDocument(), 
        ...updateData,
        updated_at: '2025-01-21T11:00:00Z'
      };
      neonDB.query.mockResolvedValue({ rows: [mockUpdatedDocument] });

      // Act
      const response = await request(app)
        .put(`/api/v1/knowledge/${documentId}`)
        .set('Authorization', testUtils.createAuthToken())
        .send(updateData)
        .expect(200);

      // Assert
      expect(response.body.title).toBe(updateData.title);
      expect(response.body.content).toBe(updateData.content);
      expect(response.body.updated_at).toBeTruthy();
    });

    it('should return 404 when updating non-existent document', async () => {
      // Arrange
      const documentId = 999;
      const updateData = { title: 'Updated Document' };
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await request(app)
        .put(`/api/v1/knowledge/${documentId}`)
        .set('Authorization', testUtils.createAuthToken())
        .send(updateData)
        .expect(404);
    });
  });

  describe('DELETE /api/v1/knowledge/:id', () => {
    it('should delete knowledge document successfully', async () => {
      // Arrange
      const documentId = 1;
      neonDB.query.mockResolvedValue({ rowCount: 1 });

      // Act & Assert
      await request(app)
        .delete(`/api/v1/knowledge/${documentId}`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(204);
    });

    it('should return 404 when deleting non-existent document', async () => {
      // Arrange
      const documentId = 999;
      neonDB.query.mockResolvedValue({ rowCount: 0 });

      // Act & Assert
      await request(app)
        .delete(`/api/v1/knowledge/${documentId}`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(404);
    });
  });

  describe('POST /api/v1/knowledge/search', () => {
    it('should perform text search in knowledge base', async () => {
      // Arrange
      const searchQuery = 'machine learning';
      const mockSearchResults = [
        {
          ...testUtils.createMockKnowledgeDocument(),
          relevance_score: 0.95,
          snippet: 'Machine learning is a subset of AI...'
        }
      ];
      neonDB.query.mockResolvedValue({ rows: mockSearchResults });

      // Act
      const response = await request(app)
        .post('/api/v1/knowledge/search')
        .set('Authorization', testUtils.createAuthToken())
        .send({ query: searchQuery })
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body[0]).toHaveProperty('relevance_score');
      expect(response.body[0]).toHaveProperty('snippet');
    });

    it('should validate search query', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/knowledge/search')
        .set('Authorization', testUtils.createAuthToken())
        .send({ query: '' })
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('query');
    });

    it('should support search filters', async () => {
      // Arrange
      const searchQuery = 'artificial intelligence';
      const searchFilters = {
        content_type: 'text',
        is_indexed: true,
        limit: 10
      };
      const mockSearchResults = [testUtils.createMockKnowledgeDocument()];
      neonDB.query.mockResolvedValue({ rows: mockSearchResults });

      // Act
      const response = await request(app)
        .post('/api/v1/knowledge/search')
        .set('Authorization', testUtils.createAuthToken())
        .send({ 
          query: searchQuery,
          ...searchFilters
        })
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/v1/knowledge/:id/reindex', () => {
    it('should reindex knowledge document successfully', async () => {
      // Arrange
      const documentId = 1;
      neonDB.query
        .mockResolvedValueOnce({ rows: [testUtils.createMockKnowledgeDocument()] }) // Check document exists
        .mockResolvedValueOnce({ rowCount: 1 }); // Update document

      // Act
      const response = await request(app)
        .post(`/api/v1/knowledge/${documentId}/reindex`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });

    it('should return 404 when reindexing non-existent document', async () => {
      // Arrange
      const documentId = 999;
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await request(app)
        .post(`/api/v1/knowledge/${documentId}/reindex`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(404);
    });
  });

  describe('GET /api/v1/knowledge/analytics', () => {
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
      
      // Mock multiple queries for analytics
      neonDB.query
        .mockResolvedValueOnce({ rows: [{ 
          total_documents: 150,
          indexed_documents: 142,
          total_searches: 1250,
          avg_search_results: 4.2
        }] })
        .mockResolvedValueOnce({ rows: [
          { query_text: 'machine learning' },
          { query_text: 'javascript' },
          { query_text: 'python' }
        ] })
        .mockResolvedValueOnce({ rows: [
          { content_type: 'text', count: '85' },
          { content_type: 'markdown', count: '45' },
          { content_type: 'pdf', count: '20' }
        ] });

      // Act
      const response = await request(app)
        .get('/api/v1/knowledge/analytics')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('total_documents');
      expect(response.body).toHaveProperty('indexed_documents');
      expect(response.body).toHaveProperty('total_searches');
      expect(response.body).toHaveProperty('top_search_terms');
      expect(response.body).toHaveProperty('content_type_distribution');
      expect(response.body.total_documents).toBe(150);
    });
  });
});