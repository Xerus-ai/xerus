import crypto from 'crypto';
import { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { RateLimitError } from '../utils/errors';
import { AuthenticatedRequest } from '../types';

/**
 * Generate a rate-limit key from the request. Avoids a shared 'anonymous'
 * bucket by falling back to x-forwarded-for header or a unique-per-request
 * UUID (so truly unidentifiable requests each get their own bucket and cannot
 * piggyback on other users' allowance).
 */
function rateLimitKey(req: Request): string {
    return (req as AuthenticatedRequest).user?.uid
        ?? req.ip
        ?? req.headers['x-forwarded-for']?.toString()
        ?? `anon-${crypto.randomUUID()}`;
}

export const generalRateLimit = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
    keyGenerator: rateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.set('Retry-After', '60');
        throw new RateLimitError();
    },
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const strictRateLimit = rateLimit({
    windowMs: 60000,
    max: 200,
    keyGenerator: rateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.set('Retry-After', '30');
        throw new RateLimitError();
    },
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const inviteCodeRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                     // 5 attempts per window per user
    keyGenerator: rateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    handler: () => {
        throw new RateLimitError();
    },
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

export const uploadRateLimit = rateLimit({
    windowMs: 60000,
    max: 30,
    keyGenerator: rateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    handler: () => {
        throw new RateLimitError();
    },
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});
