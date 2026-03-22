'use client'

import React, { useCallback, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
    Sparkles,
    X,
    Minus,
    ArrowUp,
    Pencil,
    Eye,
    Lock,
    Loader2,
    Plus
} from 'lucide-react'
import { Button } from "@/components/ui/button"
import { FloatingPanel } from "@/components/common/FloatingPanel"
import { cn } from '@/lib/utils'
import { useAuth } from "@/utils/AuthContext"
import { canEditAgent } from "@/utils/agentLabels"
import { formatPrompt, cloneAgent, addToolToAgent, removeToolFromAgent, addAgentKnowledgeBase, removeAgentKnowledgeBase } from "@/lib/api"
import { slugify } from "@/utils/slugify"
import { useSearchableTools, useToolLookup } from "@/hooks/useTools"
import { useToolAuth } from "@/hooks/useToolAuth"
import { Tool } from "@/types/tool"
import { toast } from 'sonner'
import { convertPromptToMarkdown, getPromptPreview, PROMPT_PLACEHOLDER } from './prompt-utils'
import { KnowledgeBaseSection } from './KnowledgeBaseSection'
import { ConnectorsSection } from './ConnectorsSection'
import { ToolSelectorPanel } from './ToolSelectorPanel'

interface StandardEditorProps {
    agent: any
    availableDocuments: any[]
    onUpdate: (updates: any) => void
    onRefresh?: () => Promise<void>
}

export function StandardEditor({
    agent,
    availableDocuments,
    onUpdate,
    onRefresh
}: StandardEditorProps) {
    const router = useRouter()
    const { user } = useAuth()
    const [searchQuery, setSearchQuery] = useState('')
    const [isPromptSheetOpen, setIsPromptSheetOpen] = useState(false)
    const [isToolPanelOpen, setIsToolPanelOpen] = useState(false)
    const [tempPrompt, setTempPrompt] = useState('')
    const [mode, setMode] = useState<'view' | 'edit'>('edit')
    const [isFormatting, setIsFormatting] = useState(false)
    const [isCloning, setIsCloning] = useState(false)
    const [toolLoading, setToolLoading] = useState<string | null>(null)
    const agentToolSlugs = useMemo(() => (agent.tools || [])
        .filter((t: any) => t != null)
        .map((t: any) => t.name_slug || (typeof t === 'string' ? t : t.app_slug)), [agent.tools])
    const agentTools = useMemo(() => (agent.tools || []).filter((t: any) => t != null), [agent.tools])

    const {
        tools: availableToolResults,
        loading: toolsLoading,
        refetch: refetchSearchTools,
        totalTools,
        hasMore: toolsHasMore,
    } = useSearchableTools(searchQuery)
    const {
        tools: agentToolDetails,
        refetch: refetchToolDetails,
    } = useToolLookup(agentToolSlugs)

    const refetchTools = useCallback(() => {
        refetchSearchTools()
        refetchToolDetails()
    }, [refetchSearchTools, refetchToolDetails])

    const {
        configuringAuth,
        handleAuthConfigure,
        handleDisconnect
    } = useToolAuth(refetchTools)

    const isEditable = canEditAgent(agent.userId, user?.uid, agent.agentType)

    const handleWriteWithAI = async () => {
        if (!tempPrompt.trim()) {
            toast.error('Add some text first')
            return
        }

        setIsFormatting(true)
        try {
            const result = await formatPrompt(tempPrompt)
            setTempPrompt(result.system_prompt)
        } catch (error) {
            console.error('Failed to format prompt:', error)
        } finally {
            setIsFormatting(false)
        }
    }

    const handleClone = async () => {
        if (!agent?.id) return

        setIsCloning(true)
        try {
            const result = await cloneAgent(Number(agent.id))
            if (result.success && result.agent) {
                router.push(`/ai-agents/${result.agent.id}/${slugify(result.agent.name || '')}`)
            }
        } catch (error) {
            console.error('Failed to clone agent:', error)
        } finally {
            setIsCloning(false)
        }
    }

    const handleAddTool = async (toolSlug: string) => {
        const currentTools = agent.tools || []
        const toolSlugs = currentTools.map((t: any) => typeof t === 'string' ? t : t.app_slug || t.name_slug)
        if (toolSlugs.includes(toolSlug)) return

        setToolLoading(toolSlug)
        try {
            await addToolToAgent(Number(agent.id), toolSlug)
            if (onRefresh) await onRefresh()
        } catch (error) {
            console.error('Failed to add tool:', error)
        } finally {
            setToolLoading(null)
        }
    }

    const handleRemoveTool = async (toolSlug: string) => {
        setToolLoading(toolSlug)
        try {
            await removeToolFromAgent(Number(agent.id), toolSlug)
            if (onRefresh) await onRefresh()
        } catch (error) {
            console.error('Failed to remove tool:', error)
        } finally {
            setToolLoading(null)
        }
    }

    const handleManageTool = (toolId: string) => {
        router.push(`/tools/${toolId}`)
    }

    const handleConnectTool = async (tool: Tool) => {
        await handleAuthConfigure(tool)
    }

    const handleDisconnectTool = async (tool: Tool) => {
        await handleDisconnect(tool)
    }

    // --- KB Handlers ---
    const handleAddKb = async (docId: string, docTitle: string) => {
        await addAgentKnowledgeBase(Number(agent.id), docId, docTitle)
        if (onRefresh) await onRefresh()
    }

    const handleRemoveKb = async (docId: string) => {
        await removeAgentKnowledgeBase(Number(agent.id), docId)
        if (onRefresh) await onRefresh()
    }

    // --- Derived Data ---
    const kbIds = agent.knowledgeBase || agent.knowledge_base || []
    const agentDocs = (availableDocuments || []).filter((d: any) => kbIds.includes(d.id))

    const availableToolsList = useMemo(() => {
        return availableToolResults.filter(t => {
            const toolSlug = t.tool_name || t.id
            if (agentToolSlugs.includes(toolSlug)) return false
            return true
        })
    }, [availableToolResults, agentToolSlugs])

    const enrichedAgentTools = useMemo(() => {
        return agentTools.map((agentTool: any) => {
            const toolSlug = agentTool.name_slug || (typeof agentTool === 'string' ? agentTool : agentTool.app_slug)
            const fullToolData = agentToolDetails.find(t => t.tool_name === toolSlug || t.id === toolSlug)
            return fullToolData || agentTool
        })
    }, [agentToolDetails, agentTools])


    return (
        <div className="flex flex-col gap-6">

            {/* Section 1: System Prompt */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                    <Sparkles className="w-6 h-6 text-[#FF6600]" />
                    <h3 className="text-2xl font-serif text-text">Agent prompt</h3>
                </div>

                <div className="bg-surface rounded-[24px] border border-surface-active shadow-sm p-4">
                    <div className="bg-surface-alt rounded-xl border border-surface-active px-5 py-4 flex items-center gap-4">
                        <div
                            className="flex-1 cursor-pointer group"
                            onClick={() => {
                                setTempPrompt(convertPromptToMarkdown(agent.system_prompt || agent.prompt))
                                setIsPromptSheetOpen(true)
                            }}
                        >
                            <p className={`text-sm leading-relaxed ${!getPromptPreview(agent.system_prompt || agent.prompt) ? 'text-text-secondary italic' : 'text-text font-medium'} line-clamp-2`}>
                                {getPromptPreview(agent.system_prompt || agent.prompt) || "You are a helpful assistant that answers questions based on the provided knowledge base..."}
                            </p>
                        </div>
                        {isEditable ? (
                            <Button
                                variant="ghost"
                                className="h-9 px-4 bg-surface-hover hover:bg-surface-pressed rounded-xl text-text flex items-center gap-2 shrink-0"
                                onClick={() => {
                                    setTempPrompt(convertPromptToMarkdown(agent.system_prompt || agent.prompt))
                                    setIsPromptSheetOpen(true)
                                }}
                            >
                                <Pencil className="w-3.5 h-3.5" />
                                <span className="text-sm font-medium">Edit</span>
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                className="h-9 px-4 bg-surface-hover rounded-xl text-text-secondary flex items-center gap-2 shrink-0 cursor-default"
                                onClick={() => {
                                    setTempPrompt(convertPromptToMarkdown(agent.system_prompt || agent.prompt))
                                    setMode('view')
                                    setIsPromptSheetOpen(true)
                                }}
                            >
                                <Lock className="w-3.5 h-3.5" />
                                <span className="text-sm font-medium">View Only</span>
                            </Button>
                        )}
                    </div>
                </div>

                <FloatingPanel
                    isOpen={isPromptSheetOpen}
                    onClose={() => setIsPromptSheetOpen(false)}
                    title="System Prompt"
                    minimizedTitle="System Prompt"
                    icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4"><path d="M3.08496 13.0836V6.91665C3.08496 6.22756 3.08431 5.6706 3.12109 5.22036C3.15851 4.76257 3.23788 4.35674 3.42969 3.98013L3.55176 3.76138C3.85585 3.26566 4.29244 2.86182 4.81348 2.59634L4.95606 2.52993C5.29235 2.38569 5.65306 2.32048 6.05371 2.28774C6.50395 2.25096 7.06091 2.25161 7.75 2.25161H11.2598C11.8396 2.25161 12.2381 2.24778 12.6201 2.3395L12.8594 2.40688C13.0957 2.48369 13.3228 2.58827 13.5352 2.71841L13.6582 2.79848C13.9416 2.99612 14.1998 3.25902 14.5586 3.61782L15.5488 4.60806L15.833 4.89419C16.0956 5.16112 16.2943 5.38037 16.4482 5.63149L16.5703 5.84927C16.683 6.07051 16.769 6.30456 16.8271 6.54653L16.8574 6.69106C16.9181 7.03117 16.915 7.39954 16.915 7.90688V13.0836C16.915 13.7726 16.9157 14.3298 16.8789 14.7799C16.8461 15.1806 16.781 15.5413 16.6367 15.8776L16.5703 16.0202C16.3049 16.5411 15.9009 16.9768 15.4053 17.2809L15.1865 17.403C14.8098 17.5949 14.4042 17.6741 13.9463 17.7116C13.496 17.7484 12.9391 17.7487 12.25 17.7487H7.75C7.06091 17.7487 6.50395 17.7484 6.05371 17.7116C5.65313 17.6788 5.2923 17.6146 4.95606 17.4704L4.81348 17.403C4.29228 17.1374 3.85587 16.7339 3.55176 16.2379L3.42969 16.0202C3.23783 15.6436 3.15853 15.2377 3.12109 14.7799C3.08431 14.3298 3.08496 13.7726 3.08496 13.0836ZM10.833 11.0016L10.9678 11.0153C11.2706 11.0775 11.498 11.3454 11.498 11.6666C11.498 11.9879 11.2706 12.2558 10.9678 12.318L10.833 12.3317H7.5C7.13273 12.3317 6.83496 12.0339 6.83496 11.6666C6.83496 11.2994 7.13273 11.0016 7.5 11.0016H10.833ZM12.5 7.6686L12.6338 7.68227C12.9369 7.74423 13.165 8.01223 13.165 8.33364C13.1649 8.65495 12.9368 8.92312 12.6338 8.98501L12.5 8.99868H7.5C7.13284 8.99868 6.83514 8.70076 6.83496 8.33364C6.83496 7.96637 7.13273 7.6686 7.5 7.6686H12.5ZM4.41504 13.0836C4.41504 13.7945 4.41594 14.2881 4.44727 14.6715C4.47797 15.047 4.53475 15.2587 4.61524 15.4166L4.68555 15.5426C4.86186 15.8302 5.1148 16.0644 5.41699 16.2184L5.54688 16.2741C5.69066 16.3255 5.8801 16.3633 6.16211 16.3864C6.54563 16.4177 7.03896 16.4186 7.75 16.4186H12.25C12.961 16.4186 13.4544 16.4177 13.8379 16.3864C14.2135 16.3557 14.425 16.2989 14.583 16.2184L14.709 16.1471C14.9964 15.9709 15.2308 15.7187 15.3848 15.4166L15.4414 15.2858C15.4927 15.1422 15.5297 14.9528 15.5527 14.6715C15.5841 14.2881 15.585 13.7945 15.585 13.0836V7.90688C15.585 7.42455 15.5823 7.18404 15.5615 7.01235L15.5342 6.85708C15.5005 6.71671 15.4501 6.58111 15.3848 6.45278L15.3145 6.32681C15.2625 6.24199 15.1996 6.16112 15.0928 6.04458L14.6084 5.54848L13.6182 4.55825C13.2768 4.21691 13.1049 4.04873 12.9688 3.94204L12.8398 3.8522C12.7167 3.77673 12.5853 3.71606 12.4482 3.67153L12.3096 3.63247C12.1162 3.58604 11.9029 3.58169 11.2598 3.58169H7.75C7.03896 3.58169 6.54563 3.58258 6.16211 3.61391C5.88025 3.63695 5.69063 3.6738 5.54688 3.72524L5.41699 3.78188C5.11474 3.9359 4.86186 4.17003 4.68555 4.45766L4.61524 4.58364C4.53473 4.74165 4.47797 4.95305 4.44727 5.32876C4.41593 5.71228 4.41504 6.20561 4.41504 6.91665V13.0836Z"></path></svg>}
                    className="w-[600px] h-[600px] rounded-[40px] shadow-sm bg-surface p-2"
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
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            minimize()
                                        }}
                                        className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors"
                                        aria-label="Minimize"
                                    >
                                        <Minus className="w-4 h-4 text-text" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    {mode === 'edit' && (
                                        <span className="text-sm font-bold text-text">Drafts</span>
                                    )}
                                </div>
                            </div>

                            {/* Content */}
                            <textarea
                                value={tempPrompt}
                                onChange={(e) => setTempPrompt(e.target.value)}
                                placeholder={PROMPT_PLACEHOLDER}
                                className="flex-1 w-full resize-none outline-none text-sm text-text placeholder:text-[#9CA3AF] placeholder:whitespace-pre-wrap font-sans bg-transparent leading-relaxed"
                                autoFocus
                                readOnly={!isEditable || mode === 'view'}
                            />

                            {/* Read-only notice for system templates */}
                            {!isEditable && (
                                <div className="flex items-center justify-between gap-3 p-4 bg-[#FF6600]/5 border border-[#FF6600]/20 rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-[#FF6600]/10 flex items-center justify-center">
                                            <Lock className="w-4 h-4 text-[#FF6600]" />
                                        </div>
                                        <span className="text-sm text-text">This is a read-only template. Clone this agent to customize it.</span>
                                    </div>
                                    <button
                                        onClick={handleClone}
                                        disabled={isCloning}
                                        className="flex items-center gap-2 px-4 py-2 bg-[#FF6600] hover:bg-[#E65C00] text-white font-medium rounded-xl text-sm transition-colors disabled:opacity-50 shrink-0 shadow-sm"
                                    >
                                        {isCloning ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Plus className="w-4 h-4" />
                                        )}
                                        Clone
                                    </button>
                                </div>
                            )}

                            {/* Footer Toolbar */}
                            <div className="mt-6 p-1.5 rounded-[20px] border border-surface-active bg-white flex items-center justify-between shadow-sm shrink-0">
                                <div className="flex items-center gap-2">
                                    {isEditable && mode === 'edit' && (
                                        <button
                                            onClick={handleWriteWithAI}
                                            disabled={isFormatting}
                                            className={cn(
                                                "h-9 px-3 hover:bg-surface rounded-[12px] flex items-center gap-2 transition-colors text-text font-medium text-sm",
                                                isFormatting && "opacity-50 cursor-not-allowed"
                                            )}
                                            title="Format prompt with AI"
                                        >
                                            <Sparkles className={cn("w-4 h-4", isFormatting && "animate-spin")} />
                                            {isFormatting ? 'Formatting...' : 'Write with AI'}
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center bg-surface rounded-[14px] p-1">
                                    <button
                                        onClick={() => setMode('view')}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all",
                                            mode === 'view' ? "bg-white shadow-sm text-text" : "text-text-secondary hover:text-text"
                                        )}
                                    >
                                        <Eye className="w-3.5 h-3.5" />
                                        View
                                    </button>
                                    {isEditable && (
                                        <button
                                            onClick={() => setMode('edit')}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all",
                                                mode === 'edit' ? "bg-white shadow-sm text-text" : "text-text-secondary hover:text-text"
                                            )}
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            Edit
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    {isEditable ? (
                                        <button
                                            onClick={() => {
                                                onUpdate({ system_prompt: tempPrompt })
                                                setIsPromptSheetOpen(false)
                                            }}
                                            className="w-9 h-9 bg-text text-white rounded-[12px] flex items-center justify-center hover:bg-[#FF6600] transition-colors shadow-md"
                                            aria-label="Save"
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setIsPromptSheetOpen(false)}
                                            className="h-9 px-4 bg-surface hover:bg-surface-active rounded-[12px] text-text text-sm font-medium transition-colors"
                                        >
                                            Close
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div >
                    )
                    }
                </FloatingPanel >
            </div >

            {/* Section 2: Knowledge Base */}
            <KnowledgeBaseSection
                agentId={Number(agent.id)}
                agentDocs={agentDocs}
                availableDocuments={availableDocuments}
                isEditable={isEditable}
                onAddKb={handleAddKb}
                onRemoveKb={handleRemoveKb}
            />

            {/* Section 3: Connectors */}
            <ConnectorsSection
                agentTools={agentTools}
                enrichedAgentTools={enrichedAgentTools}
                isEditable={isEditable}
                isCloning={isCloning}
                toolLoading={toolLoading}
                configuringAuth={configuringAuth}
                onOpenToolPanel={() => setIsToolPanelOpen(true)}
                onManageTool={handleManageTool}
                onConnectTool={handleConnectTool}
                onDisconnectTool={handleDisconnectTool}
                onRemoveTool={handleRemoveTool}
                onClone={handleClone}
            />

            <ToolSelectorPanel
                isOpen={isToolPanelOpen}
                onClose={() => setIsToolPanelOpen(false)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                availableToolsList={availableToolsList}
                totalTools={totalTools}
                toolsLoading={toolsLoading}
                toolsHasMore={toolsHasMore}
                agentToolSlugs={agentToolSlugs}
                isEditable={isEditable}
                isCloning={isCloning}
                toolLoading={toolLoading}
                configuringAuth={configuringAuth}
                onAddTool={handleAddTool}
                onRemoveTool={handleRemoveTool}
                onManageTool={handleManageTool}
                onConnectTool={handleConnectTool}
                onDisconnectTool={handleDisconnectTool}
                onClone={handleClone}
            />

        </div >
    )
}
