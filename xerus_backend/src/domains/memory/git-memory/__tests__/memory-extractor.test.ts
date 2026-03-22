// Memory Extractor Service Tests
// Tests for LLM-based memory extraction from conversation context
// Reference: docs/planning/execution/git-memory-system.md (Memory Extraction section)

import { MemoryExtractorService } from '../memory-extractor.service';
import type { LLMClient, ExtractionResult, ExtractionContext } from '../memory-extractor.service';
import type { MemoryScope } from '../../memory.types';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestLLMClient(response: ExtractionResult): LLMClient {
    return {
        generateJSON: async <T>(_systemPrompt: string, _userPrompt: string, _options?: { model?: string; maxTokens?: number; temperature?: number }): Promise<T> => {
            return response as unknown as T;
        },
    };
}

function createFailingLLMClient(error: Error): LLMClient {
    return {
        generateJSON: async <T>(): Promise<T> => {
            throw error;
        },
    };
}

function createCapturingLLMClient(response: ExtractionResult): { client: LLMClient; calls: Array<{ systemPrompt: string; userPrompt: string; options?: Record<string, unknown> }> } {
    const calls: Array<{ systemPrompt: string; userPrompt: string; options?: Record<string, unknown> }> = [];
    const client: LLMClient = {
        generateJSON: async <T>(systemPrompt: string, userPrompt: string, options?: { model?: string; maxTokens?: number; temperature?: number }): Promise<T> => {
            calls.push({ systemPrompt, userPrompt, options: options as Record<string, unknown> });
            return response as unknown as T;
        },
    };
    return { client, calls };
}

const VALID_EXTRACTION: ExtractionResult = {
    working: 'Analyzing keyword data for AI workforce campaign',
    episodic: [
        { event: 'Completed keyword gap analysis', outcome: 'Found 12 target phrases', scope: 'channel' },
        { event: 'Discovered competitor weakness', outcome: 'Competitor X has no coverage on AI workforce mgmt', scope: 'project' },
    ],
    semantic: [
        { fact: 'AI workforce CPC is $2.50', confidence: 0.95, scope: 'channel' },
        { fact: 'User prefers long-tail keywords', confidence: 0.8, scope: 'agent' },
    ],
    procedural: [
        { pattern: 'Keyword gap analysis workflow', steps: ['Export competitor keywords', 'Cross-reference with own rankings', 'Identify gaps'], scope: 'agent' },
    ],
    digest_line: 'Completed keyword gap analysis, found 12 target phrases',
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('MemoryExtractorService', () => {
    describe('extractMemories', () => {
        it('should extract memories from conversation context', async () => {
            const llmClient = createTestLLMClient(VALID_EXTRACTION);
            const service = new MemoryExtractorService(llmClient);

            const context: ExtractionContext = {
                transcript: 'Agent analyzed keywords and found 12 target phrases for AI workforce campaign.',
                agentSlug: 'seo-agent',
            };

            const result = await service.extractMemories(context);

            expect(result.working).toBe(VALID_EXTRACTION.working);
            expect(result.episodic).toHaveLength(2);
            expect(result.semantic).toHaveLength(2);
            expect(result.procedural).toHaveLength(1);
            expect(result.digest_line).toBe(VALID_EXTRACTION.digest_line);
        });

        it('should pass agent slug in the user prompt', async () => {
            const { client, calls } = createCapturingLLMClient(VALID_EXTRACTION);
            const service = new MemoryExtractorService(client);

            const context: ExtractionContext = {
                transcript: 'Test transcript content',
                agentSlug: 'content-writer',
            };

            await service.extractMemories(context);

            expect(calls).toHaveLength(1);
            expect(calls[0].userPrompt).toContain('content-writer');
            expect(calls[0].userPrompt).toContain('Test transcript content');
        });

        it('should use Haiku model for fast extraction', async () => {
            const { client, calls } = createCapturingLLMClient(VALID_EXTRACTION);
            const service = new MemoryExtractorService(client);

            const context: ExtractionContext = {
                transcript: 'Some transcript',
                agentSlug: 'test-agent',
            };

            await service.extractMemories(context);

            expect(calls).toHaveLength(1);
            expect(calls[0].options).toBeDefined();
            expect(calls[0].options!.model).toContain('haiku');
        });

        it('should use low temperature for deterministic extraction', async () => {
            const { client, calls } = createCapturingLLMClient(VALID_EXTRACTION);
            const service = new MemoryExtractorService(client);

            const context: ExtractionContext = {
                transcript: 'Some transcript',
                agentSlug: 'test-agent',
            };

            await service.extractMemories(context);

            expect(calls[0].options!.temperature).toBeLessThanOrEqual(0.3);
        });

        it('should include system prompt with extraction categories', async () => {
            const { client, calls } = createCapturingLLMClient(VALID_EXTRACTION);
            const service = new MemoryExtractorService(client);

            const context: ExtractionContext = {
                transcript: 'Some transcript',
                agentSlug: 'test-agent',
            };

            await service.extractMemories(context);

            const systemPrompt = calls[0].systemPrompt;
            expect(systemPrompt).toContain('WORKING');
            expect(systemPrompt).toContain('EPISODIC');
            expect(systemPrompt).toContain('SEMANTIC');
            expect(systemPrompt).toContain('PROCEDURAL');
            expect(systemPrompt).toContain('workspace');
            expect(systemPrompt).toContain('project');
            expect(systemPrompt).toContain('channel');
            expect(systemPrompt).toContain('agent');
        });

        it('should propagate LLM errors', async () => {
            const error = new Error('LLM API rate limited');
            const llmClient = createFailingLLMClient(error);
            const service = new MemoryExtractorService(llmClient);

            const context: ExtractionContext = {
                transcript: 'Some transcript',
                agentSlug: 'test-agent',
            };

            await expect(service.extractMemories(context)).rejects.toThrow('LLM API rate limited');
        });
    });

    describe('validateExtractionResult', () => {
        it('should accept a valid extraction result', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));

            expect(() => service.validateExtractionResult(VALID_EXTRACTION)).not.toThrow();
        });

        it('should reject result with missing working field', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const invalid = { ...VALID_EXTRACTION, working: '' };

            expect(() => service.validateExtractionResult(invalid)).toThrow();
        });

        it('should reject result with missing digest_line', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const invalid = { ...VALID_EXTRACTION, digest_line: '' };

            expect(() => service.validateExtractionResult(invalid)).toThrow();
        });

        it('should reject episodic entry with invalid scope', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const invalid: ExtractionResult = {
                ...VALID_EXTRACTION,
                episodic: [{ event: 'test', outcome: 'test', scope: 'invalid' as MemoryScope }],
            };

            expect(() => service.validateExtractionResult(invalid)).toThrow();
        });

        it('should reject semantic entry with confidence out of range', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const invalid: ExtractionResult = {
                ...VALID_EXTRACTION,
                semantic: [{ fact: 'test', confidence: 1.5, scope: 'agent' }],
            };

            expect(() => service.validateExtractionResult(invalid)).toThrow();
        });

        it('should reject semantic entry with negative confidence', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const invalid: ExtractionResult = {
                ...VALID_EXTRACTION,
                semantic: [{ fact: 'test', confidence: -0.1, scope: 'agent' }],
            };

            expect(() => service.validateExtractionResult(invalid)).toThrow();
        });

        it('should reject procedural entry with empty steps', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const invalid: ExtractionResult = {
                ...VALID_EXTRACTION,
                procedural: [{ pattern: 'test', steps: [], scope: 'agent' }],
            };

            expect(() => service.validateExtractionResult(invalid)).toThrow();
        });

        it('should accept empty arrays for episodic/semantic/procedural', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const valid: ExtractionResult = {
                working: 'Current state',
                episodic: [],
                semantic: [],
                procedural: [],
                digest_line: 'Summary line',
            };

            expect(() => service.validateExtractionResult(valid)).not.toThrow();
        });
    });

    describe('sanitizeExtractionResult', () => {
        it('should fix invalid scopes by defaulting to agent', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const raw: ExtractionResult = {
                ...VALID_EXTRACTION,
                episodic: [{ event: 'test', outcome: 'test', scope: 'invalid_scope' as MemoryScope }],
            };

            const sanitized = service.sanitizeExtractionResult(raw);

            expect(sanitized.episodic[0].scope).toBe('agent');
        });

        it('should clamp confidence to 0-1 range', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const raw: ExtractionResult = {
                ...VALID_EXTRACTION,
                semantic: [
                    { fact: 'high', confidence: 1.5, scope: 'agent' },
                    { fact: 'low', confidence: -0.5, scope: 'agent' },
                ],
            };

            const sanitized = service.sanitizeExtractionResult(raw);

            expect(sanitized.semantic[0].confidence).toBe(1.0);
            expect(sanitized.semantic[1].confidence).toBe(0.0);
        });

        it('should throw when working state is empty', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const raw = {
                working: '',
                episodic: [],
                semantic: [],
                procedural: [],
                digest_line: 'Summary',
            } as ExtractionResult;

            expect(() => service.sanitizeExtractionResult(raw)).toThrow('LLM returned empty working state');
        });

        it('should throw when digest_line is empty', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const raw = {
                working: 'Some state',
                episodic: [],
                semantic: [],
                procedural: [],
                digest_line: '',
            } as ExtractionResult;

            expect(() => service.sanitizeExtractionResult(raw)).toThrow('LLM returned empty digest_line');
        });

        it('should filter out episodic entries with empty event', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const raw: ExtractionResult = {
                ...VALID_EXTRACTION,
                episodic: [
                    { event: '', outcome: 'test', scope: 'agent' },
                    { event: 'valid event', outcome: 'result', scope: 'agent' },
                ],
            };

            const sanitized = service.sanitizeExtractionResult(raw);

            expect(sanitized.episodic).toHaveLength(1);
            expect(sanitized.episodic[0].event).toBe('valid event');
        });

        it('should filter out semantic entries with empty fact', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const raw: ExtractionResult = {
                ...VALID_EXTRACTION,
                semantic: [
                    { fact: '', confidence: 0.9, scope: 'agent' },
                    { fact: 'valid fact', confidence: 0.8, scope: 'agent' },
                ],
            };

            const sanitized = service.sanitizeExtractionResult(raw);

            expect(sanitized.semantic).toHaveLength(1);
            expect(sanitized.semantic[0].fact).toBe('valid fact');
        });

        it('should filter out procedural entries with empty pattern', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const raw: ExtractionResult = {
                ...VALID_EXTRACTION,
                procedural: [
                    { pattern: '', steps: ['step1'], scope: 'agent' },
                    { pattern: 'valid pattern', steps: ['step1'], scope: 'agent' },
                ],
            };

            const sanitized = service.sanitizeExtractionResult(raw);

            expect(sanitized.procedural).toHaveLength(1);
            expect(sanitized.procedural[0].pattern).toBe('valid pattern');
        });
    });

    describe('extractMemories with sanitization', () => {
        it('should sanitize LLM output before returning', async () => {
            const rawResult: ExtractionResult = {
                working: 'Current state',
                episodic: [{ event: 'test', outcome: 'result', scope: 'bad_scope' as MemoryScope }],
                semantic: [{ fact: 'fact1', confidence: 2.0, scope: 'agent' }],
                procedural: [],
                digest_line: 'Summary',
            };

            const llmClient = createTestLLMClient(rawResult);
            const service = new MemoryExtractorService(llmClient);

            const context: ExtractionContext = {
                transcript: 'Test transcript',
                agentSlug: 'test-agent',
            };

            const result = await service.extractMemories(context);

            // Invalid scope should be fixed to 'agent'
            expect(result.episodic[0].scope).toBe('agent');
            // Confidence should be clamped to 1.0
            expect(result.semantic[0].confidence).toBe(1.0);
        });

        it('should handle LLM returning null arrays gracefully', async () => {
            const rawResult = {
                working: 'Current state',
                episodic: null,
                semantic: null,
                procedural: null,
                digest_line: 'Summary',
            };

            const llmClient = createTestLLMClient(rawResult as unknown as ExtractionResult);
            const service = new MemoryExtractorService(llmClient);

            const context: ExtractionContext = {
                transcript: 'Test transcript',
                agentSlug: 'test-agent',
            };

            const result = await service.extractMemories(context);

            expect(result.episodic).toEqual([]);
            expect(result.semantic).toEqual([]);
            expect(result.procedural).toEqual([]);
        });
    });

    describe('truncateTranscript', () => {
        it('should not truncate transcripts under the limit', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const shortTranscript = 'Short transcript';

            const result = service.truncateTranscript(shortTranscript);

            expect(result).toBe(shortTranscript);
        });

        it('should truncate transcripts over the character limit', () => {
            const service = new MemoryExtractorService(createTestLLMClient(VALID_EXTRACTION));
            const longTranscript = 'x'.repeat(100_000);

            const result = service.truncateTranscript(longTranscript);

            expect(result.length).toBeLessThan(longTranscript.length);
            expect(result).toContain('[truncated]');
        });
    });
});
