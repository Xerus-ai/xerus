'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'
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

  const fetchMessages = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiGet<{ data?: { messages: ChannelMessage[] }; messages?: ChannelMessage[] }>(
        `/company/channels/${channelId}/messages`
      )
      // Backend wraps response in { success, data: { messages }, meta }
      const payload = result.data ?? result
      setMessages(payload.messages ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch messages')
    } finally {
      setIsLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  const sendMessage = useCallback(async (content: string) => {
    const optimistic: ChannelMessage = {
      id: `msg-${Date.now()}`,
      channel_id: channelId,
      sender_type: 'human',
      sender_slug: 'you',
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

  return { messages, isLoading, error, sendMessage, refetch: fetchMessages }
}

// ---------------------------------------------------------------------------
// Channel Tasks
// ---------------------------------------------------------------------------

interface UseChannelTasksReturn {
  tasks: KanbanTask[]
  isLoading: boolean
  error: string | null
  updateTaskStatus: (taskId: string, newStatus: string) => Promise<void>
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
      toast.error("Couldn't update that task — reverting", { description: 'Your changes could not be saved. The task has been restored.' })
      fetchTasks()
    }
  }, [fetchTasks])

  return { tasks, isLoading, error, updateTaskStatus, refetch: fetchTasks }
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
