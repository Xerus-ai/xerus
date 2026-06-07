// PreToolUse Hook Tests
// Tests for tool access validation, allowed tools checking, and HITL rule evaluation
// NO MOCKS - uses real implementations with in-memory test dependencies



import {
    PreToolUseHandler,
    PreToolUseContext,
    PreToolUseHandlerDeps,
    HookExecutionRecord,
} from '../pre-tool-use.hook';
import { PreToolUseInput, PreToolUseOutput } from '../hooks.types';
import type { AgentType } from '../../../platform-tools/orchestrator/tool.filter';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestInput(overrides: Partial<PreToolUseInput> = {}): PreToolUseInput {
    return {
        session_id: 'test-session-123',
        transcript_path: '/workspace/transcript.jsonl',
        cwd: '/workspace',
        tool_name: 'Read',
        tool_input: { file_path: '/workspace/test.txt' },
        agent_id: 'agent-1',
        user_id: 'user-456',
        ...overrides,
    };
}

function createTestContext(overrides: Partial<PreToolUseContext> = {}): PreToolUseContext {
    return {
        agent_id: 123,
        agent_slug: 'test-agent',
        user_id: 'user-456',
        agent_type: 'specialist',
        is_master_orchestrator: false,
        allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
        autonomy_level: 'supervised',
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// In-Memory Dependencies
// -----------------------------------------------------------------------------

class InMemoryHookExecutionLogger {
    public records: HookExecutionRecord[] = [];
    public shouldFail = false;

    async logExecution(record: HookExecutionRecord): Promise<void> {
        if (this.shouldFail) {
            throw new Error('Log failed');
        }
        this.records.push(record);
    }

    getLastRecord(): HookExecutionRecord | undefined {
        return this.records[this.records.length - 1];
    }

    clear(): void {
        this.records = [];
        this.shouldFail = false;
    }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('PreToolUseHandler', () => {
    let handler: PreToolUseHandler;
    let logger: InMemoryHookExecutionLogger;
    let context: PreToolUseContext;

    beforeEach(() => {
        logger = new InMemoryHookExecutionLogger();
        context = createTestContext();

        const deps: PreToolUseHandlerDeps = {
            hookExecutionLogger: logger,
        };

        handler = new PreToolUseHandler(deps, context);
    });

    afterEach(() => {
        logger.clear();
    });

    // -------------------------------------------------------------------------
    // Basic allow/deny decisions
    // -------------------------------------------------------------------------

    describe('allowed tools validation', () => {
        it('should allow tools in the allowed_tools list', async () => {
            const input = createTestInput({ tool_name: 'Read' });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('allow');
        });

        it('should deny tools not in the allowed_tools list', async () => {
            const input = createTestInput({ tool_name: 'WebSearch' });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('deny');
            expect(output.permission_decision_reason).toContain('not in allowed tools');
        });

        it('should allow all tools when allowed_tools is empty (unrestricted)', async () => {
            context = createTestContext({ allowed_tools: [] });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({ tool_name: 'AnyTool' });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('allow');
        });
    });

    // -------------------------------------------------------------------------
    // Tool access validation (agent type restrictions)
    // -------------------------------------------------------------------------

    describe('agent type tool access', () => {
        it('should deny platform tools for specialist agents', async () => {
            context = createTestContext({
                agent_type: 'specialist',
                allowed_tools: ['platform.search_agents', 'Read'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({ tool_name: 'platform.search_agents' });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('deny');
            expect(output.permission_decision_reason).toContain('Platform tools are exclusive');
        });

        it('should deny specialist tools for orchestrator agents', async () => {
            context = createTestContext({
                agent_type: 'orchestrator',
                allowed_tools: ['Read', 'Task'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({ tool_name: 'Read' });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('deny');
            expect(output.permission_decision_reason).toContain('Access denied');
        });

        it('should allow platform tools for master orchestrator', async () => {
            context = createTestContext({
                agent_type: 'orchestrator',
                is_master_orchestrator: true,
                allowed_tools: ['search_agents', 'Task'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({ tool_name: 'search_agents' });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('allow');
        });

        it('should deny platform tools for non-master agents', async () => {
            context = createTestContext({
                agent_type: 'specialist',
                allowed_tools: ['platform.search_agents', 'Read'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({ tool_name: 'platform.search_agents' });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('deny');
        });
    });

    // -------------------------------------------------------------------------
    // HITL rules for platform tools
    // -------------------------------------------------------------------------

    describe('HITL rules', () => {
        it('should return ask for platform tools requiring confirmation', async () => {
            context = createTestContext({
                agent_type: 'orchestrator',
                is_master_orchestrator: true,
                allowed_tools: ['create_agent'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({
                tool_name: 'create_agent',
                tool_input: { name: 'New Agent', description: 'A new agent' },
            });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('ask');
        });

        it('should return allow for auto-approved platform tools', async () => {
            context = createTestContext({
                agent_type: 'orchestrator',
                is_master_orchestrator: true,
                allowed_tools: ['search_agents'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({
                tool_name: 'search_agents',
                tool_input: { query: 'test' },
            });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('allow');
        });

        it('should set requires_auth for connect_tool', async () => {
            context = createTestContext({
                agent_type: 'orchestrator',
                is_master_orchestrator: true,
                allowed_tools: ['connect_tool'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({
                tool_name: 'connect_tool',
                tool_input: { agent_id: 'agent-1', app_slug: 'gmail' },
            });

            const result = await handler.handle(input);

            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('ask');
            expect(output.requires_auth).toBe(true);
        });

        it('should not apply HITL rules for non-platform tools', async () => {
            const input = createTestInput({ tool_name: 'Read' });

            const result = await handler.handle(input);

            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('allow');
            expect(output.requires_auth).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------------
    // Hook execution logging
    // -------------------------------------------------------------------------

    describe('hook execution logging', () => {
        it('should log successful allow decisions', async () => {
            const input = createTestInput({ tool_name: 'Read' });

            await handler.handle(input);

            expect(logger.records).toHaveLength(1);
            const record = logger.getLastRecord()!;
            expect(record.hook_event).toBe('PreToolUse');
            expect(record.agent_id).toBe(123);
            expect(record.user_id).toBe('user-456');
            expect(record.tool_name).toBe('Read');
            expect(record.blocked).toBe(false);
            expect(record.decision).toBe('allow');
        });

        it('should log deny decisions with blocked=true', async () => {
            const input = createTestInput({ tool_name: 'WebSearch' });

            await handler.handle(input);

            expect(logger.records).toHaveLength(1);
            const record = logger.getLastRecord()!;
            expect(record.blocked).toBe(true);
            expect(record.decision).toBe('deny');
            expect(record.reason).toContain('not in allowed tools');
        });

        it('should log ask decisions with blocked=true', async () => {
            context = createTestContext({
                agent_type: 'orchestrator',
                is_master_orchestrator: true,
                allowed_tools: ['create_agent'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({
                tool_name: 'create_agent',
                tool_input: { name: 'Test' },
            });

            await handler.handle(input);

            const record = logger.getLastRecord()!;
            expect(record.blocked).toBe(true);
            expect(record.decision).toBe('ask');
        });

        it('should not fail if logging fails (logging is auxiliary)', async () => {
            logger.shouldFail = true;
            const input = createTestInput({ tool_name: 'Read' });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('allow');
        });
    });

    // -------------------------------------------------------------------------
    // Output format
    // -------------------------------------------------------------------------

    describe('output format', () => {
        it('should always include hook_event_name', async () => {
            const input = createTestInput({ tool_name: 'Read' });

            const result = await handler.handle(input);

            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.hook_event_name).toBe('PreToolUse');
        });

        it('should include reason for all decisions', async () => {
            const input = createTestInput({ tool_name: 'Read' });

            const result = await handler.handle(input);

            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision_reason).toBeDefined();
            expect(typeof output.permission_decision_reason).toBe('string');
        });
    });

    // -------------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
        it('should handle MCP tools (dynamically registered, unknown)', async () => {
            context = createTestContext({
                agent_type: 'specialist',
                allowed_tools: ['mcp__gmail__send_email', 'Read'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({
                tool_name: 'mcp__gmail__send_email',
                tool_input: { to: 'user@example.com' },
            });

            const result = await handler.handle(input);

            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('allow');
        });

        it('should handle common tools (TaskList, TaskGet, etc.) for any agent type', async () => {
            context = createTestContext({
                agent_type: 'specialist',
                allowed_tools: ['TaskList', 'Read'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({ tool_name: 'TaskList' });

            const result = await handler.handle(input);

            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('allow');
        });

        it('should deny tools when agent type is invalid', async () => {
            context = createTestContext({
                agent_type: 'unknown_type' as AgentType,
                allowed_tools: ['Read'],
            });
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            handler = new PreToolUseHandler(deps, context);

            const input = createTestInput({ tool_name: 'Read' });

            const result = await handler.handle(input);

            const output = result.hook_specific_output as PreToolUseOutput;
            expect(output.permission_decision).toBe('deny');
        });
    });

    // -------------------------------------------------------------------------
    // Direct instantiation
    // -------------------------------------------------------------------------

    describe('direct instantiation', () => {
        it('should create handler with correct types', () => {
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            const h = new PreToolUseHandler(deps, context);

            expect(h).toBeInstanceOf(PreToolUseHandler);
        });

        it('should work as a hook handler', async () => {
            const deps: PreToolUseHandlerDeps = { hookExecutionLogger: logger };
            const h = new PreToolUseHandler(deps, context);
            const input = createTestInput();

            const result = await h.handle(input);

            expect(result.success).toBe(true);
            expect(result.hook_specific_output).toBeDefined();
        });
    });
});
