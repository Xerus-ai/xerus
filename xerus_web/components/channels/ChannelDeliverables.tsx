'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  FileText,
  FileCode,
  Image as ImageIcon,
  File,
  Download,
  ExternalLink,
  Upload,
  X,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useChannelDeliverables, type Deliverable } from '@/hooks/useChannelData'

interface ChannelDeliverablesProps {
  channelId: string
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getInitials(name: string): string {
  return name.charAt(0).toUpperCase()
}

function getFileIcon(fileType: Deliverable['file_type']) {
  switch (fileType) {
    case 'html':
    case 'pdf':
      return FileText
    case 'markdown':
      return FileText
    case 'code':
      return FileCode
    case 'image':
      return ImageIcon
    default:
      return File
  }
}

function getFileIconColor(fileType: Deliverable['file_type']): string {
  switch (fileType) {
    case 'html':
    case 'pdf':
      return 'text-red-500'
    case 'markdown':
      return 'text-blue-500'
    case 'code':
      return 'text-green-500'
    case 'image':
      return 'text-purple-500'
    default:
      return 'text-text-muted'
  }
}

// ---------------------------------------------------------------------------
// Preview component
// ---------------------------------------------------------------------------

function DeliverablePreview({
  deliverable,
  onClose,
}: {
  deliverable: Deliverable
  onClose: () => void
}) {
  return (
    <div className="border border-surface-active rounded-2xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-active">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-text truncate">
            {deliverable.filename}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            aria-label={`Open ${deliverable.filename} in new tab`}
            className={cn(
              'p-1.5 rounded-xl hover:bg-surface-hover transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2'
            )}
          >
            <ExternalLink className="w-4 h-4 text-text-secondary" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className={cn(
              'p-1.5 rounded-xl hover:bg-surface-hover transition-colors active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2'
            )}
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>
      </div>

      <div className="max-h-[400px] overflow-auto">
        {deliverable.file_type === 'markdown' && deliverable.content && (
          <div className="p-4 prose prose-sm max-w-none text-sm text-text [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_td]:p-2 [&_th]:bg-surface [&_tr]:border-b [&_tr]:border-surface-active">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {deliverable.content}
            </ReactMarkdown>
          </div>
        )}

        {deliverable.file_type === 'code' && deliverable.content && (
          <SyntaxHighlighter
            language={deliverable.language ?? 'text'}
            style={oneDark}
            customStyle={{ margin: 0, borderRadius: 0, fontSize: '13px' }}
          >
            {deliverable.content}
          </SyntaxHighlighter>
        )}

        {deliverable.file_type === 'image' && deliverable.preview_url && (
          <div className="relative p-4 flex items-center justify-center bg-surface-alt min-h-[200px]">
            <Image
              src={deliverable.preview_url}
              alt={deliverable.filename}
              width={600}
              height={360}
              className="max-w-full max-h-[360px] rounded-lg object-contain"
            />
          </div>
        )}

        {(deliverable.file_type === 'html' || deliverable.file_type === 'pdf') && (
          <div className="p-8 flex items-center justify-center bg-surface-alt">
            <div className="text-center">
              <FileText className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-secondary mb-2">
                Preview available via Daytona workspace
              </p>
              {deliverable.preview_url && (
                <a
                  href={deliverable.preview_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'inline-flex items-center gap-1 text-sm text-[#FF6600] hover:text-[#E65C00] font-medium',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600] focus-visible:ring-offset-2 rounded'
                  )}
                >
                  Open in new tab
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}

        {deliverable.file_type === 'other' && (
          <div className="p-8 flex items-center justify-center bg-surface-alt">
            <div className="text-center">
              <File className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-secondary">
                Preview not available for this file type.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChannelDeliverables({ className }: ChannelDeliverablesProps) {
  // Backend endpoint for deliverables is not yet implemented
  return (
    <div className={cn('flex flex-col h-full items-center justify-center gap-3', className)}>
      <FileText className="w-10 h-10 text-text-secondary/50" />
      <p className="text-sm font-medium text-text-secondary">Deliverables coming soon</p>
      <p className="text-xs text-text-muted text-center max-w-[240px]">
        Agents will be able to share files, reports, and other deliverables here.
      </p>
    </div>
  )
}
