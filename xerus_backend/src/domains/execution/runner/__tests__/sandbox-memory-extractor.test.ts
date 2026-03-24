// SandboxMemoryExtractor Tests
// Tests for direct Anthropic Haiku API memory extraction inside sandbox
// Reference: xerus-y5v.4.169

import { SandboxMemoryExtractor, EXTRACTION_SYSTEM_PROMPT } from '../sandbox-memory-extractor';
import type { ExtractedMemories } from '../../hooks/session-end.types';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

const VALID_API_RESPONSE: ExtractedMemories = {
    working: 'Analyzing keyword data for AI workforce campaign',
    episodic: [
        { event: 'Completed keyword gap analysis', outcome: 'Found 12 target phrases', scope: 'channel' },
    ],
    semantic: [
        { fact: 'AI workforce CPC is $2.50', confidence: 0.95, scope: 'channel' },
    ],
    procedural: [
        { pattern: 'Keyword gap analysis', steps: ['Export competitor keywords', 'Cross-reference', 'Identify gaps'], scope: 'agent' },
    ],
    digest_line: 'Completed keyword gap analysis, found 12 target phrases',
};

function buildAnthropicResponse(memories: ExtractedMemories): object {
    return {
        id: 'msg_test_123',
        type: 'message',
        role: 'assistant',
        content: [
            {
                type: 'text',
                text: JSON.stringify(memories),
            },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 200 },
    };
}

function buildAnthropicErrorResponse(status: number, message: string): { status: number; body: object } {
    return {
        status,
        body: {
            type: 'error',
            error: { type: 'api_error', message },
        },
    };
}

// Capture fetch calls for verification
interface CapturedFetchCall {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}

function createFetchCapture(response: object, statusCode = 200): {
    fetchFn: (url: string, init: RequestInit) => Promise<Response>;
    calls: CapturedFetchCall[];
} {
    const calls: CapturedFetchCall[] = [];
    const fetchFn = async (url: string, init: RequestInit): Promise<Response> => {
        calls.push({
            url,
            method: init.method || 'GET',
            headers: init.headers as Record<string, string>,
            body: JSON.parse(init.body as string),
        });
        return {
            ok: statusCode >= 200 && statusCode < 300,
            status: statusCode,
            json: async () => response,
        } as Response;
    };
    return { fetchFn, calls };
}

function createFailingFetch(statusCode: number, errorBody: object): (url: string, init: RequestInit) => Promise<Response> {
    return async (_url: string, _init: RequestInit): Promise<Response> => {
        return {
            ok: false,
            status: statusCode,
            json: async () => errorBody,
        } as Response;
    };
}

function createNetworkErrorFetch(error: Error): (url: string, init: RequestInit) => Promise<Response> {
    return async (_url: string, _init: RequestInit): Promise<Response> => {
        throw error;
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('SandboxMemoryExtractor', () => {
    const TEST_API_KEY = 'sk-ant-test-key-12345';

    describe('constructor', () => {
        it('should accept explicit API key', () => {
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY });
            expect(extractor).toBeDefined();
        });

        it('should NOT throw on construction even without API key', () => {
            const originalKey = process.env.ANTHROPIC_API_KEY;
            const originalAuth = process.env.ANTHROPIC_AUTH_TOKEN;
            const originalOR = process.env.OPENROUTER_API_KEY;
            delete process.env.ANTHROPIC_API_KEY;
            delete process.env.ANTHROPIC_AUTH_TOKEN;
            delete process.env.OPENROUTER_API_KEY;
            try {
                const extractor = new SandboxMemoryExtractor({});
                expect(extractor).toBeDefined();
            } finally {
                if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
                else delete process.env.ANTHROPIC_API_KEY;
                if (originalAuth) process.env.ANTHROPIC_AUTH_TOKEN = originalAuth;
                else delete process.env.ANTHROPIC_AUTH_TOKEN;
                if (originalOR) process.env.OPENROUTER_API_KEY = originalOR;
                else delete process.env.OPENROUTER_API_KEY;
            }
        });

        it('should throw on extract() when no API key available', async () => {
            const originalKey = process.env.ANTHROPIC_API_KEY;
            const originalAuth = process.env.ANTHROPIC_AUTH_TOKEN;
            const originalOR = process.env.OPENROUTER_API_KEY;
            delete process.env.ANTHROPIC_API_KEY;
            delete process.env.ANTHROPIC_AUTH_TOKEN;
            delete process.env.OPENROUTER_API_KEY;
            try {
                const extractor = new SandboxMemoryExtractor({});
                await expect(extractor.extract('transcript', 'agent')).rejects.toThrow(
                    'No API key available for memory extraction'
                );
            } finally {
                if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
                else delete process.env.ANTHROPIC_API_KEY;
                if (originalAuth) process.env.ANTHROPIC_AUTH_TOKEN = originalAuth;
                else delete process.env.ANTHROPIC_AUTH_TOKEN;
                if (originalOR) process.env.OPENROUTER_API_KEY = originalOR;
                else delete process.env.OPENROUTER_API_KEY;
            }
        });

        it('should use ANTHROPIC_API_KEY from environment when not provided', () => {
            const originalKey = process.env.ANTHROPIC_API_KEY;
            process.env.ANTHROPIC_API_KEY = 'sk-ant-env-key';
            try {
                const extractor = new SandboxMemoryExtractor({});
                expect(extractor).toBeDefined();
            } finally {
                if (originalKey) {
                    process.env.ANTHROPIC_API_KEY = originalKey;
                } else {
                    delete process.env.ANTHROPIC_API_KEY;
                }
            }
        });
    });

    describe('extract', () => {
        it('should call Anthropic API and return structured memories', async () => {
            const apiResponse = buildAnthropicResponse(VALID_API_RESPONSE);
            const { fetchFn, calls } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const result = await extractor.extract('User asked about SEO strategy', 'seo-agent');

            expect(result.working).toBe(VALID_API_RESPONSE.working);
            expect(result.episodic).toHaveLength(1);
            expect(result.semantic).toHaveLength(1);
            expect(result.procedural).toHaveLength(1);
            expect(result.digest_line).toBe(VALID_API_RESPONSE.digest_line);
            expect(calls).toHaveLength(1);
        });

        it('should send correct API endpoint', async () => {
            const apiResponse = buildAnthropicResponse(VALID_API_RESPONSE);
            const { fetchFn, calls } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            await extractor.extract('transcript', 'test-agent');

            expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
        });

        it('should send correct headers with API key', async () => {
            const apiResponse = buildAnthropicResponse(VALID_API_RESPONSE);
            const { fetchFn, calls } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            await extractor.extract('transcript', 'test-agent');

            expect(calls[0].headers['x-api-key']).toBe(TEST_API_KEY);
            expect(calls[0].headers['anthropic-version']).toBe('2023-06-01');
            expect(calls[0].headers['content-type']).toBe('application/json');
        });

        it('should request Haiku model', async () => {
            const apiResponse = buildAnthropicResponse(VALID_API_RESPONSE);
            const { fetchFn, calls } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            await extractor.extract('transcript', 'test-agent');

            const body = calls[0].body as { model: string };
            expect(body.model).toContain('haiku');
        });

        it('should include system prompt with extraction categories', async () => {
            const apiResponse = buildAnthropicResponse(VALID_API_RESPONSE);
            const { fetchFn, calls } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            await extractor.extract('transcript', 'test-agent');

            const body = calls[0].body as { system: string };
            expect(body.system).toContain('WORKING');
            expect(body.system).toContain('EPISODIC');
            expect(body.system).toContain('SEMANTIC');
            expect(body.system).toContain('PROCEDURAL');
        });

        it('should include agent slug and transcript in user message', async () => {
            const apiResponse = buildAnthropicResponse(VALID_API_RESPONSE);
            const { fetchFn, calls } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            await extractor.extract('User discussed marketing plan', 'content-writer');

            const body = calls[0].body as { messages: Array<{ content: string }> };
            expect(body.messages[0].content).toContain('content-writer');
            expect(body.messages[0].content).toContain('User discussed marketing plan');
        });

        it('should throw on API error response', async () => {
            const errorResponse = buildAnthropicErrorResponse(429, 'Rate limited');
            const fetchFn = createFailingFetch(errorResponse.status, errorResponse.body);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            await expect(extractor.extract('transcript', 'test-agent')).rejects.toThrow(
                /Anthropic API error \(429\)/
            );
        });

        it('should throw on network error', async () => {
            const fetchFn = createNetworkErrorFetch(new Error('ECONNREFUSED'));
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            await expect(extractor.extract('transcript', 'test-agent')).rejects.toThrow('ECONNREFUSED');
        });

        it('should throw on malformed JSON in API response', async () => {
            const fetchFn = async (_url: string, _init: RequestInit): Promise<Response> => {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        id: 'msg_test',
                        type: 'message',
                        content: [{ type: 'text', text: 'not valid json {{{' }],
                    }),
                } as Response;
            };
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            await expect(extractor.extract('transcript', 'test-agent')).rejects.toThrow(
                /Failed to parse extraction result/
            );
        });

        it('should truncate long transcripts', async () => {
            const apiResponse = buildAnthropicResponse(VALID_API_RESPONSE);
            const { fetchFn, calls } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const longTranscript = 'x'.repeat(100_000);
            await extractor.extract(longTranscript, 'test-agent');

            const body = calls[0].body as { messages: Array<{ content: string }> };
            expect(body.messages[0].content.length).toBeLessThan(longTranscript.length + 500);
            expect(body.messages[0].content).toContain('[truncated]');
        });

        it('should drop items with invalid scopes from API response', async () => {
            const badResponse: ExtractedMemories = {
                ...VALID_API_RESPONSE,
                episodic: [
                    { event: 'test', outcome: 'ok', scope: 'invalid_scope' as 'agent' },
                    { event: 'valid', outcome: 'good', scope: 'agent' },
                ],
            };
            const apiResponse = buildAnthropicResponse(badResponse);
            const { fetchFn } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const result = await extractor.extract('transcript', 'test-agent');

            expect(result.episodic).toHaveLength(1);
            expect(result.episodic[0].scope).toBe('agent');
            expect(result.episodic[0].event).toBe('valid');
        });

        it('should accept company scope (canonical org-level scope)', async () => {
            const companyResponse: ExtractedMemories = {
                ...VALID_API_RESPONSE,
                episodic: [
                    { event: 'User prefers formal tone', outcome: 'noted', scope: 'company' as 'agent' },
                ],
                semantic: [
                    { fact: 'Company uses React + Next.js', confidence: 0.95, scope: 'company' as 'agent' },
                ],
            };
            const apiResponse = buildAnthropicResponse(companyResponse);
            const { fetchFn } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const result = await extractor.extract('transcript', 'test-agent');

            expect(result.episodic).toHaveLength(1);
            expect(result.episodic[0].scope).toBe('company');
            expect(result.semantic).toHaveLength(1);
            expect(result.semantic[0].scope).toBe('company');
        });

        it('should reject workspace scope (old alias, no longer valid)', async () => {
            const workspaceResponse: ExtractedMemories = {
                ...VALID_API_RESPONSE,
                episodic: [
                    { event: 'org fact', outcome: 'noted', scope: 'workspace' as 'agent' },
                ],
            };
            const apiResponse = buildAnthropicResponse(workspaceResponse);
            const { fetchFn } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const result = await extractor.extract('transcript', 'test-agent');

            expect(result.episodic).toHaveLength(0);
        });

        it('should clamp confidence values out of range', async () => {
            const badResponse: ExtractedMemories = {
                ...VALID_API_RESPONSE,
                semantic: [
                    { fact: 'high', confidence: 1.5, scope: 'agent' },
                    { fact: 'low', confidence: -0.5, scope: 'agent' },
                ],
            };
            const apiResponse = buildAnthropicResponse(badResponse);
            const { fetchFn } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const result = await extractor.extract('transcript', 'test-agent');

            expect(result.semantic[0].confidence).toBe(1.0);
            expect(result.semantic[1].confidence).toBe(0.0);
        });

        it('should handle null arrays from API response', async () => {
            const nullArraysResponse = {
                working: 'Active state',
                episodic: null,
                semantic: null,
                procedural: null,
                digest_line: 'Session summary',
            };
            const apiResponse = buildAnthropicResponse(nullArraysResponse as unknown as ExtractedMemories);
            const { fetchFn } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const result = await extractor.extract('transcript', 'test-agent');

            expect(result.episodic).toEqual([]);
            expect(result.semantic).toEqual([]);
            expect(result.procedural).toEqual([]);
        });

        it('should default empty working to fallback message', async () => {
            const emptyWorkingResponse: ExtractedMemories = {
                ...VALID_API_RESPONSE,
                working: '',
            };
            const apiResponse = buildAnthropicResponse(emptyWorkingResponse);
            const { fetchFn } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const result = await extractor.extract('transcript', 'test-agent');

            expect(result.working).toBe('No active task');
        });

        it('should default empty digest_line to fallback', async () => {
            const emptyDigestResponse: ExtractedMemories = {
                ...VALID_API_RESPONSE,
                digest_line: '',
            };
            const apiResponse = buildAnthropicResponse(emptyDigestResponse);
            const { fetchFn } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const result = await extractor.extract('transcript', 'test-agent');

            expect(result.digest_line).toBe('Session ended');
        });

        it('should filter entries with empty required fields', async () => {
            const emptyEntriesResponse: ExtractedMemories = {
                ...VALID_API_RESPONSE,
                episodic: [
                    { event: '', outcome: 'test', scope: 'agent' },
                    { event: 'valid', outcome: 'ok', scope: 'agent' },
                ],
                semantic: [
                    { fact: '', confidence: 0.9, scope: 'agent' },
                    { fact: 'valid fact', confidence: 0.8, scope: 'agent' },
                ],
                procedural: [
                    { pattern: '', steps: ['step'], scope: 'agent' },
                    { pattern: 'valid', steps: ['step1'], scope: 'agent' },
                ],
            };
            const apiResponse = buildAnthropicResponse(emptyEntriesResponse);
            const { fetchFn } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const result = await extractor.extract('transcript', 'test-agent');

            expect(result.episodic).toHaveLength(1);
            expect(result.semantic).toHaveLength(1);
            expect(result.procedural).toHaveLength(1);
        });
    });

    describe('extract (PreCompactMemoryExtractor interface)', () => {
        it('should return PreCompactExtractedMemories shape (identical to ExtractedMemories)', async () => {
            const apiResponse = buildAnthropicResponse(VALID_API_RESPONSE);
            const { fetchFn } = createFetchCapture(apiResponse);
            const extractor = new SandboxMemoryExtractor({ apiKey: TEST_API_KEY, fetchFn, baseUrl: 'https://api.anthropic.com' });

            const result = await extractor.extract('pre-compact context data', 'seo-agent');

            expect(result).toHaveProperty('working');
            expect(result).toHaveProperty('episodic');
            expect(result).toHaveProperty('semantic');
            expect(result).toHaveProperty('procedural');
            expect(result).toHaveProperty('digest_line');
        });
    });

    describe('EXTRACTION_SYSTEM_PROMPT', () => {
        it('should include all memory categories', () => {
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('WORKING');
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('EPISODIC');
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('SEMANTIC');
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('PROCEDURAL');
        });

        it('should include all scopes', () => {
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('company');
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('project');
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('channel');
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('agent');
        });

        it('should include JSON schema', () => {
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('"working"');
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('"episodic"');
            expect(EXTRACTION_SYSTEM_PROMPT).toContain('"digest_line"');
        });
    });
});
