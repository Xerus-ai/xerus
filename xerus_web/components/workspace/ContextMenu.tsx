'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  FolderOpen,
  Columns,
  Pencil,
  FolderInput,
  Share2,
  Download,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ContextMenuItem {
  label: string
  icon: React.ReactNode
  action: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
  dividerAfter?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPos, setAdjustedPos] = useState({ x, y })

  // Adjust position if menu would overflow viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    setAdjustedPos({
      x: x + rect.width > vw ? vw - rect.width - 8 : x,
      y: y + rect.height > vh ? vh - rect.height - 8 : y,
    })
  }, [x, y])

  // Close on click outside or escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[220px] py-2 bg-card rounded-2xl shadow-2xl border border-surface-active/60 animate-in fade-in zoom-in-95 duration-150"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {items.map((item, idx) => (
        <div key={idx}>
          <button
            onClick={() => {
              if (!item.disabled) {
                item.action()
                onClose()
              }
            }}
            disabled={item.disabled}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
              item.disabled
                ? 'text-text-muted cursor-not-allowed'
                : item.variant === 'danger'
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-text hover:bg-surface-hover',
            )}
          >
            <span className="w-5 h-5 flex items-center justify-center shrink-0 text-text-secondary">
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
          </button>
          {item.dividerAfter && (
            <div className="my-1.5 mx-3 h-px bg-surface-active" />
          )}
        </div>
      ))}
    </div>
  )
}

// Helper to build file context menu items
export function buildFileMenuItems(
  path: string,
  name: string,
  options: {
    onOpen: () => void
    onRename?: () => void
    onMoveTo?: () => void
    onDownload?: () => void
    onDelete?: () => void
  },
): ContextMenuItem[] {
  return [
    { label: 'Open', icon: <FolderOpen className="w-4 h-4" />, action: options.onOpen },
    { label: 'Open in new pane', icon: <Columns className="w-4 h-4" />, action: options.onOpen, dividerAfter: true },
    { label: 'Rename', icon: <Pencil className="w-4 h-4" />, action: options.onRename ?? (() => {}), disabled: !options.onRename },
    { label: 'Move to', icon: <FolderInput className="w-4 h-4" />, action: options.onMoveTo ?? (() => {}), disabled: !options.onMoveTo },
    { label: 'Download', icon: <Download className="w-4 h-4" />, action: options.onDownload ?? (() => {}), disabled: !options.onDownload, dividerAfter: true },
    { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, action: options.onDelete ?? (() => {}), variant: 'danger', disabled: !options.onDelete },
  ]
}

// Helper to build folder context menu items
export function buildFolderMenuItems(
  path: string,
  name: string,
  options: {
    onOpen: () => void
    onNewFile?: () => void
    onUpload?: () => void
    onRename?: () => void
    onDelete?: () => void
  },
): ContextMenuItem[] {
  return [
    { label: 'Open', icon: <FolderOpen className="w-4 h-4" />, action: options.onOpen, dividerAfter: true },
    { label: 'Upload here', icon: <Share2 className="w-4 h-4" />, action: options.onUpload ?? (() => {}), disabled: !options.onUpload },
    { label: 'Rename', icon: <Pencil className="w-4 h-4" />, action: options.onRename ?? (() => {}), disabled: !options.onRename, dividerAfter: true },
    { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, action: options.onDelete ?? (() => {}), variant: 'danger', disabled: !options.onDelete },
  ]
}
