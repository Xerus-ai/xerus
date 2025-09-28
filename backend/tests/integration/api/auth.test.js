/**
 * Integration Tests for Authentication API Endpoints
 * Tests authentication routes for login, logout, and token validation
 */

const request = require('supertest');
const app = require('../../../server');

describe('Authentication API Integration Tests', () => {
  beforeEach(() => {
    // Ensure test environment
    process.env.NODE_ENV = 'test';
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid email in development mode', async () => {
      const loginData = {
        email: 'test@example.com'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
      expect(response.body.user).toHaveProperty('uid');
    });

    it('should login with valid user_id in development mode', async () => {
      const loginData = {
        user_id: 'test-user-123'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('uid', 'test-user-123');
    });

    it('should return 400 for missing email and user_id', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Email or user_id is required');
    });

    it('should handle password login when provided', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'testpassword'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Logged out successfully');
    });
  });

  describe('GET /api/v1/auth/validate', () => {
    it('should validate valid development token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/validate')
        .set('Authorization', 'Bearer development_token')
        .expect(200);

      expect(response.body).toHaveProperty('valid', true);
      expect(response.body).toHaveProperty('user');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/validate')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should require authorization header', async () => {
      const response = await request(app)
        .get('/api/v1/auth/validate')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer development_token')
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    it('should require valid token for refresh', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });
});