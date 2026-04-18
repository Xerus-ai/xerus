'use client'

import React from 'react'
import { Calendar, Plus, Check, Clock } from 'lucide-react'

interface SchedulesCardProps {
    agent: any
    schedules: any[]
    isMarketplace?: boolean
    onNavigateToSchedules?: () => void
}

// Helper to format cron expression to readable time
const formatScheduleTime = (schedule: any): string => {
    if (schedule.cron_expression) {
        // Simple cron parsing for display
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

export function SchedulesCard({
    agent,
    schedules,
    isMarketplace = false,
    onNavigateToSchedules
}: SchedulesCardProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Calendar className="w-6 h-6 text-secondary" />
                    <h3 className="text-2xl font-serif text-text">Schedules</h3>
                </div>
                {!isMarketplace && (
                    <button
                        onClick={onNavigateToSchedules}
                        className="p-2 hover:bg-secondary/10 text-secondary rounded-full transition-colors"
                        aria-label="Add schedule"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                )}
            </div>

            <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-6">
                {schedules.length > 0 ? (
                    <div className="space-y-4">
                        {schedules.slice(0, 5).map((schedule, i) => (
                            <div
                                key={schedule.id}
                                className={`flex items-start gap-3 ${i !== schedules.slice(0, 5).length - 1 ? 'pb-4 border-b border-surface-active/60' : ''}`}
                            >
                                <div className="mt-1 shrink-0">
                                    {schedule.enabled ? (
                                        <Check className="w-5 h-5 text-green-600" />
                                    ) : (
                                        <Clock className="w-5 h-5 text-text-secondary" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-text truncate">
                                        {schedule.name || 'Unnamed Schedule'}
                                    </h4>
                                    <p className="text-sm text-text-secondary mt-0.5">
                                        {formatScheduleTime(schedule)}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {schedules.length > 5 && (
                            <button
                                onClick={onNavigateToSchedules}
                                className="text-sm text-secondary hover:underline font-medium"
                            >
                                View all {schedules.length} schedules
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8 border-2 border-dashed border-surface-active rounded-xl">
                        <p className="text-xs text-text-secondary italic">
                            {isMarketplace ? 'Clone this agent to add schedules' : 'No schedules yet -- your agent is always on standby'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
