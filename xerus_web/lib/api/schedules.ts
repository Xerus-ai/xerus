/**
 * Schedules API Module (STUB)
 *
 * The schedules domain has been removed as part of the CLI-native pivot.
 * Scheduling now happens via 9to5 on the sandbox.
 * These stubs prevent runtime errors while the UI is updated.
 */
import type { ScheduledExecution, ExecutionResult, ScheduleFilters } from './types';

/**
 * Create a new scheduled execution
 * @throws - schedules domain removed
 */
export const createSchedule = async (
  _schedule: ScheduledExecution
): Promise<ScheduledExecution> => {
  console.warn('[Schedules] createSchedule called but schedules domain is removed');
  throw new Error('Schedules feature is being migrated to sandbox-native 9to5');
};

/**
 * Get all schedules with optional filters
 * @returns empty array - schedules domain removed
 */
export const getSchedules = async (
  _filters?: ScheduleFilters
): Promise<ScheduledExecution[]> => {
  return [];
};

/**
 * Get a single schedule by ID
 * @throws - schedules domain removed
 */
export const getSchedule = async (_id: string): Promise<ScheduledExecution> => {
  throw new Error('Schedules feature is being migrated to sandbox-native 9to5');
};

/**
 * Update a schedule
 * @throws - schedules domain removed
 */
export const updateSchedule = async (
  _id: string,
  _updates: Partial<ScheduledExecution>
): Promise<ScheduledExecution> => {
  console.warn('[Schedules] updateSchedule called but schedules domain is removed');
  throw new Error('Schedules feature is being migrated to sandbox-native 9to5');
};

/**
 * Delete a schedule
 * No-op - schedules domain removed
 */
export const deleteSchedule = async (_id: string): Promise<void> => {
  console.warn('[Schedules] deleteSchedule called but schedules domain is removed');
};

/**
 * Enable a schedule
 * @throws - schedules domain removed
 */
export const enableSchedule = async (_id: string): Promise<ScheduledExecution> => {
  throw new Error('Schedules feature is being migrated to sandbox-native 9to5');
};

/**
 * Disable a schedule
 * @throws - schedules domain removed
 */
export const disableSchedule = async (_id: string): Promise<ScheduledExecution> => {
  throw new Error('Schedules feature is being migrated to sandbox-native 9to5');
};

/**
 * Manually trigger a schedule execution
 * @throws - schedules domain removed
 */
export const triggerSchedule = async (_id: string): Promise<ExecutionResult> => {
  throw new Error('Schedules feature is being migrated to sandbox-native 9to5');
};

/**
 * Get execution history for a schedule
 * @returns empty array - schedules domain removed
 */
export const getScheduleExecutions = async (
  _scheduleId: string,
  _limit = 10
): Promise<ExecutionResult[]> => {
  return [];
};

/**
 * Get a specific execution result
 * This one proxies to the actual execute endpoint which still exists
 */
export { } // Placeholder - getExecutionResult should use execute.ts instead

/**
 * Toggle schedule enabled state
 * @throws - schedules domain removed
 */
export const toggleSchedule = async (_id: string, _enabled: boolean): Promise<ScheduledExecution> => {
  throw new Error('Schedules feature is being migrated to sandbox-native 9to5');
};
