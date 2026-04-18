'use client'

import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Check, Copy, Eye, RotateCcw, ChevronRight, ChevronDown,
  FileText,
  ListChecks, Sparkles, Maximize2, ExternalLink,
  Square, CheckSquare,
} from 'lucide-react'
import type { ChatMessageExtended, ToolCall, TodoItem, WorkspaceArtifact } from './chat-message.types'
import type { TurnPart } from './streaming-turn.types'
import type { Agent } from './types'
import { XERUS_AGENT } from './AgentDropdown'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'
import { MarkdownContent } from './MarkdownContent'
import { ToolCallCard, type ToolCallCardData } from './ToolCallCard'
import { ThinkingSection } from './ThinkingSection'
import { extractTextFromParts } from './streaming-turn.utils'

// ---------------------------------------------------------------------------
// TodoProgress - expandable checklist
// ---------------------------------------------------------------------------

function TodoProgress({ done, total, items }: { done: number; total: number; items?: TodoItem[] }) {
  const [expanded, setExpanded] = useState(false)
  const isComplete = done === total
  const hasItems = items && items.length > 0

  return (
    <div className="inline-flex flex-col items-start max-w-full">
      {/* Header — clickable to expand */}
      <button
        type="button"
        onClick={() => hasItems && setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label="Toggle task details"
        className={cn(
          'inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-surface-active bg-surface-alt/50 transition-colors duration-150',
          hasItems && 'hover:bg-surface-hover/80',
          !hasItems && 'cursor-default'
        )}
      >
        <div className={cn(
          'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
          isComplete ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface text-text-secondary'
        )}>
          <ListChecks className="w-3 h-3" />
        </div>
        <span className={cn(
          'text-xs font-medium',
          isComplete ? 'text-emerald-600' : 'text-text-secondary'
        )}>
          {done}/{total} todos done
        </span>
        {isComplete && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
        {hasItems && (
          expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}
      </button>

      {/* Expanded checklist */}
      {expanded && items && (
        <div className="mt-1.5 ml-3 space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 py-1 pl-1">
              {item.done ? (
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Square className="w-3.5 h-3.5 text-text-muted shrink-0" />
              )}
              <span className={cn(
                'text-[13px] leading-tight',
                item.done ? 'text-text-muted line-through' : 'text-text-secondary'
              )}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PlanCard - expandable plan with full content
// ---------------------------------------------------------------------------

function PlanCard({
  title,
  content,
  onOpenInWorkspace,
}: {
  title: string
  content: string
  onOpenInWorkspace?: (payload: { type: 'plan'; title: string; content: string }) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-2xl border border-secondary/20 bg-secondary/5 overflow-hidden mb-3">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 px-4 py-3 w-full text-left hover:bg-secondary/8 transition-colors"
      >
        <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-secondary/15 text-secondary shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            Proposed Plan
          </span>
          <h3 className="text-sm font-semibold text-text truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {onOpenInWorkspace && (
            <button
              type="button"
              onClick={() => onOpenInWorkspace({ type: 'plan', title, content })}
              className="p-1.5 rounded-lg text-text-muted hover:text-secondary hover:bg-secondary/8 transition-colors"
              aria-label="Open in workspace"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(content)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Copy plan"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-lg text-text-muted hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            aria-label="Accept plan"
          >
            <Check className="w-3 h-3" />
          </button>
        </div>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}
      </button>

      {/* Expanded plan content */}
      {expanded && (
        <div className="px-4 pb-4 max-h-[400px] overflow-y-auto border-t border-secondary/10 bg-surface-alt pt-3">
          <MarkdownContent content={content} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ArtifactCard - workspace file viewer
// ---------------------------------------------------------------------------

function ArtifactCard({
  artifact,
  onOpenInWorkspace,
}: {
  artifact: WorkspaceArtifact
  onOpenInWorkspace?: (payload: { type: 'artifact'; artifact: WorkspaceArtifact }) => void
}) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="rounded-xl border border-surface-active bg-surface-alt/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/10 text-violet-600">
          <FileText className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-text truncate">{artifact.filename}</div>
          <div className="text-[11px] text-text-muted truncate">
            {artifact.lineCount} lines &middot; {artifact.description}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {artifact.preview && (
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              aria-label={showPreview ? 'Hide preview' : 'Show preview'}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenInWorkspace && (
            <button
              type="button"
              onClick={() => onOpenInWorkspace({ type: 'artifact', artifact })}
              className="p-1.5 rounded-lg text-text-muted hover:text-secondary hover:bg-secondary/8 transition-colors"
              aria-label="Open in workspace"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      {showPreview && artifact.preview && (
        <div className="px-3 pb-3 border-t border-surface-active">
          <pre className="text-[11px] leading-relaxed text-text-secondary bg-surface rounded-lg px-3 py-2 mt-2 overflow-x-auto whitespace-pre-wrap font-mono border border-surface-active max-h-[200px] overflow-y-auto">
            {artifact.preview}
          </pre>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Parts rendering helpers
// ---------------------------------------------------------------------------

function partToToolCall(part: TurnPart & { type: 'tool' }, agents?: Agent[]): ToolCallCardData {
  // Resolve agent mascot for Agent/Task tool calls
  let avatarUrl: string | undefined
  if (part.name === 'Agent' && part.args && agents) {
    const subagentSlug = (part.args.subagent_type || part.args.agent_type || '') as string
    const matched = subagentSlug
      ? agents.find(a => a.slug === subagentSlug || a.name === subagentSlug)
      : undefined
    avatarUrl = matched?.avatarUrl ?? undefined
  }

  return {
    id: part.id,
    name: part.name,
    icon: part.icon,
    target: part.target,
    output: part.result != null
      ? (typeof part.result === 'string' ? part.result : JSON.stringify(part.result))
      : undefined,
    status: part.state === 'running' ? 'running' : part.state === 'error' ? 'error' : 'success',
    duration_ms: part.state === 'running' ? undefined : part.durationMs,
    avatarUrl,
  }
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-alt border border-surface-active text-[11px] text-text-muted font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
      {label}
    </span>
  )
}

function getCopyText(message: ChatMessageExtended): string {
  if (message.parts && message.parts.length > 0) {
    return extractTextFromParts(message.parts)
  }

  return message.content
}

function legacyToolCallToCardData(tool: ToolCall): ToolCallCardData {
  return {
    id: tool.id,
    name: tool.name,
    icon: tool.icon,
    target: tool.target,
    detail: tool.detail,
    output: tool.output,
    status: tool.status === 'error' ? 'error' : 'success',
    duration_ms: tool.duration_ms,
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export type WorkspacePayload =
  | { type: 'plan'; title: string; content: string }
  | { type: 'artifact'; artifact: WorkspaceArtifact }

interface MessageBubbleProps {
  message: ChatMessageExtended
  agent?: Agent | null
  agents?: Agent[]
  isStreaming?: boolean
  onViewExecution?: (messageId: string) => void
  onOpenWorkspace?: (payload: WorkspacePayload) => void
}

export const MessageBubble = memo(function MessageBubble({
  message,
  agent,
  agents,
  isStreaming = false,
  onViewExecution,
  onOpenWorkspace,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'

  // Agent identity resolution (consistency principle): if `agent` prop is null,
  // try to resolve from message.agentSlug/agentName against the agents array.
  // This prevents the bug where the Xerus logo flashes on a message that was
  // actually produced by a specific agent. Fall back to the canonical XERUS_AGENT
  // so the header always renders with a real agent identity (no hardcoded logos).
  const resolvedAgent: Agent = agent ?? (
    agents && (message.agentSlug || message.agentName)
      ? agents.find((a) =>
          (message.agentSlug && a.slug === message.agentSlug) ||
          (message.agentName && a.name === message.agentName)
        ) ?? XERUS_AGENT
      : XERUS_AGENT
  )
  const hasExecution =
    !isUser &&
    !isStreaming &&
    (message.metadata?.executionId !== undefined ||
      message.metadata?.processingTime !== undefined)

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

  return (
    <div
      data-testid={isUser ? 'user-message' : 'agent-message'}
      className={cn(
      'group py-4 px-6 min-w-0 overflow-hidden',
      'animate-[fadeInUp_0.4s_ease-out]',
      !isUser && 'hover:bg-surface-hover/40',
      'transition-colors duration-100'
    )}>
      {/* Header: Avatar, Name, badge, time */}
      <div className="flex items-center gap-2 mb-2">
        {!isUser && (
          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
            {isMascotConfig(resolvedAgent.avatarUrl) ? (
              <MascotAvatar config={resolvedAgent.avatarUrl!} size={28} className="w-full h-full" alt={resolvedAgent.name} />
            ) : resolvedAgent.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolvedAgent.avatarUrl} alt={resolvedAgent.name} className="w-7 h-7 object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center bg-secondary/10 text-secondary text-[10px] font-semibold">
                {resolvedAgent.name.substring(0, 2).toUpperCase()}
              </span>
            )}
          </div>
        )}
        <span className={cn(
          'text-sm font-medium',
          isUser ? 'text-text' : 'text-secondary'
        )}>
          {isUser ? 'You' : resolvedAgent.name}
        </span>
        {!isUser && (
          <span className="text-[10px] font-medium text-text-muted bg-surface-hover rounded-full px-1.5 py-0.5">
            AI
          </span>
        )}
        <span className="text-[11px] text-text-muted tabular-nums">
          {formatTime(message.timestamp)}
        </span>
        {isStreaming && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            Live
          </span>
        )}
      </div>

      {/* Parts-based rendering (streaming + history with parts[]) */}
      {message.parts ? (
        message.parts.length > 0 ? (
          <div className="space-y-2">
            {message.parts.map((part) => {
              switch (part.type) {
                case 'text':
                  return <MarkdownContent key={part.id} content={part.text} />
                case 'reasoning':
                  return (
                    <div key={part.id} className="mb-2.5">
                      <ThinkingSection content={part.text} />
                    </div>
                  )
                case 'tool':
                  return (
                    <div key={part.id} className="flex flex-col items-start">
                      <ToolCallCard tool={partToToolCall(part, agents)} />
                    </div>
                  )
                case 'status':
                  return <StatusBadge key={part.id} label={part.label} />
                default:
                  return null
              }
            })}
          </div>
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            Waiting for response...
          </div>
        ) : null
      ) : (
        /* Legacy path: messages without parts[] */
        <>
          {/* Thinking section */}
          {message.thinking && (
            <div className="mb-2.5">
              <ThinkingSection content={message.thinking} />
            </div>
          )}

          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="flex flex-col items-start gap-1.5 mb-3">
              {message.toolCalls.map((tc) => (
                <ToolCallCard key={tc.id} tool={legacyToolCallToCardData(tc)} />
              ))}
            </div>
          )}

          {/* Todo progress */}
          {message.todoProgress && (
            <div className="mb-3 flex">
              <TodoProgress
                done={message.todoProgress.done}
                total={message.todoProgress.total}
                items={message.todoProgress.items}
              />
            </div>
          )}

          {/* Plan card */}
          {message.planTitle && (
            <PlanCard
              title={message.planTitle}
              content={message.content}
              onOpenInWorkspace={onOpenWorkspace}
            />
          )}

          {/* Artifacts */}
          {message.artifacts && message.artifacts.length > 0 && (
            <div className="space-y-2 mb-3">
              {message.artifacts.map((art) => (
                <ArtifactCard
                  key={art.id}
                  artifact={art}
                  onOpenInWorkspace={onOpenWorkspace}
                />
              ))}
            </div>
          )}

          {/* Message content (Markdown) */}
          {!message.planTitle && <MarkdownContent content={message.content} />}
        </>
      )}

      {/* Action bar — hover reveal */}
      {!isUser && !isStreaming && (
        <div className="flex items-center gap-1 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(getCopyText(message))}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <Copy className="w-3 h-3" />
            Copy
          </button>
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Regenerate
          </button>
          {hasExecution && onViewExecution && (
            <button
              type="button"
              onClick={() => onViewExecution(message.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-secondary hover:bg-secondary/8 transition-colors font-medium"
            >
              <Eye className="w-3 h-3" />
              View work
            </button>
          )}
        </div>
      )}
    </div>
  )
})
