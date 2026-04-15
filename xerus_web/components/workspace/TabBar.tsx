'use client'

import { X, FileText, Grid3X3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OpenTab {
  path: string
  name: string
  isDirty: boolean
}

interface TabBarProps {
  tabs: OpenTab[]
  activeTab: string | null
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
  onCloseAll?: () => void
  className?: string
}

export function TabBar({ tabs, activeTab, onSelectTab, onCloseTab, onCloseAll, className }: TabBarProps) {
  if (tabs.length === 0) return null

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-3 py-2 border-b border-surface-active bg-surface shrink-0',
        className,
      )}
    >
      {/* Tab pills — matching tools page segmented control */}
      <div className="flex items-center gap-0.5 bg-surface-hover rounded-[10px] p-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.path

          return (
            <div
              key={tab.path}
              className={cn(
                'group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-[8px] text-xs cursor-pointer transition-all min-w-0 max-w-[180px]',
                isActive
                  ? 'bg-card text-text shadow-sm font-medium'
                  : 'text-text-secondary hover:text-text',
              )}
              onClick={() => onSelectTab(tab.path)}
            >
              <FileText className="w-3 h-3 shrink-0" />
              <span className="truncate">{tab.name}</span>
              {tab.isDirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Unsaved changes" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.path)
                }}
                className="p-0.5 rounded hover:bg-surface-active text-text-muted hover:text-text transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                title="Close tab"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Browse button */}
      {onCloseAll && (
        <button
          onClick={onCloseAll}
          className="ml-auto px-3 py-1.5 rounded-[8px] text-xs text-text-secondary hover:text-text hover:bg-surface-hover transition-colors shrink-0 flex items-center gap-1.5 font-medium"
          title="Close all and browse"
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          Browse
        </button>
      )}
    </div>
  )
}
