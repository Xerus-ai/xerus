'use client'

import React, { memo } from 'react'
import { Tool } from "@/types/tool"
import { Loader2, Settings } from 'lucide-react'

interface ToolCardProps {
    tool: Tool
    onClick?: () => void
    onConnect?: (e: React.MouseEvent) => void
    onDisconnect?: (e: React.MouseEvent) => void
    onStartStop?: (e: React.MouseEvent) => void
    isOperating?: boolean
}

const ToolCardComponent = ({ tool, onClick, onConnect, onDisconnect, onStartStop, isOperating }: ToolCardProps) => {
    const isConnected = tool.is_configured
    const isRunning = tool.server_status === 'running'
    const isMcp = !!tool.mcp_server

    return (
        <div
            className="bg-surface hover:bg-surface-hover rounded-[28px] p-4 shadow-sm relative group h-full transition-all duration-300 cursor-pointer flex flex-col"
            onClick={onClick}
        >
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                    {/* Icon with Status Badge */}
                    <div className="relative pb-2">
                        <div className="w-14 h-14 rounded-xl overflow-hidden border border-surface-active bg-surface-hover flex items-center justify-center p-2">
                            {tool.icon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={tool.icon}
                                    alt={tool.name}
                                    className="w-full h-full object-contain"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="w-full h-full bg-surface-hover flex items-center justify-center text-text-muted">
                                    <Settings className="w-6 h-6" />
                                </div>
                            )}
                        </div>
                        {/* Status Badge */}
                        <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 bg-card border border-surface-active px-1.5 py-0.5 rounded text-[9px] font-semibold shadow-sm flex items-center gap-1 whitespace-nowrap z-10 ${
                            isMcp
                                ? (isRunning ? 'text-text' : 'text-text-secondary')
                                : tool.requires_auth
                                    ? (isConnected ? 'text-text' : 'text-text-secondary')
                                    : 'text-text'
                        }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                                isMcp
                                    ? (isRunning ? 'bg-success' : 'bg-surface-active')
                                    : tool.requires_auth
                                        ? (isConnected ? 'bg-success' : 'bg-surface-active')
                                        : 'bg-success'
                            }`}></span>
                            {isMcp
                                ? (isRunning ? 'Running' : 'Stopped')
                                : tool.requires_auth
                                    ? (isConnected ? 'Connected' : 'Disconnected')
                                    : 'Ready'
                            }
                        </div>
                    </div>

                </div>

                {/* Body */}
                <div className="mb-4">
                    <h3 className="font-serif text-lg text-text mb-1 group-hover:text-secondary transition-colors line-clamp-1" title={tool.name}>
                        {tool.name}
                    </h3>
                    <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                        {tool.description || "No description available."}
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="mt-auto grid grid-cols-2 gap-3">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClick?.();
                        }}
                        className="flex items-center justify-center gap-2 bg-surface-hover hover:bg-surface-pressed text-text font-medium py-2.5 rounded-xl text-sm transition-colors"
                    >
                        <Settings className="w-4 h-4 text-text-secondary" />
                        Manage
                    </button>
                    {(tool.requires_auth && !isConnected && onConnect) ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onConnect(e);
                            }}
                            className="flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/90 text-white font-medium py-2.5 rounded-xl text-sm shadow-sm transition-all"
                        >
                            Connect
                        </button>
                    ) : (tool.requires_auth && isConnected && onDisconnect) ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDisconnect(e);
                            }}
                            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
                        >
                            Disconnect
                        </button>
                    ) : (isMcp && onStartStop) ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onStartStop(e);
                            }}
                            disabled={isOperating}
                            className={`flex items-center justify-center gap-2 font-medium py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 ${
                                isRunning
                                    ? 'bg-secondary/10 text-secondary hover:bg-primary hover:text-white'
                                    : 'bg-secondary hover:bg-secondary/90 text-white shadow-sm'
                            }`}
                        >
                            {isOperating ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {isRunning ? 'Stopping...' : 'Starting...'}
                                </span>
                            ) : (
                                isRunning ? 'Connected' : 'Connect'
                            )}
                        </button>
                    ) : null}
            </div>
        </div>
    )
}

export const ToolCard = memo(ToolCardComponent)
