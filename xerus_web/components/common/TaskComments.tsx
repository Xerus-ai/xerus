'use client'

import { useState, useEffect, useCallback } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiGet, apiPost } from '@/lib/api/client'
import { toast } from '@/lib/toast'

interface TaskComment {
  id: string
  author: string
  content: string
  timestamp: string
  source: string
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface TaskCommentsProps {
  taskId: string
  cardClassName?: string
}

export function TaskComments({ taskId, cardClassName }: TaskCommentsProps) {
  const [comments, setComments] = useState<TaskComment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  const fetchComments = useCallback(async () => {
    try {
      const result = await apiGet<{ data?: { comments: TaskComment[] }; comments?: TaskComment[] }>(
        `/tasks/${taskId}/comments`,
      )
      const payload = result.data ?? result
      setComments(payload.comments ?? [])
      setError(null)
    } catch {
      setError('Failed to load comments')
      setComments([])
    } finally {
      setIsLoading(false)
    }
  }, [taskId])

  useEffect(() => { fetchComments() }, [fetchComments])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return
    setIsSending(true)
    try {
      await apiPost(`/tasks/${taskId}/comments`, { content: input.trim() })
      setInput('')
      await fetchComments()
    } catch {
      toast.error("Couldn't post comment")
    } finally {
      setIsSending(false)
    }
  }, [input, isSending, taskId, fetchComments])

  if (isLoading) {
    return <p className="text-xs text-text-muted py-4 text-center">Loading comments...</p>
  }

  if (error) {
    return <p className="text-xs text-red-400 py-4 text-center">{error}</p>
  }

  return (
    <div className="space-y-3">
      {comments.length > 0 ? (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className={cn('px-3 py-2.5 rounded-xl', cardClassName || 'bg-surface border border-border/10')}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-text">
                  {c.source === 'user' ? 'You' : `@${c.author}`}
                </span>
                <span className="text-[10px] text-text-muted">{timeAgo(c.timestamp)}</span>
              </div>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted py-2 text-center">No comments yet</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Add a comment..."
          className="flex-1 px-3 py-2 rounded-xl bg-surface border border-border/20 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary/40"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isSending}
          className="w-8 h-8 rounded-xl bg-text text-background flex items-center justify-center hover:bg-primary transition-colors disabled:opacity-40"
          aria-label="Send comment"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
