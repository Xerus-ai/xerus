'use client'

import React from 'react'
import { X, Plus, Settings, Loader2, Lock } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Tool } from "@/types/tool"

interface ConnectorsSectionProps {
  agentTools: any[]
  enrichedAgentTools: any[]
  isEditable: boolean
  isCloning: boolean
  toolLoading: string | null
  configuringAuth: string | null
  onOpenToolPanel: () => void
  onManageTool: (toolId: string) => void
  onConnectTool: (tool: Tool) => void
  onDisconnectTool: (tool: Tool) => void
  onRemoveTool: (toolSlug: string) => void
  onClone: () => void
}

function ConnectorsIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 5l3 -3"></path>
      <path d="m2 22 3-3"></path>
      <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"></path>
      <path d="M7.5 13.5 l2.5 -2.5"></path>
      <path d="M10.5 16.5 l2.5 -2.5"></path>
      <path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"></path>
    </svg>
  )
}

export function ConnectorsSection({
  agentTools,
  enrichedAgentTools,
  isEditable,
  isCloning,
  toolLoading,
  configuringAuth,
  onOpenToolPanel,
  onManageTool,
  onConnectTool,
  onDisconnectTool,
  onRemoveTool,
  onClone,
}: ConnectorsSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <div className="text-secondary">
          <ConnectorsIcon />
        </div>
        <h3 className="text-2xl font-serif text-text">Connectors</h3>
      </div>

      <div className="bg-surface rounded-xl border border-surface-active shadow-sm p-6">
        {agentTools.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
              <ConnectorsIcon size={32} className="text-text-secondary" />
            </div>
            <h3 className="text-lg font-serif text-text mb-2">No connectors yet</h3>
            <p className="text-text-secondary mb-6">Connect tools to give your agent capabilities.</p>
            <Button
              onClick={onOpenToolPanel}
              className="px-6 py-2.5 rounded-full bg-text text-white hover:bg-text/90 transition-colors text-sm font-medium inline-flex items-center gap-2 h-auto"
            >
              <Plus className="w-4 h-4" />
              Connect Tool
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Read-only notice for system templates */}
            {!isEditable && (
              <div className="flex items-center justify-between gap-3 p-4 bg-secondary/5 border border-secondary/20 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-secondary" />
                  </div>
                  <span className="text-sm text-text">To modify tools, clone this agent first.</span>
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

            {/* Tools List */}
            <div className="divide-y divide-surface-active">
              {enrichedAgentTools.map((tool: any) => {
                const toolSlug = tool.name_slug || tool.tool_name || tool.id
                const isConnected = tool.is_configured
                const isConfiguring = configuringAuth === (tool.tool_name || tool.name)

                return (
                  <div
                    key={toolSlug}
                    className="py-4 first:pt-0 last:pb-0 flex items-center gap-4"
                  >
                    {/* Tool Icon with Status Badge */}
                    <div className="relative pb-2 shrink-0">
                      <div className="w-14 h-14 rounded-xl overflow-hidden border border-surface-active bg-surface-hover flex items-center justify-center p-2">
                        {tool.img_src || tool.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={tool.img_src || tool.icon}
                            alt={tool.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Settings className="w-6 h-6 text-text-secondary" />
                        )}
                      </div>
                      <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 bg-card border border-surface-active px-1.5 py-0.5 rounded text-[9px] font-semibold shadow-sm flex items-center gap-1 whitespace-nowrap z-10 ${
                        tool.requires_auth
                          ? (isConnected ? 'text-text' : 'text-text-secondary')
                          : 'text-text'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          tool.requires_auth
                            ? (isConnected ? 'bg-green-500' : 'bg-surface-active')
                            : 'bg-green-500'
                        }`}></span>
                        {tool.requires_auth
                          ? (isConnected ? 'Connected' : 'Disconnected')
                          : 'Ready'
                        }
                      </div>
                    </div>

                    {/* Tool Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-text text-sm truncate">{tool.name}</h4>
                      <p className="text-xs text-text-secondary line-clamp-1 mt-0.5">
                        {tool.description || 'No description'}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onManageTool(toolSlug)}
                        className="flex items-center justify-center gap-1.5 bg-surface-hover hover:bg-surface-pressed text-text font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        Manage
                      </button>

                      {isConnected ? (
                        <button
                          onClick={() => onDisconnectTool(tool)}
                          disabled={isConfiguring}
                          className="flex items-center justify-center gap-1.5 bg-black hover:bg-text/90 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
                        >
                          {isConfiguring ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Disconnect'
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => onConnectTool(tool)}
                          disabled={isConfiguring}
                          className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50 shadow-sm"
                        >
                          {isConfiguring ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Connect'
                          )}
                        </button>
                      )}

                      {isEditable ? (
                        <button
                          onClick={() => onRemoveTool(toolSlug)}
                          disabled={toolLoading === toolSlug}
                          className="p-2 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Remove from agent"
                        >
                          {toolLoading === toolSlug ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                      ) : (
                        <div className="p-2 text-text-secondary/30 cursor-not-allowed" title="Clone agent to remove tools">
                          <X className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add Tool Button */}
            <div
              onClick={onOpenToolPanel}
              className="rounded-2xl border-2 border-dashed border-surface-active hover:border-primary py-4 flex items-center justify-center gap-3 hover:bg-surface-hover/50 transition-all duration-300 cursor-pointer group"
            >
              <div className="w-8 h-8 bg-surface rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                <Plus className="w-4 h-4 text-secondary" />
              </div>
              <span className="font-medium text-text-secondary group-hover:text-secondary transition-colors text-sm">
                Add Tool
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
