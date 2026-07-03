'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Pencil, Check, X } from 'lucide-react'
import { useAuth } from '@/utils/AuthContext'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { BusinessDataSection } from '@/components/company/BusinessDataSection'
import { apiCall } from '@/lib/api/client'
import { toast } from '@/lib/toast'

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

function MissionEditor({ domain, readme, onSaved }: { domain: string; readme: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState('')

  const missionLines = extractMission(readme)

  const startEditing = useCallback(() => {
    if (readme) {
      setDraft(readme)
    } else {
      setDraft(`# ${domain}\n\n## Mission\n\n`)
    }
    setEditing(true)
  }, [readme, domain])

  const cancel = useCallback(() => {
    setEditing(false)
    setDraft('')
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      await apiCall(`/workspace/files/projects/${encodeURIComponent(domain)}/CLAUDE.md`, {
        method: 'PUT',
        body: JSON.stringify({ content: draft }),
      })
      toast.success('Mission updated')
      setEditing(false)
      onSaved()
    } catch {
      // apiCall already shows error toast
    } finally {
      setSaving(false)
    }
  }, [domain, draft, onSaved])

  if (editing) {
    return (
      <section className="lg:col-span-3">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Mission
          </h2>
        </div>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="w-full min-h-[200px] p-3 rounded-lg bg-surface border border-border-secondary text-sm text-text-primary font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-accent-primary"
          placeholder="# Project Name&#10;&#10;## Mission&#10;&#10;Describe what this project is about..."
          autoFocus
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-primary text-white text-xs font-medium hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-hover text-text-secondary text-xs font-medium hover:bg-surface-hover/80 transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <span className="text-[10px] text-text-tertiary ml-2">
            Editing projects/{domain}/CLAUDE.md
          </span>
        </div>
      </section>
    )
  }

  return (
    <section className="lg:col-span-3">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Mission
        </h2>
        <button
          onClick={startEditing}
          className="p-1 rounded hover:bg-surface-hover transition-colors text-text-tertiary hover:text-text-primary"
          title="Edit mission"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line max-w-prose">
        {missionLines || (
          <button
            onClick={startEditing}
            className="text-accent-primary hover:underline cursor-pointer"
          >
            No project mission defined yet. Click to set one.
          </button>
        )}
      </div>
    </section>
  )
}

function ProjectHubInner() {
  const params = useParams<{ domain: string }>()
  const router = useRouter()
  const { isAuthReady } = useAuth()

  const { data, isLoading, error, mutate } = useSWR<{ data: ProjectOverviewData }>(
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
        <MissionEditor
          domain={params.domain!}
          readme={overview.readme}
          onSaved={() => mutate()}
        />

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
