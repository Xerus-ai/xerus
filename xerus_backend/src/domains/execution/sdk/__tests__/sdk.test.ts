// SDK Configuration and Type Guard Tests
// PricingService tests: sdk-pricing.test.ts
// Type structure and streaming tests: sdk-types-streaming.test.ts

import {
    SDK_CONFIG,
    buildSDKEnvironment,
} from '../sdk.config';
import {
    PERMISSION_MODE_MAP,
    isSDKSystemMessage,
    isSDKAssistantMessage,
    isSDKToolProgressMessage,
    isSDKResultMessage,
    isSDKStreamEventMessage,
    SDKSystemMessage,
    SDKAssistantMessage,
    SDKToolProgressMessage,
    SDKResultMessage,
    SDKStreamEventMessage,
} from '../sdk.types';

// -----------------------------------------------------------------------------
// SDK Configuration Tests
// -----------------------------------------------------------------------------

describe('SDK_CONFIG', () => {
    it('has correct OpenRouter base URL', () => {
        expect(SDK_CONFIG.openRouterBaseUrl).toBe('https://openrouter.ai/api');
    });

    it('has default model set to Claude Sonnet 4', () => {
        expect(SDK_CONFIG.defaultModel).toBe('anthropic/claude-sonnet-4');
    });

    it('has reasonable turn and thinking limits', () => {
        expect(SDK_CONFIG.maxTurns).toBe(50);
        expect(SDK_CONFIG.maxThinkingTokens).toBe(10000);
    });

    it('includes essential tools in default allowed tools', () => {
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Read');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Write');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Edit');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Bash');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Grep');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Glob');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Task');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('WebFetch');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('WebSearch');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('TodoWrite');
    });

    it('has 10 default tools', () => {
        expect(SDK_CONFIG.defaultAllowedTools).toHaveLength(10);
    });

    it('has session persistence enabled', () => {
        expect(SDK_CONFIG.persistSession).toBe(true);
    });

    it('has partial messages enabled for streaming', () => {
        expect(SDK_CONFIG.includePartialMessages).toBe(true);
    });

    it('uses bypassPermissions mode', () => {
        expect(SDK_CONFIG.permissionMode).toBe('bypassPermissions');
    });

    it('loads settings from project', () => {
        expect(SDK_CONFIG.settingSources).toContain('project');
    });
});

describe('buildSDKEnvironment', () => {
    it('sets ANTHROPIC_BASE_URL to OpenRouter endpoint', () => {
        const env = buildSDKEnvironment('test-api-key');
        expect(env.ANTHROPIC_BASE_URL).toBe('https://openrouter.ai/api');
    });

    it('sets ANTHROPIC_API_KEY to provided API key', () => {
        const env = buildSDKEnvironment('my-api-key-123');
        expect(env.ANTHROPIC_API_KEY).toBe('my-api-key-123');
    });

    it('does not leak process.env variables into sandbox environment', () => {
        const env = buildSDKEnvironment('test-key');
        expect(env.PATH).toBeUndefined();
        expect(Object.keys(env).length).toBeGreaterThanOrEqual(3);
    });

    describe('XERUS_BACKEND_URL normalization', () => {
        const ORIGINAL_API_BASE_URL = process.env.API_BASE_URL;

        afterEach(() => {
            if (ORIGINAL_API_BASE_URL === undefined) {
                delete process.env.API_BASE_URL;
            } else {
                process.env.API_BASE_URL = ORIGINAL_API_BASE_URL;
            }
        });

        it('strips /api/v1 suffix from API_BASE_URL', () => {
            process.env.API_BASE_URL = 'https://api.xerus.ai/api/v1';
            const env = buildSDKEnvironment('test-key');
            expect(env.XERUS_BACKEND_URL).toBe('https://api.xerus.ai');
        });

        it('strips /api/v1 with trailing slash', () => {
            process.env.API_BASE_URL = 'http://localhost:5001/api/v1/';
            const env = buildSDKEnvironment('test-key');
            expect(env.XERUS_BACKEND_URL).toBe('http://localhost:5001');
        });

        it('passes a bare origin through unchanged', () => {
            process.env.API_BASE_URL = 'http://localhost:5001';
            const env = buildSDKEnvironment('test-key');
            expect(env.XERUS_BACKEND_URL).toBe('http://localhost:5001');
        });

        it('defaults to the production origin when API_BASE_URL is unset', () => {
            delete process.env.API_BASE_URL;
            const env = buildSDKEnvironment('test-key');
            expect(env.XERUS_BACKEND_URL).toBe('https://api.xerus.ai');
        });
    });
});

// -----------------------------------------------------------------------------
// Permission Mode Map Tests
// -----------------------------------------------------------------------------

describe('PERMISSION_MODE_MAP', () => {
    it('maps supervised to default', () => {
        expect(PERMISSION_MODE_MAP.supervised).toBe('default');
    });

    it('maps semi_autonomous to acceptEdits', () => {
        expect(PERMISSION_MODE_MAP.semi_autonomous).toBe('acceptEdits');
    });

    it('maps autonomous to bypassPermissions', () => {
        expect(PERMISSION_MODE_MAP.autonomous).toBe('bypassPermissions');
    });

    it('has exactly 3 autonomy levels', () => {
        expect(Object.keys(PERMISSION_MODE_MAP)).toHaveLength(3);
    });
});

// -----------------------------------------------------------------------------
// Type Guard Tests
// -----------------------------------------------------------------------------

describe('Type Guards', () => {
    describe('isSDKSystemMessage', () => {
        it('returns true for system init message', () => {
            const msg: SDKSystemMessage = {
                type: 'system',
                subtype: 'init',
                session_id: 'session-123',
            };
            expect(isSDKSystemMessage(msg)).toBe(true);
        });

        it('returns false for assistant message', () => {
            const msg: SDKAssistantMessage = {
                type: 'assistant',
                content: [],
            };
            expect(isSDKSystemMessage(msg)).toBe(false);
        });

        it('returns false for result message', () => {
            const msg: SDKResultMessage = {
                type: 'result',
                subtype: 'success',
                usage: { input_tokens: 100, output_tokens: 200 },
                session_id: 'session-123',
            };
            expect(isSDKSystemMessage(msg)).toBe(false);
        });
    });

    describe('isSDKAssistantMessage', () => {
        it('returns true for assistant message with text', () => {
            const msg: SDKAssistantMessage = {
                type: 'assistant',
                content: [{ type: 'text', text: 'Hello' }],
            };
            expect(isSDKAssistantMessage(msg)).toBe(true);
        });

        it('returns true for assistant message with tool use', () => {
            const msg: SDKAssistantMessage = {
                type: 'assistant',
                content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { path: '/test' } }],
            };
            expect(isSDKAssistantMessage(msg)).toBe(true);
        });

        it('returns true for empty content array', () => {
            const msg: SDKAssistantMessage = {
                type: 'assistant',
                content: [],
            };
            expect(isSDKAssistantMessage(msg)).toBe(true);
        });

        it('returns false for tool progress message', () => {
            const msg: SDKToolProgressMessage = {
                type: 'tool_progress',
                tool_use_id: 'tool-123',
                content: 'Processing...',
            };
            expect(isSDKAssistantMessage(msg)).toBe(false);
        });
    });

    describe('isSDKToolProgressMessage', () => {
        it('returns true for tool progress message', () => {
            const msg: SDKToolProgressMessage = {
                type: 'tool_progress',
                tool_use_id: 'tool-123',
                content: 'Reading file...',
            };
            expect(isSDKToolProgressMessage(msg)).toBe(true);
        });

        it('returns false for system message', () => {
            const msg: SDKSystemMessage = {
                type: 'system',
                subtype: 'init',
                session_id: 'session-123',
            };
            expect(isSDKToolProgressMessage(msg)).toBe(false);
        });
    });

    describe('isSDKResultMessage', () => {
        it('returns true for success result', () => {
            const msg: SDKResultMessage = {
                type: 'result',
                subtype: 'success',
                usage: { input_tokens: 100, output_tokens: 200 },
                session_id: 'session-123',
            };
            expect(isSDKResultMessage(msg)).toBe(true);
        });

        it('returns true for error result', () => {
            const msg: SDKResultMessage = {
                type: 'result',
                subtype: 'error',
                usage: { input_tokens: 50, output_tokens: 0 },
                session_id: 'session-123',
                error: 'Something went wrong',
            };
            expect(isSDKResultMessage(msg)).toBe(true);
        });

        it('returns false for stream event', () => {
            const msg: SDKStreamEventMessage = {
                type: 'stream_event',
                event_type: 'content_delta',
                data: { text: 'partial' },
            };
            expect(isSDKResultMessage(msg)).toBe(false);
        });
    });

    describe('isSDKStreamEventMessage', () => {
        it('returns true for stream event message', () => {
            const msg: SDKStreamEventMessage = {
                type: 'stream_event',
                event_type: 'content_delta',
                data: { text: 'partial' },
            };
            expect(isSDKStreamEventMessage(msg)).toBe(true);
        });

        it('returns false for assistant message', () => {
            const msg: SDKAssistantMessage = {
                type: 'assistant',
                content: [],
            };
            expect(isSDKStreamEventMessage(msg)).toBe(false);
        });
    });
});
