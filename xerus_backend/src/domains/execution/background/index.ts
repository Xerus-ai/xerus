// Background Module Exports
// Daily digest and other background services

export type {
    DigestVariant,
    DigestActivityData,
    DigestTaskItem,
    DigestBlockedItem,
    DigestAlertItem,
    DigestCreditUsage,
    DigestSection,
    DigestSectionItem,
    DigestResult,
    DigestSummary,
    DailyDigestConfig,
    DigestTriggerContext,
    ActivityDataCollector,
} from './daily-digest.types';

export { DIGEST_VARIANTS } from './daily-digest.types';

export { DailyDigestService } from './daily-digest.service';

export {
    DigestDispatcher,
    calculateLookbackWindow,
} from './digest-dispatcher';

export type {
    DigestFormatter,
    DigestDispatcherDeps,
    DigestDispatchResult,
} from './digest-dispatcher';

export {
    DigestExecutionRecordError,
    DigestConfigNotFoundError,
    DigestGenerationError,
} from './daily-digest.errors';
