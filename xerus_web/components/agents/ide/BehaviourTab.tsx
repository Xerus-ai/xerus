'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  FileText, Pencil, Lock, X, Minus, ArrowUp, Sparkles, Eye,
  Loader2, AlertTriangle,
} from 'lucide-react'
import { Button } from "@/components/ui/button"
import { FloatingPanel } from '@/components/common/FloatingPanel'
import { isTemplateContent } from './FileCard'
import { ThinkingLevelSelector, type ThinkingLevel } from './ThinkingLevelSelector'
import { AutonomyLevelSelector, type AutonomyLevel } from './AutonomyLevelSelector'
import { ProactivitySection } from './ProactivitySection'
import { BehaviourContextPanel } from './BehaviourContextPanel'
import type { HeartbeatConfigDTO, Assistant } from '@/lib/api/types'
import { apiCall } from '@/lib/api/client'
import { formatPrompt } from '@/lib/api/agents'
import {
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule as deleteScheduleApi,
  type ScheduleEntry,
} from '@/lib/api/schedules'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type BehaviourSection = 'heartbeat' | 'thinking' | 'autonomy' | 'proactivity'

interface BehaviourTabProps {
  agent: Assistant
  isEditable: boolean
  active?: boolean
  onUpdateAgent: (updates: Partial<Assistant>) => Promise<void>
}

const HEARTBEAT_PLACEHOLDER = `# Heartbeat

## Goals
Goals across timeframes. This month, this year, the endgame. Milestones and background actions toward each.

## Daily Rhythm
What to capture during sessions. What to log. End of day reflection.

## Weekly Review
What to review weekly. Patterns to look for. What to summarize. What to carry forward.

## Self-Improvement
How to get better over time. Learning from mistakes. Refining preferences. Identifying what works.

## Growth Metrics
What success looks like. What to track. Milestones that matter.`

export function BehaviourTab({
  agent,
  isEditable,
  active = true,
  onUpdateAgent,
}: BehaviourTabProps) {
  const [activeSection, setActiveSection] = useState<BehaviourSection>('heartbeat')
  const [heartbeatConfig, setHeartbeatConfig] = useState<HeartbeatConfigDTO | null>(null)
  // Track the active schedule entry from workspace.db (for update/delete operations)
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null)

  // HEARTBEAT.md file state
  const [heartbeatContent, setHeartbeatContent] = useState<string | null>(null)
  const [heartbeatIsTemplate, setHeartbeatIsTemplate] = useState(false)
  const [isLoadingFile, setIsLoadingFile] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isFormatting, setIsFormatting] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit'>('edit')
  const [isAgentRunning, setIsAgentRunning] = useState(false)

  const agentSlug = agent.slug || agent.name?.toLowerCase().replace(/\s+/g, '-') || String(agent.id)

  // Track whether data has been loaded (avoid re-fetching on every tab switch)
  const [hasLoaded, setHasLoaded] = useState(false)
  const prevAgentIdRef = useRef(agent?.id)

  // Reset hasLoaded when agent changes (e.g., navigating between agents without unmount)
  useEffect(() => {
    if (prevAgentIdRef.current !== agent?.id) {
      prevAgentIdRef.current = agent?.id
      setHasLoaded(false)
    }
  }, [agent?.id])

  // Load heartbeat config and HEARTBEAT.md file — only when tab first becomes active
  useEffect(() => {
    if (!active || hasLoaded || !agent?.id) return

    setHasLoaded(true)

    // Fetch active schedules for this agent from workspace.db
    const loadSchedules = async () => {
      try {
        const result = await listSchedules({ agent_slug: agentSlug })
        const activeSchedule = result.schedules.find(
          (s: ScheduleEntry) => s.status === 'active'
        )
        if (activeSchedule) {
          setActiveScheduleId(activeSchedule.id)
          setHeartbeatConfig({
            agentId: agent.id,
            enabled: true,
            cronExpression: activeSchedule.rrule ?? '*/30 * * * *',
            timezone: 'UTC',
            weekdaysOnly: false,
            maxDurationSeconds: 300,
            retryOnFailure: true,
            tokenBudget: 8000,
            eventTokenBudget: 4000,
            maxAlertsPerHour: 3,
            suppressToken: 'HEARTBEAT_OK',
            staggerOffsetMs: 0,
          })
        } else {
          setActiveScheduleId(null)
          setHeartbeatConfig(null)
        }
      } catch {
        setActiveScheduleId(null)
        setHeartbeatConfig(null)
      }
    }
    loadSchedules()

    const loadFile = async () => {
      setIsLoadingFile(true)
      try {
        const response = await apiCall(
          `/execute/agents/${agentSlug}/files/HEARTBEAT.md`,
          { method: 'GET' },
          false
        )
        if (response.headers.get('X-Agent-Running') === 'true') {
          setIsAgentRunning(true)
        }
        const data = await response.json()
        setHeartbeatContent(data.content as string)
        setHeartbeatIsTemplate(isTemplateContent(data.content))
      } catch {
        setHeartbeatContent(null)
      } finally {
        setIsLoadingFile(false)
      }
    }
    loadFile()
  }, [active, hasLoaded, agent?.id, agentSlug])

  // File save handler
  const handleSaveFile = async () => {
    if (isAgentRunning) {
      toast.warning('Your agent is currently running', { description: 'Changes may be overwritten until it finishes.' })
    }
    setIsSaving(true)
    try {
      await apiCall(
        `/execute/agents/${agentSlug}/files/HEARTBEAT.md`,
        { method: 'PUT', body: JSON.stringify({ content: editContent }) }
      )
      setHeartbeatContent(editContent)
      setHeartbeatIsTemplate(isTemplateContent(editContent))
      setEditorOpen(false)
    } catch {
      // API layer handles error toast
    } finally {
      setIsSaving(false)
    }
  }

  const handleWriteWithAI = async () => {
    if (!editContent.trim()) {
      toast.error('Missing content', { description: 'Add some text before saving.' })
      return
    }
    setIsFormatting(true)
    try {
      const result = await formatPrompt(editContent)
      setEditContent(result.system_prompt)
    } catch {
      // API layer handles error toast
    } finally {
      setIsFormatting(false)
    }
  }

  // Behaviour handlers
  const handleThinkingChange = useCallback(
    (level: ThinkingLevel) => {
      setActiveSection('thinking')
      onUpdateAgent({ thinkingLevel: level })
    },
    [onUpdateAgent]
  )

  const handleAutonomyChange = useCallback(
    (level: AutonomyLevel) => {
      setActiveSection('autonomy')
      onUpdateAgent({ autonomyLevel: level })
    },
    [onUpdateAgent]
  )

  const handleHeartbeatSave = useCallback(
    async (config: Partial<HeartbeatConfigDTO>) => {
      setActiveSection('proactivity')
      try {
        const rrule = config.cronExpression ?? '*/30 * * * *'
        if (activeScheduleId) {
          // Update existing schedule
          await updateSchedule(activeScheduleId, {
            rrule,
            status: 'active',
          })
        } else {
          // Create a new heartbeat schedule
          const result = await createSchedule({
            agent_slug: agentSlug,
            name: `${agentSlug}-heartbeat`,
            prompt: 'Heartbeat check-in: review goals, reflect on progress, and take proactive action.',
            rrule,
          })
          setActiveScheduleId(result.schedule.id)
        }
        setHeartbeatConfig({
          agentId: agent.id,
          enabled: true,
          cronExpression: rrule,
          timezone: config.timezone ?? 'UTC',
          activeHoursStart: config.activeHoursStart,
          activeHoursEnd: config.activeHoursEnd,
          weekdaysOnly: config.weekdaysOnly ?? false,
          maxDurationSeconds: config.maxDurationSeconds ?? 300,
          retryOnFailure: config.retryOnFailure ?? true,
          tokenBudget: config.tokenBudget ?? 8000,
          eventTokenBudget: config.eventTokenBudget ?? 4000,
          maxAlertsPerHour: config.maxAlertsPerHour ?? 3,
          suppressToken: config.suppressToken ?? 'HEARTBEAT_OK',
          staggerOffsetMs: config.staggerOffsetMs ?? 0,
        })
        toast.success('Proactivity schedule saved')
      } catch {
        // apiCall handles error toast
      }
    },
    [activeScheduleId, agentSlug, agent.id]
  )

  const handleHeartbeatDelete = useCallback(async () => {
    setActiveSection('proactivity')
    try {
      if (activeScheduleId) {
        await updateSchedule(activeScheduleId, { status: 'paused' })
      }
      setHeartbeatConfig(null)
      toast.success('Proactivity disabled')
    } catch {
      // apiCall handles error toast
    }
  }, [activeScheduleId])

  // At-a-glance summary
  const thinkingLabel = { low: 'Low', medium: 'Medium', high: 'High' }[agent.thinkingLevel ?? 'medium'] ?? 'Medium'
  const autonomyLabel = { supervised: 'Supervised', semi_autonomous: 'Semi-Auto', autonomous: 'Autonomous' }[agent.autonomyLevel ?? 'supervised'] ?? 'Supervised'
  const proactivityLabel = heartbeatConfig?.enabled ? 'Proactive' : 'Reactive'

  const previewText = heartbeatContent?.split('\n').filter(Boolean).slice(0, 3).join(' ') || null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        {/* At-a-glance summary */}
        <div className="flex items-center gap-2 text-sm px-1">
          <span className="font-medium text-text">{thinkingLabel}</span>
          <span className="text-text-muted">·</span>
          <span className="font-medium text-text">{autonomyLabel}</span>
          <span className="text-text-muted">·</span>
          <span className="font-medium text-text">{proactivityLabel}</span>
        </div>

        {/* HEARTBEAT.md - Card in Card */}
        <div
          className={cn(
            "bg-surface rounded-xl border shadow-sm p-4 cursor-pointer transition-all",
            activeSection === 'heartbeat'
              ? 'border-primary/30 ring-1 ring-primary/10'
              : 'border-surface-active'
          )}
          onClick={() => {
            setActiveSection('heartbeat')
            if (!isLoadingFile) {
              setEditContent(heartbeatContent || '')
              setMode(isEditable ? 'edit' : 'view')
              setEditorOpen(true)
            }
          }}
        >
          <div className={cn(
            "bg-surface-hover rounded-xl px-5 py-4 flex items-center gap-4",
            isLoadingFile && "animate-pulse"
          )}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-text">Heartbeat</span>
                {heartbeatIsTemplate && (
                  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200/50">
                    Template
                  </span>
                )}
              </div>
              {isLoadingFile ? (
                <div className="h-4 bg-surface rounded w-3/4" />
              ) : previewText ? (
                <p className="text-sm leading-relaxed text-text font-medium line-clamp-2">
                  {previewText}
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-text-secondary italic">
                  Goals, rhythm, and self-improvement
                </p>
              )}
            </div>
            {!isLoadingFile && (
              isEditable ? (
                <Button
                  variant="ghost"
                  className="h-9 px-4 bg-text hover:bg-primary rounded-xl text-white flex items-center gap-2 shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span className="text-sm font-medium">{heartbeatContent ? 'Edit' : 'Create'}</span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="h-9 px-4 bg-text/70 rounded-xl text-white flex items-center gap-2 shrink-0 cursor-default"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span className="text-sm font-medium">View Only</span>
                </Button>
              )
            )}
          </div>
        </div>

        {/* HEARTBEAT.md Editor */}
        <FloatingPanel
          isOpen={editorOpen}
          onClose={() => setEditorOpen(false)}
          title="Heartbeat"
          minimizedTitle="Heartbeat"
          icon={<FileText className="w-4 h-4" />}
          className="w-[600px] h-[600px] max-w-[95vw] max-h-[95vh] rounded-[40px] shadow-sm bg-surface p-2"
          variant="clean"
        >
          {({ close, minimize }) => (
            <div className="bg-card rounded-2xl h-full w-full flex flex-col p-6 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={close}
                    className="p-1.5 bg-surface-hover hover:bg-surface-pressed rounded-full transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4 text-text" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); minimize() }}
                    className="p-1.5 bg-surface-hover hover:bg-surface-pressed rounded-full transition-colors"
                    aria-label="Minimize"
                  >
                    <Minus className="w-4 h-4 text-text" />
                  </button>
                </div>
                <span className="text-sm font-bold text-text">Heartbeat</span>
              </div>

              {/* Running agent warning */}
              {isAgentRunning && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800">
                    Agent is running. Changes may be overwritten.
                  </p>
                </div>
              )}

              {/* Editor */}
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder={HEARTBEAT_PLACEHOLDER}
                className="flex-1 w-full resize-none outline-none text-sm text-text bg-transparent leading-relaxed placeholder:text-text-muted placeholder:whitespace-pre-wrap font-sans"
                autoFocus
                readOnly={!isEditable || mode === 'view'}
              />

              {/* Footer Toolbar */}
              <div className="mt-6 p-1.5 rounded-2xl border border-surface-active bg-card flex items-center justify-between shadow-sm shrink-0">
                <div className="flex items-center gap-2">
                  {isEditable && mode === 'edit' && (
                    <button
                      onClick={handleWriteWithAI}
                      disabled={isFormatting}
                      className={cn(
                        "h-9 px-3 hover:bg-surface rounded-xl flex items-center gap-2 transition-colors text-text font-medium text-sm",
                        isFormatting && "opacity-50 cursor-not-allowed"
                      )}
                      title="Format with AI"
                    >
                      <Sparkles className={cn("w-4 h-4", isFormatting && "animate-spin")} />
                      {isFormatting ? 'Formatting...' : 'Write with AI'}
                    </button>
                  )}
                </div>

                <div className="flex items-center bg-surface rounded-[14px] p-1">
                  <button
                    onClick={() => setMode('view')}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all",
                      mode === 'view' ? "bg-card shadow-sm text-text" : "text-text-secondary hover:text-text"
                    )}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </button>
                  {isEditable && (
                    <button
                      onClick={() => setMode('edit')}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all",
                        mode === 'edit' ? "bg-card shadow-sm text-text" : "text-text-secondary hover:text-text"
                      )}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditable ? (
                    <button
                      onClick={handleSaveFile}
                      disabled={isSaving}
                      className={cn(
                        "w-9 h-9 bg-text text-white rounded-xl flex items-center justify-center hover:bg-primary transition-colors shadow-md",
                        isSaving && "opacity-50 cursor-not-allowed"
                      )}
                      aria-label="Save"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowUp className="w-4 h-4" />
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={close}
                      className="h-9 px-4 bg-surface hover:bg-surface-active rounded-xl text-text text-sm font-medium transition-colors"
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </FloatingPanel>

        {/* Thinking Level */}
        <ThinkingLevelSelector
          value={agent.thinkingLevel ?? 'medium'}
          onChange={handleThinkingChange}
        />

        {/* Autonomy Level */}
        <AutonomyLevelSelector
          value={agent.autonomyLevel ?? 'supervised'}
          onChange={handleAutonomyChange}
        />

        {/* Proactivity */}
        <ProactivitySection
          agentId={agent.id}
          heartbeatConfig={heartbeatConfig}
          onSave={handleHeartbeatSave}
          onDelete={handleHeartbeatDelete}
        />
      </div>

      {/* Sticky Sidebar */}
      <div className="lg:sticky lg:top-8 lg:self-start space-y-6">
        <BehaviourContextPanel activeSection={activeSection} />
      </div>
    </div>
  )
}
