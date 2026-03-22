'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, AtSign, Paperclip, Bot, Monitor, TerminalSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Agent } from './types'
import { AgentDropdown } from './AgentDropdown'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  agents?: Agent[]
  selectedAgent?: Agent | null
  onAgentChange?: (agent: Agent | null) => void
  onOpenTerminal?: () => void
  isTerminalLoading?: boolean
  isTerminalOpen?: boolean
  onOpenBrowser?: () => void
  isBrowserLoading?: boolean
  isBrowserOpen?: boolean
}

export function ChatInput({
  onSendMessage,
  disabled = false,
  placeholder = 'Type your message...',
  className,
  agents = [],
  selectedAgent,
  onAgentChange,
  onOpenTerminal,
  isTerminalLoading,
  isTerminalOpen,
  onOpenBrowser,
  isBrowserLoading,
  isBrowserOpen,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // @mention state
  const [showPicker, setShowPicker] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(-1)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const pickerRef = useRef<HTMLDivElement>(null)

  const hasContent = value.trim().length > 0

  const filteredAgents = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
      (a.domain ?? '').toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 6)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [value])

  useEffect(() => {
    setSelectedIdx(0)
  }, [mentionQuery])

  // Scroll selected picker item into view
  useEffect(() => {
    if (!showPicker || !pickerRef.current) return
    const item = pickerRef.current.children[1]?.children[selectedIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx, showPicker])

  const closePicker = useCallback(() => {
    setShowPicker(false)
    setMentionQuery('')
    setMentionStart(-1)
  }, [])

  const insertMention = useCallback(
    (agent: Agent) => {
      if (mentionStart < 0) return
      const slug = agent.name.toLowerCase().replace(/\s+/g, '-')
      const before = value.slice(0, mentionStart)
      const after = value.slice(textareaRef.current?.selectionStart ?? value.length)
      const newValue = `${before}@${slug} ${after}`
      setValue(newValue)
      closePicker()
      requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (textarea) {
          textarea.focus()
          const cursorPos = mentionStart + slug.length + 2
          textarea.setSelectionRange(cursorPos, cursorPos)
        }
      })
    },
    [mentionStart, value, closePicker]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      setValue(newValue)

      const cursorPos = e.target.selectionStart
      const textBeforeCursor = newValue.slice(0, cursorPos)
      const lastAt = textBeforeCursor.lastIndexOf('@')

      if (lastAt >= 0) {
        const charBefore = lastAt > 0 ? newValue[lastAt - 1] : ' '
        if (charBefore === ' ' || charBefore === '\n' || lastAt === 0) {
          const mentionText = textBeforeCursor.slice(lastAt + 1)
          if (!mentionText.includes(' ')) {
            setMentionStart(lastAt)
            setMentionQuery(mentionText)
            setShowPicker(true)
            return
          }
        }
      }
      closePicker()
    },
    [closePicker]
  )

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSendMessage(trimmed)
    setValue('')
    closePicker()
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSendMessage, closePicker])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Mention picker navigation
      if (showPicker && filteredAgents.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIdx((prev) => (prev + 1) % filteredAgents.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIdx((prev) => (prev - 1 + filteredAgents.length) % filteredAgents.length)
          return
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault()
          insertMention(filteredAgents[selectedIdx])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          closePicker()
          return
        }
      }

      // Send on Enter (not Shift+Enter)
      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
        e.preventDefault()
        handleSend()
      }
    },
    [showPicker, filteredAgents, selectedIdx, insertMention, closePicker, isComposing, handleSend]
  )

  const triggerMention = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    const pos = textarea.selectionStart
    const before = value.slice(0, pos)
    const after = value.slice(pos)
    const needsSpace = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n')
    const newValue = `${before}${needsSpace ? ' ' : ''}@${after}`
    setValue(newValue)
    requestAnimationFrame(() => {
      const newPos = pos + (needsSpace ? 2 : 1)
      textarea.setSelectionRange(newPos, newPos)
      setMentionStart(newPos - 1)
      setMentionQuery('')
      setShowPicker(true)
    })
  }, [value])

  return (
    <div className={cn('w-full max-w-3xl mx-auto px-4 pb-1.5 pt-2 shrink-0 bg-surface', className)}>
      <div className="relative">
        {/* @mention Picker */}
        {showPicker && filteredAgents.length > 0 && (
          <div
            ref={pickerRef}
            className="absolute bottom-full left-0 right-0 mb-2 bg-surface-alt border border-surface-active rounded-2xl shadow-lg overflow-hidden max-h-[240px] overflow-y-auto z-10"
            role="listbox"
            aria-label="Mention an agent"
          >
            <div className="px-3 py-2 border-b border-surface-active">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Agents
              </span>
            </div>
            <div>
              {filteredAgents.map((agent, idx) => (
                <button
                  key={agent.id}
                  type="button"
                  role="option"
                  aria-selected={idx === selectedIdx}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 text-left text-sm transition-colors',
                    idx === selectedIdx
                      ? 'bg-[#FF6600]/8 text-[#FF6600]'
                      : 'text-text hover:bg-surface-hover'
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertMention(agent)
                  }}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-xl overflow-hidden shrink-0 flex items-center justify-center',
                      idx === selectedIdx
                        ? 'bg-[#FF6600]/15 text-[#FF6600]'
                        : 'bg-surface-alt text-text-secondary'
                    )}
                  >
                    {isMascotConfig(agent.avatarUrl) ? (
                      <MascotAvatar config={agent.avatarUrl!} size={28} className="w-full h-full" alt={agent.name} />
                    ) : agent.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
                    ) : (
                      <Bot className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{agent.name}</div>
                    {agent.domain && (
                      <div className="text-[11px] text-text-muted truncate">{agent.domain}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Composer Card */}
        <div
          className={cn(
            'rounded-2xl border bg-white dark:bg-white/95 transition-all duration-200',
            focused
              ? 'border-[#FF6600]/40 shadow-[0_2px_12px_rgba(255,102,0,0.08)]'
              : 'border-surface-active shadow-sm hover:shadow-md hover:border-surface-hover'
          )}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              setTimeout(() => closePicker(), 150)
            }}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            aria-label="Message input"
            className={cn(
              'w-full resize-none bg-transparent px-4 pt-4 pb-2',
              'text-[15px] text-text placeholder:text-text-muted/50',
              'focus-visible:outline-none',
              'min-h-[56px] max-h-[200px]',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-0.5">
            {/* Left: action buttons */}
            <div className="flex items-center gap-1">
              {/* Agent selector — always show (Xerus Master & CTO are hardcoded in dropdown) */}
              {onAgentChange && (
                <AgentDropdown
                  agents={agents}
                  selectedAgent={selectedAgent ?? null}
                  onAgentChange={onAgentChange}
                  className="h-8 border-transparent hover:bg-surface-hover bg-transparent"
                />
              )}

              {/* @ mention button */}
              <button
                type="button"
                onClick={triggerMention}
                disabled={disabled}
                aria-label="Mention an agent"
                className={cn(
                  'p-1.5 rounded-lg text-text-muted transition-colors',
                  'hover:text-[#FF6600] hover:bg-[#FF6600]/8',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600]',
                  'disabled:opacity-40 disabled:cursor-not-allowed'
                )}
              >
                <AtSign className="w-4 h-4" />
              </button>

              {/* Attach file */}
              <button
                type="button"
                disabled={disabled}
                aria-label="Attach file"
                className={cn(
                  'p-1.5 rounded-lg text-text-muted transition-colors',
                  'hover:text-text-secondary hover:bg-surface-hover',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600]',
                  'disabled:opacity-40 disabled:cursor-not-allowed'
                )}
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Open sandbox terminal */}
              {onOpenTerminal && (
                <button
                  type="button"
                  onClick={onOpenTerminal}
                  disabled={isTerminalLoading}
                  aria-label="Open sandbox terminal"
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600]',
                    isTerminalOpen
                      ? 'text-[#FF6600] bg-[#FF6600]/8'
                      : 'text-text-muted hover:text-[#FF6600] hover:bg-[#FF6600]/8',
                    isTerminalLoading && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  <TerminalSquare className={cn('w-4 h-4', isTerminalLoading && 'animate-pulse')} />
                </button>
              )}

              {/* Open sandbox browser */}
              {onOpenBrowser && (
                <button
                  type="button"
                  onClick={onOpenBrowser}
                  disabled={isBrowserLoading}
                  aria-label="Open sandbox browser"
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600]',
                    isBrowserOpen
                      ? 'text-[#FF6600] bg-[#FF6600]/8'
                      : 'text-text-muted hover:text-[#FF6600] hover:bg-[#FF6600]/8',
                    isBrowserLoading && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  <Monitor className={cn('w-4 h-4', isBrowserLoading && 'animate-pulse')} />
                </button>
              )}

              {/* Hint text */}
              <span
                className={cn(
                  'text-[11px] text-text-muted/50 ml-2 select-none transition-opacity duration-200',
                  hasContent || focused ? 'opacity-0' : 'opacity-100'
                )}
              >
                @ mention &middot; Enter to send
              </span>
            </div>

            {/* Right: send button */}
            <div
              className={cn(
                'transition-all duration-200 overflow-hidden',
                hasContent ? 'w-8 opacity-100 scale-100' : 'w-0 opacity-0 scale-75'
              )}
            >
              <button
                type="button"
                onClick={handleSend}
                disabled={!hasContent || disabled}
                aria-label="Send message"
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-xl',
                  'bg-[#FF6600] text-white',
                  'hover:bg-[#E65C00] active:scale-90',
                  'transition-all duration-150',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-1'
                )}
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-[11px] text-text-muted/40 mt-1 select-none">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  )
}
