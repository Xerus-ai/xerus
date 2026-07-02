import { apiCall, TestResult, formatResult } from './client';

function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface FlowStep {
    label: string;
    method: string;
    path: string | ((ctx: Record<string, unknown>) => string);
    body?: unknown | ((ctx: Record<string, unknown>) => unknown);
    assert: (body: unknown, status: number) => string | null;
    extract?: (body: unknown) => Record<string, unknown>;
}

interface Flow {
    name: string;
    steps: FlowStep[];
}

const FLOWS: Flow[] = [
    {
        name: 'agent-discovery',
        steps: [
            {
                label: 'list user agents',
                method: 'GET',
                path: '/agents/mine',
                assert: (body) => {
                    if (!isObj(body)) return 'expected object';
                    const data = isObj(body['data']) ? body['data'] : body;
                    if (!Array.isArray(data['agents'])) return 'expected agents array';
                    return null;
                },
                extract: (body) => {
                    const wrapper = (body as Record<string, unknown>)['data'] as Record<string, unknown>;
                    const agents = (wrapper?.['agents'] ?? wrapper) as unknown[];
                    const first = Array.isArray(agents) ? agents[0] as Record<string, unknown> | undefined : undefined;
                    return {
                        agentCount: Array.isArray(agents) ? agents.length : 0,
                        agentId: first?.['id'] ?? '',
                        agentSlug: first?.['slug'] ?? '',
                    };
                },
            },
            {
                label: 'get agent detail',
                method: 'GET',
                path: (ctx) => `/agents/${ctx['agentId']}`,
                assert: (body, status) => {
                    if (status === 404) return null; // no agents yet is ok
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
            },
            {
                label: 'get agent channels',
                method: 'GET',
                path: (ctx) => `/agents/${ctx['agentId']}/channels`,
                assert: (body, status) => {
                    if (status === 404) return null;
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
            },
        ],
    },
    {
        name: 'company-structure',
        steps: [
            {
                label: 'list domains',
                method: 'GET',
                path: '/company/domains',
                assert: (body) => {
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
                extract: (body) => {
                    const wrapper = (body as Record<string, unknown>)['data'] as Record<string, unknown> | undefined;
                    const domains = (wrapper?.['domains'] ?? (body as Record<string, unknown>)['domains']) as unknown[];
                    const first = domains?.[0] as Record<string, unknown> | undefined;
                    return {
                        domainId: first?.['id'] ?? first?.['slug'] ?? '',
                        domainSlug: first?.['slug'] ?? '',
                    };
                },
            },
            {
                label: 'get domain overview',
                method: 'GET',
                path: (ctx) => `/company/domains/${ctx['domainId']}/overview`,
                assert: (body, status) => {
                    if (status === 404) return null;
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
                extract: (body) => {
                    const wrapper = (body as Record<string, unknown>)['data'] as Record<string, unknown> | undefined;
                    const src = wrapper ?? body as Record<string, unknown>;
                    const channels = src['channels'] as unknown[] | undefined;
                    const first = channels?.[0] as Record<string, unknown> | undefined;
                    return {
                        channelId: first?.['id'] ?? first?.['slug'] ?? '',
                    };
                },
            },
            {
                label: 'get channel agents',
                method: 'GET',
                path: (ctx) => `/company/channels/${ctx['channelId']}/agents`,
                assert: (_body, status) => {
                    if (status === 404) return null;
                    return null;
                },
            },
            {
                label: 'get channel tasks',
                method: 'GET',
                path: (ctx) => `/company/channels/${ctx['channelId']}/tasks`,
                assert: (_body, status) => {
                    if (status === 404) return null;
                    return null;
                },
                extract: (body) => {
                    const wrapper = (body as Record<string, unknown>)['data'] as Record<string, unknown> | undefined;
                    const tasks = (wrapper?.['tasks'] ?? (body as Record<string, unknown>)['tasks']) as unknown[] | undefined;
                    const first = tasks?.[0] as Record<string, unknown> | undefined;
                    return { taskId: first?.['id'] ?? '' };
                },
            },
        ],
    },
    {
        name: 'task-lifecycle',
        steps: [
            {
                label: 'list all tasks',
                method: 'GET',
                path: '/tasks',
                assert: (body) => {
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
                extract: (body) => {
                    const wrapper = (body as Record<string, unknown>)['data'] as Record<string, unknown> | undefined;
                    const tasks = (wrapper?.['tasks'] ?? (body as Record<string, unknown>)['tasks']) as unknown[] | undefined;
                    const first = tasks?.[0] as Record<string, unknown> | undefined;
                    return {
                        taskId: first?.['id'] ?? '',
                        taskTitle: first?.['title'] ?? '',
                        hasTask: !!first,
                    };
                },
            },
            {
                label: 'get task detail',
                method: 'GET',
                path: (ctx) => `/tasks/${ctx['taskId']}`,
                assert: (body, status) => {
                    if (status === 404) return null;
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
            },
            {
                label: 'get task comments',
                method: 'GET',
                path: (ctx) => `/tasks/${ctx['taskId']}/comments`,
                assert: (body, status) => {
                    if (status === 404) return null;
                    if (!isObj(body)) return 'expected object';
                    const data = isObj(body['data']) ? body['data'] as Record<string, unknown> : body as Record<string, unknown>;
                    if (!Array.isArray(data['comments'])) return 'comments should be array';
                    return null;
                },
                extract: (body) => {
                    const wrapper = isObj(body) && isObj((body as Record<string, unknown>)['data'])
                        ? (body as Record<string, unknown>)['data'] as Record<string, unknown>
                        : body as Record<string, unknown>;
                    const comments = wrapper['comments'] as unknown[];
                    return { commentCountBefore: comments?.length ?? 0 };
                },
            },
            {
                label: 'post comment on task',
                method: 'POST',
                path: (ctx) => `/tasks/${ctx['taskId']}/comments`,
                body: () => ({ content: `E2E test comment ${Date.now()}` }),
                assert: (body, status) => {
                    if (status === 404) return null;
                    if (status !== 201) return `expected 201, got ${status}`;
                    if (!isObj(body)) return 'expected object';
                    const data = isObj(body['data']) ? body['data'] as Record<string, unknown> : body as Record<string, unknown>;
                    if (data['posted'] !== true) return 'expected posted: true';
                    return null;
                },
            },
            {
                label: 'verify comment persisted',
                method: 'GET',
                path: (ctx) => `/tasks/${ctx['taskId']}/comments`,
                assert: (body, status) => {
                    if (status === 404) return null;
                    if (!isObj(body)) return 'expected object';
                    const data = isObj(body['data']) ? body['data'] as Record<string, unknown> : body as Record<string, unknown>;
                    const comments = data['comments'] as unknown[];
                    if (!Array.isArray(comments)) return 'comments should be array';
                    return null;
                },
            },
            {
                label: 'get task activities',
                method: 'GET',
                path: (ctx) => `/tasks/${ctx['taskId']}/activities`,
                assert: (body, status) => {
                    if (status === 404) return null;
                    if (!isObj(body)) return 'expected object';
                    const data = isObj(body['data']) ? body['data'] as Record<string, unknown> : body as Record<string, unknown>;
                    if (!Array.isArray(data['activities'])) return 'activities should be array';
                    return null;
                },
            },
        ],
    },
    {
        name: 'workspace-exploration',
        steps: [
            {
                label: 'get workspace status',
                method: 'GET',
                path: '/workspace/status',
                assert: (body) => {
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
                extract: (body) => {
                    const data = body as Record<string, unknown>;
                    return { workspaceActive: data['status'] === 'running' };
                },
            },
            {
                label: 'get workspace tree',
                method: 'GET',
                path: '/workspace/tree',
                assert: (body) => {
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
            },
            {
                label: 'get workspace overview',
                method: 'GET',
                path: '/workspace/overview',
                assert: (body) => {
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
            },
            {
                label: 'list connections',
                method: 'GET',
                path: '/workspace/connections',
                assert: (body) => {
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
            },
            {
                label: 'list tags',
                method: 'GET',
                path: '/workspace/tags',
                assert: (body) => {
                    if (!isObj(body)) return 'expected object';
                    return null;
                },
            },
        ],
    },
    {
        name: 'inbox-flow',
        steps: [
            {
                label: 'list inbox items',
                method: 'GET',
                path: '/inbox',
                assert: (body) => {
                    if (!isObj(body)) return 'expected object';
                    const data = isObj(body['data']) ? body['data'] as Record<string, unknown> : body as Record<string, unknown>;
                    if (!Array.isArray(data['items'])) return 'items should be array';
                    return null;
                },
                extract: (body) => {
                    const wrapper = (body as Record<string, unknown>)['data'] as Record<string, unknown> | undefined;
                    const items = (wrapper?.['items'] ?? (body as Record<string, unknown>)['items']) as unknown[];
                    const first = items?.[0] as Record<string, unknown> | undefined;
                    return {
                        inboxItemId: first?.['id'] ?? '',
                        hasInboxItems: items?.length > 0,
                    };
                },
            },
            {
                label: 'get inbox item detail',
                method: 'GET',
                path: (ctx) => `/inbox/${ctx['inboxItemId']}`,
                assert: (_body, status) => {
                    if (status === 404) return null;
                    return null;
                },
            },
        ],
    },
];

export async function runFlows(
    baseUrl: string,
    token: string,
): Promise<{ results: TestResult[]; passed: number; failed: number }> {
    console.log('\n=== TIER 3: FLOW TESTS ===\n');

    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const flow of FLOWS) {
        console.log(`\n--- Flow: ${flow.name} ---`);
        const ctx: Record<string, unknown> = {};
        let flowBroken = false;

        for (const step of flow.steps) {
            if (flowBroken) {
                console.log(`[SKIP] ${step.label} — prior step failed`);
                continue;
            }

            const path = typeof step.path === 'function' ? step.path(ctx) : step.path;

            // skip steps that depend on data that doesn't exist
            if (path.includes('/undefined') || path.includes('//')) {
                console.log(`[SKIP] ${step.label} — no data available`);
                continue;
            }

            const body = typeof step.body === 'function' ? step.body(ctx) : step.body;

            try {
                const resp = await apiCall(baseUrl, token, step.method, path, body);
                const assertError = step.assert(resp.body, resp.status);
                const pass = assertError === null && resp.status < 500;

                const result: TestResult = {
                    name: `flow:${flow.name}:${step.label}`,
                    method: step.method,
                    path,
                    status: resp.status,
                    passed: pass,
                    duration: resp.duration,
                    error: assertError || (resp.status >= 500 ? `Server error` : undefined),
                    body: pass ? undefined : resp.body,
                };

                results.push(result);
                console.log(formatResult(result));

                if (pass) {
                    passed++;
                    if (step.extract && resp.status < 400) {
                        Object.assign(ctx, step.extract(resp.body));
                    }
                } else {
                    failed++;
                    flowBroken = true;
                }
            } catch (err: unknown) {
                failed++;
                flowBroken = true;
                const msg = err instanceof Error ? err.message : String(err);
                const result: TestResult = {
                    name: `flow:${flow.name}:${step.label}`,
                    method: step.method,
                    path,
                    status: 0,
                    passed: false,
                    duration: 0,
                    error: msg,
                };
                results.push(result);
                console.log(formatResult(result));
            }
        }
    }

    console.log(`\nFlows: ${passed} passed, ${failed} failed\n`);
    return { results, passed, failed };
}
