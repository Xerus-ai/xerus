// Users Domain - Barrel Exports
// User management, credits, and API key services

// Types
export type {
    // Core types
    User,
    CreditBalance,
    UserApiKey,
    UserPreferences,
    PlanType,
    UserRole,
    ApiProvider,
    SubscriptionStatus,

    // Input/Output types
    UserCreateInput,
    UserUpdateInput,
    FindOrCreateResult,
    DeleteUserResult,
    CreditDeductInput,
    CreditHistoryOptions,
    CreditHistoryPage,
    CreditHistoryEntry,
    ApiKeyStatus,
    ApiKeySetInput,

    // Database row types
    UserRow,
    UserApiKeyRow,
} from './types';

// Constants
export { PLAN_CREDITS, VALID_API_PROVIDERS } from './types';

// Errors
export {
    UserError,
    UserNotFoundError,
    UserUnauthorizedError,
    UserForbiddenError,
    InsufficientCreditsError,
    CreditOperationError,
    InvalidApiProviderError,
    ApiKeyNotFoundError,
    ApiKeyEncryptionError,
    UserValidationError,
} from './errors';

// Validators
export { userValidator } from './validators';

// Repository
export { userRepository, UserRepository } from './repository';

// Services
export { userService, UserService } from './service';
export { creditService, CreditService } from './credit-service';
export { apiKeyService, ApiKeyService } from './api-key-service';
export { cliAuthService, CLIAuthService } from './cli-auth.service';
export type { CLIAuthStatus, CLIAuthResult, AuthMethod } from './cli-auth.service';

// Routes
export { default as usersRouter, setUserRoutesDeps } from './routes';
