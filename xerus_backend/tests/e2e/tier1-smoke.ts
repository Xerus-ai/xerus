import { apiCall, TestResult, formatResult } from './client';
import { HEALTH_TARGETS } from './config';

interface Endpoint {
    method: string;
    path: string;
    auth?: boolean;
    body?: unknown;
    skip?: string;
}

const ENDPOINTS: Endpoint[] = [
    // health
    { method: 'GET', path: '/health', auth: false },

    // users
    { method: 'GET', path: '/users/me' },
    { method: 'GET', path: '/users/credits' },
    { method: 'GET', path: '/users/credits/history' },
    { method: 'GET', path: '/users/api-keys' },
    { method: 'GET', path: '/users/cli-auth-status' },

    // agents
    { method: 'GET', path: '/agents' },
    { method: 'GET', path: '/agents/marketplace' },
    { method: 'GET', path: '/agents/mine' },

    // execution
    { method: 'GET', path: '/execute/sessions' },
    { method: 'GET', path: '/execute/conversations' },
    { method: 'GET', path: '/execute/schedules' },
    { method: 'GET', path: '/execute/schedules/runs' },

    // inbox
    { method: 'GET', path: '/inbox' },

    // company
    { method: 'GET', path: '/company/domains' },

    // tasks
    { method: 'GET', path: '/tasks' },

    // memory
    { method: 'GET', path: '/memory' },

    // models
    { method: 'GET', path: '/models' },

    // workspace
    { method: 'GET', path: '/workspace/tree' },
    { method: 'GET', path: '/workspace/overview' },
    { method: 'GET', path: '/workspace/status' },
    { method: 'GET', path: '/workspace/connections' },
    { method: 'GET', path: '/workspace/tags/list' },
    { method: 'GET', path: '/workspace/tags' },
    { method: 'GET', path: '/workspace/snapshots' },

    // skills
    { method: 'GET', path: '/skills' },

    // tools
    { method: 'GET', path: '/tools' },
    { method: 'GET', path: '/tools/accounts' },
    { method: 'GET', path: '/tools/hidden' },

    // billing
    { method: 'GET', path: '/billing/subscription' },
    { method: 'GET', path: '/billing/usage' },

    // invite codes
    { method: 'GET', path: '/invite-codes' },

    // POST endpoints - send empty/minimal bodies, expect 400/422 (not 500)
    { method: 'POST', path: '/users/find-or-create', body: {} },
    { method: 'POST', path: '/execute/sse-token', body: {} },
    { method: 'POST', path: '/inbox/sse-token', body: {} },
    { method: 'POST', path: '/workspace/sse-token', body: {} },
    { method: 'POST', path: '/execute/conversations', body: {} },
    { method: 'POST', path: '/company/tasks/sync', body: {} },
    { method: 'POST', path: '/workspace/ensure', body: {} },

    // Skip destructive/dangerous endpoints
    { method: 'DELETE', path: '/users/me', skip: 'destructive' },
    { method: 'POST', path: '/workspace/stop', skip: 'destructive' },
    { method: 'POST', path: '/workspace/backup', skip: 'slow' },
    { method: 'POST', path: '/billing/subscription/cancel', skip: 'destructive' },
    { method: 'POST', path: '/onboarding/start', skip: 'destructive' },
];

export async function runSmoke(
    baseUrl: string,
    token: string,
    targetName: string,
): Promise<{ results: TestResult[]; passed: number; failed: number; skipped: number }> {
    console.log('\n=== TIER 1: SMOKE TESTS ===\n');

    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const ep of ENDPOINTS) {
        if (ep.skip) {
            skipped++;
            console.log(`[SKIP] ${ep.method} ${ep.path} — ${ep.skip}`);
            continue;
        }

        const url = ep.auth === false
            ? HEALTH_TARGETS[targetName]
            : baseUrl;

        try {
            const { status, body, duration } = await apiCall(
                url, token, ep.method, ep.path, ep.body,
            );

            const pass = status > 0 && status < 500;
            const result: TestResult = {
                name: `smoke:${ep.method}:${ep.path}`,
                method: ep.method,
                path: ep.path,
                status,
                passed: pass,
                duration,
                error: pass ? undefined : `Server error ${status}`,
                body: pass ? undefined : body,
            };

            results.push(result);
            console.log(formatResult(result));

            if (pass) passed++;
            else failed++;
        } catch (err: unknown) {
            failed++;
            const msg = err instanceof Error ? err.message : String(err);
            const result: TestResult = {
                name: `smoke:${ep.method}:${ep.path}`,
                method: ep.method,
                path: ep.path,
                status: 0,
                passed: false,
                duration: 0,
                error: msg,
            };
            results.push(result);
            console.log(formatResult(result));
        }
    }

    console.log(`\nSmoke: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);
    return { results, passed, failed, skipped };
}
