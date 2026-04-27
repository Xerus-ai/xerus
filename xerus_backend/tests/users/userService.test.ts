import '../setup';
import { userService, UserNotFoundError } from '../../src/domains/users';

describe('UserService', () => {
  const testFirebaseUid = 'test_user_' + Date.now();
  const testEmail = `test_${Date.now()}@example.com`;

  describe('findOrCreate', () => {
    it('should create a new user when user does not exist', async () => {
      const input = {
        firebase_uid: testFirebaseUid,
        email: testEmail,
        display_name: 'Test User',
      };

      const result = await userService.findOrCreate(input);

      expect(result.created).toBe(true);
      expect(result.user.user_id).toBe(testFirebaseUid);  // user_id IS firebase_uid
      expect(result.user.email).toBe(testEmail);
      expect(result.user.display_name).toBe('Test User');
      expect(result.user.role).toBe('user');
      expect(result.credit_balance.plan_type).toBe('pro');
      expect(result.credit_balance.balance).toBe(500);  // PLAN_CREDITS.pro = 500
    });

    it('should return existing user and update last_login', async () => {
      const input = {
        firebase_uid: testFirebaseUid + '_existing',
        email: `existing_${Date.now()}@example.com`,
        display_name: 'Existing User',
      };

      const firstCall = await userService.findOrCreate(input);
      const firstLogin = firstCall.user.last_login;

      await new Promise(resolve => setTimeout(resolve, 100));

      const secondCall = await userService.findOrCreate(input);

      expect(secondCall.created).toBe(false);
      expect(secondCall.user.user_id).toBe(firstCall.user.user_id);
      expect(new Date(secondCall.user.last_login!).getTime())
        .toBeGreaterThan(new Date(firstLogin!).getTime());
    });
  });

  describe('getById', () => {
    it('should return user when found', async () => {
      const input = {
        firebase_uid: testFirebaseUid + '_getby',
        email: `getby_${Date.now()}@example.com`,
        display_name: 'Get By User',
      };
      const created = await userService.findOrCreate(input);

      const user = await userService.getById(created.user.user_id);

      expect(user.user_id).toBe(created.user.user_id);
      expect(user.email).toBe(input.email);
    });

    it('should throw UserNotFoundError when user does not exist', async () => {
      await expect(userService.getById('nonexistent_user_id'))
        .rejects
        .toThrow(UserNotFoundError);
    });
  });

  describe('getByFirebaseUid', () => {
    it('should return user when found', async () => {
      const input = {
        firebase_uid: testFirebaseUid + '_fbuid',
        email: `fbuid_${Date.now()}@example.com`,
        display_name: 'Firebase UID User',
      };
      const created = await userService.findOrCreate(input);

      const user = await userService.getByFirebaseUid(input.firebase_uid);

      expect(user.user_id).toBe(created.user.user_id);
      expect(user.user_id).toBe(input.firebase_uid);  // user_id IS firebase_uid
    });

    it('should throw UserNotFoundError when user does not exist', async () => {
      await expect(userService.getByFirebaseUid('nonexistent_firebase_uid'))
        .rejects
        .toThrow(UserNotFoundError);
    });
  });

  describe('update', () => {
    it('should update user display_name', async () => {
      const input = {
        firebase_uid: testFirebaseUid + '_update',
        email: `update_${Date.now()}@example.com`,
        display_name: 'Original Name',
      };
      const created = await userService.findOrCreate(input);

      const updated = await userService.update(created.user.user_id, {
        display_name: 'Updated Name',
      });

      expect(updated.display_name).toBe('Updated Name');
    });

    it('should throw UserNotFoundError for nonexistent user', async () => {
      await expect(userService.update('nonexistent_user_id', { display_name: 'Test' }))
        .rejects
        .toThrow(UserNotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete existing user and return cleanup result', async () => {
      const input = {
        firebase_uid: testFirebaseUid + '_delete',
        email: `delete_${Date.now()}@example.com`,
        display_name: 'Delete User',
      };
      const created = await userService.findOrCreate(input);

      const result = await userService.delete(created.user.user_id);

      expect(result.deleted).toBe(true);
      expect(result.user_id).toBe(created.user.user_id);
      expect(result.cleanup).toBeDefined();

      await expect(userService.getById(created.user.user_id))
        .rejects
        .toThrow(UserNotFoundError);
    });

    it('should throw UserNotFoundError for nonexistent user', async () => {
      await expect(userService.delete('nonexistent_user_id'))
        .rejects
        .toThrow(UserNotFoundError);
    });
  });

  describe('list', () => {
    it('should list users with pagination', async () => {
      const result = await userService.list(10, 0);

      expect(Array.isArray(result.users)).toBe(true);
      expect(typeof result.total).toBe('number');
    });
  });
});
