'use client'

import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useAuth } from '@/utils/AuthContext'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { BusinessDataSection } from '@/components/company/BusinessDataSection'

interface ChannelOverview {
  slug: string
  id: string
  name: string
  description: string | null
  agent_count: number
  lead_name: string | null
}

interface AgentOverview {
  slug: string
  name: string
  status: string
  role: string
  channel_slug: string
}

interface SessionOverview {
  agent_slug: string
  status: string
  started_at: string
  completed_at: string | null
}

interface ProjectOverviewData {
  domain: { slug: string; name: string; description: string | null }
  readme: string
  channels: ChannelOverview[]
  agents: AgentOverview[]
  recent_sessions: SessionOverview[]
  cost_summary: { total_cost: number; session_count: number }
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? 'bg-emerald-400' : status === 'paused' ? 'bg-amber-400' : 'bg-zinc-400'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

function ProjectHubInner() {
  const params = useParams<{ domain: string }>()
  const router = useRouter()
  const { isAuthReady } = useAuth()

  const { data, isLoading, error } = useSWR<{ data: ProjectOverviewData }>(
    isAuthReady && params.domain ? `/company/domains/${params.domain}/overview` : null,
  )

  const overview = (data?.data ?? data) as ProjectOverviewData | undefined

  if (isLoading) {
    return (
      <main className="flex items-center justify-center h-full">
        <p className="text-sm text-text-secondary">Loading project...</p>
      </main>
    )
  }

  if (error || !overview) {
    return (
      <main className="flex items-center justify-center h-full">
        <p className="text-sm text-text-secondary">Project not found</p>
      </main>
    )
  }

  const runningCount = overview.agents.filter(a => a.status === 'running').length
  const totalAgents = overview.agents.length
  const missionLines = extractMission(overview.readme)

  return (
    <main className="flex flex-col h-full px-4 sm:px-6 lg:px-8 py-6 overflow-y-auto">
      {/* Project header */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
          {overview.domain.name}
        </h1>
        {overview.domain.description && (
          <p className="mt-1 text-sm text-text-secondary max-w-prose">
            {overview.domain.description}
          </p>
        )}
      </header>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <MetricCell label="Channels" value={overview.channels.length} />
        <MetricCell label="Agents" value={totalAgents} />
        <MetricCell
          label="Active now"
          value={runningCount}
          accent={runningCount > 0}
        />
        <MetricCell
          label="Sessions"
          value={overview.cost_summary.session_count}
        />
      </div>

      {/* Two-column: Mission + Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        {/* Mission (wider) */}
        <section className="lg:col-span-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-3">
            Mission
          </h2>
          <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line max-w-prose">
            {missionLines || 'No project mission defined yet. Edit projects/{domain}/CLAUDE.md to set one.'}
          </div>
        </section>

        {/* Channels */}
        <section className="lg:col-span-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-3">
            Channels
          </h2>
          <div className="flex flex-col gap-2">
            {overview.channels.map(ch => (
              <button
                key={ch.id}
                onClick={() => router.push(`/inbox/${params.domain}/${ch.slug}`)}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover transition-colors text-left group"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-text-primary group-hover:text-accent-primary truncate block">
                    {ch.name}
                  </span>
                  {ch.lead_name && (
                    <span className="text-xs text-text-tertiary">
                      Lead: {ch.lead_name}
                    </span>
                  )}
                </div>
                <span className="text-xs text-text-tertiary tabular-nums ml-2 shrink-0">
                  {ch.agent_count} agent{ch.agent_count !== 1 ? 's' : ''}
                </span>
              </button>
            ))}
            {overview.channels.length === 0 && (
              <p className="text-sm text-text-tertiary italic">No channels yet</p>
            )}
          </div>
        </section>
      </div>

      {/* Agent roster */}
      <section className="mb-8">
        <h2 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-3">
          Agent Roster
        </h2>
        {totalAgents > 0 ? (
          <div className="flex flex-wrap gap-2">
            {overview.agents.map(a => (
              <div
                key={`${a.slug}-${a.channel_slug}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface text-sm"
              >
                <StatusDot status={a.status} />
                <span className="font-medium text-text-primary">{a.name}</span>
                <span className="text-text-tertiary text-xs">{a.role}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary italic">No agents assigned to this project</p>
        )}
      </section>

      {/* Company knowledge — business data agents write to company.db */}
      <BusinessDataSection />

      {/* Recent activity */}
      {overview.recent_sessions.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-3">
            Recent Sessions
          </h2>
          <div className="flex flex-col gap-1">
            {overview.recent_sessions.map((s) => (
              <div key={`${s.agent_slug}-${s.started_at}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <StatusDot status={s.status} />
                <span className="text-text-primary font-medium min-w-[120px]">{s.agent_slug}</span>
                <span className="text-text-tertiary text-xs">
                  {formatTimeAgo(s.started_at)}
                </span>
                <span className={`text-xs ml-auto ${s.status === 'completed' ? 'text-emerald-500' : s.status === 'failed' ? 'text-red-400' : 'text-text-tertiary'}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function MetricCell({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-surface">
      <div className={`text-xl font-semibold tabular-nums ${accent ? 'text-emerald-500' : 'text-text-primary'}`}>
        {value}
      </div>
      <div className="text-xs text-text-tertiary mt-0.5">{label}</div>
    </div>
  )
}

function extractMission(readme: string): string {
  if (!readme) return ''
  const lines = readme.split('\n')
  const missionIdx = lines.findIndex(l => l.trim().toLowerCase().startsWith('## mission'))
  if (missionIdx === -1) return lines.slice(1, 6).join('\n').trim()
  const end = lines.findIndex((l, i) => i > missionIdx && l.startsWith('## '))
  const missionLines = lines.slice(missionIdx + 1, end === -1 ? missionIdx + 10 : end)
  return missionLines.join('\n').trim()
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function ProjectHubPage() {
  return (
    <ErrorBoundary label="Project Hub">
      <ProjectHubInner />
    </ErrorBoundary>
  )
}
