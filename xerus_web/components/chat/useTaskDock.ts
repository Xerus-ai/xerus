import { useState, useCallback, useRef, useEffect } from 'react'

export interface DockTask {
  id: string
  name: string
  description: string
  status: 'running' | 'completed' | 'failed'
  startTime: number
  endTime?: number
  durationMs?: number
  error?: string
}

interface UseTaskDockReturn {
  tasks: DockTask[]
  isVisible: boolean
  activeCount: number
  completedCount: number
  isCollapsed: boolean
  collapse: () => void
  expand: () => void
  clearTasks: () => void
  addTask: (id: string, name: string, description: string) => void
  completeTask: (id: string, success: boolean, durationMs?: number, error?: string) => void
}

const AUTO_HIDE_DELAY = 3000

export function useTaskDock(): UseTaskDockReturn {
  const [tasks, setTasks] = useState<DockTask[]>([])
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const activeCount = tasks.filter((t) => t.status === 'running').length
  const completedCount = tasks.filter((t) => t.status !== 'running').length

  useEffect(() => {
    if (tasks.length > 0 && activeCount > 0) {
      setIsVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    if (tasks.length > 0 && activeCount === 0) {
      hideTimerRef.current = setTimeout(() => setIsVisible(false), AUTO_HIDE_DELAY)
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [tasks, activeCount])

  const addTask = useCallback((id: string, name: string, description: string) => {
    setTasks((prev) => {
      if (prev.some((t) => t.id === id)) return prev
      return [...prev, { id, name, description, status: 'running', startTime: Date.now() }]
    })
    setIsVisible(true)
  }, [])

  const completeTask = useCallback((id: string, success: boolean, durationMs?: number, error?: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: success ? 'completed' as const : 'failed' as const, endTime: Date.now(), durationMs, error }
          : t,
      ),
    )
  }, [])

  const clearTasks = useCallback(() => {
    setTasks([])
    setIsVisible(false)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

  const collapse = useCallback(() => setIsCollapsed(true), [])
  const expand = useCallback(() => setIsCollapsed(false), [])

  return {
    tasks, isVisible, activeCount, completedCount,
    isCollapsed, collapse, expand, clearTasks, addTask, completeTask,
  }
}
