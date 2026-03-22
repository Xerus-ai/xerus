'use client'

import React, { Suspense, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CompanyBoard } from './CompanyBoard'
import { OfficeCanvas } from './OfficeCanvas'
import { AgentAvatarWithModel } from '@/components/agents/AgentAvatar'
import {
  Building2,
  FolderOpen,
  Clock,
  Zap,
} from 'lucide-react'
import { useOfficePolling } from '@/hooks/useOfficePolling'
import { XerusLoader } from '@/components/common/XerusLoader'
import { useLayout } from '@/components/layout/LayoutContext'
import type { OfficeAgent } from '@/hooks/useOfficeData'

// --- Agent Status Card (Active + Upcoming combined) ---

function AgentStatus({ agents }: { agents: OfficeAgent[] }) {
  const active = useMemo(() =>
    agents.filter(a => a.status === 'active' && a.current_task),
    [agents]
  )

  const scheduled = useMemo(() =>
    agents
      .filter(a => a.next_wake)
      .sort((a, b) => (a.next_wake || '').localeCompare(b.next_wake || ''))
      .slice(0, 4),
    [agents]
  )

  return (
    <div className="bg-surface rounded-[32px] p-6 shadow-sm h-full">
      {/* Active agents */}
      {active.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-green-500" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Active Now</span>
            <span className="bg-green-50 text-green-600 text-xs font-bold px-2 py-0.5 rounded-md">
              {active.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {active.map(agent => (
              <div key={agent.id} className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <AgentAvatarWithModel
                    name={agent.name}
                    avatarUrl={agent.avatar_url}
                    size="sm"
                    hideBadge
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-surface animate-status-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text truncate">{agent.name}</p>
                  <p className="text-xs text-text-secondary truncate">{agent.current_task}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      {active.length > 0 && scheduled.length > 0 && (
        <div className="border-t border-surface-active/30 my-4" />
      )}

      {/* Upcoming schedule */}
      {scheduled.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[#FF6600]" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Upcoming</span>
          </div>
          <div className="space-y-2.5">
            {scheduled.map(agent => (
              <div key={agent.id} className="flex items-center gap-3">
                <AgentAvatarWithModel
                  name={agent.name}
                  avatarUrl={agent.avatar_url}
                  size="sm"
                  hideBadge
                  className="flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text truncate">{agent.name}</p>
                  <p className="text-xs text-text-muted">{agent.next_wake}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {active.length === 0 && scheduled.length === 0 && (
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <span className="text-2xl mb-2">&#9749;</span>
          <p className="text-sm font-medium text-text-secondary">All agents on break</p>
          <p className="text-xs text-text-muted mt-1">No active tasks or upcoming schedules</p>
        </div>
      )}
    </div>
  )
}

// --- Activity Ticker ---

function ActivityTicker({ agents }: { agents: OfficeAgent[] }) {
  const activities = useMemo(() => {
    const items: { agent: string; text: string; dot: string }[] = []
    for (const agent of agents) {
      if (agent.status === 'active' && agent.current_task) {
        items.push({ agent: agent.name, text: agent.current_task, dot: 'bg-green-500' })
      } else if (agent.status === 'sleeping') {
        items.push({ agent: agent.name, text: `Sleeping${agent.next_wake ? ` \u00b7 wakes ${agent.next_wake}` : ''}`, dot: 'bg-yellow-400' })
      } else if (agent.status === 'error') {
        items.push({ agent: agent.name, text: 'Encountered an error', dot: 'bg-red-500' })
      }
    }
    return items
  }, [agents])

  if (activities.length === 0) return null

  return (
    <div className="bg-surface rounded-[32px] p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-text-muted" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
          Recent Activity
        </span>
      </div>
      <div className="space-y-2">
        {activities.map((activity, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activity.dot}`} />
            <span className="text-sm text-text font-medium">{activity.agent}</span>
            <span className="text-sm text-text-muted truncate">{activity.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Main Dashboard ---

export function OfficeDashboard() {
  const { agents, agentsByDomain, domains, isLoading, error, transitions, lastRefresh } = useOfficePolling(30000)
  const { openRightPanel } = useLayout()

  const handleAgentClick = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return
    openRightPanel(
      <div className="p-6">
        <h3 className="font-serif text-lg text-text mb-2">{agent.name}</h3>
        <p className="text-sm text-text-secondary mb-4">{agent.domain} department</p>
        <div className="space-y-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Status</span>
            <p className="text-sm text-text mt-1">{agent.status}</p>
          </div>
          {agent.current_task && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Current Task</span>
              <p className="text-sm text-text mt-1">{agent.current_task}</p>
            </div>
          )}
          {agent.next_wake && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Next Wake</span>
              <p className="text-sm text-text mt-1">{agent.next_wake}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-alt min-h-full font-sans text-text">
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Page header */}
        <header className="mb-8 flex items-center gap-3">
          <Building2 className="w-7 h-7 text-[#FF6600]" />
          <div>
            <h1 className="font-serif text-2xl text-text">Your Office</h1>
            <p className="text-sm text-text-secondary">
              Live overview of your AI workforce
            </p>
          </div>
        </header>

        {isLoading ? (
          <XerusLoader variant="inline" />
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-text-secondary">{error}</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <FolderOpen className="w-10 h-10 text-text-muted mb-3" />
            <p className="text-sm text-text-secondary">No agents in the office yet.</p>
            <p className="text-xs text-text-muted mt-1">Create agents to see them appear here.</p>
          </div>
        ) : (
          <Tabs defaultValue="office" className="space-y-6">
            <TabsList className="bg-surface p-[0.325rem] rounded-full inline-flex h-auto w-auto border-none">
              <TabsTrigger value="office" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-text data-[state=active]:text-white data-[state=active]:shadow-sm text-text-secondary hover:text-text">
                Office
              </TabsTrigger>
              <TabsTrigger value="board" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-text data-[state=active]:text-white data-[state=active]:shadow-sm text-text-secondary hover:text-text">
                Board
              </TabsTrigger>
            </TabsList>

            {/* OFFICE tab */}
            <TabsContent value="office" className="space-y-6">
              {/* Hero: Canvas + Agent Status */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 sm:gap-6">
                {/* Left: Office Canvas */}
                <div>
                  <OfficeCanvas
                    agents={agents}
                    transitions={transitions}
                    lastRefresh={lastRefresh}
                  />
                </div>

                {/* Right: Agent Status (active + upcoming) */}
                <div>
                  <AgentStatus agents={agents} />
                </div>
              </div>

              {/* Activity Ticker */}
              <ActivityTicker agents={agents} />
            </TabsContent>

            {/* BOARD tab */}
            <TabsContent value="board">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20 text-text-muted text-sm">
                    Loading board...
                  </div>
                }
              >
                <CompanyBoard />
              </Suspense>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
