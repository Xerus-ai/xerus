/**
 * API Mappers - Shared data transformation functions
 * Converts backend snake_case to frontend camelCase
 */
import type {
  Assistant,
  BackendAgent,
  ScheduledExecution,
  BackendSkill,
  Skill,
  SkillDetail,
  SkillCategory,
} from './types';

/**
 * Backend schedule shape (snake_case) as returned by the API.
 * Fields with defaults in mapScheduleToFrontend are optional to support partial responses.
 */
export interface BackendSchedule {
  id: string;
  name?: string;
  description?: string;
  agent_id?: number;
  workflow_config?: ScheduledExecution['workflowConfig'];
  schedule_type?: ScheduledExecution['scheduleType'] | string;
  schedule_config?: ScheduledExecution['scheduleConfig'];
  timezone?: string;
  enabled?: boolean;
  task_prompt?: string;
  task_context?: Record<string, unknown>;
  last_run_at?: string;
  next_run_at?: string;
  run_count?: number;
  last_status?: ScheduledExecution['lastStatus'] | string;
  last_error?: string;
  last_execution_output?: string;
}

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
    adapter_type: agent.adapter_type,
  };
}

/**
 * Map backend schedule response to frontend ScheduledExecution format
 */
export function mapScheduleToFrontend(schedule: BackendSchedule): ScheduledExecution {
  return {
    id: schedule.id,
    name: schedule.name || '',
    description: schedule.description,
    agentId: schedule.agent_id || 0,
    workflowConfig: schedule.workflow_config,
    scheduleType: (schedule.schedule_type || 'once') as ScheduledExecution['scheduleType'],
    scheduleConfig: schedule.schedule_config || {},
    timezone: schedule.timezone || 'UTC',
    enabled: schedule.enabled ?? true,
    taskPrompt: schedule.task_prompt,
    taskContext: schedule.task_context,
    lastRunAt: schedule.last_run_at,
    nextRunAt: schedule.next_run_at,
    runCount: schedule.run_count,
    lastStatus: schedule.last_status as ScheduledExecution['lastStatus'],
    lastError: schedule.last_error,
    lastExecutionOutput: schedule.last_execution_output,
  };
}

/**
 * Map frontend ScheduledExecution to backend format (camelCase to snake_case)
 */
export function mapScheduleToBackend(schedule: ScheduledExecution): Partial<BackendSchedule> {
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
