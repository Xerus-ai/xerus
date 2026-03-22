/**
 * API Types - All TypeScript interfaces for API operations
 */

// ===========================
// BEHAVIOUR CONFIGURATION
// ===========================

export type ThinkingLevel = 'low' | 'medium' | 'high';

export type AutonomyLevel = 'supervised' | 'semi_autonomous' | 'autonomous';

// ===========================
// WORKFLOW CONFIGURATION
// ===========================

export interface WorkflowConfig {
  executionMode: 'simple' | 'planned' | 'workflow' | 'coordinated';
  isMultiAgent: boolean;
  teamAgents: number[];
  teamId?: number;
  coordinationMode: 'sequential' | 'hierarchical' | 'parallel' | 'consensus';
  workflowStrategy?: 'ai' | 'template' | 'custom';
  workflowSteps?: WorkflowStep[];
  selectedTemplateId?: number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  config?: Record<string, unknown>;
}

// ===========================
// AGENTS / ASSISTANTS
// ===========================

// Enriched tool returned from backend
export interface EnrichedTool {
  name_slug: string;
  name: string;
  description: string | null;
  img_src: string | null;
  auth_type: string | null;
  categories: string[] | null;
}

export interface Assistant {
  id: number;
  slug?: string | null;
  name: string;
  description: string;
  avatar: string;
  category: string;
  status: 'active' | 'inactive';
  usageCount: number;
  lastUsed: string;
  capabilities: string[];
  knowledgeBase: string[];
  tools: EnrichedTool[];  // Enriched tools with metadata from pipedream_apps
  prompt: string;
  isDefault: boolean;
  createdAt: string;
  model?: string;
  agentType?: 'public' | 'private' | 'shared';
  workflowConfig?: WorkflowConfig;
  teams?: AgentTeamMembership[];
  userId?: string | null;  // Owner's user_id (null for system templates)
  isVerified?: boolean;    // Whether agent is a verified template
  cloneCount?: number;     // Number of times agent has been cloned
  tags?: string[];         // Agent categorization tags
  avatarUrl?: string | null; // Mascot config string or image URL
  thinkingLevel?: ThinkingLevel;   // Reasoning depth: low, medium, high
  autonomyLevel?: AutonomyLevel;   // Permission mode: supervised, semi_autonomous, autonomous
}

export interface AgentTeamMembership {
  team_id: number;
  team_name: string;
  role: string;
  coordination_mode: string;
}

// Backend agent format (snake_case)
export interface BackendAgent {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  personality_type?: string;
  is_active: boolean;
  usage_count?: number;
  created_at?: string;
  updated_at?: string;
  search_all_knowledge?: boolean;
  web_search_enabled?: boolean;
  is_default?: boolean;
  ai_model?: string;
  agent_type?: 'public' | 'private' | 'shared';
  teams?: AgentTeamMembership[];
  user_id?: string | null;  // Owner's user_id (null for system templates)
  is_verified?: boolean;    // Whether agent is a verified template
  clone_count?: number;     // Number of times agent has been cloned
  tags?: string[];          // Agent categorization tags
  enriched_tools?: EnrichedTool[];  // Enriched tools from list endpoint
  avatar_url?: string | null;       // Mascot config string or image URL
  system_prompt?: string | null;
  thinking_level?: ThinkingLevel;   // Reasoning depth: low=1K, medium=8K, high=32K tokens
  autonomy_level?: AutonomyLevel;   // Permission mode: supervised, semi_autonomous, autonomous
}

export interface AgentCreateInput {
  name: string;
  description?: string;
  ai_model?: string;
  personality_type?: string;
  system_prompt?: string;
  web_search_enabled?: boolean;
  search_all_knowledge?: boolean;
  thinking_level?: ThinkingLevel;
  autonomy_level?: AutonomyLevel;
}

export interface AgentUpdateInput extends Partial<AgentCreateInput> {
  is_active?: boolean;
}

// Validation constants for thinking_level and autonomy_level
export const VALID_THINKING_LEVELS: ThinkingLevel[] = ['low', 'medium', 'high'];
export const VALID_AUTONOMY_LEVELS: AutonomyLevel[] = ['supervised', 'semi_autonomous', 'autonomous'];

// Validation functions
export function isValidThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === 'string' && VALID_THINKING_LEVELS.includes(value as ThinkingLevel);
}

export function isValidAutonomyLevel(value: unknown): value is AutonomyLevel {
  return typeof value === 'string' && VALID_AUTONOMY_LEVELS.includes(value as AutonomyLevel);
}

// ===========================
// SCHEDULES
// ===========================

export interface ScheduleConfig {
  time?: string;
  days?: number[];
  date?: number;
  datetime?: string;
  cron?: string;
}

export interface ScheduledExecution {
  id?: string;
  name: string;
  description?: string;
  agentId: number;
  workflowConfig?: WorkflowConfig;
  scheduleType: 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';
  scheduleConfig: ScheduleConfig;
  timezone: string;
  enabled: boolean;
  taskPrompt?: string;
  taskContext?: Record<string, unknown>;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount?: number;
  lastStatus?: 'success' | 'failed' | 'running';
  lastError?: string;
  lastExecutionOutput?: string;
}

export interface ExecutionResult {
  id: string;
  schedule_id: number;
  executed_at: string;
  status: 'success' | 'failed' | 'timeout';
  task_prompt?: string;
  output?: string;
  error_message?: string;
  execution_time?: number;
  agent_id?: number;
  workflow_config?: WorkflowConfig;
}

export interface ScheduleFilters {
  agentId?: number;
  enabled?: boolean;
}

// ===========================
// TOOLS
// ===========================

export interface Tool {
  id: string | number;
  name: string;
  description: string;
  category?: string;
  categories?: string[];
  provider?: string;
  is_enabled?: boolean;
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  // Pipedream app fields
  name_slug?: string;
  auth_type?: string;
  img_src?: string;
  featured?: boolean;
}

export interface ToolConnection {
  id: string;
  tool_id: string;
  tool_name: string;
  status: 'connected' | 'disconnected' | 'error';
  config?: Record<string, unknown>;
  last_used?: string;
}

// ===========================
// CHAT / SESSIONS
// ===========================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  agent_id: number;
  title?: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

// ===========================
// USER
// ===========================

export interface UserProfile {
  uid: string;
  display_name: string;
  email: string;
}

// ===========================
// HEARTBEAT CONFIGURATION
// ===========================

export interface HeartbeatConfigDTO {
  id?: number;
  agentId: number;
  enabled: boolean;
  cronExpression: string;
  timezone: string;
  activeHoursStart?: string;
  activeHoursEnd?: string;
  weekdaysOnly: boolean;
  prompt?: string;
  maxDurationSeconds: number;
  retryOnFailure: boolean;
  tokenBudget: number;
  eventTokenBudget: number;
  maxAlertsPerHour: number;
  suppressToken: string;
  toolAllowlist?: string[];
  defaultChannelId?: number;
  staggerOffsetMs: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackendHeartbeatConfig {
  id?: number;
  agent_id: number;
  user_id?: string;
  enabled: boolean;
  cron_expression: string;
  timezone: string;
  active_hours_start?: string;
  active_hours_end?: string;
  weekdays_only: boolean;
  prompt?: string;
  max_duration_seconds: number;
  retry_on_failure: boolean;
  token_budget: number;
  event_token_budget: number;
  max_alerts_per_hour: number;
  suppress_token: string;
  tool_allowlist?: string[];
  default_channel_id?: number;
  stagger_offset_ms: number;
  created_at?: string;
  updated_at?: string;
}

export type HeartbeatTriggerType = 'scheduled' | 'event' | 'manual';

export type HeartbeatExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'suppressed';

export type HeartbeatExecutionOutcome = 'success' | 'failure' | 'timeout' | 'suppressed' | 'skipped';

export interface HeartbeatExecutionDTO {
  id: string;
  heartbeatConfigId?: number;
  agentId: number;
  triggerType: HeartbeatTriggerType;
  triggerId?: number;
  eventPayload?: Record<string, unknown>;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  status: HeartbeatExecutionStatus;
  outcome?: HeartbeatExecutionOutcome;
  result?: Record<string, unknown>;
  errorMessage?: string;
  durationMs?: number;
  tokensUsed: number;
  toolCallsCount: number;
  inboxPosts: number;
  memoryUpdates: number;
  alertsSent: number;
  runId?: string;
  createdAt: string;
}

export interface BackendHeartbeatExecution {
  id: string;
  heartbeat_config_id?: number;
  agent_id: number;
  trigger_type: HeartbeatTriggerType;
  trigger_id?: number;
  event_payload?: Record<string, unknown>;
  scheduled_at: string;
  started_at?: string;
  completed_at?: string;
  status: HeartbeatExecutionStatus;
  outcome?: HeartbeatExecutionOutcome;
  result?: Record<string, unknown>;
  error_message?: string;
  duration_ms?: number;
  tokens_used: number;
  tool_calls_count: number;
  inbox_posts: number;
  memory_updates: number;
  alerts_sent: number;
  run_id?: string;
  created_at: string;
}

export interface HeartbeatExecutionFilters {
  triggerType?: HeartbeatTriggerType;
  status?: HeartbeatExecutionStatus;
  limit?: number;
  offset?: number;
}

// ===========================
// SKILLS
// ===========================

export type SkillCategory =
  | 'productivity'
  | 'wellness'
  | 'business'
  | 'content'
  | 'finance'
  | 'education'
  | 'development'
  | 'operations';

export type SkillInstallScope = 'channel' | 'global';

export interface BackendSkill {
  id?: number;
  name: string;
  slug: string;
  description: string;
  user_id: string | null;
  is_global: boolean;
  is_installed?: boolean;
  category: string | null;
  tags: string[];
  avatar_config: string | null;
  version: string;
  file_count: number;
  install_count?: number;
  is_published: boolean;
  author: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id?: number;
  name: string;
  slug: string;
  description: string;
  userId: string | null;
  isGlobal: boolean;
  isInstalled: boolean;
  category: SkillCategory | null;
  tags: string[];
  avatarConfig: string | null;
  version: string;
  fileCount: number;
  installCount: number;
  isPublished: boolean;
  author: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillDetail extends Skill {
  files: SkillFile[];
  installedByAgents: number[];
}

export interface SkillFile {
  path: string;
  size: number;
}

export interface SkillCreateInput {
  name: string;
  description?: string;
  category?: SkillCategory;
  tags?: string[];
}

export interface SkillUpdateInput {
  name?: string;
  description?: string;
  category?: SkillCategory;
  tags?: string[];
  version?: string;
}

export interface SkillInstallInput {
  scope: SkillInstallScope;
  channel_id?: string;
}

export interface SkillFilters {
  category?: SkillCategory;
  search?: string;
  tags?: string[];
}

export interface SkillSecretStatus {
  envKey: string;
  hasValue: boolean;
  hint: string;
  updatedAt: string;
}
