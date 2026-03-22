// LLM Client - OpenRouter Integration
// Provides unified access to LLM providers via OpenRouter

import { ExternalServiceError } from '../errors';

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMCompletionOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: { type: 'json_object' | 'text' };
}

export interface LLMCompletionResponse {
    content: string;
    model: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.7;

function getOpenRouterConfig(): { baseUrl: string; apiKey: string } {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new ExternalServiceError('OpenRouter', 'OPENROUTER_API_KEY not configured');
    }

    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    return { baseUrl, apiKey };
}

interface OpenRouterResponse {
    id: string;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export async function generateCompletion(messages: LLMMessage[], options: LLMCompletionOptions = {}): Promise<LLMCompletionResponse> {
    const { baseUrl, apiKey } = getOpenRouterConfig();

    const model = options.model || DEFAULT_MODEL;
    const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
    const temperature = options.temperature ?? DEFAULT_TEMPERATURE;

    const requestBody: Record<string, unknown> = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
    };

    if (options.responseFormat) {
        requestBody.response_format = options.responseFormat;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.API_BASE_URL || 'http://localhost:5001',
            'X-Title': 'Xerus AI Platform',
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        let errorMessage: string;
        try {
            const error = (await response.json()) as { error?: { message?: string } };
            errorMessage = error.error?.message || response.statusText;
        } catch {
            errorMessage = response.statusText;
        }
        throw new ExternalServiceError('OpenRouter', errorMessage, response.status);
    }

    const data = (await response.json()) as OpenRouterResponse;

    if (!data.choices || data.choices.length === 0) {
        throw new ExternalServiceError('OpenRouter', 'No completion choices returned');
    }

    return {
        content: data.choices[0].message.content,
        model: data.model,
        usage: {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
        },
    };
}

export async function generateJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    options: Omit<LLMCompletionOptions, 'responseFormat'> = {}
): Promise<T> {
    const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ];

    const response = await generateCompletion(messages, {
        ...options,
        responseFormat: { type: 'json_object' },
    });

    try {
        return JSON.parse(response.content) as T;
    } catch {
        throw new ExternalServiceError('OpenRouter', 'Failed to parse JSON response from LLM');
    }
}

export async function healthCheck(): Promise<boolean> {
    const { baseUrl, apiKey } = getOpenRouterConfig();

    const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
        throw new ExternalServiceError('OpenRouter', `Health check failed: ${response.statusText}`, response.status);
    }

    return true;
}
