import { getPipedreamClient, resetPipedreamClient } from '../../../src/shared/clients/pipedream';

describe('Pipedream Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    resetPipedreamClient();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getPipedreamClient', () => {
    it('should throw error when PIPEDREAM_CLIENT_ID is missing', () => {
      delete process.env.PIPEDREAM_CLIENT_ID;
      process.env.PIPEDREAM_CLIENT_SECRET = 'test_secret';
      process.env.PIPEDREAM_PROJECT_ID = 'test_project';
      process.env.PIPEDREAM_PROJECT_ENVIRONMENT = 'development';

      expect(() => getPipedreamClient()).toThrow('Missing Pipedream configuration');
    });

    it('should throw error when PIPEDREAM_CLIENT_SECRET is missing', () => {
      process.env.PIPEDREAM_CLIENT_ID = 'test_client';
      delete process.env.PIPEDREAM_CLIENT_SECRET;
      process.env.PIPEDREAM_PROJECT_ID = 'test_project';
      process.env.PIPEDREAM_PROJECT_ENVIRONMENT = 'development';

      expect(() => getPipedreamClient()).toThrow('Missing Pipedream configuration');
    });

    it('should throw error when PIPEDREAM_PROJECT_ID is missing', () => {
      process.env.PIPEDREAM_CLIENT_ID = 'test_client';
      process.env.PIPEDREAM_CLIENT_SECRET = 'test_secret';
      delete process.env.PIPEDREAM_PROJECT_ID;
      process.env.PIPEDREAM_PROJECT_ENVIRONMENT = 'development';

      expect(() => getPipedreamClient()).toThrow('Missing Pipedream configuration');
    });

    it('should throw error when PIPEDREAM_PROJECT_ENVIRONMENT is missing', () => {
      process.env.PIPEDREAM_CLIENT_ID = 'test_client';
      process.env.PIPEDREAM_CLIENT_SECRET = 'test_secret';
      process.env.PIPEDREAM_PROJECT_ID = 'test_project';
      delete process.env.PIPEDREAM_PROJECT_ENVIRONMENT;

      expect(() => getPipedreamClient()).toThrow('Missing Pipedream configuration');
    });

    it('should create client when all environment variables are present', () => {
      process.env.PIPEDREAM_CLIENT_ID = 'test_client';
      process.env.PIPEDREAM_CLIENT_SECRET = 'test_secret';
      process.env.PIPEDREAM_PROJECT_ID = 'test_project';
      process.env.PIPEDREAM_PROJECT_ENVIRONMENT = 'development';

      const client = getPipedreamClient();
      expect(client).toBeDefined();
      expect(client).toHaveProperty('getApps');
      expect(client).toHaveProperty('createConnectToken');
      expect(client).toHaveProperty('getAccounts');
    });

    it('should return the same instance on multiple calls (singleton)', () => {
      process.env.PIPEDREAM_CLIENT_ID = 'test_client';
      process.env.PIPEDREAM_CLIENT_SECRET = 'test_secret';
      process.env.PIPEDREAM_PROJECT_ID = 'test_project';
      process.env.PIPEDREAM_PROJECT_ENVIRONMENT = 'development';

      const client1 = getPipedreamClient();
      const client2 = getPipedreamClient();

      expect(client1).toBe(client2);
    });

    it('should accept production environment', () => {
      process.env.PIPEDREAM_CLIENT_ID = 'test_client';
      process.env.PIPEDREAM_CLIENT_SECRET = 'test_secret';
      process.env.PIPEDREAM_PROJECT_ID = 'test_project';
      process.env.PIPEDREAM_PROJECT_ENVIRONMENT = 'production';

      const client = getPipedreamClient();
      expect(client).toBeDefined();
    });
  });

  describe('resetPipedreamClient', () => {
    it('should reset singleton allowing new instance creation', () => {
      process.env.PIPEDREAM_CLIENT_ID = 'test_client_1';
      process.env.PIPEDREAM_CLIENT_SECRET = 'test_secret_1';
      process.env.PIPEDREAM_PROJECT_ID = 'test_project_1';
      process.env.PIPEDREAM_PROJECT_ENVIRONMENT = 'development';

      const client1 = getPipedreamClient();

      resetPipedreamClient();

      process.env.PIPEDREAM_CLIENT_ID = 'test_client_2';
      process.env.PIPEDREAM_CLIENT_SECRET = 'test_secret_2';
      process.env.PIPEDREAM_PROJECT_ID = 'test_project_2';
      process.env.PIPEDREAM_PROJECT_ENVIRONMENT = 'production';

      const client2 = getPipedreamClient();

      expect(client2).toBeDefined();
      expect(client1).not.toBe(client2);
    });
  });
});
