'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

type SidebarTab = 'history' | 'comments' | 'linked'

interface VersionItem {
  id: string
  label: string
  author: string
  timeAgo: string
  description?: string
  isCurrent?: boolean
}

interface CommentItem {
  id: string
  author: string
  authorInitial: string
  authorColor: string
  timeAgo: string
  body: string
  replies?: Omit<CommentItem, 'replies'>[]
}

interface ArtifactSidebarProps {
  versions?: VersionItem[]
  comments?: CommentItem[]
  onPostComment?: (text: string) => void
  className?: string
}

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'history', label: 'History' },
  { id: 'comments', label: 'Comments' },
]

export function ArtifactSidebar({
  versions = [],
  comments = [],
  onPostComment,
  className,
}: ArtifactSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('history')
  const [commentText, setCommentText] = useState('')

  const handlePost = () => {
    if (!commentText.trim() || !onPostComment) return
    onPostComment(commentText.trim())
    setCommentText('')
  }

  return (
    <div className={cn(
      'flex flex-col border-l border-surface-active/40 bg-card min-h-0 overflow-hidden',
      className,
    )}>
      {/* Tab strip */}
      <div className="flex items-stretch px-3 h-10 border-b border-surface-active/40 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative px-2 text-[13px] font-medium transition-colors',
              activeTab === tab.id
                ? 'text-text font-semibold'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {tab.label}
            {tab.id === 'comments' && comments.length > 0 && (
              <span className="ml-1 text-[10px] text-text-muted font-semibold">{comments.length}</span>
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-[-1px] left-1 right-1 h-[1.5px] bg-text rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-0 scrollbar-thin">
        {activeTab === 'history' && (
          <HistoryContent versions={versions} />
        )}
        {activeTab === 'comments' && (
          <CommentsContent comments={comments} />
        )}
      </div>

      {/* Comment input (always visible on comments tab) */}
      {activeTab === 'comments' && (
        <div className="flex gap-2 p-3 border-t border-surface-active/40 mt-auto shrink-0">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            className="flex-1 min-h-[48px] p-2 bg-surface-hover/60 border border-surface-active rounded-lg text-sm text-text placeholder:text-text-muted resize-none focus:outline-none focus:border-surface-pressed transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost()
            }}
          />
          <button
            type="button"
            onClick={handlePost}
            disabled={!commentText.trim()}
            className="self-end px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/15 disabled:opacity-40 transition-colors"
          >
            Post
          </button>
        </div>
      )}
    </div>
  )
}

function HistoryContent({ versions }: { versions: VersionItem[] }) {
  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-1 text-center">
        <p className="text-sm text-text-muted">No versions saved yet.</p>
        <button type="button" className="text-xs text-secondary hover:underline font-medium">
          Save one now
        </button>
      </div>
    )
  }

  return (
    <>
      {versions.map((version, idx) => (
        <div
          key={version.id}
          className={cn(
            'flex items-start gap-2 p-2 rounded-lg transition-colors cursor-pointer',
            version.isCurrent ? 'bg-surface-hover' : 'hover:bg-surface-hover/60',
          )}
        >
          {/* Timeline dot + connector */}
          <div className="flex flex-col items-center shrink-0 pt-0.5">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                version.isCurrent ? 'bg-emerald-500 w-2.5 h-2.5' : 'bg-text-muted/40',
              )}
            />
            {idx < versions.length - 1 && (
              <div className="w-px flex-1 bg-surface-active mt-1 min-h-[16px]" />
            )}
          </div>

          {/* Version info */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className={cn(
              'text-[13px] font-medium',
              version.isCurrent ? 'text-emerald-500 font-semibold' : 'text-text',
            )}>
              {version.isCurrent ? 'Current version' : version.label}
            </span>
            <span className="text-[11px] text-text-muted tabular-nums">
              {version.author} · {version.timeAgo}
            </span>
            {version.description && (
              <span className="text-[11px] text-text-muted leading-snug">
                {version.description}
              </span>
            )}
          </div>
        </div>
      ))}
    </>
  )
}

function CommentsContent({ comments }: { comments: CommentItem[] }) {
  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-text-muted">No comments yet.</p>
      </div>
    )
  }

  return (
    <>
      {comments.map((comment) => (
        <CommentThread key={comment.id} comment={comment} />
      ))}
    </>
  )
}

function CommentThread({ comment, isReply = false }: { comment: Omit<CommentItem, 'replies'> & { replies?: Omit<CommentItem, 'replies'>[] }; isReply?: boolean }) {
  return (
    <>
      <div className={cn('flex gap-2.5 items-start', isReply && 'pl-6')}>
        <div
          className="w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center text-white shrink-0 mt-0.5"
          style={{ background: comment.authorColor }}
        >
          {comment.authorInitial}
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-text">{comment.author}</span>
            <span className="text-[11px] text-text-muted tabular-nums ml-auto">{comment.timeAgo}</span>
          </div>
          <p className="text-[13px] text-text-secondary leading-relaxed m-0">{comment.body}</p>
          <div className="flex gap-3 mt-0.5">
            <button type="button" className="text-[11px] text-text-muted font-medium hover:text-text transition-colors">Reply</button>
            {!isReply && (
              <button type="button" className="text-[11px] text-text-muted font-medium hover:text-text transition-colors">Resolve</button>
            )}
          </div>
        </div>
      </div>
      {comment.replies?.map((reply) => (
        <CommentThread key={reply.id} comment={reply} isReply />
      ))}
    </>
  )
}
