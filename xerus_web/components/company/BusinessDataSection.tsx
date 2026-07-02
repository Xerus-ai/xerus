'use client'

import { TrendingUp, TrendingDown, Minus, FlaskConical, Users, Building2, User } from 'lucide-react'
import {
  useCompanyBusinessData,
  type Topic,
  type ResearchReport,
  type Prospect,
} from '@/hooks/useCompanyBusinessData'

// Business data agents produce in company.db — surfaced read-only on the project hub.
// company.db is workspace-wide, so this reflects company knowledge across all projects.

function SectionLabel({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">{children}</h3>
      <span className="text-xs text-text-muted tabular-nums">{count}</span>
    </div>
  )
}

function RelevancePill({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null
  return (
    <span className="text-[10px] font-medium text-text-muted tabular-nums px-1.5 py-0.5 rounded bg-surface-hover">
      {score}/10
    </span>
  )
}

function TrendBadge({ direction }: { direction: Topic['trend_direction'] }) {
  if (!direction) return null
  const config = {
    rising: { icon: TrendingUp, className: 'text-success' },
    declining: { icon: TrendingDown, className: 'text-warning' },
    stable: { icon: Minus, className: 'text-text-muted' },
  }[direction]
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${config.className}`}>
      <Icon className="w-3 h-3" />
      {direction}
    </span>
  )
}

function TopicCard({ topic }: { topic: Topic }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text truncate">{topic.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          <TrendBadge direction={topic.trend_direction} />
          <RelevancePill score={topic.relevance_score} />
        </div>
      </div>
      {topic.description && (
        <p className="text-xs text-text-secondary line-clamp-2 mt-1">{topic.description}</p>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[10px] text-text-muted">{topic.source_agent}</span>
        {topic.research_count > 0 && (
          <span className="text-[10px] text-text-muted">
            {topic.research_count} research run{topic.research_count !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

function ResearchReportCard({ report }: { report: ResearchReport }) {
  const preview = report.summary || report.key_findings
  return (
    <div className="px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover transition-colors">
      <div className="flex items-start gap-2">
        <FlaskConical className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-text block truncate">{report.topic}</span>
          {preview && (
            <p className="text-xs text-text-secondary line-clamp-2 mt-0.5">{preview}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-text-muted">{report.source_agent}</span>
            <span className="text-[10px] text-text-muted">{report.source_skill}</span>
            <span className="text-[10px] text-text-muted">
              {new Date(report.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="text-[10px] font-medium text-text-secondary px-1.5 py-0.5 rounded-full bg-surface-hover capitalize">
      {status}
    </span>
  )
}

function ProspectCard({ prospect }: { prospect: Prospect }) {
  const Icon = prospect.type === 'person' ? User : Building2
  return (
    <div className="px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-text-muted shrink-0" />
        <span className="text-sm font-medium text-text truncate flex-1">{prospect.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={prospect.status} />
          <RelevancePill score={prospect.relevance_score} />
        </div>
      </div>
      {prospect.notes && (
        <p className="text-xs text-text-secondary line-clamp-2 mt-1 pl-6">{prospect.notes}</p>
      )}
      <div className="flex items-center gap-2 mt-1.5 pl-6">
        <span className="text-[10px] text-text-muted">{prospect.source_agent}</span>
      </div>
    </div>
  )
}

export function BusinessDataSection() {
  const { data, isLoading } = useCompanyBusinessData()
  const { topics, research_reports, prospects } = data
  const total = topics.length + research_reports.length + prospects.length

  // Nothing to show yet — keep the hub uncluttered on projects without data.
  if (isLoading || total === 0) return null

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-text-muted" />
        <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Company Knowledge
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {topics.length > 0 && (
          <div>
            <SectionLabel count={topics.length}>Topics</SectionLabel>
            <div className="flex flex-col gap-2">
              {topics.map((t) => <TopicCard key={t.id} topic={t} />)}
            </div>
          </div>
        )}

        {research_reports.length > 0 && (
          <div>
            <SectionLabel count={research_reports.length}>Research Reports</SectionLabel>
            <div className="flex flex-col gap-2">
              {research_reports.map((r) => <ResearchReportCard key={r.id} report={r} />)}
            </div>
          </div>
        )}

        {prospects.length > 0 && (
          <div>
            <SectionLabel count={prospects.length}>Prospects</SectionLabel>
            <div className="flex flex-col gap-2">
              {prospects.map((p) => <ProspectCard key={p.id} prospect={p} />)}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
