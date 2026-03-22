'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { KanbanBoard, type KanbanTask } from '@/components/common/KanbanBoard'
import { Loader2 } from 'lucide-react'
import { useCompanyTasks } from '@/hooks/useOfficeData'
import { extractProjects, filterTasks } from './board-data'
import { BoardFilters } from './BoardFilters'
import { TaskDetailSheet } from './TaskDetailSheet'

export function CompanyBoard() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const domainFilter = searchParams.get('domain') ?? 'all'
  const agentFilter = searchParams.get('agent') ?? 'all'
  const priorityFilter = searchParams.get('priority') ?? 'all'

  const { tasks, agents, isLoading, error, updateTaskStatus } = useCompanyTasks()
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null)

  const projects = useMemo(() => extractProjects(tasks), [tasks])

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === 'all') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router]
  )

  const filteredTasks = useMemo(
    () => filterTasks(tasks, domainFilter, agentFilter, priorityFilter),
    [tasks, domainFilter, agentFilter, priorityFilter]
  )

  const handleDragEnd = useCallback(
    (taskId: string, newStatus: string) => {
      updateTaskStatus(taskId, newStatus)
    },
    [updateTaskStatus]
  )

  const handleTaskClick = useCallback((task: KanbanTask) => {
    setSelectedTask(task)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
        <span className="ml-2 text-sm text-text-muted">Loading board...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-text-secondary">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BoardFilters
        priorityFilter={priorityFilter}
        agentFilter={agentFilter}
        domainFilter={domainFilter}
        agents={agents}
        projects={projects}
        onFilterChange={updateFilter}
      />

      <KanbanBoard
        tasks={filteredTasks}
        onDragEnd={handleDragEnd}
        onTaskClick={handleTaskClick}
      />

      <TaskDetailSheet
        selectedTask={selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  )
}
