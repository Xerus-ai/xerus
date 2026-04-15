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
  agents?: Array<{ id: string; name: string; slug: string }>
}

// ---------------------------------------------------------------------------
// Priority filter pills
// ---------------------------------------------------------------------------

const PRIORITY_FILTERS: readonly { value: string; label: string; color?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical', color: '#EF4444' },
  { value: 'high', label: 'High', color: '#F97316' },
  { value: 'medium', label: 'Medium', color: '#EAB308' },
  { value: 'low', label: 'Low', color: '#22C55E' },
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
              'px-5 py-2 rounded-full text-sm font-medium transition-all border',
              isActive
                ? 'bg-secondary/10 text-secondary border-secondary/20'
                : 'bg-transparent hover:bg-surface-hover text-text-secondary border-border',
            )}
            style={isActive && pf.color ? { backgroundColor: pf.color, borderColor: pf.color } : undefined}
          >
            {pf.label}
          </button>
        )
      })}

      <Select value={agentFilter} onValueChange={onAgentChange}>
        <SelectTrigger className="h-[38px] px-5 rounded-full border-border bg-transparent text-sm font-medium text-text-secondary gap-1.5 w-auto">
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

  const displayTasks = useMemo(() => {
    return tasks
      .map((t) => ({ ...t, status: STATUS_MAP[t.status] || t.status }))
      .filter((t) => {
        if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
        if (agentFilter !== 'all' && !t.assignedAgents?.some((a) => a.slug === agentFilter)) return false
        return true
      })
  }, [tasks, priorityFilter, agentFilter])

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
