'use client'

import { useState, useCallback, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { KanbanBoard } from '@/components/common/KanbanBoard'
import type { KanbanTask } from '@/components/common/TaskCard'
import { TaskPanel } from '@/components/channels/TaskPanel'
import { FloatingPanelProvider } from '@/components/common/FloatingPanelContext'
import { cn } from '@/lib/utils'
import { useChannelTasks } from '@/hooks/useChannelData'
import type { CreateTaskPayload } from '@/hooks/useChannelData'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ChannelTasksProps {
  channelId: string
  className?: string
  agents?: Array<{ id: string; name: string; slug: string; avatar_url?: string }>
}

// ---------------------------------------------------------------------------
// Priority filter pills
// ---------------------------------------------------------------------------

const PRIORITY_FILTERS: readonly { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

// Map workspace DB status -> kanban column id
const STATUS_MAP: Record<string, string> = {
  open: 'todo',
  in_progress: 'in_progress',
  completed: 'done',
  blocked: 'needs_approval',
}

// Map kanban column -> workspace DB status
const COLUMN_TO_DB_STATUS: Record<string, string> = {
  todo: 'open',
  in_progress: 'in_progress',
  done: 'completed',
  needs_approval: 'blocked',
}

// ---------------------------------------------------------------------------
// Filter Bar
// ---------------------------------------------------------------------------

function FilterBar({
  priorityFilter, onPriorityChange, agentFilter, onAgentChange, agents,
}: {
  priorityFilter: string; onPriorityChange: (v: string) => void
  agentFilter: string; onAgentChange: (v: string) => void
  agents: { slug: string; name: string }[]
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {PRIORITY_FILTERS.map((pf) => {
        const isActive = priorityFilter === pf.value
        return (
          <button
            key={pf.value}
            onClick={() => onPriorityChange(pf.value)}
            className={cn(
              'px-4 py-1.5 rounded-full text-[13px] font-medium transition-all border',
              isActive
                ? 'bg-text text-background border-text shadow-sm'
                : 'bg-transparent hover:bg-surface-hover text-text-secondary border-border',
            )}
          >
            {pf.label}
          </button>
        )
      })}

      <Select value={agentFilter} onValueChange={onAgentChange}>
        <SelectTrigger className="h-[34px] px-4 rounded-full border-border bg-transparent text-[13px] font-medium text-text-secondary gap-1.5 w-auto">
          <SelectValue placeholder="Agent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Agent</SelectItem>
          {agents.map((a) => (
            <SelectItem key={a.slug} value={a.slug}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ChannelTasks({ channelId, className, agents = [] }: ChannelTasksProps) {
  const { tasks, isLoading, error, updateTaskStatus, createTask, updateTask, refetch } = useChannelTasks(channelId)

  const [priorityFilter, setPriorityFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')

  // Panel state
  const [panelMode, setPanelMode] = useState<'view' | 'create' | 'edit'>('view')
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createDefaultStatus, setCreateDefaultStatus] = useState<string | undefined>(undefined)

  const availableAgents = useMemo(() => {
    const agentMap = new Map<string, { slug: string; name: string }>()
    for (const task of tasks) {
      if (task.assignedAgents) {
        for (const agent of task.assignedAgents) {
          if (!agentMap.has(agent.slug)) agentMap.set(agent.slug, { slug: agent.slug, name: agent.name })
        }
      }
    }
    return Array.from(agentMap.values())
  }, [tasks])

  // Map slug -> avatar_url from channel agents (where mascot data lives).
  // The /channels/:id/tasks endpoint can't ship mascots because workspace
  // SQLite agents.config only holds {model, temperature}; the mascot is in
  // the filesystem config.json. Join here to enrich assignedAgents.
  const agentAvatarMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of agents) {
      if (a.avatar_url) map.set(a.slug, a.avatar_url)
    }
    return map
  }, [agents])

  const displayTasks = useMemo(() => {
    return tasks
      .map((t) => ({
        ...t,
        status: STATUS_MAP[t.status] || t.status,
        assignedAgents: t.assignedAgents?.map((a) => ({
          ...a,
          avatar_url: a.avatar_url || agentAvatarMap.get(a.slug),
        })),
      }))
      .filter((t) => {
        if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
        if (agentFilter !== 'all' && !t.assignedAgents?.some((a) => a.slug === agentFilter)) return false
        return true
      })
  }, [tasks, priorityFilter, agentFilter, agentAvatarMap])

  const handleDragEnd = useCallback((taskId: string, newStatus: string) => {
    updateTaskStatus(taskId, COLUMN_TO_DB_STATUS[newStatus] || newStatus)
  }, [updateTaskStatus])

  const handleTaskClick = useCallback((task: KanbanTask) => {
    setSelectedTask(task)
    setPanelMode('view')
    setPanelOpen(true)
  }, [])

  const handleColumnAdd = useCallback((columnId: string) => {
    setCreateDefaultStatus(COLUMN_TO_DB_STATUS[columnId] || undefined)
    setSelectedTask(null)
    setPanelMode('create')
    setPanelOpen(true)
  }, [])

  const handleCreateTask = useCallback(async (payload: CreateTaskPayload) => {
    setIsCreating(true)
    try {
      await createTask(channelId, payload)
      await refetch()
    } finally {
      setIsCreating(false)
    }
  }, [channelId, createTask, refetch])

  const handleClosePanel = useCallback(() => {
    setPanelOpen(false)
    setSelectedTask(null)
  }, [])

  if (isLoading) {
    return (
      <div className={cn('flex flex-col h-full items-center justify-center', className)}>
        <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
        <p className="text-sm text-text-muted mt-2">Loading tasks...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex flex-col h-full items-center justify-center', className)}>
        <p className="text-sm text-text-secondary">{error}</p>
      </div>
    )
  }

  return (
    <FloatingPanelProvider>
      <div className={cn('flex flex-col h-full', className)}>
        <div className="flex-1 min-h-0 overflow-auto">
          <KanbanBoard
            tasks={displayTasks}
            onDragEnd={handleDragEnd}
            onTaskClick={handleTaskClick}
            onColumnAdd={handleColumnAdd}
            filters={
              <FilterBar
                priorityFilter={priorityFilter}
                onPriorityChange={setPriorityFilter}
                agentFilter={agentFilter}
                onAgentChange={setAgentFilter}
                agents={availableAgents}
              />
            }
          />
        </div>

        <TaskPanel
          mode={panelMode}
          task={selectedTask}
          isOpen={panelOpen}
          onClose={handleClosePanel}
          onSubmit={handleCreateTask}
          onUpdate={updateTask}
          isSubmitting={isCreating}
          defaultStatus={createDefaultStatus}
          channelTag={channelId}
          agents={agents}
        />
      </div>
    </FloatingPanelProvider>
  )
}
