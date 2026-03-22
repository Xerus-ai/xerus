import type { KanbanTask } from '@/components/common/KanbanBoard'

export const PRIORITIES = ['all', 'critical', 'high', 'medium', 'low'] as const

export const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
}

// Dummy data (DUMMY_SUBTASK_NAMES, DUMMY_SUBTASK_NOTES, DUMMY_FILES)
// has been removed. See board-data.reference.ts for the original data
// that was used during UI development.

/**
 * Extract unique project names from task channel tags.
 */
export function extractProjects(tasks: KanbanTask[]): string[] {
  const projectSet = new Set<string>()
  tasks.forEach(t => {
    if (t.channelTag) {
      const project = t.channelTag.split('/')[0]
      projectSet.add(project)
    }
  })
  return ['all', ...Array.from(projectSet)]
}

/**
 * Filter tasks based on domain, agent, and priority filters.
 */
export function filterTasks(
  tasks: KanbanTask[],
  domainFilter: string,
  agentFilter: string,
  priorityFilter: string
): KanbanTask[] {
  return tasks.filter((task) => {
    if (domainFilter !== 'all' && !task.channelTag?.startsWith(domainFilter)) {
      return false
    }
    if (agentFilter !== 'all') {
      const hasAgent = task.assignedAgents?.some((a) => a.slug === agentFilter)
      if (!hasAgent) return false
    }
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
      return false
    }
    return true
  })
}
