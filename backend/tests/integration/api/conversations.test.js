/**
 * Integration Tests for Conversations API Endpoints
 * Tests conversation management for both guest and authenticated users using PostgreSQL
 */

const request = require('supertest');
const app = require('../../../server');

// Mock PostgreSQL database
jest.mock('../../../database/connections/neon', () => ({
  neonDB: {
    query: jest.fn()
  }
}));

const { neonDB } = require('../../../database/connections/neon');

describe('Conversations API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/conversations', () => {
    it('should return conversations from PostgreSQL', async () => {
      const mockConversations = [
        { 
          id: 'conv-1', 
          user_id: 'user-123',
          title: 'Test Conversation 1', 
          agent_type: 'general',
          metadata: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { 
          id: 'conv-2', 
          user_id: 'user-123',
          title: 'Test Conversation 2', 
          agent_type: 'general',
          metadata: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      neonDB.query.mockResolvedValue({ rows: mockConversations });

      const response = await request(app)
        .get('/api/v1/conversations')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(neonDB.query).toHaveBeenCalled();
    });

    it('should return empty array when no conversations exist', async () => {
      neonDB.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/v1/conversations')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should handle conversations for authenticated users', async () => {
      neonDB.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/v1/conversations')
        .set('Authorization', 'Bearer development_token')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
    });

    it('should respect limit parameter', async () => {
      neonDB.query.mockResolvedValue({ rows: [] });

      await request(app)
        .get('/api/v1/conversations?limit=10')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([expect.any(String), 10])
      );
    });
  });

  describe('POST /api/v1/conversations', () => {
    it('should create conversation for guest user', async () => {
      const newConversation = { id: 1, title: 'New Conversation' };
      
      guestDataService.getGuestUser.mockResolvedValue({ id: 'guest-123' });
      guestDataService.createConversation.mockResolvedValue(newConversation);

      const response = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', 'guest')
        .set('X-Guest-Session', 'test-session')
        .send({ title: 'New Conversation' })
        .expect(201);

      expect(response.body).toEqual(newConversation);
      expect(guestDataService.createConversation).toHaveBeenCalledWith(
        'guest-123',
        expect.objectContaining({ title: 'New Conversation' })
      );
    });

    it('should create conversation for authenticated user', async () => {
      const response = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .send({ title: 'Auth User Conversation' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
    });

    it('should validate required title', async () => {
      guestDataService.getGuestUser.mockResolvedValue({ id: 'guest-123' });

      const response = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', 'guest')
        .set('X-Guest-Session', 'test-session')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/conversations/:id', () => {
    it('should get conversation details for guest user', async () => {
      const conversationDetails = {
        id: 1,
        title: 'Test Conversation',
        transcripts: [],
        ai_messages: [],
        summary: null
      };

      guestDataService.getGuestUser.mockResolvedValue({ id: 'guest-123' });
      guestDataService.getConversationDetails.mockResolvedValue(conversationDetails);

      const response = await request(app)
        .get('/api/v1/conversations/1')
        .set('Authorization', 'guest')
        .set('X-Guest-Session', 'test-session')
        .expect(200);

      expect(response.body).toEqual(conversationDetails);
    });

    it('should return 404 for non-existent conversation', async () => {
      guestDataService.getGuestUser.mockResolvedValue({ id: 'guest-123' });
      guestDataService.getConversationDetails.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/conversations/999')
        .set('Authorization', 'guest')
        .set('X-Guest-Session', 'test-session')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/v1/conversations/:id', () => {
    it('should delete conversation for guest user', async () => {
      guestDataService.getGuestUser.mockResolvedValue({ id: 'guest-123' });
      guestDataService.deleteConversation.mockResolvedValue();

      const response = await request(app)
        .delete('/api/v1/conversations/1')
        .set('Authorization', 'guest')
        .set('X-Guest-Session', 'test-session')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(guestDataService.deleteConversation).toHaveBeenCalledWith('guest-123', '1');
    });

    it('should delete conversation for authenticated user', async () => {
      const response = await request(app)
        .delete('/api/v1/conversations/1')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /api/v1/conversations/search', () => {
    it('should search conversations for guest user', async () => {
      const searchResults = [
        { id: 1, title: 'Test Result', relevance: 0.9 }
      ];

      guestDataService.getGuestUser.mockResolvedValue({ id: 'guest-123' });
      guestDataService.searchConversations.mockResolvedValue(searchResults);

      const response = await request(app)
        .get('/api/v1/conversations/search?q=test')
        .set('Authorization', 'guest')
        .set('X-Guest-Session', 'test-session')
        .expect(200);

      expect(response.body).toEqual(searchResults);
      expect(guestDataService.searchConversations).toHaveBeenCalledWith(
        'guest-123',
        'test'
      );
    });

    it('should require search query', async () => {
      const response = await request(app)
        .get('/api/v1/conversations/search')
        .set('Authorization', 'guest')
        .set('X-Guest-Session', 'test-session')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});