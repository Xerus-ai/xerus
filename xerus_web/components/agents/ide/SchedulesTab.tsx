'use client'

import React, { useState } from 'react'
import { Calendar, Plus, Check, Clock, Pencil, Trash2, Play, Pause, ChevronRight, X, Minus } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { FloatingPanel } from "@/components/common/FloatingPanel"
import ScheduleConfigSection from "@/components/ScheduleConfigSection"
import type { ScheduledExecution } from "@/lib/api/types"

interface SchedulesTabProps {
    agent: any
    schedules: any[]
    workflowConfig: any
    onCreate: (schedule: any) => Promise<void>
    onUpdate: (id: string, schedule: any) => Promise<void>
    onToggle: (id: string, enabled: boolean) => Promise<void>
    onDelete: (id: string) => Promise<void>
    isLoading: boolean
}

// Extract underlying recurrence string from the mapped schedule.
// Backend stores it as `rrule` (RRULE or passthrough cron); the mapper
// surfaces it via scheduleConfig.cron.
const getRecurrence = (schedule: any): string | undefined =>
    schedule?.scheduleConfig?.cron ?? undefined

interface ParsedRecurrence {
    time?: string
    frequency?: string
}

// Parse either RRULE (FREQ=DAILY;BYHOUR=9;...) or standard cron (m h dom mon dow).
function parseRecurrence(expr: string): ParsedRecurrence {
    if (expr.includes('FREQ=')) {
        const parts: Record<string, string> = {}
        for (const segment of expr.split(';')) {
            const [k, v] = segment.split('=')
            if (k) parts[k] = v ?? ''
        }

        const hour = parseInt(parts.BYHOUR ?? '', 10)
        const minute = parseInt(parts.BYMINUTE ?? '0', 10)
        const time = Number.isFinite(hour)
            ? `${(hour % 12) || 12}:${(Number.isFinite(minute) ? minute : 0).toString().padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
            : undefined
        const interval = parseInt(parts.INTERVAL ?? '', 10)

        let frequency: string
        if (parts.FREQ === 'MINUTELY') {
            frequency = Number.isFinite(interval) && interval > 1 ? `Every ${interval} minutes` : 'Every minute'
        } else if (parts.FREQ === 'HOURLY') {
            frequency = Number.isFinite(interval) && interval > 1 ? `Every ${interval} hours` : 'Every hour'
        } else if (parts.FREQ === 'DAILY') {
            frequency = 'Daily'
        } else if (parts.FREQ === 'WEEKLY') {
            const dayMap: Record<string, string> = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' }
            const days = (parts.BYDAY ?? '').split(',').map(d => dayMap[d]).filter(Boolean)
            frequency = days.length > 0 ? `Every ${days.join(', ')}` : 'Weekly'
        } else if (parts.FREQ === 'MONTHLY') {
            frequency = `Day ${parts.BYMONTHDAY ?? '1'} of each month`
        } else {
            frequency = parts.FREQ ? parts.FREQ[0] + parts.FREQ.slice(1).toLowerCase() : expr
        }
        return { time, frequency }
    }

    const cronParts = expr.split(' ')
    if (cronParts.length >= 5) {
        const [minute, hour, dayOfMonth, month, dayOfWeek] = cronParts
        const h = parseInt(hour, 10)
        const m = parseInt(minute, 10)
        const time = Number.isFinite(h) && Number.isFinite(m) && hour !== '*' && minute !== '*'
            ? `${(h % 12) || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
            : undefined

        let frequency = expr
        if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            frequency = 'Daily'
        } else if (dayOfWeek !== '*' && dayOfMonth === '*') {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
            const d = parseInt(dayOfWeek, 10)
            if (d >= 0 && d <= 6) frequency = `Every ${days[d]}`
        }
        return { time, frequency }
    }

    return { time: undefined, frequency: expr }
}

// Human-friendly single-line summary, e.g. "Daily at 9:00 AM",
// "Every Mon, Wed at 6:30 PM", or "Every 15 minutes". Falls back to the
// raw expression only when parsing fails.
const describeRecurrence = (schedule: any): string => {
    const expr = getRecurrence(schedule)
    if (!expr) return 'Not configured'
    const { time, frequency } = parseRecurrence(expr)
    if (time && frequency) return `${frequency} at ${time}`
    return frequency ?? time ?? expr
}

export function SchedulesTab({
    agent,
    schedules,
    workflowConfig,
    onCreate,
    onUpdate,
    onToggle,
    onDelete,
    isLoading
}: SchedulesTabProps) {
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [selectedSchedule, setSelectedSchedule] = useState<any>(null)
    const [editingSchedule, setEditingSchedule] = useState<ScheduledExecution | null>(null)

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Calendar className="w-6 h-6 text-secondary" />
                    <h2 className="text-2xl font-serif text-text">Schedules</h2>
                    <span className="text-sm text-text-secondary bg-surface px-3 py-1 rounded-full">
                        {schedules.length} {schedules.length === 1 ? 'schedule' : 'schedules'}
                    </span>
                </div>
                <Button
                    onClick={() => setIsCreateOpen(true)}
                    className="bg-text text-white hover:bg-text/90 rounded-xl px-4 py-2 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Create Schedule
                </Button>
            </div>

            {/* Schedules List */}
            <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-6">
                {schedules.length > 0 ? (
                    <div className="space-y-4">
                        {schedules.map((schedule, i) => (
                            <div
                                key={schedule.id}
                                className={`bg-surface-alt rounded-xl border border-surface-active p-4 ${i !== schedules.length - 1 ? '' : ''}`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3 flex-1">
                                        <div className="mt-1 shrink-0">
                                            {schedule.enabled ? (
                                                <Check className="w-5 h-5 text-green-600" />
                                            ) : (
                                                <Clock className="w-5 h-5 text-text-secondary" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-medium text-text">
                                                    {schedule.name || 'Unnamed Schedule'}
                                                </h4>
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${schedule.enabled ? 'bg-success/15 text-success' : 'bg-surface-hover text-text-secondary'}`}>
                                                    {schedule.enabled ? 'Active' : 'Paused'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-text-secondary">
                                                <span>{describeRecurrence(schedule)}</span>
                                            </div>
                                            {(schedule.taskPrompt ?? schedule.description) && (
                                                <p className="text-sm text-text-secondary mt-2 line-clamp-1">
                                                    Task: {schedule.taskPrompt ?? schedule.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 ml-4">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 hover:bg-surface-hover rounded-lg"
                                            onClick={() => onToggle(schedule.id, !schedule.enabled)}
                                            aria-label={schedule.enabled ? 'Pause schedule' : 'Enable schedule'}
                                        >
                                            {schedule.enabled ? (
                                                <Pause className="w-4 h-4 text-text-secondary" />
                                            ) : (
                                                <Play className="w-4 h-4 text-text-secondary" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 hover:bg-surface-hover rounded-lg"
                                            onClick={() => setSelectedSchedule(schedule)}
                                            aria-label="View details"
                                        >
                                            <ChevronRight className="w-4 h-4 text-text-secondary" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 hover:bg-destructive/10 rounded-lg"
                                            onClick={() => onDelete(schedule.id)}
                                            aria-label="Delete schedule"
                                        >
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
                            <Calendar className="w-8 h-8 text-text-secondary" />
                        </div>
                        <h3 className="text-lg font-serif text-text mb-2">No schedules yet</h3>
                        <p className="text-text-secondary mb-6">Create a schedule to run your agent automatically.</p>
                        <Button
                            onClick={() => setIsCreateOpen(true)}
                            className="px-6 py-2.5 rounded-full bg-text text-white hover:bg-text/90 transition-colors text-sm font-medium inline-flex items-center gap-2 h-auto"
                        >
                            <Plus className="w-4 h-4" />
                            Create Schedule
                        </Button>
                    </div>
                )}
            </div>

            {/* Create Schedule Panel */}
            <FloatingPanel
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                title="Create Schedule"
                minimizedTitle="New Schedule"
                icon={<Calendar className="w-4 h-4" />}
                className="w-[600px] h-[600px] max-w-[95vw] max-h-[95vh] rounded-[40px] shadow-sm bg-surface p-2"
                variant="clean"
            >
                {({ close, minimize }) => (
                    <div className="bg-card rounded-2xl h-full w-full flex flex-col p-6 overflow-hidden">
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
                                    onClick={minimize}
                                    className="p-1.5 bg-surface-hover hover:bg-surface-pressed rounded-full transition-colors"
                                    aria-label="Minimize"
                                >
                                    <Minus className="w-4 h-4 text-text" />
                                </button>
                            </div>
                            <span className="text-sm font-bold text-text">New Schedule</span>
                        </div>

                        <div className="space-y-8 flex-1 overflow-y-auto">
                            <ScheduleConfigSection
                                agentId={agent.id}
                                workflowConfig={workflowConfig}
                                onSave={async (s) => {
                                    await onCreate(s)
                                    setIsCreateOpen(false)
                                }}
                                onCancel={() => setIsCreateOpen(false)}
                            />
                        </div>
                    </div>
                )}
            </FloatingPanel>

            {/* Edit Schedule Panel */}
            <FloatingPanel
                isOpen={!!editingSchedule}
                onClose={() => setEditingSchedule(null)}
                title="Edit Schedule"
                minimizedTitle={editingSchedule?.name || 'Edit Schedule'}
                icon={<Pencil className="w-4 h-4" />}
                className="w-[600px] h-[600px] max-w-[95vw] max-h-[95vh] rounded-[40px] shadow-sm bg-surface p-2"
                variant="clean"
            >
                {({ close, minimize }) => (
                    <div className="bg-card rounded-2xl h-full w-full flex flex-col p-6 overflow-hidden">
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
                                    onClick={minimize}
                                    className="p-1.5 bg-surface-hover hover:bg-surface-pressed rounded-full transition-colors"
                                    aria-label="Minimize"
                                >
                                    <Minus className="w-4 h-4 text-text" />
                                </button>
                            </div>
                            <span className="text-sm font-bold text-text">Edit Schedule</span>
                        </div>

                        <div className="space-y-8 flex-1 overflow-y-auto">
                            {editingSchedule && (
                                <ScheduleConfigSection
                                    agentId={agent.id}
                                    workflowConfig={workflowConfig}
                                    initial={editingSchedule}
                                    submitLabel="Save Changes"
                                    onSave={async (s) => {
                                        if (!editingSchedule.id) return
                                        await onUpdate(editingSchedule.id, s)
                                        setEditingSchedule(null)
                                    }}
                                    onCancel={() => setEditingSchedule(null)}
                                />
                            )}
                        </div>
                    </div>
                )}
            </FloatingPanel>

            {/* Schedule Detail Panel */}
            <FloatingPanel
                isOpen={!!selectedSchedule}
                onClose={() => setSelectedSchedule(null)}
                title="Schedule Details"
                minimizedTitle={selectedSchedule?.name || 'Schedule'}
                icon={<Calendar className="w-4 h-4" />}
                className="w-[500px] h-[500px] max-w-[95vw] max-h-[95vh] rounded-[40px] shadow-sm bg-surface p-2"
                variant="clean"
            >
                {({ close, minimize }) => (
                    <div className="bg-card rounded-2xl h-full w-full flex flex-col p-6 overflow-hidden">
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
                                    onClick={minimize}
                                    className="p-1.5 bg-surface-hover hover:bg-surface-pressed rounded-full transition-colors"
                                    aria-label="Minimize"
                                >
                                    <Minus className="w-4 h-4 text-text" />
                                </button>
                            </div>
                            <span className="text-sm font-bold text-text">Details</span>
                        </div>

                        {selectedSchedule && (
                            <div className="space-y-6 flex-1 overflow-y-auto">
                                <div>
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Name</label>
                                    <p className="text-lg font-medium text-text mt-1">{selectedSchedule.name || 'Unnamed Schedule'}</p>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Status</label>
                                    <p className="mt-1">
                                        <span className={`inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full ${selectedSchedule.enabled ? 'bg-success/15 text-success' : 'bg-surface-hover text-text-secondary'}`}>
                                            {selectedSchedule.enabled ? <Check className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                                            {selectedSchedule.enabled ? 'Active' : 'Paused'}
                                        </span>
                                    </p>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Schedule</label>
                                    <p className="text-text mt-1">{describeRecurrence(selectedSchedule)}</p>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Recurrence</label>
                                    <div className="mt-1 bg-surface px-3 py-2 rounded-lg">
                                        <p className="text-text text-sm">{describeRecurrence(selectedSchedule)}</p>
                                        {getRecurrence(selectedSchedule) && (
                                            <p className="text-text-muted text-[11px] font-mono mt-1 break-all">
                                                {getRecurrence(selectedSchedule)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {(selectedSchedule.taskPrompt ?? selectedSchedule.description) && (
                                    <div>
                                        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Task</label>
                                        <p className="text-text mt-1 text-sm bg-surface px-3 py-2 rounded-lg whitespace-pre-wrap">
                                            {selectedSchedule.taskPrompt ?? selectedSchedule.description}
                                        </p>
                                    </div>
                                )}

                                <div className="flex gap-3 pt-4">
                                    <Button
                                        variant="ghost"
                                        className="flex-1 h-10 bg-surface-hover hover:bg-surface-pressed rounded-xl text-text"
                                        onClick={() => {
                                            onToggle(selectedSchedule.id, !selectedSchedule.enabled)
                                            setSelectedSchedule(null)
                                        }}
                                    >
                                        {selectedSchedule.enabled ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                                        {selectedSchedule.enabled ? 'Pause' : 'Enable'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="h-10 px-4 bg-surface-hover hover:bg-surface-pressed rounded-xl text-text"
                                        onClick={() => {
                                            setEditingSchedule(selectedSchedule)
                                            setSelectedSchedule(null)
                                        }}
                                    >
                                        <Pencil className="w-4 h-4 mr-2" />
                                        Edit
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="h-10 px-4 bg-destructive/10 hover:bg-destructive/15 rounded-xl text-destructive"
                                        onClick={() => {
                                            onDelete(selectedSchedule.id)
                                            setSelectedSchedule(null)
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </FloatingPanel>
        </div>
    )
}
