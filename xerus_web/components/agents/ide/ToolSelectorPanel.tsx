'use client'

import React from 'react'
import { X, Minus, Plus, Search, Wrench, Lock, Loader2 } from 'lucide-react'
import { Input } from "@/components/ui/input"
import { FloatingPanel } from '@/components/common/FloatingPanel'
import { Tool } from "@/types/tool"

interface ToolSelectorPanelProps {
  isOpen: boolean
  onClose: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  availableToolsList: Tool[]
  totalTools: number
  toolsLoading: boolean
  toolsHasMore: boolean
  agentToolSlugs: string[]
  isEditable: boolean
  isCloning: boolean
  toolLoading: string | null
  configuringAuth: string | null
  onAddTool: (toolSlug: string) => void
  onRemoveTool: (toolSlug: string) => void
  onManageTool: (toolId: string) => void
  onConnectTool: (tool: Tool) => void
  onDisconnectTool: (tool: Tool) => void
  onClone: () => void
}

export function ToolSelectorPanel({
  isOpen,
  onClose,
  searchQuery,
  onSearchChange,
  availableToolsList,
  totalTools,
  toolsLoading,
  toolsHasMore,
  agentToolSlugs,
  isEditable,
  isCloning,
  toolLoading,
  configuringAuth,
  onAddTool,
  onRemoveTool,
  onManageTool,
  onConnectTool,
  onDisconnectTool,
  onClone,
}: ToolSelectorPanelProps) {
  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={() => {
        onClose()
        onSearchChange('')
      }}
      title="Connect Tools"
      minimizedTitle="Connect Tools"
      icon={<Wrench className="w-4 h-4" />}
      className="w-[680px] h-[650px] max-w-[95vw] max-h-[95vh] rounded-[40px] shadow-sm bg-surface p-2"
      variant="clean"
    >
      {({ close, minimize }) => (
        <div className="bg-white rounded-[32px] h-full w-full flex flex-col p-6 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  close()
                  onSearchChange('')
                }}
                className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-text" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  minimize()
                }}
                className="p-1.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full transition-colors"
                aria-label="Minimize"
              >
                <Minus className="w-4 h-4 text-text" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-text-secondary">
                Showing {availableToolsList.length} of {totalTools} tools
              </span>
              {toolsHasMore && (
                <span className="text-xs text-text-secondary">
                  Refine search to narrow more results
                </span>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <Input
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 bg-surface-alt border-surface-active focus:border-primary rounded-xl"
              autoFocus
            />
          </div>

          {/* Read-only notice for system templates */}
          {!isEditable && (
            <div className="flex items-center justify-between gap-3 p-4 mb-4 bg-primary/5 border border-primary/20 rounded-2xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm text-text">To add tools, clone this agent first.</span>
              </div>
              <button
                onClick={onClone}
                disabled={isCloning}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl text-sm transition-colors disabled:opacity-50 shrink-0 shadow-sm"
              >
                {isCloning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Clone
              </button>
            </div>
          )}

          {/* Tool List */}
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {toolsLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p className="text-sm">Loading tools...</p>
              </div>
            ) : availableToolsList.length > 0 ? (
              <div className="divide-y divide-surface-active">
                {availableToolsList.map((tool: Tool) => {
                  const isConfiguring = configuringAuth === (tool.tool_name || tool.name)
                  const isConnected = tool.is_configured
                  const isAlreadyAdded = agentToolSlugs.includes(tool.tool_name || tool.id)

                  return (
                    <div
                      key={tool.id || tool.tool_name}
                      className="py-3 first:pt-0 last:pb-0 flex items-center gap-4 group hover:bg-surface-alt/50 -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <div className="w-11 h-11 rounded-xl overflow-hidden border border-surface-active bg-white flex items-center justify-center shrink-0">
                        {tool.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={tool.icon}
                            alt={tool.name}
                            className="w-7 h-7 object-contain"
                          />
                        ) : (
                          <Wrench className="w-5 h-5 text-text-secondary" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-text text-sm truncate">{tool.name}</h4>
                        </div>
                        <p className="text-xs text-text-secondary line-clamp-1 mt-0.5">
                          {tool.description || 'No description'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isAlreadyAdded ? (
                          <>
                            <button
                              onClick={() => onManageTool(tool.tool_name || tool.id)}
                              className="flex items-center justify-center gap-1.5 bg-surface-hover hover:bg-surface-pressed text-text font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                            >
                              Manage
                            </button>
                            <button
                              onClick={() => {
                                onRemoveTool(tool.tool_name || tool.id)
                                if (tool.requires_auth && isConnected) {
                                  onDisconnectTool(tool)
                                }
                              }}
                              disabled={isConfiguring || !isEditable}
                              className="flex items-center justify-center gap-1.5 bg-black hover:bg-[#1a1a1a] text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
                            >
                              {isConfiguring ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                'Disconnect'
                              )}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => onAddTool(tool.tool_name || tool.id)}
                              disabled={!isEditable || toolLoading === (tool.tool_name || tool.id)}
                              className="flex items-center justify-center gap-1.5 bg-surface-hover hover:bg-surface-pressed text-text font-medium px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
                            >
                              {toolLoading === (tool.tool_name || tool.id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Plus className="w-4 h-4" />
                              )}
                              {toolLoading === (tool.tool_name || tool.id) ? 'Adding...' : 'Add'}
                            </button>
                            <button
                              onClick={() => !isConnected && onConnectTool(tool)}
                              disabled={isConfiguring || !isEditable || isConnected}
                              className={`flex items-center justify-center gap-1.5 font-medium px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50 ${
                                isConnected
                                  ? 'bg-primary text-white cursor-default'
                                  : 'bg-black hover:bg-[#1a1a1a] text-white'
                              }`}
                            >
                              {isConfiguring ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : isConnected ? (
                                'Connected'
                              ) : (
                                'Connect'
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-text-secondary">
                <Wrench className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  {searchQuery.trim()
                    ? 'No tools found matching your search.'
                    : 'All tools have been added to this agent.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </FloatingPanel>
  )
}
