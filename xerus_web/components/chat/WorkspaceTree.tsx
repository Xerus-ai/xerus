'use client'

import { useState, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  Image as ImageIcon,
  File,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceFile {
  name: string
  path: string
  type: 'file' | 'directory'
  extension?: string
  size?: number
  children?: WorkspaceFile[]
}

interface WorkspaceTreeProps {
  agentSlug: string | null
  files?: WorkspaceFile[]
  onFileSelect: (file: WorkspaceFile) => void
  isCollapsed?: boolean
  onToggle?: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFileIcon(file: WorkspaceFile, isOpen: boolean) {
  if (file.type === 'directory') {
    return isOpen ? (
      <FolderOpen className="h-4 w-4 text-primary" />
    ) : (
      <Folder className="h-4 w-4 text-primary" />
    )
  }

  const ext = file.extension ?? file.name.split('.').pop()?.toLowerCase()

  switch (ext) {
    case 'md':
    case 'txt':
    case 'log':
      return <FileText className="h-4 w-4 text-text-secondary" />
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'html':
    case 'css':
    case 'json':
    case 'yaml':
    case 'yml':
    case 'sql':
      return <FileCode className="h-4 w-4 text-text-secondary" />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return <ImageIcon className="h-4 w-4 text-text-secondary" />
    default:
      return <File className="h-4 w-4 text-text-secondary" />
  }
}

// ---------------------------------------------------------------------------
// Tree node
// ---------------------------------------------------------------------------

function TreeNode({
  file,
  depth,
  onFileSelect,
}: {
  file: WorkspaceFile
  depth: number
  onFileSelect: (file: WorkspaceFile) => void
}) {
  const [isOpen, setIsOpen] = useState(depth === 0)
  const isDir = file.type === 'directory'

  const handleClick = useCallback(() => {
    if (isDir) {
      setIsOpen((prev) => !prev)
    } else {
      onFileSelect(file)
    }
  }, [isDir, file, onFileSelect])

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-200',
          'hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isDir ? 'font-medium text-text' : 'text-text-secondary hover:text-text',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        aria-label={isDir ? `${isOpen ? 'Collapse' : 'Expand'} ${file.name}` : `Open ${file.name}`}
      >
        {isDir && (
          <span className="shrink-0">
            {isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        )}
        {!isDir && <span className="w-3 shrink-0" />}

        <span className="shrink-0">{getFileIcon(file, isOpen)}</span>
        <span className="truncate">{file.name}</span>
      </button>

      {isDir && isOpen && file.children && (
        <div>
          {file.children.map((child) => (
            <TreeNode
              key={child.path}
              file={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkspaceTree({
  agentSlug,
  files,
  onFileSelect,
  isCollapsed = false,
  onToggle,
}: WorkspaceTreeProps) {
  if (isCollapsed) {
    return (
      <div className="border-t border-surface-active">
        <Button
          variant="ghost"
          onClick={onToggle}
          className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-text hover:bg-surface"
          aria-label="Expand workspace tree"
        >
          <span>Workspace</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col border-t border-surface-active">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Workspace
        </span>
        {onToggle && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onToggle}
            className="h-6 w-6 text-text-secondary hover:text-text"
            aria-label="Collapse workspace tree"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-3">
          {!files || files.length === 0 ? (
            <p className="px-3 py-4 text-xs text-text-secondary text-center">
              No files yet
            </p>
          ) : (
            files.map((file) => (
              <TreeNode
                key={file.path}
                file={file}
                depth={0}
                onFileSelect={onFileSelect}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
