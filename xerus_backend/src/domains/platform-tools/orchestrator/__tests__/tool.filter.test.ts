// Tool Filter Tests
// Verifies orchestrator/specialist tool access restrictions

import {
    validateToolAccess,
    filterToolsForAgent,
    sanitizeSubagentTools,
    buildSpecialistDefaultTools,
    buildOrchestratorDefaultTools,
    assertToolAccess,
    isValidAgentType,
    ToolAccessDeniedError,
    ORCHESTRATOR_ONLY_TOOLS,
    SPECIALIST_TOOLS,
    COMMON_TOOLS,
    TOOL_FILTER_CATEGORIES,
} from '../tool.filter';
import {
    COMMON_PLATFORM_TOOLS,
    ALL_ORCHESTRATOR_PLATFORM_TOOLS,
    ORCHESTRATOR_ONLY_PLATFORM_TOOLS,
} from '../tool-access.constants';
import { buildPlatformRules } from '../../../execution/agent-config-resolver';

describe('Tool Filter', () => {
    describe('validateToolAccess', () => {
        describe('orchestrator agent', () => {
            it('allows common tools (TodoWrite, AskUserQuestion)', () => {
                expect(validateToolAccess('TodoWrite', 'orchestrator')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('AskUserQuestion', 'orchestrator')).toEqual({
                    allowed: true,
                });
            });

            it('allows Task as a common tool', () => {
                expect(validateToolAccess('Task', 'orchestrator')).toEqual({
                    allowed: true,
                });
            });

            it('allows common tools', () => {
                expect(validateToolAccess('TaskList', 'orchestrator')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('TaskGet', 'orchestrator')).toEqual({
                    allowed: true,
                });
            });

            it('denies specialist tools', () => {
                const result = validateToolAccess('Read', 'orchestrator');
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('delegate');

                expect(validateToolAccess('Write', 'orchestrator').allowed).toBe(false);
                expect(validateToolAccess('Edit', 'orchestrator').allowed).toBe(false);
                expect(validateToolAccess('Bash', 'orchestrator').allowed).toBe(false);
                expect(validateToolAccess('Grep', 'orchestrator').allowed).toBe(false);
                expect(validateToolAccess('Glob', 'orchestrator').allowed).toBe(false);
                expect(validateToolAccess('WebSearch', 'orchestrator').allowed).toBe(false);
            });

            it('denies platform tools without master flag', () => {
                const result = validateToolAccess('platform.create_agent', 'orchestrator', false);
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('master Xerus');
            });

            it('allows platform tools with master flag', () => {
                const result = validateToolAccess('platform.create_agent', 'orchestrator', true);
                expect(result.allowed).toBe(true);
            });

            it('allows unknown tools (MCP tools pass through)', () => {
                // MCP tools are dynamically registered by SDK and should pass through
                const result = validateToolAccess('mcp__gmail__send_email', 'orchestrator');
                expect(result.allowed).toBe(true);
            });
        });

        describe('specialist agent', () => {
            it('allows specialist tools', () => {
                expect(validateToolAccess('Read', 'specialist')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('Write', 'specialist')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('Edit', 'specialist')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('Bash', 'specialist')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('Grep', 'specialist')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('Glob', 'specialist')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('WebSearch', 'specialist')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('WebFetch', 'specialist')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('NotebookEdit', 'specialist')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('Skill', 'specialist')).toEqual({
                    allowed: true,
                });
            });

            it('allows common tools', () => {
                expect(validateToolAccess('TaskList', 'specialist')).toEqual({
                    allowed: true,
                });
                expect(validateToolAccess('TaskUpdate', 'specialist')).toEqual({
                    allowed: true,
                });
            });

            it('allows Task as a common tool', () => {
                expect(validateToolAccess('Task', 'specialist')).toEqual({
                    allowed: true,
                });
            });

            it('allows TodoWrite and AskUserQuestion as common tools', () => {
                expect(validateToolAccess('TodoWrite', 'specialist').allowed).toBe(true);
                expect(validateToolAccess('AskUserQuestion', 'specialist').allowed).toBe(true);
            });

            it('denies platform tools', () => {
                const result = validateToolAccess('platform.create_agent', 'specialist');
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('master Xerus');
            });

            it('allows unknown tools (MCP tools pass through)', () => {
                // MCP tools are dynamically registered by SDK and should pass through
                const result = validateToolAccess('mcp__slack__post_message', 'specialist');
                expect(result.allowed).toBe(true);
            });
        });
    });

    describe('filterToolsForAgent', () => {
        it('filters tools for orchestrator', () => {
            const requested = ['Task', 'Read', 'Write', 'TaskList', 'mcp__gmail__send'];
            const result = filterToolsForAgent('orchestrator', requested);

            expect(result.allowedTools).toContain('Task'); // Task is now a common tool
            expect(result.allowedTools).toContain('TaskList');
            expect(result.allowedTools).toContain('mcp__gmail__send'); // MCP tools allowed
            expect(result.allowedTools).not.toContain('Read');
            expect(result.allowedTools).not.toContain('Write');

            expect(result.deniedTools).toHaveLength(2); // Read, Write (orchestrator delegates)
            expect(result.deniedTools.map(d => d.tool)).toContain('Read');
            expect(result.deniedTools.map(d => d.tool)).toContain('Write');
        });

        it('filters tools for specialist', () => {
            const requested = ['Read', 'Write', 'Task', 'TaskList', 'mcp__slack__post'];
            const result = filterToolsForAgent('specialist', requested);

            expect(result.allowedTools).toContain('Read');
            expect(result.allowedTools).toContain('Write');
            expect(result.allowedTools).toContain('Task'); // Task is now a common tool
            expect(result.allowedTools).toContain('TaskList');
            expect(result.allowedTools).toContain('mcp__slack__post'); // MCP tools allowed

            expect(result.deniedTools).toHaveLength(0);
        });

        it('allows platform tools for master orchestrator', () => {
            const requested = ['Task', 'platform.create_agent', 'platform.search_kb'];
            const result = filterToolsForAgent('orchestrator', requested, true);

            expect(result.allowedTools).toContain('Task');
            expect(result.allowedTools).toContain('platform.create_agent');
            expect(result.allowedTools).toContain('platform.search_kb');
            expect(result.deniedTools).toHaveLength(0);
        });

        it('handles empty tool list', () => {
            const result = filterToolsForAgent('orchestrator', []);
            expect(result.allowedTools).toEqual([]);
            expect(result.deniedTools).toEqual([]);
        });
    });

    describe('sanitizeSubagentTools', () => {
        it('removes Task from subagent definition (prevents sub-subagent recursion)', () => {
            const tools = ['Read', 'Write', 'Task', 'Bash', 'TodoWrite'];
            const sanitized = sanitizeSubagentTools(tools);

            expect(sanitized).toContain('Read');
            expect(sanitized).toContain('Write');
            expect(sanitized).toContain('Bash');
            expect(sanitized).not.toContain('Task'); // Stripped to prevent sub-subagent recursion
            expect(sanitized).toContain('TodoWrite'); // Common tool, kept for subagents
        });

        it('removes platform tools from subagent definition', () => {
            const tools = ['Read', 'platform.create_agent', 'platform.search_kb'];
            const sanitized = sanitizeSubagentTools(tools);

            expect(sanitized).toContain('Read');
            expect(sanitized).not.toContain('platform.create_agent');
            expect(sanitized).not.toContain('platform.search_kb');
        });

        it('preserves valid specialist tools but strips Task', () => {
            const tools = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task'];
            const sanitized = sanitizeSubagentTools(tools);

            expect(sanitized).toEqual(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']);
        });
    });

    describe('buildSpecialistDefaultTools', () => {
        it('includes all specialist tools', () => {
            const tools = buildSpecialistDefaultTools();

            for (const tool of SPECIALIST_TOOLS) {
                expect(tools).toContain(tool);
            }
        });

        it('includes common tools', () => {
            const tools = buildSpecialistDefaultTools();

            for (const tool of COMMON_TOOLS) {
                expect(tools).toContain(tool);
            }
        });

        it('includes TodoWrite and AskUserQuestion (now common tools)', () => {
            const tools = buildSpecialistDefaultTools();

            expect(tools).toContain('TodoWrite');
            expect(tools).toContain('AskUserQuestion');
        });
    });

    describe('buildOrchestratorDefaultTools', () => {
        it('includes TodoWrite and AskUserQuestion (common tools)', () => {
            const tools = buildOrchestratorDefaultTools();

            expect(tools).toContain('TodoWrite');
            expect(tools).toContain('AskUserQuestion');
        });

        it('includes common tools', () => {
            const tools = buildOrchestratorDefaultTools();

            for (const tool of COMMON_TOOLS) {
                expect(tools).toContain(tool);
            }
        });

        it('does not include specialist tools', () => {
            const tools = buildOrchestratorDefaultTools();

            for (const tool of SPECIALIST_TOOLS) {
                expect(tools).not.toContain(tool);
            }
        });
    });

    describe('assertToolAccess', () => {
        it('does not throw for allowed tools', () => {
            expect(() => assertToolAccess('Task', 'orchestrator')).not.toThrow();
            expect(() => assertToolAccess('Task', 'specialist')).not.toThrow(); // Task is now common
            expect(() => assertToolAccess('Read', 'specialist')).not.toThrow();
            expect(() => assertToolAccess('TaskList', 'orchestrator')).not.toThrow();
            expect(() => assertToolAccess('TaskList', 'specialist')).not.toThrow();
        });

        it('throws ToolAccessDeniedError for denied tools', () => {
            expect(() => assertToolAccess('Read', 'orchestrator')).toThrow(ToolAccessDeniedError);
            // TodoWrite is now a common tool, so test a different denied case
            expect(() => assertToolAccess('platform.create_agent', 'specialist')).toThrow(ToolAccessDeniedError);
        });

        it('includes tool name and agent type in error', () => {
            try {
                assertToolAccess('Read', 'orchestrator');
                fail('Expected error to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(ToolAccessDeniedError);
                const e = error as ToolAccessDeniedError;
                expect(e.toolName).toBe('Read');
                expect(e.agentType).toBe('orchestrator');
                expect(e.code).toBe('TOOL_ACCESS_DENIED');
                expect(e.statusCode).toBe(403);
            }
        });

        it('allows platform tools for master orchestrator', () => {
            expect(() =>
                assertToolAccess('platform.create_agent', 'orchestrator', true)
            ).not.toThrow();
        });

        it('denies platform tools for non-master orchestrator', () => {
            expect(() =>
                assertToolAccess('platform.create_agent', 'orchestrator', false)
            ).toThrow(ToolAccessDeniedError);
        });
    });

    describe('isValidAgentType', () => {
        it('returns true for valid agent types', () => {
            expect(isValidAgentType('orchestrator')).toBe(true);
            expect(isValidAgentType('specialist')).toBe(true);
        });

        it('returns false for invalid agent types', () => {
            expect(isValidAgentType('admin')).toBe(false);
            expect(isValidAgentType('user')).toBe(false);
            expect(isValidAgentType('')).toBe(false);
            expect(isValidAgentType('ORCHESTRATOR')).toBe(false);
        });
    });

    describe('TOOL_FILTER_CATEGORIES constant', () => {
        it('exports all tool categories', () => {
            expect(TOOL_FILTER_CATEGORIES.orchestratorOnly).toBe(ORCHESTRATOR_ONLY_TOOLS);
            expect(TOOL_FILTER_CATEGORIES.specialist).toBe(SPECIALIST_TOOLS);
            expect(TOOL_FILTER_CATEGORIES.common).toBe(COMMON_TOOLS);
            expect(TOOL_FILTER_CATEGORIES.platform).toEqual(['platform.']);
        });
    });

    describe('specialist platform tool access (mcp__platform__*)', () => {
        it('allows all 21 COMMON_PLATFORM_TOOLS for specialists', () => {
            for (const tool of COMMON_PLATFORM_TOOLS) {
                const result = validateToolAccess(tool, 'specialist');
                expect(result.allowed).toBe(true);
            }
        });

        it('denies orchestrator-only platform tools for specialists', () => {
            for (const tool of ORCHESTRATOR_ONLY_PLATFORM_TOOLS) {
                const result = validateToolAccess(tool, 'specialist');
                expect(result.allowed).toBe(false);
            }
        });

        it('allows all platform tools for master orchestrator', () => {
            for (const tool of ALL_ORCHESTRATOR_PLATFORM_TOOLS) {
                const result = validateToolAccess(tool, 'orchestrator', true);
                expect(result.allowed).toBe(true);
            }
        });
    });

    describe('CONTRACT: prompt-rendered tools ⊆ filter-allowed tools', () => {
        function extractToolsFromPrompt(promptText: string): string[] {
            const match = promptText.match(/Your MCP tools: (.+)/);
            if (!match) return [];
            return match[1].split(', ').map(t => t.trim()).filter(Boolean);
        }

        it('specialist prompt tools are all allowed by the filter', () => {
            const prompt = buildPlatformRules('some-specialist-agent');
            const promptTools = extractToolsFromPrompt(prompt);
            expect(promptTools.length).toBeGreaterThan(0);

            for (const tool of promptTools) {
                const result = validateToolAccess(tool, 'specialist');
                expect({ tool, ...result }).toEqual(expect.objectContaining({
                    tool,
                    allowed: true,
                }));
            }
        });

        it('orchestrator prompt tools are all allowed by the filter for master', () => {
            const prompt = buildPlatformRules('xerus-master');
            const promptTools = extractToolsFromPrompt(prompt);
            expect(promptTools.length).toBeGreaterThan(0);

            for (const tool of promptTools) {
                const result = validateToolAccess(tool, 'orchestrator', true);
                expect({ tool, ...result }).toEqual(expect.objectContaining({
                    tool,
                    allowed: true,
                }));
            }
        });

        it('specialist prompt has exactly COMMON_PLATFORM_TOOLS', () => {
            const prompt = buildPlatformRules('some-specialist-agent');
            const promptTools = extractToolsFromPrompt(prompt);
            expect(new Set(promptTools)).toEqual(new Set(COMMON_PLATFORM_TOOLS));
        });

        it('orchestrator prompt has exactly ALL_ORCHESTRATOR_PLATFORM_TOOLS', () => {
            const prompt = buildPlatformRules('xerus-master');
            const promptTools = extractToolsFromPrompt(prompt);
            expect(new Set(promptTools)).toEqual(new Set(ALL_ORCHESTRATOR_PLATFORM_TOOLS));
        });
    });

    describe('edge cases', () => {
        it('handles tools with similar names correctly', () => {
            // Task, TaskList, TaskCreate are all common tools
            expect(validateToolAccess('Task', 'specialist').allowed).toBe(true);
            expect(validateToolAccess('TaskList', 'specialist').allowed).toBe(true);
            expect(validateToolAccess('TaskCreate', 'specialist').allowed).toBe(true);
        });

        it('handles platform tool prefix matching correctly', () => {
            // Must start with prefix, not just contain it
            expect(validateToolAccess('platform.create_agent', 'specialist').allowed).toBe(false);

            // Unknown tools are ALLOWED (MCP tools pass through)
            const myPlatformResult = validateToolAccess('my_platform_tool', 'specialist');
            expect(myPlatformResult.allowed).toBe(true);

            const filesystemResult = validateToolAccess('filesystem', 'specialist');
            expect(filesystemResult.allowed).toBe(true);
        });
    });
});
