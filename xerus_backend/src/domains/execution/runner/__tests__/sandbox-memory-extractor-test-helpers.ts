// Test helpers for SandboxMemoryExtractor tests

import type { ExtractedMemories } from '../../hooks/session-end.types';

export const VALID_API_RESPONSE: ExtractedMemories = {
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

export function buildAnthropicResponse(memories: ExtractedMemories): object {
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

export function buildAnthropicErrorResponse(status: number, message: string): { status: number; body: object } {
    return {
        status,
        body: {
            type: 'error',
            error: { type: 'api_error', message },
        },
    };
}

export interface CapturedFetchCall {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}

export function createFetchCapture(response: object, statusCode = 200): {
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

export function createFailingFetch(statusCode: number, errorBody: object): (url: string, init: RequestInit) => Promise<Response> {
    return async (_url: string, _init: RequestInit): Promise<Response> => {
        return {
            ok: false,
            status: statusCode,
            json: async () => errorBody,
        } as Response;
    };
}

export function createNetworkErrorFetch(error: Error): (url: string, init: RequestInit) => Promise<Response> {
    return async (_url: string, _init: RequestInit): Promise<Response> => {
        throw error;
    };
}
