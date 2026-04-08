'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, AtSign, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Agent } from '@/components/common/PresenceAvatars'

interface MentionInputProps {
  agents: Agent[]
  onSend: (content: string) => void
  placeholder?: string
  className?: string
  insertRef?: React.MutableRefObject<((text: string) => void) | null>
}

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-400',
  sleeping: 'bg-slate-400',
  error: 'bg-red-500',
}

export function MentionInput({
  agents,
  onSend,
  placeholder = 'Message this channel...',
  className,
  insertRef,
}: MentionInputProps) {
  const [value, setValue] = useState('')

  // Expose insert function so parent can add text to the input
  useEffect(() => {
    if (insertRef) {
      insertRef.current = (text: string) => {
        setValue(prev => prev + text)
        setTimeout(() => textareaRef.current?.focus(), 0)
      }
    }
    return () => { if (insertRef) insertRef.current = null }
  }, [insertRef])
  const [focused, setFocused] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [mentionStart, setMentionStart] = useState(-1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const hasContent = value.trim().length > 0

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.slug.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [value])

  const closePicker = useCallback(() => {
    setShowPicker(false)
    setQuery('')
    setMentionStart(-1)
  }, [])

  const insertMention = useCallback(
    (agent: Agent) => {
      if (mentionStart < 0) return
      const before = value.slice(0, mentionStart)
      const after = value.slice(textareaRef.current?.selectionStart ?? value.length)
      const newValue = `${before}@${agent.slug} ${after}`
      setValue(newValue)
      closePicker()
      requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (textarea) {
          textarea.focus()
          const cursorPos = mentionStart + agent.slug.length + 2
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
            setQuery(mentionText)
            setShowPicker(true)
            return
          }
        }
      }

      closePicker()
    },
    [closePicker]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showPicker && filtered.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIdx((prev) => (prev + 1) % filtered.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIdx((prev) => (prev - 1 + filtered.length) % filtered.length)
          return
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault()
          insertMention(filtered[selectedIdx])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          closePicker()
          return
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (value.trim()) {
          onSend(value.trim())
          setValue('')
          closePicker()
        }
      }
    },
    [showPicker, filtered, selectedIdx, insertMention, closePicker, value, onSend]
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
      // Trigger the mention picker manually
      setMentionStart(newPos - 1)
      setQuery('')
      setShowPicker(true)
    })
  }, [value])

  // Scroll selected picker item into view
  useEffect(() => {
    if (!showPicker || !pickerRef.current) return
    const item = pickerRef.current.children[selectedIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx, showPicker])

  return (
    <div className={cn('flex-shrink-0 px-4 pb-4 pt-2', className)}>
      <div className="relative">
        {/* Mention picker */}
        {showPicker && filtered.length > 0 && (
          <div
            ref={pickerRef}
            className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-surface-active rounded-2xl shadow-lg overflow-hidden max-h-[200px] overflow-y-auto z-10"
            role="listbox"
            aria-label="Mention an agent"
          >
            <div className="px-3 py-2 border-b border-surface-active">
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Agents</span>
            </div>
            {filtered.map((agent, idx) => (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={idx === selectedIdx}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 text-left text-sm transition-colors',
                  idx === selectedIdx
                    ? 'bg-primary/8 text-primary'
                    : 'text-text hover:bg-surface-hover'
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(agent)
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <span
                  className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[agent.status] ?? 'bg-slate-400')}
                  aria-hidden="true"
                />
                <span className="font-medium flex-1">{agent.name}</span>
                <span className="text-text-muted text-xs">@{agent.slug}</span>
              </button>
            ))}
          </div>
        )}

        {/* Composer card */}
        <div
          className={cn(
            'rounded-2xl border bg-white transition-all duration-200',
            focused
              ? 'border-primary/40 shadow-[0_2px_12px_rgba(255,102,0,0.08)]'
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
            placeholder={placeholder}
            rows={1}
            aria-label="Message input"
            data-testid="channel-message-input"
            className={cn(
              'w-full resize-none bg-transparent px-4 pt-3 pb-1',
              'text-sm text-text placeholder:text-text-muted/60',
              'focus-visible:outline-none',
              'min-h-[36px] max-h-[160px]'
            )}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-0.5">
            {/* Left: action buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={triggerMention}
                aria-label="Mention an agent"
                className={cn(
                  'p-1.5 rounded-lg text-text-muted transition-colors',
                  'hover:text-primary hover:bg-primary/8',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                )}
              >
                <AtSign className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Attach file"
                className={cn(
                  'p-1.5 rounded-lg text-text-muted transition-colors',
                  'hover:text-text-secondary hover:bg-surface-hover',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                )}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              {/* Hint text */}
              <span className={cn(
                'text-[11px] text-text-muted/50 ml-2 select-none transition-opacity duration-200',
                hasContent || focused ? 'opacity-0' : 'opacity-100'
              )}>
                @ mention &middot; Enter to send
              </span>
            </div>

            {/* Right: send button - slides in when content exists */}
            <div
              className={cn(
                'transition-all duration-200 overflow-hidden',
                hasContent ? 'w-7 opacity-100 scale-100' : 'w-0 opacity-0 scale-75'
              )}
            >
              <button
                type="button"
                onClick={() => {
                  if (!value.trim()) return
                  onSend(value.trim())
                  setValue('')
                  closePicker()
                  textareaRef.current?.focus()
                }}
                disabled={!hasContent}
                aria-label="Send message"
                data-testid="channel-send-button"
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-lg',
                  'bg-primary text-white',
                  'hover:bg-primary/90 active:scale-90',
                  'transition-all duration-150',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1'
                )}
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
