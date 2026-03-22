// Memory Extractor Service
// LLM-based extraction of memories from conversation context before compaction.
// Uses Haiku for fast, cheap extraction. Classifies by memory type and scope.
// Reference: docs/planning/execution/git-memory-system.md (Memory Extraction section)

import { MemoryScope, MEMORY_SCOPES } from '../memory.types';
import { LEGACY_LIGHT_MODEL } from '../../agents/types';

// -----------------------------------------------------------------------------
// LLM Client Interface
// -----------------------------------------------------------------------------

export interface LLMClient {
    generateJSON<T>(
        systemPrompt: string,
        userPrompt: string,
        options?: { model?: string; maxTokens?: number; temperature?: number }
    ): Promise<T>;
}

// -----------------------------------------------------------------------------
// Extraction Types
// -----------------------------------------------------------------------------

export interface EpisodicEntry {
    event: string;
    outcome: string;
    scope: MemoryScope;
}

export interface SemanticEntry {
    fact: string;
    confidence: number;
    scope: MemoryScope;
}

export interface ProceduralEntry {
    pattern: string;
    steps: string[];
    scope: MemoryScope;
}

export interface ExtractionResult {
    working: string;
    episodic: EpisodicEntry[];
    semantic: SemanticEntry[];
    procedural: ProceduralEntry[];
    digest_line: string;
}

export interface ExtractionContext {
    transcript: string;
    agentSlug: string;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const HAIKU_MODEL = LEGACY_LIGHT_MODEL;
const EXTRACTION_MAX_TOKENS = 2048;
const EXTRACTION_TEMPERATURE = 0.2;
const MAX_TRANSCRIPT_CHARS = 80_000;

const VALID_SCOPES = new Set<string>(MEMORY_SCOPES);

// -----------------------------------------------------------------------------
// Extraction Prompt
// -----------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction system for an AI agent workforce platform.
Given a conversation transcript, extract memories into structured categories.

Categories:
1. WORKING - Current state summary. What is the agent doing right now?
2. EPISODIC - Events that happened. What occurred, what was the outcome?
3. SEMANTIC - Facts learned. Preferences, knowledge, decisions discovered.
4. PROCEDURAL - Patterns learned. Workflows, techniques, approaches mastered.

Scope classification (who should see this memory):
- workspace: everyone in the organization (company facts, user preferences)
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
  "episodic": [{"event": "string", "outcome": "string", "scope": "workspace|project|channel|agent"}],
  "semantic": [{"fact": "string", "confidence": 0.0-1.0, "scope": "workspace|project|channel|agent"}],
  "procedural": [{"pattern": "string", "steps": ["string"], "scope": "workspace|project|channel|agent"}],
  "digest_line": "string - one-line summary"
}`;

// -----------------------------------------------------------------------------
// Memory Extractor Service
// -----------------------------------------------------------------------------

export class MemoryExtractorService {
    private readonly llmClient: LLMClient;

    constructor(llmClient: LLMClient) {
        this.llmClient = llmClient;
    }

    /**
     * Extract memories from a conversation transcript using LLM.
     * Sanitizes the LLM output to ensure valid types and scopes.
     */
    async extractMemories(context: ExtractionContext): Promise<ExtractionResult> {
        const truncatedTranscript = this.truncateTranscript(context.transcript);

        const userPrompt = `Agent: ${context.agentSlug}

Conversation transcript:
${truncatedTranscript}`;

        const rawResult = await this.llmClient.generateJSON<ExtractionResult>(
            EXTRACTION_SYSTEM_PROMPT,
            userPrompt,
            {
                model: HAIKU_MODEL,
                maxTokens: EXTRACTION_MAX_TOKENS,
                temperature: EXTRACTION_TEMPERATURE,
            }
        );

        return this.sanitizeExtractionResult(rawResult);
    }

    /**
     * Validate an extraction result. Throws if the result has structural issues
     * that cannot be auto-corrected by sanitization.
     */
    validateExtractionResult(result: ExtractionResult): void {
        if (!result.working || result.working.trim().length === 0) {
            throw new Error('Extraction result missing working state');
        }

        if (!result.digest_line || result.digest_line.trim().length === 0) {
            throw new Error('Extraction result missing digest_line');
        }

        if (Array.isArray(result.episodic)) {
            for (const entry of result.episodic) {
                if (!VALID_SCOPES.has(entry.scope)) {
                    throw new Error(`Invalid episodic scope: ${entry.scope}`);
                }
            }
        }

        if (Array.isArray(result.semantic)) {
            for (const entry of result.semantic) {
                if (entry.confidence < 0 || entry.confidence > 1) {
                    throw new Error(`Semantic confidence out of range: ${entry.confidence}`);
                }
                if (!VALID_SCOPES.has(entry.scope)) {
                    throw new Error(`Invalid semantic scope: ${entry.scope}`);
                }
            }
        }

        if (Array.isArray(result.procedural)) {
            for (const entry of result.procedural) {
                if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
                    throw new Error(`Procedural entry "${entry.pattern}" has no steps`);
                }
                if (!VALID_SCOPES.has(entry.scope)) {
                    throw new Error(`Invalid procedural scope: ${entry.scope}`);
                }
            }
        }
    }

    /**
     * Sanitize LLM output to ensure valid structure.
     * Fixes common LLM output issues:
     * - Invalid scopes default to 'agent'
     * - Confidence clamped to 0-1
     * - Null arrays replaced with empty arrays
     * - Empty entries filtered out
     */
    sanitizeExtractionResult(raw: ExtractionResult): ExtractionResult {
        if (!raw.working || raw.working.trim().length === 0) {
            throw new ExtractionError('LLM returned empty working state');
        }
        if (!raw.digest_line || raw.digest_line.trim().length === 0) {
            throw new ExtractionError('LLM returned empty digest_line');
        }

        const episodic = Array.isArray(raw.episodic) ? raw.episodic : [];
        const semantic = Array.isArray(raw.semantic) ? raw.semantic : [];
        const procedural = Array.isArray(raw.procedural) ? raw.procedural : [];

        return {
            working: raw.working.trim(),
            episodic: episodic
                .filter((e) => e.event && e.event.trim().length > 0)
                .map((e) => ({
                    event: e.event.trim(),
                    outcome: (e.outcome || '').trim(),
                    scope: sanitizeScope(e.scope),
                })),
            semantic: semantic
                .filter((e) => e.fact && e.fact.trim().length > 0)
                .map((e) => ({
                    fact: e.fact.trim(),
                    confidence: clampConfidence(e.confidence),
                    scope: sanitizeScope(e.scope),
                })),
            procedural: procedural
                .filter((e) => e.pattern && e.pattern.trim().length > 0)
                .map((e) => ({
                    pattern: e.pattern.trim(),
                    steps: Array.isArray(e.steps) ? e.steps.map((s) => s.trim()) : [],
                    scope: sanitizeScope(e.scope),
                })),
            digest_line: raw.digest_line.trim(),
        };
    }

    /**
     * Truncate transcript to fit within LLM context limits.
     * Keeps the end of the transcript (most recent context is most valuable).
     */
    truncateTranscript(transcript: string): string {
        if (transcript.length <= MAX_TRANSCRIPT_CHARS) {
            return transcript;
        }

        const truncated = transcript.slice(transcript.length - MAX_TRANSCRIPT_CHARS);
        return `[truncated] ...${truncated}`;
    }
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class ExtractionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExtractionError';
    }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function sanitizeScope(scope: string): MemoryScope {
    if (VALID_SCOPES.has(scope)) {
        return scope as MemoryScope;
    }
    console.warn(`[MemoryExtractor] Unrecognized scope '${scope}' from LLM, defaulting to 'agent'`);
    return 'agent';
}

function clampConfidence(confidence: number): number {
    if (typeof confidence !== 'number' || isNaN(confidence)) {
        return 0.5;
    }
    return Math.max(0, Math.min(1, confidence));
}
