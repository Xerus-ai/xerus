'use client'

import { useCallback } from 'react'
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

const TASK_POLL_INTERVAL_MS = 10_000

const fetchChannelTasks = async ([, id]: readonly [string, string]): Promise<KanbanTask[]> => {
  const result = await apiGet<{ data?: { tasks: KanbanTask[] }; tasks?: KanbanTask[] }>(
    `/channels/${id}/tasks`,
  )
  const payload = result.data ?? result
  return payload.tasks ?? []
}

export function useChannelTasks(channelId: string): UseChannelTasksReturn {
  const swrKey = channelId ? (['channel-tasks', channelId] as const) : null

  const { data, isLoading, error: swrError, mutate } = useSWR<KanbanTask[]>(
    swrKey,
    fetchChannelTasks,
    {
      refreshInterval: TASK_POLL_INTERVAL_MS,
      refreshWhenHidden: false,
      onErrorRetry: (_err, _key, _config, revalidate, { retryCount }) => {
        const delay = Math.min(POLL_MAX_BACKOFF_MS, TASK_POLL_INTERVAL_MS * 2 ** retryCount)
        setTimeout(() => revalidate({ retryCount }), delay)
      },
    },
  )

  const tasks = data ?? []
  const error = swrError instanceof Error ? swrError.message : (swrError ? 'Failed to fetch tasks' : null)

  const updateTaskStatus = useCallback(async (taskId: string, newStatus: string) => {
    await mutate(
      async (current) => {
        await apiPost(`/tasks/${taskId}/status`, { status: newStatus })
        return (current ?? []).map(t => (t.id === taskId ? { ...t, status: newStatus } : t))
      },
      {
        optimisticData: (current) => (current ?? []).map(t => (t.id === taskId ? { ...t, status: newStatus } : t)),
        rollbackOnError: true,
        revalidate: false,
      },
    ).catch(() => {
      toast.error("Couldn't update that task -- reverting", { description: 'Your changes could not be saved. The task has been restored.' })
    })
  }, [mutate])

  const createTaskFn = useCallback(async (chId: string, payload: CreateTaskPayload): Promise<KanbanTask | null> => {
    try {
      const result = await apiPost<{ data?: { task: KanbanTask }; task?: KanbanTask }>(
        `/channels/${chId}/tasks`,
        payload,
      )
      const saved = result.data?.task ?? result.task ?? null
      if (saved) {
        await mutate((current) => [saved, ...(current ?? [])], { revalidate: false })
      }
      return saved
    } catch {
      toast.error("Couldn't create that task", { description: 'Please try again.' })
      return null
    }
  }, [mutate])

  const updateTaskFn = useCallback(async (taskId: string, payload: UpdateTaskPayload): Promise<KanbanTask | null> => {
    try {
      const result = await apiPatch<{ data?: { task: KanbanTask }; task?: KanbanTask }>(
        `/tasks/${taskId}`,
        payload,
      )
      const updated = result.data?.task ?? result.task ?? null
      if (updated) {
        await mutate((current) => (current ?? []).map(t => (t.id === taskId ? updated : t)), { revalidate: false })
      }
      return updated
    } catch {
      toast.error("Couldn't update that task", { description: 'Please try again.' })
      return null
    }
  }, [mutate])

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

  const refetch = useCallback(() => { mutate() }, [mutate])

  return {
    tasks,
    isLoading,
    error,
    updateTaskStatus,
    createTask: createTaskFn,
    updateTask: updateTaskFn,
    getTask: getTaskFn,
    refetch,
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

const DELIVERABLE_POLL_INTERVAL_MS = 15_000

const fetchChannelDeliverables = async ([, id]: readonly [string, string]): Promise<Deliverable[]> => {
  const raw = await apiGet<{ data?: { deliverables: Deliverable[] }; deliverables?: Deliverable[] }>(
    `/channels/${id}/deliverables`,
  )
  const payload = raw.data ?? raw
  return payload.deliverables ?? []
}

export function useChannelDeliverables(channelId: string): UseChannelDeliverablesReturn {
  const swrKey = channelId ? (['channel-deliverables', channelId] as const) : null

  const { data, isLoading, error: swrError, mutate } = useSWR<Deliverable[]>(
    swrKey,
    fetchChannelDeliverables,
    {
      refreshInterval: DELIVERABLE_POLL_INTERVAL_MS,
      refreshWhenHidden: false,
      onErrorRetry: (_err, _key, _config, revalidate, { retryCount }) => {
        const delay = Math.min(POLL_MAX_BACKOFF_MS, DELIVERABLE_POLL_INTERVAL_MS * 2 ** retryCount)
        setTimeout(() => revalidate({ retryCount }), delay)
      },
    },
  )

  const refetch = useCallback(() => { mutate() }, [mutate])

  return {
    deliverables: data ?? [],
    isLoading,
    error: swrError instanceof Error ? swrError.message : (swrError ? 'Failed to fetch deliverables' : null),
    refetch,
  }
}
