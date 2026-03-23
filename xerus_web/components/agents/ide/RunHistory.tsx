'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
    History, Check, XCircle, Clock, Loader2,
    ChevronLeft, ChevronRight, Activity,
} from 'lucide-react'
import { toast } from 'sonner'
import { getAgentHistory, type RunEntry } from '@/lib/api/history'

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
            setIsLoading(true)
            try {
                const data = await getAgentHistory(agent.slug ?? String(agent.id))
                if (!cancelled) setRuns(data)
            } catch (err) {
                console.error('Failed to fetch run history:', err)
                if (!cancelled) {
                    toast.error("Couldn't load run history")
                    setRuns([])
                }
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        fetchHistory()
        return () => { cancelled = true }
    }, [agent.id])

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
                    <History className="w-6 h-6 text-[#FF6600]" />
                    <h2 className="text-2xl font-serif text-text">Run History</h2>
                </div>
                <div className="bg-surface p-6 rounded-[24px] border border-surface-active shadow-sm">
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
                    <History className="w-6 h-6 text-[#FF6600]" />
                    <h2 className="text-2xl font-serif text-text">Run History</h2>
                    <span className="text-sm text-text-secondary bg-surface px-3 py-1 rounded-full">
                        {runs.length} {runs.length === 1 ? 'run' : 'runs'}
                    </span>
                </div>

                {/* Right: Tab Switcher + Pagination */}
                <div className="flex items-center gap-3">
                    {/* Tab Switcher */}
                    <div className="flex items-center bg-surface rounded-[12px] p-1 border border-surface-active">
                        <button
                            onClick={() => handleTabChange('all')}
                            className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                                activeTab === 'all'
                                    ? 'bg-white text-text shadow-sm'
                                    : 'text-text-secondary hover:text-text'
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => handleTabChange('success')}
                            className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                                activeTab === 'success'
                                    ? 'bg-white text-text shadow-sm'
                                    : 'text-text-secondary hover:text-text'
                            }`}
                        >
                            Success {successCount > 0 && `(${successCount})`}
                        </button>
                        <button
                            onClick={() => handleTabChange('failed')}
                            className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                                activeTab === 'failed'
                                    ? 'bg-white text-text shadow-sm'
                                    : 'text-text-secondary hover:text-text'
                            }`}
                        >
                            Failed {failedCount > 0 && `(${failedCount})`}
                        </button>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2 bg-white rounded-[12px] px-3 py-1.5 border border-surface-active">
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
            <div className="bg-surface p-6 rounded-[24px] border border-surface-active shadow-sm">
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
                                        <Loader2 className="w-5 h-5 text-[#FF6600] animate-spin" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-text">{run.task || 'Untitled run'}</h4>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                                            run.status === 'success'
                                                ? 'bg-green-100 text-green-700'
                                                : run.status === 'failed'
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-amber-100 text-amber-700'
                                        }`}>
                                            {run.status === 'running' ? 'Running' : run.status}
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
