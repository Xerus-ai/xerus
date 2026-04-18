'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import useSWR from 'swr'
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

const POLL_INTERVAL_MS = 8000
const POLL_MAX_BACKOFF_MS = 60_000

interface UseChannelMessagesReturn {
  messages: ChannelMessage[]
  isLoading: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
  refetch: () => void
}

const fetchChannelMessages = async ([, id]: readonly [string, string]): Promise<ChannelMessage[]> => {
  const result = await apiGet<{ data?: { messages: ChannelMessage[] }; messages?: ChannelMessage[] }>(
    `/company/channels/${id}/messages`,
  )
  const payload = result.data ?? result
  return payload.messages ?? []
}

export function useChannelMessages(channelId: string): UseChannelMessagesReturn {
  const swrKey = channelId ? (['channel-messages', channelId] as const) : null

  const { data, isLoading, error, mutate } = useSWR<ChannelMessage[]>(
    swrKey,
    fetchChannelMessages,
    {
      refreshInterval: POLL_INTERVAL_MS,
      refreshWhenHidden: false,
      // Polling retries indefinitely with capped exponential backoff so transient
      // outages recover automatically — overrides the global errorRetryCount cap.
      onErrorRetry: (_err, _key, _config, revalidate, { retryCount }) => {
        const delay = Math.min(POLL_MAX_BACKOFF_MS, POLL_INTERVAL_MS * 2 ** retryCount)
        setTimeout(() => revalidate({ retryCount }), delay)
      },
    },
  )

  const sendMessage = useCallback(async (content: string) => {
    if (!channelId) return
    const optimistic: ChannelMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel_id: channelId,
      sender_type: 'human',
      sender_slug: 'human',
      sender_name: 'You',
      content,
      message_type: 'post',
      created_at: new Date().toISOString(),
    }

    try {
      await mutate(
        async (current) => {
          const result = await apiPost<{ data?: { message: ChannelMessage }; message?: ChannelMessage }>(
            `/company/channels/${channelId}/messages`,
            { content, sender_type: 'human' },
          )
          const savedPayload = result.data ?? result
          const saved = savedPayload.message ?? optimistic
          const base = (current ?? []).filter(m => m.id !== optimistic.id)
          return [...base, saved]
        },
        {
          optimisticData: (current) => [...(current ?? []), optimistic],
          rollbackOnError: true,
          revalidate: false,
        },
      )
    } catch (err) {
      toast.error("Your message wasn't sent", { description: 'Please try again.' })
      throw err
    }
  }, [channelId, mutate])

  const refetch = useCallback(() => {
    mutate()
  }, [mutate])

  const errorMessage = error instanceof Error
    ? error.message
    : (error ? 'Failed to fetch messages' : null)

  return {
    messages: data ?? [],
    isLoading,
    error: errorMessage,
    sendMessage,
    refetch,
  }
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
  const channelIdRef = useRef(channelId)
  const inFlightRef = useRef(false)

  const fetchTasks = useCallback(async (signal?: AbortSignal) => {
    if (!channelId) return
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiGet<{ data?: { tasks: KanbanTask[] }; tasks?: KanbanTask[] }>(
        `/channels/${channelId}/tasks`,
        signal ? { signal } : undefined,
      )
      if (signal?.aborted || channelIdRef.current !== channelId) return
      const payload = result.data ?? result
      setTasks(payload.tasks ?? [])
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks')
    } finally {
      inFlightRef.current = false
      if (!signal?.aborted && channelIdRef.current === channelId) {
        setIsLoading(false)
      }
    }
  }, [channelId])

  useEffect(() => {
    channelIdRef.current = channelId
    inFlightRef.current = false
    const controller = new AbortController()
    fetchTasks(controller.signal)
    return () => controller.abort()
  }, [channelId, fetchTasks])

  const updateTaskStatus = useCallback(async (taskId: string, newStatus: string) => {
    const previous = tasks
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)))
    try {
      await apiPost(`/tasks/${taskId}/status`, { status: newStatus })
    } catch (err) {
      setTasks(previous)
      toast.error("Couldn't update that task -- reverting", { description: 'Your changes could not be saved. The task has been restored.' })
      throw err
    }
  }, [tasks])

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
  const channelIdRef = useRef(channelId)
  const inFlightRef = useRef(false)

  const fetchDeliverables = useCallback(async (signal?: AbortSignal) => {
    if (!channelId) return
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsLoading(true)
    setError(null)
    try {
      const raw = await apiGet<{ data?: { deliverables: Deliverable[] }; deliverables?: Deliverable[] }>(
        `/channels/${channelId}/deliverables`,
        signal ? { signal } : undefined,
      )
      if (signal?.aborted || channelIdRef.current !== channelId) return
      const payload = raw.data ?? raw
      setDeliverables(payload.deliverables ?? [])
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return
      setError(err instanceof Error ? err.message : 'Failed to fetch deliverables')
    } finally {
      inFlightRef.current = false
      if (!signal?.aborted && channelIdRef.current === channelId) {
        setIsLoading(false)
      }
    }
  }, [channelId])

  useEffect(() => {
    channelIdRef.current = channelId
    inFlightRef.current = false
    const controller = new AbortController()
    fetchDeliverables(controller.signal)
    return () => controller.abort()
  }, [channelId, fetchDeliverables])

  return { deliverables, isLoading, error, refetch: fetchDeliverables }
}
