import cron from 'node-cron';
import { creditService } from '../domains/users/credit-service';
import { logger } from '../utils/logger';

const log = logger('CreditResetJob');

export function startCreditResetJob(): void {
    cron.schedule('0 0 * * *', async () => {
        log.info('Starting daily credit reset...');

        try {
            const [proReset, maxReset, ultraReset] = await Promise.all([
                creditService.resetMonthlyCreditsForProUsers(),
                creditService.resetMonthlyCreditsForMaxUsers(),
                creditService.resetMonthlyCreditsForUltraUsers(),
            ]);

            log.info('Credit reset complete', {
                pro_users_reset: proReset,
                max_users_reset: maxReset,
                ultra_users_reset: ultraReset,
            });
        } catch (error) {
            log.error('Credit reset failed', error instanceof Error ? error : new Error(String(error)));
        }
    });

    log.info('Credit reset job scheduled (daily 00:00 UTC)');
}
