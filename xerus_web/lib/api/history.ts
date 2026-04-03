/**
 * History API Module (STUB)
 *
 * The history domain has been removed as part of the CLI-native pivot.
 * Execution history is stored in workspace.db on the sandbox.
 * These stubs prevent runtime errors while the UI is updated.
 */

export interface RunEntry {
  id: string;
  status: 'success' | 'failed' | 'running';
  triggerType: string;
  task: string;
  description: string;
  tokensUsed: number;
  creditsUsed: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  duration: string;
}

/**
 * Get execution history for an agent
 * @returns empty array - history is stored in workspace.db on sandbox
 */
export async function getAgentHistory(
  _agentSlug: string,
  _status?: string
): Promise<RunEntry[]> {
  return [];
}
