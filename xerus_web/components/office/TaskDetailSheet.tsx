'use client'

import React, { useEffect, useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { Hash, User, Calendar, CheckCircle2, Circle, Paperclip, Tag, FileText, Pencil, X, Clock } from 'lucide-react'
import { PresenceAvatars } from '@/components/common/PresenceAvatars'
import type { KanbanTask } from '@/components/common/KanbanBoard'
import { apiGet } from '@/lib/api/client'
import { TaskComments as TaskCommentsShared } from '@/components/common/TaskComments'

function CircularProgress({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? (completed / total) * 100 : 0
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative w-7 h-7 flex items-center justify-center">
      <svg width="28" height="28" viewBox="0 0 28 28" className="rotate-[-90deg]">
        <circle cx="14" cy="14" r={radius} fill="none" stroke="#E5E0DA" strokeWidth="2.5" />
        <circle
          cx="14" cy="14" r={radius} fill="none"
          stroke={pct === 100 ? '#22C55E' : 'hsl(var(--primary))'}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[9px] font-semibold text-text-muted">
        {completed}/{total}
      </span>
    </div>
  )
}

interface ActivityEntry {
  id: string
  agent: string
  action: string
  timestamp: string
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface TaskDetailSheetProps {
  selectedTask: KanbanTask | null
  onClose: () => void
}

export function TaskDetailSheet({ selectedTask, onClose }: TaskDetailSheetProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)

  useEffect(() => {
    if (!selectedTask) {
      setActivities([])
      return
    }
    setActivitiesLoading(true)
    apiGet<{ data?: { activities: ActivityEntry[] } }>(`/tasks/${selectedTask.id}/activities`)
      .then((res) => {
        const data = res.data ?? res
        setActivities((data as { activities?: ActivityEntry[] }).activities ?? [])
      })
      .catch(() => setActivities([]))
      .finally(() => setActivitiesLoading(false))
  }, [selectedTask?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet
      open={selectedTask !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="!top-3 !right-3 !bottom-3 !h-auto !rounded-2xl !border !border-surface-active/30 !shadow-lg w-[500px] sm:max-w-[500px] p-0 overflow-y-auto bg-card"
      >
        {selectedTask && (
          <>
            {/* Top bar: breadcrumb + actions */}
            <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm px-7 pt-5 pb-3 flex items-center justify-between border-b border-surface-active/20">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                {selectedTask.channelTag && (
                  <>
                    <Hash className="w-3 h-3" />
                    <span>{selectedTask.channelTag.replace('/', ' / ')}</span>
                    <span className="mx-1.5 text-surface-active/60">|</span>
                  </>
                )}
                <span className="capitalize">{selectedTask.status.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-alt text-text-muted transition-colors" aria-label="Edit task">
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-alt text-text-muted transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-7 py-6">
              {/* Title */}
              <h2 className="font-serif text-[22px] text-text leading-tight mb-7">
                {selectedTask.title}
              </h2>

              {/* Metadata rows */}
              <div className="space-y-4 mb-7">
                {/* Status */}
                <div className="flex items-center">
                  <span className="w-[110px] text-[13px] text-text-muted flex items-center gap-2 flex-shrink-0">
                    <Circle className="w-4 h-4" strokeWidth={1.5} />
                    Status
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text capitalize">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: selectedTask.status === 'done' ? '#22C55E' : selectedTask.status === 'in_progress' ? '#3B82F6' : selectedTask.status === 'needs_approval' ? '#F59E0B' : '#6B7280' }}
                    />
                    {selectedTask.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Due date */}
                {(selectedTask.startDate || selectedTask.dueDate) && (
                  <div className="flex items-center">
                    <span className="w-[110px] text-[13px] text-text-muted flex items-center gap-2 flex-shrink-0">
                      <Calendar className="w-4 h-4" strokeWidth={1.5} />
                      Due date
                    </span>
                    <span className="text-[13px] font-medium text-text">
                      {selectedTask.dueDate
                        ? new Date(selectedTask.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
                        : selectedTask.startDate && new Date(selectedTask.startDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
                      }
                    </span>
                  </div>
                )}

                {/* Assignees */}
                {selectedTask.assignedAgents && selectedTask.assignedAgents.length > 0 && (
                  <div className="flex items-center">
                    <span className="w-[110px] text-[13px] text-text-muted flex items-center gap-2 flex-shrink-0">
                      <User className="w-4 h-4" strokeWidth={1.5} />
                      Assignee
                    </span>
                    <div className="flex items-center gap-2.5">
                      {selectedTask.assignedAgents.map(a => (
                        <span key={a.id} className="inline-flex items-center gap-1.5">
                          <PresenceAvatars agents={[a]} size="sm" maxVisible={1} showStatus={false} />
                          <span className="text-[13px] font-medium text-text">{a.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {selectedTask.labels && selectedTask.labels.length > 0 && (
                  <div className="flex items-center">
                    <span className="w-[110px] text-[13px] text-text-muted flex items-center gap-2 flex-shrink-0">
                      <Tag className="w-4 h-4" strokeWidth={1.5} />
                      Tags
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTask.labels.map((label) => (
                        <span
                          key={label.name}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                          style={{ backgroundColor: label.color + '15', color: label.color, border: `1px solid ${label.color}25` }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: label.color }} />
                          {label.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              {selectedTask.description && (
                <div className="mb-7">
                  <div className="flex items-center gap-2 mb-2.5">
                    <FileText className="w-4 h-4 text-text-muted" strokeWidth={1.5} />
                    <span className="text-[13px] text-text-muted">Description</span>
                  </div>
                  <div className="bg-surface-alt/50 rounded-xl px-4 py-3.5">
                    <div className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                      {selectedTask.description}
                    </div>
                  </div>
                </div>
              )}

              {/* Attachments */}
              <div className="mb-7">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-text-muted" strokeWidth={1.5} />
                    <span className="text-[13px] text-text-muted">
                      Attachments{selectedTask.attachments && selectedTask.attachments.length > 0 ? ` (${selectedTask.attachments.length})` : ''}
                    </span>
                  </div>
                </div>
                {selectedTask.attachments && selectedTask.attachments.length > 0 ? (
                  <div className="space-y-2">
                    {selectedTask.attachments.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-alt/50 hover:bg-surface-alt transition-colors"
                      >
                        <FileText className="w-4 h-4 text-primary flex-shrink-0" strokeWidth={1.5} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-text truncate">{file.name}</p>
                          <p className="text-[11px] text-text-muted truncate">{file.path}</p>
                        </div>
                        <span className="text-[10px] text-text-muted uppercase px-1.5 py-0.5 bg-surface rounded-md">
                          {file.type}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted py-4 text-center">No attachments</p>
                )}
              </div>

              {/* Tabs: Subtasks | Comments | Activity */}
              <Tabs defaultValue="subtasks">
                <TabsList className="bg-transparent border-b border-surface-active/30 rounded-none p-0 h-auto w-full justify-start gap-0">
                  <TabsTrigger
                    value="subtasks"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text data-[state=active]:shadow-none px-4 pb-2.5 pt-0 text-[13px] font-medium text-text-muted"
                  >
                    Subtasks
                  </TabsTrigger>
                  <TabsTrigger
                    value="comments"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text data-[state=active]:shadow-none px-4 pb-2.5 pt-0 text-[13px] font-medium text-text-muted"
                  >
                    Comments
                  </TabsTrigger>
                  <TabsTrigger
                    value="activity"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text data-[state=active]:shadow-none px-4 pb-2.5 pt-0 text-[13px] font-medium text-text-muted"
                  >
                    Activities
                    {activities.length > 0 && (
                      <span className="ml-1.5 bg-surface-alt rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                        {activities.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* Subtasks checklist */}
                <TabsContent value="subtasks" className="mt-5">
                  {selectedTask.subtaskItems && selectedTask.subtaskItems.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-text">Subtasks</h3>
                        <CircularProgress
                          completed={selectedTask.subtaskItems.filter(s => s.done).length}
                          total={selectedTask.subtaskItems.length}
                        />
                      </div>

                      <div className="space-y-0.5">
                        {selectedTask.subtaskItems.map((item, i) => (
                          <div key={i}>
                            <div className="flex items-start gap-2.5 py-2 px-1.5 rounded-lg hover:bg-surface-alt/30 transition-colors group">
                              {item.done ? (
                                <CheckCircle2 className="w-[18px] h-[18px] text-[#22C55E] flex-shrink-0 mt-px" />
                              ) : (
                                <Circle className="w-[18px] h-[18px] text-surface-active flex-shrink-0 mt-px" strokeWidth={1.5} />
                              )}
                              <span className={cn(
                                'text-[13px] flex-1',
                                item.done ? 'text-text-muted line-through' : 'text-text'
                              )}>
                                {item.text}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : selectedTask.subtasks && selectedTask.subtasks.total > 0 ? (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-text">Subtasks</h3>
                        <CircularProgress completed={selectedTask.subtasks.completed} total={selectedTask.subtasks.total} />
                      </div>
                      <div className="space-y-0.5">
                        {Array.from({ length: selectedTask.subtasks.total }, (_, i) => {
                          const done = i < selectedTask.subtasks!.completed
                          return (
                            <div key={i} className="flex items-start gap-2.5 py-2 px-1.5 rounded-lg">
                              {done ? (
                                <CheckCircle2 className="w-[18px] h-[18px] text-[#22C55E] flex-shrink-0 mt-px" />
                              ) : (
                                <Circle className="w-[18px] h-[18px] text-surface-active flex-shrink-0 mt-px" strokeWidth={1.5} />
                              )}
                              <span className={cn('text-[13px] flex-1', done ? 'text-text-muted line-through' : 'text-text')}>
                                Subtask {i + 1}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-text-muted py-6 text-center">No subtasks yet</p>
                  )}
                </TabsContent>

                {/* Comments */}
                <TabsContent value="comments" className="mt-5">
                  <TaskCommentsShared taskId={selectedTask.id} cardClassName="bg-surface-alt/50" />
                </TabsContent>

                {/* Activity */}
                <TabsContent value="activity" className="mt-5">
                  {activitiesLoading ? (
                    <p className="text-xs text-text-muted py-6 text-center">Loading activities...</p>
                  ) : activities.length > 0 ? (
                    <div className="space-y-3">
                      {activities.map((a) => (
                        <div key={a.id} className="flex items-start gap-3 py-1.5">
                          <div className="w-6 h-6 rounded-full bg-surface-alt flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Clock className="w-3 h-3 text-text-muted" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-text leading-snug">{a.action}</p>
                            <p className="text-[11px] text-text-muted mt-0.5">
                              {a.agent !== 'system' && <span className="font-medium">@{a.agent}</span>}
                              {a.agent !== 'system' && ' · '}
                              {timeAgo(a.timestamp)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted py-6 text-center">No activity recorded</p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
