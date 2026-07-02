import { REQUEST_TIMEOUT_MS } from './config';

export interface TestResult {
    name: string;
    method: string;
    path: string;
    status: number;
    passed: boolean;
    duration: number;
    error?: string;
    body?: unknown;
}

export async function apiCall(
    baseUrl: string,
    token: string,
    method: string,
    path: string,
    body?: unknown,
): Promise<{ status: number; body: unknown; duration: number }> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const start = Date.now();
    try {
        const resp = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        const duration = Date.now() - start;

        let respBody: unknown;
        const text = await resp.text();
        try {
            respBody = JSON.parse(text);
        } catch {
            respBody = text;
        }

        return { status: resp.status, body: respBody, duration };
    } catch (err: unknown) {
        const duration = Date.now() - start;
        const message = err instanceof Error ? err.message : String(err);
        return { status: 0, body: { error: message }, duration };
    } finally {
        clearTimeout(timeout);
    }
}

export function formatResult(r: TestResult): string {
    const icon = r.passed ? '[PASS]' : '[FAIL]';
    const base = `${icon} ${r.method} ${r.path} (${r.status}) ${r.duration}ms`;
    return r.error ? `${base} - ${r.error}` : base;
}
