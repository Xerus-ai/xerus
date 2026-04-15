'use client'

import React, { Suspense, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CompanyBoard } from './CompanyBoard'
import { OfficeCanvas } from './OfficeCanvas'
import { AgentAvatarWithModel } from '@/components/agents/AgentAvatar'
import Link from 'next/link'
import {
  Building2,
  Clock,
  Zap,
  MessageSquare,
  Bot,
  ArrowRight,
  Sparkles,
  Users,
  Coffee,
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
            <Clock className="w-4 h-4 text-secondary" />
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

      {/* Agents exist but all idle — show "on break" with agent list */}
      {active.length === 0 && scheduled.length === 0 && agents.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Coffee className="w-4 h-4 text-text-muted" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">On Break</span>
            <span className="bg-surface-hover text-text-secondary text-xs font-bold px-2 py-0.5 rounded-md">
              {agents.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {agents.slice(0, 6).map(agent => (
              <div key={agent.id} className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <AgentAvatarWithModel
                    name={agent.name}
                    avatarUrl={agent.avatar_url}
                    size="sm"
                    hideBadge
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-surface" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text truncate">{agent.name}</p>
                  <p className="text-xs text-text-muted">Idle</p>
                </div>
              </div>
            ))}
            {agents.length > 6 && (
              <p className="text-xs text-text-muted pl-10">+{agents.length - 6} more</p>
            )}
          </div>
        </div>
      )}

      {/* No agents at all — show CTAs */}
      {agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-surface-hover flex items-center justify-center mb-4">
            <Sparkles className="w-5 h-5 text-text-muted" />
          </div>
          <p className="text-sm font-medium text-text">Your office is ready</p>
          <p className="text-xs text-text-muted mt-1 mb-6 max-w-[220px]">Start a conversation or hire agents to get things moving</p>
          <div className="flex flex-col gap-3 w-full">
            <Link
              href="/chat"
              className="group relative flex items-center gap-4 p-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.04] to-transparent hover:border-primary/40 hover:from-primary/[0.08] hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                <MessageSquare className="w-[18px] h-[18px] text-secondary" />
              </div>
              <div className="text-left min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-text">Chat with Xerus</p>
                <p className="text-[11px] text-text-muted mt-0.5">Ask anything to get started</p>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-secondary group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>
            <Link
              href="/workspace"
              className="group relative flex items-center gap-4 p-4 rounded-2xl border border-surface-active bg-surface-alt hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                <Users className="w-[18px] h-[18px] text-text-secondary group-hover:text-secondary transition-colors" />
              </div>
              <div className="text-left min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-text">Agent Marketplace</p>
                <p className="text-[11px] text-text-muted mt-0.5">Find and hire agents for your team</p>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-secondary group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>
          </div>
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

  return (
    <div className="bg-surface rounded-[32px] p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-text-muted" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
          Recent Activity
        </span>
      </div>
      {activities.length > 0 ? (
        <div className="space-y-2">
          {activities.map((activity, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activity.dot}`} />
              <span className="text-sm text-text font-medium">{activity.agent}</span>
              <span className="text-sm text-text-muted truncate">{activity.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">Activity from your agents will show up here.</p>
      )}
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
    <div className="min-h-full font-sans text-text">
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Page header */}
        <header className="mb-8 flex items-center gap-3">
          <Building2 className="w-7 h-7 text-secondary" />
          <div>
            <h1 className="font-serif text-2xl text-text tracking-tight">Welcome to your Office</h1>
            <p className="text-sm text-text-secondary">
              Here's what your AI workforce is up to
            </p>
          </div>
        </header>

        {isLoading ? (
          <XerusLoader variant="inline" />
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-text-secondary">{error}</p>
          </div>
        ) : (
          <Tabs defaultValue="office" className="space-y-6">
            <TabsList className="bg-surface p-[0.325rem] rounded-full inline-flex h-auto w-auto border-none">
              <TabsTrigger value="office" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-secondary/10 data-[state=active]:text-secondary data-[state=active]:shadow-sm text-text-secondary hover:text-text">
                Office
              </TabsTrigger>
              <TabsTrigger value="board" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-secondary/10 data-[state=active]:text-secondary data-[state=active]:shadow-sm text-text-secondary hover:text-text">
                Board
              </TabsTrigger>
            </TabsList>

            {/* OFFICE tab */}
            <TabsContent value="office" className="space-y-6 stagger-in">
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
