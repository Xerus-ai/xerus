'use client'

import React from 'react'
import { Brain, Shield, Activity, FileText, Lightbulb, Zap } from 'lucide-react'

type BehaviourSection = 'heartbeat' | 'thinking' | 'autonomy' | 'proactivity'

interface BehaviourContextPanelProps {
    activeSection: BehaviourSection
}

const SECTION_CONTENT: Record<BehaviourSection, {
    title: string
    icon: React.ElementType
    description: string
    tips: string[]
    cost: string
}> = {
    heartbeat: {
        title: 'Heartbeat File',
        icon: FileText,
        description:
            'Defines the agent\'s goals, daily rhythm, and self-improvement patterns. The agent reads this file to understand what it should track and how to grow over time.',
        tips: [
            'Start with clear short-term goals, then add long-term vision as you refine.',
            'Define daily reflection prompts to help the agent learn from each session.',
            'Set weekly review patterns so the agent can identify trends and adjust.',
        ],
        cost: 'Read once per session',
    },
    thinking: {
        title: 'Thinking Level',
        icon: Brain,
        description:
            'Controls how deeply the agent reasons before responding. Higher thinking levels use more tokens but produce more thorough analysis.',
        tips: [
            'Use Low for quick, factual lookups and simple tasks.',
            'Use Medium for general-purpose work like writing and summarizing.',
            'Use High for complex reasoning, debugging, or multi-step planning.',
        ],
        cost: 'Low ~1x · Medium ~2x · High ~4x tokens',
    },
    autonomy: {
        title: 'Autonomy Level',
        icon: Shield,
        description:
            'Determines how much independence the agent has when executing tasks. Higher autonomy means fewer approval prompts.',
        tips: [
            'Supervised mode is safest for untested agents or sensitive operations.',
            'Semi-autonomous lets agents handle routine edits but pause for destructive actions.',
            'Autonomous mode is ideal for trusted agents running well-defined workflows.',
        ],
        cost: 'No cost impact',
    },
    proactivity: {
        title: 'Proactivity',
        icon: Activity,
        description:
            'Configures whether the agent runs on a schedule. Proactive agents check in periodically and can take action without user prompts.',
        tips: [
            'Set active hours to avoid unnecessary runs outside business hours.',
            'Start with longer intervals and reduce as you build trust in the agent.',
            'Use weekdays-only mode for business-focused agents.',
        ],
        cost: '~5.5K tokens per scheduled check-in',
    },
}

export function BehaviourContextPanel({ activeSection }: BehaviourContextPanelProps) {
    const content = SECTION_CONTENT[activeSection]
    const Icon = content.icon

    return (
        <div className="bg-surface rounded-[24px] border border-surface-active p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-surface-hover">
                    <Icon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-text">
                    {content.title}
                </h3>
            </div>

            {/* Animated content swap */}
            <div
                key={activeSection}
                className="animate-in fade-in duration-200"
            >
                <p className="text-sm text-text leading-relaxed mb-4">
                    {content.description}
                </p>

                {/* Cost hint */}
                <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-surface-hover rounded-lg">
                    <Zap className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-xs text-text-secondary">{content.cost}</span>
                </div>

                <div className="space-y-2.5">
                    <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="w-3 h-3 text-primary" />
                        <span className="text-xs font-semibold text-text-secondary">
                            Tips
                        </span>
                    </div>
                    {content.tips.map((tip, index) => (
                        <div
                            key={index}
                            className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed"
                        >
                            <span className="text-primary font-bold mt-px shrink-0">
                                {index + 1}.
                            </span>
                            <span>{tip}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
