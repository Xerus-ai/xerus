'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import useSWR, { mutate } from 'swr'
import { useAuth } from "@/utils/AuthContext"
import {
  getAssistant,
  updateAgent,
  getAssistants,
} from "@/lib/api/agents"
import { getSchedules } from "@/lib/api/schedules"
import { getAgentKnowledgeBases } from "@/lib/api/agent-kb"
import { getTree, type FileNode } from "@/lib/api/workspace"
import { canEditAgent, isSystemTemplate } from "@/utils/agentLabels"
import {
  ArrowLeft,
  Loader2,
  Copy,
  Upload,
  Lock,
  Trash2
} from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// UI Components
// IDE Components
import { AgentProfileCard } from "@/components/agents/ide/AgentProfileCard"
import { FloatingPanelProvider } from "@/components/common/FloatingPanelContext"
import { RunHistory } from "@/components/agents/ide/RunHistory"
import { MemoryTab } from "@/components/agents/ide/MemoryTab"
import { SchedulesTab } from "@/components/agents/ide/SchedulesTab"
import { BehaviourTab } from "@/components/agents/ide/BehaviourTab"
import { IdentityTab } from "@/components/agents/ide/IdentityTab"

// Extracted hooks
import { useScheduleHandlers } from "@/hooks/useScheduleHandlers"
import { useAgentActions } from "@/hooks/useAgentActions"
import { XerusLoader } from "@/components/common/XerusLoader"

interface AgentDetailsClientProps {
  agentId: string
}

function flattenKnowledgeDocuments(node: FileNode): Array<{ id: string; name: string; title: string; content_type: string }> {
  const docs: Array<{ id: string; name: string; title: string; content_type: string }> = []

  const visit = (current: FileNode) => {
    if (current.type === 'file' && /(^|\/)knowledge\/.+/.test(current.path)) {
      const ext = current.name.includes('.') ? current.name.split('.').pop() || 'document' : 'document'
      docs.push({
        id: current.path,
        name: current.name,
        title: current.name,
        content_type: ext,
      })
    }
    current.children?.forEach(visit)
  }

  visit(node)
  return docs
}

export default function AgentDetailsClient({ agentId }: AgentDetailsClientProps) {
  const router = useRouter()
  const { user, isAuthReady } = useAuth()

  const [activeTab, setActiveTab] = useState('identity')

  // --- SWR data fetching ---
  // agentId can be numeric ID or slug string — backend resolves both
  const { data: agent, isLoading: isLoadingAgent, mutate: mutateAgent } = useSWR(
    isAuthReady ? ['agent', agentId] : null,
    () => getAssistant(agentId)
  )

  // Marketplace agents are read-only catalog entries (id: -1, no DB record)
  const isMarketplace = agent ? isSystemTemplate(agent.userId, agent.agentType) : false

  // Schedules use numeric agent ID (from loaded agent) — skip for marketplace
  const { data: schedulesData } = useSWR(
    isAuthReady && agent && !isMarketplace ? ['schedules', agent.id] : null,
    () => agent ? getSchedules({ agentId: agent.id }) : Promise.resolve([])
  )

  const { data: allAgentsData } = useSWR(
    isAuthReady ? 'all-agents' : null,
    () => getAssistants()
  )
  const { data: availableDocuments = [] } = useSWR(
    isAuthReady ? 'agent-kb-documents' : null,
    async () => {
      const tree = await getTree(6, false)
      return flattenKnowledgeDocuments(tree.root)
    }
  )
  // KB docs — skip for marketplace (no DB record to query)
  const { data: agentKbDocs = [] } = useSWR(
    isAuthReady && agent && !isMarketplace ? ['agent-kb', agent.id] : null,
    () => agent ? getAgentKnowledgeBases(Number(agent.id)) : Promise.resolve([])
  )

  // Derived state
  const schedules = schedulesData ?? []
  const allAgents = allAgentsData?.agents ?? []
  const workflowConfig = agent?.workflowConfig ?? null

  // Local state for schedule mutations
  const [localSchedules, setLocalSchedules] = useState<typeof schedules | null>(null)
  const effectiveSchedules = localSchedules ?? schedules

  // --- Extracted hooks ---
  const {
    handleScheduleCreate,
    handleScheduleToggle,
    handleScheduleDelete,
  } = useScheduleHandlers({
    agentId: agent?.id ?? 0,
    setSchedules: setLocalSchedules,
    setAgent: () => mutateAgent(),
  })

  const {
    isCloning,
    isPublishing,
    isDeleting,
    handleClone,
    handlePublish,
    handleUnpublish,
    handleDelete,
  } = useAgentActions({ agent, setAgent: () => mutateAgent() })

  // --- Handlers ---
  const handleUpdateAgent = async (updates: any) => {
    if (!agent) return
    try {
      const updatedAgent = await updateAgent(agent.id, updates)
      mutateAgent(updatedAgent, false)
      mutate('agents/mine')
    } catch (error) {
      throw error
    }
  }

  const handleRefreshAgent = async () => {
    mutateAgent()
    mutate(agent ? ['agent-kb', agent.id] : null)
  }

  // Permissions
  const isEditable = agent ? canEditAgent(agent.userId, user?.uid, agent.agentType) : false
  const isOwner = user?.uid === agent?.userId
  const isPrivate = agent?.agentType === 'private'
  const isPublic = agent?.agentType === 'public'
  const canPublish = isOwner && isPrivate
  const canUnpublish = isOwner && isPublic && agent?.userId !== null
  const canDelete = isOwner && isPrivate

  // --- Render ---
  if (isLoadingAgent) {
    return <XerusLoader />
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-surface-alt flex flex-col items-center justify-center gap-6 px-4">
        <Image src="/logo/xerus.svg" alt="" width={40} height={40} className="opacity-30" />
        <div className="text-center">
          <h1 className="text-lg font-serif text-text mb-1">Agent not found</h1>
          <p className="text-sm text-text-secondary">This agent may have been deleted or is unavailable.</p>
        </div>
        <button
          onClick={() => router.push('/ai-agents')}
          className="px-5 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-medium rounded-xl text-sm transition-colors"
        >
          Back to Agents
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-alt text-text font-sans">
      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* Top Navigation Row */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push('/ai-agents')}
            className="inline-flex items-center gap-2 text-text-secondary hover:text-text transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to AI Agents</span>
          </button>

          <div className="flex items-center gap-1">
            {canPublish && (
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#FF6600] hover:bg-[#FF6600]/5 rounded-xl transition-colors disabled:opacity-50"
              >
                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isPublishing ? 'Publishing...' : 'Publish to marketplace'}
              </button>
            )}

            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-muted hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}

            {canUnpublish && (
              <button
                onClick={handleUnpublish}
                disabled={isPublishing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-xl transition-colors disabled:opacity-50"
              >
                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {isPublishing ? 'Removing...' : 'Unpublish'}
              </button>
            )}

            {!isEditable && (
              <button
                onClick={handleClone}
                disabled={isCloning}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#FF6600] hover:bg-[#FF6600]/5 rounded-xl transition-colors disabled:opacity-50"
              >
                {isCloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                Clone this agent to edit
              </button>
            )}
          </div>
        </div>

        {/* Header Section */}
        <div className="mb-8">
          <AgentProfileCard agent={agent} onUpdate={handleUpdateAgent} />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-8 bg-surface p-[0.325rem] rounded-full inline-flex h-auto w-auto border-none">
            <TabsTrigger value="identity" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-text data-[state=active]:text-white data-[state=active]:shadow-sm text-text-secondary hover:text-text">
              Identity
            </TabsTrigger>
            <TabsTrigger value="behaviour" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-text data-[state=active]:text-white data-[state=active]:shadow-sm text-text-secondary hover:text-text">
              Behaviour
            </TabsTrigger>
            <TabsTrigger value="schedules" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-text data-[state=active]:text-white data-[state=active]:shadow-sm text-text-secondary hover:text-text">
              Schedules
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-text data-[state=active]:text-white data-[state=active]:shadow-sm text-text-secondary hover:text-text">
              History
            </TabsTrigger>
            <TabsTrigger value="memory" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-text data-[state=active]:text-white data-[state=active]:shadow-sm text-text-secondary hover:text-text">
              Memory
            </TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            <FloatingPanelProvider>
              <IdentityTab
                agent={agent}
                isEditable={isEditable}
                isMarketplace={isMarketplace}
                availableDocuments={availableDocuments}
                agentKbDocs={agentKbDocs}
                onUpdate={handleUpdateAgent}
                onRefresh={handleRefreshAgent}
                schedules={effectiveSchedules}
                onNavigateToSchedules={() => setActiveTab('schedules')}
              />
            </FloatingPanelProvider>
          </TabsContent>

          <TabsContent value="behaviour" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            <FloatingPanelProvider>
              <BehaviourTab
                agent={agent}
                isEditable={isEditable}
                active={activeTab === 'behaviour'}
                onUpdateAgent={handleUpdateAgent}
              />
            </FloatingPanelProvider>
          </TabsContent>

          <TabsContent value="schedules" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            <FloatingPanelProvider>
              <SchedulesTab
                agent={agent}
                schedules={effectiveSchedules}
                workflowConfig={workflowConfig}
                onCreate={handleScheduleCreate}
                onToggle={handleScheduleToggle}
                onDelete={handleScheduleDelete}
                isLoading={isLoadingAgent}
              />
            </FloatingPanelProvider>
          </TabsContent>

          <TabsContent value="history" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            <RunHistory agent={agent} />
          </TabsContent>

          <TabsContent value="memory" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            <MemoryTab agent={agent} />
          </TabsContent>
        </Tabs>
      </div>

    </div>
  )
}

