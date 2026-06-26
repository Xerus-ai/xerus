'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { Copy, RotateCcw } from 'lucide-react'
import type { ChatMessageExtended, ToolCall, WorkspaceArtifact } from './chat-message.types'
import type { TurnPart } from './streaming-turn.types'
import type { Agent } from './types'
import { XERUS_AGENT, XERUS_MASTER_SLUG, CTO_AGENT, XERUS_CTO_SLUG } from './AgentDropdown'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'
import { MarkdownContent } from './MarkdownContent'
import { ToolCallCard, type ToolCallCardData } from './ToolCallCard'
import { ToolActionGroup } from './ToolActionGroup'
import { ThinkingSection } from './ThinkingSection'
import { RichThinkingIndicator } from './RichThinkingIndicator'
import { extractTextFromParts, groupConsecutiveTools } from './streaming-turn.utils'
import { TodoProgress, PlanCard, ArtifactCard } from './MessageCards'


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
    label: part.label,
    icon: part.icon,
    target: part.target,
    detail: part.detail,
    progressMessage: part.progressMessage,
    args: part.args,
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
    label: tool.name,
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
  const resolvedAgent: Agent = agent ?? (() => {
    // Prefer the real agent from the list (carries the mascot config avatarUrl
    // from the DB). Merge over the static constant so system agents keep their
    // canonical name/id while gaining the real avatar once loaded.
    const fromList = agents && (message.agentSlug || message.agentName)
      ? agents.find((a) =>
          (message.agentSlug && a.slug === message.agentSlug) ||
          (message.agentName && a.name === message.agentName)
        )
      : undefined
    if (message.agentSlug === XERUS_MASTER_SLUG) return fromList ? { ...XERUS_AGENT, ...fromList, avatarUrl: XERUS_AGENT.avatarUrl } : XERUS_AGENT
    if (message.agentSlug === XERUS_CTO_SLUG) return fromList ? { ...CTO_AGENT, ...fromList, avatarUrl: CTO_AGENT.avatarUrl } : CTO_AGENT
    return fromList ?? XERUS_AGENT
  })()
  void onViewExecution

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
      <div className="flex items-center gap-2 mb-1">
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
          'text-sm font-medium shrink-0',
          isUser ? 'text-text' : 'text-secondary'
        )}>
          {isUser ? 'You' : resolvedAgent.name}
        </span>
        {!isUser && !isStreaming && (
          <span className="text-[10px] font-medium text-text-muted bg-surface-hover rounded-full px-1.5 py-0.5 shrink-0">
            AI
          </span>
        )}
        {isUser && message.isQueued && (
          <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 rounded-full px-1.5 py-0.5 shrink-0">
            Queued
          </span>
        )}
        <span className="text-[11px] text-text-muted tabular-nums shrink-0">
          {formatTime(message.timestamp)}
        </span>
        {isStreaming && !message.parts?.some(p => p.type === 'reasoning') && (
          <RichThinkingIndicator parts={message.parts} />
        )}
      </div>

      {/* Parts-based rendering (streaming + history with parts[]) */}
      {message.parts ? (
        message.parts.length > 0 ? (
          <div className="space-y-2">
            {groupConsecutiveTools(message.parts).map((part) => {
              if (part.type === 'tool-group') {
                return <ToolActionGroup key={part.id} tools={part.parts} agents={agents} />
              }
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

      {/* Written file chips — clickable to open in artifact viewer */}
      {!isStreaming && message.writtenFiles && message.writtenFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {message.writtenFiles.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => onOpenWorkspace?.({ type: 'artifact', artifact: { id: file.path, filename: file.name, path: file.path, lineCount: 0, description: file.extension } })}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-surface-alt border border-surface-active text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {file.name}
            </button>
          ))}
        </div>
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
        </div>
      )}
    </div>
  )
})
