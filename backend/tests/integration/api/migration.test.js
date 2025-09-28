/**
 * Integration Tests for Migration API Endpoints
 * Tests data migration endpoints for user data transfer
 */

const request = require('supertest');
const app = require('../../../server');

// Mock migration service
jest.mock('../../../services/migrationService', () => ({
  startMigration: jest.fn(),
  getMigrationStatus: jest.fn(),
  cancelMigration: jest.fn(),
  getMigrationHistory: jest.fn(),
  validateMigrationData: jest.fn(),
  exportUserData: jest.fn(),
  importUserData: jest.fn(),
  rollbackMigration: jest.fn()
}));

const migrationService = require('../../../services/migrationService');

describe('Migration API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/migration/start', () => {
    it('should start migration for authenticated user', async () => {
      const migrationRequest = {
        migration_type: 'guest_to_auth',
        guest_session_id: 'guest-session-123',
        target_user_id: 'user-456'
      };

      const migrationResponse = {
        migration_id: 'migration-789',
        status: 'started',
        estimated_duration: 120,
        items_to_migrate: 25
      };

      migrationService.startMigration.mockResolvedValue(migrationResponse);

      const response = await request(app)
        .post('/api/v1/migration/start')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .send(migrationRequest)
        .expect(202);

      expect(response.body).toEqual(migrationResponse);
      expect(migrationService.startMigration).toHaveBeenCalledWith(
        'user-456',
        migrationRequest
      );
    });

    it('should validate migration request', async () => {
      const invalidRequest = {
        migration_type: 'invalid_type'
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/v1/migration/start')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/migration/start')
        .send({})
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle migration conflicts', async () => {
      migrationService.startMigration.mockRejectedValue(
        new Error('Migration already in progress')
      );

      const response = await request(app)
        .post('/api/v1/migration/start')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .send({
          migration_type: 'guest_to_auth',
          guest_session_id: 'guest-123'
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/migration/:id/status', () => {
    it('should get migration status', async () => {
      const statusResponse = {
        migration_id: 'migration-789',
        status: 'in_progress',
        progress_percentage: 65,
        items_migrated: 16,
        items_total: 25,
        current_step: 'migrating_conversations',
        estimated_remaining: 45
      };

      migrationService.getMigrationStatus.mockResolvedValue(statusResponse);

      const response = await request(app)
        .get('/api/v1/migration/migration-789/status')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .expect(200);

      expect(response.body).toEqual(statusResponse);
      expect(migrationService.getMigrationStatus).toHaveBeenCalledWith(
        'user-456',
        'migration-789'
      );
    });

    it('should return 404 for non-existent migration', async () => {
      migrationService.getMigrationStatus.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/migration/non-existent/status')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Migration not found');
    });

    it('should handle completed migration status', async () => {
      const statusResponse = {
        migration_id: 'migration-789',
        status: 'completed',
        progress_percentage: 100,
        items_migrated: 25,
        items_total: 25,
        completion_time: new Date().toISOString(),
        summary: {
          conversations: 10,
          agents: 5,
          preferences: 10
        }
      };

      migrationService.getMigrationStatus.mockResolvedValue(statusResponse);

      const response = await request(app)
        .get('/api/v1/migration/migration-789/status')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .expect(200);

      expect(response.body).toEqual(statusResponse);
      expect(response.body.status).toBe('completed');
    });
  });

  describe('POST /api/v1/migration/:id/cancel', () => {
    it('should cancel active migration', async () => {
      const cancelResponse = {
        migration_id: 'migration-789',
        status: 'cancelled',
        items_migrated: 10,
        cancellation_time: new Date().toISOString()
      };

      migrationService.cancelMigration.mockResolvedValue(cancelResponse);

      const response = await request(app)
        .post('/api/v1/migration/migration-789/cancel')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .expect(200);

      expect(response.body).toEqual(cancelResponse);
      expect(migrationService.cancelMigration).toHaveBeenCalledWith(
        'user-456',
        'migration-789'
      );
    });

    it('should handle cancellation of completed migration', async () => {
      migrationService.cancelMigration.mockRejectedValue(
        new Error('Cannot cancel completed migration')
      );

      const response = await request(app)
        .post('/api/v1/migration/migration-789/cancel')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/migration/history', () => {
    it('should get migration history for user', async () => {
      const historyResponse = [
        {
          migration_id: 'migration-123',
          migration_type: 'guest_to_auth',
          status: 'completed',
          started_at: '2024-01-15T10:00:00Z',
          completed_at: '2024-01-15T10:05:00Z',
          items_migrated: 20
        },
        {
          migration_id: 'migration-456',
          migration_type: 'data_export',
          status: 'failed',
          started_at: '2024-01-10T14:00:00Z',
          error_message: 'Network timeout'
        }
      ];

      migrationService.getMigrationHistory.mockResolvedValue(historyResponse);

      const response = await request(app)
        .get('/api/v1/migration/history')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .expect(200);

      expect(response.body).toEqual(historyResponse);
      expect(migrationService.getMigrationHistory).toHaveBeenCalledWith('user-456');
    });

    it('should support pagination', async () => {
      const historyResponse = [];
      migrationService.getMigrationHistory.mockResolvedValue(historyResponse);

      const response = await request(app)
        .get('/api/v1/migration/history?limit=10&offset=20')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .expect(200);

      expect(response.body).toEqual(historyResponse);
      expect(migrationService.getMigrationHistory).toHaveBeenCalledWith(
        'user-456',
        { limit: 10, offset: 20 }
      );
    });
  });

  describe('POST /api/v1/migration/validate', () => {
    it('should validate migration data', async () => {
      const validationRequest = {
        guest_session_id: 'guest-123',
        data_types: ['conversations', 'preferences']
      };

      const validationResponse = {
        valid: true,
        data_summary: {
          conversations: 15,
          preferences: 8,
          total_size_mb: 2.5
        },
        warnings: [],
        estimated_duration: 90
      };

      migrationService.validateMigrationData.mockResolvedValue(validationResponse);

      const response = await request(app)
        .post('/api/v1/migration/validate')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .send(validationRequest)
        .expect(200);

      expect(response.body).toEqual(validationResponse);
      expect(migrationService.validateMigrationData).toHaveBeenCalledWith(
        'user-456',
        validationRequest
      );
    });

    it('should handle validation with warnings', async () => {
      const validationResponse = {
        valid: true,
        data_summary: { conversations: 5 },
        warnings: [
          'Some conversations may contain corrupted data',
          'Large file attachments will be skipped'
        ]
      };

      migrationService.validateMigrationData.mockResolvedValue(validationResponse);

      const response = await request(app)
        .post('/api/v1/migration/validate')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .send({ guest_session_id: 'guest-123' })
        .expect(200);

      expect(response.body.warnings).toHaveLength(2);
    });
  });

  describe('POST /api/v1/migration/export', () => {
    it('should export user data', async () => {
      const exportRequest = {
        data_types: ['conversations', 'agents', 'preferences'],
        format: 'json'
      };

      const exportResponse = {
        export_id: 'export-abc',
        download_url: '/api/v1/migration/download/export-abc',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        file_size_mb: 5.2
      };

      migrationService.exportUserData.mockResolvedValue(exportResponse);

      const response = await request(app)
        .post('/api/v1/migration/export')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .send(exportRequest)
        .expect(202);

      expect(response.body).toEqual(exportResponse);
      expect(migrationService.exportUserData).toHaveBeenCalledWith(
        'user-456',
        exportRequest
      );
    });

    it('should validate export request', async () => {
      const invalidRequest = {
        data_types: [],  // Empty array
        format: 'invalid_format'
      };

      const response = await request(app)
        .post('/api/v1/migration/export')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/migration/import', () => {
    it('should import user data', async () => {
      const importRequest = {
        data_file: 'base64_encoded_data',
        merge_strategy: 'append',
        data_types: ['conversations']
      };

      const importResponse = {
        import_id: 'import-def',
        status: 'processing',
        items_to_import: 12,
        estimated_duration: 60
      };

      migrationService.importUserData.mockResolvedValue(importResponse);

      const response = await request(app)
        .post('/api/v1/migration/import')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .send(importRequest)
        .expect(202);

      expect(response.body).toEqual(importResponse);
      expect(migrationService.importUserData).toHaveBeenCalledWith(
        'user-456',
        importRequest
      );
    });

    it('should validate import data format', async () => {
      const invalidRequest = {
        data_file: 'invalid_base64',
        merge_strategy: 'unknown_strategy'
      };

      const response = await request(app)
        .post('/api/v1/migration/import')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/migration/:id/rollback', () => {
    it('should rollback migration', async () => {
      const rollbackResponse = {
        migration_id: 'migration-789',
        rollback_status: 'completed',
        items_reverted: 25,
        rollback_time: new Date().toISOString()
      };

      migrationService.rollbackMigration.mockResolvedValue(rollbackResponse);

      const response = await request(app)
        .post('/api/v1/migration/migration-789/rollback')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .expect(200);

      expect(response.body).toEqual(rollbackResponse);
      expect(migrationService.rollbackMigration).toHaveBeenCalledWith(
        'user-456',
        'migration-789'
      );
    });

    it('should handle rollback of non-rollbackable migration', async () => {
      migrationService.rollbackMigration.mockRejectedValue(
        new Error('Migration cannot be rolled back after 24 hours')
      );

      const response = await request(app)
        .post('/api/v1/migration/migration-789/rollback')
        .set('Authorization', 'Bearer development_token')
        .set('X-User-ID', 'user-456')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});