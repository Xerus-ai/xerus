/**
 * API Module - Central exports
 * Import from '@/lib/api' instead of '@/utils/api'
 */

// Client exports
export {
  apiCall,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  getApiBaseUrl,
  getApiHeaders,
  type ApiError,
} from './client';

// Type exports
export type {
  // Behaviour
  ThinkingLevel,
  AutonomyLevel,
  // Workflow
  WorkflowConfig,
  WorkflowStep,
  // Agents
  Assistant,
  BackendAgent,
  AgentCreateInput,
  AgentUpdateInput,
  AgentTeamMembership,
  // Schedules
  ScheduleConfig,
  ScheduledExecution,
  ExecutionResult,
  ScheduleFilters,
  // Heartbeat
  HeartbeatConfigDTO,
  BackendHeartbeatConfig,
  HeartbeatTriggerType,
  HeartbeatExecutionStatus,
  HeartbeatExecutionOutcome,
  HeartbeatExecutionDTO,
  BackendHeartbeatExecution,
  HeartbeatExecutionFilters,
  // Skills
  Skill,
  SkillDetail,
  SkillFile,
  SkillCategory,
  SkillInstallScope,
  BackendSkill,
  SkillCreateInput,
  SkillUpdateInput,
  SkillInstallInput,
  SkillFilters,
  // Tools
  Tool,
  // User
  UserProfile,
} from './types';

// Mapper exports
export {
  mapAgentToAssistant,
  mapScheduleToFrontend,
  mapScheduleToBackend,
  mapHeartbeatConfigToFrontend,
  mapHeartbeatConfigToBackend,
  mapHeartbeatExecutionToFrontend,
  mapSkillToFrontend,
  mapSkillDetailToFrontend,
} from './mappers';

// Agent API exports
export {
  getAssistants,
  getAssistant,
  getMarketplaceAgents,
  getUserAgents,
  createAgent,
  createAssistant,
  updateAgent,
  deleteAssistant,
  cloneAgent,
  publishAgent,
  unpublishAgent,
  setDefaultAgent,
  formatPrompt,
  type FormattedPromptResult,
} from './agents';

// Agent Knowledge Base API exports
export {
  getAgentKnowledgeBases,
  addAgentKnowledgeBase,
  removeAgentKnowledgeBase,
} from './agent-kb';

// Tools API exports
export {
  getToolsCatalog,
  getTool,
  addToolToAgent,
  assignToolsToAgent,
  removeToolFromAgent,
  removeToolsFromAgent,
  getAgentTools,
} from './tools';

// Schedule API exports
export {
  createSchedule,
  getSchedules,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  enableSchedule,
  disableSchedule,
  toggleSchedule,
  triggerSchedule,
  getScheduleExecutions,
  getExecutionResult,
} from './schedules';

// User API exports
export {
  logout,
  saveApiKey,
  checkApiKeyStatus,
  deleteApiKey,
  getAllApiKeys,
  getUserProfile,
  updateUserProfile,
  deleteAccount,
  setUserInfo,
  getStoredUserInfo,
  findOrCreateUser,
  getCreditBalance,
  type CreditBalance,
} from './user';

// Execute API exports (v3: long-lived SSE + POST messages)
export {
  getStreamUrl,
  sendConversationMessage,
  getConversations,
  getConversationDetail,
  createConversationApi,
  updateConversationTitle,
  deleteConversationApi,
  type Conversation as ExecuteConversation,
  type ConversationDetail,
  type ConversationMessage,
} from './execute';

// Models API exports
export {
  getFeaturedModels,
  getAllModels,
  type ModelEntry,
} from './models';

// Heartbeat API exports
export {
  getHeartbeatConfig,
  updateHeartbeatConfig,
  deleteHeartbeatConfig,
  toggleHeartbeat,
  getHeartbeatExecutions,
} from './heartbeat';

// History API exports
export { getAgentHistory, type RunEntry } from './history';

// Skills API exports
export {
  getSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  installSkill,
  uninstallSkill,
  getSkillFiles,
  readSkillFile,
  writeSkillFile,
  deleteSkillFile,
} from './skills';

// Memory API exports
export { getAgentMemories, type MemoryEntry } from './memory';
