'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { FolderOpen, Upload, LayoutGrid, FolderClosed } from 'lucide-react'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { XerusLoader } from '@/components/common/XerusLoader'
import { FloatingPanelProvider } from '@/components/common/FloatingPanelContext'
import { UploadPanel } from '@/components/upload/UploadPanel'
import { FileTree, FileEditor, TabBar } from '@/components/workspace'
import type { OpenTab } from '@/components/workspace'
import { BrowseView } from '@/components/workspace/BrowseView'
import type { ViewMode } from '@/components/workspace/BrowseView'
import { useWorkspaceSection, type WorkspaceSection } from '@/components/layout/WorkspaceSectionContext'
import { AgentsPanel } from '@/components/workspace/AgentsPanel'
import { SkillsPanel } from '@/components/workspace/SkillsPanel'
import { ConnectorsPanel } from '@/components/workspace/ConnectorsPanel'
import { AgentDetailView } from '@/components/workspace/AgentDetailView'
import { SkillDetailView } from '@/components/workspace/SkillDetailView'
import type { Assistant, Skill } from '@/lib/api/types'
import * as workspaceApi from '@/lib/api/workspace'
import type { FileNode, TreeResponse } from '@/lib/api/workspace'
import { findNode, matchesFilter, matchesSearch, sortFiles } from '@/components/workspace/file-utils'
import type { FileFilter, SortMode } from '@/components/workspace/file-utils'
import { cn } from '@/lib/utils'

const SECTION_PATHS: Partial<Record<WorkspaceSection, string>> = {
  agents: 'agents',
  skills: 'marketplace',
  connectors: 'connectors',
  knowledge: 'drive',
  memory: '.memory',
  projects: 'projects',
}

export default function WorkspacePage() {
  // Section from global context (driven by AppSidebar)
  const { activeSection, consumePendingPath } = useWorkspaceSection()
  const [contentViewMode, setContentViewMode] = useState<'ui' | 'browse'>('ui')
  const [detailView, setDetailView] = useState<{ type: 'agent'; id: string | number } | { type: 'skill'; slug: string } | null>(null)

  // File browser state
  const [tree, setTree] = useState<TreeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [currentDirPath, setCurrentDirPath] = useState<string | null>('drive')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FileFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortMode, setSortMode] = useState<SortMode>('name')
  // Editor state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false)
  const [uploadTargetPath, setUploadTargetPath] = useState<string>('')

  // Derived
  const isBrowseMode = activeSection === 'browse' || activeSection === 'files'
  const hasUIMode = activeSection === 'agents' || activeSection === 'skills' || activeSection === 'connectors'
  const showCardView = hasUIMode && contentViewMode === 'ui' && !detailView
  const showDetailView = hasUIMode && contentViewMode === 'ui' && detailView !== null
  const showFileBrowser = isBrowseMode || (!showCardView && !showDetailView)
  const isEditorMode = openTabs.length > 0 && activeTab !== null

  // --- File browser logic (existing, untouched) ---
  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try { setTree(await workspaceApi.getTree(5)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load workspace.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const currentNode = useMemo(() => {
    if (!tree?.root) return null
    return currentDirPath ? findNode(tree.root, currentDirPath) : tree.root
  }, [tree, currentDirPath])

  const visibleFiles = useMemo(() => {
    if (!currentNode) return []
    const files = (currentNode.children || []).filter((c) => c.type === 'file')
    return sortFiles(files.filter((f) => matchesFilter(f, activeFilter)).filter((f) => matchesSearch(f, searchQuery)), sortMode)
  }, [currentNode, activeFilter, searchQuery, sortMode])

  const visibleDirs = useMemo(() => {
    if (!currentNode) return []
    return (currentNode.children || []).filter((c) => c.type === 'directory').filter((c) => matchesSearch(c, searchQuery)).sort((a, b) => a.name.localeCompare(b.name))
  }, [currentNode, searchQuery])

  const knowledgeFolders = useMemo(() => {
    if (!tree?.root) return []
    const folders: Array<{ id: string; name: string }> = []
    function walk(node: FileNode) {
      if (node.type === 'directory' && (node.path.endsWith('/knowledge') || node.name === 'knowledge')) {
        folders.push({ id: node.path, name: node.path })
      }
      node.children?.forEach(walk)
    }
    walk(tree.root)
    const seen = new Set<string>()
    return folders.filter((f) => { if (seen.has(f.id)) return false; seen.add(f.id); return true })
  }, [tree])

  const activeFileNode = useMemo(() => (!activeTab || !tree?.root) ? null : findNode(tree.root, activeTab), [activeTab, tree])

  const openFileInEditor = useCallback((node: FileNode) => {
    if (node.type !== 'file') return
    setOpenTabs((prev) => prev.find((t) => t.path === node.path) ? prev : [...prev, { path: node.path, name: node.name, isDirty: false }])
    setActiveTab(node.path); setSelectedPath(node.path)
  }, [])

  // Use ref to avoid recreating on every tab switch (rule: rerender-use-ref-transient-values)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab

  const handleCloseTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.path !== path)
      if (activeTabRef.current === path) setActiveTab(next.length > 0 ? next[next.length - 1].path : null)
      return next
    })
  }, [])

  const handleDirtyChange = useCallback((path: string, isDirty: boolean) => {
    setOpenTabs((prev) => prev.map((t) => (t.path === path ? { ...t, isDirty } : t)))
  }, [])

  const handleTreeSelect = useCallback((node: FileNode) => {
    if (node.type === 'directory') { setCurrentDirPath(node.path); setSelectedPath(node.path) }
    else { openFileInEditor(node); setCurrentDirPath(node.path.includes('/') ? node.path.split('/').slice(0, -1).join('/') : 'drive') }
  }, [openFileInEditor])

  const handleDirClick = useCallback((node: FileNode) => { setCurrentDirPath(node.path); setSelectedPath(node.path) }, [])
  const handleCloseAll = useCallback(() => { setOpenTabs([]); setActiveTab(null) }, [])

  const confirmNewFolder = useCallback(async (folderName: string) => {
    const parentPath = currentDirPath || ''
    await workspaceApi.putFile(`${parentPath ? parentPath + '/' : ''}${folderName}/.keep`, '')
    setTree(await workspaceApi.getTree(5))
  }, [currentDirPath])

  const handleUploadFile = useCallback(async (file: File, _tags: string[], folderId: string | null) => {
    await workspaceApi.uploadFile(file, folderId || uploadTargetPath)
  }, [uploadTargetPath])

  const handleUploadComplete = useCallback(async () => { setTree(await workspaceApi.getTree(5)) }, [])

  // React to section changes from AppSidebar context
  const prevSectionRef = useRef(activeSection)
  useEffect(() => {
    if (prevSectionRef.current !== activeSection) {
      prevSectionRef.current = activeSection
      setDetailView(null)
      if (activeSection === 'files' || activeSection === 'browse') {
        if (activeSection === 'files') setCurrentDirPath('drive')
        setContentViewMode('browse')
      } else {
        const sectionPath = SECTION_PATHS[activeSection]
        if (sectionPath) setCurrentDirPath(sectionPath)
      }
    }
  }, [activeSection])

  // Consume pending path from sidebar (project/channel/doc navigation)
  // Runs when activeSection changes to 'browse' — ref is consumed once, no double-fire
  useEffect(() => {
    if (activeSection === 'browse') {
      const path = consumePendingPath()
      if (path) {
        setDetailView(null)
        setContentViewMode('browse')
        // If it's a file path (has extension), open it in editor
        if (path.includes('.') && !path.endsWith('/')) {
          const parts = path.split('/')
          const fileName = parts[parts.length - 1]
          setOpenTabs(prev => prev.find(t => t.path === path) ? prev : [...prev, { path, name: fileName, isDirty: false }])
          setActiveTab(path)
          setCurrentDirPath(parts.slice(0, -1).join('/') || 'drive')
        } else {
          setCurrentDirPath(path)
        }
      }
    }
  }, [activeSection, consumePendingPath])

  const activeSectionRef = useRef(activeSection)
  activeSectionRef.current = activeSection

  const handleContentViewChange = useCallback((mode: 'ui' | 'browse') => {
    setContentViewMode(mode)
    setDetailView(null)
    if (mode === 'browse') {
      setCurrentDirPath(SECTION_PATHS[activeSectionRef.current] || 'drive')
    }
  }, [])

  // Stable callbacks for panels (rule: rerender-functional-setstate)
  const handleAgentSelect = useCallback((agent: Assistant) => {
    setDetailView({ type: 'agent', id: agent.slug || agent.id })
  }, [])

  const handleSkillSelect = useCallback((skill: Skill) => {
    setDetailView({ type: 'skill', slug: skill.slug })
  }, [])

  // --- Render ---
  if (loading) return <XerusLoader message="Loading workspace..." />
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-8 h-8 text-text-secondary" />
          </div>
          <h2 className="text-lg font-serif text-text mb-2">Could not load workspace</h2>
          <p className="text-text-secondary mb-6 text-sm">{error}</p>
          <button onClick={fetchData} className="px-6 py-2.5 rounded-full bg-primary text-white hover:bg-primary/90 transition-colors text-sm font-medium">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <FloatingPanelProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-surface-active/40 shrink-0">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-text capitalize">
                {activeSection === 'files' ? 'All Files'
                  : activeSection === 'browse' ? (currentDirPath?.split('/').pop() || 'Browse')
                  : activeSection === 'connectors' ? 'Connectors'
                  : activeSection}
              </h3>
              {hasUIMode && (
                <div className="flex bg-surface-hover/50 p-0.5 rounded-lg">
                  <button
                    onClick={() => handleContentViewChange('ui')}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                      contentViewMode === 'ui' ? 'bg-white text-text shadow-sm' : 'text-text-secondary hover:text-text'
                    )}
                  >
                    <LayoutGrid className="w-3 h-3" />
                    Cards
                  </button>
                  <button
                    onClick={() => handleContentViewChange('browse')}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                      contentViewMode === 'browse' ? 'bg-white text-text shadow-sm' : 'text-text-secondary hover:text-text'
                    )}
                  >
                    <FolderClosed className="w-3 h-3" />
                    Files
                  </button>
                </div>
              )}
            </div>
            {showFileBrowser && (
              <button
                onClick={() => { setUploadTargetPath('drive'); setUploadPanelOpen(true) }}
                className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text transition-colors"
                title="Upload file"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden">
            {showDetailView && detailView ? (
              /* ---- Full detail view (replaces card grid) ---- */
              detailView.type === 'agent' ? (
                <AgentDetailView agentId={detailView.id} onBack={() => setDetailView(null)} />
              ) : (
                <SkillDetailView skillSlug={detailView.slug} onBack={() => setDetailView(null)} />
              )
            ) : showCardView ? (
              /* ---- UI Mode: Card grid ---- */
              <div className="h-full">
                {activeSection === 'agents' && (
                  <AgentsPanel onSelect={handleAgentSelect} />
                )}
                {activeSection === 'skills' && (
                  <SkillsPanel onSelect={handleSkillSelect} />
                )}
                {activeSection === 'connectors' && (
                  <ConnectorsPanel />
                )}
              </div>
            ) : (
              /* ---- Browse Mode: File browser with optional editor ---- */
              <div className="flex h-full">
                {activeSection === 'files' && (
                  <aside className="w-[200px] shrink-0 bg-surface-alt/30 border-r border-surface-active/40 overflow-y-auto scrollbar-thin hidden xl:block">
                    <FileTree
                      root={tree?.root ?? null}
                      selectedPath={selectedPath}
                      onSelect={handleTreeSelect}
                      onUploadClick={(path) => { setUploadTargetPath(path); setUploadPanelOpen(true) }}
                      className="py-1"
                    />
                  </aside>
                )}
                <PanelGroup orientation="horizontal" className="flex-1">
                  <Panel defaultSize={isEditorMode ? 45 : 100} minSize={20}>
                    <div className="flex flex-col h-full overflow-hidden">
                      <BrowseView
                        visibleDirs={visibleDirs}
                        visibleFiles={visibleFiles}
                        selectedPath={selectedPath}
                        currentDirPath={currentDirPath}
                        searchQuery={searchQuery}
                        activeFilter={activeFilter}
                        viewMode={viewMode}
                        sortMode={sortMode}
                        onSearchChange={setSearchQuery}
                        onFilterChange={setActiveFilter}
                        onViewModeChange={setViewMode}
                        onSortChange={setSortMode}
                        onDirClick={handleDirClick}
                        onFileClick={openFileInEditor}
                        onNavigateBack={(path) => {
                          // Never navigate above drive/ — that's the user's root
                          const safePath = (!path || path === '') ? 'drive' : path
                          setCurrentDirPath(safePath)
                          setSelectedPath(safePath)
                        }}
                        onUploadClick={(path) => { setUploadTargetPath(path); setUploadPanelOpen(true) }}
                        onNewFolder={confirmNewFolder}
                        showPropertyBar={isBrowseMode && currentDirPath?.startsWith('drive')}
                      />
                    </div>
                  </Panel>
                  {isEditorMode && (
                    <>
                      <PanelResizeHandle className="w-1.5 flex items-center justify-center cursor-col-resize group shrink-0">
                        <div className="w-px h-8 rounded-full bg-surface-active/40 group-hover:bg-primary/40 group-hover:h-16 transition-all" />
                      </PanelResizeHandle>
                      <Panel defaultSize={55} minSize={25}>
                        <div className="flex flex-col h-full overflow-hidden">
                          <TabBar tabs={openTabs} activeTab={activeTab} onSelectTab={setActiveTab} onCloseTab={handleCloseTab} onCloseAll={handleCloseAll} />
                          {activeTab && activeFileNode && (
                            <FileEditor key={activeTab} path={activeTab} name={activeFileNode.name} size={activeFileNode.size} onDirtyChange={handleDirtyChange} className="flex-1" />
                          )}
                        </div>
                      </Panel>
                    </>
                  )}
                </PanelGroup>
              </div>
            )}
          </div>
        </div>

        <UploadPanel
          context="workspace"
          isOpen={uploadPanelOpen}
          onClose={() => setUploadPanelOpen(false)}
          folders={knowledgeFolders}
          currentFolderId={uploadTargetPath || null}
          uploadFile={handleUploadFile}
          onUploadComplete={handleUploadComplete}
        />
      </div>
    </FloatingPanelProvider>
  )
}
