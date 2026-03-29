// Webhook Receiver Controller
// Single endpoint that receives events from ALL trigger providers,
// normalizes them, and dispatches to the correct agent's heartbeat.
//
// Endpoint: POST /api/v1/webhooks/triggers/:provider/:agentId

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { sendResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/errors';
import { triggerAdapterRegistry } from './trigger-source.adapter';
import { TriggerProviderNotFoundError } from './trigger.errors';
import { eventRouterService } from './event-router.service';
import type { TriggerProvider, EventNormalizationMetadata } from './trigger.types';
import { TRIGGER_PROVIDERS } from './trigger.types';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const MAX_PAYLOAD_BYTES = 100 * 1024; // 100KB
const PIPEDREAM_SIGNATURE_HEADER = 'x-pipedream-signature';

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

const webhookReceiverRouter = Router();

// -----------------------------------------------------------------------------
// Middleware: Rate limit (per IP, per provider+agentId)
// -----------------------------------------------------------------------------

const webhookRateLimit = rateLimit({
    windowMs: 60_000,
    max: 60,
    keyGenerator: (req: Request) => {
        const ip = req.ip ?? 'unknown';
        return `${ip}:${req.params.provider}:${req.params.agentId}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({
            success: false,
            error: { code: 'RATE_LIMIT', message: 'Too many webhook requests' },
        });
    },
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});

// -----------------------------------------------------------------------------
// Middleware: Reject oversized payloads
// -----------------------------------------------------------------------------

function rejectOversizedPayload(req: Request, res: Response, next: NextFunction): void {
    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
        res.status(413).json({
            success: false,
            error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 100KB limit' },
        });
        return;
    }
    next();
}

// -----------------------------------------------------------------------------
// Signature Verification
// -----------------------------------------------------------------------------

function verifyWebhookSignature(provider: TriggerProvider, req: Request): boolean {
    if (provider === 'pipedream') {
        return verifyPipedreamSignature(req);
    }

    // Non-Pipedream providers must have a registered adapter that handles its own verification.
    // Delegate to adapter.verifySignature if available, otherwise reject.
    if (triggerAdapterRegistry.has(provider)) {
        const adapter = triggerAdapterRegistry.get(provider);
        if (typeof adapter.verifySignature === 'function') {
            return adapter.verifySignature(req);
        }
    }

    // No adapter or no verifySignature method - reject unknown providers
    console.warn(`[WebhookReceiver] No signature verification for provider '${provider}'. Rejecting.`);
    return false;
}

function verifyPipedreamSignature(req: Request): boolean {
    const secret = process.env.PIPEDREAM_WEBHOOK_SECRET;
    if (!secret) {
        console.error('[WebhookReceiver] PIPEDREAM_WEBHOOK_SECRET not configured. Rejecting webhook.');
        return false;
    }

    const signature = req.headers[PIPEDREAM_SIGNATURE_HEADER] as string | undefined;
    if (!signature) {
        return false;
    }

    const body = JSON.stringify(req.body);
    const expected = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);

    // timingSafeEqual throws on unequal lengths - reject early if lengths differ
    if (sigBuf.length !== expectedBuf.length) {
        return false;
    }

    return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// -----------------------------------------------------------------------------
// Validation Helpers
// -----------------------------------------------------------------------------

function validateProvider(provider: string): TriggerProvider {
    if (!TRIGGER_PROVIDERS.includes(provider as TriggerProvider)) {
        throw new BadRequestError(
            `Unknown provider '${provider}'. Valid providers: ${TRIGGER_PROVIDERS.join(', ')}`
        );
    }
    return provider as TriggerProvider;
}

function validateAgentId(raw: string): number {
    const agentId = parseInt(raw, 10);
    if (isNaN(agentId) || agentId < 1) {
        throw new BadRequestError('Invalid agent ID');
    }
    return agentId;
}

// -----------------------------------------------------------------------------
// POST /api/v1/webhooks/triggers/:provider/:agentId
// -----------------------------------------------------------------------------

webhookReceiverRouter.post(
    '/:provider/:agentId',
    webhookRateLimit,
    rejectOversizedPayload,
    async (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();

        try {
            // 1. Validate params
            const provider = validateProvider(req.params.provider);
            const agentId = validateAgentId(req.params.agentId);

            // 2. Verify signature
            if (!verifyWebhookSignature(provider, req)) {
                res.status(401).json({
                    success: false,
                    error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' },
                });
                return;
            }

            // 3. Get adapter
            if (!triggerAdapterRegistry.has(provider)) {
                throw new TriggerProviderNotFoundError(provider);
            }
            const adapter = triggerAdapterRegistry.get(provider);

            // 4. Normalize event
            // We extract app_slug and event_type from the payload or trigger lookup.
            // For Pipedream, the event body contains these; for others, the adapter
            // extracts them from the raw event structure.
            const metadata: EventNormalizationMetadata = {
                app: extractAppFromPayload(req.body, provider),
                event_type: extractEventTypeFromPayload(req.body, provider),
                agent_id: agentId,
            };

            const normalizedEvent = adapter.normalize(req.body, metadata);
            normalizedEvent.agent_id = agentId;

            // 5. Route to event router (handles trigger matching, queueing, dispatch)
            const result = await eventRouterService.routeEvent(agentId, normalizedEvent);

            // 6. Always return 200 (webhook endpoints should not return errors to providers)
            sendResponse(res, 200, {
                received: true,
                routed: result.routed,
                reason: result.reason,
            }, startTime);
        } catch (err) {
            // For webhook endpoints, we log errors but still return 200 to providers
            // to prevent retry storms. Exceptions: validation errors return proper codes.
            if (err instanceof BadRequestError || err instanceof TriggerProviderNotFoundError) {
                next(err);
                return;
            }

            console.error(
                `[WebhookReceiver] Error processing webhook:`,
                err instanceof Error ? err.message : err
            );

            sendResponse(res, 200, {
                received: true,
                routed: false,
                reason: 'processing_error',
            }, startTime);
        }
    }
);

// -----------------------------------------------------------------------------
// Payload Extraction Helpers
// -----------------------------------------------------------------------------

/**
 * Extract app slug from webhook payload.
 * Each provider has a different payload structure.
 */
function extractAppFromPayload(body: Record<string, unknown>, provider: TriggerProvider): string {
    if (provider === 'pipedream') {
        // Pipedream events include component_id which contains the app slug
        if (typeof body.component_id === 'string') {
            const parts = body.component_id.split('-');
            if (parts.length > 0) {
                return parts[0];
            }
        }
        // Check alternative field locations
        if (typeof body.app === 'string') {
            return body.app;
        }
        if (typeof body.app_slug === 'string') {
            return body.app_slug;
        }
    }

    // Generic extraction for native/zapier/custom
    if (typeof body.app === 'string') {
        return body.app;
    }
    if (typeof body.app_slug === 'string') {
        return body.app_slug;
    }
    if (typeof body.source === 'string') {
        return body.source;
    }

    throw new BadRequestError(
        `Cannot extract app slug from ${provider} webhook payload. ` +
        `Expected one of: component_id, app, app_slug, source`
    );
}

/**
 * Extract event type from webhook payload.
 */
function extractEventTypeFromPayload(body: Record<string, unknown>, provider: TriggerProvider): string {
    if (provider === 'pipedream') {
        if (typeof body.component_id === 'string') {
            const parts = body.component_id.split('-');
            if (parts.length > 1) {
                return parts.slice(1).join('-');
            }
        }
        if (typeof body.event_type === 'string') {
            return body.event_type;
        }
    }

    if (typeof body.event_type === 'string') {
        return body.event_type;
    }
    if (typeof body.event === 'string') {
        return body.event;
    }
    if (typeof body.type === 'string') {
        return body.type;
    }
    if (typeof body.action === 'string') {
        return body.action;
    }

    throw new BadRequestError(
        `Cannot extract event type from ${provider} webhook payload. ` +
        `Expected one of: component_id, event_type, event, type, action`
    );
}

export { webhookReceiverRouter };
