'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Sparkles, ChevronDown } from 'lucide-react'
import { createAgent, formatPrompt } from '@/lib/api/agents'
import { getFeaturedModels, type ModelEntry } from '@/lib/api/models'
import { ModelIcon } from '@/components/agents/AgentAvatar'
import { formatModelName } from '@/utils/models'
import { slugify } from '@/utils/slugify'
import { toast } from '@/lib/toast'

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6'

const PROMPT_PLACEHOLDER = `## Identity
You are [Name], a [role] specialist.
Your mission is to [purpose] by [method].

## Goals
Primary goal: [What this agent delivers]

Success criteria:
- [Specific measurable outcome]
- [Quality standard]
- [Time or scope target]

## Capabilities
[Auto-populated from connected tools, skills, and knowledge base]

## Guidelines
- [Actionable behavioral rule]
- [Quality standard or work pattern]
- [Domain-specific best practice]

## Constraints
- [What the agent must not do]
- [Safety or data handling boundary]

## Personality
Style: [analytical, structured, casual, creative]
Tone: [direct, friendly, formal, enthusiastic]

## Examples (Optional)
User: [Example request]
Agent: [Example response pattern]`

export default function CreateAIAgentClient() {
    const router = useRouter()
    const [isCreating, setIsCreating] = useState(false)
    const [isFormatting, setIsFormatting] = useState(false)
    const [showModelDropdown, setShowModelDropdown] = useState(false)
    const [models, setModels] = useState<ModelEntry[]>([])
    const [isLoadingModels, setIsLoadingModels] = useState(true)

    const [form, setForm] = useState({
        name: '',
        description: '',
        system_prompt: '',
        ai_model: DEFAULT_MODEL,
        personality_type: 'assistant',
    })

    useEffect(() => {
        let cancelled = false
        getFeaturedModels()
            .then(data => { if (!cancelled) setModels(data) })
            .catch(() => { /* models fetch failed — fallback list used */ })
            .finally(() => { if (!cancelled) setIsLoadingModels(false) })
        return () => { cancelled = true }
    }, [])

    const selectedModel = models.find(m => m.id === form.ai_model)

    const handleWriteWithAI = async () => {
        if (!form.system_prompt.trim()) {
            toast.error('Missing content', { description: 'Describe what you want your agent to do.' })
            return
        }
        setIsFormatting(true)
        try {
            const result = await formatPrompt(form.system_prompt)
            setForm(prev => ({
                ...prev,
                system_prompt: result.system_prompt,
                personality_type: result.personality_type || prev.personality_type
            }))
        } catch {
            // API layer handles error toast
        } finally {
            setIsFormatting(false)
        }
    }

    const handleCreate = async () => {
        if (!form.name.trim()) {
            toast.error('Name required', { description: 'Every agent needs a name to get started.' })
            return
        }

        setIsCreating(true)
        try {
            const created = await createAgent({
                name: form.name.trim(),
                description: form.description.trim() || 'No description',
                ai_model: form.ai_model,
                personality_type: form.personality_type,
                system_prompt: form.system_prompt.trim(),
            })
            router.push(`/ai-agents/${created.id}/${slugify(created.name || '')}`)
        } catch {
            // API layer handles error toast
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <div className="min-h-screen">
            <div className="max-w-3xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-text-secondary hover:text-text transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="font-medium">Back</span>
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={isCreating || !form.name.trim()}
                        className="flex items-center gap-2 bg-[#FF6600] hover:bg-[#E65C00] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded-full transition-colors"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            'Create Agent'
                        )}
                    </button>
                </div>

                {/* Title */}
                <div className="mb-8">
                    <h1 className="font-serif text-3xl text-text mb-2">Create New Agent</h1>
                    <p className="text-text-secondary">Build a custom AI agent from scratch</p>
                </div>

                {/* Form Card */}
                <div className="bg-surface rounded-[32px] p-8 shadow-sm">
                    {/* Name & Model Row */}
                    <div className="grid grid-cols-2 gap-6 mb-6">
                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium text-text mb-2">Agent Name</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Enter agent name"
                                className="w-full px-4 py-3 bg-surface-alt border border-surface-active rounded-xl text-text placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-[#FF6600]/20 focus:border-[#FF6600] transition-all"
                            />
                        </div>

                        {/* Model Selector */}
                        <div>
                            <label className="block text-sm font-medium text-text mb-2">AI Model</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                    className="w-full flex items-center gap-3 px-4 py-3 bg-surface-alt border border-surface-active rounded-xl hover:bg-surface-hover transition-colors"
                                >
                                    <ModelIcon model={form.ai_model} size="lg" />
                                    <span className="flex-1 text-left text-text font-medium">{selectedModel ? selectedModel.displayName : formatModelName(form.ai_model)}</span>
                                    <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                {showModelDropdown && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-surface-active rounded-xl shadow-lg z-50 overflow-hidden max-h-64 overflow-y-auto">
                                        {isLoadingModels ? (
                                            <div className="px-4 py-3 text-text-secondary text-sm">Loading models...</div>
                                        ) : models.length === 0 ? (
                                            <div className="px-4 py-3 text-text-secondary text-sm">No models available</div>
                                        ) : (
                                            models.map(model => (
                                                <button
                                                    key={model.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setForm(prev => ({ ...prev, ai_model: model.id }))
                                                        setShowModelDropdown(false)
                                                    }}
                                                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors ${form.ai_model === model.id ? 'bg-surface-hover' : ''}`}
                                                >
                                                    <ModelIcon model={model.id} size="lg" />
                                                    <span className="text-text font-medium">{model.displayName}</span>
                                                    {form.ai_model === model.id && (
                                                        <span className="ml-auto w-2 h-2 rounded-full bg-[#FF6600]" />
                                                    )}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-text mb-2">Description</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Describe what your agent does..."
                            rows={3}
                            className="w-full px-4 py-3 bg-surface-alt border border-surface-active rounded-xl text-text placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-[#FF6600]/20 focus:border-[#FF6600] transition-all resize-none"
                        />
                    </div>

                    {/* System Prompt */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-text">System Prompt</label>
                            <button
                                onClick={handleWriteWithAI}
                                disabled={isFormatting || !form.system_prompt.trim()}
                                className="flex items-center gap-1.5 text-xs font-medium text-[#FF6600] hover:text-[#E65C00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {isFormatting ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="w-3.5 h-3.5" />
                                )}
                                {isFormatting ? 'Formatting...' : 'Write with AI'}
                            </button>
                        </div>
                        <textarea
                            value={form.system_prompt}
                            onChange={(e) => setForm(prev => ({ ...prev, system_prompt: e.target.value }))}
                            placeholder={PROMPT_PLACEHOLDER}
                            rows={12}
                            className="w-full px-4 py-3 bg-surface-alt border border-surface-active rounded-xl text-text placeholder:text-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-[#FF6600]/20 focus:border-[#FF6600] transition-all resize-none font-mono text-sm"
                        />
                        <p className="text-xs text-text-secondary mt-2">
                            Define who your agent is and how it works. Use the 6-section format (Identity, Goals, Capabilities, Guidelines, Constraints, Personality) for best results. Add Examples for common tasks. Capabilities are auto-populated from connected tools and skills.
                        </p>
                    </div>

                </div>
            </div>
        </div>
    )
}
