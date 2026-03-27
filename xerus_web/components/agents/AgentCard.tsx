'use client'

import React from 'react'
import type { Assistant } from "@/lib/api/types"
import { AgentAvatarWithModel, ModelIcon } from './AgentAvatar'
import { Loader2, Lock, Users, Plus, Wrench, Settings, Copy, ArrowRight } from 'lucide-react'
import { canCloneAgent, getAgentVisibilityClass } from "@/utils/agentLabels"
import { formatModelName } from "@/utils/models"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface AgentCardProps {
    agent: Assistant
    onClone?: (e: React.MouseEvent) => void
    onChat?: (e: React.MouseEvent) => void
    onClick?: () => void
    isCloning?: boolean
    isOwner?: boolean
}

const AgentCardComponent = ({ agent, onClone, onChat, onClick, isCloning, isOwner }: AgentCardProps) => {
    const isPublic = agent.agentType === 'public' || agent.agentType === 'shared'

    // Get visibility icon based on agent type
    const getVisibilityIcon = () => {
        switch (agent.agentType) {
            case 'private':
                return <Lock className="w-3 h-3" />;
            case 'shared':
                return <Users className="w-3 h-3" />;
            case 'public':
            default:
                return null;
        }
    };

    return (
        <div
            className="bg-surface hover:bg-surface-hover rounded-[32px] p-6 shadow-sm relative group h-full transition-all duration-300 cursor-pointer flex flex-col"
            onClick={onClick}
        >
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                {/* Icon with Model Badge */}
                <div className="relative pb-2">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border border-surface-active bg-surface-hover flex items-center justify-center">
                        <AgentAvatarWithModel agent={agent} hideBadge className="w-full h-full" />
                    </div>
                    {/* Model Badge */}
                    {agent.model && (
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-white border border-surface-active rounded-md px-2 py-0.5 shadow-sm flex items-center gap-0.5 z-10 whitespace-nowrap">
                            <ModelIcon model={agent.model} size="sm" />
                            <span className="text-[10px] font-bold text-text-secondary whitespace-nowrap">{formatModelName(agent.model)}</span>
                        </div>
                    )}
                </div>

                {/* Top Right - Tool Icons & Visibility Badge */}
                <div className="flex items-center gap-2">
                    {/* Tool Icons */}
                    {agent.tools && agent.tools.length > 0 && (
                        <TooltipProvider delayDuration={200}>
                            <div className="flex items-center -space-x-2">
                                {agent.tools.slice(0, 4).map((tool: any, idx: number) => (
                                    <Tooltip key={tool.name_slug || idx}>
                                        <TooltipTrigger asChild>
                                            <div
                                                className="w-8 h-8 rounded-lg bg-white border border-surface-active flex items-center justify-center overflow-hidden shadow-sm hover:scale-125 hover:z-10 transition-transform duration-200 cursor-default"
                                                style={{ zIndex: 4 - idx }}
                                            >
                                                {tool.img_src ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={tool.img_src}
                                                        alt={tool.name || tool.name_slug}
                                                        className="w-5 h-5 object-contain"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <Wrench className="w-4 h-4 text-text-secondary" />
                                                )}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="text-xs">
                                            {tool.name || tool.name_slug}
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                                {agent.tools.length > 4 && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div
                                                className="w-8 h-8 rounded-lg bg-surface-hover border border-surface-active flex items-center justify-center text-[10px] font-semibold text-text-secondary hover:scale-110 transition-transform duration-200 cursor-default"
                                                style={{ zIndex: 0 }}
                                            >
                                                +{agent.tools.length - 4}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="text-xs">
                                            {agent.tools.slice(4).map((t: any) => t.name || t.name_slug).join(', ')}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                        </TooltipProvider>
                    )}
                    {/* Visibility Badge */}
                    <div className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border ${agent.agentType === 'public' ? 'text-text-secondary bg-surface-alt border-surface-active' : getAgentVisibilityClass(agent.agentType)}`}>
                        {getVisibilityIcon()}
                        <span className="capitalize">{agent.agentType || 'public'}</span>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="mb-4">
                <div className="flex items-start gap-0.5 overflow-visible">
                    <h3 className="font-serif text-xl text-text group-hover:text-primary transition-colors line-clamp-1" title={agent.name}>
                        {agent.name}
                    </h3>
                    {agent.isVerified && (
                        <span className="shrink-0 w-3 h-3 bg-primary rounded-full flex items-center justify-center -mt-0.5" title="Verified">
                            <svg className="w-2 h-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </span>
                    )}
                </div>
                <p className="text-sm text-text-secondary leading-relaxed line-clamp-2">
                    {agent.description || "No description available."}
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
                {isOwner && onChat ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onChat(e);
                        }}
                        className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium py-2.5 rounded-xl text-sm shadow-sm transition-all"
                    >
                        Chat
                        <ArrowRight className="w-4 h-4" />
                    </button>
                ) : canCloneAgent(agent.agentType) && onClone ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClone(e);
                        }}
                        disabled={isCloning}
                        className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium py-2.5 rounded-xl text-sm shadow-sm transition-all disabled:opacity-50"
                    >
                        {isCloning ? (
                            <span className="flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Cloning...
                            </span>
                        ) : (
                            <>
                                <Copy className="w-4 h-4" />
                                Clone
                            </>
                        )}
                    </button>
                ) : (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClick?.();
                        }}
                        className="flex items-center justify-center gap-2 bg-surface-hover hover:bg-surface-pressed text-text font-medium py-2.5 rounded-xl text-sm transition-colors"
                    >
                        Details
                    </button>
                )}
            </div>
        </div>
    )
}

export const AgentCard = React.memo(AgentCardComponent)

interface CreateAgentCardProps {
    onClick?: () => void
}

export function CreateAgentCard({ onClick }: CreateAgentCardProps) {
    return (
        <div
            onClick={onClick}
            className="rounded-[32px] border-2 border-dashed border-surface-active hover:border-primary p-6 flex flex-col items-center justify-center text-center h-full min-h-[280px] hover:bg-surface-hover/50 transition-all duration-300 cursor-pointer group"
        >
            <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform duration-300">
                <Plus className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-serif text-xl text-text group-hover:text-primary transition-colors">
                Create New
            </h3>
            <p className="text-sm text-text-secondary mt-2 max-w-[200px]">
                Build a custom agent from scratch
            </p>
        </div>
    )
}
