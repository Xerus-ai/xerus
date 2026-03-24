// SandboxMemoryExtractor
// LLM API call from inside the sandbox for memory extraction.
// Implements both MemoryExtractor (session-end) and PreCompactMemoryExtractor (pre-compact).
// Runs inside the Daytona sandbox.
//
// Auth resolution (matches production sdk.service.ts pattern):
//   1. ANTHROPIC_AUTH_TOKEN (OpenRouter key — set by runner env)
//   2. ANTHROPIC_API_KEY (direct Anthropic key, if non-empty)
//   3. OPENROUTER_API_KEY (legacy env var)
//
// When ANTHROPIC_BASE_URL contains 'openrouter.ai', routes through OpenRouter
// using OpenAI-compatible chat/completions endpoint.
//
// Reference: xerus-y5v.4.169

import type { ExtractedMemories, MemoryExtractor } from '../hooks/session-end.types';
import type { PreCompactExtractedMemories, PreCompactMemoryExtractor } from '../hooks/pre-compact.hook';
import { DEFAULT_LIGHT_MODEL } from '../../agents/types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface SandboxMemoryExtractorOptions {
    apiKey?: string;
    baseUrl?: string;
    fetchFn?: FetchFn;
}

interface AnthropicMessage {
    content: Array<{ type: string; text: string }>;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ANTHROPIC_VERSION = '2023-06-01';
// Direct Anthropic API format (without vendor prefix)
const HAIKU_MODEL = DEFAULT_LIGHT_MODEL.replace('anthropic/', '');
// OpenRouter format (with vendor prefix)
const OPENROUTER_HAIKU_MODEL = DEFAULT_LIGHT_MODEL;
const MAX_TOKENS = 2048;
const MAX_TRANSCRIPT_CHARS = 80_000;

const VALID_SCOPES = new Set(['company', 'project', 'channel', 'agent']);

export const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction system for an AI agent workforce platform.
Given a conversation transcript, extract memories into structured categories.

Categories:
1. WORKING - Current state summary. What is the agent doing right now?
2. EPISODIC - Events that happened. What occurred, what was the outcome?
3. SEMANTIC - Facts learned. Preferences, knowledge, decisions discovered.
4. PROCEDURAL - Patterns learned. Workflows, techniques, approaches mastered.

Scope classification (who should see this memory):
- company: everyone in the organization (company facts, user preferences)
- project: project team members (project decisions, architecture choices)
- channel: channel team members (channel-specific knowledge)
- agent: private to this agent (personal working memory, agent-specific patterns)

Rules:
- Working state is always agent-scoped (private)
- Be concise. Each entry should be a single focused point.
- Confidence for semantic facts: 0.0 (guess) to 1.0 (certain)
- Include a one-line digest summary of the session

Respond ONLY with valid JSON matching this schema:
{
  "working": "string - current state summary",
  "episodic": [{"event": "string", "outcome": "string", "scope": "company|project|channel|agent"}],
  "semantic": [{"fact": "string", "confidence": 0.0-1.0, "scope": "company|project|channel|agent"}],
  "procedural": [{"pattern": "string", "steps": ["string"], "scope": "company|project|channel|agent"}],
  "digest_line": "string - one-line summary"
}`;

// -----------------------------------------------------------------------------
// SandboxMemoryExtractor
// -----------------------------------------------------------------------------

/**
 * Memory extractor that calls an LLM for memory extraction from inside the sandbox.
 * Routes through OpenRouter when ANTHROPIC_BASE_URL is set (production pattern).
 * Routes directly to Anthropic API when using ANTHROPIC_API_KEY.
 */
export class SandboxMemoryExtractor implements MemoryExtractor, PreCompactMemoryExtractor {
    private readonly explicitApiKey: string | undefined;
    private readonly isOpenRouter: boolean;
    private readonly fetchFn: FetchFn;

    constructor(options: SandboxMemoryExtractorOptions) {
        this.explicitApiKey = options.apiKey;
        this.isOpenRouter = detectOpenRouter(options.baseUrl);
        this.fetchFn = options.fetchFn || fetch;
    }

    private resolveKey(): string {
        const key = resolveApiKey(this.explicitApiKey);
        if (!key) {
            throw new Error(
                'No API key available for memory extraction. '
                + 'Set ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY.',
            );
        }
        return key;
    }

    /**
     * Extract structured memories from a conversation transcript using Haiku.
     * Satisfies both MemoryExtractor and PreCompactMemoryExtractor interfaces.
     */
    async extract(transcript: string, agentSlug: string): Promise<ExtractedMemories & PreCompactExtractedMemories> {
        const truncatedTranscript = this.truncateTranscript(transcript);

        const userMessage = `Agent: ${agentSlug}\n\nConversation transcript:\n${truncatedTranscript}`;

        const response = await this.callLLM(userMessage);
        const rawResult = this.parseResponse(response);
        return this.sanitizeResult(rawResult);
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private async callLLM(userMessage: string): Promise<AnthropicMessage> {
        if (this.isOpenRouter) {
            return this.callOpenRouter(userMessage);
        }
        return this.callAnthropicDirect(userMessage);
    }

    private async callOpenRouter(userMessage: string): Promise<AnthropicMessage> {
        const apiKey = this.resolveKey();
        const body = {
            model: OPENROUTER_HAIKU_MODEL,
            max_tokens: MAX_TOKENS,
            messages: [
                { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
        };

        const response = await this.fetchFn(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorBody = await response.json() as { error?: { message?: string } };
            const errorMsg = errorBody?.error?.message || 'Unknown error';
            throw new Error(`OpenRouter API error (${response.status}): ${errorMsg}`);
        }

        const result = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const text = result.choices?.[0]?.message?.content || '';
        return { content: [{ type: 'text', text }] };
    }

    private async callAnthropicDirect(userMessage: string): Promise<AnthropicMessage> {
        const apiKey = this.resolveKey();
        const body = {
            model: HAIKU_MODEL,
            max_tokens: MAX_TOKENS,
            system: EXTRACTION_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
        };

        const response = await this.fetchFn(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_VERSION,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorBody = await response.json() as { error?: { message?: string } };
            const errorMsg = errorBody?.error?.message || 'Unknown error';
            throw new Error(`Anthropic API error (${response.status}): ${errorMsg}`);
        }

        return await response.json() as AnthropicMessage;
    }

    private parseResponse(message: AnthropicMessage): ExtractedMemories {
        const textBlock = message.content.find((block) => block.type === 'text');
        if (!textBlock) {
            throw new Error('Failed to parse extraction result: no text content in response');
        }

        try {
            return JSON.parse(textBlock.text) as ExtractedMemories;
        } catch (_e: unknown) {
            throw new Error(`Failed to parse extraction result: invalid JSON in response`);
        }
    }

    private sanitizeResult(raw: ExtractedMemories): ExtractedMemories {
        const episodic = Array.isArray(raw.episodic) ? raw.episodic : [];
        const semantic = Array.isArray(raw.semantic) ? raw.semantic : [];
        const procedural = Array.isArray(raw.procedural) ? raw.procedural : [];

        return {
            working: raw.working && raw.working.trim().length > 0
                ? raw.working.trim()
                : 'No active task',
            episodic: episodic
                .filter((e) => e.event && e.event.trim().length > 0 && VALID_SCOPES.has(e.scope))
                .map((e) => ({
                    event: e.event.trim(),
                    outcome: (e.outcome || '').trim(),
                    scope: e.scope as MemoryScope,
                })),
            semantic: semantic
                .filter((e) => e.fact && e.fact.trim().length > 0
                    && VALID_SCOPES.has(e.scope)
                    && typeof e.confidence === 'number' && !isNaN(e.confidence))
                .map((e) => ({
                    fact: e.fact.trim(),
                    confidence: Math.max(0, Math.min(1, e.confidence)),
                    scope: e.scope as MemoryScope,
                })),
            procedural: procedural
                .filter((e) => e.pattern && e.pattern.trim().length > 0 && VALID_SCOPES.has(e.scope))
                .map((e) => ({
                    pattern: e.pattern.trim(),
                    steps: Array.isArray(e.steps) ? e.steps.map((s) => s.trim()) : [],
                    scope: e.scope as MemoryScope,
                })),
            digest_line: raw.digest_line && raw.digest_line.trim().length > 0
                ? raw.digest_line.trim()
                : 'Session ended',
        };
    }

    private truncateTranscript(transcript: string): string {
        if (transcript.length <= MAX_TRANSCRIPT_CHARS) {
            return transcript;
        }
        const truncated = transcript.slice(transcript.length - MAX_TRANSCRIPT_CHARS);
        return `[truncated] ...${truncated}`;
    }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Resolve API key following the production pattern from sdk.service.ts:
 * ANTHROPIC_AUTH_TOKEN (OpenRouter key) > ANTHROPIC_API_KEY > OPENROUTER_API_KEY
 */
function resolveApiKey(explicit?: string): string | undefined {
    if (explicit) return explicit;

    // ANTHROPIC_AUTH_TOKEN is the primary key in OpenRouter setups
    // (sdk.service.ts sets this to the resolved OpenRouter key)
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
    if (authToken) return authToken;

    // Direct Anthropic key (non-empty only)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) return apiKey;

    // Backend-level fallback
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey) return openRouterKey;

    return undefined;
}

/**
 * Detect OpenRouter routing from ANTHROPIC_BASE_URL env var.
 */
function detectOpenRouter(explicitBaseUrl?: string): boolean {
    const baseUrl = explicitBaseUrl || process.env.ANTHROPIC_BASE_URL || '';
    return baseUrl.includes('openrouter.ai');
}

type MemoryScope = 'company' | 'project' | 'channel' | 'agent';
