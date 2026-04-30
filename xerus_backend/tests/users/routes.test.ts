import request from 'supertest';
import { app } from '../../src/index';
import { getTestAuthHeaders } from '../setup';

describe('Users API Routes', () => {
  const testFirebaseUid = 'test_route_' + Date.now();
  const testEmail = `route_${Date.now()}@example.com`;

  describe('POST /api/v1/users/find-or-create', () => {
    it('should create a new user with 201 status', async () => {
      const response = await request(app)
        .post('/api/v1/users/find-or-create')
        .set(getTestAuthHeaders(testFirebaseUid))
        .send({
          uid: testFirebaseUid,
          email: testEmail,
          display_name: 'Route Test User',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user_id).toBeDefined();
      expect(response.body.data.email).toBe(testEmail);
      expect(response.body.data.display_name).toBe('Route Test User');
      expect(response.body.data.plan_type).toBe('pro');
      expect(response.body.data.credits_available).toBe(500);
      expect(response.body.data.is_new).toBe(true);
      expect(response.body.meta.request_id).toBeDefined();
      expect(response.body.meta.response_time_ms).toBeDefined();
    });

    it('should return existing user on duplicate with 200 status', async () => {
      const uid = testFirebaseUid + '_dup';
      const email = `dup_${Date.now()}@example.com`;

      await request(app)
        .post('/api/v1/users/find-or-create')
        .set(getTestAuthHeaders(uid))
        .send({ uid, email, display_name: 'First Call' });

      const response = await request(app)
        .post('/api/v1/users/find-or-create')
        .set(getTestAuthHeaders(uid))
        .send({ uid, email, display_name: 'Second Call' })
        .expect(200);

      expect(response.body.data.user_id).toBeDefined();
      expect(response.body.data.is_new).toBe(false);
    });

    it('should return 403 for UID mismatch', async () => {
      const response = await request(app)
        .post('/api/v1/users/find-or-create')
        .set(getTestAuthHeaders('different_uid'))
        .send({
          uid: 'mismatched_uid',
          email: 'test@example.com',
          display_name: 'Test',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .post('/api/v1/users/find-or-create')
        .send({
          uid: 'test',
          email: 'test@example.com',
          display_name: 'Test',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
