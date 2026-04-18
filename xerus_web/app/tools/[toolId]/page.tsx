'use client'

import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, ArrowLeft, Shield, Zap, Power, Activity, Play, Check, Settings, ChevronLeft, ChevronRight, Hammer } from 'lucide-react'
import { XerusLoader } from '@/components/common/XerusLoader'
import { useTool } from '@/hooks/useTools'
import { useToolAuth } from '@/hooks/useToolAuth'
import { usePipedreamActions } from '@/hooks/usePipedreamActions'
import { usePipedreamTriggers } from '@/hooks/usePipedreamTriggers'
import { getApiUrl } from '@/utils/tools'
import { getApiHeaders } from '@/lib/api/client'
import { useState, useEffect, useMemo } from 'react'

export default function ToolDetailPage() {
    const params = useParams()
    const router = useRouter()
    const toolId = params.toolId as string

    const { tool, loading, error, refetch } = useTool(toolId)
    const {
        handleAuthConfigure,
        handleDisconnect
    } = useToolAuth(refetch)
    const { actions, loading: actionsLoading } = usePipedreamActions(tool?.tool_name)
    const { triggers, loading: triggersLoading } = usePipedreamTriggers(tool?.tool_name)

    const [activeSection, setActiveSection] = useState<'actions' | 'triggers'>('actions')
    const [actionsPage, setActionsPage] = useState(1)
    const [triggersPage, setTriggersPage] = useState(1)
    const [stats, setStats] = useState<{
        last_used_at: string | null
        total_runs: number
    } | null>(null)

    const ITEMS_PER_PAGE = 10

    // Pagination logic for actions
    const actionsTotalPages = Math.ceil((actions?.length || 0) / ITEMS_PER_PAGE)
    const paginatedActions = useMemo(() => {
        if (!actions) return []
        const start = (actionsPage - 1) * ITEMS_PER_PAGE
        const end = start + ITEMS_PER_PAGE
        return actions.slice(start, end)
    }, [actions, actionsPage])

    // Pagination logic for triggers
    const triggersTotalPages = Math.ceil((triggers?.length || 0) / ITEMS_PER_PAGE)
    const paginatedTriggers = useMemo(() => {
        if (!triggers) return []
        const start = (triggersPage - 1) * ITEMS_PER_PAGE
        const end = start + ITEMS_PER_PAGE
        return triggers.slice(start, end)
    }, [triggers, triggersPage])

    // Reset to page 1 when switching tabs
    const handleTabChange = (tab: 'actions' | 'triggers') => {
        setActiveSection(tab)
        if (tab === 'actions') setActionsPage(1)
        if (tab === 'triggers') setTriggersPage(1)
    }

    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 5

    // Fetch tool statistics
    useEffect(() => {
        const fetchStats = async () => {
            if (!tool?.tool_name) return

            try {
                const apiUrl = await getApiUrl()
                const response = await fetch(`${apiUrl}/tools/stats/${tool.tool_name}`, {
                    headers: await getApiHeaders()
                })

                if (response.ok) {
                    const data = await response.json()
                    setStats(data.data)
                }
            } catch (error) {
                void error /* tool stats fetch failed — non-critical */
            }
        }

        fetchStats()
    }, [tool?.tool_name])

    if (loading) {
        return <XerusLoader />
    }

    if (error || !tool) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
                <Image src="/logo/xerus.svg" alt="" width={40} height={40} className="opacity-30" />
                <div className="text-center">
                    <h1 className="text-lg font-serif text-text mb-1">{error ? 'Something went wrong' : 'Connector not found'}</h1>
                    <p className="text-sm text-text-secondary max-w-xs">{error || 'This connector may have been removed or is unavailable.'}</p>
                </div>
                <button
                    onClick={() => router.push('/tools')}
                    className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl text-sm transition-colors"
                >
                    Back to Connectors
                </button>
            </div>
        )
    }

    return (
        <div className="min-h-screen font-sans text-text">
            <div className="max-w-5xl mx-auto px-6 py-12">
                <Link href="/tools" className="inline-flex items-center gap-2 text-text-secondary hover:text-text mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Connectors</span>
                </Link>

                {/* Header Section */}
                <div className="flex items-start gap-6 mb-10">
                    <div className="w-20 h-20 bg-surface rounded-3xl flex items-center justify-center text-4xl shadow-sm border border-surface-active">
                        {tool?.icon.startsWith('http') || tool?.icon.startsWith('/') ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={tool?.icon} alt={tool?.name} className="w-12 h-12 object-contain" />
                        ) : (
                            <span>{tool?.icon}</span>
                        )}
                    </div>
                    <div className="flex-1">
                        <div className="mb-2">
                            <h1 className="font-serif text-3xl text-text">{tool.name}</h1>
                        </div>
                        <p className="text-lg text-text-secondary font-light max-w-2xl">{tool?.description}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Stats & Info */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Stats Grid */}
                        {tool.requires_auth && (
                            <>
                                {/* Header - Outside Card */}
                                <h3 className="font-serif text-xl flex items-center gap-2 mt-8">
                                    <Shield className="w-5 h-5 text-primary" />
                                    Authentication
                                </h3>

                                <div className="bg-surface p-6 rounded-3xl border border-surface-active shadow-sm">
                                    <div className="space-y-6">
                                    {/* Connection Status Row */}
                                    <div className="flex items-center justify-between p-4 bg-surface-alt rounded-xl border border-surface-active">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${tool.is_configured ? 'bg-green-500' : 'bg-surface-active'}`} />
                                            <span className="text-text font-medium">
                                                {tool.is_configured
                                                    ? `Connected to ${tool.name}`
                                                    : `Connect your account to start using ${tool.name}`
                                                }
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => handleAuthConfigure(tool)}
                                                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-sm flex items-center gap-2 ${tool.is_configured
                                                    ? 'bg-surface-hover text-text hover:bg-surface-pressed'
                                                    : 'bg-primary hover:bg-primary/90 text-white'
                                                    }`}
                                            >
                                                <div className="w-4 h-4 flex items-center justify-center">
                                                    {tool.is_configured ? <Settings className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                                </div>
                                                {tool.is_configured ? 'Reconfigure' : 'Connect'}
                                            </button>
                                            {tool.is_configured && (
                                                <button
                                                    onClick={() => handleDisconnect(tool)}
                                                    className="px-4 py-2 rounded-lg font-medium text-sm bg-black hover:bg-[#1a1a1a] text-white transition-colors flex items-center gap-2"
                                                >
                                                    <Power className="w-3 h-3" />
                                                    Disconnect
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Token Info */}
                                    {tool.is_configured && tool.token_info && (
                                        <div className="p-3 bg-surface-alt rounded-xl border border-surface-active text-xs space-y-2">
                                            {tool.token_info.expires_at && (
                                                <div className="flex justify-between">
                                                    <span className="text-text-secondary">Expires:</span>
                                                    <span className="font-medium text-text">
                                                        {new Date(tool.token_info.expires_at).getFullYear() > 2050
                                                            ? <span className="text-red-500">Invalid date</span>
                                                            : new Date(tool.token_info.expires_at).toLocaleString()}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between">
                                                <span className="text-text-secondary">Refresh Token:</span>
                                                <span className={`font-medium ${tool.token_info.has_refresh_token ? 'text-green-600' : 'text-orange-600'}`}>
                                                    {tool.token_info.has_refresh_token ? 'Available' : 'None'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Capabilities */}
                        {tool.capabilities && tool.capabilities.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-serif text-xl flex items-center gap-2">
                                        <Zap className="w-5 h-5 text-primary" />
                                        Capabilities
                                    </h3>

                                    {tool.capabilities.length > itemsPerPage && (
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center bg-white rounded-full border border-surface-active px-1 py-1">
                                                <button
                                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    disabled={currentPage === 1}
                                                    className="p-1 rounded-full hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                                >
                                                    <ChevronLeft className="w-4 h-4 text-text-secondary" />
                                                </button>
                                                <span className="text-xs font-medium text-text-secondary px-3">
                                                    Page {currentPage} of {Math.ceil(tool.capabilities.length / itemsPerPage)}
                                                </span>
                                                <button
                                                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(tool.capabilities!.length / itemsPerPage), p + 1))}
                                                    disabled={currentPage === Math.ceil(tool.capabilities.length / itemsPerPage)}
                                                    className="p-1 rounded-full hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                                >
                                                    <ChevronRight className="w-4 h-4 text-text-secondary" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-surface p-6 rounded-3xl border border-surface-active shadow-sm">
                                    <div className="space-y-4">
                                        {tool.capabilities
                                            .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                                            .map((cap, i) => (
                                                <div key={i} className={`flex items-start gap-3 ${i !== itemsPerPage - 1 && (currentPage - 1) * itemsPerPage + i !== tool.capabilities!.length - 1 ? 'pb-4 border-b border-surface-active/60' : ''}`}>
                                                    <div className="mt-1 shrink-0">
                                                        <Check className="w-5 h-5 text-green-600" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-medium text-text">
                                                            {cap.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                                        </h4>
                                                        <p className="text-sm text-text-secondary mt-0.5">
                                                            {cap}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Available Actions & Triggers */}
                        {((actions && actions.length > 0) || (triggers && triggers.length > 0)) && (
                            <>
                                {/* Header Row - Outside Card */}
                                <div className="flex items-center justify-between mt-8">
                                    {/* Left: Heading */}
                                    <h3 className="font-serif text-xl flex items-center gap-2">
                                        <Hammer className="w-5 h-5 text-primary" />
                                        Tools
                                    </h3>

                                    {/* Right: Tab Switcher + Pagination */}
                                    <div className="flex items-center gap-3">
                                        {/* Tab Switcher - Surface background like MODIFY TOOLS */}
                                        <div className="flex items-center bg-surface rounded-[12px] p-1 border border-surface-active">
                                            <button
                                                onClick={() => handleTabChange('actions')}
                                                className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                                                    activeSection === 'actions'
                                                        ? 'bg-white text-text shadow-sm'
                                                        : 'text-text-secondary hover:text-text'
                                                }`}
                                            >
                                                Actions {actions && actions.length > 0 && `(${actions.length})`}
                                            </button>
                                            <button
                                                onClick={() => handleTabChange('triggers')}
                                                className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                                                    activeSection === 'triggers'
                                                        ? 'bg-white text-text shadow-sm'
                                                        : 'text-text-secondary hover:text-text'
                                                }`}
                                            >
                                                Triggers {triggers && triggers.length > 0 && `(${triggers.length})`}
                                            </button>
                                        </div>

                                        {/* Pagination - White background like in image */}
                                        {activeSection === 'actions' && actionsTotalPages > 1 && (
                                            <div className="flex items-center gap-2 bg-white rounded-[12px] px-3 py-1.5 border border-surface-active">
                                                <button
                                                    onClick={() => setActionsPage(p => Math.max(1, p - 1))}
                                                    disabled={actionsPage === 1}
                                                    className="text-text-secondary hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <ChevronLeft className="w-4 h-4" />
                                                </button>
                                                <span className="text-sm text-text-secondary">Page {actionsPage} of {actionsTotalPages}</span>
                                                <button
                                                    onClick={() => setActionsPage(p => Math.min(actionsTotalPages, p + 1))}
                                                    disabled={actionsPage === actionsTotalPages}
                                                    className="text-text-secondary hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                        {activeSection === 'triggers' && triggersTotalPages > 1 && (
                                            <div className="flex items-center gap-2 bg-white rounded-[12px] px-3 py-1.5 border border-surface-active">
                                                <button
                                                    onClick={() => setTriggersPage(p => Math.max(1, p - 1))}
                                                    disabled={triggersPage === 1}
                                                    className="text-text-secondary hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <ChevronLeft className="w-4 h-4" />
                                                </button>
                                                <span className="text-sm text-text-secondary">Page {triggersPage} of {triggersTotalPages}</span>
                                                <button
                                                    onClick={() => setTriggersPage(p => Math.min(triggersTotalPages, p + 1))}
                                                    disabled={triggersPage === triggersTotalPages}
                                                    className="text-text-secondary hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Content Card */}
                                <div className="bg-surface p-6 rounded-3xl border border-surface-active shadow-sm">

                                {/* Actions Section */}
                                {activeSection === 'actions' && (
                                    <div className="space-y-4">
                                        {actionsLoading ? (
                                            <div className="flex items-center justify-center py-8">
                                                <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
                                            </div>
                                        ) : paginatedActions.length > 0 ? (
                                            paginatedActions.map((action, i) => (
                                                <div key={action.key} className={`flex items-start gap-3 ${i !== paginatedActions.length - 1 ? 'pb-4 border-b border-surface-active/60' : ''}`}>
                                                    <div className="mt-1 shrink-0">
                                                        <Check className="w-5 h-5 text-green-600" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-medium text-text">{action.name}</h4>
                                                        <p className="text-sm text-text-secondary mt-0.5">{action.description}</p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-text-secondary text-center py-8">No actions available for this tool</p>
                                        )}
                                    </div>
                                )}

                                {/* Triggers Section */}
                                {activeSection === 'triggers' && (
                                    <div className="space-y-4">
                                        {triggersLoading ? (
                                            <div className="flex items-center justify-center py-8">
                                                <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
                                            </div>
                                        ) : paginatedTriggers.length > 0 ? (
                                            paginatedTriggers.map((trigger, i) => (
                                                <div key={trigger.key} className={`flex items-start gap-3 ${i !== paginatedTriggers.length - 1 ? 'pb-4 border-b border-surface-active/60' : ''}`}>
                                                    <div className="mt-1 shrink-0">
                                                        <Activity className="w-5 h-5 text-primary" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-medium text-text">{trigger.name}</h4>
                                                        <p className="text-sm text-text-secondary mt-0.5">{trigger.description}</p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-text-secondary text-center py-8">No triggers available for this tool</p>
                                        )}
                                    </div>
                                )}
                                </div>
                            </>
                        )}

                        {/* Configuration */}
                        {tool.configuration && Object.keys(tool.configuration).length > 0 && (
                            <div className="bg-surface p-6 rounded-3xl border border-surface-active shadow-sm">
                                <h3 className="font-serif text-xl mb-4 flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-primary" />
                                    Configuration
                                </h3>
                                <pre className="bg-surface p-4 rounded-xl text-xs text-text-secondary overflow-x-auto font-mono">
                                    {JSON.stringify(tool.configuration, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                    {/* Right Column: Details */}
                    <div className="space-y-6">
                        {/* Details Header - Aligned with Authentication header */}
                        <h3 className="font-serif text-xl flex items-center gap-2 mt-8">
                            <Activity className="w-5 h-5 text-primary" />
                            Details
                        </h3>

                        {/* Details Card */}
                        <div className="bg-surface p-6 rounded-3xl border border-surface-active shadow-sm">
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between py-2">
                                    <span className="text-text-secondary">Provider</span>
                                    <span className="font-medium text-text capitalize">{tool.provider || 'System'}</span>
                                </div>

                                <div className="flex justify-between py-2">
                                    <span className="text-text-secondary">Last Used</span>
                                    <span className="font-medium text-text">
                                        {stats?.last_used_at
                                            ? new Date(stats.last_used_at).toLocaleDateString()
                                            : 'Never'
                                        }
                                    </span>
                                </div>

                                <div className="flex justify-between py-2">
                                    <span className="text-text-secondary">Total Runs</span>
                                    <span className="font-medium text-text">{stats?.total_runs ?? 0}</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}
