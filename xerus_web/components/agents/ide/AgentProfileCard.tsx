'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Pencil, Globe, Lock } from 'lucide-react'
import { ModelIcon } from '../AgentAvatar'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '../MascotAvatar'
import { useAuth } from '@/utils/AuthContext'
import { canEditAgent } from '@/utils/agentLabels'
import { formatModelName } from '@/utils/models'
import { getFeaturedModels, type ModelEntry } from '@/lib/api/models'
import { getCliAuthStatus, type CliAuthStatus } from '@/lib/api/user'
import type { AdapterType } from '@/lib/api/types'

interface Agent {
    id: number
    name: string
    description: string
    model?: string
    role?: string
    category?: string
    status?: string
    is_active?: boolean
    avatar?: string
    avatarUrl?: string | null
    agentType?: 'public' | 'private' | 'shared'
    userId?: string | null
    isVerified?: boolean
    cloneCount?: number
    tags?: string[]
    adapter_type?: AdapterType
}

interface AgentProfileCardProps {
    agent: Agent
    onUpdate: (updates: Record<string, unknown>) => Promise<void>
    isSaving?: boolean
}

export function AgentProfileCard({ agent, onUpdate, isSaving }: AgentProfileCardProps) {
    const { user } = useAuth()
    const [localAgent, setLocalAgent] = useState(agent)
    const [isEditingName, setIsEditingName] = useState(false)
    const [isEditingDesc, setIsEditingDesc] = useState(false)
    const [models, setModels] = useState<ModelEntry[]>([])
    const [isLoadingModels, setIsLoadingModels] = useState(true)
    const [cliAuth, setCliAuth] = useState<CliAuthStatus | null>(null)
    const nameInputRef = useRef<HTMLInputElement>(null)
    const descInputRef = useRef<HTMLTextAreaElement>(null)

    // Check if user can edit this agent
    const isEditable = canEditAgent(agent.userId, user?.uid, agent.agentType)
    const isPublic = agent.agentType === 'public'

    useEffect(() => {
        setLocalAgent(agent)
    }, [agent])

    useEffect(() => {
        let cancelled = false
        getFeaturedModels()
            .then(data => { if (!cancelled) setModels(data) })
            .catch(() => { /* models fetch failed — fallback list used */ })
            .finally(() => { if (!cancelled) setIsLoadingModels(false) })
        getCliAuthStatus()
            .then(data => { if (!cancelled) setCliAuth(data) })
            .catch(() => { /* auth status fetch failed — buttons hidden */ })
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (isEditingName && nameInputRef.current) {
            nameInputRef.current.focus()
        }
    }, [isEditingName])

    useEffect(() => {
        if (isEditingDesc && descInputRef.current) {
            descInputRef.current.focus()
        }
    }, [isEditingDesc])

    const handleChange = (field: keyof Agent, value: Agent[keyof Agent]) => {
        setLocalAgent(prev => ({ ...prev, [field]: value }))
    }

    const handleBlur = async (field: keyof Agent) => {
        if (field === 'name') setIsEditingName(false)
        if (field === 'description') setIsEditingDesc(false)

        if (localAgent[field] !== agent[field]) {
            await onUpdate({ [field]: localAgent[field] })
        }
    }

    const handleModelChange = async (value: string) => {
        handleChange('model', value)
        await onUpdate({ ai_model: value })
    }

    const handleAdapterTypeChange = async (value: string) => {
        const adapterType = value as AdapterType
        setLocalAgent(prev => ({ ...prev, adapter_type: adapterType }))
        await onUpdate({ adapter_type: adapterType })
    }

    // Filter models based on adapter_type
    const filteredModels = models.filter((m) => {
        const adapterType = localAgent.adapter_type || 'claudecode'
        if (adapterType === 'claudecode') {
            return m.provider === 'anthropic' || m.provider === 'openrouter'
        }
        if (adapterType === 'codex') {
            return m.provider === 'openai' || m.provider === 'openrouter'
        }
        return true
    })

    return (
        <div className="flex items-start gap-6">
            {/* Icon Box with Model Badge - matches AgentCard layout */}
            <div className="relative pb-3 shrink-0">
                <div className="w-20 h-20 bg-surface rounded-[24px] flex items-center justify-center shadow-sm border border-surface-active overflow-hidden">
                    {isMascotConfig(agent.avatarUrl) ? (
                        <MascotAvatar config={agent.avatarUrl!} size={80} className="w-full h-full" alt={agent.name} />
                    ) : agent.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
                    ) : (
                        <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/90 text-white font-semibold text-2xl">
                            {agent.name.charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>
                {/* Model Badge - positioned below avatar */}
                {localAgent.model && (
                    isEditable ? (
                        <Select value={localAgent.model} onValueChange={handleModelChange}>
                            <SelectTrigger className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-auto px-2 py-0.5 bg-white border border-surface-active rounded-md shadow-sm focus:ring-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:bg-surface-hover transition-colors w-auto gap-1 z-10">
                                <div className="flex items-center gap-1">
                                    <ModelIcon model={localAgent.model} size="sm" />
                                    <span className="text-[10px] font-bold text-text-secondary whitespace-nowrap">{formatModelName(localAgent.model)}</span>
                                </div>
                            </SelectTrigger>
                            <SelectContent className="bg-white border border-surface-active rounded-md shadow-lg min-w-[200px]">
                                {isLoadingModels ? (
                                    <SelectItem value="__loading" disabled>
                                        <span className="text-xs text-text-secondary">Loading models...</span>
                                    </SelectItem>
                                ) : filteredModels.length === 0 ? (
                                    <SelectItem value="__empty" disabled>
                                        <span className="text-xs text-text-secondary">No models available</span>
                                    </SelectItem>
                                ) : (
                                    filteredModels.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            <div className="flex items-center gap-1.5">
                                                <ModelIcon model={m.id} size="sm" />
                                                <span className="text-xs">{m.displayName.replace(/^[^:]+:\s*/, '')}</span>
                                            </div>
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    ) : (
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-auto px-2 py-0.5 bg-white border border-surface-active rounded-md shadow-sm flex items-center gap-1 z-10">
                            <ModelIcon model={localAgent.model} size="sm" />
                            <span className="text-[10px] font-bold text-text-secondary whitespace-nowrap">{formatModelName(localAgent.model)}</span>
                        </div>
                    )
                )}
            </div>

            {/* Content - shifted right to avoid model badge overlap */}
            <div className="flex-1 min-w-0 ml-6">
                {/* Adapter Type Selector + Auth Status */}
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Type</span>
                    {isEditable ? (
                        <Select value={localAgent.adapter_type || 'claudecode'} onValueChange={handleAdapterTypeChange}>
                            <SelectTrigger className="h-7 w-[140px] text-xs bg-white border border-surface-active rounded-md shadow-sm focus:ring-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white border border-surface-active rounded-md shadow-lg">
                                <SelectItem value="claudecode">
                                    <span className="text-xs">Claude Code</span>
                                </SelectItem>
                                <SelectItem value="codex">
                                    <span className="text-xs">Codex</span>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    ) : (
                        <span className="text-xs text-text-secondary">
                            {localAgent.adapter_type === 'codex' ? 'Codex' : 'Claude Code'}
                        </span>
                    )}
                    {cliAuth && (() => {
                        const adapterKey = (localAgent.adapter_type || 'claudecode') as keyof CliAuthStatus
                        const status = cliAuth[adapterKey]
                        if (!status) return null
                        const isConnected = status.authenticated && status.method !== 'platform'
                        return isConnected ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-md">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                                Connected
                            </span>
                        ) : (
                            <button
                                onClick={() => window.open('/settings/api-keys', '_blank')}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors"
                            >
                                Connect {adapterKey === 'codex' ? 'Codex' : 'Claude Code'}
                            </button>
                        )
                    })()}
                </div>

                {/* Name & Status Row */}
                <div className="flex items-center gap-3 mb-2">
                    {isEditingName && isEditable ? (
                        <Input
                            ref={nameInputRef}
                            value={localAgent.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            onBlur={() => handleBlur('name')}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleBlur('name')
                            }}
                            data-testid="agent-name-input"
                            className="font-serif !text-3xl text-text bg-transparent border-none shadow-none !h-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none placeholder:text-text-secondary/50 w-auto min-w-[280px] p-0"
                            placeholder="Agent Name"
                        />
                    ) : (
                        <div className="flex items-center gap-2">
                            <h1
                                onClick={() => isEditable && setIsEditingName(true)}
                                className={`font-serif text-3xl text-text ${isEditable ? 'cursor-text hover:text-text/80' : ''} transition-colors`}
                            >
                                {localAgent.name}
                            </h1>
                            {/* Verified Badge - small orange circle with checkmark */}
                            {agent.isVerified && (
                                <span className="shrink-0 w-4 h-4 bg-primary rounded-full flex items-center justify-center" title="Verified">
                                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                </span>
                            )}
                            {isEditable && (
                                <button
                                    onClick={() => setIsEditingName(true)}
                                    className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-primary transition-colors"
                                    title="Edit name"
                                >
                                    <Pencil className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Visibility Badge - matching AgentCard CSS */}
                    <div className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border text-text-secondary bg-surface-alt border-surface-active">
                        {isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        <span className="capitalize">{agent.agentType || 'public'}</span>
                    </div>
                </div>

                {/* Description */}
                <div className="mb-3">
                    {isEditingDesc && isEditable ? (
                        <Textarea
                            ref={descInputRef}
                            value={localAgent.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            onBlur={() => handleBlur('description')}
                            className="text-base text-text-secondary bg-transparent border-none shadow-none p-0 min-h-[24px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none resize-none leading-relaxed w-full placeholder:text-text-secondary/50"
                            placeholder="Add a description..."
                            rows={1}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = `${target.scrollHeight}px`;
                            }}
                        />
                    ) : (
                        <div className="flex items-start gap-2">
                            <p
                                onClick={() => isEditable && setIsEditingDesc(true)}
                                className={`text-base text-text-secondary leading-relaxed ${isEditable ? 'cursor-text hover:text-text-secondary/80' : ''} transition-colors flex-1`}
                            >
                                {localAgent.description || (isEditable ? "Add a description..." : "No description")}
                            </p>
                            {isEditable && (
                                <button
                                    onClick={() => setIsEditingDesc(true)}
                                    className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-primary transition-colors shrink-0"
                                    title="Edit description"
                                >
                                    <Pencil className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

