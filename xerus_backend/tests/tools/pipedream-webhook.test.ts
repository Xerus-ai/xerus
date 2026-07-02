// Unit tests for the Pipedream Connect webhook helpers.
// Pure functions — no DB, no network, no mocks.

import {
    resolvePipedreamWebhookUrl,
    getPipedreamWebhookSecret,
    verifyPipedreamWebhookSignature,
    signPipedreamWebhookBody,
    PipedreamWebhookSignatureError,
} from '../../src/domains/tools/pipedream-webhook';

const SECRET = 'whsec_unit_test_key';

describe('resolvePipedreamWebhookUrl', () => {
    let originalApiBaseUrl: string | undefined;

    beforeEach(() => {
        originalApiBaseUrl = process.env.API_BASE_URL;
    });

    afterEach(() => {
        if (originalApiBaseUrl === undefined) delete process.env.API_BASE_URL;
        else process.env.API_BASE_URL = originalApiBaseUrl;
    });

    it('builds the webhook URL from API_BASE_URL, stripping a trailing /api/v1', () => {
        process.env.API_BASE_URL = 'https://api.xerus.ai/api/v1';
        expect(resolvePipedreamWebhookUrl()).toBe('https://api.xerus.ai/api/v1/tools/webhook/connected');
    });

    it('builds the webhook URL from API_BASE_URL without an /api/v1 suffix', () => {
        process.env.API_BASE_URL = 'https://api.xerus.ai';
        expect(resolvePipedreamWebhookUrl()).toBe('https://api.xerus.ai/api/v1/tools/webhook/connected');
    });

    it('prefers API_BASE_URL over the request-derived base', () => {
        process.env.API_BASE_URL = 'https://api.xerus.ai/api/v1';
        expect(resolvePipedreamWebhookUrl('http://localhost:5001')).toBe(
            'https://api.xerus.ai/api/v1/tools/webhook/connected',
        );
    });

    it('falls back to the request-derived base when API_BASE_URL is unset', () => {
        delete process.env.API_BASE_URL;
        expect(resolvePipedreamWebhookUrl('http://localhost:5001')).toBe(
            'http://localhost:5001/api/v1/tools/webhook/connected',
        );
    });

    it('fail-fasts when neither API_BASE_URL nor a request base is available', () => {
        delete process.env.API_BASE_URL;
        expect(() => resolvePipedreamWebhookUrl()).toThrow(/API_BASE_URL/);
    });

    it('produces an identical URL for the user and agent flows (convergence)', () => {
        process.env.API_BASE_URL = 'https://api.xerus.ai/api/v1';
        const userFlow = resolvePipedreamWebhookUrl('http://localhost:5001');
        const agentFlow = resolvePipedreamWebhookUrl();
        expect(userFlow).toBe(agentFlow);
    });
});

describe('getPipedreamWebhookSecret', () => {
    let original: string | undefined;

    beforeEach(() => {
        original = process.env.PIPEDREAM_WEBHOOK_SECRET;
    });

    afterEach(() => {
        if (original === undefined) delete process.env.PIPEDREAM_WEBHOOK_SECRET;
        else process.env.PIPEDREAM_WEBHOOK_SECRET = original;
    });

    it('returns the configured secret', () => {
        process.env.PIPEDREAM_WEBHOOK_SECRET = SECRET;
        expect(getPipedreamWebhookSecret()).toBe(SECRET);
    });

    it('fail-fasts when the secret is unset', () => {
        delete process.env.PIPEDREAM_WEBHOOK_SECRET;
        expect(() => getPipedreamWebhookSecret()).toThrow(/PIPEDREAM_WEBHOOK_SECRET/);
    });

    it('fail-fasts when the secret is blank', () => {
        process.env.PIPEDREAM_WEBHOOK_SECRET = '   ';
        expect(() => getPipedreamWebhookSecret()).toThrow(/PIPEDREAM_WEBHOOK_SECRET/);
    });
});

describe('verifyPipedreamWebhookSignature', () => {
    const rawBody = JSON.stringify({ event: 'CONNECTION_SUCCESS', account: { id: 'apn_1' } });
    const now = 1_700_000_000_000; // fixed ms clock
    const timestamp = Math.floor(now / 1000);

    function validHeader(body = rawBody, ts = timestamp): string {
        return signPipedreamWebhookBody(body, SECRET, ts);
    }

    it('accepts a correctly signed body', () => {
        expect(() =>
            verifyPipedreamWebhookSignature({
                rawBody,
                signatureHeader: validHeader(),
                secret: SECRET,
                now,
            }),
        ).not.toThrow();
    });

    it('rejects a missing signature header', () => {
        expect(() =>
            verifyPipedreamWebhookSignature({ rawBody, signatureHeader: undefined, secret: SECRET, now }),
        ).toThrow(PipedreamWebhookSignatureError);
    });

    it('rejects a malformed signature header', () => {
        expect(() =>
            verifyPipedreamWebhookSignature({ rawBody, signatureHeader: 'not-a-valid-header', secret: SECRET, now }),
        ).toThrow(PipedreamWebhookSignatureError);
    });

    it('rejects a signature computed with a different secret', () => {
        const header = signPipedreamWebhookBody(rawBody, 'whsec_other_key', timestamp);
        expect(() =>
            verifyPipedreamWebhookSignature({ rawBody, signatureHeader: header, secret: SECRET, now }),
        ).toThrow(PipedreamWebhookSignatureError);
    });

    it('rejects when the body is tampered after signing', () => {
        const header = validHeader();
        const tampered = rawBody.replace('apn_1', 'apn_hacked');
        expect(() =>
            verifyPipedreamWebhookSignature({ rawBody: tampered, signatureHeader: header, secret: SECRET, now }),
        ).toThrow(PipedreamWebhookSignatureError);
    });

    it('rejects a timestamp outside the tolerance window (replay protection)', () => {
        const staleTs = timestamp - 3600;
        const header = validHeader(rawBody, staleTs);
        expect(() =>
            verifyPipedreamWebhookSignature({ rawBody, signatureHeader: header, secret: SECRET, now }),
        ).toThrow(/tolerance/);
    });

    it('accepts a timestamp within a custom tolerance window', () => {
        const ts = timestamp - 100;
        const header = validHeader(rawBody, ts);
        expect(() =>
            verifyPipedreamWebhookSignature({
                rawBody,
                signatureHeader: header,
                secret: SECRET,
                now,
                toleranceSeconds: 200,
            }),
        ).not.toThrow();
    });

    it('rejects a malformed (non-hex, wrong-length) v1 digest cleanly', () => {
        const header = `t=${timestamp},v1=zzzz`;
        expect(() =>
            verifyPipedreamWebhookSignature({ rawBody, signatureHeader: header, secret: SECRET, now }),
        ).toThrow(PipedreamWebhookSignatureError);
    });
});
