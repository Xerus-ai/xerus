/**
 * Heartbeat API Module
 * CRUD operations for agent heartbeat configuration and execution history
 */
import { toast } from '@/lib/toast';
import { apiCall } from './client';
import {
  mapHeartbeatConfigToFrontend,
  mapHeartbeatConfigToBackend,
  mapHeartbeatExecutionToFrontend,
} from './mappers';
import type {
  HeartbeatConfigDTO,
  BackendHeartbeatConfig,
  HeartbeatExecutionDTO,
  BackendHeartbeatExecution,
  HeartbeatExecutionFilters,
} from './types';

/**
 * Get heartbeat configuration for an agent
 */
export const getHeartbeatConfig = async (agentId: number): Promise<HeartbeatConfigDTO | null> => {
  const response = await apiCall(`/agents/${agentId}/heartbeat`, { method: 'GET' }, false);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('Failed to fetch heartbeat config');
  }

  const result = await response.json();
  const data = result.data || result;
  const config: BackendHeartbeatConfig = data.heartbeat_config || data;
  return mapHeartbeatConfigToFrontend(config);
};

/**
 * Create or update heartbeat configuration for an agent
 */
export const updateHeartbeatConfig = async (
  agentId: number,
  config: Partial<HeartbeatConfigDTO>
): Promise<HeartbeatConfigDTO> => {
  const backendConfig = mapHeartbeatConfigToBackend({
    agentId,
    enabled: config.enabled ?? false,
    cronExpression: config.cronExpression ?? '0 */30 * * *',
    timezone: config.timezone ?? 'UTC',
    activeHoursStart: config.activeHoursStart,
    activeHoursEnd: config.activeHoursEnd,
    weekdaysOnly: config.weekdaysOnly ?? false,
    prompt: config.prompt,
    maxDurationSeconds: config.maxDurationSeconds ?? 300,
    retryOnFailure: config.retryOnFailure ?? true,
    tokenBudget: config.tokenBudget ?? 8000,
    eventTokenBudget: config.eventTokenBudget ?? 4000,
    maxAlertsPerHour: config.maxAlertsPerHour ?? 3,
    suppressToken: config.suppressToken ?? 'HEARTBEAT_OK',
    toolAllowlist: config.toolAllowlist,
    defaultChannelId: config.defaultChannelId,
    staggerOffsetMs: config.staggerOffsetMs ?? 0,
  });

  const response = await apiCall(`/agents/${agentId}/heartbeat`, {
    method: 'PUT',
    body: JSON.stringify(backendConfig),
  });

  const result = await response.json();
  const data = result.data || result;
  const savedConfig: BackendHeartbeatConfig = data.heartbeat_config || data;
  toast.success('Automation settings saved', { description: 'Your automation preferences have been updated.' });
  return mapHeartbeatConfigToFrontend(savedConfig);
};

/**
 * Delete heartbeat configuration for an agent
 */
export const deleteHeartbeatConfig = async (agentId: number): Promise<void> => {
  await apiCall(`/agents/${agentId}/heartbeat`, { method: 'DELETE' });
  toast.success('Automation removed', { description: 'This automation has been disabled.' });
};

/**
 * Enable or disable heartbeat for an agent
 */
export const toggleHeartbeat = async (agentId: number, enabled: boolean): Promise<HeartbeatConfigDTO> => {
  const response = await apiCall(`/agents/${agentId}/heartbeat/${enabled ? 'enable' : 'disable'}`, {
    method: 'POST',
  });

  const result = await response.json();
  const data = result.data || result;
  const config: BackendHeartbeatConfig = data.heartbeat_config || data;
  toast.success(enabled ? 'Automation turned on' : 'Automation paused', {
    description: enabled ? 'Your agent will now run automatically.' : 'Your agent will stop running until re-enabled.',
  });
  return mapHeartbeatConfigToFrontend(config);
};

/**
 * Get heartbeat execution history for an agent
 */
export const getHeartbeatExecutions = async (
  agentId: number,
  filters?: HeartbeatExecutionFilters
): Promise<{ executions: HeartbeatExecutionDTO[]; total: number }> => {
  const params = new URLSearchParams();

  if (filters?.triggerType) {
    params.append('trigger_type', filters.triggerType);
  }
  if (filters?.status) {
    params.append('status', filters.status);
  }
  if (filters?.limit) {
    params.append('limit', filters.limit.toString());
  }
  if (filters?.offset) {
    params.append('offset', filters.offset.toString());
  }

  const queryString = params.toString();
  const url = queryString
    ? `/agents/${agentId}/heartbeat/executions?${queryString}`
    : `/agents/${agentId}/heartbeat/executions`;

  const response = await apiCall(url, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;
  const executions: BackendHeartbeatExecution[] = data.executions || [];
  const total = data.total || executions.length;

  return {
    executions: executions.map(mapHeartbeatExecutionToFrontend),
    total,
  };
};

