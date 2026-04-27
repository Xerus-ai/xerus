import { Request, Response } from 'express';
import { Webhook, WebhookVerificationError } from 'standardwebhooks';
import { logger } from '../../utils/logger';
import { billingService } from './billing.service';
import type { PolarWebhookEventType } from './types';

const log = logger('WebhookHandler');

const VALID_EVENT_TYPES: PolarWebhookEventType[] = [
    'checkout.completed',
    'subscription.created',
    'subscription.updated',
    'subscription.canceled',
    'subscription.revoked',
];

function extractRawBody(req: Request): string {
    // When express.raw() is applied, req.body is a Buffer
    if (Buffer.isBuffer(req.body)) {
        return req.body.toString('utf-8');
    }
    // Fallback: if body was somehow parsed as object (should not happen with express.raw)
    if (typeof req.body === 'object' && req.body !== null) {
        return JSON.stringify(req.body);
    }
    if (typeof req.body === 'string') {
        return req.body;
    }
    throw new Error('Unable to extract raw body from request');
}

function extractHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
            headers[key] = value;
        }
    }
    return headers;
}

function verifyWebhookSignature(rawBody: string, headers: Record<string, string>, secret: string): Record<string, unknown> {
    // standardwebhooks expects the secret as base64.
    // Polar stores the webhook secret as plain UTF-8 string,
    // matching the same encoding used by @polar-sh/sdk/webhooks internally.
    const base64Secret = Buffer.from(secret, 'utf-8').toString('base64');
    const webhook = new Webhook(base64Secret);
    return webhook.verify(rawBody, headers) as Record<string, unknown>;
}

export async function handlePolarWebhook(req: Request, res: Response): Promise<void> {
    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new Error('POLAR_WEBHOOK_SECRET is not configured');
    }

    const rawBody = extractRawBody(req);
    const headers = extractHeaders(req);

    let payload: Record<string, unknown>;
    try {
        payload = verifyWebhookSignature(rawBody, headers, webhookSecret);
    } catch (err) {
        if (err instanceof WebhookVerificationError) {
            log.warn('Webhook HMAC signature verification failed', { error: (err as Error).message });
            res.status(401).json({ error: 'Invalid webhook signature' });
            return;
        }
        throw err;
    }

    const eventType = (payload.type as string) || '';
    const eventId = (headers['webhook-id'] as string)
        || (payload.id as string)
        || '';

    if (!VALID_EVENT_TYPES.includes(eventType as PolarWebhookEventType)) {
        log.info('Ignoring unhandled event type', { event_type: eventType });
        res.status(200).json({ received: true });
        return;
    }

    if (!eventId) {
        throw new Error(`Missing event ID for ${eventType} webhook`);
    }

    await billingService.processWebhookEvent(
        eventId,
        eventType as PolarWebhookEventType,
        payload,
    );
    res.status(200).json({ received: true });
}
