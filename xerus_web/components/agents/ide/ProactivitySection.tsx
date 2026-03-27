'use client'

import React, { useState, useCallback, useMemo } from 'react'
import {
  Activity,
  Clock,
  Calendar,
  Check,
  Info,
  Settings,
  X,
  Minus,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { FloatingPanel } from '@/components/common/FloatingPanel'
import type { HeartbeatConfigDTO } from '@/lib/api/types'

const INTERVAL_PRESETS = [
  { label: '15 min', description: 'Every 15 minutes', cron: '*/15 * * * *' },
  { label: '30 min', description: 'Every 30 minutes', cron: '*/30 * * * *' },
  { label: '1 hour', description: 'Every hour', cron: '0 * * * *' },
  { label: '2 hours', description: 'Every 2 hours', cron: '0 */2 * * *' },
  { label: '4 hours', description: 'Every 4 hours', cron: '0 */4 * * *' },
  { label: 'Daily', description: 'Once a day at 9am', cron: '0 9 * * *' },
  { label: 'Custom', description: 'Cron expression', cron: 'custom' },
] as const

const TIMEZONES = [
  { id: 'UTC', name: 'UTC' },
  { id: 'America/New_York', name: 'Eastern Time (ET)' },
  { id: 'America/Chicago', name: 'Central Time (CT)' },
  { id: 'America/Denver', name: 'Mountain Time (MT)' },
  { id: 'America/Los_Angeles', name: 'Pacific Time (PT)' },
  { id: 'Europe/London', name: 'London (GMT)' },
  { id: 'Europe/Berlin', name: 'Berlin (CET)' },
  { id: 'Europe/Paris', name: 'Paris (CET)' },
  { id: 'Asia/Tokyo', name: 'Tokyo (JST)' },
  { id: 'Asia/Shanghai', name: 'Shanghai (CST)' },
  { id: 'Asia/Kolkata', name: 'India (IST)' },
  { id: 'Asia/Singapore', name: 'Singapore (SGT)' },
  { id: 'Australia/Sydney', name: 'Sydney (AEDT)' },
  { id: 'Pacific/Auckland', name: 'Auckland (NZDT)' },
] as const

interface ProactivitySectionProps {
  agentId: number
  heartbeatConfig: HeartbeatConfigDTO | null
  onSave: (config: Partial<HeartbeatConfigDTO>) => void
  onDelete: () => void
}

function cronToPreset(cron: string): string {
  const match = INTERVAL_PRESETS.find((p) => p.cron === cron)
  return match ? cron : 'custom'
}

function cronToLabel(cron: string): string {
  const match = INTERVAL_PRESETS.find((p) => p.cron === cron)
  return match ? match.description : cron
}

export function ProactivitySection({
  agentId,
  heartbeatConfig,
  onSave,
  onDelete,
}: ProactivitySectionProps) {
  const isProactive = heartbeatConfig?.enabled ?? false
  const [configOpen, setConfigOpen] = useState(false)

  const [cronExpression, setCronExpression] = useState(
    heartbeatConfig?.cronExpression ?? '*/30 * * * *'
  )
  const [timezone, setTimezone] = useState(
    heartbeatConfig?.timezone ?? 'UTC'
  )
  const [activeHoursStart, setActiveHoursStart] = useState(
    heartbeatConfig?.activeHoursStart ?? '09:00'
  )
  const [activeHoursEnd, setActiveHoursEnd] = useState(
    heartbeatConfig?.activeHoursEnd ?? '17:00'
  )
  const [weekdaysOnly, setWeekdaysOnly] = useState(
    heartbeatConfig?.weekdaysOnly ?? false
  )
  const [activeHoursEnabled, setActiveHoursEnabled] = useState(
    !!(heartbeatConfig?.activeHoursStart || heartbeatConfig?.activeHoursEnd)
  )
  const [selectedPreset, setSelectedPreset] = useState(
    cronToPreset(heartbeatConfig?.cronExpression ?? '*/30 * * * *')
  )
  const [isDirty, setIsDirty] = useState(false)

  const markDirty = useCallback(() => setIsDirty(true), [])

  const handleToggleProactive = useCallback(() => {
    if (isProactive) {
      onDelete()
    } else {
      onSave({
        agentId,
        enabled: true,
        cronExpression: '*/30 * * * *',
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
      setConfigOpen(true)
    }
  }, [isProactive, onSave, onDelete, agentId])

  const handlePresetChange = useCallback((value: string) => {
    setSelectedPreset(value)
    if (value !== 'custom') {
      setCronExpression(value)
    }
    markDirty()
  }, [markDirty])

  const handleSave = useCallback(() => {
    onSave({
      agentId,
      enabled: true,
      cronExpression,
      timezone,
      activeHoursStart: activeHoursEnabled ? activeHoursStart : undefined,
      activeHoursEnd: activeHoursEnabled ? activeHoursEnd : undefined,
      weekdaysOnly: activeHoursEnabled ? weekdaysOnly : false,
    })
    setIsDirty(false)
    setConfigOpen(false)
  }, [
    agentId,
    cronExpression,
    timezone,
    activeHoursEnabled,
    activeHoursStart,
    activeHoursEnd,
    weekdaysOnly,
    onSave,
  ])

  const previewText = useMemo(() => {
    const preset = INTERVAL_PRESETS.find(p => p.cron === selectedPreset)
    let text = preset && preset.cron !== 'custom'
      ? preset.description
      : `Custom: ${cronExpression}`

    if (activeHoursEnabled) {
      text += `, ${activeHoursStart} – ${activeHoursEnd}`
      if (weekdaysOnly) text += ' (weekdays only)'
    }

    return text
  }, [selectedPreset, cronExpression, activeHoursEnabled, activeHoursStart, activeHoursEnd, weekdaysOnly])

  const timezoneName = TIMEZONES.find(tz => tz.id === timezone)?.name ?? timezone

  // Inline summary when proactive
  const inlineSummary = isProactive
    ? cronToLabel(heartbeatConfig?.cronExpression ?? '*/30 * * * *')
    : null

  return (
    <div className="bg-surface rounded-[24px] border border-surface-active p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-text mb-4">Proactivity</h3>

      {/* Reactive / Proactive Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Reactive */}
        <button
          onClick={isProactive ? handleToggleProactive : undefined}
          className={`relative p-5 rounded-xl text-left transition-all ${
            !isProactive
              ? 'bg-surface-hover border border-primary/30'
              : 'bg-surface-hover border border-transparent hover:border-surface-active cursor-pointer'
          }`}
        >
          <div className="absolute top-4 right-4">
            {!isProactive ? (
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
            ) : (
              <Clock className="w-5 h-5 text-text-muted/40" />
            )}
          </div>

          <div className="flex items-center gap-3 mb-3">
            {!isProactive ? (
              <div className="w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-surface-active shrink-0" />
            )}
            <span className="text-sm font-semibold text-text">Reactive</span>
          </div>

          <p className="text-xs text-text-secondary leading-relaxed mb-3 pl-0">
            Responds only when prompted by a user or event.
          </p>

          <span className={`inline-block ml-0 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
            !isProactive
              ? 'text-primary bg-primary/10'
              : 'text-text bg-surface border border-surface-active'
          }`}>
            ON DEMAND
          </span>
        </button>

        {/* Proactive */}
        <button
          onClick={!isProactive ? handleToggleProactive : undefined}
          className={`relative p-5 rounded-xl text-left transition-all ${
            isProactive
              ? 'bg-surface-hover border border-primary/30'
              : 'bg-surface-hover border border-transparent hover:border-surface-active cursor-pointer'
          }`}
        >
          <div className="absolute top-4 right-4">
            {isProactive ? (
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
            ) : (
              <Activity className="w-5 h-5 text-text-muted/40" />
            )}
          </div>

          <div className="flex items-center gap-3 mb-3">
            {isProactive ? (
              <div className="w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-surface-active shrink-0" />
            )}
            <span className="text-sm font-semibold text-text">Proactive</span>
          </div>

          <p className="text-xs text-text-secondary leading-relaxed mb-3 pl-0">
            Runs on a schedule, checking in and taking action automatically.
          </p>

          <span className={`inline-block ml-0 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
            isProactive
              ? 'text-primary bg-primary/10'
              : 'text-text bg-surface border border-surface-active'
          }`}>
            SCHEDULED
          </span>
        </button>
      </div>

      {/* Inline summary + Configure button when proactive */}
      {isProactive && (
        <div className="mt-4 pt-4 border-t border-surface-active flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Clock className="w-3.5 h-3.5" />
            <span>{inlineSummary}</span>
            {heartbeatConfig?.activeHoursStart && (
              <>
                <span className="text-text-muted">·</span>
                <span>{heartbeatConfig.activeHoursStart} – {heartbeatConfig.activeHoursEnd}</span>
              </>
            )}
            {heartbeatConfig?.weekdaysOnly && (
              <>
                <span className="text-text-muted">·</span>
                <span>Weekdays</span>
              </>
            )}
          </div>
          <button
            onClick={() => setConfigOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text bg-surface-hover hover:bg-surface-pressed rounded-[12px] transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Configure
          </button>
        </div>
      )}

      {/* Heartbeat Config FloatingPanel */}
      <FloatingPanel
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Heartbeat Schedule"
        minimizedTitle="Heartbeat"
        icon={<Activity className="w-4 h-4" />}
        className="w-[600px] h-[600px] max-w-[95vw] max-h-[95vh] rounded-[40px] shadow-sm bg-surface p-2"
        variant="clean"
      >
        {({ close, minimize }) => (
          <div className="bg-white rounded-[32px] h-full w-full flex flex-col p-6 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={close}
                  className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-text" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); minimize() }}
                  className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors"
                  aria-label="Minimize"
                >
                  <Minus className="w-4 h-4 text-text" />
                </button>
              </div>
              <span className="text-sm font-bold text-text">Heartbeat Schedule</span>
            </div>

            {/* Content */}
            <div className="space-y-6 flex-1 overflow-y-auto">
              <div>
                <h3 className="text-base font-medium text-text mb-1">Configure Heartbeat</h3>
                <p className="text-sm text-text-secondary">
                  Set how often this agent checks in and takes autonomous action
                </p>
              </div>

              {/* Check-in Interval */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  Check-in Interval
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {INTERVAL_PRESETS.map((preset) => (
                    <button
                      key={preset.cron}
                      onClick={() => handlePresetChange(preset.cron)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selectedPreset === preset.cron
                          ? 'border-primary bg-[#FFF5EB]'
                          : 'border-surface-active bg-white hover:border-primary/50'
                      }`}
                    >
                      <div className={`font-medium text-sm ${
                        selectedPreset === preset.cron ? 'text-primary' : 'text-text'
                      }`}>
                        {preset.label}
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {preset.description}
                      </div>
                    </button>
                  ))}
                </div>

                {selectedPreset === 'custom' && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      Cron Expression
                    </label>
                    <input
                      value={cronExpression}
                      onChange={(e) => {
                        setCronExpression(e.target.value)
                        markDirty()
                      }}
                      placeholder="*/30 * * * *"
                      className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text font-mono placeholder:text-[#9CA3AF]"
                    />
                    <p className="text-xs text-text-secondary mt-1">
                      Format: minute hour day month weekday (e.g., "0 9 * * *" = 9:00 AM daily)
                    </p>
                  </div>
                )}
              </div>

              {/* Active Hours */}
              <div className="space-y-4 p-4 bg-surface rounded-xl border border-surface-active">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-text-secondary" />
                    <span className="text-sm font-medium text-text">Active Hours</span>
                  </div>
                  <Switch
                    checked={activeHoursEnabled}
                    onCheckedChange={(checked) => {
                      setActiveHoursEnabled(checked)
                      markDirty()
                    }}
                  />
                </div>

                {activeHoursEnabled && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Start
                        </label>
                        <input
                          type="time"
                          value={activeHoursStart}
                          onChange={(e) => {
                            setActiveHoursStart(e.target.value)
                            markDirty()
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          <Clock className="w-3 h-3 inline mr-1" />
                          End
                        </label>
                        <input
                          type="time"
                          value={activeHoursEnd}
                          onChange={(e) => {
                            setActiveHoursEnd(e.target.value)
                            markDirty()
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text"
                        />
                      </div>
                    </div>

                    {/* Timezone */}
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">
                        Timezone
                      </label>
                      <select
                        value={timezone}
                        onChange={(e) => {
                          setTimezone(e.target.value)
                          markDirty()
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-surface-active text-sm focus:outline-none focus:border-primary transition-colors bg-white text-text"
                      >
                        {TIMEZONES.map((tz) => (
                          <option key={tz.id} value={tz.id}>
                            {tz.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Weekdays Only */}
                    <div className="flex items-center justify-between p-3 bg-surface rounded-xl border border-surface-active">
                      <div>
                        <div className="text-sm font-medium text-text">Weekdays Only</div>
                        <div className="text-xs text-text-secondary">Skip Saturday and Sunday</div>
                      </div>
                      <Switch
                        checked={weekdaysOnly}
                        onCheckedChange={(checked) => {
                          setWeekdaysOnly(checked)
                          markDirty()
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Preview */}
              <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Info className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text">{previewText}</div>
                  <div className="text-xs text-text-secondary/70 mt-0.5">Timezone: {timezoneName}</div>
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  onClick={close}
                  className="px-6 py-2.5 rounded-[12px] border border-surface-active text-text hover:bg-surface font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2.5 rounded-[12px] bg-text hover:bg-[#1a1a1a] text-white font-medium text-sm shadow-sm transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </FloatingPanel>
    </div>
  )
}
