'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  X, Minus, Calendar as CalendarIcon, User, Tag, FileText,
  Circle, Pencil, Eye, ArrowUp, Loader2,
} from 'lucide-react'
import { format } from 'date-fns'
import { FloatingPanel } from '@/components/common/FloatingPanel'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { KanbanTask } from '@/components/common/TaskCard'
import type { CreateTaskPayload, UpdateTaskPayload } from '@/hooks/useChannelData'
import {
  STATUS_CFG, PRIORITY_CFG, getAgentColor, getLabelColor,
  fmtDateLong,
} from '@/lib/task-utils'
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from '@/components/agents/MascotAvatar'
import { FieldRow, TagInput, AttachmentSection, ActivityTabs } from './TaskPanelParts'

// ---------------------------------------------------------------------------
// Avatar disc — renders mascot SVG, image URL, or letter fallback
// ---------------------------------------------------------------------------

function AgentAvatarDisc({
  name, avatarUrl, size = 20,
}: { name: string; avatarUrl?: string; size?: number }) {
  const hasMascot = isMascotConfig(avatarUrl)
  const hasImageUrl = !!avatarUrl && !hasMascot
  const color = getAgentColor(name)
  const dim = { width: size, height: size }

  if (hasMascot) {
    return (
      <span className="inline-flex rounded-full overflow-hidden" style={dim}>
        <MascotAvatar config={avatarUrl!} size={size} className="w-full h-full" alt={name} />
      </span>
    )
  }
  if (hasImageUrl) {
    return (
      <span className="inline-flex rounded-full overflow-hidden" style={dim}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white"
      style={{
        ...dim,
        backgroundColor: color,
        fontSize: Math.max(Math.round(size * 0.45), 9),
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskPanelProps {
  mode: 'view' | 'create' | 'edit'
  task?: KanbanTask | null
  isOpen: boolean
  onClose: () => void
  onSubmit?: (payload: CreateTaskPayload) => Promise<void>
  onUpdate?: (taskId: string, payload: UpdateTaskPayload) => Promise<KanbanTask | null>
  isSubmitting?: boolean
  defaultStatus?: string
  channelTag?: string
  agents?: Array<{ id: string; name: string; slug: string; avatar_url?: string }>
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TaskPanel({
  mode: initialMode,
  task,
  isOpen,
  onClose,
  onSubmit,
  onUpdate,
  isSubmitting = false,
  defaultStatus,
  channelTag,
  agents = [],
}: TaskPanelProps) {
  const [mode, setMode] = useState(initialMode)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<string>('medium')
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [assignee, setAssignee] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  // Sync form state when task or mode changes
  useEffect(() => {
    setMode(initialMode)
    if (task && (initialMode === 'view' || initialMode === 'edit')) {
      setTitle(task.title)
      setDescription(task.description || '')
      setPriority(task.priority || 'medium')
      setDueDate(task.dueDate ? new Date(task.dueDate) : undefined)
      setAssignee(task.assignedAgents?.[0]?.slug || '')
      setLabels(task.labels?.map(l => l.name) || [])
    } else if (initialMode === 'create') {
      setTitle('')
      setDescription('')
      setPriority('medium')
      setDueDate(undefined)
      setAssignee('')
      setLabels([])
    }
  }, [task, initialMode])

  useEffect(() => {
    if (isOpen && initialMode === 'create') {
      setTimeout(() => titleRef.current?.focus(), 100)
    }
  }, [isOpen, initialMode])

  const handleAddLabel = useCallback(() => {
    const trimmed = labelInput.trim()
    if (trimmed && !labels.includes(trimmed)) {
      setLabels(prev => [...prev, trimmed])
      setLabelInput('')
    }
  }, [labelInput, labels])

  const handleSave = useCallback(async () => {
    if (mode === 'create' && onSubmit) {
      if (!title.trim()) return
      const payload: CreateTaskPayload = { title: title.trim(), priority: priority as CreateTaskPayload['priority'] }
      if (description.trim()) payload.description = description.trim()
      if (dueDate) payload.due_date = format(dueDate, 'yyyy-MM-dd')
      if (labels.length > 0) payload.labels = labels
      if (defaultStatus) payload.status = defaultStatus
      if (assignee) payload.assigned_agents = [assignee]
      await onSubmit(payload)
      onClose()
    } else if (mode === 'edit' && task && onUpdate) {
      const payload: UpdateTaskPayload = {}
      if (title.trim() !== task.title) payload.title = title.trim()
      if (description !== (task.description || '')) payload.description = description || null
      if (priority !== task.priority) payload.priority = priority
      if (assignee !== (task.assignedAgents?.[0]?.slug || '')) payload.assigned_agent = assignee || null
      if (Object.keys(payload).length > 0) await onUpdate(task.id, payload)
      setMode('view')
    }
  }, [mode, title, description, priority, dueDate, labels, assignee, defaultStatus, task, onSubmit, onUpdate, onClose])

  const isEditable = mode === 'create' || mode === 'edit'
  const statusKey = task?.status || defaultStatus || 'open'
  const statusInfo = STATUS_CFG[statusKey] || STATUS_CFG.open
  const panelTitle = mode === 'create' ? 'New Task' : (task?.title || 'Task')

  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title={panelTitle}
      minimizedTitle={panelTitle}
      icon={<FileText className="w-4 h-4" />}
      className="w-[580px] h-[640px] max-w-[95vw] max-h-[90vh] rounded-[40px] shadow-sm bg-surface p-2"
      variant="clean"
    >
      {({ close, minimize }) => (
        <div className="bg-card rounded-2xl h-full w-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={close} className="p-1.5 bg-surface-hover hover:bg-surface-pressed rounded-full transition-colors" aria-label="Close">
                <X className="w-4 h-4 text-text" />
              </button>
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); minimize() }} className="p-1.5 bg-surface-hover hover:bg-surface-pressed rounded-full transition-colors" aria-label="Minimize">
                <Minus className="w-4 h-4 text-text" />
              </button>
            </div>

            {/* Breadcrumb + status */}
            <div className="flex items-center gap-2 text-[12px] text-text-muted">
              {(channelTag || task?.channelTag) && (
                <>
                  <span className="font-medium"># {channelTag || task?.channelTag}</span>
                  <span className="text-text-muted">|</span>
                </>
              )}
              <span style={{ color: statusInfo.color }}>{statusInfo.label}</span>
            </div>

            {/* Mode toggle */}
            {mode !== 'create' && (
              <div className="flex items-center bg-surface rounded-[14px] p-1">
                <button
                  onClick={() => setMode('view')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all',
                    mode === 'view' ? 'bg-card shadow-sm text-text' : 'text-text-secondary hover:text-text',
                  )}
                >
                  <Eye className="w-3.5 h-3.5" />
                  View
                </button>
                <button
                  onClick={() => setMode('edit')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all',
                    mode === 'edit' ? 'bg-card shadow-sm text-text' : 'text-text-secondary hover:text-text',
                  )}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="px-6 pb-3 shrink-0">
            {isEditable ? (
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title…"
                aria-label="Task title"
                className="w-full text-xl font-bold text-text bg-transparent border-none outline-none placeholder:text-text-muted/60 placeholder:italic placeholder:font-normal font-serif"
              />
            ) : (
              <h2 className="text-xl font-bold text-text font-serif">{task?.title}</h2>
            )}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-4">
            {/* Field rows */}
            <div className="space-y-4 mb-6">
              <FieldRow icon={<Circle className="w-4 h-4" strokeWidth={1.5} />} label="Status">
                <div className="flex items-center gap-2">
                  <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill={statusInfo.color} /></svg>
                  <span className="text-sm text-text">{statusInfo.label}</span>
                </div>
              </FieldRow>

              <FieldRow icon={<CalendarIcon className="w-4 h-4" />} label="Due date">
                {isEditable ? (
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border/20 text-sm transition-colors hover:border-primary/40',
                        dueDate ? 'text-text' : 'text-text-muted',
                      )}>
                        <CalendarIcon className="w-3.5 h-3.5" />
                        {dueDate ? format(dueDate, 'MMMM d, yyyy') : 'Select date'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dueDate} onSelect={(d) => { setDueDate(d ?? undefined); setCalendarOpen(false) }} />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span className="text-sm text-text">{task?.dueDate ? fmtDateLong(task.dueDate) : 'Not set'}</span>
                )}
              </FieldRow>

              <FieldRow icon={<User className="w-4 h-4" />} label="Assignee">
                {isEditable ? (
                  agents.length > 0 ? (
                    (() => {
                      const selectedAgent = assignee ? agents.find(a => a.slug === assignee) : null
                      return (
                        <Select value={assignee || '__none'} onValueChange={(v) => setAssignee(v === '__none' ? '' : v)}>
                          <SelectTrigger className="rounded-xl bg-surface border-border/20 h-9 text-sm w-52">
                            {selectedAgent ? (
                              <div className="flex items-center gap-2 min-w-0">
                                <AgentAvatarDisc name={selectedAgent.name} avatarUrl={selectedAgent.avatar_url} size={20} />
                                <span className="truncate leading-none">{selectedAgent.name}</span>
                              </div>
                            ) : (
                              <SelectValue placeholder="Unassigned" />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Unassigned</SelectItem>
                            {agents.map((a) => (
                              <SelectItem key={a.id} value={a.slug}>
                                <span className="flex items-center gap-2">
                                  <AgentAvatarDisc name={a.name} avatarUrl={a.avatar_url} size={20} />
                                  {a.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    })()
                  ) : (
                    <span className="text-xs text-text-muted italic">Add agents to this channel first</span>
                  )
                ) : task?.assignedAgents?.[0] ? (
                  <div className="flex items-center gap-2">
                    <AgentAvatarDisc name={task.assignedAgents[0].name} avatarUrl={task.assignedAgents[0].avatar_url} size={24} />
                    <span className="text-sm text-text">{task.assignedAgents[0].name}</span>
                  </div>
                ) : (
                  <span className="text-sm text-text-muted">Unassigned</span>
                )}
              </FieldRow>

              <FieldRow icon={<Tag className="w-4 h-4" />} label="Tags">
                {isEditable ? (
                  <TagInput labels={labels} labelInput={labelInput} onLabelInputChange={setLabelInput} onAddLabel={handleAddLabel} onRemoveLabel={(l) => setLabels(prev => prev.filter(x => x !== l))} onAddSuggestion={(s) => { if (!labels.includes(s)) setLabels(prev => [...prev, s]) }} />
                ) : task?.labels && task.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {task.labels.map((label) => {
                      const color = getLabelColor(label)
                      return (
                        <span key={label.name} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: color + '12', color, border: `1px solid ${color}25` }}>
                          <svg width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill={color} /></svg>
                          {label.name}
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <span className="text-sm text-text-muted">No tags</span>
                )}
              </FieldRow>
            </div>

            {/* Description */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-text-muted" />
                <span className="text-sm font-semibold text-text">Description</span>
              </div>
              {isEditable ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add more details..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-2xl bg-surface border border-border/20 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary/40 resize-none"
                />
              ) : (
                <div className="px-4 py-3 rounded-2xl bg-surface border border-border/10">
                  <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                    {task?.description || 'No description provided.'}
                  </p>
                </div>
              )}
            </div>

            {/* Attachments (view mode only) */}
            {mode === 'view' && task && ((task.attachments?.length ?? 0) > 0 || (task.attachmentCount ?? 0) > 0) && (
              <AttachmentSection count={task.attachmentCount || 0} items={task.attachments} />
            )}

            {/* Bottom tabs (view mode only) */}
            {mode === 'view' && task && <ActivityTabs task={task} />}
          </div>

          {/* Footer toolbar */}
          {isEditable && (
            <div className="mx-6 mb-5 p-1.5 rounded-2xl border border-border bg-card flex items-center justify-between shadow-sm shrink-0">
              <div className="flex items-center gap-2">
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-9 px-3 rounded-xl bg-transparent border-none text-sm font-medium text-text gap-1.5 hover:bg-surface transition-colors w-auto">
                    <div className="flex items-center gap-1.5">
                      <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill={PRIORITY_CFG[priority]?.color || '#F59E0B'} /></svg>
                      <span>{PRIORITY_CFG[priority]?.label || 'Medium'}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_CFG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill={cfg.color} /></svg>
                          {cfg.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button
                onClick={handleSave}
                disabled={isSubmitting || (mode === 'create' && !title.trim())}
                className="w-9 h-9 bg-text text-white rounded-xl flex items-center justify-center hover:bg-primary transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={mode === 'create' ? 'Create task' : 'Save changes'}
                title={mode === 'create' && !title.trim() ? 'Add a task title to create' : undefined}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      )}
    </FloatingPanel>
  )
}

