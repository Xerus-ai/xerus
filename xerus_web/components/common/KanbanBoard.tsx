'use client'

import React, { useState, useCallback, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { Plus, MoreHorizontal } from 'lucide-react'
import { TaskCard, type KanbanTask } from './TaskCard'
import type { Agent } from './PresenceAvatars'

export type { KanbanTask, Agent }

export interface KanbanColumn {
  id: string
  title: string
  color?: string
}

interface KanbanBoardProps {
  tasks: KanbanTask[]
  columns?: KanbanColumn[]
  onDragEnd: (taskId: string, newStatus: string) => void
  onTaskClick?: (task: KanbanTask) => void
  onColumnAdd?: (columnId: string) => void
  renderCard?: (task: KanbanTask) => React.ReactNode
  filters?: React.ReactNode
  className?: string
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'todo', title: 'Todo', color: '#9ca3af' },
  { id: 'in_progress', title: 'In Progress', color: '#f54e00' },
  { id: 'done', title: 'Completed', color: '#1f8a65' },
  { id: 'needs_approval', title: 'Needs Approval', color: '#c08532' },
]

const COLUMN_BG: Record<string, string> = {
  todo: 'bg-surface',
  in_progress: 'bg-surface',
  done: 'bg-surface',
  needs_approval: 'bg-surface',
}

// --- Sortable Task Item ---

interface SortableTaskProps {
  task: KanbanTask
  onTaskClick?: (task: KanbanTask) => void
  renderCard?: (task: KanbanTask) => React.ReactNode
}

function SortableTask({ task, onTaskClick, renderCard }: SortableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      {renderCard ? (
        renderCard(task)
      ) : (
        <TaskCard
          task={task}
          onClick={onTaskClick}
          isDragging={isDragging}
        />
      )}
    </div>
  )
}

// --- Droppable Column ---

interface DroppableColumnProps {
  column: KanbanColumn
  tasks: KanbanTask[]
  onTaskClick?: (task: KanbanTask) => void
  onColumnAdd?: (columnId: string) => void
  renderCard?: (task: KanbanTask) => React.ReactNode
}

function DroppableColumn({
  column,
  tasks,
  onTaskClick,
  onColumnAdd,
  renderCard,
}: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
  const bgClass = COLUMN_BG[column.id] || 'bg-surface-alt'

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border border-border',
        bgClass
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
            <circle cx="8" cy="8" r="6.5" stroke={column.color || '#999'} strokeWidth="1.5" fill={column.color ? column.color + '15' : 'none'} />
          </svg>
          <h3 className="text-sm font-semibold text-text">{column.title}</h3>
          <span className="text-xs text-text-muted">{tasks.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover text-text-muted transition-colors"
            aria-label="Add task"
            onClick={() => onColumnAdd?.(column.id)}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover text-text-muted transition-colors" aria-label="Column options">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 px-3 pb-3 space-y-2.5 min-h-[80px] transition-colors duration-200',
          isOver && 'bg-primary/5'
        )}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTask
              key={task.id}
              task={task}
              onTaskClick={onTaskClick}
              renderCard={renderCard}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

// --- Kanban Board ---

export function KanbanBoard({
  tasks,
  columns = DEFAULT_COLUMNS,
  onDragEnd,
  onTaskClick,
  onColumnAdd,
  renderCard,
  filters,
  className,
}: KanbanBoardProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const tasksByColumn = useMemo(() => {
    const grouped: Record<string, KanbanTask[]> = {}
    for (const col of columns) {
      grouped[col.id] = []
    }
    for (const task of tasks) {
      if (grouped[task.status]) {
        grouped[task.status].push(task)
      }
    }
    return grouped
  }, [tasks, columns])

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeTaskId) ?? null,
    [tasks, activeTaskId]
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string)
  }, [])

  const findColumnForTask = useCallback(
    (taskId: string): string | null => {
      for (const col of columns) {
        const columnTasks = tasksByColumn[col.id] || []
        if (columnTasks.some((t) => t.id === taskId)) {
          return col.id
        }
      }
      return null
    },
    [columns, tasksByColumn]
  )

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Handled in handleDragEnd for cross-column moves
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTaskId(null)

      const { active, over } = event
      if (!over) return

      const activeId = active.id as string
      const overId = over.id as string

      // Determine target column:
      // If overId matches a column id, that's the target column.
      // Otherwise, overId is a task id -- find which column it belongs to.
      let targetColumn: string | null = null
      if (columns.some((c) => c.id === overId)) {
        targetColumn = overId
      } else {
        targetColumn = findColumnForTask(overId)
      }

      if (!targetColumn) return

      const sourceColumn = findColumnForTask(activeId)
      if (sourceColumn === targetColumn) return

      onDragEnd(activeId, targetColumn)
    },
    [columns, findColumnForTask, onDragEnd]
  )

  const handleDragCancel = useCallback(() => {
    setActiveTaskId(null)
  }, [])

  return (
    <div className={cn('flex flex-col', className)}>
      {filters && <div className="mb-4">{filters}</div>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          className={cn(
            'gap-4',
            // Mobile/tablet: horizontal scroll with snap, desktop: 4-col grid
            'flex overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-4 px-4 pb-2',
            'lg:grid lg:grid-cols-4 lg:overflow-visible lg:snap-none lg:mx-0 lg:px-0 lg:pb-0',
          )}
        >
          {columns.map((column) => (
            <div
              key={column.id}
              className="snap-start shrink-0 w-[calc(85vw-1rem)] max-w-[320px] lg:w-auto lg:max-w-none"
            >
              <DroppableColumn
                column={column}
                tasks={tasksByColumn[column.id] || []}
                onTaskClick={onTaskClick}
                onColumnAdd={onColumnAdd}
                renderCard={renderCard}
              />
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            renderCard ? (
              renderCard(activeTask)
            ) : (
              <TaskCard task={activeTask} isDragging />
            )
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
