'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoEntrance, XerusAvatar } from './LogoEntrance'
import { WorkspaceSetupCard } from './ui/WorkspaceSetupCard'
import { AgentSelectRow } from './ui/AgentSelectRow'
import { SchedulePicker } from './ui/SchedulePicker'
import { SummaryCard } from './ui/SummaryCard'
import { CollapsedConfirm } from './ui/CollapsedConfirm'
import { PlanSelectionCard } from './cards/PlanSelectionCard'
import { ActivateWorkforceCard } from './cards/ActivateWorkforceCard'
import type { OnboardingMessage } from './types'

interface QuickReply {
  label: string
  value: string
  icon?: 'sparkles' | 'building'
  subtitle?: string
  disabled?: boolean
}

interface OnboardingMessagesProps {
  messages: OnboardingMessage[]
  onLogoReady: () => void
  onTypingComplete?: (messageId: string) => void
  onUIAction: (messageId: string, action: string, data: Record<string, any>) => void
  quickReplies?: QuickReply[]
  onQuickReply?: (value: string) => void
}

const UI_COMPONENTS: Record<string, React.ComponentType<any>> = {
  'workspace-setup': WorkspaceSetupCard,
  'agent-select': AgentSelectRow,
  'schedule-picker': SchedulePicker,
  'summary': SummaryCard,
  'plan-selection': PlanSelectionCard,
  'activate-workforce': ActivateWorkforceCard,
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  sparkles: Sparkles,
  building: Building2,
}

/** Typing dots animation for streaming messages with no content yet. */
function TypingIndicator() {
  return (
    <div className="flex gap-1.5 items-center py-2">
      {[0, 0.15, 0.3].map((delay, i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-text/40"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay }}
        />
      ))}
    </div>
  )
}

/**
 * Typewriter with natural speed variation —
 * pauses at punctuation for a human-like feel.
 */
function TypewriterText({ text, onComplete }: { text: string; onComplete?: () => void }) {
  const [displayed, setDisplayed] = useState('')
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete })

  useEffect(() => {
    if (!text) { setDisplayed(''); return }
    setDisplayed('')
    let i = 0
    let timeoutId: ReturnType<typeof setTimeout>
    let done = false

    const tick = () => {
      if (done) return
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        done = true
        onCompleteRef.current?.()
        return
      }

      const char = text[i - 1]
      let delay = 16
      if (char === '.' || char === '!' || char === '?') delay = 70
      else if (char === ',') delay = 35
      else if (char === '\n') delay = 50
      else if (char === '\u2014') delay = 40

      timeoutId = setTimeout(tick, delay)
    }

    timeoutId = setTimeout(tick, 80)

    return () => {
      done = true
      clearTimeout(timeoutId)
    }
  }, [text])

  return <span>{displayed || '\u00A0'}</span>
}

/**
 * Message renderer with vertically-centered layout.
 * Content starts in the middle of the screen and shifts upward
 * as more messages arrive. Scrollable when content exceeds viewport.
 *
 * Template assistant messages are grouped under a single avatar
 * to feel like one continuous response from Xerus.
 * Quick reply cards appear inline at the end of the template group.
 */
export function OnboardingMessages({
  messages,
  onLogoReady,
  onTypingComplete,
  onUIAction,
  quickReplies,
  onQuickReply,
}: OnboardingMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, quickReplies])

  const templateAssistantMsgs = messages.filter(
    (m) => m.source === 'template' && m.role === 'assistant'
  )
  const restMessages = messages.filter(
    (m) => !(m.source === 'template' && m.role === 'assistant')
  )

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="min-h-full flex flex-col justify-center px-4 sm:px-6 py-12">
        <div className="max-w-[640px] mx-auto w-full space-y-6">

          {/* Xerus intro — single avatar, sequential text blocks + inline cards */}
          {templateAssistantMsgs.length > 0 && (
            <div className="flex gap-3.5 items-start">
              <LogoEntrance phase="avatar" onAnimationComplete={onLogoReady} />
              <div className="flex-1 space-y-5 pt-0.5">
                <AnimatePresence>
                  {templateAssistantMsgs.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                      <div className="text-[15px] text-text leading-[1.75] whitespace-pre-wrap">
                        <TypewriterText
                          text={msg.content}
                          onComplete={() => onTypingComplete?.(msg.id)}
                        />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Inline quick reply cards — appear after last template message */}
                <AnimatePresence>
                  {quickReplies && quickReplies.length > 0 && (
                    <motion.div
                      key="quick-replies"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                      className="flex gap-3 pt-1"
                    >
                      {quickReplies.map((reply) => {
                        const Icon = reply.icon ? ICON_MAP[reply.icon] : null
                        return (
                          <button
                            key={reply.value}
                            onClick={() => !reply.disabled && onQuickReply?.(reply.value)}
                            disabled={reply.disabled}
                            className={cn(
                              'flex-1 p-4 rounded-2xl bg-surface border border-surface-active text-left transition-all duration-200 group',
                              reply.disabled
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:border-primary/30 hover:shadow-sm'
                            )}
                          >
                            {Icon && (
                              <Icon className={cn(
                                'w-5 h-5 mb-2.5 transition-transform duration-200',
                                reply.disabled ? 'text-text-muted' : 'text-primary/70 group-hover:scale-110 group-hover:text-primary'
                              )} />
                            )}
                            <div className="text-sm font-medium text-text">{reply.label}</div>
                            {reply.subtitle && (
                              <div className="text-xs text-text-muted mt-0.5">{reply.subtitle}</div>
                            )}
                          </button>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* User messages + live agent messages */}
          <AnimatePresence>
            {restMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                {msg.role === 'assistant' ? (
                  <div className="flex gap-3.5 items-start">
                    <XerusAvatar />
                    <div className="flex-1 space-y-3 pt-0.5">
                      {/* Typing indicator or text content */}
                      {msg.streaming && !msg.content ? (
                        <TypingIndicator />
                      ) : msg.content ? (
                        <div className="text-[15px] text-text leading-[1.75] whitespace-pre-wrap">
                          {msg.streaming ? (
                            <TypewriterText text={msg.content} />
                          ) : (
                            msg.content
                          )}
                        </div>
                      ) : null}

                      {/* Generative UI component */}
                      {msg.ui && !msg.ui.collapsed && (() => {
                        const Component = UI_COMPONENTS[msg.ui.type]
                        if (!Component) return null
                        return (
                          <Component
                            {...msg.ui.props}
                            onAction={(action: string, data: Record<string, any>) =>
                              onUIAction(msg.id, action, data)
                            }
                          />
                        )
                      })()}

                      {/* Collapsed confirmation */}
                      {msg.ui?.collapsed && msg.ui.collapsedText && (
                        <CollapsedConfirm text={msg.ui.collapsedText} />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <div className="text-[15px] text-text-secondary leading-[1.75] max-w-[80%]">
                      {msg.content}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
