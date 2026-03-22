// ACE Extractor Service Tests
// Tests for heuristic analysis (always) + LLM extraction (optional)
// Uses real AceExtractorService with InMemoryLLMClient (not a mock - a real implementation)

import { AceExtractorService, LLMClient, LLMMessage } from '../ace-extractor.service';
import type { ReflectorAnalysis } from '../ace-reflection.trigger';

// -----------------------------------------------------------------------------
// InMemoryLLMClient - real in-memory implementation
// -----------------------------------------------------------------------------

class InMemoryLLMClient implements LLMClient {
    private responses: string[] = [];
    private callIndex = 0;
    readonly completeCalls: Array<{ model: string; messages: LLMMessage[] }> = [];

    addResponse(content: string): void {
        this.responses.push(content);
    }

    async complete(params: { model: string; messages: LLMMessage[] }): Promise<{ content: string }> {
        this.completeCalls.push(params);
        const content = this.responses[this.callIndex] ?? '[]';
        this.callIndex++;
        return { content };
    }
}

// -----------------------------------------------------------------------------
// Test Utilities
// -----------------------------------------------------------------------------

function makeToolCalls(calls: Array<{ name: string; success?: boolean; error?: string }>): unknown[] {
    return calls.map(c => ({ name: c.name, success: c.success ?? true, error: c.error }));
}

// -----------------------------------------------------------------------------
// Tests: Heuristic Mode (no LLM client)
// -----------------------------------------------------------------------------

describe('AceExtractorService', () => {
    describe('heuristic-only mode (no LLM)', () => {
        const extractor = new AceExtractorService();

        it('should return analysis with quality scores for empty input', async () => {
            const result = await extractor.analyze({
                agent_id: 1,
                session_id: 'sess-1',
            });

            expect(result.qualityScores).toBeDefined();
            expect(result.qualityScores.overall).toBe(0);
            expect(result.qualityScores.completeness).toBe(0);
            expect(result.qualityScores.relevance).toBe(0);
            expect(result.qualityScores.accuracy).toBe(0);
            expect(result.insights).toEqual([]);
            expect(result.errors).toEqual([]);
        });

        it('should calculate completeness from response length', async () => {
            const shortResponse = 'ok';
            const longResponse = 'A'.repeat(300);

            const shortResult = await extractor.analyze({
                agent_id: 1, session_id: 's1', response: shortResponse,
            });
            const longResult = await extractor.analyze({
                agent_id: 1, session_id: 's2', response: longResponse,
            });

            // Short response: 2/200 = 0.01
            expect(shortResult.qualityScores.completeness).toBeCloseTo(0.01, 1);
            // Long response: 300/200 clamped to 1.0
            expect(longResult.qualityScores.completeness).toBe(1);
        });

        it('should calculate relevance from tool call count', async () => {
            const noTools = await extractor.analyze({
                agent_id: 1, session_id: 's1', response: 'test',
            });
            const fewTools = await extractor.analyze({
                agent_id: 1, session_id: 's2', response: 'test',
                tool_calls: makeToolCalls([{ name: 'Read' }, { name: 'Write' }]),
            });
            const manyTools = await extractor.analyze({
                agent_id: 1, session_id: 's3', response: 'test',
                tool_calls: makeToolCalls([
                    { name: 'Read' }, { name: 'Write' }, { name: 'Grep' },
                    { name: 'Bash' }, { name: 'Edit' },
                ]),
            });

            // No tools with response: 0.3
            expect(noTools.qualityScores.relevance).toBe(0.3);
            // 2 tools: 2/5 = 0.4
            expect(fewTools.qualityScores.relevance).toBe(0.4);
            // 5 tools: 5/5 = 1.0
            expect(manyTools.qualityScores.relevance).toBe(1);
        });

        it('should calculate accuracy from tool success ratio', async () => {
            const allSuccess = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                tool_calls: makeToolCalls([
                    { name: 'Read', success: true },
                    { name: 'Write', success: true },
                ]),
            });
            const halfFailed = await extractor.analyze({
                agent_id: 1, session_id: 's2',
                tool_calls: makeToolCalls([
                    { name: 'Read', success: true },
                    { name: 'Write', success: false },
                ]),
            });

            expect(allSuccess.qualityScores.accuracy).toBe(1);
            expect(halfFailed.qualityScores.accuracy).toBe(0.5);
        });

        it('should detect multi-tool workflow pattern', async () => {
            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                tool_calls: makeToolCalls([
                    { name: 'Read' }, { name: 'Grep' }, { name: 'Write' },
                ]),
            });

            const workflowInsight = result.insights.find(i => i.type === 'workflow');
            expect(workflowInsight).toBeDefined();
            expect(workflowInsight!.content).toContain('3 different tools');
            expect(workflowInsight!.confidence).toBe(0.6);
        });

        it('should not detect workflow with fewer than 3 tool calls', async () => {
            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                tool_calls: makeToolCalls([{ name: 'Read' }, { name: 'Write' }]),
            });

            const workflowInsight = result.insights.find(i => i.type === 'workflow');
            expect(workflowInsight).toBeUndefined();
        });

        it('should detect success completion pattern', async () => {
            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'A'.repeat(150),
                tool_calls: makeToolCalls([
                    { name: 'Read', success: true },
                    { name: 'Write', success: true },
                ]),
            });

            const successInsight = result.insights.find(i => i.type === 'success_pattern');
            expect(successInsight).toBeDefined();
            expect(successInsight!.confidence).toBe(0.7);
        });

        it('should not detect success pattern when tool calls failed', async () => {
            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'A'.repeat(150),
                tool_calls: makeToolCalls([
                    { name: 'Read', success: true },
                    { name: 'Write', success: false },
                ]),
            });

            const successInsight = result.insights.find(i => i.type === 'success_pattern');
            expect(successInsight).toBeUndefined();
        });

        it('should detect tool failure errors', async () => {
            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                tool_calls: makeToolCalls([
                    { name: 'Read', success: true },
                    { name: 'Bash', success: false, error: 'Permission denied' },
                ]),
            });

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].type).toBe('tool_failure');
            expect(result.errors[0].severity).toBe('warning');
            expect(result.errors[0].description).toContain('Bash');
            expect(result.errors[0].description).toContain('Permission denied');
        });

        it('should detect technical domain from WebSearch/WebFetch', async () => {
            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                tool_calls: makeToolCalls([{ name: 'WebSearch' }]),
            });

            expect(result.patterns?.domain).toBe('technical');
        });

        it('should detect creative domain from Write/Edit', async () => {
            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                tool_calls: makeToolCalls([{ name: 'Write' }]),
            });

            expect(result.patterns?.domain).toBe('creative');
        });

        it('should include timestamp in analysis', async () => {
            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
            });

            expect(result.timestamp).toBeDefined();
            expect(new Date(result.timestamp!).getTime()).not.toBeNaN();
        });

        it('should handle malformed tool_calls gracefully', async () => {
            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                tool_calls: [null, 'string', 42, { name: 'Read' }],
            });

            // Should not throw, normalizes gracefully
            expect(result.qualityScores).toBeDefined();
        });
    });

    // -------------------------------------------------------------------------
    // Tests: LLM Mode
    // -------------------------------------------------------------------------

    describe('LLM extraction mode', () => {
        it('should call LLM when client provided and response exists', async () => {
            const llm = new InMemoryLLMClient();
            llm.addResponse(JSON.stringify([
                { type: 'success_pattern', content: 'Agent solved the task efficiently', confidence: 0.9, domain: 'technical', keywords: ['efficiency'] },
            ]));

            const extractor = new AceExtractorService(llm);

            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'I analyzed the codebase and found the bug in auth.ts',
                tool_calls: makeToolCalls([{ name: 'Read' }, { name: 'Grep' }]),
            });

            expect(llm.completeCalls).toHaveLength(1);
            expect(llm.completeCalls[0].model).toBe('anthropic/claude-3.5-haiku');

            // Should have both heuristic + LLM insights
            const llmInsight = result.insights.find(i => i.content === 'Agent solved the task efficiently');
            expect(llmInsight).toBeDefined();
            expect(llmInsight!.confidence).toBe(0.9);
        });

        it('should not call LLM when no response provided', async () => {
            const llm = new InMemoryLLMClient();
            const extractor = new AceExtractorService(llm);

            await extractor.analyze({
                agent_id: 1, session_id: 's1',
                tool_calls: makeToolCalls([{ name: 'Read' }]),
            });

            expect(llm.completeCalls).toHaveLength(0);
        });

        it('should merge heuristic and LLM insights', async () => {
            const llm = new InMemoryLLMClient();
            llm.addResponse(JSON.stringify([
                { type: 'user_preference', content: 'Prefers concise responses', confidence: 0.8 },
            ]));

            const extractor = new AceExtractorService(llm);

            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'A'.repeat(200),
                tool_calls: makeToolCalls([
                    { name: 'Read' }, { name: 'Write' }, { name: 'Grep' },
                ]),
            });

            // Heuristic: should have workflow insight (3+ tools, 3 unique)
            const workflowInsight = result.insights.find(i => i.type === 'workflow');
            expect(workflowInsight).toBeDefined();

            // LLM: should have user_preference insight
            const prefInsight = result.insights.find(i => i.type === 'user_preference');
            expect(prefInsight).toBeDefined();
            expect(prefInsight!.content).toBe('Prefers concise responses');
        });

        it('should parse LLM response with code fences', async () => {
            const llm = new InMemoryLLMClient();
            llm.addResponse('```json\n[{"type": "workflow", "content": "test", "confidence": 0.5}]\n```');

            const extractor = new AceExtractorService(llm);

            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'test response',
            });

            const llmInsight = result.insights.find(i => i.content === 'test');
            expect(llmInsight).toBeDefined();
        });

        it('should propagate LLM errors (fail-fast)', async () => {
            const llm = new InMemoryLLMClient();
            // Override complete to throw
            llm.complete = async () => { throw new Error('LLM rate limited'); };

            const extractor = new AceExtractorService(llm);

            await expect(extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'test',
            })).rejects.toThrow('LLM rate limited');
        });

        it('should truncate long responses for LLM', async () => {
            const llm = new InMemoryLLMClient();
            llm.addResponse('[]');

            const extractor = new AceExtractorService(llm, { model: 'test', maxResponseLength: 100 });

            await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'A'.repeat(500),
            });

            // The prompt sent to LLM should contain truncated response
            const userMessage = llm.completeCalls[0].messages.find(m => m.role === 'user');
            // The full 500 char response should be truncated to 100
            expect(userMessage!.content).not.toContain('A'.repeat(500));
            expect(userMessage!.content).toContain('A'.repeat(100));
        });

        it('should use custom model from config', async () => {
            const llm = new InMemoryLLMClient();
            llm.addResponse('[]');

            const extractor = new AceExtractorService(llm, { model: 'openai/gpt-4o-mini', maxResponseLength: 5000 });

            await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'test',
            });

            expect(llm.completeCalls[0].model).toBe('openai/gpt-4o-mini');
        });

        it('should clamp confidence values from LLM to 0-1 range', async () => {
            const llm = new InMemoryLLMClient();
            llm.addResponse(JSON.stringify([
                { type: 'test', confidence: 1.5 },
                { type: 'test2', confidence: -0.2 },
            ]));

            const extractor = new AceExtractorService(llm);

            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'test',
            });

            const llmInsights = result.insights.filter(i => i.type === 'test' || i.type === 'test2');
            expect(llmInsights[0].confidence).toBe(1);
            expect(llmInsights[1].confidence).toBe(0);
        });

        it('should filter out items without type from LLM response', async () => {
            const llm = new InMemoryLLMClient();
            llm.addResponse(JSON.stringify([
                { content: 'no type field' },
                { type: 'valid', content: 'has type' },
                'not an object',
            ]));

            const extractor = new AceExtractorService(llm);

            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'test',
            });

            const llmInsights = result.insights.filter(i => i.content === 'has type' || i.content === 'no type field');
            expect(llmInsights).toHaveLength(1);
            expect(llmInsights[0].content).toBe('has type');
        });
    });

    // -------------------------------------------------------------------------
    // Tests: ReflectorService interface compliance
    // -------------------------------------------------------------------------

    describe('ReflectorService interface', () => {
        it('should return ReflectorAnalysis with all required fields', async () => {
            const extractor = new AceExtractorService();

            const result: ReflectorAnalysis = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'test',
                tool_calls: makeToolCalls([{ name: 'Read' }]),
            });

            expect(result.qualityScores).toHaveProperty('overall');
            expect(result.insights).toBeInstanceOf(Array);
            expect(result.errors).toBeInstanceOf(Array);
        });

        it('should produce overall score as weighted combination', async () => {
            const extractor = new AceExtractorService();

            const result = await extractor.analyze({
                agent_id: 1, session_id: 's1',
                response: 'A'.repeat(200), // completeness = 1.0
                tool_calls: makeToolCalls([
                    { name: 'R1' }, { name: 'R2' }, { name: 'R3' },
                    { name: 'R4' }, { name: 'R5' }, // relevance = 1.0
                ]),
            });

            // completeness=1.0, relevance=1.0, accuracy=1.0 (all success by default)
            // overall = 1.0*0.3 + 1.0*0.3 + 1.0*0.4 = 1.0
            expect(result.qualityScores.overall).toBeCloseTo(1.0, 1);
        });
    });
});
