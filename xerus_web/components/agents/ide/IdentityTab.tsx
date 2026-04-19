'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiCall } from '@/lib/api/client'
import { batchReadAgentFiles } from '@/lib/api/workspace'
import { formatPrompt, cloneAgent } from '@/lib/api/agents'
import { addToolToAgent, removeToolFromAgent } from '@/lib/api/tools'
import { addAgentKnowledgeBase, removeAgentKnowledgeBase } from '@/lib/api/agent-kb'
import { slugify } from "@/utils/slugify"
import { useAuth } from "@/utils/AuthContext"
import { useSearchableTools, useToolLookup } from "@/hooks/useTools"
import { useToolAuth } from "@/hooks/useToolAuth"
import { Tool } from "@/types/tool"
import { toast } from '@/lib/toast'
import { isTemplateContent } from './FileCard'
import { SchedulesCard } from './SchedulesCard'
import { AgentChannelsCard } from './AgentChannelsCard'
import { AgentFilesSection } from './AgentFilesSection'
import { FileEditorPanel } from './FileEditorPanel'
import { KnowledgeBaseSection } from './KnowledgeBaseSection'
import { ConnectorsSection } from './ConnectorsSection'
import { ToolSelectorPanel } from './ToolSelectorPanel'
import { convertPromptToMarkdown } from './prompt-utils'

const SOUL_FILES = [
  {
    fileName: 'SOUL.md', label: 'Soul', description: 'Personality, voice, and character',
    placeholder: `# Soul

## Character
The archetype. What characters or traits it embodies. The core personality that stays consistent.

## Tone
Default tone. The spectrum from formal to casual, warm to professional, playful to serious. How tone shifts by context.

## Emotional Texture
How interactions should feel. The relationship dynamic. How much personality vs pure utility. Whether it has opinions and how it expresses them.

## Voice
How it sounds. Sentence patterns. Vocabulary level. Phrases it uses. Phrases it never uses. Whether it mirrors the operator's style.

## Humor
Role of levity. What kind of humor works. When to be funny. When to stay serious.

## Context Modes
How personality adapts. Professional mode. Casual mode. How it reads the room. Energy matching vs consistent presence.

## Anti-Patterns
What never sounds right. Tones to avoid. Phrases that break immersion. Behaviors that feel like generic AI.`,
  },
  {
    fileName: 'USER.md', label: 'User Knowledge', description: 'Operator profile and preferences',
    placeholder: `# User Knowledge

## Identity
Who the operator is. Background. Solo operator, brand, or ecosystem and how the pieces connect.

## Communication Preferences
Their style. Channels that overwhelm them. How they want to be talked to.

## Work Patterns
How they think, decide, prioritize. When they're sharp. When they crash. What drains vs recharges them.

## Key Context
Persistent knowledge that can never be lost. Key decisions, evolving preferences, important history.`,
  },
] as const

interface FileData {
  content: string | null
  isTemplate: boolean
}

interface AgentKbDoc {
  knowledge_base_id: string
  kb_name: string
  access_mode: string
  added_at: string
}

interface IdentityTabProps {
  agent: any
  isEditable: boolean
  isMarketplace?: boolean
  availableDocuments: any[]
  agentKbDocs?: AgentKbDoc[]
  onUpdate: (updates: any) => void
  onRefresh?: () => Promise<void>
  schedules: any[]
  onNavigateToSchedules: () => void
}

export function IdentityTab({
  agent,
  isEditable,
  isMarketplace = false,
  availableDocuments,
  agentKbDocs = [],
  onUpdate,
  onRefresh,
  schedules,
  onNavigateToSchedules,
}: IdentityTabProps) {
  const router = useRouter()
  const { user } = useAuth()

  // --- Soul Files State ---
  const [files, setFiles] = useState<Record<string, FileData>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isAgentRunning, setIsAgentRunning] = useState(false)

  // --- Prompt State ---
  const [isPromptSheetOpen, setIsPromptSheetOpen] = useState(false)
  const [tempPrompt, setTempPrompt] = useState('')
  const [mode, setMode] = useState<'view' | 'edit'>('edit')
  const [isFormatting, setIsFormatting] = useState(false)
  const [isCloning, setIsCloning] = useState(false)

  // --- Tool State ---
  const [searchQuery, setSearchQuery] = useState('')
  const [isToolPanelOpen, setIsToolPanelOpen] = useState(false)
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

  const agentSlug = agent.slug || agent.name?.toLowerCase().replace(/\s+/g, '-') || String(agent.id)

  // --- Soul Files ---
  const loadFiles = useCallback(async () => {
    setIsLoading(true)
    const fileData: Record<string, FileData> = {}

    if (isMarketplace) {
      // Marketplace agents don't have execution workspace entries —
      // soul files don't exist until cloned. Show empty/template state.
      for (const file of SOUL_FILES) {
        fileData[file.fileName] = { content: null, isTemplate: false }
      }
      setIsAgentRunning(false)
    } else {
      try {
        const fileNames = SOUL_FILES.map(f => f.fileName)
        const result = await batchReadAgentFiles(agentSlug, fileNames)
        setIsAgentRunning(result.isRunning)

        for (const file of SOUL_FILES) {
          const content = result.files[file.fileName] ?? null
          fileData[file.fileName] = {
            content,
            isTemplate: content ? isTemplateContent(content) : false,
          }
        }
      } catch {
        for (const file of SOUL_FILES) {
          fileData[file.fileName] = { content: null, isTemplate: false }
        }
      }
    }

    setFiles(fileData)
    setIsLoading(false)
  }, [agentSlug, isMarketplace])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleSave = async () => {
    if (!activeFile) return
    if (isAgentRunning) {
      toast.warning('Your agent is currently running', { description: 'Changes may be overwritten until it finishes.' })
    }

    setIsSaving(true)
    try {
      await apiCall(
        `/execute/agents/${agentSlug}/files/${activeFile}`,
        {
          method: 'PUT',
          body: JSON.stringify({ content: editContent }),
        }
      )
      setFiles(prev => ({
        ...prev,
        [activeFile]: {
          content: editContent,
          isTemplate: isTemplateContent(editContent),
        },
      }))
      setEditorOpen(false)
      setActiveFile(null)
    } catch {
      // API layer handles error toast
    } finally {
      setIsSaving(false)
    }
  }

  // --- Prompt Handlers ---
  const handleWriteWithAI = async () => {
    const content = activeFile ? editContent : tempPrompt
    if (!content.trim()) {
      toast.error('Missing content', { description: 'Add some text before using AI.' })
      return
    }
    setIsFormatting(true)
    try {
      const result = await formatPrompt(content)
      if (activeFile) {
        setEditContent(result.system_prompt)
      } else {
        setTempPrompt(result.system_prompt)
      }
    } catch (error) {
      toast.error("Couldn't format the prompt", { description: 'Please try again.' })
    } finally {
      setIsFormatting(false)
    }
  }

  const handleClone = async () => {
    if (!agent?.id) return
    setIsCloning(true)
    try {
      const identifier = agent.slug || agent.id
      const result = await cloneAgent(identifier)
      if (result.success && result.agent) {
        router.push(`/ai-agents/${result.agent.id}/${slugify(result.agent.name || '')}`)
      }
    } catch (error) {
      toast.error("Couldn't copy this agent", { description: 'Please try again.' })
    } finally {
      setIsCloning(false)
    }
  }

  // --- Tool Handlers ---
  const handleAddTool = async (toolSlug: string) => {
    const currentTools = agent.tools || []
    const toolSlugs = currentTools.map((t: any) => typeof t === 'string' ? t : t.app_slug || t.name_slug)
    if (toolSlugs.includes(toolSlug)) return

    setToolLoading(toolSlug)
    try {
      await addToolToAgent(Number(agent.id), toolSlug)
      if (onRefresh) await onRefresh()
    } catch (error) {
      toast.error("Couldn't add this tool", { description: 'Please try again.' })
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
      toast.error("Couldn't remove this tool", { description: 'Please try again.' })
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
  const agentDocs = agentKbDocs.map(kb => ({
    id: kb.knowledge_base_id,
    name: kb.kb_name || 'Untitled',
    title: kb.kb_name || 'Untitled',
    content_type: 'document',
  }))

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

  const activeFileInfo = activeFile
    ? SOUL_FILES.find(f => f.fileName === activeFile)
    : undefined

  // --- Editor open/close handlers ---
  const handleOpenSystemPrompt = () => {
    setTempPrompt(convertPromptToMarkdown(agent.system_prompt || agent.prompt))
    setActiveFile(null)
    setMode(isEditable ? 'edit' : 'view')
    setIsPromptSheetOpen(true)
  }

  const handleOpenSoulFile = (fileName: string) => {
    const fileData = files[fileName]
    setActiveFile(fileName)
    setEditContent(fileData?.content || '')
    setMode(isEditable ? 'edit' : 'view')
    setEditorOpen(true)
  }

  const handleEditorClose = () => {
    setIsPromptSheetOpen(false)
    setEditorOpen(false)
    setActiveFile(null)
  }

  const handleEditorSave = async () => {
    if (activeFile) {
      handleSave()
      return
    }
    try {
      await onUpdate({ system_prompt: tempPrompt })
      toast.success('System prompt saved')
      setIsPromptSheetOpen(false)
    } catch {
      // apiCall inside onUpdate already surfaces the server error toast.
      // Keep the sheet open so the user can retry without losing their edit.
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        <AgentFilesSection
          agent={agent}
          isEditable={isEditable}
          isLoading={isLoading}
          isAgentRunning={isAgentRunning}
          files={files}
          soulFiles={SOUL_FILES}
          onOpenSystemPrompt={handleOpenSystemPrompt}
          onOpenSoulFile={handleOpenSoulFile}
        />

        <FileEditorPanel
          isOpen={isPromptSheetOpen || editorOpen}
          onClose={handleEditorClose}
          activeFile={activeFile}
          activeFileInfo={activeFileInfo}
          editContent={editContent}
          onEditContentChange={setEditContent}
          tempPrompt={tempPrompt}
          onTempPromptChange={setTempPrompt}
          isEditable={isEditable}
          mode={mode}
          onModeChange={setMode}
          isFormatting={isFormatting}
          isSaving={isSaving}
          isCloning={isCloning}
          isAgentRunning={isAgentRunning}
          onWriteWithAI={handleWriteWithAI}
          onSave={handleEditorSave}
          onClone={handleClone}
        />

        <KnowledgeBaseSection
          agentId={Number(agent.id)}
          agentDocs={agentDocs}
          availableDocuments={availableDocuments}
          isEditable={isEditable}
          isMarketplace={isMarketplace}
          onAddKb={handleAddKb}
          onRemoveKb={handleRemoveKb}
        />

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
      </div>

      {/* Right Sidebar */}
      <div className="space-y-8">
        <SchedulesCard
          agent={agent}
          schedules={schedules}
          isMarketplace={isMarketplace}
          onNavigateToSchedules={onNavigateToSchedules}
        />
        <AgentChannelsCard
          agentId={Number(agent.id)}
          isEditable={isEditable}
          isMarketplace={isMarketplace}
        />
      </div>
    </div>
  )
}
