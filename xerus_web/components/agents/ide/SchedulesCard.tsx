'use client'

import React from 'react'
import { Calendar, Plus, Check, Clock } from 'lucide-react'

interface SchedulesCardProps {
    agent: any
    schedules: any[]
    isMarketplace?: boolean
    onNavigateToSchedules?: () => void
}

// Reads the mapped recurrence string (RRULE or passthrough cron) and returns
// a friendly single-line summary for the sidebar card. Mirrors the logic in
// SchedulesTab.tsx so both views stay in sync.
const formatScheduleTime = (schedule: any): string => {
    const expr: string | undefined = schedule?.scheduleConfig?.cron
    if (!expr) return 'Not scheduled'

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

        let frequency: string
        if (parts.FREQ === 'DAILY') {
            frequency = 'Daily'
        } else if (parts.FREQ === 'WEEKLY') {
            const dayMap: Record<string, string> = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' }
            const days = (parts.BYDAY ?? '').split(',').map(d => dayMap[d]).filter(Boolean)
            frequency = days.length > 0 ? `Every ${days.join(', ')}` : 'Weekly'
        } else if (parts.FREQ === 'MONTHLY') {
            frequency = `Day ${parts.BYMONTHDAY ?? '1'} of each month`
        } else if (parts.FREQ === 'HOURLY') {
            frequency = 'Hourly'
        } else {
            frequency = parts.FREQ ? parts.FREQ[0] + parts.FREQ.slice(1).toLowerCase() : expr
        }

        if (time && frequency) return `${frequency} at ${time}`
        return frequency || time || expr
    }

    const cronParts = expr.split(' ')
    if (cronParts.length >= 5) {
        const [minute, hour] = cronParts
        const h = parseInt(hour, 10)
        const m = parseInt(minute, 10)
        if (Number.isFinite(h) && Number.isFinite(m) && hour !== '*' && minute !== '*') {
            return `${(h % 12) || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
        }
    }

    return expr
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
