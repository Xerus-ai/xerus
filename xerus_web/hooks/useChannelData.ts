'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPost, apiPatch } from '@/lib/api/client'
import { toast } from '@/lib/toast'
import type { ChannelMessage } from '@/components/channels/ChannelActivity'
import type { KanbanTask } from '@/components/common/TaskCard'

// ---------------------------------------------------------------------------
// Deliverables
// ---------------------------------------------------------------------------

export interface Deliverable {
  id: string
  filename: string
  file_type: 'html' | 'pdf' | 'markdown' | 'code' | 'image' | 'other'
  language?: string
  content?: string
  preview_url?: string
  author_slug: string
  file_size_bytes: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Channel Messages
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5000

interface UseChannelMessagesReturn {
  messages: ChannelMessage[]
  isLoading: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
  refetch: () => void
}

export function useChannelMessages(channelId: string): UseChannelMessagesReturn {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const initialLoadDone = useRef(false)

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true)
      setError(null)
    }
    try {
      const result = await apiGet<{ data?: { messages: ChannelMessage[] }; messages?: ChannelMessage[] }>(
        `/company/channels/${channelId}/messages`
      )
      // Backend wraps response in { success, data: { messages }, meta }
      const payload = result.data ?? result
      const incoming = payload.messages ?? []

      // Only update state if the message list actually changed
      // Compare count + first ID + last ID to catch mid-list insertions
      setMessages(prev => {
        if (
          prev.length === incoming.length &&
          prev.length > 0 &&
          prev[0].id === incoming[0]?.id &&
          prev[prev.length - 1].id === incoming[incoming.length - 1]?.id
        ) {
          return prev // no change, keep same reference to avoid re-renders
        }
        return incoming
      })
    } catch (err) {
      // Only surface errors on initial load, not on silent polls
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to fetch messages')
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
    }
  }, [channelId])

  // Initial fetch
  useEffect(() => {
    initialLoadDone.current = false
    fetchMessages(false).then(() => {
      initialLoadDone.current = true
    })
  }, [fetchMessages])

  // Polling: silent refetch every POLL_INTERVAL_MS after initial load
  // Pauses when browser tab is hidden to save bandwidth
  useEffect(() => {
    const interval = setInterval(() => {
      if (initialLoadDone.current && document.visibilityState === 'visible') {
        fetchMessages(true)
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [fetchMessages])

  const sendMessage = useCallback(async (content: string) => {
    const optimistic: ChannelMessage = {
      id: `msg-${Date.now()}`,
      channel_id: channelId,
      sender_type: 'human',
      sender_slug: 'human',
      sender_name: 'You',
      content,
      message_type: 'post',
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const result = await apiPost<{ data?: { message: ChannelMessage }; message?: ChannelMessage }>(
        `/company/channels/${channelId}/messages`,
        { content, sender_type: 'human' }
      )
      // Backend wraps response in { success, data: { message }, meta }
      const savedPayload = result.data ?? result
      const saved = savedPayload.message ?? optimistic
      setMessages(prev =>
        prev.map(m => (m.id === optimistic.id ? saved : m))
      )
    } catch {
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      toast.error("Your message wasn't sent", { description: 'Please try again.' });
    }
  }, [channelId])

  return { messages, isLoading, error, sendMessage, refetch: () => fetchMessages(false) }
}

// ---------------------------------------------------------------------------
// Channel Tasks
// ---------------------------------------------------------------------------

export interface CreateTaskPayload {
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high' | 'critical'
  assigned_agents?: string[]
  labels?: string[]
  due_date?: string
  status?: string
}

export interface UpdateTaskPayload {
  title?: string
  description?: string | null
  priority?: string
  assigned_agent?: string | null
  labels?: string[]
  due_date?: string | null
  status?: string
}

interface UseChannelTasksReturn {
  tasks: KanbanTask[]
  isLoading: boolean
  error: string | null
  updateTaskStatus: (taskId: string, newStatus: string) => Promise<void>
  createTask: (channelId: string, payload: CreateTaskPayload) => Promise<KanbanTask | null>
  updateTask: (taskId: string, payload: UpdateTaskPayload) => Promise<KanbanTask | null>
  getTask: (taskId: string) => Promise<KanbanTask | null>
  refetch: () => void
}

export function useChannelTasks(channelId: string): UseChannelTasksReturn {
  const [tasks, setTasks] = useState<KanbanTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiGet<{ data?: { tasks: KanbanTask[] }; tasks?: KanbanTask[] }>(
        `/channels/${channelId}/tasks`
      )
      // Backend wraps response in { success, data: { tasks }, meta }
      const payload = result.data ?? result
      setTasks(payload.tasks ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks')
    } finally {
      setIsLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const updateTaskStatus = useCallback(async (taskId: string, newStatus: string) => {
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)))
    try {
      await apiPost(`/tasks/${taskId}/status`, { status: newStatus })
    } catch {
      toast.error("Couldn't update that task -- reverting", { description: 'Your changes could not be saved. The task has been restored.' })
      fetchTasks()
    }
  }, [fetchTasks])

  const createTaskFn = useCallback(async (chId: string, payload: CreateTaskPayload): Promise<KanbanTask | null> => {
    try {
      const result = await apiPost<{ data?: { task: KanbanTask }; task?: KanbanTask }>(
        `/channels/${chId}/tasks`,
        payload,
      )
      const saved = result.data?.task ?? result.task ?? null
      if (saved) {
        setTasks(prev => [saved, ...prev])
      }
      return saved
    } catch {
      toast.error("Couldn't create that task", { description: 'Please try again.' })
      return null
    }
  }, [])

  const updateTaskFn = useCallback(async (taskId: string, payload: UpdateTaskPayload): Promise<KanbanTask | null> => {
    try {
      const result = await apiPatch<{ data?: { task: KanbanTask }; task?: KanbanTask }>(
        `/tasks/${taskId}`,
        payload,
      )
      const updated = result.data?.task ?? result.task ?? null
      if (updated) {
        setTasks(prev => prev.map(t => (t.id === taskId ? updated : t)))
      }
      return updated
    } catch {
      toast.error("Couldn't update that task", { description: 'Please try again.' })
      return null
    }
  }, [])

  const getTaskFn = useCallback(async (taskId: string): Promise<KanbanTask | null> => {
    try {
      const result = await apiGet<{ data?: { task: KanbanTask }; task?: KanbanTask }>(
        `/tasks/${taskId}`,
      )
      return result.data?.task ?? result.task ?? null
    } catch {
      return null
    }
  }, [])

  return {
    tasks,
    isLoading,
    error,
    updateTaskStatus,
    createTask: createTaskFn,
    updateTask: updateTaskFn,
    getTask: getTaskFn,
    refetch: fetchTasks,
  }
}

// ---------------------------------------------------------------------------
// Channel Deliverables
// ---------------------------------------------------------------------------

interface UseChannelDeliverablesReturn {
  deliverables: Deliverable[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useChannelDeliverables(channelId: string): UseChannelDeliverablesReturn {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDeliverables = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const raw = await apiGet<{ data?: { deliverables: Deliverable[] }; deliverables?: Deliverable[] }>(
        `/channels/${channelId}/deliverables`
      )
      // Backend wraps response in { success, data: { deliverables }, meta }
      const payload = raw.data ?? raw
      setDeliverables(payload.deliverables ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch deliverables')
    } finally {
      setIsLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    fetchDeliverables()
  }, [fetchDeliverables])

  return { deliverables, isLoading, error, refetch: fetchDeliverables }
}
