'use client'

import { X, MessageSquare, Settings, Copy, Bot, Puzzle, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { Assistant, Skill } from '@/lib/api/types'

export type SelectedItem =
  | { type: 'agent'; data: Assistant }
  | { type: 'skill'; data: Skill }

interface ItemDetailPaneProps {
  item: SelectedItem
  onClose: () => void
}

export function ItemDetailPane({ item, onClose }: ItemDetailPaneProps) {
  const router = useRouter()

  if (item.type === 'agent') return <AgentDetail agent={item.data} onClose={onClose} router={router} />
  if (item.type === 'skill') return <SkillDetail skill={item.data} onClose={onClose} router={router} />
  return null
}

function AgentDetail({ agent, onClose, router }: { agent: Assistant; onClose: () => void; router: ReturnType<typeof useRouter> }) {
  const initials = agent.name?.charAt(0)?.toUpperCase() || 'A'
  const isMarketplace = agent.agentType === 'public' || agent.agentType === 'shared'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-surface-active/40 shrink-0">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Agent Details</span>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-hover/60 text-text-secondary transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-6">
        {/* Profile */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-surface-hover flex items-center justify-center text-lg font-semibold text-text shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-text truncate">{agent.name}</h3>
            {agent.model && (
              <span className="text-[11px] text-text-secondary bg-surface-hover px-2 py-0.5 rounded-md mt-1 inline-block">
                {agent.model}
              </span>
            )}
          </div>
        </div>

        {agent.description && (
          <p className="text-sm text-text-secondary leading-relaxed">{agent.description}</p>
        )}

        {/* Quick info */}
        <div className="space-y-3">
          {agent.category && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Category</span>
              <span className="text-xs font-medium text-text bg-surface-hover px-2 py-0.5 rounded-md">{agent.category}</span>
            </div>
          )}
          {agent.tools && agent.tools.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Tools</span>
              <span className="text-xs font-medium text-text">{agent.tools.length} connected</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Type</span>
            <span className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded-full',
              isMarketplace ? 'bg-[#FF6600]/10 text-[#FF6600]' : 'bg-surface-hover text-text-secondary'
            )}>
              {isMarketplace ? 'Marketplace' : 'Private'}
            </span>
          </div>
        </div>

        {/* Tools list */}
        {agent.tools && agent.tools.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-2">Connected Tools</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.tools.slice(0, 8).map((tool) => (
                <span key={tool.name_slug} className="text-[11px] text-text-secondary bg-surface-hover/60 border border-surface-active/30 px-2 py-0.5 rounded-md">
                  {tool.name}
                </span>
              ))}
              {agent.tools.length > 8 && (
                <span className="text-[11px] text-text-secondary px-1">+{agent.tools.length - 8} more</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-4 border-t border-surface-active/40 flex gap-2 shrink-0">
        <button
          onClick={() => router.push(`/chat?agent=${agent.slug || agent.id}`)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#FF6600] text-white text-xs font-medium rounded-xl hover:bg-[#E65C00] transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
        <button
          onClick={() => router.push(`/ai-agents/${agent.slug || agent.id}`)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-surface-hover text-text text-xs font-medium rounded-xl hover:bg-surface-pressed transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Manage
        </button>
      </div>
    </div>
  )
}

function SkillDetail({ skill, onClose, router }: { skill: Skill; onClose: () => void; router: ReturnType<typeof useRouter> }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-surface-active/40 shrink-0">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Skill Details</span>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-hover/60 text-text-secondary transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-surface-hover flex items-center justify-center shrink-0">
            <Puzzle className="w-5 h-5 text-text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-text truncate">{skill.name}</h3>
            {skill.category && (
              <span className="text-[11px] text-text-secondary bg-surface-hover px-2 py-0.5 rounded-md mt-1 inline-block">
                {skill.category}
              </span>
            )}
          </div>
        </div>

        {skill.description && (
          <p className="text-sm text-text-secondary leading-relaxed">{skill.description}</p>
        )}

        <div className="space-y-3">
          {skill.author && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Author</span>
              <span className="text-xs font-medium text-text">{skill.author}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Installs</span>
            <span className="text-xs font-medium text-text">{skill.installCount || 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Status</span>
            <span className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded-full',
              skill.isInstalled ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-hover text-text-secondary'
            )}>
              {skill.isInstalled ? 'Installed' : 'Not installed'}
            </span>
          </div>
        </div>

        {skill.tags && skill.tags.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {skill.tags.map((tag) => (
                <span key={tag} className="text-[11px] text-text-secondary bg-surface-hover/60 border border-surface-active/30 px-2 py-0.5 rounded-md">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-4 border-t border-surface-active/40 flex gap-2 shrink-0">
        <button
          onClick={() => router.push(`/skills/${skill.slug}`)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#FF6600] text-white text-xs font-medium rounded-xl hover:bg-[#E65C00] transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Manage
        </button>
      </div>
    </div>
  )
}
