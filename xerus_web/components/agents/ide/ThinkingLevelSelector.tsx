'use client'

import React from 'react'
import { Zap, Scale, Brain, Check } from 'lucide-react'

export type ThinkingLevel = 'low' | 'medium' | 'high'

interface ThinkingLevelSelectorProps {
    value: ThinkingLevel
    onChange: (level: ThinkingLevel) => void
}

const THINKING_OPTIONS = [
    {
        id: 'low' as ThinkingLevel,
        label: 'Low',
        icon: Zap,
        description: 'Fast responses with minimal reasoning. Best for simple, direct tasks.',
        tag: 'BEST FOR SPEED',
    },
    {
        id: 'medium' as ThinkingLevel,
        label: 'Medium',
        icon: Scale,
        description: 'Balanced reasoning and speed. Good for most everyday tasks.',
        tag: 'BEST FOR BALANCE',
    },
    {
        id: 'high' as ThinkingLevel,
        label: 'High',
        icon: Brain,
        description: 'Deep analysis with extended thinking. Best for complex problems.',
        tag: 'BEST FOR ACCURACY',
    },
]

export function ThinkingLevelSelector({ value, onChange }: ThinkingLevelSelectorProps) {
    return (
        <div className="bg-surface rounded-[24px] border border-surface-active p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-text mb-4">Thinking Level</h3>
            <div className="grid grid-cols-3 gap-3">
                {THINKING_OPTIONS.map((option) => {
                    const Icon = option.icon
                    const isSelected = value === option.id

                    return (
                        <button
                            key={option.id}
                            onClick={() => onChange(option.id)}
                            className={`p-5 rounded-xl text-left transition-all ${
                                isSelected
                                    ? 'bg-surface-hover border border-primary/30'
                                    : 'bg-surface-hover border border-transparent hover:border-surface-active'
                            }`}
                        >
                            {/* Radio + Title + Icon */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    {isSelected ? (
                                        <div className="w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                        </div>
                                    ) : (
                                        <div className="w-4 h-4 rounded-full border-2 border-surface-active shrink-0" />
                                    )}
                                    <span className="text-sm font-semibold text-text">{option.label}</span>
                                </div>
                                {isSelected ? (
                                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                    </div>
                                ) : (
                                    <Icon className="w-5 h-5 text-text-muted/40 shrink-0" />
                                )}
                            </div>

                            {/* Description */}
                            <p className="text-xs text-text-secondary leading-relaxed mb-3 pl-0">
                                {option.description}
                            </p>

                            {/* Tag */}
                            <span className={`inline-block ml-0 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                                isSelected
                                    ? 'text-primary bg-primary/10'
                                    : 'text-text bg-surface border border-surface-active'
                            }`}>
                                {option.tag}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
