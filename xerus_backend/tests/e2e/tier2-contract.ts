import { apiCall, TestResult, formatResult } from './client';

type AssertFn = (body: unknown, status: number) => string | null;

interface ContractTest {
    name: string;
    method: string;
    path: string;
    body?: unknown;
    assert: AssertFn;
    dependsOn?: string;
}

function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const TESTS: ContractTest[] = [
    // users/me returns user object
    {
        name: 'users-me',
        method: 'GET',
        path: '/users/me',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            const data = isObj(body['data']) ? body['data'] : body;
            if (typeof data['email'] !== 'string') return 'missing email';
            if (typeof data['user_id'] !== 'string') return 'missing user_id';
            return null;
        },
    },
    // agents list returns array (wrapped in data.agents)
    {
        name: 'agents-list',
        method: 'GET',
        path: '/agents',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            const data = isObj(body['data']) ? body['data'] : body;
            const agents = data['agents'] ?? data['data'];
            if (!Array.isArray(agents)) return 'expected agents array in data';
            return null;
        },
    },
    // agents/mine returns array
    {
        name: 'agents-mine',
        method: 'GET',
        path: '/agents/mine',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            const data = isObj(body['data']) ? body['data'] : body;
            const agents = data['agents'] ?? data['data'];
            if (!Array.isArray(agents)) return 'expected agents array in data';
            return null;
        },
    },
    // conversations list
    {
        name: 'conversations-list',
        method: 'GET',
        path: '/execute/conversations',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            const data = isObj(body['data']) ? body['data'] : body;
            if (!Array.isArray(data['conversations'])) return 'expected conversations array';
            return null;
        },
    },
    // company domains
    {
        name: 'company-domains',
        method: 'GET',
        path: '/company/domains',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            const data = isObj(body['data']) ? body['data'] : body;
            if (!Array.isArray(data['domains'])) return 'expected domains array';
            return null;
        },
    },
    // tasks list
    {
        name: 'tasks-list',
        method: 'GET',
        path: '/tasks',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            const data = isObj(body['data']) ? body['data'] : body;
            const tasks = data['tasks'];
            if (!Array.isArray(tasks)) return 'expected tasks array';
            return null;
        },
    },
    // inbox list
    {
        name: 'inbox-list',
        method: 'GET',
        path: '/inbox',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            const data = isObj(body['data']) ? body['data'] : body;
            if (!Array.isArray(data['items'])) return 'expected items array';
            return null;
        },
    },
    // workspace tree
    {
        name: 'workspace-tree',
        method: 'GET',
        path: '/workspace/tree',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            return null;
        },
    },
    // workspace status
    {
        name: 'workspace-status',
        method: 'GET',
        path: '/workspace/status',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            return null;
        },
    },
    // memory
    {
        name: 'memory',
        method: 'GET',
        path: '/memory',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            return null;
        },
    },
    // models list
    {
        name: 'models-list',
        method: 'GET',
        path: '/models',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            if (!Array.isArray(body['models']) && !Array.isArray(body['data']))
                return 'expected models or data array';
            return null;
        },
    },
    // skills list
    {
        name: 'skills-list',
        method: 'GET',
        path: '/skills',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            return null;
        },
    },
    // tools list
    {
        name: 'tools-list',
        method: 'GET',
        path: '/tools',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            return null;
        },
    },
    // credits
    {
        name: 'credits',
        method: 'GET',
        path: '/users/credits',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            return null;
        },
    },
    // schedules
    {
        name: 'schedules-list',
        method: 'GET',
        path: '/execute/schedules',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            return null;
        },
    },
    // 404 contract: nonexistent task returns 404
    {
        name: 'task-404',
        method: 'GET',
        path: '/tasks/nonexistent-task-id-99999',
        assert: (_body, status) => {
            if (status !== 404) return `expected 404, got ${status}`;
            return null;
        },
    },
    // 404 contract: nonexistent task comments returns 404
    {
        name: 'task-comments-404',
        method: 'GET',
        path: '/tasks/nonexistent-task-id-99999/comments',
        assert: (_body, status) => {
            if (status !== 404) return `expected 404, got ${status}`;
            return null;
        },
    },
    // 404 contract: nonexistent task activities returns 404
    {
        name: 'task-activities-404',
        method: 'GET',
        path: '/tasks/nonexistent-task-id-99999/activities',
        assert: (_body, status) => {
            if (status !== 404) return `expected 404, got ${status}`;
            return null;
        },
    },
    // 404 contract: post comment on nonexistent task returns 404
    {
        name: 'task-comment-post-404',
        method: 'POST',
        path: '/tasks/nonexistent-task-id-99999/comments',
        body: { content: 'test comment' },
        assert: (_body, status) => {
            if (status !== 404) return `expected 404, got ${status}`;
            return null;
        },
    },
    // billing subscription shape
    {
        name: 'billing-subscription',
        method: 'GET',
        path: '/billing/subscription',
        assert: (body) => {
            if (!isObj(body)) return 'expected object';
            return null;
        },
    },
];

export async function runContract(
    baseUrl: string,
    token: string,
): Promise<{ results: TestResult[]; passed: number; failed: number }> {
    console.log('\n=== TIER 2: CONTRACT TESTS ===\n');

    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const test of TESTS) {
        try {
            const { status, body, duration } = await apiCall(
                baseUrl, token, test.method, test.path, test.body,
            );

            const assertError = test.assert(body, status);
            const pass = assertError === null && status < 500;

            const result: TestResult = {
                name: `contract:${test.name}`,
                method: test.method,
                path: test.path,
                status,
                passed: pass,
                duration,
                error: assertError || (status >= 500 ? `Server error ${status}` : undefined),
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
                name: `contract:${test.name}`,
                method: test.method,
                path: test.path,
                status: 0,
                passed: false,
                duration: 0,
                error: msg,
            };
            results.push(result);
            console.log(formatResult(result));
        }
    }

    console.log(`\nContract: ${passed} passed, ${failed} failed\n`);
    return { results, passed, failed };
}
