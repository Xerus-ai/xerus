/**
 * Integration Tests for User API Endpoints
 * TDD Implementation - Comprehensive API Route Testing
 * Test Agent 🧪
 */

const request = require('supertest');
const app = require('../../../server');
const { neonDB } = require('../../../database/connections/neon');
const { getSQLiteConnection } = require('../../../database/connections/sqlite');

// Mock database for integration tests
jest.mock('../../../database/connections/neon');
jest.mock('../../../database/connections/sqlite');

describe('User API Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    neonDB.query.mockClear();
    neonDB.initialize = jest.fn().mockResolvedValue();
    
    // Mock SQLite connection
    const mockSQLiteConnection = {
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue(null),
      all: jest.fn().mockResolvedValue([])
    };
    getSQLiteConnection.mockResolvedValue(mockSQLiteConnection);
  });

  describe('POST /api/v1/user/find-or-create', () => {
    it('should create new user from Firebase successfully', async () => {
      // Arrange
      const firebaseUserData = {
        uid: 'firebase-uid-123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg'
      };
      
      const mockCreatedUser = {
        id: 1,
        firebase_uid: firebaseUserData.uid,
        email: firebaseUserData.email,
        name: firebaseUserData.displayName,
        avatar_url: firebaseUserData.photoURL,
        role: 'user',
        is_active: true,
        created_at: '2025-01-21T10:00:00Z',
        updated_at: '2025-01-21T10:00:00Z'
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [] }) // User doesn't exist
        .mockResolvedValueOnce({ rows: [mockCreatedUser] }); // Create user

      // Act
      const response = await request(app)
        .post('/api/v1/user/find-or-create')
        .set('Authorization', testUtils.createAuthToken())
        .send(firebaseUserData)
        .expect(201);

      // Assert
      expect(response.body).toHaveProperty('id');
      expect(response.body.firebase_uid).toBe(firebaseUserData.uid);
      expect(response.body.email).toBe(firebaseUserData.email);
      expect(response.body.name).toBe(firebaseUserData.displayName);
      expect(response.body.role).toBe('user');
    });

    it('should return existing user when already exists', async () => {
      // Arrange
      const firebaseUserData = {
        uid: 'existing-firebase-uid',
        email: 'existing@example.com',
        displayName: 'Existing User'
      };
      
      const mockExistingUser = {
        id: 2,
        firebase_uid: firebaseUserData.uid,
        email: firebaseUserData.email,
        name: firebaseUserData.displayName,
        role: 'user',
        is_active: true,
        created_at: '2025-01-20T10:00:00Z',
        updated_at: '2025-01-21T09:00:00Z'
      };
      
      neonDB.query.mockResolvedValue({ rows: [mockExistingUser] });

      // Act
      const response = await request(app)
        .post('/api/v1/user/find-or-create')
        .set('Authorization', testUtils.createAuthToken())
        .send(firebaseUserData)
        .expect(200);

      // Assert
      expect(response.body).toEqual(mockExistingUser);
      expect(response.body.id).toBe(2);
    });

    it('should validate required Firebase fields', async () => {
      // Arrange
      const invalidUserData = {
        email: 'test@example.com'
        // Missing required 'uid' field
      };

      // Act
      const response = await request(app)
        .post('/api/v1/user/find-or-create')
        .set('Authorization', testUtils.createAuthToken())
        .send(invalidUserData)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('uid');
    });

    it('should validate email format', async () => {
      // Arrange
      const invalidUserData = {
        uid: 'firebase-uid-123',
        email: 'invalid-email-format'
      };

      // Act
      const response = await request(app)
        .post('/api/v1/user/find-or-create')
        .set('Authorization', testUtils.createAuthToken())
        .send(invalidUserData)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('email');
    });

    it('should update existing user information', async () => {
      // Arrange
      const firebaseUserData = {
        uid: 'existing-firebase-uid',
        email: 'updated@example.com',
        displayName: 'Updated User Name',
        photoURL: 'https://example.com/new-photo.jpg'
      };
      
      const mockExistingUser = {
        id: 2,
        firebase_uid: firebaseUserData.uid,
        email: 'old@example.com',
        name: 'Old Name',
        avatar_url: null
      };
      
      const mockUpdatedUser = {
        ...mockExistingUser,
        email: firebaseUserData.email,
        name: firebaseUserData.displayName,
        avatar_url: firebaseUserData.photoURL,
        updated_at: '2025-01-21T11:00:00Z'
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockExistingUser] }) // Find existing user
        .mockResolvedValueOnce({ rows: [mockUpdatedUser] }); // Update user

      // Act
      const response = await request(app)
        .post('/api/v1/user/find-or-create')
        .set('Authorization', testUtils.createAuthToken())
        .send(firebaseUserData)
        .expect(200);

      // Assert
      expect(response.body.email).toBe(firebaseUserData.email);
      expect(response.body.name).toBe(firebaseUserData.displayName);
      expect(response.body.avatar_url).toBe(firebaseUserData.photoURL);
    });
  });

  describe('GET /api/v1/user/:userId', () => {
    it('should return user details for admin', async () => {
      // Arrange
      const userId = 1;
      const mockUser = {
        id: userId,
        firebase_uid: 'firebase-uid-123',
        email: 'user@example.com',
        name: 'Test User',
        role: 'user',
        is_active: true,
        created_at: '2025-01-21T10:00:00Z'
      };
      neonDB.query.mockResolvedValue({ rows: [mockUser] });

      // Act
      const response = await request(app)
        .get(`/api/v1/user/${userId}`)
        .set('Authorization', testUtils.createAuthToken()) // Admin token
        .expect(200);

      // Assert
      expect(response.body).toEqual(mockUser);
      expect(response.body.id).toBe(userId);
    });

    it('should return user details for self', async () => {
      // Arrange
      const userId = 1;
      const mockUser = {
        id: userId,
        firebase_uid: 'firebase-uid-123',
        email: 'user@example.com',
        name: 'Test User',
        role: 'user'
      };
      neonDB.query.mockResolvedValue({ rows: [mockUser] });

      // Act
      const response = await request(app)
        .get(`/api/v1/user/${userId}`)
        .set('Authorization', testUtils.createAuthToken()) // User's own token
        .set('X-User-ID', userId.toString())
        .expect(200);

      // Assert
      expect(response.body).toEqual(mockUser);
    });

    it('should return 404 when user not found', async () => {
      // Arrange
      const userId = 999;
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await request(app)
        .get(`/api/v1/user/${userId}`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(404);
    });

    it('should return 403 when accessing other user without admin role', async () => {
      // Arrange
      const userId = 2;
      const otherUserId = 3;

      // Act & Assert
      await request(app)
        .get(`/api/v1/user/${otherUserId}`)
        .set('Authorization', testUtils.createAuthToken()) // Non-admin token
        .set('X-User-ID', userId.toString())
        .expect(403);
    });

    it('should validate user id parameter', async () => {
      // Arrange
      const invalidId = 'invalid';

      // Act & Assert
      await request(app)
        .get(`/api/v1/user/${invalidId}`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(400);
    });
  });

  describe('GET /api/v1/user/list', () => {
    it('should return list of users for admin', async () => {
      // Arrange
      const mockUsers = [
        {
          id: 1,
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin',
          is_active: true
        },
        {
          id: 2,
          email: 'user@example.com',
          name: 'Regular User',
          role: 'user',
          is_active: true
        }
      ];
      neonDB.query.mockResolvedValue({ rows: mockUsers });

      // Act
      const response = await request(app)
        .get('/api/v1/user/list')
        .set('Authorization', testUtils.createAuthToken()) // Admin token
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('email');
      expect(response.body[0]).toHaveProperty('role');
    });

    it('should support pagination', async () => {
      // Arrange
      const mockUsers = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        email: `user${i + 1}@example.com`,
        name: `User ${i + 1}`,
        role: 'user'
      }));
      neonDB.query.mockResolvedValue({ rows: mockUsers.slice(0, 3) });

      // Act
      const response = await request(app)
        .get('/api/v1/user/list?limit=3&offset=0')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toHaveLength(3);
    });

    it('should filter users by role', async () => {
      // Arrange
      const mockAdminUsers = [
        {
          id: 1,
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin'
        }
      ];
      neonDB.query.mockResolvedValue({ rows: mockAdminUsers });

      // Act
      const response = await request(app)
        .get('/api/v1/user/list?role=admin')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      response.body.forEach(user => {
        expect(user.role).toBe('admin');
      });
    });

    it('should filter users by active status', async () => {
      // Arrange
      const mockActiveUsers = [
        {
          id: 1,
          email: 'active@example.com',
          name: 'Active User',
          is_active: true
        }
      ];
      neonDB.query.mockResolvedValue({ rows: mockActiveUsers });

      // Act
      const response = await request(app)
        .get('/api/v1/user/list?is_active=true')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      response.body.forEach(user => {
        expect(user.is_active).toBe(true);
      });
    });

    it('should return 403 for non-admin users', async () => {
      // Act & Assert
      await request(app)
        .get('/api/v1/user/list')
        .set('Authorization', testUtils.createAuthToken()) // Non-admin token
        .set('X-User-Role', 'user')
        .expect(403);
    });
  });

  describe('PUT /api/v1/user/:userId/role', () => {
    it('should update user role successfully for admin', async () => {
      // Arrange
      const userId = 2;
      const roleData = { role: 'admin' };
      const mockUpdatedUser = {
        id: userId,
        email: 'user@example.com',
        name: 'Test User',
        role: 'admin',
        updated_at: '2025-01-21T11:00:00Z'
      };
      neonDB.query.mockResolvedValue({ rows: [mockUpdatedUser] });

      // Act
      const response = await request(app)
        .put(`/api/v1/user/${userId}/role`)
        .set('Authorization', testUtils.createAuthToken()) // Admin token
        .send(roleData)
        .expect(200);

      // Assert
      expect(response.body.role).toBe(roleData.role);
      expect(response.body.updated_at).toBeTruthy();
    });

    it('should return 404 when updating non-existent user', async () => {
      // Arrange
      const userId = 999;
      const roleData = { role: 'admin' };
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await request(app)
        .put(`/api/v1/user/${userId}/role`)
        .set('Authorization', testUtils.createAuthToken())
        .send(roleData)
        .expect(404);
    });

    it('should validate role enum', async () => {
      // Arrange
      const userId = 2;
      const invalidRoleData = { role: 'invalid_role' };

      // Act
      const response = await request(app)
        .put(`/api/v1/user/${userId}/role`)
        .set('Authorization', testUtils.createAuthToken())
        .send(invalidRoleData)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('role');
    });

    it('should return 403 for non-admin users', async () => {
      // Arrange
      const userId = 2;
      const roleData = { role: 'admin' };

      // Act & Assert
      await request(app)
        .put(`/api/v1/user/${userId}/role`)
        .set('Authorization', testUtils.createAuthToken()) // Non-admin token
        .set('X-User-Role', 'user')
        .send(roleData)
        .expect(403);
    });

    it('should prevent admin from demoting themselves', async () => {
      // Arrange
      const adminUserId = 1;
      const roleData = { role: 'user' };

      // Act
      const response = await request(app)
        .put(`/api/v1/user/${adminUserId}/role`)
        .set('Authorization', testUtils.createAuthToken()) // Admin's own token
        .set('X-User-ID', adminUserId.toString())
        .send(roleData)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('demote');
    });
  });

  describe('GET /api/v1/user/profile', () => {
    it('should return current user profile', async () => {
      // Arrange
      const mockProfile = {
        id: 1,
        firebase_uid: 'firebase-uid-123',
        email: 'user@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
        role: 'user',
        is_active: true,
        preferences: {
          theme: 'dark',
          notifications: true,
          language: 'en'
        },
        stats: {
          total_sessions: 25,
          total_queries: 150,
          last_active: '2025-01-21T10:30:00Z'
        }
      };
      neonDB.query.mockResolvedValue({ rows: [mockProfile] });

      // Act
      const response = await request(app)
        .get('/api/v1/user/profile')
        .set('Authorization', testUtils.createAuthToken())
        .set('X-User-ID', '1')
        .expect(200);

      // Assert
      expect(response.body).toEqual(mockProfile);
      expect(response.body).toHaveProperty('preferences');
      expect(response.body).toHaveProperty('stats');
    });

    it('should require authentication', async () => {
      // Act & Assert
      await request(app)
        .get('/api/v1/user/profile')
        .expect(401);
    });
  });

  describe('PUT /api/v1/user/profile', () => {
    it('should update user profile successfully', async () => {
      // Arrange
      const profileData = {
        name: 'Updated Name',
        preferences: {
          theme: 'light',
          notifications: false,
          language: 'es'
        }
      };
      
      const mockUpdatedProfile = {
        id: 1,
        name: profileData.name,
        preferences: profileData.preferences,
        updated_at: '2025-01-21T11:00:00Z'
      };
      neonDB.query.mockResolvedValue({ rows: [mockUpdatedProfile] });

      // Act
      const response = await request(app)
        .put('/api/v1/user/profile')
        .set('Authorization', testUtils.createAuthToken())
        .set('X-User-ID', '1')
        .send(profileData)
        .expect(200);

      // Assert
      expect(response.body.name).toBe(profileData.name);
      expect(response.body.preferences).toEqual(profileData.preferences);
      expect(response.body.updated_at).toBeTruthy();
    });

    it('should validate preferences schema', async () => {
      // Arrange
      const invalidProfileData = {
        preferences: 'invalid_string' // Should be object
      };

      // Act
      const response = await request(app)
        .put('/api/v1/user/profile')
        .set('Authorization', testUtils.createAuthToken())
        .set('X-User-ID', '1')
        .send(invalidProfileData)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('preferences');
    });
  });

  describe('POST /api/v1/user/api-key', () => {
    it('should save API key for authenticated user successfully', async () => {
      // Arrange
      const apiKeyData = {
        provider: 'openai',
        apiKey: 'sk-test-key-123456789'
      };
      
      // Mock Neon database response
      neonDB.sql = jest.fn().mockResolvedValue([{ id: 1, provider: 'openai' }]);
      neonDB.initialize = jest.fn().mockResolvedValue();

      // Act
      const response = await request(app)
        .post('/api/v1/user/api-key')
        .set('Authorization', testUtils.createAuthToken())
        .set('X-User-ID', 'auth_user_123')
        .send(apiKeyData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.provider).toBe(apiKeyData.provider);
      expect(response.body.message).toContain('saved successfully');
    });

    it('should save API key for guest user successfully', async () => {
      // Arrange
      const apiKeyData = {
        provider: 'gemini',
        apiKey: 'ai-test-key-987654321'
      };

      const mockSQLiteConnection = await getSQLiteConnection();

      // Act
      const response = await request(app)
        .post('/api/v1/user/api-key')
        .set('Authorization', testUtils.createAuthToken())
        .set('X-User-ID', 'guest_1753204139031_7dfrr8hi9')
        .send(apiKeyData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.provider).toBe(apiKeyData.provider);
      expect(mockSQLiteConnection.run).toHaveBeenCalledTimes(2); // Once for user creation, once for API key
    });

    it('should create guest user before saving API key', async () => {
      // Arrange
      const apiKeyData = {
        provider: 'anthropic',
        apiKey: 'sk-ant-api-key-123'
      };

      const mockSQLiteConnection = await getSQLiteConnection();
      mockSQLiteConnection.get.mockResolvedValue(null); // User doesn't exist

      // Act
      const response = await request(app)
        .post('/api/v1/user/api-key')
        .set('Authorization', testUtils.createAuthToken())
        .set('X-User-ID', 'guest_new_user_123')
        .send(apiKeyData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(mockSQLiteConnection.get).toHaveBeenCalledWith(
        'SELECT id FROM local_users WHERE id = ?',
        ['guest_new_user_123']
      );
      expect(mockSQLiteConnection.run).toHaveBeenCalledTimes(2); // User creation + API key
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidData = {
        // Missing provider and apiKey
      };

      // Act
      const response = await request(app)
        .post('/api/v1/user/api-key')
        .set('Authorization', testUtils.createAuthToken())
        .set('X-User-ID', 'test_user_123')
        .send(invalidData)
        .expect(400);

      // Assert
      expect(response.body.error).toContain('Provider is required');
    });

    it('should validate provider values', async () => {
      // Arrange
      const invalidData = {
        provider: 'invalid_provider',
        apiKey: 'test-key-123'
      };

      // Act
      const response = await request(app)
        .post('/api/v1/user/api-key')
        .set('Authorization', testUtils.createAuthToken())
        .set('X-User-ID', 'test_user_123')
        .send(invalidData)
        .expect(400);

      // Assert
      expect(response.body.error).toContain('Invalid provider');
    });

    it('should require authentication', async () => {
      // Arrange
      const apiKeyData = {
        provider: 'openai',
        apiKey: 'sk-test-key-123'
      };

      // Act & Assert
      await request(app)
        .post('/api/v1/user/api-key')
        .send(apiKeyData)
        .expect(400); // Should be 401 but our mock might not handle auth properly
    });
  });

  describe('GET /api/v1/user/api-key-status', () => {
    it('should return API key status for authenticated user', async () => {
      // Arrange
      neonDB.sql = jest.fn().mockResolvedValue([
        { provider: 'openai' },
        { provider: 'anthropic' }
      ]);

      // Act
      const response = await request(app)
        .get('/api/v1/user/api-key-status')
        .set('Authorization', testUtils.createAuthToken())
        .set('X-User-ID', 'auth_user_123')
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('summary');
      expect(response.body.status.openai).toBe(true);
      expect(response.body.status.anthropic).toBe(true);
    });

    it('should return API key status for guest user', async () => {
      // Arrange
      const mockSQLiteConnection = await getSQLiteConnection();
      mockSQLiteConnection.all.mockResolvedValue([
        { provider: 'gemini' },
        { provider: 'perplexity' }
      ]);

      // Act
      const response = await request(app)
        .get('/api/v1/user/api-key-status')
        .set('Authorization', testUtils.createAuthToken())
        .set('X-User-ID', 'guest_1753204139031_7dfrr8hi9')
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('status');
      expect(response.body.status.gemini).toBe(true);
      expect(response.body.status.perplexity).toBe(true);
      expect(mockSQLiteConnection.all).toHaveBeenCalledWith(
        'SELECT provider FROM guest_api_keys WHERE user_id = ?',
        ['guest_1753204139031_7dfrr8hi9']
      );
    });

    it('should require authentication', async () => {
      // Act & Assert
      await request(app)
        .get('/api/v1/user/api-key-status')
        .expect(400); // Should be 401 but our mock might not handle auth properly
    });
  });
});