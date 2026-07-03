// MCP Backend API Client
// Handles HTTP communication between the MCP server and the Xerus backend.
// Includes error types, retry logic, and startup diagnostics.

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

export class BackendApiError extends Error {
    public readonly statusCode: number;
    public readonly path: string;
    public readonly responseBody?: string;

    constructor(path: string, statusCode: number, message: string, responseBody?: string) {
        super(message);
        this.name = 'BackendApiError';
        this.path = path;
        this.statusCode = statusCode;
        this.responseBody = responseBody;
    }
}

export class BackendNetworkError extends Error {
    public readonly path: string;
    public readonly cause: Error;

    constructor(path: string, cause: Error) {
        super(`Backend call to ${path} failed: ${cause.message}`);
        this.name = 'BackendNetworkError';
        this.path = path;
        this.cause = cause;
    }
}

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------

// CONTRACT: bare origin, no path — callBackendApi appends /api/v1/internal/mcp/<tool>.
export const BACKEND_URL = (process.env.XERUS_BACKEND_URL || 'http://localhost:5001').replace(/\/+$/, '');

export const BACKEND_TOKEN = process.env.XERUS_BACKEND_TOKEN;
if (!BACKEND_TOKEN && process.env.NODE_ENV === 'production') {
    throw new Error('XERUS_BACKEND_TOKEN is required in production');
}

export const USER_ID = process.env.XERUS_USER_ID;
if (!USER_ID && process.env.NODE_ENV === 'production') {
    throw new Error('XERUS_USER_ID is required — set via .claude/settings.json env');
}

export const AGENT_SLUG = process.env.XERUS_AGENT_SLUG || '';

// -----------------------------------------------------------------------------
// Retry Logic
// -----------------------------------------------------------------------------

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1_000;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBackendError(err: unknown): boolean {
    if (err instanceof BackendNetworkError) return true;
    if (err instanceof BackendApiError) return err.statusCode >= 500;
    return false;
}

async function callBackendApiOnce(
    path: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    const enrichedBody = { ...body, user_id: USER_ID, _agent_slug: AGENT_SLUG };

    let response: Response;
    try {
        response = await fetch(`${BACKEND_URL}/api/v1/internal${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(BACKEND_TOKEN ? { Authorization: `Bearer ${BACKEND_TOKEN}` } : {}),
            },
            body: JSON.stringify(enrichedBody),
            signal: AbortSignal.timeout(30_000),
        });
    } catch (err) {
        if (err instanceof DOMException && err.name === 'TimeoutError') {
            throw new BackendApiError(path, 504, `Backend call to ${path} timed out after 30s`);
        }
        throw new BackendNetworkError(path, err as Error);
    }

    if (!response.ok) {
        const text = await response.text();
        throw new BackendApiError(path, response.status, `Backend returned ${response.status}: ${text}`, text);
    }

    return response.json();
}

export async function callBackendApi(
    path: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await callBackendApiOnce(path, body);
        } catch (err) {
            lastError = err;
            if (attempt < MAX_ATTEMPTS && isRetryableBackendError(err)) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(
                    `[mcp-server] Backend call ${path} failed (attempt ${attempt}/${MAX_ATTEMPTS}), ` +
                    `retrying in ${RETRY_DELAY_MS}ms: ${message}`,
                );
                await delay(RETRY_DELAY_MS);
                continue;
            }
            throw err;
        }
    }

    throw lastError;
}

// -----------------------------------------------------------------------------
// Startup Diagnostics
// -----------------------------------------------------------------------------

export function logStartupDiagnostics(): void {
    console.error('[mcp-server] Startup diagnostics:');
    console.error(`[mcp-server]   XERUS_BACKEND_URL: ${BACKEND_URL}`);
    console.error(`[mcp-server]   XERUS_BACKEND_TOKEN set: ${Boolean(BACKEND_TOKEN)}`);
    console.error(`[mcp-server]   XERUS_USER_ID: ${USER_ID ?? '(unset)'}`);
    console.error(`[mcp-server]   XERUS_AGENT_SLUG: ${AGENT_SLUG || '(unset)'}`);
}

export async function runStartupHealthCheck(): Promise<void> {
    const url = `${BACKEND_URL}/api/v1/internal/mcp/get_status`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(BACKEND_TOKEN ? { Authorization: `Bearer ${BACKEND_TOKEN}` } : {}),
            },
            body: JSON.stringify({ user_id: USER_ID, _agent_slug: AGENT_SLUG }),
            signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) {
            console.error(`[mcp-server] Health check OK — backend reachable (HTTP ${response.status})`);
        } else {
            console.error(`[mcp-server] Health check FAILED — backend returned HTTP ${response.status}`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[mcp-server] Health check FAILED — cannot reach backend at ${url}: ${message}`);
    }
}
