'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { apiPatch } from '@/lib/api/client'
import { toast } from '@/lib/toast'
import { Pencil, Plus, X, Loader2 } from 'lucide-react'
import { AgentAvatarWithModel, ModelIcon, AdapterIcon } from '@/components/agents/AgentAvatar'
import { formatModelName } from '@/utils/models'
import { ChannelActivity } from './ChannelActivity'
import { ChannelTasks } from './ChannelTasks'
import { ChannelDeliverables } from './ChannelDeliverables'
import type { ChannelAgent } from '@/hooks/useChannelAgents'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelHeaderProps {
  channelId: string
  channelSlug?: string
  channelName: string
  channelDescription: string
  channelAgents: ChannelAgent[]
  allAgents?: ChannelAgent[]
  onAssignAgent?: (agentId: string, channelSlug: string) => Promise<void>
  onUnassignAgent?: (agentId: string, channelSlug: string) => Promise<void>
  onChannelUpdated?: () => void
  className?: string
}

// ---------------------------------------------------------------------------
// Tab styling
// ---------------------------------------------------------------------------

const TAB_LIST_CLASSES =
  'mt-4 mb-6 bg-surface p-1 rounded-full inline-flex h-auto w-auto border-none'

const TAB_TRIGGER_CLASSES = cn(
  'rounded-full px-5 py-2 text-sm font-medium transition-all duration-150',
  'data-[state=active]:bg-secondary/10 data-[state=active]:text-secondary data-[state=active]:shadow-sm',
  'text-text-muted hover:text-text-secondary'
)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChannelHeader({
  channelId,
  channelSlug,
  channelName,
  channelDescription,
  channelAgents,
  allAgents = [],
  onAssignAgent,
  onUnassignAgent,
  onChannelUpdated,
  className,
}: ChannelHeaderProps) {
  const onlineCount = channelAgents.filter((a) => a.status === 'active' || a.status === 'running').length
  const [processingAgent, setProcessingAgent] = useState<string | null>(null)
  const [agentPopoverOpen, setAgentPopoverOpen] = useState(false)

  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false)
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editName, setEditName] = useState(channelName)
  const [editDesc, setEditDesc] = useState(channelDescription)
  const nameRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setEditName(channelName) }, [channelName])
  useEffect(() => { setEditDesc(channelDescription) }, [channelDescription])
  useEffect(() => { if (isEditingName) nameRef.current?.focus() }, [isEditingName])
  useEffect(() => { if (isEditingDesc) descRef.current?.focus() }, [isEditingDesc])

  const assignedIds = new Set(channelAgents.map((a) => a.id))

  const handleToggleAgent = async (agent: ChannelAgent) => {
    if (!channelSlug || !onAssignAgent || !onUnassignAgent) return
    setProcessingAgent(agent.id)
    try {
      if (assignedIds.has(agent.id)) {
        await onUnassignAgent(agent.id, channelSlug)
      } else {
        await onAssignAgent(agent.id, channelSlug)
      }
    } catch {
      toast.error('Failed to update agent assignment')
    } finally {
      setProcessingAgent(null)
    }
  }

  const saveChannelField = useCallback(async (field: 'name' | 'description', value: string) => {
    const currentValue = field === 'name' ? channelName : channelDescription
    if (value.trim() === currentValue) return

    try {
      await apiPatch(`/company/channels/${channelId}`, { [field]: value.trim() })
      onChannelUpdated?.()
    } catch {
      toast.error(`Couldn't update channel ${field}`)
      if (field === 'name') setEditName(channelName)
      else setEditDesc(channelDescription)
    }
  }, [channelId, channelName, channelDescription, onChannelUpdated])

  const handleNameBlur = () => {
    setIsEditingName(false)
    saveChannelField('name', editName)
  }

  const handleDescBlur = () => {
    setIsEditingDesc(false)
    saveChannelField('description', editDesc)
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header section */}
      <div className="flex-shrink-0 pb-4 border-b border-border">
        <div className="flex items-start justify-between gap-4 mb-2">
          {/* Left: channel name + description (click-to-edit) */}
          <div className="min-w-0 flex-1">
            {/* Channel name */}
            <div className="flex items-center gap-2 mb-1">
              {isEditingName ? (
                <Input
                  ref={nameRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleNameBlur(); if (e.key === 'Escape') { setEditName(channelName); setIsEditingName(false) } }}
                  className="font-serif !text-lg font-medium tracking-tight text-text bg-transparent border-none shadow-none !h-auto focus-visible:ring-2 focus-visible:ring-primary p-0 min-w-[200px]"
                  placeholder="Channel name"
                />
              ) : (
                <>
                  <h1
                    onClick={() => setIsEditingName(true)}
                    className="font-serif text-lg font-medium tracking-tight text-text truncate cursor-text hover:text-text/80 transition-colors"
                  >
                    # {channelName}
                  </h1>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="p-1 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-primary transition-colors shrink-0"
                    title="Edit name"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* Channel description */}
            {isEditingDesc ? (
              <Textarea
                ref={descRef}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onBlur={handleDescBlur}
                onKeyDown={(e) => { if (e.key === 'Escape') { setEditDesc(channelDescription); setIsEditingDesc(false) } }}
                className="text-sm text-text-secondary bg-transparent border-none shadow-none p-0 min-h-[20px] focus-visible:ring-2 focus-visible:ring-primary resize-none leading-relaxed w-full placeholder:text-text-muted"
                placeholder="Add a description..."
                rows={1}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = `${target.scrollHeight}px`
                }}
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <p
                  onClick={() => setIsEditingDesc(true)}
                  className="text-sm text-text-secondary line-clamp-2 cursor-text hover:text-text-secondary/80 transition-colors"
                >
                  {channelDescription || 'Add a description...'}
                </p>
                <button
                  onClick={() => setIsEditingDesc(true)}
                  className="p-0.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-primary transition-colors shrink-0"
                  title="Edit description"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Right: Agent avatars + manage button */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Agent avatar stack — rounded-xl with model badge at edge */}
            {channelAgents.length > 0 && (
              <div className="flex items-center">
                {channelAgents.slice(0, 5).map((agent, index) => (
                  <div key={agent.id} className="relative pb-1" style={{ marginLeft: index === 0 ? 0 : -6, zIndex: 5 - index }}>
                    <div className="w-9 h-9 rounded-xl overflow-hidden border border-surface-active bg-surface-hover ring-2 ring-card">
                      <AgentAvatarWithModel name={agent.name} avatarUrl={agent.avatar_url} model={agent.ai_model} hideBadge className="w-full h-full" />
                    </div>
                    {agent.ai_model && (
                      <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 bg-card border border-surface-active rounded-md px-1 py-px shadow-sm flex items-center gap-0.5 z-10">
                        <ModelIcon model={agent.ai_model} size="xs" />
                      </div>
                    )}
                  </div>
                ))}
                {channelAgents.length > 5 && (
                  <div className="w-9 h-9 rounded-xl bg-surface-hover text-text-secondary ring-2 ring-card flex items-center justify-center text-xs font-medium" style={{ marginLeft: -6, zIndex: 0 }}>
                    +{channelAgents.length - 5}
                  </div>
                )}
                <span className="text-xs text-text-muted ml-2 whitespace-nowrap">{onlineCount} online</span>
              </div>
            )}

            {/* Manage agents button — matches AgentChannelsCard pattern */}
            <Popover open={agentPopoverOpen} onOpenChange={setAgentPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  className="p-2 hover:bg-secondary/8 text-secondary rounded-full transition-colors"
                  aria-label="Manage channel agents"
                >
                  {agentPopoverOpen ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-80 p-0 rounded-[24px] bg-surface border border-border shadow-sm"
              >
                <div className="px-5 pt-5 pb-3">
                  <h3 className="text-lg font-serif text-text">Channel Agents</h3>
                  <p className="text-xs text-text-muted mt-0.5">{channelAgents.length} assigned</p>
                </div>
                <div className="px-5 pb-4">
                  <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
                    {channelAgents.length > 0 ? (
                      <div className="space-y-1">
                        {channelAgents.map((agent) => {
                          const isProcessing = processingAgent === agent.id
                          return (
                            <div key={agent.id} className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-surface-hover group transition-colors">
                              <div className="relative pb-1 shrink-0">
                                <div className="w-10 h-10 rounded-xl overflow-hidden border border-surface-active bg-surface-hover">
                                  <AgentAvatarWithModel name={agent.name} avatarUrl={agent.avatar_url} model={agent.ai_model} hideBadge className="w-full h-full" />
                                </div>
                                <div className="absolute -top-1.5 -left-1.5 bg-card border border-secondary/20 rounded-md p-0.5 shadow-sm z-20" title="Claude Code">
                                  <img src="/icons/claudecode-color.svg" alt="" className="w-3.5 h-3.5 object-contain" />
                                </div>
                                {agent.ai_model && (
                                  <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 bg-card border border-surface-active rounded-md px-1 py-px shadow-sm flex items-center gap-0.5 z-10 whitespace-nowrap">
                                    <ModelIcon model={agent.ai_model} size="xs" />
                                    <span className="text-[8px] font-bold text-text-secondary">{formatModelName(agent.ai_model)}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-text truncate">{agent.name}</p>
                                <p className="text-[10px] text-text-muted truncate">{agent.slug}</p>
                              </div>
                              {isProcessing ? (
                                <Loader2 className="w-3.5 h-3.5 text-text-secondary animate-spin shrink-0" />
                              ) : (
                                <button
                                  onClick={() => handleToggleAgent(agent)}
                                  className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 text-text-secondary transition-all"
                                  title="Remove from channel"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 border-2 border-dashed border-border rounded-xl">
                        <p className="text-xs text-text-secondary italic">No agents assigned yet</p>
                      </div>
                    )}

                    {/* Available agents picker */}
                    {allAgents.filter(a => !assignedIds.has(a.id)).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-[10px] font-medium text-text-secondary mb-1.5">Add agent</p>
                        <div className="space-y-0.5 max-h-48 overflow-y-auto">
                          {allAgents.filter(a => !assignedIds.has(a.id)).map((agent) => {
                            const isProcessing = processingAgent === agent.id
                            return (
                              <button
                                key={agent.id}
                                onClick={() => handleToggleAgent(agent)}
                                disabled={isProcessing}
                                className="w-full flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
                              >
                                <div className="relative pb-1 shrink-0">
                                  <div className="w-8 h-8 rounded-xl overflow-hidden border border-surface-active bg-surface-hover">
                                    <AgentAvatarWithModel name={agent.name} avatarUrl={agent.avatar_url} model={agent.ai_model} hideBadge className="w-full h-full" />
                                  </div>
                                  {agent.ai_model && (
                                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 bg-card border border-surface-active rounded-md px-0.5 py-px shadow-sm flex items-center z-10">
                                      <ModelIcon model={agent.ai_model} size="xs" />
                                    </div>
                                  )}
                                </div>
                                <span className="text-sm text-text truncate flex-1">{agent.name}</span>
                                {isProcessing ? (
                                  <Loader2 className="w-3.5 h-3.5 text-text-secondary animate-spin shrink-0" />
                                ) : (
                                  <Plus className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

      </div>

      {/* Tabs section */}
      <Tabs defaultValue="activity" className="flex flex-col flex-1 min-h-0">
        <div className="flex-shrink-0">
          <TabsList className={TAB_LIST_CLASSES} aria-label="Channel views">
            <TabsTrigger value="tasks" className={TAB_TRIGGER_CLASSES} data-testid="channel-tab-tasks">
              Tasks
            </TabsTrigger>
            <TabsTrigger value="activity" className={TAB_TRIGGER_CLASSES} data-testid="channel-tab-activity">
              Activity
            </TabsTrigger>
            <TabsTrigger value="deliverables" className={TAB_TRIGGER_CLASSES} data-testid="channel-tab-deliverables">
              Deliverables
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tasks" className="flex-1 min-h-0 mt-0">
          <ChannelTasks channelId={channelId} className="h-full" agents={channelAgents} />
        </TabsContent>

        <TabsContent value="activity" className="flex-1 min-h-0 mt-0">
          <ChannelActivity channelId={channelId} className="h-full" />
        </TabsContent>

        <TabsContent value="deliverables" className="flex-1 min-h-0 mt-0">
          <ChannelDeliverables channelId={channelId} className="h-full" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
