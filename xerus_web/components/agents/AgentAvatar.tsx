'use client'

import React from 'react'
import type { Assistant } from "@/lib/api/types"
import { isMascotConfig } from '@/lib/mascot-config'
import { MascotAvatar } from './MascotAvatar'

const getModelIconPath = (modelName?: string): string | null => {
    const modelLower = modelName?.toLowerCase();

    if (modelLower?.includes('gpt') || modelLower?.includes('o1')) {
        return '/icons/openai.svg';
    }
    if (modelLower?.includes('claude')) {
        return '/icons/claude-color.svg';
    }
    if (modelLower?.includes('gemini')) {
        return '/icons/gemini-color.svg';
    }
    if (modelLower?.includes('deepseek')) {
        return '/icons/deepseek-color.svg';
    }
    if (modelLower?.includes('qwen')) {
        return '/icons/qwen-color.svg';
    }
    if (modelLower?.includes('llama') || modelLower?.includes('ollama')) {
        return '/icons/ollama.svg';
    }
    if (modelLower?.includes('perplexity')) {
        return '/icons/perplexity-color.svg';
    }
    if (modelLower?.includes('codex')) {
        return '/icons/openai.svg';
    }

    return null;
}

// Model Icons Component using real SVG files
export const ModelIcon = ({ model, size = 'sm' }: { model: string; size?: 'xs' | 'sm' | 'md' | 'lg' }) => {
    const sizeClasses = {
        xs: 'w-2 h-2',
        sm: 'w-2.5 h-2.5',
        md: 'w-4 h-4',
        lg: 'w-5 h-5'
    };

    const iconSize = sizeClasses[size];

    const iconPath = getModelIconPath(model);

    if (!iconPath) {
        return null;
    }

    return (
        <div className={`${iconSize} flex items-center justify-center rounded-sm overflow-hidden`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={iconPath}
                alt={`${model} icon`}
                className={`${iconSize} object-contain`}
            />
        </div>
    );
}

interface AgentAvatarProps {
    agent?: Assistant
    name?: string
    avatarUrl?: string
    model?: string
    id?: number | string
    className?: string
    hideBadge?: boolean
    size?: 'sm' | 'md' | 'lg'
}

const PIXEL_SIZES: Record<string, number> = {
    sm: 32,
    md: 40,
    lg: 48,
}

export const AgentAvatarWithModel = ({
    agent,
    name,
    avatarUrl,
    model,
    id,
    className,
    hideBadge,
    size = 'md'
}: AgentAvatarProps) => {
    const resolvedName = agent?.name || name || 'Agent'
    const resolvedModel = agent?.model || model
    // Priority: agent.avatarUrl > prop avatarUrl > hash-based SVG fallback
    const resolvedAvatarUrl = agent?.avatarUrl || avatarUrl || null
    const useMascot = isMascotConfig(resolvedAvatarUrl)
    const modelIconPath = getModelIconPath(resolvedModel)

    const sizeClasses = {
        sm: 'w-8 h-8',
        md: 'w-10 h-10',
        lg: 'w-12 h-12'
    }

    return (
        <div className={`relative ${className || sizeClasses[size]} rounded-xl bg-surface overflow-hidden`}>
            {useMascot ? (
                <MascotAvatar
                    config={resolvedAvatarUrl!}
                    size={PIXEL_SIZES[size] || 40}
                    className="w-full h-full"
                    alt={resolvedName}
                />
            ) : resolvedAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={resolvedAvatarUrl}
                    alt={resolvedName}
                    className="w-full h-full object-contain"
                />
            ) : (
                <span className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-semibold text-sm">
                    {resolvedName.substring(0, 2).toUpperCase()}
                </span>
            )}

            {/* Model Badge Overlay */}
            {(!hideBadge && resolvedModel && modelIconPath) && (
                <div className="absolute -bottom-0.5 -right-0.5 bg-white border border-surface-active rounded-tl-lg px-1.5 py-0.5 shadow-sm flex items-center gap-1 z-10">
                    <ModelIcon model={resolvedModel} size="xs" />
                </div>
            )}
        </div>
    )
}
