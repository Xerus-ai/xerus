import { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { RateLimitError } from '../utils/errors';
import { AuthenticatedRequest } from '../types';

export const generalRateLimit = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '500', 10),
    standardHeaders: true,
    legacyHeaders: false,
    handler: () => {
        throw new RateLimitError();
    },
    validate: { xForwardedForHeader: false },
});

export const strictRateLimit = rateLimit({
    windowMs: 60000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: () => {
        throw new RateLimitError();
    },
    validate: { xForwardedForHeader: false },
});

export const inviteCodeRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                     // 5 attempts per window per user
    keyGenerator: (req: Request) => (req as AuthenticatedRequest).user?.uid ?? 'anonymous',
    standardHeaders: true,
    legacyHeaders: false,
    handler: () => {
        throw new RateLimitError();
    },
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const uploadRateLimit = rateLimit({
    windowMs: 60000,
    max: 10,
    keyGenerator: (req: Request) => (req as any).user?.uid ?? 'anonymous',
    standardHeaders: true,
    legacyHeaders: false,
    handler: () => {
        throw new RateLimitError();
    },
    validate: { xForwardedForHeader: false },
});
