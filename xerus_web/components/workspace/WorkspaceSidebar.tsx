'use client'

import { cn } from '@/lib/utils'
import { Bot, Puzzle, BookOpen, Brain, FolderKanban, Files } from 'lucide-react'

import type { WorkspaceSection } from '@/components/layout/WorkspaceSectionContext'

const SECTIONS: { id: WorkspaceSection; label: string; icon: React.ElementType; dividerAfter?: boolean }[] = [
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'projects', label: 'Projects', icon: FolderKanban, dividerAfter: true },
  { id: 'files', label: 'All Files', icon: Files },
]

interface WorkspaceSidebarProps {
  activeSection: WorkspaceSection
  onSectionChange: (section: WorkspaceSection) => void
  counts?: Partial<Record<WorkspaceSection, number>>
}

export function WorkspaceSidebar({ activeSection, onSectionChange, counts }: WorkspaceSidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[220px] flex-shrink-0 border-r border-surface-active/50 bg-surface-alt/40 flex-col">
        <div className="px-4 pt-4 pb-2">
          <h2 className="font-serif text-lg text-text tracking-tight">Workspace</h2>
        </div>

        <nav className="flex-1 px-2 py-2 space-y-0.5">
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.id
            const Icon = section.icon
            const count = counts?.[section.id]
            return (
              <div key={section.id}>
                <button
                  onClick={() => onSectionChange(section.id)}
                  className={cn(
                    'flex items-center w-full gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-all duration-150',
                    isActive
                      ? 'bg-surface-hover/80 text-text font-medium'
                      : 'text-text-secondary hover:bg-surface-hover/40 hover:text-text'
                  )}
                >
                  <Icon className={cn('w-4 h-4', isActive ? 'text-text' : 'text-text-secondary')} />
                  <span className="flex-1 text-left">{section.label}</span>
                  {count !== undefined && count > 0 && (
                    <span className="text-[11px] tabular-nums text-text-secondary">{count}</span>
                  )}
                </button>
                {section.dividerAfter && (
                  <div className="border-t border-surface-active/30 my-2 mx-3" />
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      {/* Mobile horizontal nav */}
      <div className="lg:hidden border-b border-surface-active/50 bg-surface-alt/40 px-2 py-2 overflow-x-auto scrollbar-none shrink-0">
        <nav className="flex gap-1 min-w-max">
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.id
            const Icon = section.icon
            return (
              <button
                key={section.id}
                onClick={() => onSectionChange(section.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0',
                  isActive
                    ? 'bg-surface-hover/80 text-text'
                    : 'text-text-secondary hover:bg-surface-hover/40'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {section.label}
              </button>
            )
          })}
        </nav>
      </div>
    </>
  )
}
