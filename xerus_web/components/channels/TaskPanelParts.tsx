'use client'

import { useState } from 'react'
import { X, Paperclip, Download, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KanbanTask } from '@/components/common/TaskCard'
import {
  getLabelColorByName, fmtDateLong, timeAgo,
  STATUS_CFG, FILE_TYPE_COLORS, getFileExtension,
} from '@/lib/task-utils'

// ---------------------------------------------------------------------------
// Tag suggestions for non-technical business workflows
// ---------------------------------------------------------------------------

export const TAG_SUGGESTIONS = [
  'Strategy', 'Content', 'Research', 'Launch', 'Campaign',
  'Analytics', 'Design', 'Budget', 'Outreach', 'Review',
]

// ---------------------------------------------------------------------------
// FieldRow
// ---------------------------------------------------------------------------

export function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-2 w-28 shrink-0 mt-1 text-text-muted">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TagInput (inline pills + suggestion row, following UploadPanel pattern)
// ---------------------------------------------------------------------------

export function TagInput({ labels, labelInput, onLabelInputChange, onAddLabel, onRemoveLabel, onAddSuggestion }: {
  labels: string[]; labelInput: string; onLabelInputChange: (v: string) => void
  onAddLabel: () => void; onRemoveLabel: (l: string) => void; onAddSuggestion: (s: string) => void
}) {
  const available = TAG_SUGGESTIONS.filter(s => !labels.includes(s))
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-border/20 min-h-[36px]">
        {labels.map((label) => {
          const color = getLabelColorByName(label)
          return (
            <span key={label} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: color + '12', color, border: `1px solid ${color}25` }}>
              <svg width="5" height="5" viewBox="0 0 5 5"><circle cx="2.5" cy="2.5" r="2.5" fill={color} /></svg>
              {label}
              <button onClick={() => onRemoveLabel(label)} className="hover:opacity-70 ml-0.5" aria-label={`Remove ${label}`}><X className="w-3 h-3" /></button>
            </span>
          )
        })}
        <input
          value={labelInput}
          onChange={(e) => onLabelInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onAddLabel() }
            else if (e.key === 'Backspace' && !labelInput && labels.length > 0) { onRemoveLabel(labels[labels.length - 1]) }
          }}
          placeholder={labels.length === 0 ? 'Add tags...' : ''}
          className="flex-1 min-w-[80px] text-sm bg-transparent focus:outline-none text-text placeholder:text-text-muted"
        />
      </div>
      {available.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {available.slice(0, 6).map(s => (
            <button key={s} onClick={() => onAddSuggestion(s)} className="px-2 py-1 rounded-full bg-surface-hover text-xs text-text-secondary hover:bg-surface-pressed hover:text-text transition-colors whitespace-nowrap">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AttachmentSection
// ---------------------------------------------------------------------------

export function AttachmentSection({ count }: { count: number }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-semibold text-text">Attachment ({count})</span>
        </div>
        <button className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
          <Download className="w-3 h-3" />
          Download All
        </button>
      </div>
      <div className="flex items-center gap-3">
        {['document.pdf', 'config.json'].slice(0, count).map((name) => {
          const ext = getFileExtension(name)
          const colors = FILE_TYPE_COLORS[ext] || { bg: '#F3F4F6', text: '#4B5563' }
          return (
            <div key={name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border/10 min-w-[180px]">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: colors.bg, color: colors.text }}>
                {ext}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text truncate">{name}</p>
                <p className="text-[11px] text-text-muted">48 KB</p>
              </div>
            </div>
          )
        })}
        <button className="w-10 h-10 rounded-xl border-2 border-dashed border-border flex items-center justify-center hover:border-primary/40 hover:bg-primary/5 transition-colors">
          <Plus className="w-4 h-4 text-text-muted" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ActivityTabs (underline-style: Subtasks | Comments | Activities)
// ---------------------------------------------------------------------------

export function ActivityTabs({ task }: { task: KanbanTask }) {
  const [tab, setTab] = useState<'subtasks' | 'comments' | 'activities'>('activities')
  return (
    <div>
      <div className="flex items-center gap-6 border-b border-border/30 mb-4">
        {(['subtasks', 'comments', 'activities'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'pb-2 text-sm transition-colors border-b-2',
              tab === t
                ? 'border-primary text-text font-semibold'
                : 'border-transparent text-text-muted hover:text-text-secondary',
            )}
          >
            {t === 'subtasks' ? 'Subtasks' : t === 'comments' ? `Comments${task.commentCount ? ` ${task.commentCount}` : ''}` : 'Activities'}
          </button>
        ))}
      </div>
      {tab === 'activities' && (
        <div className="space-y-4 pb-2">
          {task.createdAt && (
            <ActivityItem text="Task created" date={fmtDateLong(task.createdAt)} />
          )}
          <ActivityItem
            text={<>Status changed to <span className="font-semibold">{STATUS_CFG[task.status]?.label || task.status}</span></>}
            date={task.createdAt ? timeAgo(task.createdAt) : ''}
          />
          {task.assignedAgents?.[0] && (
            <ActivityItem
              text={<>Assigned to <span className="font-semibold">{task.assignedAgents[0].name}</span></>}
              date={task.createdAt ? timeAgo(task.createdAt) : ''}
            />
          )}
        </div>
      )}
      {tab === 'subtasks' && (
        <p className="text-xs text-text-muted py-4 text-center">No subtasks yet.</p>
      )}
      {tab === 'comments' && (
        <p className="text-xs text-text-muted py-4 text-center">No comments yet.</p>
      )}
    </div>
  )
}

function ActivityItem({ text, date }: { text: React.ReactNode; date: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
      <div>
        <p className="text-sm font-medium text-text">{text}</p>
        <p className="text-xs text-text-muted">{date}</p>
      </div>
    </div>
  )
}
