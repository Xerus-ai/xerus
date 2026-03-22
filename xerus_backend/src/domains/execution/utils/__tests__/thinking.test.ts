import {
    isClaudeModel,
    resolvePermissionMode,
    resolveThinkingConfig,
    THINKING_TOKENS,
    COT_PROMPTS,
    PERMISSION_MAP,
} from '../thinking';

describe('thinking utils', () => {
    describe('isClaudeModel', () => {
        it('returns true for claude-3-opus model', () => {
            expect(isClaudeModel('claude-3-opus-20240229')).toBe(true);
        });

        it('returns true for claude-3-sonnet model', () => {
            expect(isClaudeModel('claude-3-sonnet-20240229')).toBe(true);
        });

        it('returns true for claude-3-haiku model', () => {
            expect(isClaudeModel('claude-3-haiku-20240307')).toBe(true);
        });

        it('returns true for claude-3.5-sonnet model', () => {
            expect(isClaudeModel('claude-3.5-sonnet-20241022')).toBe(true);
        });

        it('returns true for anthropic/ prefixed models', () => {
            expect(isClaudeModel('anthropic/claude-3-opus')).toBe(true);
        });

        it('returns true for claude-opus-4-6 model', () => {
            expect(isClaudeModel('claude-opus-4-6')).toBe(true);
        });

        it('returns false for gpt-4 model', () => {
            expect(isClaudeModel('gpt-4')).toBe(false);
        });

        it('returns false for gpt-4-turbo model', () => {
            expect(isClaudeModel('gpt-4-turbo')).toBe(false);
        });

        it('returns false for gemini-pro model', () => {
            expect(isClaudeModel('gemini-pro')).toBe(false);
        });

        it('returns false for openai/ prefixed models', () => {
            expect(isClaudeModel('openai/gpt-4')).toBe(false);
        });

        it('returns false for google/ prefixed models', () => {
            expect(isClaudeModel('google/gemini-pro')).toBe(false);
        });

        it('returns false for deepseek models', () => {
            expect(isClaudeModel('deepseek-coder')).toBe(false);
        });

        it('handles case insensitively', () => {
            expect(isClaudeModel('Claude-3-Opus')).toBe(true);
            expect(isClaudeModel('CLAUDE-3-SONNET')).toBe(true);
        });
    });

    describe('THINKING_TOKENS', () => {
        it('has correct token budgets for each level', () => {
            expect(THINKING_TOKENS.low).toBe(1024);
            expect(THINKING_TOKENS.medium).toBe(8192);
            expect(THINKING_TOKENS.high).toBe(32768);
        });
    });

    describe('COT_PROMPTS', () => {
        it('has null for low level', () => {
            expect(COT_PROMPTS.low).toBeNull();
        });

        it('has brief reasoning prompt for medium level', () => {
            expect(COT_PROMPTS.medium).toBe(
                'Before answering, briefly outline your reasoning approach.'
            );
        });

        it('has detailed step-by-step prompt for high level', () => {
            expect(COT_PROMPTS.high).toBe(
                'Think step by step. Break the problem into parts, reason carefully about each, then synthesize your answer.'
            );
        });
    });

    describe('PERMISSION_MAP', () => {
        it('maps supervised to default', () => {
            expect(PERMISSION_MAP.supervised).toBe('default');
        });

        it('maps semi_autonomous to acceptEdits', () => {
            expect(PERMISSION_MAP.semi_autonomous).toBe('acceptEdits');
        });

        it('maps autonomous to bypassPermissions', () => {
            expect(PERMISSION_MAP.autonomous).toBe('bypassPermissions');
        });
    });

    describe('resolveThinkingConfig', () => {
        describe('for Claude models', () => {
            const claudeModel = 'claude-3-opus-20240229';

            it('returns maxThinkingTokens for low level', () => {
                const result = resolveThinkingConfig('low', claudeModel);
                expect(result).toEqual({
                    maxThinkingTokens: 1024,
                });
            });

            it('returns maxThinkingTokens for medium level', () => {
                const result = resolveThinkingConfig('medium', claudeModel);
                expect(result).toEqual({
                    maxThinkingTokens: 8192,
                });
            });

            it('returns maxThinkingTokens for high level', () => {
                const result = resolveThinkingConfig('high', claudeModel);
                expect(result).toEqual({
                    maxThinkingTokens: 32768,
                });
            });

            it('does not include systemPrompt suffix', () => {
                const result = resolveThinkingConfig('high', claudeModel);
                expect(result.systemPrompt).toBeUndefined();
            });
        });

        describe('for OpenRouter/non-Claude models', () => {
            const gptModel = 'gpt-4-turbo';

            it('returns no systemPrompt for low level', () => {
                const result = resolveThinkingConfig('low', gptModel);
                expect(result).toEqual({});
            });

            it('returns brief CoT prompt for medium level', () => {
                const result = resolveThinkingConfig('medium', gptModel);
                expect(result).toEqual({
                    systemPrompt: '\n\n## Reasoning\nBefore answering, briefly outline your reasoning approach.',
                });
            });

            it('returns detailed CoT prompt for high level', () => {
                const result = resolveThinkingConfig('high', gptModel);
                expect(result).toEqual({
                    systemPrompt: '\n\n## Reasoning\nThink step by step. Break the problem into parts, reason carefully about each, then synthesize your answer.',
                });
            });

            it('does not include maxThinkingTokens', () => {
                const result = resolveThinkingConfig('high', gptModel);
                expect(result.maxThinkingTokens).toBeUndefined();
            });
        });

        describe('with anthropic/ prefix', () => {
            it('handles anthropic/ prefixed models as Claude', () => {
                const result = resolveThinkingConfig('high', 'anthropic/claude-3-opus');
                expect(result).toEqual({
                    maxThinkingTokens: 32768,
                });
            });
        });

        describe('with openai/ prefix', () => {
            it('handles openai/ prefixed models as non-Claude', () => {
                const result = resolveThinkingConfig('high', 'openai/gpt-4');
                expect(result).toEqual({
                    systemPrompt: '\n\n## Reasoning\nThink step by step. Break the problem into parts, reason carefully about each, then synthesize your answer.',
                });
            });
        });
    });

    describe('resolvePermissionMode', () => {
        it('returns default for supervised', () => {
            expect(resolvePermissionMode('supervised')).toBe('default');
        });

        it('returns acceptEdits for semi_autonomous', () => {
            expect(resolvePermissionMode('semi_autonomous')).toBe('acceptEdits');
        });

        it('returns bypassPermissions for autonomous', () => {
            expect(resolvePermissionMode('autonomous')).toBe('bypassPermissions');
        });
    });
});
