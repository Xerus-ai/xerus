'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Brain } from 'lucide-react'
import { getAgentMemories, type MemoryEntry } from '@/lib/api/memory'

type MemoryFilter = 'all' | 'working' | 'episodic' | 'semantic' | 'procedural'

const MEMORY_FILTERS: { value: MemoryFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'working', label: 'Working' },
    { value: 'episodic', label: 'Episodic' },
    { value: 'semantic', label: 'Semantic' },
    { value: 'procedural', label: 'Procedural' },
]

interface MemoryTabProps {
    agent: { id: number | string }
}

function formatRelativeTime(dateStr: string): string {
    const now = Date.now()
    const date = new Date(dateStr).getTime()
    const diffMs = now - date
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 30) return `${diffDay}d ago`
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function MemoryTab({ agent }: MemoryTabProps) {
    const [memories, setMemories] = useState<MemoryEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeFilter, setActiveFilter] = useState<MemoryFilter>('all')

    useEffect(() => {
        let cancelled = false
        async function fetchMemories() {
            setIsLoading(true)
            try {
                const data = await getAgentMemories(Number(agent.id))
                if (!cancelled) setMemories(data)
            } catch (err) {
                console.error('Failed to fetch agent memories:', err)
                if (!cancelled) setMemories([])
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        fetchMemories()
        return () => { cancelled = true }
    }, [agent.id])

    const filteredMemories = useMemo(() => {
        if (activeFilter === 'all') return memories
        return memories.filter(m => m.memoryType === activeFilter)
    }, [activeFilter, memories])

    const groupedMemories = useMemo(() => {
        const groups: Record<string, MemoryEntry[]> = {}
        for (const mem of filteredMemories) {
            const key = mem.memoryType || 'other'
            if (!groups[key]) groups[key] = []
            groups[key].push(mem)
        }
        return groups
    }, [filteredMemories])

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <Brain className="w-6 h-6 text-[#FF6600]" />
                    <h2 className="text-2xl font-serif text-text">Agent Memory</h2>
                </div>
                <div className="bg-surface p-6 rounded-[24px] border border-surface-active shadow-sm">
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="animate-pulse space-y-2">
                                <div className="h-3 bg-surface-hover rounded w-24" />
                                <div className="h-4 bg-surface-hover rounded w-full" />
                                <div className="h-3 bg-surface-hover rounded w-1/3" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Brain className="w-6 h-6 text-[#FF6600]" />
                    <h2 className="text-2xl font-serif text-text">Agent Memory</h2>
                    <span className="text-sm text-text-secondary bg-surface px-3 py-1 rounded-full">
                        {memories.length} {memories.length === 1 ? 'entry' : 'entries'}
                    </span>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center bg-surface rounded-[12px] p-1 border border-surface-active">
                    {MEMORY_FILTERS.map(f => (
                        <button
                            key={f.value}
                            onClick={() => setActiveFilter(f.value)}
                            className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                                activeFilter === f.value
                                    ? 'bg-white text-text shadow-sm'
                                    : 'text-text-secondary hover:text-text'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="bg-surface p-6 rounded-[24px] border border-surface-active shadow-sm">
                {filteredMemories.length > 0 ? (
                    <div className="space-y-6">
                        {Object.entries(groupedMemories).map(([type, entries]) => (
                            <div key={type}>
                                <h3 className="text-[10px] uppercase tracking-widest text-text-muted mb-3">
                                    {type}
                                </h3>
                                <div className="space-y-3">
                                    {entries.map(entry => (
                                        <div
                                            key={entry.id}
                                            className="p-3 bg-white rounded-xl border border-surface-active/60"
                                        >
                                            {entry.filePath && (
                                                <p className="text-xs text-text-muted font-mono mb-1 truncate">
                                                    {entry.filePath}
                                                </p>
                                            )}
                                            <p className="text-sm text-text line-clamp-3">
                                                {entry.content}
                                            </p>
                                            <p className="text-xs text-text-muted mt-2">
                                                {formatRelativeTime(entry.createdAt)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
                            <Brain className="w-8 h-8 text-text-secondary" />
                        </div>
                        <h3 className="text-lg font-serif text-text mb-2">No memories yet</h3>
                        <p className="text-text-secondary">
                            Memories will appear here as this agent learns from tasks.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
