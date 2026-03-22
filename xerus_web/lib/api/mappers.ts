/**
 * API Mappers - Shared data transformation functions
 * Converts backend snake_case to frontend camelCase
 */
import type {
  Assistant,
  BackendAgent,
  ScheduledExecution,
  HeartbeatConfigDTO,
  BackendHeartbeatConfig,
  HeartbeatExecutionDTO,
  BackendHeartbeatExecution,
  BackendSkill,
  Skill,
  SkillDetail,
  SkillCategory,
} from './types';

/**
 * Map backend agent data to frontend Assistant format
 * Used by: getAssistants, getAssistant, updateAgent, cloneAgent
 * Note: For list endpoints, enriched_tools is provided directly from backend.
 *       For detail endpoint (getAssistant), tools are fetched via /agents/:id/tools endpoint.
 */
export function mapAgentToAssistant(agent: BackendAgent): Assistant {
  // Use enriched_tools from backend (provided by list and detail endpoints)
  const tools = agent.enriched_tools && Array.isArray(agent.enriched_tools)
    ? agent.enriched_tools
    : [];

  return {
    id: agent.id,
    slug: agent.slug || null,
    name: agent.name || 'Unnamed Agent',
    description: agent.description || '',
    avatar: agent.name ? agent.name.charAt(0).toUpperCase() : 'A',
    category: agent.personality_type || 'general',
    status: agent.is_active ? 'active' : 'inactive',
    usageCount: agent.usage_count || 0,
    lastUsed: agent.updated_at || agent.created_at || new Date().toISOString(),
    capabilities: [],
    knowledgeBase: agent.search_all_knowledge ? ['all'] : [],
    tools,
    prompt: agent.system_prompt || '',
    isDefault: agent.is_default || false,
    createdAt: agent.created_at || new Date().toISOString(),
    model: agent.ai_model,
    agentType: agent.agent_type || 'public',
    workflowConfig: undefined,
    teams: agent.teams || [],
    userId: agent.user_id || null,
    isVerified: agent.is_verified || false,
    cloneCount: agent.clone_count || 0,
    tags: agent.tags || [],
    avatarUrl: agent.avatar_url || null,
    thinkingLevel: agent.thinking_level || 'medium',
    autonomyLevel: agent.autonomy_level || 'supervised',
  };
}

/**
 * Map backend schedule response to frontend ScheduledExecution format
 */
export function mapScheduleToFrontend(schedule: Record<string, unknown>): ScheduledExecution {
  return {
    id: schedule.id as string,
    name: (schedule.name as string) || '',
    description: schedule.description as string | undefined,
    agentId: (schedule.agent_id as number) || 0,
    workflowConfig: schedule.workflow_config as ScheduledExecution['workflowConfig'],
    scheduleType: (schedule.schedule_type as ScheduledExecution['scheduleType']) || 'once',
    scheduleConfig: (schedule.schedule_config as ScheduledExecution['scheduleConfig']) || {},
    timezone: (schedule.timezone as string) || 'UTC',
    enabled: (schedule.enabled as boolean) ?? true,
    taskPrompt: schedule.task_prompt as string | undefined,
    taskContext: schedule.task_context as Record<string, unknown> | undefined,
    lastRunAt: schedule.last_run_at as string | undefined,
    nextRunAt: schedule.next_run_at as string | undefined,
    runCount: schedule.run_count as number | undefined,
    lastStatus: schedule.last_status as ScheduledExecution['lastStatus'],
    lastError: schedule.last_error as string | undefined,
    lastExecutionOutput: schedule.last_execution_output as string | undefined,
  };
}

/**
 * Map frontend ScheduledExecution to backend format (camelCase to snake_case)
 */
export function mapScheduleToBackend(schedule: ScheduledExecution): Record<string, unknown> {
  return {
    name: schedule.name,
    description: schedule.description,
    agent_id: schedule.agentId,
    workflow_config: schedule.workflowConfig,
    schedule_type: schedule.scheduleType,
    schedule_config: schedule.scheduleConfig,
    timezone: schedule.timezone,
    enabled: schedule.enabled,
    task_prompt: schedule.taskPrompt,
    task_context: schedule.taskContext,
  };
}

/**
 * Map backend heartbeat config to frontend DTO format
 */
export function mapHeartbeatConfigToFrontend(config: BackendHeartbeatConfig): HeartbeatConfigDTO {
  return {
    id: config.id,
    agentId: config.agent_id,
    enabled: config.enabled,
    cronExpression: config.cron_expression,
    timezone: config.timezone,
    activeHoursStart: config.active_hours_start,
    activeHoursEnd: config.active_hours_end,
    weekdaysOnly: config.weekdays_only,
    prompt: config.prompt,
    maxDurationSeconds: config.max_duration_seconds,
    retryOnFailure: config.retry_on_failure,
    tokenBudget: config.token_budget,
    eventTokenBudget: config.event_token_budget,
    maxAlertsPerHour: config.max_alerts_per_hour,
    suppressToken: config.suppress_token,
    toolAllowlist: config.tool_allowlist,
    defaultChannelId: config.default_channel_id,
    staggerOffsetMs: config.stagger_offset_ms,
    createdAt: config.created_at,
    updatedAt: config.updated_at,
  };
}

/**
 * Map frontend heartbeat config DTO to backend format
 */
export function mapHeartbeatConfigToBackend(config: HeartbeatConfigDTO): Omit<BackendHeartbeatConfig, 'user_id'> {
  return {
    id: config.id,
    agent_id: config.agentId,
    enabled: config.enabled,
    cron_expression: config.cronExpression,
    timezone: config.timezone,
    active_hours_start: config.activeHoursStart,
    active_hours_end: config.activeHoursEnd,
    weekdays_only: config.weekdaysOnly,
    prompt: config.prompt,
    max_duration_seconds: config.maxDurationSeconds,
    retry_on_failure: config.retryOnFailure,
    token_budget: config.tokenBudget,
    event_token_budget: config.eventTokenBudget,
    max_alerts_per_hour: config.maxAlertsPerHour,
    suppress_token: config.suppressToken,
    tool_allowlist: config.toolAllowlist,
    default_channel_id: config.defaultChannelId,
    stagger_offset_ms: config.staggerOffsetMs,
    created_at: config.createdAt,
    updated_at: config.updatedAt,
  };
}

/**
 * Map backend heartbeat execution to frontend DTO format
 */
export function mapHeartbeatExecutionToFrontend(execution: BackendHeartbeatExecution): HeartbeatExecutionDTO {
  return {
    id: execution.id,
    heartbeatConfigId: execution.heartbeat_config_id,
    agentId: execution.agent_id,
    triggerType: execution.trigger_type,
    triggerId: execution.trigger_id,
    eventPayload: execution.event_payload,
    scheduledAt: execution.scheduled_at,
    startedAt: execution.started_at,
    completedAt: execution.completed_at,
    status: execution.status,
    outcome: execution.outcome,
    result: execution.result,
    errorMessage: execution.error_message,
    durationMs: execution.duration_ms,
    tokensUsed: execution.tokens_used,
    toolCallsCount: execution.tool_calls_count,
    inboxPosts: execution.inbox_posts,
    memoryUpdates: execution.memory_updates,
    alertsSent: execution.alerts_sent,
    runId: execution.run_id,
    createdAt: execution.created_at,
  };
}

/**
 * Map backend skill to frontend Skill format
 */
export function mapSkillToFrontend(skill: BackendSkill): Skill {
  return {
    id: skill.id,
    name: skill.name || '',
    slug: skill.slug || '',
    description: skill.description || '',
    userId: skill.user_id || null,
    isGlobal: skill.is_global || false,
    isInstalled: Boolean(skill.is_installed),
    category: (skill.category as SkillCategory) || null,
    tags: skill.tags || [],
    avatarConfig: skill.avatar_config || null,
    version: skill.version || '1.0.0',
    fileCount: skill.file_count || 1,
    installCount: skill.install_count || 0,
    isPublished: skill.is_published || false,
    author: skill.author || null,
    sourceUrl: skill.source_url || null,
    createdAt: skill.created_at || new Date().toISOString(),
    updatedAt: skill.updated_at || new Date().toISOString(),
  };
}

/**
 * Map backend skill detail to frontend SkillDetail format
 */
export function mapSkillDetailToFrontend(
  data: BackendSkill & {
    files?: Array<{ path: string; size: number }>;
    installed_by_agents?: number[];
    is_installed?: boolean;
  }
): SkillDetail {
  return {
    ...mapSkillToFrontend(data),
    files: data.files || [],
    isInstalled: Boolean(data.is_installed) || Boolean(data.installed_by_agents?.length),
    installedByAgents: data.installed_by_agents || [],
  };
}
