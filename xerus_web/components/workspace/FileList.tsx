'use client'

import { useRef } from 'react'
import { FileText, Image as ImageIcon, FileSpreadsheet, File } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/lib/api/workspace'
import { getExtension, getTypeLabel, getEditabilityBadge, formatSize, TEXT_EXTENSIONS, IMAGE_EXTENSIONS } from './file-utils'

function getFileIcon(name: string) {
  const ext = getExtension(name)
  if (TEXT_EXTENSIONS.has(ext)) return <FileText className="w-4 h-4 text-text-secondary" />
  if (IMAGE_EXTENSIONS.has(ext)) return <ImageIcon className="w-4 h-4 text-blue-500" />
  if (ext === 'pdf') return <FileText className="w-4 h-4 text-red-500" />
  if (['docx', 'xlsx', 'pptx'].includes(ext)) return <FileSpreadsheet className="w-4 h-4 text-green-600" />
  return <File className="w-4 h-4 text-text-muted" />
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---------- Component ----------

interface FileListProps {
  files: FileNode[]
  selectedPath: string | null
  onSelect: (node: FileNode) => void
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void
  className?: string
}

export function FileList({ files, selectedPath, onSelect, onContextMenu, className }: FileListProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 52,
    overscan: 8,
  })

  return (
    <div className={cn('bg-surface rounded-3xl border border-surface-active shadow-sm overflow-hidden', className)}>
      {/* Header */}
      <div className="grid grid-cols-[1fr_100px_80px_100px_110px] gap-4 px-5 py-3 bg-surface-hover/50 border-b border-surface-active">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Name</span>
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Type</span>
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Size</span>
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Modified</span>
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Status</span>
      </div>

      {/* Virtualized rows */}
      <div
        ref={containerRef}
        className="overflow-auto"
        style={{ maxHeight: '600px' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const node = files[virtualRow.index]
            const isSelected = selectedPath === node.path
            const badge = getEditabilityBadge(node.path)

            return (
              <button
                key={node.path}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                onClick={() => onSelect(node)}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, node) : undefined}
                className={cn(
                  'absolute left-0 w-full grid grid-cols-[1fr_100px_80px_100px_110px] gap-4 px-5 py-3 items-center text-left transition-colors border-b border-surface-active/50',
                  isSelected ? 'bg-primary/5' : 'hover:bg-surface-hover/50',
                )}
                style={{
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {/* Name */}
                <span className="flex items-center gap-2.5 min-w-0">
                  {getFileIcon(node.name)}
                  <span className="text-sm font-medium text-text truncate">{node.name}</span>
                </span>

                {/* Type */}
                <span className="text-sm text-text-secondary">{getTypeLabel(node.name)}</span>

                {/* Size */}
                <span className="text-sm text-text-secondary tabular-nums">{formatSize(node.size)}</span>

                {/* Modified */}
                <span className="text-sm text-text-secondary">{formatDate(node.modified)}</span>

                {/* Status badge */}
                <span
                  className={cn(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium w-fit',
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
