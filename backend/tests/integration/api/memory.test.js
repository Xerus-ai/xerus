/**
 * Integration Tests for Memory API Endpoints
 * Tests memory service endpoints for conversation history and context
 */

const request = require('supertest');
const app = require('../../../server');

// Mock memory service
jest.mock('../../../services/memoryService', () => ({
  storeConversationMemory: jest.fn(),
  retrieveConversationMemory: jest.fn(),
  getMemoryStats: jest.fn(),
  clearMemory: jest.fn(),
  getMemoryPatterns: jest.fn(),
  updateMemoryConfig: jest.fn(),
  healthCheck: jest.fn()
}));

const memoryService = require('../../../services/memoryService');

describe('Memory API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/memory/conversations/:id', () => {
    it('should store conversation memory', async () => {
      const memoryData = {
        session_id: 'session-123',
        user_input: 'Hello, how are you?',
        ai_response: 'I am doing well, thank you!',
        context: { mood: 'friendly' }
      };

      memoryService.storeConversationMemory.mockResolvedValue({
        id: 'memory-456',
        ...memoryData
      });

      const response = await request(app)
        .post('/api/v1/memory/conversations/session-123')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .send(memoryData)
        .expect(201);

      expect(response.body).toHaveProperty('id', 'memory-456');
      expect(memoryService.storeConversationMemory).toHaveBeenCalledWith(
        'user-123',
        'session-123',
        memoryData
      );
    });

    it('should validate required fields', async () => {
      const invalidData = {
        session_id: 'session-123'
        // Missing user_input and ai_response
      };

      const response = await request(app)
        .post('/api/v1/memory/conversations/session-123')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/memory/conversations/session-123')
        .send({})
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/memory/conversations/:id', () => {
    it('should retrieve conversation memory', async () => {
      const mockMemory = {
        working_memory: [
          { type: 'conversation', content: 'Recent exchange' }
        ],
        episodic_memory: [
          { type: 'event', content: 'User preference learned' }
        ],
        semantic_memory: [
          { type: 'fact', content: 'User likes coffee' }
        ],
        procedural_memory: [
          { type: 'pattern', content: 'User asks for help' }
        ]
      };

      memoryService.retrieveConversationMemory.mockResolvedValue(mockMemory);

      const response = await request(app)
        .get('/api/v1/memory/conversations/session-123')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .expect(200);

      expect(response.body).toEqual(mockMemory);
      expect(memoryService.retrieveConversationMemory).toHaveBeenCalledWith(
        'user-123',
        'session-123'
      );
    });

    it('should handle memory retrieval with context limit', async () => {
      const mockMemory = {
        working_memory: [],
        episodic_memory: [],
        semantic_memory: [],
        procedural_memory: []
      };

      memoryService.retrieveConversationMemory.mockResolvedValue(mockMemory);

      const response = await request(app)
        .get('/api/v1/memory/conversations/session-123?limit=10')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .expect(200);

      expect(response.body).toEqual(mockMemory);
      expect(memoryService.retrieveConversationMemory).toHaveBeenCalledWith(
        'user-123',
        'session-123',
        { limit: 10 }
      );
    });

    it('should return empty memory for non-existent conversation', async () => {
      memoryService.retrieveConversationMemory.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/memory/conversations/non-existent')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Memory not found');
    });
  });

  describe('GET /api/v1/memory/stats', () => {
    it('should return memory statistics', async () => {
      const mockStats = {
        total_conversations: 150,
        total_memories: 1250,
        memory_types: {
          working: 300,
          episodic: 400,
          semantic: 350,
          procedural: 200
        },
        patterns_discovered: 25,
        memory_evolution_count: 15,
        storage_size_mb: 45.2
      };

      memoryService.getMemoryStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/v1/memory/stats')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .expect(200);

      expect(response.body).toEqual(mockStats);
      expect(memoryService.getMemoryStats).toHaveBeenCalledWith('user-123');
    });

    it('should return global stats for admin users', async () => {
      const mockGlobalStats = {
        total_users: 50,
        total_conversations: 1500,
        total_memories: 15000,
        average_memories_per_user: 300
      };

      memoryService.getMemoryStats.mockResolvedValue(mockGlobalStats);

      const response = await request(app)
        .get('/api/v1/memory/stats?global=true')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'admin_user')
        .expect(200);

      expect(response.body).toEqual(mockGlobalStats);
    });
  });

  describe('DELETE /api/v1/memory/conversations/:id', () => {
    it('should clear conversation memory', async () => {
      memoryService.clearMemory.mockResolvedValue({
        deleted_memories: 25,
        conversation_id: 'session-123'
      });

      const response = await request(app)
        .delete('/api/v1/memory/conversations/session-123')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .expect(200);

      expect(response.body).toHaveProperty('deleted_memories', 25);
      expect(memoryService.clearMemory).toHaveBeenCalledWith(
        'user-123',
        'session-123'
      );
    });

    it('should handle clearing all user memory', async () => {
      memoryService.clearMemory.mockResolvedValue({
        deleted_memories: 500,
        user_id: 'user-123'
      });

      const response = await request(app)
        .delete('/api/v1/memory/conversations/all')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .expect(200);

      expect(response.body).toHaveProperty('deleted_memories', 500);
    });
  });

  describe('GET /api/v1/memory/patterns', () => {
    it('should return discovered memory patterns', async () => {
      const mockPatterns = [
        {
          pattern_type: 'user_preference',
          pattern: 'Prefers concise responses',
          confidence: 0.85,
          occurrences: 15
        },
        {
          pattern_type: 'conversation_flow',
          pattern: 'Asks follow-up questions',
          confidence: 0.92,
          occurrences: 22
        }
      ];

      memoryService.getMemoryPatterns.mockResolvedValue(mockPatterns);

      const response = await request(app)
        .get('/api/v1/memory/patterns')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .expect(200);

      expect(response.body).toEqual(mockPatterns);
      expect(memoryService.getMemoryPatterns).toHaveBeenCalledWith('user-123');
    });

    it('should filter patterns by type', async () => {
      const mockPatterns = [
        {
          pattern_type: 'user_preference',
          pattern: 'Likes technical details',
          confidence: 0.78
        }
      ];

      memoryService.getMemoryPatterns.mockResolvedValue(mockPatterns);

      const response = await request(app)
        .get('/api/v1/memory/patterns?type=user_preference')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .expect(200);

      expect(response.body).toEqual(mockPatterns);
    });
  });

  describe('PUT /api/v1/memory/config', () => {
    it('should update memory configuration', async () => {
      const newConfig = {
        working_memory_limit: 20,
        episodic_memory_retention_days: 30,
        pattern_discovery_threshold: 0.8
      };

      memoryService.updateMemoryConfig.mockResolvedValue(newConfig);

      const response = await request(app)
        .put('/api/v1/memory/config')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .send(newConfig)
        .expect(200);

      expect(response.body).toEqual(newConfig);
      expect(memoryService.updateMemoryConfig).toHaveBeenCalledWith(
        'user-123',
        newConfig
      );
    });

    it('should validate configuration values', async () => {
      const invalidConfig = {
        working_memory_limit: -5,  // Invalid negative value
        pattern_discovery_threshold: 1.5  // Invalid threshold > 1
      };

      const response = await request(app)
        .put('/api/v1/memory/config')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-123')
        .send(invalidConfig)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/memory/health', () => {
    it('should return memory service health status', async () => {
      const healthStatus = {
        status: 'healthy',
        memory_types_active: 4,
        pattern_discovery_active: true,
        memory_evolution_active: true,
        storage_available: true
      };

      memoryService.healthCheck.mockResolvedValue(healthStatus);

      const response = await request(app)
        .get('/api/v1/memory/health')
        .expect(200);

      expect(response.body).toEqual(healthStatus);
    });
  });
});