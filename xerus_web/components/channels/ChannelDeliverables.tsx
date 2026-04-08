'use client'

import { FileText, FileCode, FileImage, File, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChannelDeliverables } from '@/hooks/useChannelData'
import { XerusLoader } from '@/components/common/XerusLoader'

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

export function ChannelDeliverables({ channelId, className }: ChannelDeliverablesProps) {
  const { deliverables, isLoading, error } = useChannelDeliverables(channelId)

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
            className="flex items-start gap-3 py-3 px-3 rounded-xl hover:bg-surface-hover transition-colors group"
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
                  <span className="text-xs text-text-muted flex-shrink-0">
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
    </div>
  )
}
