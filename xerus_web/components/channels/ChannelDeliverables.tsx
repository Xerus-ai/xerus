'use client'

import { useState, useEffect } from 'react'
import { FileText, FileCode, FileImage, File, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChannelDeliverables, type Deliverable } from '@/hooks/useChannelData'
import { XerusLoader } from '@/components/common/XerusLoader'
import { getFile } from '@/lib/api/workspace'
import { MarkdownContent } from '@/components/chat/MarkdownContent'

interface ChannelDeliverablesProps {
  channelId: string
  className?: string
}

function fileIcon(fileType: string) {
  switch (fileType) {
    case 'code': return <FileCode className="w-5 h-5 text-blue-500" />
    case 'markdown': return <FileText className="w-5 h-5 text-orange-500" />
    case 'image': return <FileImage className="w-5 h-5 text-green-500" />
    default: return <File className="w-5 h-5 text-text-secondary" />
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DeliverableViewer({ deliverable, onClose }: { deliverable: Deliverable; onClose: () => void }) {
  const [fileContent, setFileContent] = useState<string | null>(deliverable.content ?? null)
  const [loading, setLoading] = useState(!deliverable.content)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (deliverable.content) return
    const path = `drive/deliverables/${deliverable.filename}`
    setLoading(true)
    getFile(path)
      .then((result) => setFileContent(result.content))
      .catch(() => setError('Could not load file content'))
      .finally(() => setLoading(false))
  }, [deliverable.content, deliverable.filename])

  const isMarkdown = deliverable.file_type === 'markdown' || deliverable.filename.endsWith('.md')
  const isCode = deliverable.file_type === 'code'
  const isHtml = deliverable.file_type === 'html' || deliverable.filename.endsWith('.html')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl max-h-[85vh] mx-4 bg-card rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            {fileIcon(deliverable.file_type)}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text truncate">{deliverable.filename}</h3>
              <p className="text-xs text-text-muted">
                {deliverable.author_slug} &middot; {new Date(deliverable.created_at).toLocaleDateString()}
                {deliverable.file_size_bytes > 0 && ` · ${formatBytes(deliverable.file_size_bytes)}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading && <XerusLoader variant="inline" />}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {fileContent && isMarkdown && (
            <div className="prose prose-sm prose-invert max-w-none">
              <MarkdownContent content={fileContent} />
            </div>
          )}
          {fileContent && isHtml && (
            <iframe
              srcDoc={fileContent}
              className="w-full h-[60vh] rounded-lg border border-border bg-white"
              sandbox="allow-scripts"
              title={deliverable.filename}
            />
          )}
          {fileContent && isCode && (
            <pre className="text-xs leading-relaxed bg-surface rounded-lg p-4 overflow-auto whitespace-pre-wrap font-mono">
              <code>{fileContent}</code>
            </pre>
          )}
          {fileContent && !isMarkdown && !isCode && !isHtml && (
            <pre className="text-sm leading-relaxed whitespace-pre-wrap font-mono">{fileContent}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

export function ChannelDeliverables({ channelId, className }: ChannelDeliverablesProps) {
  const { deliverables, isLoading, error } = useChannelDeliverables(channelId)
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null)

  if (isLoading) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <XerusLoader variant="inline" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex flex-col h-full items-center justify-center', className)}>
        <p className="text-sm text-text-secondary">{error}</p>
      </div>
    )
  }

  if (deliverables.length === 0) {
    return (
      <div className={cn('flex flex-col h-full items-center justify-center gap-3', className)}>
        <FileText className="w-10 h-10 text-text-secondary/50" />
        <p className="text-sm font-medium text-text-secondary">No deliverables yet</p>
        <p className="text-xs text-text-muted text-center max-w-[240px]">
          When agents complete work, their outputs will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="px-4 py-2 space-y-1">
        {deliverables.map((d) => (
          <div
            key={d.id}
            onClick={() => setSelectedDeliverable(d)}
            className="flex items-start gap-3 py-3 px-3 rounded-xl hover:bg-surface-hover transition-colors duration-150 group cursor-pointer"
          >
            <div className="flex-shrink-0 mt-0.5">
              {fileIcon(d.file_type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-sm font-medium text-text truncate">
                  {d.filename}
                </span>
                {d.file_size_bytes > 0 && (
                  <span className="text-xs text-text-muted tabular-nums flex-shrink-0">
                    {formatBytes(d.file_size_bytes)}
                  </span>
                )}
              </div>
              {d.content && (
                <p className="text-xs text-text-secondary line-clamp-2 mt-0.5">
                  {d.content}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-text-muted">{d.author_slug}</span>
                <span className="text-[10px] text-text-muted">
                  {new Date(d.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedDeliverable && (
        <DeliverableViewer
          deliverable={selectedDeliverable}
          onClose={() => setSelectedDeliverable(null)}
        />
      )}
    </div>
  )
}
