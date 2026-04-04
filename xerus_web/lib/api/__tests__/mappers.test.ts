import { describe, it, expect } from 'vitest';
import {
  mapAgentToAssistant,
  mapScheduleToFrontend,
  mapScheduleToBackend,
} from '../mappers';
import type {
  BackendAgent,
  ScheduledExecution,
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

