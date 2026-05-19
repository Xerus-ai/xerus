'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Shield,
  MonitorSmartphone,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  Eye,
  Terminal,
  FileText,
  MessageSquare,
  Send,
} from 'lucide-react'
import type { UIHint } from '@/hooks/useExecutionStream.types'

interface GuidanceInterventionCardProps {
  question: string
  options?: string[]
  timeout_seconds: number
  scenario: string
  tool_name: string
  agent_slug: string
  ui_hint?: UIHint
  browser_url?: string
  preview_url?: string
  onRespond: (accepted: boolean, feedback?: string) => void
  onSendMessage?: (message: string) => void
}

function getHintConfig(uiHint?: UIHint, scenario?: string) {
  if (uiHint === 'browser' || scenario?.startsWith('browser_')) {
    return { Icon: MonitorSmartphone, label: 'Browser Action Required' }
  }
  if (uiHint === 'terminal') {
    return { Icon: Terminal, label: 'Terminal Action' }
  }
  if (uiHint === 'preview') {
    return { Icon: Eye, label: 'Preview Review' }
  }
  if (uiHint === 'form') {
    return { Icon: FileText, label: 'Input Required' }
  }
  return { Icon: Shield, label: 'Approval Required' }
}

export function GuidanceInterventionCard({
  question,
  options,
  timeout_seconds,
  scenario,
  tool_name,
  agent_slug,
  ui_hint,
  browser_url,
  preview_url,
  onRespond,
  onSendMessage,
}: GuidanceInterventionCardProps) {
  const [secondsLeft, setSecondsLeft] = useState(timeout_seconds)
  const [feedbackText, setFeedbackText] = useState('')
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const { Icon, label } = getHintConfig(ui_hint, scenario)
  const isForm = ui_hint === 'form'

  useEffect(() => {
    if (secondsLeft <= 0) {
      onRespond(false, feedbackText || 'Timed out')
      return
    }
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [secondsLeft, onRespond, feedbackText])

  const handleApprove = useCallback(() => {
    onRespond(true, selectedOption ?? (feedbackText || undefined))
  }, [onRespond, selectedOption, feedbackText])

  const handleDeny = useCallback(() => {
    onRespond(false, feedbackText || undefined)
  }, [onRespond, feedbackText])

  const handleOptionSelect = useCallback((opt: string) => {
    if (isForm) {
      setSelectedOption(opt)
    } else {
      onRespond(true, opt)
    }
  }, [isForm, onRespond])

  const handleSubmitCustom = useCallback(() => {
    if (!feedbackText.trim()) return
    onRespond(true, feedbackText.trim())
  }, [onRespond, feedbackText])

  const handleChatAbout = useCallback(() => {
    if (onSendMessage) {
      onSendMessage(question)
    }
  }, [onSendMessage, question])

  const timerWarning = secondsLeft <= 30
  const timerUrgent = secondsLeft <= 10

  return (
    <div className="mx-4 mb-2 rounded-2xl border border-secondary/20 bg-secondary/5 px-4 py-3">
      <div className="flex flex-col sm:flex-row items-start gap-3">
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-secondary/15 shrink-0">
              <Icon className="w-3.5 h-3.5 text-secondary" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              {label}
            </span>
            {secondsLeft > 0 && (
              <span className={cn(
                'ml-auto flex items-center gap-1 text-[11px]',
                timerUrgent ? 'text-rose-400 font-semibold' : timerWarning ? 'text-amber-400' : 'text-text-muted',
              )}>
                <Clock className="w-3 h-3" />
                {secondsLeft}s
              </span>
            )}
          </div>

          <p className="text-sm font-medium text-text">{question}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            {tool_name && (
              <span className="text-xs text-text-muted">
                Tool: <span className="font-medium text-text-secondary">{tool_name}</span>
              </span>
            )}
            {agent_slug && (
              <span className="text-xs text-text-muted">
                Agent: <span className="font-medium text-text-secondary">{agent_slug}</span>
              </span>
            )}
            {browser_url && (
              <a
                href={browser_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-secondary hover:text-secondary/90 font-medium transition-colors"
              >
                <Globe className="w-3 h-3" />
                View in browser
              </a>
            )}
            {preview_url && (
              <a
                href={preview_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-secondary hover:text-secondary/90 font-medium transition-colors"
              >
                <Eye className="w-3 h-3" />
                Preview
              </a>
            )}
          </div>

          {options && options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleOptionSelect(opt)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-lg border transition-colors',
                    selectedOption === opt
                      ? 'border-secondary bg-secondary/10 text-secondary font-medium'
                      : 'border-surface-active text-text-secondary hover:text-text hover:bg-surface-hover',
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* Custom input for form hint, or feedback note for other hints */}
          {ui_hint !== 'browser' && (
            <div className={cn('mt-2 flex gap-1.5', isForm && 'items-center')}>
              <input
                type="text"
                value={feedbackText}
                onChange={(e) => { setFeedbackText(e.target.value); if (isForm) setSelectedOption(null) }}
                placeholder={isForm ? 'Or type your own answer...' : 'Add a note (optional)...'}
                onKeyDown={(e) => { if (e.key === 'Enter' && isForm && feedbackText.trim()) handleSubmitCustom() }}
                className={cn(
                  'flex-1 px-2.5 py-1.5 text-xs rounded-lg border',
                  'border-surface-active bg-surface-alt text-text placeholder:text-text-muted',
                  'focus:outline-none focus:border-primary/30',
                )}
              />
              {isForm && feedbackText.trim() && (
                <button
                  type="button"
                  onClick={handleSubmitCustom}
                  className="p-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors shrink-0"
                  aria-label="Submit answer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-row sm:flex-col gap-1.5 shrink-0 sm:pt-6 w-full sm:w-auto">
          {isForm && selectedOption ? (
            <button
              type="button"
              onClick={handleApprove}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Submit
            </button>
          ) : !isForm ? (
            <button
              type="button"
              onClick={handleApprove}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approve
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDeny}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-active text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            Deny
          </button>
          {isForm && onSendMessage && (
            <button
              type="button"
              onClick={handleChatAbout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-active text-text-muted hover:text-secondary hover:bg-secondary/5 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Discuss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
