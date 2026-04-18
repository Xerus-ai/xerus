'use client'

import React, { useState } from 'react'
import { Calendar, Plus, Check, Clock, Pencil, Trash2, Play, Pause, ChevronRight, X, Minus } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { FloatingPanel } from "@/components/common/FloatingPanel"
import ScheduleConfigSection from "@/components/ScheduleConfigSection"

interface SchedulesTabProps {
    agent: any
    schedules: any[]
    workflowConfig: any
    onCreate: (schedule: any) => Promise<void>
    onToggle: (id: string, enabled: boolean) => Promise<void>
    onDelete: (id: string) => Promise<void>
    isLoading: boolean
}

// Helper to format cron expression to readable time
const formatScheduleTime = (schedule: any): string => {
    if (schedule.cron_expression) {
        const parts = schedule.cron_expression.split(' ')
        if (parts.length >= 5) {
            const minute = parts[0]
            const hour = parts[1]
            if (hour !== '*' && minute !== '*') {
                const h = parseInt(hour)
                const m = parseInt(minute)
                const ampm = h >= 12 ? 'PM' : 'AM'
                const displayHour = h % 12 || 12
                return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`
            }
        }
        return schedule.cron_expression
    }
    return 'Not scheduled'
}

// Helper to get schedule frequency description
const getFrequencyDescription = (schedule: any): string => {
    if (!schedule.cron_expression) return 'Not configured'

    const parts = schedule.cron_expression.split(' ')
    if (parts.length < 5) return schedule.cron_expression

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

    if (dayOfWeek !== '*' && dayOfMonth === '*') {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const dayNum = parseInt(dayOfWeek)
        if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
            return `Every ${days[dayNum]}`
        }
    }

    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        return 'Daily'
    }

    return schedule.cron_expression
}

export function SchedulesTab({
    agent,
    schedules,
    workflowConfig,
    onCreate,
    onToggle,
    onDelete,
    isLoading
}: SchedulesTabProps) {
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [selectedSchedule, setSelectedSchedule] = useState<any>(null)

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
                                                <span>{formatScheduleTime(schedule)}</span>
                                                <span>•</span>
                                                <span>{getFrequencyDescription(schedule)}</span>
                                            </div>
                                            {schedule.task && (
                                                <p className="text-sm text-text-secondary mt-2 line-clamp-1">
                                                    Task: {schedule.task}
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
                                    <p className="text-text mt-1">{formatScheduleTime(selectedSchedule)} • {getFrequencyDescription(selectedSchedule)}</p>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Cron Expression</label>
                                    <p className="text-text mt-1 font-mono text-sm bg-surface px-3 py-2 rounded-lg">{selectedSchedule.cron_expression}</p>
                                </div>

                                {selectedSchedule.task && (
                                    <div>
                                        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Task</label>
                                        <p className="text-text mt-1 text-sm bg-surface px-3 py-2 rounded-lg">{selectedSchedule.task}</p>
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
