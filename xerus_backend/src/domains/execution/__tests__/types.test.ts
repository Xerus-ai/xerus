// Execution Domain Types Tests
import type {
    StreamEvent,
    SandboxState,
    ExecutionConfig,
    SandboxConfig,
    WorkspaceConfig,
    ManifestEntry,
    ExecutionRequest,
    ExecutionResult,
    ExecutionErrorInfo,
    ExecutionSummary,
    ThinkingLevel,
    AutonomyLevel,
} from '../types';
import type {
    HeartbeatConfig,
    HeartbeatExecution,
    HeartbeatExecutionStatus,
    HeartbeatTriggerType,
    HeartbeatOutcome,
} from '../../heartbeat/types';
import {
    STREAM_EVENT_TYPES,
    SANDBOX_STATES,
    EXECUTION_STATUSES,
    COORDINATION_MODES,
    ERROR_TYPES,
    THINKING_LEVELS,
    AUTONOMY_LEVELS,
    THINKING_TOKENS,
    COT_PROMPTS,
    PERMISSION_MAP,
} from '../types';
import {
    HEARTBEAT_EXECUTION_STATUSES,
    HEARTBEAT_TRIGGER_TYPES,
    HEARTBEAT_OUTCOMES,
} from '../../heartbeat/types';

describe('Execution Domain Types', () => {
    describe('StreamEventType', () => {
        it('should have all 19 event types defined', () => {
            expect(STREAM_EVENT_TYPES).toHaveLength(19);
            expect(STREAM_EVENT_TYPES).toContain('meta');
            expect(STREAM_EVENT_TYPES).toContain('progress');
            expect(STREAM_EVENT_TYPES).toContain('guidance');
            expect(STREAM_EVENT_TYPES).toContain('token');
            expect(STREAM_EVENT_TYPES).toContain('tool_call');
            expect(STREAM_EVENT_TYPES).toContain('tool_result');
            expect(STREAM_EVENT_TYPES).toContain('reasoning');
            expect(STREAM_EVENT_TYPES).toContain('memory_update');
            expect(STREAM_EVENT_TYPES).toContain('kb_query');
            expect(STREAM_EVENT_TYPES).toContain('self_moderation');
            expect(STREAM_EVENT_TYPES).toContain('context_warning');
            expect(STREAM_EVENT_TYPES).toContain('done');
            expect(STREAM_EVENT_TYPES).toContain('stop');
            expect(STREAM_EVENT_TYPES).toContain('notification');
            expect(STREAM_EVENT_TYPES).toContain('tool_auth_required');
            expect(STREAM_EVENT_TYPES).toContain('subagent_start');
            expect(STREAM_EVENT_TYPES).toContain('subagent_stop');
            expect(STREAM_EVENT_TYPES).toContain('delegation');
            expect(STREAM_EVENT_TYPES).toContain('file_changed');
        });
    });

    describe('StreamEvent', () => {
        it('should accept valid stream event', () => {
            const event: StreamEvent = {
                type: 'meta',
                success: true,
                execution_id: 'exec-123',
            };
            expect(event.type).toBe('meta');
            expect(event.success).toBe(true);
            expect(event.execution_id).toBe('exec-123');
        });

        it('should accept stream event with content and meta', () => {
            const event: StreamEvent = {
                type: 'token',
                success: true,
                execution_id: 'exec-456',
                content: { text: 'Hello', token_count: 5 },
                meta: { model: 'claude-3' },
            };
            expect(event.content).toEqual({ text: 'Hello', token_count: 5 });
            expect(event.meta).toEqual({ model: 'claude-3' });
        });
    });

    describe('SandboxState', () => {
        it('should have all sandbox states defined', () => {
            expect(SANDBOX_STATES).toHaveLength(3);
            expect(SANDBOX_STATES).toContain('paused');
            expect(SANDBOX_STATES).toContain('running');
            expect(SANDBOX_STATES).toContain('killed');
        });

        it('should accept valid sandbox state', () => {
            const state: SandboxState = 'running';
            expect(state).toBe('running');
        });
    });

    describe('ExecutionStatus', () => {
        it('should have all execution statuses defined', () => {
            expect(EXECUTION_STATUSES).toHaveLength(5);
            expect(EXECUTION_STATUSES).toContain('pending');
            expect(EXECUTION_STATUSES).toContain('running');
            expect(EXECUTION_STATUSES).toContain('completed');
            expect(EXECUTION_STATUSES).toContain('failed');
            expect(EXECUTION_STATUSES).toContain('cancelled');
        });
    });

    describe('CoordinationMode', () => {
        it('should have all coordination modes defined', () => {
            expect(COORDINATION_MODES).toHaveLength(4);
            expect(COORDINATION_MODES).toContain('sequential');
            expect(COORDINATION_MODES).toContain('parallel');
            expect(COORDINATION_MODES).toContain('hierarchical');
            expect(COORDINATION_MODES).toContain('consensus');
        });
    });

    describe('ErrorType', () => {
        it('should have all error types defined', () => {
            expect(ERROR_TYPES).toHaveLength(8);
            expect(ERROR_TYPES).toContain('timeout');
            expect(ERROR_TYPES).toContain('tool_error');
            expect(ERROR_TYPES).toContain('llm_error');
            expect(ERROR_TYPES).toContain('context_overflow');
            expect(ERROR_TYPES).toContain('user_cancel');
            expect(ERROR_TYPES).toContain('auth_error');
            expect(ERROR_TYPES).toContain('validation_error');
            expect(ERROR_TYPES).toContain('system_error');
        });
    });

    describe('ExecutionConfig', () => {
        it('should accept valid execution config with Daytona', () => {
            const config: ExecutionConfig = {
                daytonaApiKey: 'daytona-key',
                daytonaApiUrl: 'https://api.daytona.io',
                s3Bucket: 'xerus-users',
                s3Region: 'us-east-1',
                openRouterApiKey: 'or-key',
                maxExecutionTimeMs: 300000,
                maxTokensPerExecution: 200000,
                maxToolCalls: 50,
            };
            expect(config.daytonaApiUrl).toBe('https://api.daytona.io');
            expect(config.maxExecutionTimeMs).toBe(300000);
        });
    });

    describe('SandboxConfig', () => {
        it('should accept valid sandbox config', () => {
            const config: SandboxConfig = {
                userId: 'user-123',
                template: 'xerus-agent',
                timeoutMs: 300000,
                idleTimeoutMs: 300000,
            };
            expect(config.userId).toBe('user-123');
        });

        it('should accept sandbox config with environment variables', () => {
            const config: SandboxConfig = {
                userId: 'user-123',
                template: 'xerus-agent',
                timeoutMs: 300000,
                idleTimeoutMs: 300000,
                envVars: { NODE_ENV: 'production' },
            };
            expect(config.envVars).toEqual({ NODE_ENV: 'production' });
        });
    });

    describe('WorkspaceConfig', () => {
        it('should accept valid workspace config', () => {
            const config: WorkspaceConfig = {
                userId: 'user-123',
                agentSlug: 'scout-sally',
                basePath: '/workspace',
            };
            expect(config.agentSlug).toBe('scout-sally');
        });
    });

    describe('ManifestEntry', () => {
        it('should accept task_start manifest entry', () => {
            const entry: ManifestEntry = {
                ts: '2025-01-30T10:00:00Z',
                step: 1,
                type: 'task_start',
                task: 'Research competitors',
            };
            expect(entry.type).toBe('task_start');
            expect(entry.task).toBe('Research competitors');
        });

        it('should accept tool_call manifest entry', () => {
            const entry: ManifestEntry = {
                ts: '2025-01-30T10:00:05Z',
                step: 2,
                type: 'tool_call',
                agent: 'scout-sally',
                tool: 'WebSearch',
                input: { query: 'competitors' },
            };
            expect(entry.type).toBe('tool_call');
            expect(entry.tool).toBe('WebSearch');
        });

        it('should accept output manifest entry with strategy', () => {
            const entry: ManifestEntry = {
                ts: '2025-01-30T10:00:10Z',
                step: 3,
                type: 'output',
                strategy: 'compact',
                path: 'outputs/001_results.json',
                summary: 'Found 15 results',
            };
            expect(entry.strategy).toBe('compact');
        });
    });

    describe('ExecutionRequest', () => {
        it('should accept minimal execution request', () => {
            const request: ExecutionRequest = {
                agentSlug: 'test-agent',
                task: 'Analyze data',
                userId: 'user-123',
            };
            expect(request.agentSlug).toBe('test-agent');
            expect(request.task).toBe('Analyze data');
        });

        it('should accept execution request with team and context', () => {
            const request: ExecutionRequest = {
                agentSlug: 'test-agent',
                task: 'Analyze data',
                userId: 'user-123',
                teamId: 5,
                context: { previousResults: [] },
                coordinationMode: 'parallel',
            };
            expect(request.teamId).toBe(5);
            expect(request.coordinationMode).toBe('parallel');
        });
    });

    describe('ExecutionResult', () => {
        it('should accept successful execution result', () => {
            const result: ExecutionResult = {
                executionId: 'exec-123',
                status: 'completed',
                success: true,
                summary: {
                    totalTokens: 5000,
                    durationMs: 30000,
                    toolCalls: 10,
                    agentsUsed: 2,
                },
            };
            expect(result.success).toBe(true);
            expect(result.summary.totalTokens).toBe(5000);
        });

        it('should accept failed execution result with error', () => {
            const result: ExecutionResult = {
                executionId: 'exec-456',
                status: 'failed',
                success: false,
                error: {
                    message: 'Timeout exceeded',
                    code: 'EXECUTION_TIMEOUT',
                    type: 'timeout',
                },
                summary: {
                    totalTokens: 1000,
                    durationMs: 300000,
                    toolCalls: 3,
                    agentsUsed: 1,
                },
            };
            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('EXECUTION_TIMEOUT');
        });
    });

    describe('ExecutionErrorInfo', () => {
        it('should accept error info with details', () => {
            const errorInfo: ExecutionErrorInfo = {
                message: 'Tool failed',
                code: 'TOOL_EXECUTION_FAILED',
                type: 'tool_error',
                details: {
                    tool_name: 'web_search',
                    server: 'brave_search',
                },
            };
            expect(errorInfo.details?.tool_name).toBe('web_search');
        });
    });

    describe('ExecutionSummary', () => {
        it('should accept execution summary with artifacts', () => {
            const summary: ExecutionSummary = {
                totalTokens: 45000,
                durationMs: 180000,
                toolCalls: 38,
                agentsUsed: 4,
                artifacts: ['winning_script.md'],
            };
            expect(summary.artifacts).toContain('winning_script.md');
        });
    });

    describe('ThinkingLevel', () => {
        it('should have all thinking levels defined', () => {
            expect(THINKING_LEVELS).toHaveLength(3);
            expect(THINKING_LEVELS).toContain('low');
            expect(THINKING_LEVELS).toContain('medium');
            expect(THINKING_LEVELS).toContain('high');
        });

        it('should accept valid thinking level', () => {
            const level: ThinkingLevel = 'medium';
            expect(level).toBe('medium');
        });
    });

    describe('AutonomyLevel', () => {
        it('should have all autonomy levels defined', () => {
            expect(AUTONOMY_LEVELS).toHaveLength(3);
            expect(AUTONOMY_LEVELS).toContain('supervised');
            expect(AUTONOMY_LEVELS).toContain('semi_autonomous');
            expect(AUTONOMY_LEVELS).toContain('autonomous');
        });

        it('should accept valid autonomy level', () => {
            const level: AutonomyLevel = 'supervised';
            expect(level).toBe('supervised');
        });
    });

    describe('HeartbeatExecutionStatus', () => {
        it('should have all heartbeat execution statuses defined', () => {
            expect(HEARTBEAT_EXECUTION_STATUSES).toHaveLength(6);
            expect(HEARTBEAT_EXECUTION_STATUSES).toContain('queued');
            expect(HEARTBEAT_EXECUTION_STATUSES).toContain('running');
            expect(HEARTBEAT_EXECUTION_STATUSES).toContain('completed');
            expect(HEARTBEAT_EXECUTION_STATUSES).toContain('failed');
            expect(HEARTBEAT_EXECUTION_STATUSES).toContain('skipped');
            expect(HEARTBEAT_EXECUTION_STATUSES).toContain('suppressed');
        });

        it('should accept valid heartbeat execution status', () => {
            const status: HeartbeatExecutionStatus = 'completed';
            expect(status).toBe('completed');
        });
    });

    describe('THINKING_TOKENS', () => {
        it('should map thinking levels to correct token budgets', () => {
            expect(THINKING_TOKENS.low).toBe(1024);
            expect(THINKING_TOKENS.medium).toBe(8192);
            expect(THINKING_TOKENS.high).toBe(32768);
        });

        it('should have entries for all thinking levels', () => {
            const levels: ThinkingLevel[] = ['low', 'medium', 'high'];
            levels.forEach((level) => {
                expect(THINKING_TOKENS[level]).toBeDefined();
                expect(typeof THINKING_TOKENS[level]).toBe('number');
            });
        });
    });

    describe('COT_PROMPTS', () => {
        it('should have null for low thinking level', () => {
            expect(COT_PROMPTS.low).toBeNull();
        });

        it('should have string prompts for medium and high levels', () => {
            expect(typeof COT_PROMPTS.medium).toBe('string');
            expect(typeof COT_PROMPTS.high).toBe('string');
        });

        it('should have entries for all thinking levels', () => {
            const levels: ThinkingLevel[] = ['low', 'medium', 'high'];
            levels.forEach((level) => {
                expect(level in COT_PROMPTS).toBe(true);
            });
        });
    });

    describe('PERMISSION_MAP', () => {
        it('should map autonomy levels to SDK permission modes', () => {
            expect(PERMISSION_MAP.supervised).toBe('default');
            expect(PERMISSION_MAP.semi_autonomous).toBe('acceptEdits');
            expect(PERMISSION_MAP.autonomous).toBe('bypassPermissions');
        });

        it('should have entries for all autonomy levels', () => {
            const levels: AutonomyLevel[] = ['supervised', 'semi_autonomous', 'autonomous'];
            levels.forEach((level) => {
                expect(PERMISSION_MAP[level]).toBeDefined();
                expect(typeof PERMISSION_MAP[level]).toBe('string');
            });
        });
    });

    describe('HeartbeatConfig', () => {
        it('should accept valid heartbeat config with required fields', () => {
            const config: HeartbeatConfig = {
                id: 1,
                agent_id: 10,
                user_id: 'user-123',
                enabled: true,
                cron_expression: '0 */30 * * *',
                timezone: 'UTC',
                active_hours_start: null,
                active_hours_end: null,
                weekdays_only: false,
                prompt: null,
                max_duration_seconds: 300,
                retry_on_failure: true,
                token_budget: 50000,
                event_token_budget: 4000,
                max_alerts_per_hour: 3,
                suppress_token: 'HEARTBEAT_OK',
                tool_allowlist: null,
                default_channel_id: null,
                stagger_offset_ms: 0,
                created_at: new Date(),
                updated_at: new Date(),
            };
            expect(config.id).toBe(1);
            expect(config.enabled).toBe(true);
            expect(config.cron_expression).toBe('0 */30 * * *');
        });

        it('should accept heartbeat config with optional fields populated', () => {
            const config: HeartbeatConfig = {
                id: 2,
                agent_id: 20,
                user_id: 'user-456',
                enabled: true,
                cron_expression: '0 9 * * *',
                timezone: 'America/New_York',
                active_hours_start: '09:00',
                active_hours_end: '17:00',
                weekdays_only: true,
                prompt: 'Check for new emails and summarize',
                max_duration_seconds: 600,
                retry_on_failure: false,
                token_budget: 50000,
                event_token_budget: 4000,
                max_alerts_per_hour: 3,
                suppress_token: 'HEARTBEAT_OK',
                tool_allowlist: ['Read', 'Write', 'Bash'],
                default_channel_id: '5',
                stagger_offset_ms: 15000,
                created_at: new Date(),
                updated_at: new Date(),
            };
            expect(config.active_hours_start).toBe('09:00');
            expect(config.weekdays_only).toBe(true);
            expect(config.tool_allowlist).toEqual(['Read', 'Write', 'Bash']);
            expect(config.event_token_budget).toBe(4000);
            expect(config.max_alerts_per_hour).toBe(3);
            expect(config.suppress_token).toBe('HEARTBEAT_OK');
        });
    });

    describe('HeartbeatTriggerType', () => {
        it('should have all trigger types defined', () => {
            expect(HEARTBEAT_TRIGGER_TYPES).toHaveLength(3);
            expect(HEARTBEAT_TRIGGER_TYPES).toContain('scheduled');
            expect(HEARTBEAT_TRIGGER_TYPES).toContain('event');
            expect(HEARTBEAT_TRIGGER_TYPES).toContain('manual');
        });

        it('should accept valid trigger type', () => {
            const triggerType: HeartbeatTriggerType = 'scheduled';
            expect(triggerType).toBe('scheduled');
        });
    });

    describe('HeartbeatOutcome', () => {
        it('should have all outcomes defined', () => {
            expect(HEARTBEAT_OUTCOMES).toHaveLength(5);
            expect(HEARTBEAT_OUTCOMES).toContain('success');
            expect(HEARTBEAT_OUTCOMES).toContain('failure');
            expect(HEARTBEAT_OUTCOMES).toContain('timeout');
            expect(HEARTBEAT_OUTCOMES).toContain('suppressed');
            expect(HEARTBEAT_OUTCOMES).toContain('skipped');
        });

        it('should accept valid outcome', () => {
            const outcome: HeartbeatOutcome = 'success';
            expect(outcome).toBe('success');
        });
    });

    describe('HeartbeatExecution', () => {
        it('should accept valid heartbeat execution with queued status', () => {
            const execution: HeartbeatExecution = {
                id: 'uuid-123',
                heartbeat_config_id: 1,
                agent_id: 10,
                trigger_type: 'scheduled',
                trigger_id: null,
                event_payload: null,
                snapshot_execution_id: null,
                scheduled_at: new Date(),
                started_at: null,
                completed_at: null,
                status: 'queued',
                outcome: null,
                result: null,
                error_message: null,
                duration_ms: null,
                tokens_used: 0,
                tool_calls_count: 0,
                inbox_posts: 0,
                memory_updates: 0,
                alerts_sent: 0,
                run_id: null,
                created_at: new Date(),
            };
            expect(execution.status).toBe('queued');
            expect(execution.started_at).toBeNull();
            expect(execution.trigger_type).toBe('scheduled');
        });

        it('should accept completed heartbeat execution with results', () => {
            const execution: HeartbeatExecution = {
                id: 'uuid-456',
                heartbeat_config_id: 1,
                agent_id: 10,
                trigger_type: 'scheduled',
                trigger_id: null,
                event_payload: null,
                snapshot_execution_id: 'snap-uuid-123',
                scheduled_at: new Date('2025-02-11T10:00:00Z'),
                started_at: new Date('2025-02-11T10:00:05Z'),
                completed_at: new Date('2025-02-11T10:02:30Z'),
                status: 'completed',
                outcome: 'success',
                result: { summary: 'Processed 5 items', itemsProcessed: 5 },
                error_message: null,
                duration_ms: 145000,
                tokens_used: 12500,
                tool_calls_count: 8,
                inbox_posts: 2,
                memory_updates: 3,
                alerts_sent: 0,
                run_id: 'run-abc-123',
                created_at: new Date('2025-02-11T10:00:00Z'),
            };
            expect(execution.status).toBe('completed');
            expect(execution.outcome).toBe('success');
            expect(execution.duration_ms).toBe(145000);
            expect(execution.inbox_posts).toBe(2);
            expect(execution.run_id).toBe('run-abc-123');
        });

        it('should accept event-triggered heartbeat execution', () => {
            const execution: HeartbeatExecution = {
                id: 'uuid-event-123',
                heartbeat_config_id: null,
                agent_id: 10,
                trigger_type: 'event',
                trigger_id: 5,
                event_payload: { email_id: 'msg-123', subject: 'New message' },
                snapshot_execution_id: null,
                scheduled_at: new Date(),
                started_at: new Date(),
                completed_at: new Date(),
                status: 'completed',
                outcome: 'success',
                result: { processed: true },
                error_message: null,
                duration_ms: 30000,
                tokens_used: 5000,
                tool_calls_count: 3,
                inbox_posts: 1,
                memory_updates: 1,
                alerts_sent: 1,
                run_id: 'run-event-456',
                created_at: new Date(),
            };
            expect(execution.trigger_type).toBe('event');
            expect(execution.trigger_id).toBe(5);
            expect(execution.event_payload).toEqual({ email_id: 'msg-123', subject: 'New message' });
            expect(execution.alerts_sent).toBe(1);
        });

        it('should accept failed heartbeat execution with error', () => {
            const execution: HeartbeatExecution = {
                id: 'uuid-789',
                heartbeat_config_id: 1,
                agent_id: 10,
                trigger_type: 'manual',
                trigger_id: null,
                event_payload: null,
                snapshot_execution_id: null,
                scheduled_at: new Date(),
                started_at: new Date(),
                completed_at: new Date(),
                status: 'failed',
                outcome: 'failure',
                result: null,
                error_message: 'API rate limit exceeded',
                duration_ms: 5000,
                tokens_used: 500,
                tool_calls_count: 1,
                inbox_posts: 0,
                memory_updates: 0,
                alerts_sent: 0,
                run_id: 'run-fail-789',
                created_at: new Date(),
            };
            expect(execution.status).toBe('failed');
            expect(execution.outcome).toBe('failure');
            expect(execution.error_message).toBe('API rate limit exceeded');
        });
    });
});
