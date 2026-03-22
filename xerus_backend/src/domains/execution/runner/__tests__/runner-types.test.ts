import type {
    CreditResponseCommand,
    RunnerEvent,
    RunnerEventType,
    AgentOutputEvent,
    SessionEndedEvent,
    HeartbeatFiredEvent,
    HeartbeatSkippedEvent,
    HealthResponseEvent,
    SessionsListEvent,
    CreditCheckEvent,
    SseForwardEvent,
    CreditUsageEvent,
    SessionAnalyticsEvent,
    UpdateAgentRunEvent,
    CreateInboxItemEvent,
    PushNotificationEvent,
    DelegationRecordEvent,
    HookLogEvent,
    AceReflectionEvent,
    SkillSuggestionEvent,
    SandboxLifecycleEvent,
    TriggerIndexingEvent,
    SubagentFailureEvent,
    AgentConfig,
    HeartbeatConfig,
    McpServerConfig,
    SessionState,
    RunnerConfig,
} from '../runner.types';
import { RUNNER_ENV } from '../runner.types';

describe('Runner v2 Types', () => {
    describe('CreditResponseCommand (retained for backend use)', () => {
        it('validates credit_response command shape', () => {
            const approved: CreditResponseCommand = {
                cmd: 'credit_response',
                agent: 'seo-writer',
                approved: true,
                reserved_credits: 500,
                balance_remaining: 4500,
            };
            expect(approved.approved).toBe(true);

            const denied: CreditResponseCommand = {
                cmd: 'credit_response',
                agent: 'seo-writer',
                approved: false,
                reason: 'insufficient_credits',
                balance_remaining: 0,
            };
            expect(denied.approved).toBe(false);
        });
    });

    describe('outbound events', () => {
        it('supports all event types', () => {
            const types: RunnerEventType[] = [
                'agent_output', 'session_started', 'session_ended',
                'agent_message', 'heartbeat_fired', 'heartbeat_skipped',
                'health', 'sessions', 'credit_check', 'error',
                'sse_forward', 'credit_usage', 'session_analytics',
                'update_agent_run', 'create_inbox_item', 'push_notification',
                'delegation_record', 'hook_log', 'ace_reflection',
                'skill_suggestion', 'sandbox_lifecycle', 'trigger_indexing',
                'subagent_failure',
            ];
            expect(types).toHaveLength(23);
        });

        it('validates agent_output event shape', () => {
            const event: AgentOutputEvent = {
                event: 'agent_output',
                agent: 'seo-writer',
                session_id: 'abc-123',
                data: { type: 'assistant', message: { content: 'Hello' } },
            };
            expect(event.event).toBe('agent_output');
        });

        it('validates session_ended event with usage', () => {
            const event: SessionEndedEvent = {
                event: 'session_ended',
                agent: 'seo-writer',
                session_id: 'abc-123',
                reason: 'complete',
                usage: { input_tokens: 3000, output_tokens: 2000, total_tokens: 5000 },
            };
            expect(event.usage.input_tokens).toBe(3000);
        });

        it('validates credit_check event shape', () => {
            const event: CreditCheckEvent = {
                event: 'credit_check',
                agent: 'seo-writer',
                estimated_tokens: 50000,
                trigger: 'heartbeat',
            };
            expect(event.trigger).toBe('heartbeat');
        });

        it('validates heartbeat events', () => {
            const fired: HeartbeatFiredEvent = {
                event: 'heartbeat_fired',
                agent: 'seo-writer',
                had_work: true,
            };
            expect(fired.had_work).toBe(true);

            const skipped: HeartbeatSkippedEvent = {
                event: 'heartbeat_skipped',
                agent: 'ad-optimizer',
                reason: 'outside_active_hours',
            };
            expect(skipped.reason).toBe('outside_active_hours');
        });

        it('validates health response', () => {
            const event: HealthResponseEvent = {
                event: 'health',
                status: 'ok',
                active_sessions: 2,
                uptime_seconds: 3600,
                agents_registered: 5,
            };
            expect(event.status).toBe('ok');
        });

        it('validates sessions list', () => {
            const event: SessionsListEvent = {
                event: 'sessions',
                sessions: [{
                    agent: 'seo-writer',
                    session_id: 'abc-123',
                    started_at: '2025-02-15T10:00:00Z',
                    status: 'running',
                }],
            };
            expect(event.sessions).toHaveLength(1);
        });

        it('validates sse_forward event', () => {
            const event: SseForwardEvent = {
                event: 'sse_forward',
                sse_event: 'progress',
                payload: { percent: 50 },
            };
            expect(event.sse_event).toBe('progress');
        });

        it('validates credit_usage event', () => {
            const event: CreditUsageEvent = {
                event: 'credit_usage',
                agent: 'seo-writer',
                input_tokens: 1000,
                output_tokens: 500,
                cost_usd: 0.05,
                credits_consumed: 50,
            };
            expect(event.credits_consumed).toBe(50);
        });

        it('validates session_analytics event', () => {
            const event: SessionAnalyticsEvent = {
                event: 'session_analytics',
                agent: 'seo-writer',
                duration_ms: 30000,
                tool_calls: 5,
                turns: 3,
                model: 'claude-sonnet-4-5-20250929',
            };
            expect(event.tool_calls).toBe(5);
        });

        it('validates update_agent_run event', () => {
            const event: UpdateAgentRunEvent = {
                event: 'update_agent_run',
                agent: 'seo-writer',
                run_id: 'run-abc',
                status: 'completed',
                metadata: { pages_analyzed: 12 },
            };
            expect(event.status).toBe('completed');
        });

        it('validates create_inbox_item event', () => {
            const event: CreateInboxItemEvent = {
                event: 'create_inbox_item',
                agent: 'seo-writer',
                channel: 'seo',
                content: 'Report ready for review',
                priority: 'high',
            };
            expect(event.priority).toBe('high');
        });

        it('validates push_notification event', () => {
            const event: PushNotificationEvent = {
                event: 'push_notification',
                agent: 'seo-writer',
                user_id: 'user-123',
                title: 'Task Complete',
                body: 'SEO audit finished',
                action_url: '/inbox/seo',
            };
            expect(event.title).toBe('Task Complete');
        });

        it('validates delegation_record event', () => {
            const event: DelegationRecordEvent = {
                event: 'delegation_record',
                from_agent: 'xerus-master',
                to_agent: 'seo-writer',
                task: 'Audit homepage SEO',
                reason: 'SEO expertise required',
            };
            expect(event.from_agent).toBe('xerus-master');
        });

        it('validates hook_log event', () => {
            const event: HookLogEvent = {
                event: 'hook_log',
                agent: 'seo-writer',
                hook_event: 'PreToolUse',
                duration_ms: 45,
                success: true,
            };
            expect(event.hook_event).toBe('PreToolUse');
        });

        it('validates ace_reflection event', () => {
            const event: AceReflectionEvent = {
                event: 'ace_reflection',
                agent: 'seo-writer',
                reflection_type: 'performance',
                content: 'Could improve keyword density analysis',
                confidence: 0.75,
            };
            expect(event.confidence).toBe(0.75);
        });

        it('validates skill_suggestion event', () => {
            const event: SkillSuggestionEvent = {
                event: 'skill_suggestion',
                agent: 'seo-writer',
                skill_name: 'competitor-analysis',
                reason: 'Detected competitor mention in task',
                auto_apply: false,
            };
            expect(event.auto_apply).toBe(false);
        });

        it('validates sandbox_lifecycle event', () => {
            const event: SandboxLifecycleEvent = {
                event: 'sandbox_lifecycle',
                sandbox_id: 'sandbox-abc',
                action: 'archive',
                previous_state: 'stopped',
            };
            expect(event.action).toBe('archive');
        });

        it('validates trigger_indexing event', () => {
            const event: TriggerIndexingEvent = {
                event: 'trigger_indexing',
                agent: 'seo-writer',
                content_type: 'memory',
                content_path: '/workspace/.memory/seo-writer/learnings.md',
                operation: 'index',
            };
            expect(event.operation).toBe('index');
        });

        it('validates subagent_failure event', () => {
            const event: SubagentFailureEvent = {
                event: 'subagent_failure',
                agent: 'seo-writer',
                subagent_type: 'researcher',
                error_message: 'API rate limit exceeded',
                error_code: 'RATE_LIMIT',
                recoverable: true,
            };
            expect(event.recoverable).toBe(true);
        });

        it('uses RunnerEvent union type', () => {
            const events: RunnerEvent[] = [
                { event: 'agent_output', agent: 'a', session_id: 's', data: { type: 't', message: {} } },
                { event: 'session_started', agent: 'a', session_id: 's' },
                { event: 'session_ended', agent: 'a', session_id: 's', reason: 'complete', usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } },
                { event: 'agent_message', from: 'a', to: 'b', content: 'c' },
                { event: 'heartbeat_fired', agent: 'a', had_work: true },
                { event: 'heartbeat_skipped', agent: 'a', reason: 'r' },
                { event: 'health', status: 'ok', active_sessions: 0, uptime_seconds: 0, agents_registered: 0 },
                { event: 'sessions', sessions: [] },
                { event: 'credit_check', agent: 'a', estimated_tokens: 100, trigger: 'execute' },
                { event: 'error', message: 'err', recoverable: false },
                { event: 'sse_forward', sse_event: 'progress', payload: {} },
                { event: 'credit_usage', agent: 'a', input_tokens: 100, output_tokens: 50, cost_usd: 0.01, credits_consumed: 10 },
                { event: 'session_analytics', agent: 'a', duration_ms: 5000, tool_calls: 3, turns: 2, model: 'claude-sonnet-4-5-20250929' },
                { event: 'update_agent_run', agent: 'a', run_id: 'r1', status: 'running' },
                { event: 'create_inbox_item', agent: 'a', channel: 'seo', content: 'Report ready' },
                { event: 'push_notification', agent: 'a', user_id: 'u1', title: 'Done', body: 'Task complete' },
                { event: 'delegation_record', from_agent: 'a', to_agent: 'b', task: 'review', reason: 'expertise' },
                { event: 'hook_log', agent: 'a', hook_event: 'PreToolUse', duration_ms: 50, success: true },
                { event: 'ace_reflection', agent: 'a', reflection_type: 'self', content: 'Performed well', confidence: 0.8 },
                { event: 'skill_suggestion', agent: 'a', skill_name: 'seo-audit', reason: 'relevant', auto_apply: false },
                { event: 'sandbox_lifecycle', sandbox_id: 's1', action: 'start' },
                { event: 'trigger_indexing', agent: 'a', content_type: 'memory', content_path: '/memory/a.md', operation: 'index' },
                { event: 'subagent_failure', agent: 'a', subagent_type: 'researcher', error_message: 'timeout', recoverable: true },
            ];
            expect(events).toHaveLength(23);
        });
    });

    describe('agent configuration', () => {
        it('validates full agent config shape', () => {
            const config: AgentConfig = {
                agent_slug: 'seo-writer',
                system_prompt: { type: 'preset', preset: 'claude_code', append: 'You are an SEO writer' },
                model: 'claude-sonnet-4-5-20250929',
                tools: ['Bash', 'Read', 'Write', 'Grep', 'Glob'],
                max_turns: 50,
                cwd: 'projects/marketing/channels/seo',
                name: 'SEO Writer',
                description: 'Writes SEO-optimized content',
                domain: 'marketing',
                heartbeat: { enabled: true, interval_minutes: 240, offset_minutes: 15 },
            };
            expect(config.agent_slug).toBe('seo-writer');
            expect(config.model).toBe('claude-sonnet-4-5-20250929');
        });

        it('validates heartbeat config', () => {
            const config: HeartbeatConfig = {
                enabled: true,
                interval_minutes: 60,
                offset_minutes: 10,
            };
            expect(config.interval_minutes).toBe(60);
        });

        it('validates MCP server config', () => {
            const http: McpServerConfig = { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Key': 'val' } };
            const stdio: McpServerConfig = { type: 'stdio', command: 'node', args: ['server.js'] };
            expect(http.type).toBe('http');
            expect(stdio.type).toBe('stdio');
        });

        it('validates session state', () => {
            const state: SessionState = {
                agent_slug: 'seo-writer',
                session_id: 'abc-123',
                started_at: '2025-02-15T10:00:00Z',
                status: 'active',
                last_activity: '2025-02-15T10:05:00Z',
            };
            expect(state.status).toBe('active');
        });
    });

    describe('transport configuration', () => {
        it('exports RunnerConfig for session setup', () => {
            const config: RunnerConfig = {
                agentId: 1,
                agentSlug: 'seo-writer',
                userId: 'user-123',
                workspacePath: '/workspace',
                model: 'claude-sonnet-4-5-20250929',
                tools: ['Bash'],
                maxTurns: 50,
            };
            expect(config.agentSlug).toBe('seo-writer');
        });

        it('exports RUNNER_ENV for environment variable names', () => {
            expect(RUNNER_ENV.CONFIG).toBe('XERUS_RUNNER_CONFIG');
            expect(RUNNER_ENV.PROMPT).toBe('XERUS_RUNNER_PROMPT');
            expect(RUNNER_ENV.ANTHROPIC_API_KEY).toBe('ANTHROPIC_API_KEY');
        });
    });
});
