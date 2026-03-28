'use client'

import { WorkspaceTree, type WorkspaceFile } from './WorkspaceTree'
import { cn } from '@/lib/utils'
import { FolderOpen, PanelRightClose } from 'lucide-react'

interface ChatRightPanelProps {
  agentSlug: string | null
  workspaceFiles?: WorkspaceFile[]
  onFileSelect: (file: WorkspaceFile) => void
  isWorkspaceCollapsed: boolean
  onToggleWorkspace: () => void
  className?: string
}

// ---------------------------------------------------------------------------
// Workspace file browser panel (right side)
// ---------------------------------------------------------------------------

export function ChatRightPanel({
  agentSlug,
  workspaceFiles,
  onFileSelect,
  isWorkspaceCollapsed,
  onToggleWorkspace,
  className,
}: ChatRightPanelProps) {
  const expanded = !isWorkspaceCollapsed

  return (
    <div
      data-testid="chat-right-panel"
      className={cn(
        'hidden md:flex flex-col shrink-0 overflow-hidden',
        'h-full',
        'transition-all duration-200 ease-in-out',
        expanded
          ? 'w-[300px] bg-surface-alt/80 backdrop-blur-sm'
          : 'w-[140px]',
        className,
      )}
    >
      {/* Top row — workspace button + collapse icon */}
      <div className={cn(
        'flex items-center pt-4 pb-2.5 shrink-0',
        expanded ? 'px-3.5 justify-between' : 'justify-center px-3',
      )}>
        <button
          type="button"
          onClick={onToggleWorkspace}
          className={cn(
            'group flex items-center gap-2 px-3.5 py-2',
            'rounded-lg',
            'backdrop-blur-xl',
            'border border-surface-active',
            'hover:bg-surface-hover hover:border-surface-pressed',
            'active:scale-[0.97]',
            'transition-all duration-200',
            'text-[13px] font-medium select-none whitespace-nowrap text-text',
          )}
          aria-label={expanded ? 'Collapse workspace' : 'Open workspace'}
        >
          <FolderOpen className={cn('w-4 h-4 shrink-0', expanded && 'text-primary')} />
          Workspace
        </button>

        {expanded && (
          <button
            type="button"
            onClick={onToggleWorkspace}
            className="p-1 rounded-lg text-text-muted hover:text-primary transition-colors"
            aria-label="Collapse workspace"
          >
            <PanelRightClose className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {/* File tree — visible when expanded */}
      {expanded && (
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <WorkspaceTree
            agentSlug={agentSlug}
            files={workspaceFiles}
            onFileSelect={onFileSelect}
            isCollapsed={false}
            onToggle={onToggleWorkspace}
          />
        </div>
      )}
    </div>
  )
}
