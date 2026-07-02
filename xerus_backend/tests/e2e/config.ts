export const TARGETS: Record<string, string> = {
    prod: process.env.E2E_API_URL || 'http://localhost:5001/api/v1',
    local: 'http://localhost:5001/api/v1',
};

export const HEALTH_TARGETS: Record<string, string> = {
    prod: process.env.E2E_API_BASE || 'http://localhost:5001',
    local: 'http://localhost:5001',
};

export const TEST_USER_EMAIL = process.env.E2E_TEST_EMAIL || '';
export const TOKEN_SCRIPT = 'scripts/get-token.js';
export const REQUEST_TIMEOUT_MS = 15_000;
