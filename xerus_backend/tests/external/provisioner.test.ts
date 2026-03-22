import '../setup';
import * as connectorsClient from '../../src/shared/clients/connectors';
import * as mnemosyneClient from '../../src/shared/clients/mnemosyne';
import * as provisioner from '../../src/domains/users/provisioner';
import { query } from '../../src/database/connection';

describe('External Services', () => {
  const testUserId = 'test_ext_' + Date.now();
  const testEmail = `test_ext_${Date.now()}@example.com`;

  afterEach(async () => {
    await query("DELETE FROM user_api_keys WHERE user_id LIKE 'test_ext_%'");
  });

  describe('ConnectorsClient', () => {
    it('should check health of Connectors service', async () => {
      const isHealthy = await connectorsClient.healthCheck();
      expect(typeof isHealthy).toBe('boolean');
    });

    describe('when Connectors is available', () => {
      let connectorsAvailable: boolean;

      beforeAll(async () => {
        connectorsAvailable = await connectorsClient.healthCheck();
      });

      it('should register a new tenant', async () => {
        if (!connectorsAvailable) {
          console.log('Skipping: Connectors service not available');
          return;
        }

        const result = await connectorsClient.registerTenant(
          'Test User',
          testEmail
        );

        expect(result.tenant_id).toBeDefined();
        expect(result.api_key).toBeDefined();
        expect(result.api_key.startsWith('ck_')).toBe(true);

        await connectorsClient.deleteTenant(result.tenant_id, result.api_key);
      });
    });
  });

  describe('MnemosyneClient', () => {
    it('should check health of Mnemosyne service', async () => {
      const isHealthy = await mnemosyneClient.healthCheck();
      expect(typeof isHealthy).toBe('boolean');
    });

    describe('when Mnemosyne is available', () => {
      let mnemosyneAvailable: boolean;

      beforeAll(async () => {
        mnemosyneAvailable = await mnemosyneClient.healthCheck();
      });

      it('should register a new user', async () => {
        if (!mnemosyneAvailable) {
          console.log('Skipping: Mnemosyne service not available');
          return;
        }

        const result = await mnemosyneClient.registerUser(
          testEmail,
          'testpassword123'
        );

        expect(result.user_id).toBeDefined();
        expect(result.email).toBe(testEmail);
        expect(result.api_key).toBeDefined();

        await mnemosyneClient.deleteUser(result.api_key);
      });
    });
  });

  describe('Provisioner', () => {
    describe('provisionExternalServices', () => {
      it('should attempt to provision both services and return status', async () => {
        const result = await provisioner.provisionExternalServices(
          testUserId,
          testEmail,
          'Test User'
        );

        expect(typeof result.mnemosyne).toBe('boolean');
        expect(typeof result.connectors).toBe('boolean');
        expect(Array.isArray(result.errors)).toBe(true);

        if (result.connectors) {
          const credentials = await provisioner.getConnectorsCredentials(testUserId);
          expect(credentials).not.toBeNull();
          expect(credentials?.tenant_id).toBeDefined();
          expect(credentials?.api_key).toBeDefined();

          await connectorsClient.deleteTenant(
            credentials!.tenant_id,
            credentials!.api_key
          );
        }

        if (result.mnemosyne) {
          const apiKey = await provisioner.getMnemosyneApiKey(testUserId);
          expect(apiKey).not.toBeNull();

          await mnemosyneClient.deleteUser(apiKey!);
        }
      });
    });

    describe('getProvisioningStatus', () => {
      it('should return provisioning status for user', async () => {
        const status = await provisioner.getProvisioningStatus(testUserId);

        expect(typeof status.mnemosyne).toBe('boolean');
        expect(typeof status.connectors).toBe('boolean');
      });

      it('should return false for both when user has no credentials', async () => {
        const status = await provisioner.getProvisioningStatus('nonexistent_user_123');

        expect(status.mnemosyne).toBe(false);
        expect(status.connectors).toBe(false);
      });
    });

    describe('getExternalCredentials', () => {
      it('should return null credentials for user without provisioning', async () => {
        const credentials = await provisioner.getExternalCredentials('nonexistent_user_456');

        expect(credentials.mnemosyne_api_key).toBeNull();
        expect(credentials.connectors).toBeNull();
      });
    });

    describe('deprovisionExternalServices', () => {
      it('should handle deprovisioning for user without credentials', async () => {
        const result = await provisioner.deprovisionExternalServices('nonexistent_user_789');

        expect(result.mnemosyne).toBe(true);
        expect(result.connectors).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('retryProvisioning', () => {
      it('should attempt to provision only missing services', async () => {
        const initialStatus = await provisioner.getProvisioningStatus(testUserId + '_retry');

        expect(initialStatus.mnemosyne).toBe(false);
        expect(initialStatus.connectors).toBe(false);

        const result = await provisioner.retryProvisioning(
          testUserId + '_retry',
          `retry_${testEmail}`,
          'Retry User'
        );

        expect(typeof result.mnemosyne).toBe('boolean');
        expect(typeof result.connectors).toBe('boolean');
        expect(Array.isArray(result.errors)).toBe(true);

        if (result.connectors) {
          const credentials = await provisioner.getConnectorsCredentials(testUserId + '_retry');
          if (credentials) {
            await connectorsClient.deleteTenant(credentials.tenant_id, credentials.api_key);
          }
        }

        if (result.mnemosyne) {
          const apiKey = await provisioner.getMnemosyneApiKey(testUserId + '_retry');
          if (apiKey) {
            await mnemosyneClient.deleteUser(apiKey);
          }
        }
      });
    });
  });
});
