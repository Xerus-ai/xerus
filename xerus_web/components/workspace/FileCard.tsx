'use client'

import { FileText, Image as ImageIcon, FileSpreadsheet, FileArchive, File } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/lib/api/workspace'
import { getExtension, getFileCategory, getEditabilityBadge, formatSize, IMAGE_EXTENSIONS } from './file-utils'


function getFileIcon(name: string, size: 'sm' | 'lg' = 'lg') {
  const category = getFileCategory(name)
  const s = size === 'lg' ? 'w-10 h-10' : 'w-4 h-4'
  switch (category) {
    case 'text': return <FileText className={cn(s, 'text-text-secondary')} />
    case 'image': return <ImageIcon className={cn(s, 'text-blue-500')} />
    case 'pdf': return <FileText className={cn(s, 'text-red-500')} />
    case 'office': return <FileSpreadsheet className={cn(s, 'text-green-600')} />
    case 'binary': return <FileArchive className={cn(s, 'text-text-muted')} />
    default: return <File className={cn(s, 'text-text-muted')} />
  }
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

// Eden's technique: render FULL ReactMarkdown at 40% zoom inside the card
// This is exactly what Eden does — zoom: 0.4 with serif headings + light body
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function MiniDocumentPreview({ content, isCode }: { content: string; isCode: boolean }) {
  if (isCode) {
    return (
      <pre className="text-[11px] leading-[1.6] whitespace-pre-wrap font-mono text-text/50">
        {content.slice(0, 500)}
      </pre>
    )
  }

  // Eden's exact technique: large sizes + zoom: 0.4
  // H1: 36px * 0.4 = ~14px visible, H2: 30px * 0.4 = ~12px, body: 11px * 0.4 = ~4.4px
  return (
    <div
      className="prose prose-sm max-w-none text-text prose-headings:text-text prose-headings:font-normal prose-headings:leading-[1.3] prose-strong:text-text prose-strong:font-semibold prose-code:bg-[#f0ede8] prose-code:rounded prose-code:px-1 prose-code:break-words prose-code:before:content-none prose-code:after:content-none prose-a:break-words prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:bg-[#f5f2ed] prose-pre:border prose-pre:border-[#E5E5E5] prose-pre:rounded prose-pre:p-2 prose-pre:my-2 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-img:max-w-full prose-img:h-auto prose-h1:text-[36px] prose-h1:font-normal prose-h1:mb-3 prose-h2:text-[30px] prose-h2:font-normal prose-h2:mb-2 prose-h3:text-[24px] prose-h3:font-normal prose-h3:mb-2 prose-h4:text-[21px] prose-h5:text-[19px] prose-h6:text-[17px] prose-hr:my-3 prose-hr:border-[#E5E5E5] prose-hr:opacity-80"
      style={{
        zoom: 0.4,
        padding: '16px 20px',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontWeight: 300,
        fontSize: '11px',
        lineHeight: 1.35,
      }}
    >
      {/* Headings use serif font via inline style — matching Eden's Lora */}
      <style>{`
        .mini-doc-preview h1, .mini-doc-preview h2, .mini-doc-preview h3 {
          font-family: 'Playfair Display', 'Lora', ui-serif, Georgia, serif;
        }
      `}</style>
      <div className="mini-doc-preview">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}

// Document skeleton placeholder — shown when no real preview content is available
// Matches Eden's loading/placeholder style with gray bars representing text lines
function DocumentSkeleton({ name }: { name: string }) {
  return (
    <div className="p-5 space-y-3">
      {/* Title bar */}
      <div className="h-3.5 bg-[#E8E6E1] rounded-full w-[75%]" />
      <div className="h-1" />
      {/* Body lines */}
      <div className="h-2 bg-[#EDEBE7] rounded-full w-full" />
      <div className="h-2 bg-[#EDEBE7] rounded-full w-[92%]" />
      <div className="h-2 bg-[#EDEBE7] rounded-full w-[85%]" />
      <div className="h-1.5" />
      {/* Subheading */}
      <div className="h-3 bg-[#E8E6E1] rounded-full w-[60%]" />
      <div className="h-1" />
      {/* More body */}
      <div className="h-2 bg-[#EDEBE7] rounded-full w-full" />
      <div className="h-2 bg-[#EDEBE7] rounded-full w-[88%]" />
      <div className="h-2 bg-[#EDEBE7] rounded-full w-[95%]" />
      <div className="h-2 bg-[#EDEBE7] rounded-full w-[70%]" />
      <div className="h-1.5" />
      {/* Bullet-like lines */}
      <div className="flex gap-2 items-center">
        <div className="w-1.5 h-1.5 rounded-full bg-[#E0DDD8]" />
        <div className="h-2 bg-[#EDEBE7] rounded-full flex-1" />
      </div>
      <div className="flex gap-2 items-center">
        <div className="w-1.5 h-1.5 rounded-full bg-[#E0DDD8]" />
        <div className="h-2 bg-[#EDEBE7] rounded-full w-[80%]" />
      </div>
      <div className="flex gap-2 items-center">
        <div className="w-1.5 h-1.5 rounded-full bg-[#E0DDD8]" />
        <div className="h-2 bg-[#EDEBE7] rounded-full w-[90%]" />
      </div>
    </div>
  )
}

// ---------- Component ----------

interface FileCardProps {
  node: FileNode
  isSelected: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  preview?: string | null
}

export function FileCard({ node, isSelected, onClick, onContextMenu, preview }: FileCardProps) {
  const category = getFileCategory(node.name)
  const badge = getEditabilityBadge(node.path)
  const ext = getExtension(node.name)
  const isImage = IMAGE_EXTENSIONS.has(ext)

  return (
    <div className="group flex flex-col gap-1.5" onContextMenu={onContextMenu}>
      {/* Card */}
      <button
        onClick={onClick}
        className={cn(
          'rounded-2xl overflow-hidden text-left transition-all duration-300 bg-white border',
          isSelected
            ? 'border-surface-active shadow-lg'
            : 'border-[#E5E5E5]/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:translate-y-[-2px]',
        )}
      >
        {/* Preview area — tall enough for zoomed content */}
        <div className="relative h-[220px] overflow-hidden bg-[#f0f0f0] p-1">
          {isImage ? (
            <div className="h-full flex items-center justify-center rounded-xl bg-[#F5F5F3]">
              <ImageIcon className="w-12 h-12 text-black/10" />
            </div>
          ) : category === 'text' ? (
            /* Eden layout: centered portrait card inside the preview area */
            <div className="h-full flex items-center justify-center" style={{ padding: '4px' }}>
              <div
                className="relative rounded-xl overflow-hidden shadow-[0_0_12px_rgba(0,0,0,0.05)] bg-white"
                style={{ aspectRatio: '0.71 / 1', width: 'auto', height: '100%', maxWidth: 'calc(100% - 8px)', maxHeight: 'calc(100% - 8px)' }}
              >
                <div className="absolute inset-0 w-full h-full overflow-hidden">
                  {preview ? (
                    <MiniDocumentPreview content={preview} isCode={ext !== 'md' && ext !== 'txt'} />
                  ) : (
                    <DocumentSkeleton name={node.name} />
                  )}
                </div>
                <div
                  className="absolute inset-x-0 bottom-0 h-6 pointer-events-none bg-white"
                  style={{ maskImage: 'linear-gradient(to top, black 0%, black 30%, transparent 100%)' }}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2 rounded-xl bg-[#F5F5F3]">
              {getFileIcon(node.name)}
              <span className="text-[10px] uppercase tracking-widest font-semibold text-black/20">
                {ext || 'file'}
              </span>
            </div>
          )}
        </div>
      </button>

      {/* Footer — outside the card, like Eden */}
      <div className="flex items-center gap-2 px-1">
        <span className="p-1 rounded-md bg-[#F0F0F0] shrink-0">
          {getFileIcon(node.name, 'sm')}
        </span>
        <span className="text-xs font-medium text-text truncate flex-1">
          {node.name.replace(/\.[^/.]+$/, '')}
        </span>
        <span className="text-[11px] text-text-muted shrink-0 tabular-nums">
          {formatRelativeTime(node.modified)}
        </span>
      </div>
    </div>
  )
}
