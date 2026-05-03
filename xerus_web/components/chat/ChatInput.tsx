'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, AtSign, Paperclip, Monitor, TerminalSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Agent } from './types'
import { AgentDropdown } from './AgentDropdown'
import { SlashCommandPicker } from './SlashCommandPicker'
import { useSlashCommands } from './useSlashCommands'
import { UnifiedMentionPicker, type MentionItem } from './UnifiedMentionPicker'
import { useWorkspaceFiles } from '@/hooks/useWorkspaceFiles'
import { useKBSearch } from '@/hooks/useKBSearch'

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
  conversationId?: string
  headerContent?: React.ReactNode
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
  conversationId,
  headerContent,
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

  // Slash command state
  const [showSlashPicker, setShowSlashPicker] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0)
  const { commands, executeCommand } = useSlashCommands({
    currentAgent: selectedAgent,
    onSendMessage,
  })

  // File and KB search for unified @mention
  const { files: workspaceFiles, loading: filesLoading, search: searchFiles } = useWorkspaceFiles(conversationId)
  const { entries: kbEntries, loading: kbLoading, search: searchKB } = useKBSearch()

  const hasContent = value.trim().length > 0

  const filteredAgents = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
      (a.domain ?? '').toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 6)

  const isFileMode = mentionQuery.startsWith('/')
  const isKBMode = mentionQuery.startsWith('kb:')
  const mentionItems: MentionItem[] = [
    ...(isFileMode || isKBMode ? [] : filteredAgents.map((a): MentionItem => ({ type: 'agent', agent: a }))),
    ...(isFileMode ? workspaceFiles.filter(f => f.path.toLowerCase().includes(mentionQuery.slice(1).toLowerCase())).slice(0, 6).map((f): MentionItem => ({ type: 'file', file: f })) : []),
    ...(isKBMode ? kbEntries.filter(e => e.title.toLowerCase().includes(mentionQuery.slice(3).toLowerCase())).slice(0, 6).map((e): MentionItem => ({ type: 'kb', entry: e })) : []),
  ]

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


  const closePicker = useCallback(() => {
    setShowPicker(false)
    setMentionQuery('')
    setMentionStart(-1)
  }, [])

  const insertMentionItem = useCallback(
    (item: MentionItem) => {
      if (mentionStart < 0) return
      let insertText: string
      switch (item.type) {
        case 'agent': {
          const slug = item.agent.name.toLowerCase().replace(/\s+/g, '-')
          insertText = `@${slug} `
          break
        }
        case 'file':
          insertText = `@file:${item.file.path} `
          break
        case 'kb':
          insertText = `@kb:${item.entry.id} `
          break
      }
      const before = value.slice(0, mentionStart)
      const after = value.slice(textareaRef.current?.selectionStart ?? value.length)
      const newValue = `${before}${insertText}${after}`
      setValue(newValue)
      closePicker()
      requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (textarea) {
          textarea.focus()
          const cursorPos = mentionStart + insertText.length
          textarea.setSelectionRange(cursorPos, cursorPos)
        }
      })
    },
    [mentionStart, value, closePicker],
  )

  const insertMention = useCallback(
    (agent: Agent) => insertMentionItem({ type: 'agent', agent }),
    [insertMentionItem],
  )

  const closeSlashPicker = useCallback(() => {
    setShowSlashPicker(false)
    setSlashQuery('')
    setSlashSelectedIdx(0)
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      setValue(newValue)

      const cursorPos = e.target.selectionStart
      const textBeforeCursor = newValue.slice(0, cursorPos)
      const lastAt = textBeforeCursor.lastIndexOf('@')

      // @mention detection
      if (lastAt >= 0) {
        const charBefore = lastAt > 0 ? newValue[lastAt - 1] : ' '
        if (charBefore === ' ' || charBefore === '\n' || lastAt === 0) {
          const mentionText = textBeforeCursor.slice(lastAt + 1)
          if (!mentionText.includes(' ')) {
            setMentionStart(lastAt)
            setMentionQuery(mentionText)
            setShowPicker(true)
            closeSlashPicker()
            if (mentionText.startsWith('/')) searchFiles(mentionText.slice(1))
            else if (mentionText.startsWith('kb:')) searchKB(mentionText.slice(3))
            return
          }
        }
      }
      closePicker()

      // Slash command detection — only at line start, not after @
      const lineStart = textBeforeCursor.lastIndexOf('\n') + 1
      const lineText = textBeforeCursor.slice(lineStart)
      if (lineText.startsWith('/') && (lineStart === 0 || textBeforeCursor[lineStart - 1] === '\n')) {
        const charBeforeSlash = lineStart > 0 ? textBeforeCursor[lineStart - 1] : undefined
        if (charBeforeSlash !== '@') {
          setSlashQuery(lineText.slice(1))
          setShowSlashPicker(true)
          setSlashSelectedIdx(0)
          return
        }
      }
      closeSlashPicker()
    },
    [closePicker, closeSlashPicker]
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

  const handleSelectSlashCommand = useCallback(
    (cmd: (typeof commands)[number]) => {
      const textarea = textareaRef.current
      if (!textarea) return
      const cursorPos = textarea.selectionStart
      const textBeforeCursor = value.slice(0, cursorPos)
      const lineStart = textBeforeCursor.lastIndexOf('\n') + 1
      const before = value.slice(0, lineStart)
      const after = value.slice(cursorPos)
      executeCommand(cmd, after.trim())
      setValue('')
      closeSlashPicker()
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    },
    [value, executeCommand, closeSlashPicker],
  )

  const slashFilteredCommands = commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(slashQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(slashQuery.toLowerCase()),
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Slash picker navigation (higher priority)
      if (showSlashPicker && slashFilteredCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSlashSelectedIdx((prev) => (prev + 1) % slashFilteredCommands.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSlashSelectedIdx((prev) => (prev - 1 + slashFilteredCommands.length) % slashFilteredCommands.length)
          return
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault()
          handleSelectSlashCommand(slashFilteredCommands[slashSelectedIdx])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          closeSlashPicker()
          return
        }
      }

      // Mention picker navigation
      if (showPicker && mentionItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIdx((prev) => (prev + 1) % mentionItems.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIdx((prev) => (prev - 1 + mentionItems.length) % mentionItems.length)
          return
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault()
          insertMentionItem(mentionItems[selectedIdx])
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
    [showSlashPicker, slashFilteredCommands, slashSelectedIdx, handleSelectSlashCommand, closeSlashPicker,
     showPicker, mentionItems, selectedIdx, insertMentionItem, closePicker, isComposing, handleSend]
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
    <div className={cn('w-full max-w-3xl mx-auto px-4 pb-1.5 pt-2 shrink-0', className)}>
      <div className="relative">
        {/* Slash Command Picker */}
        {showSlashPicker && (
          <SlashCommandPicker
            query={slashQuery}
            commands={commands}
            selectedIdx={slashSelectedIdx}
            onSelect={handleSelectSlashCommand}
            onClose={closeSlashPicker}
            onSelectedIdxChange={setSlashSelectedIdx}
          />
        )}

        {/* Unified @mention Picker */}
        {showPicker && (
          <UnifiedMentionPicker
            query={mentionQuery}
            agents={agents}
            files={workspaceFiles}
            kbEntries={kbEntries}
            filesLoading={filesLoading}
            kbLoading={kbLoading}
            selectedIdx={selectedIdx}
            onSelect={insertMentionItem}
            onClose={closePicker}
            onSelectedIdxChange={setSelectedIdx}
          />
        )}

        {/* Composer Card */}
        <div
          className={cn(
            'rounded-2xl border bg-card transition-all duration-150',
            focused
              ? 'border-primary/30 shadow-sm'
              : 'border-border shadow-sm hover:border-border/80'
          )}
        >
          {/* Dynamic header content (task dock, etc.) */}
          {headerContent}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              setTimeout(() => { closePicker(); closeSlashPicker() }, 150)
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
                  'hover:text-secondary hover:bg-secondary/8',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    isTerminalOpen
                      ? 'text-secondary bg-secondary/8'
                      : 'text-text-muted hover:text-secondary hover:bg-secondary/8',
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
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    isBrowserOpen
                      ? 'text-secondary bg-secondary/8'
                      : 'text-text-muted hover:text-secondary hover:bg-secondary/8',
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
                / commands &middot; @ mention &middot; Enter to send
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

        {/* Disclaimer */}
        <p className="text-center text-[11px] text-text-muted/40 mt-1 select-none">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  )
}
