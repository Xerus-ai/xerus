'use client'

import React, { useState, useMemo } from 'react'
import { Hash, Plus, X, Star, Loader2 } from 'lucide-react'
import { useDomains } from '@/hooks/useDomains'
import { useAgentChannels } from '@/hooks/useAgentChannels'

interface AgentChannelsCardProps {
  agentId: number
  isEditable: boolean
  isMarketplace?: boolean
}

export function AgentChannelsCard({ agentId, isEditable, isMarketplace = false }: AgentChannelsCardProps) {
  const [showPicker, setShowPicker] = useState(false)
  const { domains } = useDomains()
  const {
    assignedChannels,
    processing,
    assignChannel,
    unassignChannel,
    setPrimaryChannel,
  } = useAgentChannels(agentId)

  const assignedIds = useMemo(
    () => new Set(assignedChannels.map(ac => ac.channel_id)),
    [assignedChannels],
  )

  const allChannels = useMemo(
    () => (domains || []).flatMap(d =>
      d.channels.map(ch => ({ ...ch, domainName: d.name, domainSlug: d.slug }))
    ),
    [domains],
  )

  const availableChannels = useMemo(
    () => allChannels.filter(ch => !assignedIds.has(ch.id)),
    [allChannels, assignedIds],
  )

  const handleAdd = async (channelId: string) => {
    await assignChannel(channelId)
    setShowPicker(false)
  }

  const handleRemove = async (channelId: string) => {
    await unassignChannel(channelId)
  }

  const handleSetPrimary = async (channelId: string) => {
    await setPrimaryChannel(channelId)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Hash className="w-6 h-6 text-secondary" />
          <h3 className="text-2xl font-serif text-text">Channels</h3>
        </div>
        {isEditable && (
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="p-2 hover:bg-primary/5 text-secondary rounded-full transition-colors"
            aria-label={showPicker ? 'Close picker' : 'Add channel'}
          >
            {showPicker ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          </button>
        )}
      </div>

      <div className="bg-surface rounded-3xl border border-surface-active shadow-sm p-6">
        {assignedChannels.length > 0 ? (
          <div className="space-y-1">
            {assignedChannels.map(ch => (
              <div
                key={ch.channel_id}
                className="flex items-center gap-2.5 py-1.5 px-2 rounded-xl hover:bg-surface-hover group transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                  <Hash className="w-3.5 h-3.5 text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text truncate">{ch.channel_name}</p>
                  <p className="text-[10px] text-text-secondary">{ch.domain_name}</p>
                </div>
                {processing === ch.channel_id ? (
                  <Loader2 className="w-3.5 h-3.5 text-text-secondary animate-spin shrink-0" />
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    {ch.is_primary ? (
                      <Star className="w-3.5 h-3.5 text-secondary fill-current" />
                    ) : isEditable ? (
                      <button
                        onClick={() => handleSetPrimary(ch.channel_id)}
                        className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-primary/5 text-text-secondary hover:text-secondary transition-all"
                        title="Set as primary"
                      >
                        <Star className="w-3 h-3" />
                      </button>
                    ) : null}
                    {isEditable && (
                      <button
                        onClick={() => handleRemove(ch.channel_id)}
                        className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-text-secondary transition-all"
                        title="Remove from channel"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border-2 border-dashed border-surface-active rounded-xl">
            <p className="text-xs text-text-secondary italic">
              {isMarketplace ? 'Clone this agent to assign channels' : 'Not assigned to any channels'}
            </p>
          </div>
        )}

        {showPicker && availableChannels.length > 0 && (
          <div className="mt-3 pt-3 border-t border-surface-active">
            <p className="text-[10px] font-medium text-text-secondary mb-1.5">Add to channel</p>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {(domains || []).map(domain => {
                const domainChannels = domain.channels.filter(ch => !assignedIds.has(ch.id))
                if (domainChannels.length === 0) return null
                return (
                  <div key={domain.id}>
                    <p className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider px-2 py-1 mt-1">
                      {domain.name}
                    </p>
                    {domainChannels.map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => handleAdd(ch.id)}
                        disabled={processing === ch.id}
                        className="w-full flex items-center gap-2.5 py-1.5 px-2 rounded-xl hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
                      >
                        <Hash className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                        <span className="text-sm text-text truncate flex-1">{ch.name}</span>
                        {processing === ch.id ? (
                          <Loader2 className="w-3.5 h-3.5 text-text-secondary animate-spin shrink-0" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
