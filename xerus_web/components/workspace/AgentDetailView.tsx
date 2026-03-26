'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import useSWR, { mutate } from 'swr'
import { useAuth } from '@/utils/AuthContext'
import { getAssistant, updateAgent, getAssistants } from '@/lib/api/agents'
import { getSchedules } from '@/lib/api/schedules'
import { getAgentKnowledgeBases } from '@/lib/api/agent-kb'
import { getTree, type FileNode } from '@/lib/api/workspace'
import { canEditAgent, isSystemTemplate } from '@/utils/agentLabels'
import { ArrowLeft, Loader2, Copy, Upload, Lock, Trash2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentProfileCard } from '@/components/agents/ide/AgentProfileCard'
import { FloatingPanelProvider } from '@/components/common/FloatingPanelContext'
import { RunHistory } from '@/components/agents/ide/RunHistory'
import { MemoryTab } from '@/components/agents/ide/MemoryTab'
import { SchedulesTab } from '@/components/agents/ide/SchedulesTab'
import { BehaviourTab } from '@/components/agents/ide/BehaviourTab'
import { IdentityTab } from '@/components/agents/ide/IdentityTab'
import { useScheduleHandlers } from '@/hooks/useScheduleHandlers'
import { useAgentActions } from '@/hooks/useAgentActions'
import { XerusLoader } from '@/components/common/XerusLoader'

function flattenKnowledgeDocuments(node: FileNode): Array<{ id: string; name: string; title: string; content_type: string }> {
  const docs: Array<{ id: string; name: string; title: string; content_type: string }> = []
  const visit = (current: FileNode) => {
    if (current.type === 'file' && /(^|\/)knowledge\/.+/.test(current.path)) {
      const ext = current.name.includes('.') ? current.name.split('.').pop() || 'document' : 'document'
      docs.push({ id: current.path, name: current.name, title: current.name, content_type: ext })
    }
    current.children?.forEach(visit)
  }
  visit(node)
  return docs
}

interface AgentDetailViewProps {
  agentId: string | number
  onBack: () => void
}

export function AgentDetailView({ agentId, onBack }: AgentDetailViewProps) {
  const router = useRouter()
  const { user, isAuthReady } = useAuth()
  const [activeTab, setActiveTab] = useState('identity')

  const { data: agent, isLoading: isLoadingAgent, mutate: mutateAgent } = useSWR(
    isAuthReady ? ['agent', agentId] : null,
    () => getAssistant(String(agentId))
  )

  const isMarketplace = agent ? isSystemTemplate(agent.userId, agent.agentType) : false

  const { data: schedulesData } = useSWR(
    isAuthReady && agent && !isMarketplace ? ['schedules', agent.id] : null,
    () => (agent ? getSchedules({ agentId: agent.id }) : Promise.resolve([]))
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

  const { data: agentKbDocs = [] } = useSWR(
    isAuthReady && agent && !isMarketplace ? ['agent-kb', agent.id] : null,
    () => (agent ? getAgentKnowledgeBases(Number(agent.id)) : Promise.resolve([]))
  )

  const schedules = schedulesData ?? []
  const allAgents = allAgentsData?.agents ?? []
  const workflowConfig = agent?.workflowConfig ?? null

  const [localSchedules, setLocalSchedules] = useState<typeof schedules | null>(null)
  const effectiveSchedules = localSchedules ?? schedules

  const { handleScheduleCreate, handleScheduleToggle, handleScheduleDelete } = useScheduleHandlers({
    agentId: agent?.id ?? 0,
    setSchedules: setLocalSchedules,
    setAgent: () => mutateAgent(),
  })

  const { isCloning, isPublishing, isDeleting, handleClone, handlePublish, handleUnpublish, handleDelete } =
    useAgentActions({ agent, setAgent: () => mutateAgent() })

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

  const isEditable = agent ? canEditAgent(agent.userId, user?.uid, agent.agentType) : false
  const isOwner = user?.uid === agent?.userId
  const isPrivate = agent?.agentType === 'private'
  const isPublic = agent?.agentType === 'public'
  const canPublishAgent = isOwner && isPrivate
  const canUnpublishAgent = isOwner && isPublic && agent?.userId !== null
  const canDeleteAgent = isOwner && isPrivate

  if (isLoadingAgent) return <XerusLoader />

  if (!agent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        <Image src="/logo/xerus.svg" alt="" width={40} height={40} className="opacity-30" />
        <div className="text-center">
          <h1 className="text-lg font-serif text-text mb-1">Agent not found</h1>
          <p className="text-sm text-text-secondary">This agent may have been deleted or is unavailable.</p>
        </div>
        <button onClick={onBack} className="px-5 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-medium rounded-xl text-sm transition-colors">
          Back to Agents
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin text-text font-sans">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={onBack} className="inline-flex items-center gap-2 text-text-secondary hover:text-text transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Agents
          </button>
          <div className="flex items-center gap-1">
            {canPublishAgent && (
              <button onClick={handlePublish} disabled={isPublishing} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#FF6600] hover:bg-[#FF6600]/5 rounded-xl transition-colors disabled:opacity-50">
                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isPublishing ? 'Publishing...' : 'Publish to marketplace'}
              </button>
            )}
            {canDeleteAgent && (
              <button onClick={handleDelete} disabled={isDeleting} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50">
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
            {canUnpublishAgent && (
              <button onClick={handleUnpublish} disabled={isPublishing} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-xl transition-colors disabled:opacity-50">
                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {isPublishing ? 'Removing...' : 'Unpublish'}
              </button>
            )}
            {!isEditable && (
              <button onClick={handleClone} disabled={isCloning} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#FF6600] hover:bg-[#FF6600]/5 rounded-xl transition-colors disabled:opacity-50">
                {isCloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                Clone this agent to edit
              </button>
            )}
          </div>
        </div>

        {/* Profile */}
        <div className="mb-8">
          <AgentProfileCard agent={agent} onUpdate={handleUpdateAgent} />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-8 bg-surface p-[0.325rem] rounded-full inline-flex h-auto w-auto border-none">
            {['identity', 'behaviour', 'schedules', 'history', 'memory'].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-text data-[state=active]:text-white data-[state=active]:shadow-sm text-text-secondary hover:text-text capitalize"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="identity" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            <FloatingPanelProvider>
              <IdentityTab agent={agent} isEditable={isEditable} isMarketplace={isMarketplace} availableDocuments={availableDocuments} agentKbDocs={agentKbDocs} onUpdate={handleUpdateAgent} onRefresh={handleRefreshAgent} schedules={effectiveSchedules} onNavigateToSchedules={() => setActiveTab('schedules')} />
            </FloatingPanelProvider>
          </TabsContent>

          <TabsContent value="behaviour" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            <FloatingPanelProvider>
              <BehaviourTab agent={agent} isEditable={isEditable} active={activeTab === 'behaviour'} onUpdateAgent={handleUpdateAgent} />
            </FloatingPanelProvider>
          </TabsContent>

          <TabsContent value="schedules" className="mt-0 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            <FloatingPanelProvider>
              <SchedulesTab agent={agent} schedules={effectiveSchedules} workflowConfig={workflowConfig} onCreate={handleScheduleCreate} onToggle={handleScheduleToggle} onDelete={handleScheduleDelete} isLoading={isLoadingAgent} />
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
