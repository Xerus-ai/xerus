// Platform HITL Rules Tests
// Tests for HITL approval rules specific to platform.* tools
// NO MOCKS - uses real rule evaluator with typed inputs

import {
    evaluateHitlRule,
    getHitlRequirement,
    buildHitlReason,
    UPLOAD_KB_SIZE_LIMIT_BYTES,
} from '../hitl-rules';
import {
    PLATFORM_TOOLS,
    PLATFORM_TOOL_HITL,
} from '../../agents/xerus-master.types';
import type { PreToolUseInput } from '../../hooks/hooks.types';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function createToolInput(
    toolName: string,
    toolInput: Record<string, unknown> = {}
): PreToolUseInput {
    return {
        session_id: 'session-1',
        transcript_path: '/tmp/transcript.jsonl',
        cwd: '/workspace',
        tool_name: toolName,
        tool_input: toolInput,
        agent_id: 'xerus',
        user_id: 'user-123',
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('Platform HITL Rules', () => {
    // -------------------------------------------------------------------------
    // Auto-approve tools (search, status, assign, channel/task creation)
    // -------------------------------------------------------------------------

    describe('auto-approve tools', () => {
        const autoApproveTools = [
            PLATFORM_TOOLS.SEARCH_AGENTS,
            PLATFORM_TOOLS.SEARCH_KB,
            PLATFORM_TOOLS.SEARCH_SKILLS,
            PLATFORM_TOOLS.SEARCH_TOOLS,
            PLATFORM_TOOLS.GET_STATUS,
            PLATFORM_TOOLS.ASSIGN_KB,
            PLATFORM_TOOLS.CREATE_CHANNEL,
            PLATFORM_TOOLS.ADD_TO_CHANNEL,
            PLATFORM_TOOLS.CREATE_TASK,
            // New session control tools (auto)
            PLATFORM_TOOLS.PAUSE_EXECUTION,
            PLATFORM_TOOLS.GET_SESSION_STATE,
            // New memory tools (auto)
            PLATFORM_TOOLS.QUERY_MEMORY,
            PLATFORM_TOOLS.WRITE_MEMORY,
            PLATFORM_TOOLS.ANALYZE_MEMORY_PATTERNS,
            // New trigger tools (auto)
            PLATFORM_TOOLS.LIST_TRIGGERS,
            PLATFORM_TOOLS.DEREGISTER_TRIGGER,
            // New output tool (auto)
            PLATFORM_TOOLS.SEARCH_OUTPUTS,
        ];

        it.each(autoApproveTools)('should auto-approve %s', (toolName) => {
            const input = createToolInput(toolName, { query: 'test' });
            const result = evaluateHitlRule(input);

            expect(result.hook_event_name).toBe('PreToolUse');
            expect(result.permission_decision).toBe('allow');
        });

        it('should return auto-approve reason for search tools', () => {
            const input = createToolInput(PLATFORM_TOOLS.SEARCH_AGENTS, { query: 'test' });
            const result = evaluateHitlRule(input);

            expect(result.permission_decision_reason).toContain('auto-approved');
        });
    });

    // -------------------------------------------------------------------------
    // Always-require-confirmation tools
    // -------------------------------------------------------------------------

    describe('always-confirm tools', () => {
        describe('platform.create_agent', () => {
            it('should require confirmation', () => {
                const input = createToolInput(PLATFORM_TOOLS.CREATE_AGENT, {
                    name: 'My Agent',
                    description: 'A custom agent',
                    systemPrompt: { identity: 'test', goals: 'test' },
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision).toBe('ask');
                expect(result.requires_auth).toBeUndefined();
            });

            it('should include agent name in reason', () => {
                const input = createToolInput(PLATFORM_TOOLS.CREATE_AGENT, {
                    name: 'Scout Sally',
                    description: 'Research agent',
                    systemPrompt: { identity: 'test', goals: 'test' },
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision_reason).toContain('Scout Sally');
            });
        });

        describe('platform.clone_agent', () => {
            it('should require confirmation', () => {
                const input = createToolInput(PLATFORM_TOOLS.CLONE_AGENT, {
                    sourceAgentId: 'agent-1',
                    name: 'Cloned Agent',
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision).toBe('ask');
            });

            it('should include agent name in reason', () => {
                const input = createToolInput(PLATFORM_TOOLS.CLONE_AGENT, {
                    sourceAgentId: 'agent-1',
                    name: 'My Clone',
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision_reason).toContain('My Clone');
            });
        });

        describe('platform.update_agent', () => {
            it('should require confirmation', () => {
                const input = createToolInput(PLATFORM_TOOLS.UPDATE_AGENT, {
                    agent_id: 'agent-1',
                    name: 'Updated',
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision).toBe('ask');
            });
        });

        describe('platform.create_skill', () => {
            it('should require user review', () => {
                const input = createToolInput(PLATFORM_TOOLS.CREATE_SKILL, {
                    name: 'seo-audit',
                    description: 'Runs SEO audits',
                    instructions: '# SEO Audit\n\nRun lighthouse...',
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision).toBe('ask');
            });

            it('should include skill name in reason', () => {
                const input = createToolInput(PLATFORM_TOOLS.CREATE_SKILL, {
                    name: 'data-cleanup',
                    description: 'Cleans data',
                    instructions: 'Remove duplicates...',
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision_reason).toContain('data-cleanup');
            });
        });

        describe('platform.connect_tool', () => {
            it('should require user OAuth', () => {
                const input = createToolInput(PLATFORM_TOOLS.CONNECT_TOOL, {
                    agent_id: 'agent-1',
                    app_slug: 'gmail',
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision).toBe('ask');
                expect(result.requires_auth).toBe(true);
            });

            it('should include app slug in reason', () => {
                const input = createToolInput(PLATFORM_TOOLS.CONNECT_TOOL, {
                    agent_id: 'agent-1',
                    app_slug: 'slack',
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision_reason).toContain('slack');
            });
        });

        describe('platform.configure_heartbeat', () => {
            it('should require confirmation', () => {
                const input = createToolInput(PLATFORM_TOOLS.CONFIGURE_HEARTBEAT, {
                    agent_id: 'agent-1',
                    enabled: true,
                    cron_expression: '0 9 * * *',
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision).toBe('ask');
            });
        });

        describe('platform.resume_execution', () => {
            it('should require user approval', () => {
                const input = createToolInput(PLATFORM_TOOLS.RESUME_EXECUTION, {
                    session_id: 'session-1',
                    approved: true,
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision).toBe('ask');
            });
        });

        describe('platform.register_trigger', () => {
            it('should require confirmation for webhook creation', () => {
                const input = createToolInput(PLATFORM_TOOLS.REGISTER_TRIGGER, {
                    agent_id: '1',
                    app_slug: 'stripe',
                    event_type: 'invoice.created',
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision).toBe('ask');
            });

            it('should include app slug and event type in reason', () => {
                const input = createToolInput(PLATFORM_TOOLS.REGISTER_TRIGGER, {
                    agent_id: '1',
                    app_slug: 'github',
                    event_type: 'push',
                });
                const result = evaluateHitlRule(input);

                expect(result.permission_decision_reason).toContain('github');
                expect(result.permission_decision_reason).toContain('push');
            });
        });
    });

    // -------------------------------------------------------------------------
    // Conditional tools (upload_kb)
    // -------------------------------------------------------------------------

    describe('platform.upload_kb (conditional)', () => {
        it('should auto-approve when content is under 1MB', () => {
            const smallContent = 'a'.repeat(100);
            const input = createToolInput(PLATFORM_TOOLS.UPLOAD_KB, {
                title: 'Small Doc',
                content: smallContent,
            });
            const result = evaluateHitlRule(input);

            expect(result.permission_decision).toBe('allow');
        });

        it('should require confirmation when content exceeds 1MB', () => {
            const largeContent = 'a'.repeat(UPLOAD_KB_SIZE_LIMIT_BYTES + 1);
            const input = createToolInput(PLATFORM_TOOLS.UPLOAD_KB, {
                title: 'Large Doc',
                content: largeContent,
            });
            const result = evaluateHitlRule(input);

            expect(result.permission_decision).toBe('ask');
        });

        it('should auto-approve when content is exactly 1MB', () => {
            const exactContent = 'a'.repeat(UPLOAD_KB_SIZE_LIMIT_BYTES);
            const input = createToolInput(PLATFORM_TOOLS.UPLOAD_KB, {
                title: 'Exact 1MB Doc',
                content: exactContent,
            });
            const result = evaluateHitlRule(input);

            expect(result.permission_decision).toBe('allow');
        });

        it('should require confirmation when using file_path (size unknown)', () => {
            const input = createToolInput(PLATFORM_TOOLS.UPLOAD_KB, {
                title: 'File Upload',
                file_path: '/workspace/docs/large-file.pdf',
            });
            const result = evaluateHitlRule(input);

            expect(result.permission_decision).toBe('ask');
        });

        it('should auto-approve when no content and no file_path (empty doc)', () => {
            const input = createToolInput(PLATFORM_TOOLS.UPLOAD_KB, {
                title: 'Empty Doc',
            });
            const result = evaluateHitlRule(input);

            expect(result.permission_decision).toBe('allow');
        });
    });

    // -------------------------------------------------------------------------
    // Non-platform tools (pass-through)
    // -------------------------------------------------------------------------

    describe('non-platform tools', () => {
        it('should allow non-platform tools (not governed by these rules)', () => {
            const input = createToolInput('Read', { file_path: '/workspace/test.txt' });
            const result = evaluateHitlRule(input);

            expect(result.permission_decision).toBe('allow');
        });

        it('should allow SDK native tools (Task, TeamCreate)', () => {
            const input = createToolInput('Task', {
                subagent_type: 'agent-1',
                prompt: 'do stuff',
            });
            const result = evaluateHitlRule(input);

            expect(result.permission_decision).toBe('allow');
        });
    });

    // -------------------------------------------------------------------------
    // getHitlRequirement
    // -------------------------------------------------------------------------

    describe('getHitlRequirement', () => {
        it('should return auto for search tools', () => {
            expect(getHitlRequirement(PLATFORM_TOOLS.SEARCH_AGENTS)).toBe('auto');
            expect(getHitlRequirement(PLATFORM_TOOLS.SEARCH_KB)).toBe('auto');
            expect(getHitlRequirement(PLATFORM_TOOLS.SEARCH_SKILLS)).toBe('auto');
            expect(getHitlRequirement(PLATFORM_TOOLS.SEARCH_TOOLS)).toBe('auto');
        });

        it('should return always for creation/mutation tools', () => {
            expect(getHitlRequirement(PLATFORM_TOOLS.CREATE_AGENT)).toBe('always');
            expect(getHitlRequirement(PLATFORM_TOOLS.CLONE_AGENT)).toBe('always');
            expect(getHitlRequirement(PLATFORM_TOOLS.CREATE_SKILL)).toBe('always');
            expect(getHitlRequirement(PLATFORM_TOOLS.CONNECT_TOOL)).toBe('always');
        });

        it('should return conditional for upload_kb', () => {
            expect(getHitlRequirement(PLATFORM_TOOLS.UPLOAD_KB)).toBe('conditional');
        });

        it('should return null for non-platform tools', () => {
            expect(getHitlRequirement('Read')).toBeNull();
            expect(getHitlRequirement('Bash')).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // buildHitlReason
    // -------------------------------------------------------------------------

    describe('buildHitlReason', () => {
        it('should build reason for create_agent with name', () => {
            const reason = buildHitlReason(PLATFORM_TOOLS.CREATE_AGENT, { name: 'Test Agent' });
            expect(reason).toContain('Test Agent');
            expect(reason).toContain('create');
        });

        it('should build reason for clone_agent with name', () => {
            const reason = buildHitlReason(PLATFORM_TOOLS.CLONE_AGENT, { name: 'Clone' });
            expect(reason).toContain('Clone');
            expect(reason).toContain('clone');
        });

        it('should build reason for create_skill with name', () => {
            const reason = buildHitlReason(PLATFORM_TOOLS.CREATE_SKILL, { name: 'seo-audit' });
            expect(reason).toContain('seo-audit');
        });

        it('should build reason for connect_tool with app slug', () => {
            const reason = buildHitlReason(PLATFORM_TOOLS.CONNECT_TOOL, { app_slug: 'gmail' });
            expect(reason).toContain('gmail');
            expect(reason).toContain('OAuth');
        });

        it('should build reason for upload_kb exceeding size', () => {
            const reason = buildHitlReason(PLATFORM_TOOLS.UPLOAD_KB, {
                title: 'Big Doc',
                content: 'a'.repeat(UPLOAD_KB_SIZE_LIMIT_BYTES + 1),
            });
            expect(reason).toContain('1MB');
        });

        it('should build generic auto-approved reason for search tools', () => {
            const reason = buildHitlReason(PLATFORM_TOOLS.SEARCH_AGENTS, {});
            expect(reason).toContain('auto-approved');
        });
    });

    // -------------------------------------------------------------------------
    // Coverage: all 27 platform tools have HITL rules
    // -------------------------------------------------------------------------

    describe('HITL coverage', () => {
        it('should have HITL rules for all 32 platform tools', () => {
            const allPlatformTools = Object.values(PLATFORM_TOOLS);
            expect(allPlatformTools).toHaveLength(32);

            for (const tool of allPlatformTools) {
                expect(PLATFORM_TOOL_HITL[tool]).toBeDefined();
            }
        });

        it('should return a valid decision for every platform tool', () => {
            const allPlatformTools = Object.values(PLATFORM_TOOLS);

            for (const tool of allPlatformTools) {
                const input = createToolInput(tool, {
                    query: 'test',
                    name: 'test',
                    agentId: 'a1',
                    agent_id: '1',
                    appSlug: 'gmail',
                    app_slug: 'gmail',
                    event_type: 'test.event',
                    title: 'test',
                    description: 'test',
                    instructions: 'test',
                    channelId: 'c1',
                    session_id: 'session-1',
                    approved: true,
                    content: 'test content',
                    scope: 'company',
                    trigger_id: 1,
                });
                const result = evaluateHitlRule(input);

                expect(result.hook_event_name).toBe('PreToolUse');
                expect(['allow', 'ask', 'deny']).toContain(result.permission_decision);
            }
        });
    });
});
