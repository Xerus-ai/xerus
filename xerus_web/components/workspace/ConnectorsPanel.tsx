'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { ToolCard } from '@/components/tools/ToolCard'
import { useConnectedTools, useToolCatalog } from '@/hooks/useTools'
import { useToolAuth } from '@/hooks/useToolAuth'

export function ConnectorsPanel() {
  const router = useRouter()

  const {
    tools,
    loading,
    error,
    searchQuery,
    selectedCategories,
    updateSearch,
    toggleCategory,
    clearCategories,
    totalTools,
    categories,
    page,
    totalPages,
    setPage,
    refetch: refetchCatalog,
  } = useToolCatalog()

  const { tools: connectedTools, refetch: refetchActiveTools } = useConnectedTools()

  const refetch = useCallback(() => {
    refetchCatalog()
    refetchActiveTools()
  }, [refetchCatalog, refetchActiveTools])

  const { handleAuthConfigure, handleDisconnect } = useToolAuth(refetch)

  const activeTools = useMemo(() => {
    return connectedTools.filter((tool) => {
      const query = searchQuery.trim().toLowerCase()
      const matchesSearch = !query ||
        tool.name?.toLowerCase().includes(query) ||
        tool.description?.toLowerCase().includes(query) ||
        tool.tool_name?.toLowerCase().includes(query)
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(tool.category)
      return matchesSearch && matchesCategory
    })
  }, [connectedTools, searchQuery, selectedCategories])

  const libraryTools = useMemo(() => {
    return tools.filter(tool => !tool.is_configured)
  }, [tools])

  if (loading) {
    return (
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <PageHeader
            description="Manage and connect your apps to your AI agents"
            badge="Connectors"
            searchQuery=""
            onSearchChange={() => {}}
            searchPlaceholder="Search connectors..."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-surface rounded-[32px] p-6 shadow-sm h-[280px] animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        <h1 className="text-lg font-serif text-text mb-1">Something went wrong</h1>
        <p className="text-sm text-text-secondary max-w-xs">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-medium rounded-xl text-sm transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 flex flex-col items-start">
        <PageHeader
          description="Manage and connect your apps to your AI agents"
          badge="Connectors"
          searchQuery={searchQuery}
          onSearchChange={updateSearch}
          searchPlaceholder="Search connectors..."
          categories={categories}
          selectedCategories={selectedCategories}
          onToggleCategory={toggleCategory}
          onClearCategories={clearCategories}
        />

        {/* Active Connections */}
        {activeTools.length > 0 && (
          <div className="w-full mb-12">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="font-serif text-2xl text-text">Active Connections</h2>
              <span className="bg-[#FF6600]/10 text-[#FF6600] text-xs font-bold px-2 py-1 rounded-md">
                {activeTools.length} Active
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {activeTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  onClick={() => router.push(`/tools/${tool.id}`)}
                  onConnect={() => handleAuthConfigure(tool)}
                  onDisconnect={() => handleDisconnect(tool)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Library */}
        {libraryTools.length > 0 && (
          <div className="w-full">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="font-serif text-2xl text-text">Connectors Library</h2>
              <span className="bg-text-secondary/10 text-text-secondary text-xs font-bold px-2 py-1 rounded-md">
                {libraryTools.length} Available
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {libraryTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  onClick={() => router.push(`/tools/${tool.id}`)}
                  onConnect={() => handleAuthConfigure(tool)}
                  onDisconnect={() => handleDisconnect(tool)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalTools > 0 && totalPages > 1 && (
          <div className="w-full py-8 flex justify-center">
            <div className="flex items-center gap-4 text-sm text-text-secondary">
              <span>Showing {tools.length} of {totalTools}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-full border border-surface-active bg-surface hover:bg-surface-hover disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-full border border-surface-active bg-surface hover:bg-surface-hover disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
