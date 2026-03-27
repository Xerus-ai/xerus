/**
 * Schedules API Module
 * Operations for scheduled agent executions
 */
import { toast } from '@/lib/toast';
import { apiCall } from './client';
import { mapScheduleToFrontend, mapScheduleToBackend, type BackendSchedule } from './mappers';
import type { ScheduledExecution, ExecutionResult, ScheduleFilters } from './types';

/**
 * Create a new scheduled execution
 */
export const createSchedule = async (
  schedule: ScheduledExecution
): Promise<ScheduledExecution> => {
  const response = await apiCall('/schedules', {
    method: 'POST',
    body: JSON.stringify(mapScheduleToBackend(schedule)),
  });

  const result = await response.json();
  const data = result.data || result;
  toast.success('Schedule created', { description: 'Your agent will run on the set schedule.' });
  return mapScheduleToFrontend((data.schedule || data) as BackendSchedule);
};

/**
 * Get all schedules with optional filters
 */
export const getSchedules = async (
  filters?: ScheduleFilters
): Promise<ScheduledExecution[]> => {
  const params = new URLSearchParams();

  if (filters?.agentId) {
    params.append('agent_id', filters.agentId.toString());
  }
  if (filters?.enabled !== undefined) {
    params.append('enabled', filters.enabled.toString());
  }

  const queryString = params.toString();
  const url = queryString ? `/schedules?${queryString}` : '/schedules';

  const response = await apiCall(url, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;
  return (Array.isArray(data) ? data : [] as BackendSchedule[]).map(mapScheduleToFrontend);
};

/**
 * Get a single schedule by ID
 */
export const getSchedule = async (id: string): Promise<ScheduledExecution> => {
  const response = await apiCall(`/schedules/${id}`, { method: 'GET' });
  const result = await response.json();
  const data = result.data || result;
  return mapScheduleToFrontend((data.schedule || data) as BackendSchedule);
};

/**
 * Update a schedule
 */
export const updateSchedule = async (
  id: string,
  updates: Partial<ScheduledExecution>
): Promise<ScheduledExecution> => {
  const backendUpdates: Record<string, unknown> = {};

  if (updates.name !== undefined) backendUpdates.name = updates.name;
  if (updates.description !== undefined) backendUpdates.description = updates.description;
  if (updates.agentId !== undefined) backendUpdates.agent_id = updates.agentId;
  if (updates.workflowConfig !== undefined) backendUpdates.workflow_config = updates.workflowConfig;
  if (updates.scheduleType !== undefined) backendUpdates.schedule_type = updates.scheduleType;
  if (updates.scheduleConfig !== undefined) backendUpdates.schedule_config = updates.scheduleConfig;
  if (updates.timezone !== undefined) backendUpdates.timezone = updates.timezone;
  if (updates.enabled !== undefined) backendUpdates.enabled = updates.enabled;
  if (updates.taskPrompt !== undefined) backendUpdates.task_prompt = updates.taskPrompt;
  if (updates.taskContext !== undefined) backendUpdates.task_context = updates.taskContext;

  const response = await apiCall(`/schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(backendUpdates),
  });

  const result = await response.json();
  const data = result.data || result;
  toast.success('Schedule updated', { description: 'Your changes have been applied.' });
  return mapScheduleToFrontend((data.schedule || data) as BackendSchedule);
};

/**
 * Delete a schedule
 */
export const deleteSchedule = async (id: string): Promise<void> => {
  await apiCall(`/schedules/${id}`, { method: 'DELETE' });
  toast.success('Schedule deleted', { description: 'This schedule has been removed.' });
};

/**
 * Enable a schedule
 */
export const enableSchedule = async (id: string): Promise<ScheduledExecution> => {
  const response = await apiCall(`/schedules/${id}/enable`, { method: 'POST' });
  const result = await response.json();
  const data = result.data || result;
  toast.success('Schedule enabled', { description: 'Your agent will resume running on schedule.' });
  return mapScheduleToFrontend((data.schedule || data) as BackendSchedule);
};

/**
 * Disable a schedule
 */
export const disableSchedule = async (id: string): Promise<ScheduledExecution> => {
  const response = await apiCall(`/schedules/${id}/disable`, { method: 'POST' });
  const result = await response.json();
  const data = result.data || result;
  toast.success('Schedule paused', { description: 'Your agent will stop running until re-enabled.' });
  return mapScheduleToFrontend((data.schedule || data) as BackendSchedule);
};

/**
 * Manually trigger a schedule execution
 */
export const triggerSchedule = async (id: string): Promise<ExecutionResult> => {
  const response = await apiCall(`/schedules/${id}/trigger`, { method: 'POST' });
  const result = await response.json();
  const data = result.data || result;
  toast.success('Schedule triggered', { description: 'Your agent is starting a new run now.' });
  return data.execution || data;
};

/**
 * Get execution history for a schedule
 */
export const getScheduleExecutions = async (
  scheduleId: string,
  limit = 10
): Promise<ExecutionResult[]> => {
  const response = await apiCall(
    `/schedules/${scheduleId}/executions?limit=${limit}`,
    { method: 'GET' }
  );
  const result = await response.json();
  const data = result.data || result;
  return Array.isArray(data) ? data : [];
};

/**
 * Get a specific execution result
 */
export const getExecutionResult = async (executionId: string): Promise<ExecutionResult> => {
  const response = await apiCall(`/execute/${executionId}/status`, { method: 'GET' });
  const result = await response.json();
  return result.data || result;
};

/**
 * Toggle schedule enabled state
 */
export const toggleSchedule = async (id: string, enabled: boolean): Promise<ScheduledExecution> => {
  if (enabled) {
    return enableSchedule(id);
  }
  return disableSchedule(id);
};
