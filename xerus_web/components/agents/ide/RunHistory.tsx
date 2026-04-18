'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
    History, Check, XCircle, Clock, Loader2,
    ChevronLeft, ChevronRight, Activity,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { listScheduleRuns, type ScheduleRunEntry } from '@/lib/api/schedules'
import { listExecutionSessions, type ExecutionSessionEntry } from '@/lib/api/execute'

/** Run history entry mapped from either schedule_runs or execution_sessions */
interface RunEntry {
    id: string
    status: 'success' | 'failed' | 'running'
    triggerType: string
    task: string
    description: string
    tokensUsed: number
    creditsUsed: number
    startedAt: string
    completedAt: string | null
    createdAt: string
    duration: string
}

/** Map a schedule_runs row to a RunEntry for display */
function mapScheduleRunToEntry(run: ScheduleRunEntry): RunEntry {
    const status = run.status === 'completed' ? 'success'
        : run.status === 'running' || run.status === 'pending' ? 'running'
        : 'failed'

    const startedAt = run.started_at
        ? new Date(run.started_at * 1000).toISOString()
        : new Date(run.created_at * 1000).toISOString()

    const completedAt = run.completed_at
        ? new Date(run.completed_at * 1000).toISOString()
        : null

    let duration = ''
    if (run.duration_ms != null) {
        const seconds = Math.round(run.duration_ms / 1000)
        if (seconds < 60) {
            duration = `${seconds}s`
        } else {
            const minutes = Math.floor(seconds / 60)
            const remainingSeconds = seconds % 60
            duration = `${minutes}m ${remainingSeconds}s`
        }
    }

    return {
        id: run.id,
        status,
        triggerType: 'schedule',
        task: run.schedule_name,
        description: run.schedule_prompt,
        tokensUsed: 0,
        creditsUsed: run.cost_usd ?? 0,
        startedAt,
        completedAt,
        createdAt: new Date(run.created_at * 1000).toISOString(),
        duration,
    }
}

/** Map an execution_sessions row to a RunEntry for display */
function mapSessionToEntry(session: ExecutionSessionEntry): RunEntry {
    const status = session.status === 'completed' ? 'success'
        : session.status === 'running' || session.status === 'pending' ? 'running'
        : 'failed'

    const startedAt = session.started_at ?? session.created_at
    const completedAt = session.completed_at ?? null

    let duration = ''
    if (startedAt && completedAt) {
        const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
        const seconds = Math.round(ms / 1000)
        if (seconds < 60) {
            duration = `${seconds}s`
        } else {
            const minutes = Math.floor(seconds / 60)
            const remainingSeconds = seconds % 60
            duration = `${minutes}m ${remainingSeconds}s`
        }
    }

    const tokens = (session.input_tokens ?? 0) + (session.output_tokens ?? 0)

    return {
        id: session.id,
        status,
        triggerType: session.trigger_type ?? 'user_message',
        task: session.user_prompt?.slice(0, 80) ?? 'Chat execution',
        description: session.user_prompt ?? '',
        tokensUsed: tokens,
        creditsUsed: session.credits_used ? parseFloat(session.credits_used) : 0,
        startedAt,
        completedAt,
        createdAt: session.created_at,
        duration,
    }
}

type RunStatus = 'all' | 'success' | 'failed'

const ITEMS_PER_PAGE = 10

interface RunHistoryProps {
    agent: { id: number | string; slug?: string | null }
}

export function RunHistory({ agent }: RunHistoryProps) {
    const [runs, setRuns] = useState<RunEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<RunStatus>('all')
    const [page, setPage] = useState(1)

    useEffect(() => {
        let cancelled = false
        async function fetchHistory() {
            if (!agent.slug) return
            setIsLoading(true)
            try {
                const [scheduleResult, sessionResult] = await Promise.all([
                    listScheduleRuns({ agent_slug: agent.slug, limit: 100 }),
                    listExecutionSessions({ agent_slug: agent.slug, limit: 100 }),
                ])
                if (!cancelled) {
                    const scheduleRuns = scheduleResult.runs.map(mapScheduleRunToEntry)
                    const sessionRuns = sessionResult.sessions.map(mapSessionToEntry)
                    const merged = [...scheduleRuns, ...sessionRuns]
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    setRuns(merged)
                }
            } catch (err) {
                if (!cancelled) {
                    toast.error("Couldn't load run history", { description: 'Please refresh the page and try again.' })
                    setRuns([])
                }
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        fetchHistory()
        return () => { cancelled = true }
    }, [agent.id, agent.slug])

    const filteredRuns = useMemo(() => {
        if (activeTab === 'all') return runs
        return runs.filter(r => r.status === activeTab)
    }, [activeTab, runs])

    const totalPages = Math.ceil(filteredRuns.length / ITEMS_PER_PAGE)
    const paginatedRuns = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredRuns.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredRuns, page])

    const handleTabChange = (tab: RunStatus) => {
        setActiveTab(tab)
        setPage(1)
    }

    const successCount = runs.filter(r => r.status === 'success').length
    const failedCount = runs.filter(r => r.status === 'failed').length

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <History className="w-6 h-6 text-secondary" />
                    <h2 className="text-2xl font-serif text-text">Run History</h2>
                </div>
                <div className="bg-surface p-6 rounded-3xl border border-surface-active shadow-sm">
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-start gap-3 animate-pulse">
                                <div className="w-5 h-5 bg-surface-hover rounded-full mt-1 shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-surface-hover rounded w-2/3" />
                                    <div className="h-3 bg-surface-hover rounded w-1/2" />
                                </div>
                                <div className="space-y-1 shrink-0">
                                    <div className="h-3 bg-surface-hover rounded w-16" />
                                    <div className="h-3 bg-surface-hover rounded w-12" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header Row */}
            <div className="flex items-center justify-between">
                {/* Left: Heading */}
                <div className="flex items-center gap-3">
                    <History className="w-6 h-6 text-secondary" />
                    <h2 className="text-2xl font-serif text-text">Run History</h2>
                    <span className="text-sm text-text-secondary bg-surface px-3 py-1 rounded-full">
                        {runs.length} {runs.length === 1 ? 'run' : 'runs'}
                    </span>
                </div>

                {/* Right: Tab Switcher + Pagination */}
                <div className="flex items-center gap-3">
                    {/* Tab Switcher */}
                    <div className="flex items-center bg-surface rounded-xl p-1 border border-surface-active">
                        <button
                            onClick={() => handleTabChange('all')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                                activeTab === 'all'
                                    ? 'bg-card text-text shadow-sm'
                                    : 'text-text-secondary hover:text-text'
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => handleTabChange('success')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                                activeTab === 'success'
                                    ? 'bg-card text-text shadow-sm'
                                    : 'text-text-secondary hover:text-text'
                            }`}
                        >
                            Success {successCount > 0 && `(${successCount})`}
                        </button>
                        <button
                            onClick={() => handleTabChange('failed')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                                activeTab === 'failed'
                                    ? 'bg-card text-text shadow-sm'
                                    : 'text-text-secondary hover:text-text'
                            }`}
                        >
                            Failed {failedCount > 0 && `(${failedCount})`}
                        </button>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2 bg-card rounded-xl px-3 py-1.5 border border-surface-active">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="text-text-secondary hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label="Previous page"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm text-text-secondary">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="text-text-secondary hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label="Next page"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Content Card */}
            <div className="bg-surface p-6 rounded-3xl border border-surface-active shadow-sm">
                {paginatedRuns.length > 0 ? (
                    <div className="space-y-4">
                        {paginatedRuns.map((run, i) => (
                            <div
                                key={run.id}
                                className={`flex items-start gap-3 ${
                                    i !== paginatedRuns.length - 1
                                        ? 'pb-4 border-b border-surface-active/60'
                                        : ''
                                }`}
                            >
                                <div className="mt-1 shrink-0">
                                    {run.status === 'success' && (
                                        <Check className="w-5 h-5 text-green-600" />
                                    )}
                                    {run.status === 'failed' && (
                                        <XCircle className="w-5 h-5 text-red-500" />
                                    )}
                                    {run.status === 'running' && (
                                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-text">{run.task || 'Untitled run'}</h4>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                                            run.status === 'success'
                                                ? 'bg-success/15 text-success'
                                                : run.status === 'failed'
                                                ? 'bg-destructive/15 text-destructive'
                                                : 'bg-warning/15 text-warning'
                                        }`}>
                                            {run.status === 'running' ? 'Running' : run.status}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-hover text-text-muted">
                                            {run.triggerType === 'schedule' ? 'Scheduled' : 'Chat'}
                                        </span>
                                    </div>
                                    {run.description && (
                                        <p className="text-sm text-text-secondary mt-0.5">
                                            {run.description}
                                        </p>
                                    )}
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-xs text-text-secondary">
                                        {new Date(run.createdAt).toLocaleDateString(undefined, {
                                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                        })}
                                    </p>
                                    <p className="text-xs text-text-muted mt-0.5">{run.duration}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
                            <Activity className="w-8 h-8 text-text-secondary" />
                        </div>
                        <h3 className="text-lg font-serif text-text mb-2">No runs yet</h3>
                        <p className="text-text-secondary">
                            Run history will appear here once this agent starts executing tasks.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
