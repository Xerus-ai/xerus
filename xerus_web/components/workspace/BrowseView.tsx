'use client'

import { useState, useCallback } from 'react'
import { FolderOpen, Plus, Upload, Search, LayoutGrid, List, ArrowUpDown, FolderInput } from 'lucide-react'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { FolderCard, FolderSvgDefinitions, NewFolderCard } from '@/components/FolderCard'
import { FileCard } from './FileCard'
import { FileList } from './FileList'
import { ContextMenu, buildFileMenuItems, buildFolderMenuItems } from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
import type { FileNode } from '@/lib/api/workspace'
import * as workspaceApi from '@/lib/api/workspace'
import { countFiles } from './file-utils'
import type { FileFilter, SortMode } from './file-utils'
import { PropertyBar } from './PropertyBar'

export type ViewMode = 'grid' | 'list'

interface BrowseViewProps {
  visibleDirs: FileNode[]
  visibleFiles: FileNode[]
  selectedPath: string | null
  currentDirPath: string | null
  searchQuery: string
  activeFilter: FileFilter
  viewMode: ViewMode
  sortMode: SortMode
  onSearchChange: (query: string) => void
  onFilterChange: (filter: FileFilter) => void
  onViewModeChange: (mode: ViewMode) => void
  onSortChange: (mode: SortMode) => void
  onDirClick: (node: FileNode) => void
  onFileClick: (node: FileNode) => void
  onNavigateBack: (path: string | null) => void
  onUploadClick: (targetPath: string) => void
  onNewFolder: (name: string) => Promise<void>
  previews?: Record<string, string>
  showPropertyBar?: boolean
  sectionToggle?: React.ReactNode
}

export function BrowseView({
  visibleDirs,
  visibleFiles,
  selectedPath,
  currentDirPath,
  searchQuery,
  activeFilter,
  viewMode,
  sortMode,
  onSearchChange,
  onFilterChange,
  onViewModeChange,
  onSortChange,
  onDirClick,
  onFileClick,
  onNavigateBack,
  onUploadClick,
  onNewFolder,
  previews,
  showPropertyBar = false,
  sectionToggle,
}: BrowseViewProps) {
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  const handleFileContextMenu = useCallback((e: React.MouseEvent, file: FileNode) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: buildFileMenuItems(file.path, file.name, {
        onOpen: () => onFileClick(file),
        onDownload: () => {
          workspaceApi.downloadFile(file.path, file.name)
            .then(() => toast.success('File downloaded', { description: 'Check your downloads folder.' }))
            .catch(() => toast.error("Couldn't download this file", { description: 'Please try again.' }))
        },
        // Disabled until backend supports these operations
        // onRename: undefined,
        // onMoveTo: undefined,
        // onDelete: undefined,
      }),
    })
  }, [onFileClick])

  const handleFolderContextMenu = useCallback((e: React.MouseEvent, dir: FileNode) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: buildFolderMenuItems(dir.path, dir.name, {
        onOpen: () => onDirClick(dir),
        onUpload: () => onUploadClick(dir.path),
        // Disabled until backend supports these operations
        // onRename: undefined,
        // onDelete: undefined,
      }),
    })
  }, [onDirClick, onUploadClick])

  // Inline folder creation state (local to browse view)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderCreating, setFolderCreating] = useState(false)
  const [folderError, setFolderError] = useState('')

  const startNewFolder = useCallback(() => {
    setIsCreatingFolder(true)
    setNewFolderName('')
    setFolderError('')
  }, [])

  const cancelNewFolder = useCallback(() => {
    setIsCreatingFolder(false)
    setNewFolderName('')
    setFolderError('')
  }, [])

  const handleConfirmFolder = useCallback(() => {
    const name = newFolderName.trim()
    if (!name) { setFolderError('Name is required'); return }
    if (!/^[a-z0-9-_]+$/.test(name)) { setFolderError('Use lowercase letters, numbers, hyphens only'); return }
    setFolderCreating(true)
    onNewFolder(name)
      .then(() => {
        setIsCreatingFolder(false)
        setNewFolderName('')
      })
      .catch((err) => {
        setFolderError(err instanceof Error ? err.message : 'Failed')
      })
      .finally(() => setFolderCreating(false))
  }, [newFolderName, onNewFolder])

  return (
    <>
      {/* Search bar — Eden-style: dominant, full-width with scope chip */}
      <div className="shrink-0 px-3 sm:px-6 pt-3 sm:pt-6 pb-4">
        <div className="relative flex items-center bg-surface-hover rounded-xl overflow-hidden transition-all focus-within:ring-2 focus-within:ring-[#E5E5E5] px-1 py-1">
          <Search className="ml-3 w-4 h-4 text-text-muted shrink-0" />
          {currentDirPath && (
            <span className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card text-xs font-medium text-text shadow-sm shrink-0 border border-surface-active">
              <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
              {currentDirPath.split('/').pop()}
              <button onClick={() => onNavigateBack(null)} className="ml-1 text-text-muted hover:text-text">×</button>
            </span>
          )}
          <input
            type="text"
            placeholder="Search anything..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 min-w-0 pl-3 pr-2 py-2.5 bg-transparent text-sm text-text focus:outline-none placeholder:text-text-muted"
          />
          {/* View toggle — cards↔files when coming from a UI section, grid↔list otherwise */}
          {sectionToggle ? (
            <div className="mr-1 shrink-0">{sectionToggle}</div>
          ) : (
            <div className="mr-1 flex items-center gap-1 bg-card rounded-full p-0.5 border border-surface-active shrink-0">
              <button
                onClick={() => onViewModeChange('grid')}
                className={cn(
                  'p-1.5 rounded-full transition-colors',
                  viewMode === 'grid' ? 'bg-surface-active text-text' : 'text-text-muted hover:text-text',
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={cn(
                  'p-1.5 rounded-full transition-colors',
                  viewMode === 'list' ? 'bg-surface-active text-text' : 'text-text-muted hover:text-text',
                )}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Filter segmented control — matching tools/id page */}
        <div className="mt-4">
          <div className="inline-flex items-center bg-surface rounded-xl p-1 border border-surface-active">
            {(['all', 'markdown', 'json', 'config', 'media'] as FileFilter[]).map((filter) => {
              const labels: Record<string, string> = {
                all: 'All results',
                markdown: 'Markdown',
                json: 'JSON',
                config: 'Config',
                media: 'Media',
              }
              return (
                <button
                  key={filter}
                  onClick={() => onFilterChange(filter)}
                  className={cn(
                    'px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap',
                    activeFilter === filter
                      ? 'bg-card text-text shadow-sm'
                      : 'text-text-secondary hover:text-text',
                  )}
                >
                  {labels[filter]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        {/* Section header: current folder title + actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {currentDirPath && currentDirPath !== 'drive' && (
              <button
                onClick={() => onNavigateBack(
                  currentDirPath.includes('/') ? currentDirPath.split('/').slice(0, -1).join('/') : 'drive'
                )}
                className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
            <h2 className="font-serif text-2xl text-text tracking-tight">
              {!currentDirPath || currentDirPath === 'drive' ? 'Workspace' : currentDirPath.split('/').pop()}
            </h2>
            <button
              onClick={startNewFolder}
              className="p-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
              title="New folder"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const cycleModes: SortMode[] = ['name', 'modified', 'size']
                const idx = cycleModes.indexOf(sortMode)
                onSortChange(cycleModes[(idx + 1) % cycleModes.length])
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
            >
              {sortMode === 'name' ? 'Name' : sortMode === 'modified' ? 'Date created' : 'Size'}
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onUploadClick(currentDirPath || 'drive')}
              className="px-5 py-2 rounded-full bg-text text-white hover:bg-text/90 transition-colors text-sm font-medium flex items-center gap-2 shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>
        </div>

        {/* Property bar — connections + tags (Eden-style, workspace only) */}
        {showPropertyBar && currentDirPath && (
          <div className="mb-5">
            <PropertyBar filePath={currentDirPath} />
          </div>
        )}

        {/* Folders — responsive grid with FolderCard */}
        {(visibleDirs.length > 0 || isCreatingFolder) && (
          <div className="mb-8">
            <FolderSvgDefinitions />
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {/* Inline new folder creation — matches FolderCard silhouette */}
              {isCreatingFolder && (
                <NewFolderCard
                  value={newFolderName}
                  error={folderError}
                  creating={folderCreating}
                  onChange={(v) => {
                    setNewFolderName(v)
                    if (folderError) setFolderError('')
                  }}
                  onConfirm={handleConfirmFolder}
                  onCancel={cancelNewFolder}
                />
              )}
              {visibleDirs.map((dir, index) => (
                <FolderCard
                  key={dir.path}
                  title={dir.name}
                  fileCount={countFiles(dir)}
                  storageUsed={`${dir.children?.length ?? 0} items`}
                  accessUsers={[]}
                  delay={`${index * 50}ms`}
                  onClick={() => onDirClick(dir)}
                  onContextMenu={(e) => handleFolderContextMenu(e, dir)}
                  className={selectedPath === dir.path ? 'ring-2 ring-primary' : ''}
                />
              ))}
            </div>
          </div>
        )}

        {/* Files section */}
        {visibleFiles.length > 0 ? (
          <div>
            {visibleDirs.length > 0 && (
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
                Files
              </h3>
            )}

            {viewMode === 'grid' ? (
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {visibleFiles.map((file) => (
                  <FileCard
                    key={file.path}
                    node={file}
                    isSelected={selectedPath === file.path}
                    onClick={() => onFileClick(file)}
                    onContextMenu={(e) => handleFileContextMenu(e, file)}
                    preview={file.preview || previews?.[file.path] || null}
                  />
                ))}
              </div>
            ) : (
              <FileList
                files={visibleFiles}
                selectedPath={selectedPath}
                onSelect={onFileClick}
                onContextMenu={handleFileContextMenu}
              />
            )}
          </div>
        ) : visibleDirs.length === 0 ? (
          /* Empty state — matching old KB page style */
          <div className="text-center py-20 bg-surface rounded-xl border border-surface-active">
            <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderInput className="w-8 h-8 text-text-secondary" />
            </div>
            <h3 className="text-lg font-serif text-text mb-2">
              {searchQuery || activeFilter !== 'all'
                ? 'No matching files'
                : 'This folder is empty'}
            </h3>
            <p className="text-text-secondary mb-6 text-sm">
              {searchQuery
                ? 'Try a different search term or filter.'
                : 'Upload documents or create a folder to get started.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={startNewFolder}
                className="px-6 py-2.5 rounded-full border border-surface-active text-text hover:bg-surface-hover transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Folder
              </button>
              <button
                onClick={() => onUploadClick(currentDirPath || 'drive')}
                className="px-6 py-2.5 rounded-full bg-text text-white hover:bg-text/90 transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
