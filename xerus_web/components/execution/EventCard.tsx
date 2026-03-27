'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ToolCallCard } from './ToolCallCard'
import { BashCard } from './BashCard'
import { FileCard } from './FileCard'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionEvent {
  id: string
  type:
    | 'tool_call'
    | 'tool_result'
    | 'assistant_message'
    | 'user_message'
    | 'thinking'
    | 'subagent_start'
    | 'subagent_stop'
  timestamp: string
  tool_name?: string
  input?: Record<string, unknown>
  output?: string
  content?: string
  duration_ms?: number
  status?: 'running' | 'completed' | 'error'
  error?: string
  subagent_type?: string
  subagent_name?: string
}

// ---------------------------------------------------------------------------
// Grouped event types
// ---------------------------------------------------------------------------

export interface PairedToolEvent {
  kind: 'tool'
  call: ExecutionEvent
  result: ExecutionEvent | null
}

export interface MessageEvent {
  kind: 'message'
  event: ExecutionEvent
}

export type GroupedEvent = PairedToolEvent | MessageEvent

// ---------------------------------------------------------------------------
// Group consecutive tool_call + tool_result events together
// ---------------------------------------------------------------------------

export function groupEvents(events: ExecutionEvent[]): GroupedEvent[] {
  const grouped: GroupedEvent[] = []
  let i = 0

  while (i < events.length) {
    const current = events[i]

    if (current.type === 'tool_call') {
      const next = i + 1 < events.length ? events[i + 1] : null
      if (next && next.type === 'tool_result') {
        grouped.push({ kind: 'tool', call: current, result: next })
        i += 2
        continue
      }
      grouped.push({ kind: 'tool', call: current, result: null })
      i += 1
      continue
    }

    if (current.type === 'tool_result') {
      i += 1
      continue
    }

    grouped.push({ kind: 'message', event: current })
    i += 1
  }

  return grouped
}

// ---------------------------------------------------------------------------
// Tool name classification helpers
// ---------------------------------------------------------------------------

const BASH_TOOL_NAMES = new Set([
  'bash', 'execute_bash', 'run_command', 'shell', 'terminal', 'Bash',
])

const FILE_READ_TOOL_NAMES = new Set([
  'read', 'read_file', 'cat', 'Read', 'view_file',
])

const FILE_WRITE_TOOL_NAMES = new Set([
  'write', 'write_file', 'Write', 'create_file', 'edit', 'Edit', 'str_replace_editor',
])

function isBashTool(name: string): boolean {
  return BASH_TOOL_NAMES.has(name) || name.toLowerCase().includes('bash')
}

function isFileReadTool(name: string): boolean {
  return FILE_READ_TOOL_NAMES.has(name)
}

function isFileWriteTool(name: string): boolean {
  return FILE_WRITE_TOOL_NAMES.has(name)
}

// ---------------------------------------------------------------------------
// EventCard component
// ---------------------------------------------------------------------------

export function EventCard({ grouped }: { grouped: GroupedEvent }) {
  if (grouped.kind === 'message') {
    return <MessageCard event={grouped.event} />
  }

  return <ToolEventCard call={grouped.call} result={grouped.result} />
}

// ---------------------------------------------------------------------------
// Message card (assistant, user, thinking)
// ---------------------------------------------------------------------------

function MessageCard({ event }: { event: ExecutionEvent }) {
  const isThinking = event.type === 'thinking'
  const isUser = event.type === 'user_message'
  const isSubagentStart = event.type === 'subagent_start'
  const isSubagentStop = event.type === 'subagent_stop'
  const isSubagent = isSubagentStart || isSubagentStop

  const label = isThinking
    ? 'Thinking'
    : isUser
    ? 'User'
    : isSubagentStart
    ? `Delegating to ${event.subagent_name || event.subagent_type || 'agent'}`
    : isSubagentStop
    ? `${event.subagent_name || event.subagent_type || 'Agent'} ${event.status === 'error' ? 'failed' : 'completed'}`
    : 'Assistant'

  return (
    <div
      className={cn(
        'rounded-2xl px-4 py-3',
        isThinking && 'bg-surface-alt border border-surface-active',
        isUser && 'bg-surface border border-surface-active',
        isSubagent && 'bg-accent-subtle border border-accent/20',
        !isThinking && !isUser && !isSubagent && 'bg-white border border-surface-active'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-text-secondary">
          {label}
        </span>
        <span className="text-[10px] text-text-muted">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <p
        className={cn(
          'text-sm text-text whitespace-pre-wrap',
          isThinking && 'italic text-text-secondary',
          isSubagent && 'text-text-secondary'
        )}
      >
        {event.content}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tool event card (dispatches to BashCard, FileCard, or ToolCallCard)
// ---------------------------------------------------------------------------

function ToolEventCard({
  call,
  result,
}: {
  call: ExecutionEvent
  result: ExecutionEvent | null
}) {
  const toolName = call.tool_name || 'unknown'
  const status = result?.status || call.status || 'running'
  const duration = result?.duration_ms ?? call.duration_ms
  const error = result?.error ?? call.error

  if (isBashTool(toolName)) {
    return <BashToolCard call={call} result={result} status={status} duration={duration} />
  }

  if (isFileReadTool(toolName)) {
    return <FileReadCard call={call} result={result} status={status} duration={duration} />
  }

  if (isFileWriteTool(toolName)) {
    return <FileWriteCard call={call} result={result} status={status} duration={duration} toolName={toolName} />
  }

  return (
    <ToolCallCard
      toolName={toolName}
      input={call.input}
      output={result?.output}
      duration_ms={duration}
      status={status}
      error={error}
    />
  )
}

// ---------------------------------------------------------------------------
// Specialized sub-cards
// ---------------------------------------------------------------------------

function BashToolCard({
  call, result, status, duration,
}: {
  call: ExecutionEvent
  result: ExecutionEvent | null
  status: 'running' | 'completed' | 'error'
  duration?: number
}) {
  const command =
    (call.input?.command as string) ||
    (call.input?.cmd as string) ||
    JSON.stringify(call.input)
  const output = result?.output || ''

  let exitCode: number | undefined
  const exitMatch = output.match(/exit code[:\s]+(\d+)/i)
  if (exitMatch) {
    exitCode = parseInt(exitMatch[1], 10)
  }
  if (exitCode === undefined) {
    if (status === 'completed') exitCode = 0
    if (status === 'error') exitCode = 1
  }

  return (
    <BashCard
      command={command}
      stdout={output}
      exitCode={exitCode}
      duration_ms={duration}
      status={status}
    />
  )
}

function FileReadCard({
  call, result, status, duration,
}: {
  call: ExecutionEvent
  result: ExecutionEvent | null
  status: 'running' | 'completed' | 'error'
  duration?: number
}) {
  const filePath =
    (call.input?.file_path as string) ||
    (call.input?.path as string) ||
    (call.input?.filename as string) ||
    'unknown'

  const lineRange =
    call.input?.offset !== undefined && call.input?.limit !== undefined
      ? {
          start: (call.input.offset as number) + 1,
          end: (call.input.offset as number) + (call.input.limit as number),
        }
      : undefined

  return (
    <FileCard
      operation="read"
      filePath={filePath}
      content={result?.output}
      lineRange={lineRange}
      lineCount={result?.output?.split('\n').length}
      duration_ms={duration}
      status={status}
    />
  )
}

function FileWriteCard({
  call, result, status, duration, toolName,
}: {
  call: ExecutionEvent
  result: ExecutionEvent | null
  status: 'running' | 'completed' | 'error'
  duration?: number
  toolName: string
}) {
  const filePath =
    (call.input?.file_path as string) ||
    (call.input?.path as string) ||
    (call.input?.filename as string) ||
    'unknown'

  const content =
    (call.input?.content as string) ||
    (call.input?.new_string as string) ||
    result?.output

  const operation = toolName.toLowerCase().includes('edit') ? 'edit' as const : 'write' as const

  return (
    <FileCard
      operation={operation}
      filePath={filePath}
      content={content}
      lineCount={content?.split('\n').length}
      duration_ms={duration}
      status={status}
    />
  )
}
