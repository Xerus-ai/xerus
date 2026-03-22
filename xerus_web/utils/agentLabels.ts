/**
 * Agent Label Utilities
 * Maps agent_type to user-friendly labels and badges
 */

export type AgentType = 'public' | 'private' | 'shared';

/**
 * Get user-friendly label for agent visibility type
 * @param agentType - The agent type from backend ('public', 'private', 'shared')
 * @returns User-friendly label
 */
export function getAgentVisibilityLabel(agentType?: AgentType): string {
  switch (agentType) {
    case 'public':
      return 'Public';
    case 'private':
      return 'Private';
    case 'shared':
      return 'Shared';
    default:
      return 'Public';
  }
}

/**
 * Get badge text with icon for agent visibility
 * @param agentType - The agent type from backend
 * @returns Badge text with emoji icon
 */
export function getAgentVisibilityBadge(agentType?: AgentType): string {
  switch (agentType) {
    case 'public':
      return 'Public';
    case 'private':
      return 'Private';
    case 'shared':
      return 'Shared';
    default:
      return 'Public';
  }
}

/**
 * Get CSS class for agent visibility badge styling
 * @param agentType - The agent type from backend
 * @returns Tailwind CSS class string
 */
export function getAgentVisibilityClass(agentType?: AgentType): string {
  switch (agentType) {
    case 'public':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'private':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'shared':
      return 'bg-green-100 text-green-700 border-green-200';
    default:
      return 'bg-blue-100 text-blue-700 border-blue-200';
  }
}

/**
 * Check if agent is public
 * @param agentType - The agent type from backend
 * @returns true if agent is public
 */
export function isPublicAgent(agentType?: AgentType): boolean {
  return agentType === 'public';
}

/**
 * Check if agent is private
 * @param agentType - The agent type from backend
 * @returns true if agent is private
 */
export function isPrivateAgent(agentType?: AgentType): boolean {
  return agentType === 'private';
}

/**
 * Check if agent can be cloned (only public agents)
 * @param agentType - The agent type from backend
 * @returns true if agent can be cloned
 */
export function canCloneAgent(agentType?: AgentType): boolean {
  return agentType === 'public';
}

/**
 * Get button text for agent action (Customize vs Edit)
 * @param agentType - The agent type from backend
 * @returns Button text
 */
export function getAgentActionButtonText(agentType?: AgentType): string {
  return isPublicAgent(agentType) ? 'Customize' : 'Edit';
}

/**
 * Check if the current user can edit the agent
 * System templates (public + no owner) are read-only
 * Users can only edit their own agents
 *
 * @param agentUserId - The user_id of the agent owner (null for system templates)
 * @param currentUserId - The current logged-in user's ID
 * @param agentType - The agent type from backend
 * @returns true if user can edit the agent
 */
export function canEditAgent(
  agentUserId: string | null | undefined,
  currentUserId: string | null | undefined,
  agentType?: AgentType
): boolean {
  // Must have a logged-in user
  if (!currentUserId) return false;

  // System templates (public agents with no owner) are read-only
  if (agentType === 'public' && !agentUserId) return false;

  // User can edit their own agents
  return agentUserId === currentUserId;
}

/**
 * Check if the agent is a system template (read-only public agent)
 * @param agentUserId - The user_id of the agent owner
 * @param agentType - The agent type from backend
 * @returns true if agent is a system template
 */
export function isSystemTemplate(
  agentUserId: string | null | undefined,
  agentType?: AgentType
): boolean {
  return agentType === 'public' && !agentUserId;
}
