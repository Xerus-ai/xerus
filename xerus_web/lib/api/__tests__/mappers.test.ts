import { describe, it, expect } from 'vitest';
import {
  mapAgentToAssistant,
  mapScheduleToFrontend,
  mapScheduleToBackend,
  mapHeartbeatConfigToFrontend,
  mapHeartbeatConfigToBackend,
  mapHeartbeatExecutionToFrontend,
} from '../mappers';
import type {
  BackendAgent,
  ScheduledExecution,
  BackendHeartbeatConfig,
  HeartbeatConfigDTO,
  BackendHeartbeatExecution,
} from '../types';

// ---------------------------------------------------------------------------
// mapAgentToAssistant
// ---------------------------------------------------------------------------

describe('mapAgentToAssistant', () => {
  const fullAgent: BackendAgent = {
    id: 42,
    name: 'Code Reviewer',
    description: 'Reviews pull requests',
    personality_type: 'analytical',
    is_active: true,
    usage_count: 15,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    search_all_knowledge: true,
    is_default: false,
    ai_model: 'claude-opus-4-6',
    agent_type: 'private',
    teams: [{ team_id: 1, team_name: 'Backend', role: 'member', coordination_mode: 'parallel' }],
    user_id: 'user-123',
    is_verified: true,
    clone_count: 5,
    tags: ['code', 'review'],
    enriched_tools: [
      { name_slug: 'github', name: 'GitHub', description: 'GitHub integration', img_src: null, auth_type: 'oauth', categories: ['dev'] },
    ],
    avatar_url: 'https://example.com/avatar.png',
    thinking_level: 'high',
    autonomy_level: 'semi_autonomous',
    adapter_type: 'claudecode',
  };

  it('maps all fields from a fully populated backend agent', () => {
    const result = mapAgentToAssistant(fullAgent);

    expect(result.id).toBe(42);
    expect(result.name).toBe('Code Reviewer');
    expect(result.description).toBe('Reviews pull requests');
    expect(result.avatar).toBe('C');
    expect(result.category).toBe('analytical');
    expect(result.status).toBe('active');
    expect(result.usageCount).toBe(15);
    expect(result.lastUsed).toBe('2026-02-01T00:00:00Z');
    expect(result.knowledgeBase).toEqual(['all']);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name_slug).toBe('github');
    expect(result.isDefault).toBe(false);
    expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(result.model).toBe('claude-opus-4-6');
    expect(result.agentType).toBe('private');
    expect(result.teams).toHaveLength(1);
    expect(result.userId).toBe('user-123');
    expect(result.isVerified).toBe(true);
    expect(result.cloneCount).toBe(5);
    expect(result.tags).toEqual(['code', 'review']);
    expect(result.avatarUrl).toBe('https://example.com/avatar.png');
    expect(result.thinkingLevel).toBe('high');
    expect(result.autonomyLevel).toBe('semi_autonomous');
    expect(result.adapter_type).toBe('claudecode');
  });

  it('maps inactive agent status correctly', () => {
    const inactive: BackendAgent = { id: 1, name: 'Off', is_active: false };
    const result = mapAgentToAssistant(inactive);
    expect(result.status).toBe('inactive');
  });

  it('provides defaults for missing optional fields', () => {
    const minimal: BackendAgent = { id: 1, name: 'Minimal', is_active: true };
    const result = mapAgentToAssistant(minimal);

    expect(result.name).toBe('Minimal');
    expect(result.description).toBe('');
    expect(result.avatar).toBe('M');
    expect(result.category).toBe('general');
    expect(result.usageCount).toBe(0);
    expect(result.knowledgeBase).toEqual([]);
    expect(result.tools).toEqual([]);
    expect(result.isDefault).toBe(false);
    expect(result.agentType).toBe('public');
    expect(result.userId).toBeNull();
    expect(result.isVerified).toBe(false);
    expect(result.cloneCount).toBe(0);
    expect(result.tags).toEqual([]);
    expect(result.avatarUrl).toBeNull();
    expect(result.thinkingLevel).toBe('medium');
    expect(result.autonomyLevel).toBe('supervised');
    expect(result.adapter_type).toBeUndefined();
  });

  it('handles agent with empty name', () => {
    const noName: BackendAgent = { id: 1, name: '', is_active: true };
    const result = mapAgentToAssistant(noName);
    expect(result.name).toBe('Unnamed Agent');
    expect(result.avatar).toBe('A');
  });

  it('handles search_all_knowledge false', () => {
    const agent: BackendAgent = { id: 1, name: 'A', is_active: true, search_all_knowledge: false };
    const result = mapAgentToAssistant(agent);
    expect(result.knowledgeBase).toEqual([]);
  });

  it('uses updated_at for lastUsed when available, falls back to created_at', () => {
    const withUpdated: BackendAgent = {
      id: 1, name: 'A', is_active: true,
      updated_at: '2026-03-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(mapAgentToAssistant(withUpdated).lastUsed).toBe('2026-03-01T00:00:00Z');

    const onlyCreated: BackendAgent = {
      id: 1, name: 'A', is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(mapAgentToAssistant(onlyCreated).lastUsed).toBe('2026-01-01T00:00:00Z');
  });

  it('handles enriched_tools as non-array gracefully', () => {
    const agent: BackendAgent = {
      id: 1, name: 'A', is_active: true,
      enriched_tools: null as unknown as undefined,
    };
    const result = mapAgentToAssistant(agent);
    expect(result.tools).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mapScheduleToFrontend / mapScheduleToBackend
// ---------------------------------------------------------------------------

describe('mapScheduleToFrontend', () => {
  it('maps snake_case backend schedule to camelCase frontend format', () => {
    const backend = {
      id: 'sched-1',
      name: 'Daily Report',
      description: 'Generates daily report',
      agent_id: 5,
      workflow_config: { executionMode: 'simple' as const, isMultiAgent: false, teamAgents: [], coordinationMode: 'sequential' as const },
      schedule_type: 'daily',
      schedule_config: { time: '09:00' },
      timezone: 'America/New_York',
      enabled: true,
      task_prompt: 'Generate report',
      task_context: { project: 'xerus' },
      last_run_at: '2026-02-27T09:00:00Z',
      next_run_at: '2026-02-28T09:00:00Z',
      run_count: 10,
      last_status: 'success',
      last_error: undefined,
      last_execution_output: 'Report generated',
    };

    const result = mapScheduleToFrontend(backend);

    expect(result.id).toBe('sched-1');
    expect(result.name).toBe('Daily Report');
    expect(result.description).toBe('Generates daily report');
    expect(result.agentId).toBe(5);
    expect(result.scheduleType).toBe('daily');
    expect(result.scheduleConfig).toEqual({ time: '09:00' });
    expect(result.timezone).toBe('America/New_York');
    expect(result.enabled).toBe(true);
    expect(result.taskPrompt).toBe('Generate report');
    expect(result.taskContext).toEqual({ project: 'xerus' });
    expect(result.lastRunAt).toBe('2026-02-27T09:00:00Z');
    expect(result.nextRunAt).toBe('2026-02-28T09:00:00Z');
    expect(result.runCount).toBe(10);
    expect(result.lastStatus).toBe('success');
    expect(result.lastExecutionOutput).toBe('Report generated');
  });

  it('uses defaults for missing fields', () => {
    const minimal = { id: 'sched-2' };
    const result = mapScheduleToFrontend(minimal);

    expect(result.name).toBe('');
    expect(result.agentId).toBe(0);
    expect(result.scheduleType).toBe('once');
    expect(result.scheduleConfig).toEqual({});
    expect(result.timezone).toBe('UTC');
    expect(result.enabled).toBe(true);
  });
});

describe('mapScheduleToBackend', () => {
  it('maps camelCase frontend schedule to snake_case backend format', () => {
    const frontend: ScheduledExecution = {
      id: 'sched-1',
      name: 'Weekly Sync',
      description: 'Weekly team sync',
      agentId: 3,
      scheduleType: 'weekly',
      scheduleConfig: { days: [1, 3, 5], time: '10:00' },
      timezone: 'UTC',
      enabled: true,
      taskPrompt: 'Sync updates',
      taskContext: { channel: 'general' },
    };

    const result = mapScheduleToBackend(frontend);

    expect(result.name).toBe('Weekly Sync');
    expect(result.description).toBe('Weekly team sync');
    expect(result.agent_id).toBe(3);
    expect(result.schedule_type).toBe('weekly');
    expect(result.schedule_config).toEqual({ days: [1, 3, 5], time: '10:00' });
    expect(result.timezone).toBe('UTC');
    expect(result.enabled).toBe(true);
    expect(result.task_prompt).toBe('Sync updates');
    expect(result.task_context).toEqual({ channel: 'general' });
  });

  it('round-trips through frontend and back', () => {
    const original = {
      id: 'rt-1',
      name: 'Round Trip',
      agent_id: 7,
      schedule_type: 'cron',
      schedule_config: { cron: '0 */6 * * *' },
      timezone: 'Europe/London',
      enabled: false,
    };

    const frontend = mapScheduleToFrontend(original);
    const backend = mapScheduleToBackend(frontend);

    expect(backend.name).toBe(original.name);
    expect(backend.agent_id).toBe(original.agent_id);
    expect(backend.schedule_type).toBe(original.schedule_type);
    expect(backend.timezone).toBe(original.timezone);
    expect(backend.enabled).toBe(original.enabled);
  });
});

// ---------------------------------------------------------------------------
// mapHeartbeatConfigToFrontend / mapHeartbeatConfigToBackend
// ---------------------------------------------------------------------------

describe('mapHeartbeatConfigToFrontend', () => {
  const backendConfig: BackendHeartbeatConfig = {
    id: 1,
    agent_id: 10,
    user_id: 'u-1',
    enabled: true,
    cron_expression: '*/30 * * * *',
    timezone: 'UTC',
    active_hours_start: '08:00',
    active_hours_end: '18:00',
    weekdays_only: true,
    prompt: 'Check status',
    max_duration_seconds: 300,
    retry_on_failure: true,
    token_budget: 50000,
    event_token_budget: 3000,
    max_alerts_per_hour: 5,
    suppress_token: 'suppress-abc',
    tool_allowlist: ['Read', 'Bash'],
    default_channel_id: 99,
    stagger_offset_ms: 5000,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  };

  it('maps all fields from snake_case to camelCase', () => {
    const result = mapHeartbeatConfigToFrontend(backendConfig);

    expect(result.id).toBe(1);
    expect(result.agentId).toBe(10);
    expect(result.enabled).toBe(true);
    expect(result.cronExpression).toBe('*/30 * * * *');
    expect(result.timezone).toBe('UTC');
    expect(result.activeHoursStart).toBe('08:00');
    expect(result.activeHoursEnd).toBe('18:00');
    expect(result.weekdaysOnly).toBe(true);
    expect(result.prompt).toBe('Check status');
    expect(result.maxDurationSeconds).toBe(300);
    expect(result.retryOnFailure).toBe(true);
    expect(result.tokenBudget).toBe(50000);
    expect(result.eventTokenBudget).toBe(3000);
    expect(result.maxAlertsPerHour).toBe(5);
    expect(result.suppressToken).toBe('suppress-abc');
    expect(result.toolAllowlist).toEqual(['Read', 'Bash']);
    expect(result.defaultChannelId).toBe(99);
    expect(result.staggerOffsetMs).toBe(5000);
    expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(result.updatedAt).toBe('2026-02-01T00:00:00Z');
  });

  it('does not include user_id in frontend DTO', () => {
    const result = mapHeartbeatConfigToFrontend(backendConfig);
    expect('userId' in result).toBe(false);
  });
});

describe('mapHeartbeatConfigToBackend', () => {
  it('maps camelCase DTO back to snake_case', () => {
    const dto: HeartbeatConfigDTO = {
      id: 1,
      agentId: 10,
      enabled: true,
      cronExpression: '*/30 * * * *',
      timezone: 'UTC',
      activeHoursStart: '08:00',
      activeHoursEnd: '18:00',
      weekdaysOnly: true,
      prompt: 'Check status',
      maxDurationSeconds: 300,
      retryOnFailure: true,
      tokenBudget: 50000,
      eventTokenBudget: 3000,
      maxAlertsPerHour: 5,
      suppressToken: 'suppress-abc',
      toolAllowlist: ['Read', 'Bash'],
      defaultChannelId: 99,
      staggerOffsetMs: 5000,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    };

    const result = mapHeartbeatConfigToBackend(dto);

    expect(result.agent_id).toBe(10);
    expect(result.cron_expression).toBe('*/30 * * * *');
    expect(result.active_hours_start).toBe('08:00');
    expect(result.active_hours_end).toBe('18:00');
    expect(result.weekdays_only).toBe(true);
    expect(result.max_duration_seconds).toBe(300);
    expect(result.retry_on_failure).toBe(true);
    expect(result.token_budget).toBe(50000);
    expect(result.event_token_budget).toBe(3000);
    expect(result.max_alerts_per_hour).toBe(5);
    expect(result.suppress_token).toBe('suppress-abc');
    expect(result.tool_allowlist).toEqual(['Read', 'Bash']);
    expect(result.default_channel_id).toBe(99);
    expect(result.stagger_offset_ms).toBe(5000);
  });

  it('round-trips heartbeat config correctly', () => {
    const original: BackendHeartbeatConfig = {
      id: 2,
      agent_id: 20,
      enabled: false,
      cron_expression: '0 * * * *',
      timezone: 'Asia/Tokyo',
      weekdays_only: false,
      max_duration_seconds: 600,
      retry_on_failure: false,
      token_budget: 100000,
      event_token_budget: 5000,
      max_alerts_per_hour: 10,
      suppress_token: 'tok-xyz',
      stagger_offset_ms: 0,
    };

    const frontend = mapHeartbeatConfigToFrontend(original);
    const backend = mapHeartbeatConfigToBackend(frontend);

    expect(backend.agent_id).toBe(original.agent_id);
    expect(backend.enabled).toBe(original.enabled);
    expect(backend.cron_expression).toBe(original.cron_expression);
    expect(backend.timezone).toBe(original.timezone);
    expect(backend.weekdays_only).toBe(original.weekdays_only);
    expect(backend.token_budget).toBe(original.token_budget);
  });
});

// ---------------------------------------------------------------------------
// mapHeartbeatExecutionToFrontend
// ---------------------------------------------------------------------------

describe('mapHeartbeatExecutionToFrontend', () => {
  it('maps all execution fields from snake_case to camelCase', () => {
    const backend: BackendHeartbeatExecution = {
      id: 'exec-uuid-1',
      heartbeat_config_id: 1,
      agent_id: 10,
      trigger_type: 'scheduled',
      trigger_id: 42,
      event_payload: { source: 'cron' },
      scheduled_at: '2026-02-28T09:00:00Z',
      started_at: '2026-02-28T09:00:05Z',
      completed_at: '2026-02-28T09:01:00Z',
      status: 'completed',
      outcome: 'success',
      result: { output: 'done' },
      error_message: undefined,
      duration_ms: 55000,
      tokens_used: 4500,
      tool_calls_count: 12,
      inbox_posts: 2,
      memory_updates: 1,
      alerts_sent: 0,
      run_id: 'run-abc',
      created_at: '2026-02-28T09:00:00Z',
    };

    const result = mapHeartbeatExecutionToFrontend(backend);

    expect(result.id).toBe('exec-uuid-1');
    expect(result.heartbeatConfigId).toBe(1);
    expect(result.agentId).toBe(10);
    expect(result.triggerType).toBe('scheduled');
    expect(result.triggerId).toBe(42);
    expect(result.eventPayload).toEqual({ source: 'cron' });
    expect(result.scheduledAt).toBe('2026-02-28T09:00:00Z');
    expect(result.startedAt).toBe('2026-02-28T09:00:05Z');
    expect(result.completedAt).toBe('2026-02-28T09:01:00Z');
    expect(result.status).toBe('completed');
    expect(result.outcome).toBe('success');
    expect(result.result).toEqual({ output: 'done' });
    expect(result.errorMessage).toBeUndefined();
    expect(result.durationMs).toBe(55000);
    expect(result.tokensUsed).toBe(4500);
    expect(result.toolCallsCount).toBe(12);
    expect(result.inboxPosts).toBe(2);
    expect(result.memoryUpdates).toBe(1);
    expect(result.alertsSent).toBe(0);
    expect(result.runId).toBe('run-abc');
    expect(result.createdAt).toBe('2026-02-28T09:00:00Z');
  });

  it('handles failed execution with error message', () => {
    const failed: BackendHeartbeatExecution = {
      id: 'exec-fail',
      agent_id: 5,
      trigger_type: 'event',
      scheduled_at: '2026-02-28T10:00:00Z',
      status: 'failed',
      outcome: 'failure',
      error_message: 'Agent timed out after 300s',
      duration_ms: 300000,
      tokens_used: 0,
      tool_calls_count: 0,
      inbox_posts: 0,
      memory_updates: 0,
      alerts_sent: 1,
      created_at: '2026-02-28T10:00:00Z',
    };

    const result = mapHeartbeatExecutionToFrontend(failed);
    expect(result.status).toBe('failed');
    expect(result.outcome).toBe('failure');
    expect(result.errorMessage).toBe('Agent timed out after 300s');
    expect(result.alertsSent).toBe(1);
  });
});
