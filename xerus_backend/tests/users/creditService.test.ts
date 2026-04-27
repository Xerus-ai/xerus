import '../setup';
import { userService, creditService, UserNotFoundError, InsufficientCreditsError } from '../../src/domains/users';

describe('CreditService', () => {
  const testFirebaseUid = 'test_credit_' + Date.now();
  let testUserId: string;

  beforeEach(async () => {
    const result = await userService.findOrCreate({
      firebase_uid: testFirebaseUid + '_' + Date.now(),
      email: `credit_${Date.now()}_${Math.random()}@example.com`,
      display_name: 'Credit Test User',
    });
    testUserId = result.user.user_id;
  });

  describe('getBalance', () => {
    it('should return credit balance for existing user', async () => {
      const balance = await creditService.getBalance(testUserId);

      expect(balance.plan_type).toBe('pro');
      expect(balance.balance).toBe(500);  // PLAN_CREDITS.pro = 500
    });

    it('should throw UserNotFoundError for nonexistent user', async () => {
      await expect(creditService.getBalance('00000000-0000-0000-0000-000000000000'))
        .rejects
        .toThrow(UserNotFoundError);
    });
  });

  describe('checkCredits', () => {
    it('should return true when credits are available', async () => {
      const hasCredits = await creditService.checkCredits(testUserId, 5);
      expect(hasCredits).toBe(true);
    });

    it('should return false when credits are insufficient', async () => {
      const hasCredits = await creditService.checkCredits(testUserId, 100);
      expect(hasCredits).toBe(false);
    });
  });

  describe('deduct', () => {
    it('should deduct credits successfully', async () => {
      const balance = await creditService.deduct(testUserId, { amount: 1 });

      expect(balance.balance).toBe(49);  // 50 - 1
    });

    it('should throw InsufficientCreditsError when not enough credits', async () => {
      await expect(creditService.deduct(testUserId, { amount: 100 }))
        .rejects
        .toThrow(InsufficientCreditsError);
    });

    it('should handle multiple deductions atomically', async () => {
      await creditService.deduct(testUserId, { amount: 3 });
      await creditService.deduct(testUserId, { amount: 2 });
      const balance = await creditService.getBalance(testUserId);

      expect(balance.balance).toBe(45);  // 50 - 3 - 2
    });
  });

  describe('reset', () => {
    it('should reset credits to plan default', async () => {
      await creditService.deduct(testUserId, { amount: 5 });
      const balance = await creditService.reset(testUserId);

      expect(balance.balance).toBe(50);  // PLAN_CREDITS.free = 50
    });
  });

  describe('add', () => {
    it('should add credits to user', async () => {
      const balance = await creditService.add(testUserId, 5, 'Test addition');

      expect(balance.balance).toBe(55);  // 50 + 5
    });
  });

  describe('refund', () => {
    it('should refund credits to user', async () => {
      await creditService.deduct(testUserId, { amount: 5 });
      const balance = await creditService.refund(testUserId, 3, 'Test refund');

      expect(balance.balance).toBe(48);  // 50 - 5 + 3
    });
  });

  describe('getHistory', () => {
    it('should return credit history', async () => {
      await creditService.deduct(testUserId, { amount: 2, description: 'Test deduct' });
      await creditService.add(testUserId, 1, 'Test add');

      const result = await creditService.getHistory(testUserId, { page: 1, limit: 10 });

      expect(Array.isArray(result.history)).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
    });
  });
});
