/**
 * Heartbeat API Module (STUB)
 *
 * The heartbeat domain has been removed as part of the CLI-native pivot.
 * Scheduling now happens via 9to5 on the sandbox.
 * These stubs prevent runtime errors while the UI is updated.
 */
import type {
  HeartbeatConfigDTO,
  HeartbeatExecutionDTO,
  HeartbeatExecutionFilters,
} from './types';

/**
 * Get heartbeat configuration for an agent
 * @returns null - heartbeat domain removed
 */
export const getHeartbeatConfig = async (_agentId: number): Promise<HeartbeatConfigDTO | null> => {
  return null;
};

/**
 * Create or update heartbeat configuration for an agent
 * @throws Error - heartbeat domain removed
 */
export const updateHeartbeatConfig = async (
  _agentId: number,
  config: Partial<HeartbeatConfigDTO>
): Promise<HeartbeatConfigDTO> => {
  console.warn('[Heartbeat] updateHeartbeatConfig called but heartbeat domain is removed');
  // Return a mock config to prevent crashes
  return {
    agentId: _agentId,
    enabled: config.enabled ?? false,
    cronExpression: config.cronExpression ?? '0 */30 * * *',
    timezone: config.timezone ?? 'UTC',
    weekdaysOnly: config.weekdaysOnly ?? false,
    maxDurationSeconds: config.maxDurationSeconds ?? 300,
    retryOnFailure: config.retryOnFailure ?? true,
    tokenBudget: config.tokenBudget ?? 8000,
    eventTokenBudget: config.eventTokenBudget ?? 4000,
    maxAlertsPerHour: config.maxAlertsPerHour ?? 3,
    suppressToken: config.suppressToken ?? 'HEARTBEAT_OK',
    staggerOffsetMs: config.staggerOffsetMs ?? 0,
  };
};

/**
 * Delete heartbeat configuration for an agent
 * No-op - heartbeat domain removed
 */
export const deleteHeartbeatConfig = async (_agentId: number): Promise<void> => {
  console.warn('[Heartbeat] deleteHeartbeatConfig called but heartbeat domain is removed');
};

/**
 * Enable or disable heartbeat for an agent
 * @returns mock config - heartbeat domain removed
 */
export const toggleHeartbeat = async (agentId: number, enabled: boolean): Promise<HeartbeatConfigDTO> => {
  console.warn('[Heartbeat] toggleHeartbeat called but heartbeat domain is removed');
  return {
    agentId,
    enabled,
    cronExpression: '0 */30 * * *',
    timezone: 'UTC',
    weekdaysOnly: false,
    maxDurationSeconds: 300,
    retryOnFailure: true,
    tokenBudget: 8000,
    eventTokenBudget: 4000,
    maxAlertsPerHour: 3,
    suppressToken: 'HEARTBEAT_OK',
    staggerOffsetMs: 0,
  };
};

/**
 * Get heartbeat execution history for an agent
 * @returns empty - heartbeat domain removed
 */
export const getHeartbeatExecutions = async (
  _agentId: number,
  _filters?: HeartbeatExecutionFilters
): Promise<{ executions: HeartbeatExecutionDTO[]; total: number }> => {
  return { executions: [], total: 0 };
};
