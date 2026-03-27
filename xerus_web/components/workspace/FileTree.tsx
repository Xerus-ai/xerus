'use client'

import { useState, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Lock,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/lib/api/workspace'

// Directories that are read-only (shown with lock icon)
const READ_ONLY_DIRS = ['.memory', '.claude', 'marketplace', '.beads', 'context']

// Directories that support uploading (shown with + button)
const UPLOAD_DIRS = ['shared/knowledge', /^agents\/[^/]+\/knowledge$/, /^projects\/[^/]+\/knowledge$/]

function isUploadableDir(path: string): boolean {
  return UPLOAD_DIRS.some((pattern) =>
    typeof pattern === 'string' ? path === pattern || path.startsWith(pattern + '/') : pattern.test(path),
  )
}

function isReadOnlyDir(name: string): boolean {
  return READ_ONLY_DIRS.includes(name)
}

function countFiles(node: FileNode): number {
  if (node.type === 'file') return 1
  if (!node.children) return 0
  return node.children.reduce((sum, child) => sum + countFiles(child), 0)
}

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  selectedPath: string | null
  expandedPaths: Set<string>
  onSelect: (node: FileNode) => void
  onToggle: (path: string) => void
  onUploadClick?: (path: string) => void
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
  onUploadClick,
}: FileTreeNodeProps) {
  const isDir = node.type === 'directory'
  const isExpanded = expandedPaths.has(node.path)
  const isSelected = selectedPath === node.path
  const isReadOnly = isReadOnlyDir(node.name)
  const isUploadable = isDir && isUploadableDir(node.path)
  const fileCount = isDir ? countFiles(node) : 0

  const handleClick = () => {
    if (isDir) {
      onToggle(node.path)
      onSelect(node)
    } else {
      onSelect(node)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'group w-full flex items-center gap-1.5 py-1.5 px-2 rounded-lg text-left text-sm transition-colors',
          isSelected
            ? 'bg-surface-hover text-text'
            : 'text-text-secondary hover:bg-surface-hover/60 hover:text-text',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        title={node.path}
      >
        {/* Expand/collapse chevron for directories */}
        {isDir ? (
          <span className="w-4 h-4 flex items-center justify-center shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}

        {/* Icon */}
        {isDir ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 shrink-0 text-primary/70" />
          ) : (
            <Folder className="w-4 h-4 shrink-0 text-primary/70" />
          )
        ) : (
          <FileText className="w-4 h-4 shrink-0 text-text-muted" />
        )}

        {/* Name */}
        <span className="truncate flex-1 font-medium">{node.name}</span>

        {/* Badges */}
        <span className="flex items-center gap-1.5 shrink-0">
          {isReadOnly && <Lock className="w-3 h-3 text-text-muted" />}
          {isDir && fileCount > 0 && (
            <span className="text-[10px] text-text-muted tabular-nums">
              {fileCount}
            </span>
          )}
          {isUploadable && onUploadClick && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onUploadClick(node.path)
              }}
              className="w-4 h-4 rounded flex items-center justify-center text-text-muted hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
              title="Upload file"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </span>
      </button>

      {/* Children */}
      {isDir && isExpanded && node.children && (
        <div>
          {node.children
            .slice()
            .sort((a, b) => {
              // Directories first, then alphabetical
              if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
              return a.name.localeCompare(b.name)
            })
            .map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onSelect={onSelect}
                onToggle={onToggle}
                onUploadClick={onUploadClick}
              />
            ))}
        </div>
      )}
    </div>
  )
}

// ---------- FileTree (exported) ----------

interface FileTreeProps {
  root: FileNode | null
  selectedPath: string | null
  onSelect: (node: FileNode) => void
  onUploadClick?: (path: string) => void
  className?: string
}

export function FileTree({
  root,
  selectedPath,
  onSelect,
  onUploadClick,
  className,
}: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(['agents', 'projects', 'shared']),
  )

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  if (!root || !root.children) {
    return (
      <div className={cn('px-4 py-8 text-center text-text-muted text-sm', className)}>
        No files found
      </div>
    )
  }

  return (
    <nav className={cn('py-2 overflow-y-auto', className)} aria-label="Workspace file tree">
      {root.children
        .slice()
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        .map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={0}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onSelect={onSelect}
            onToggle={handleToggle}
            onUploadClick={onUploadClick}
          />
        ))}
    </nav>
  )
}
