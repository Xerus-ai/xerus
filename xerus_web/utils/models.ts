/**
 * Model display utilities
 * Shared formatting for AI model names across components
 */

/** Strip provider prefix and date suffixes for display */
export const formatModelName = (model: string): string => {
    const withoutProvider = model.includes('/') ? model.split('/')[1] : model
    return withoutProvider.replace(/-\d{8}$/, '')
}

/** Centralized model-to-icon mapping. Used by AgentAvatar, AgentDropdown, etc. */
export const getModelIconPath = (modelName?: string): string | null => {
    if (!modelName) return null
    const m = modelName.toLowerCase()

    // Anthropic / Claude
    if (m.includes('claude')) return '/icons/claude-color.svg'
    // OpenAI / GPT / o-series / Codex
    if (m.includes('gpt') || m.includes('openai/o1') || m.includes('openai/o3') || m.includes('openai/o4') || m.includes('codex')) return '/icons/openai.svg'
    if (m.startsWith('openai/')) return '/icons/openai.svg'
    // Google / Gemini / Gemma
    if (m.includes('gemini') || m.includes('gemma')) return '/icons/gemini-color.svg'
    // DeepSeek
    if (m.includes('deepseek')) return '/icons/deepseek-color.svg'
    // Qwen
    if (m.includes('qwen') || m.includes('qwq')) return '/icons/qwen-color.svg'
    // Mistral
    if (m.includes('mistral') || m.includes('pixtral') || m.includes('devstral') || m.includes('ministral') || m.includes('mixtral') || m.includes('voxtral')) return '/icons/mistral-color.svg'
    // xAI / Grok
    if (m.includes('grok') || m.includes('x-ai')) return '/icons/grok.svg'
    // MoonshotAI / Kimi
    if (m.includes('kimi') || m.includes('moonshot')) return '/icons/kimi-color.svg'
    // MiniMax
    if (m.includes('minimax')) return '/icons/minimax-color.svg'
    // Z.AI / GLM / ZhipuAI
    if (m.includes('glm') || m.includes('z-ai') || m.includes('zhipu')) return '/icons/zai.png'
    // Meta / Llama (including ollama)
    if (m.includes('llama') || m.includes('ollama')) return '/icons/ollama.svg'
    // Perplexity
    if (m.includes('perplexity')) return '/icons/perplexity-color.svg'

    return null
}

/** Get adapter type icon path */
export const getAdapterIconPath = (adapterType?: string): string | null => {
    if (!adapterType) return null
    if (adapterType === 'claudecode') return '/icons/claudecode-color.svg'
    if (adapterType === 'codex') return '/icons/codex-color.svg'
    return null
}
