// Pipedream Connect Webhook Helpers
// One place for everything about the Connect completion webhook:
//  - resolving the canonical webhook URL both connect flows must converge on
//  - verifying the x-pd-signature HMAC Pipedream attaches to every delivery
//
// Signature scheme (Pipedream Connect docs, https://pipedream.com/docs/connect/webhooks):
//   header  x-pd-signature: t=<unix_seconds>,v1=<hex_hmac_sha256>
//   signed  `${t}.${raw_request_body}`  (raw bytes, not re-serialized JSON)
//   secret  the project's webhook signing key (PIPEDREAM_WEBHOOK_SECRET)

import crypto from 'crypto';

// Replay window: reject deliveries whose signed timestamp is older/newer than this.
const SIGNATURE_TOLERANCE_SECONDS = 300;

const WEBHOOK_PATH = '/api/v1/tools/webhook/connected';

/**
 * Thrown when a webhook delivery fails signature verification. The route maps
 * this to a 401 — distinct from configuration errors (missing secret) which are
 * genuine server faults and must surface as 500 (fail-fast, never skip verify).
 */
export class PipedreamWebhookSignatureError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PipedreamWebhookSignatureError';
    }
}

/**
 * Read the Connect webhook signing secret. Fail-fast if unset — a missing secret
 * must never silently disable verification (that would re-open the spoofable-write
 * hole this hardening closes).
 */
export function getPipedreamWebhookSecret(): string {
    const secret = process.env.PIPEDREAM_WEBHOOK_SECRET;
    if (!secret || secret.trim() === '') {
        throw new Error('PIPEDREAM_WEBHOOK_SECRET is not configured');
    }
    return secret;
}

/**
 * Build the canonical Connect completion webhook URL. Both the user-initiated
 * (connect-token) and agent-initiated (connect_tool MCP) flows must pass the
 * SAME url to Pipedream, or agent-initiated OAuth never persists.
 *
 * Prefers API_BASE_URL (the public URL Pipedream must reach); an internal MCP
 * call has no trustworthy request host, so it relies on API_BASE_URL and
 * fail-fasts if that is unset rather than emitting an unreachable localhost URL.
 */
export function resolvePipedreamWebhookUrl(requestBaseUrl?: string): string {
    const rawBaseUrl = process.env.API_BASE_URL || requestBaseUrl;
    if (!rawBaseUrl || rawBaseUrl.trim() === '') {
        throw new Error('Cannot resolve Pipedream webhook URL: set API_BASE_URL');
    }
    const baseUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '');
    return `${baseUrl}${WEBHOOK_PATH}`;
}

interface ParsedSignature {
    timestamp: number;
    v1: string;
}

function parseSignatureHeader(header: string): ParsedSignature {
    const parts = header.split(',').reduce<Record<string, string>>((acc, part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return acc;
        acc[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
        return acc;
    }, {});

    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) {
        throw new PipedreamWebhookSignatureError('Malformed x-pd-signature header (expected t=,v1=)');
    }

    const timestamp = Number(t);
    if (!Number.isFinite(timestamp)) {
        throw new PipedreamWebhookSignatureError('Invalid timestamp in x-pd-signature header');
    }

    return { timestamp, v1 };
}

interface VerifyParams {
    rawBody: string;
    signatureHeader: string | undefined;
    secret: string;
    toleranceSeconds?: number;
    now?: number;
}

/**
 * Verify the x-pd-signature HMAC over the raw request body. Throws
 * PipedreamWebhookSignatureError on any mismatch, missing header, malformed
 * header, or stale timestamp. Returns void on success.
 */
export function verifyPipedreamWebhookSignature(params: VerifyParams): void {
    const { rawBody, signatureHeader, secret } = params;
    if (!signatureHeader) {
        throw new PipedreamWebhookSignatureError('Missing x-pd-signature header');
    }

    const { timestamp, v1 } = parseSignatureHeader(signatureHeader);

    const tolerance = params.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
    const nowSeconds = Math.floor((params.now ?? Date.now()) / 1000);
    if (Math.abs(nowSeconds - timestamp) > tolerance) {
        throw new PipedreamWebhookSignatureError('x-pd-signature timestamp outside tolerance window');
    }

    const expectedHex = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const receivedBuf = Buffer.from(v1, 'hex');

    // timingSafeEqual throws on length mismatch — guard so a malformed hex digest
    // is a clean rejection, not an unhandled throw.
    if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
        throw new PipedreamWebhookSignatureError('x-pd-signature verification failed');
    }
}

/**
 * Compute a valid x-pd-signature header value for a raw body. Used by tests that
 * exercise the webhook end-to-end against a known secret; keeping it here means
 * the signing and verifying logic can never drift apart.
 */
export function signPipedreamWebhookBody(rawBody: string, secret: string, timestampSeconds: number): string {
    const v1 = crypto
        .createHmac('sha256', secret)
        .update(`${timestampSeconds}.${rawBody}`)
        .digest('hex');
    return `t=${timestampSeconds},v1=${v1}`;
}
