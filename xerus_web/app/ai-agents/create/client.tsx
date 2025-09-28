'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  ArrowLeft, Save, ChevronDown, Search as SearchIcon, FileText, Check, User
} from 'lucide-react'
import { checkApiKeyStatus, createAssistant, getKnowledgeDocuments, type Assistant, type KnowledgeDocument } from '@/utils/api'

// Minimal model icon reused logic
const ModelIcon = ({ model, size = 'sm' }: { model: string; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' }
  const iconSize = sizeClasses[size]
  const getIconPath = (m: string) => {
    const ml = m?.toLowerCase()
    if (ml?.includes('gpt') || ml?.includes('o1')) return '/icons/openai.svg'
    if (ml?.includes('claude')) return '/icons/claude-color.svg'
    if (ml?.includes('gemini')) return '/icons/gemini-color.svg'
    if (ml?.includes('deepseek')) return '/icons/deepseek-color.svg'
    if (ml?.includes('qwen')) return '/icons/qwen-color.svg'
    if (ml?.includes('ollama') || ml?.includes('llama')) return '/icons/ollama.svg'
    if (ml?.includes('perplexity')) return '/icons/perplexity-color.svg'
    return '/icons/openai.svg'
  }
  return (
    <div className={`${iconSize} flex items-center justify-center`}>
      <img src={getIconPath(model)} alt={model} className={iconSize} />
    </div>
  )
}

const AVAILABLE_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  { id: 'deepseek-r1', name: 'DeepSeek R1' },
  { id: 'qwen3-7b', name: 'Qwen3 7B' },
  { id: 'ollama', name: 'Ollama' }
]

export default function CreateAIAgentClient() {
  const router = useRouter()
  const [apiKeyStatus, setApiKeyStatus] = useState<{ [k: string]: boolean }>({})
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Persona form
  const [form, setForm] = useState({
    name: '',
    description: '',
    system_prompt: '',
    is_active: true,
    ai_model: 'gpt-4o',
    personality_type: 'assistant',
    web_search_enabled: false,
    search_all_knowledge: false,
  })

  // Knowledge selection
  const [availableDocuments, setAvailableDocuments] = useState<KnowledgeDocument[]>([])
  const [documentSearchQuery, setDocumentSearchQuery] = useState('')
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([])

  // Tools sidebar toggles
  const knowledgeAccessEnabled = form.search_all_knowledge
  const webSearchEnabled = form.web_search_enabled

  useEffect(() => {
    // API key status (non-blocking)
    checkApiKeyStatus().then(setApiKeyStatus).catch(() => {})
  }, [])

  const loadDocuments = async (q?: string) => {
    try {
      setIsLoadingDocuments(true)
      const docs = await getKnowledgeDocuments({ search: q || undefined, limit: 50 })
      // normalize ids as strings
      setAvailableDocuments(docs.map(d => ({ ...d, id: String(d.id) })))
    } finally {
      setIsLoadingDocuments(false)
    }
  }

  useEffect(() => { loadDocuments() }, [])
  useEffect(() => {
    const t = setTimeout(() => loadDocuments(documentSearchQuery), 350)
    return () => clearTimeout(t)
  }, [documentSearchQuery])

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('Please enter a name')
      return
    }
    setIsSaving(true)
    try {
      const newAssistant: Omit<Assistant, 'id' | 'createdAt' | 'usageCount' | 'lastUsed'> = {
        name: form.name.trim(),
        description: form.description,
        avatar: form.name.trim().charAt(0).toUpperCase(),
        category: form.personality_type,
        status: form.is_active ? 'active' : 'inactive',
        capabilities: [],
        knowledgeBase: form.search_all_knowledge ? ['all'] : selectedDocuments,
        tools: form.web_search_enabled ? ['web_search'] : [],
        prompt: form.system_prompt,
        isDefault: false,
        model: form.ai_model,
      }
      const created = await createAssistant(newAssistant)
      router.push(`/ai-agents/${created.id}`)
    } catch (e: any) {
      alert(e?.message || 'Failed to create agent')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-background px-6 py-4 flex items-center justify-between border-b">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="hover:bg-gray-100">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <h1 className="text-lg font-heading font-medium text-gray-900">Create AI Agent</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.back()}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>

        <div className="flex-1 flex p-8 gap-8">
          {/* Left column */}
          <div className="w-2/3">
            {/* Agent card */}
            <Card className="mb-6">
              <CardHeader className="pb-0"></CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter agent name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">AI Model</label>
                    <div className="relative">
                      <button type="button" onClick={() => setShowModelSelector(!showModelSelector)} className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50">
                        <ModelIcon model={form.ai_model} size="sm" />
                        <span className="text-sm font-medium text-gray-700 flex-1 text-left">{AVAILABLE_MODELS.find(m => m.id === form.ai_model)?.name || form.ai_model}</span>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showModelSelector ? 'rotate-180' : ''}`} />
                      </button>
                      {showModelSelector && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                          {AVAILABLE_MODELS.map(model => (
                            <div key={model.id} role="button" tabIndex={0} onMouseDown={(e) => {
                              e.preventDefault(); setForm(prev => ({ ...prev, ai_model: model.id })); setShowModelSelector(false)
                            }} className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 ${form.ai_model === model.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}>
                              <ModelIcon model={model.id} size="sm" />
                              <div className="text-sm font-medium text-gray-900">{model.name}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe your agent…" className="h-24" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                  <Textarea value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} placeholder="Define your agent's behavior…" className="h-40" />
                  <p className="text-xs text-gray-500 mt-2">This prompt defines how your AI agent will behave and respond to user requests.</p>
                </div>
              </CardContent>
            </Card>

            {/* Knowledge Section */}
            <div className="mb-6">
              <h3 className="text-base font-medium text-gray-900 mb-2">Knowledge Base</h3>
              <p className="text-sm text-gray-600 mb-4">Configure which knowledge sources this agent can access</p>

              <div className="relative mb-3 max-w-md">
                <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input placeholder="Search knowledge base…" value={documentSearchQuery} onChange={(e) => setDocumentSearchQuery(e.target.value)} className="pl-10" />
              </div>

              <div className="border border-gray-200 bg-white rounded-lg divide-y divide-gray-100 min-h-[200px]">
                {isLoadingDocuments ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-500">Loading documents…</p>
                  </div>
                ) : (
                  availableDocuments.map((document) => {
                    const isSelected = form.search_all_knowledge || selectedDocuments.includes(document.id)
                    return (
                      <div key={document.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                        <input type="checkbox" checked={isSelected} disabled={form.search_all_knowledge} onChange={(e) => {
                          const checked = e.target.checked
                          setSelectedDocuments(prev => checked ? Array.from(new Set([...prev, document.id])) : prev.filter(id => id !== document.id))
                        }} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                        <FileText className="w-4 h-4 text-gray-400" />
                        <div className="flex-1">
                          <span className="text-sm text-gray-700 font-medium">{document.title}</span>
                          {document.folder_name && (
                            <p className="text-xs text-gray-500">📁 {document.folder_name}</p>
                          )}
                        </div>
                        {isSelected && !form.search_all_knowledge && (
                          <Badge variant="secondary" className="text-xs">Selected</Badge>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-1/3">
            <Card>
              <CardContent className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-1">Add all workspace content</h4>
                    <p className="text-xs text-gray-500">Let the assistant use all tools, files and other assets</p>
                  </div>
                  <Switch checked={form.search_all_knowledge} onCheckedChange={(val) => setForm({ ...form, search_all_knowledge: val })} />
                </div>

                <hr className="border-gray-200" />

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-1">Search the web for information</h4>
                    <p className="text-xs text-gray-500">Enable internet search using Perplexity API</p>
                  </div>
                  <Switch checked={form.web_search_enabled} onCheckedChange={(val) => setForm({ ...form, web_search_enabled: val })} />
                </div>

                {form.search_all_knowledge && availableDocuments.length > 0 && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-xs text-green-800">Full workspace access enabled - Agent can search all {availableDocuments.length} documents</p>
                  </div>
                )}

                {!form.search_all_knowledge && selectedDocuments.length > 0 && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs text-blue-800">Selective access enabled - Agent can search {selectedDocuments.length} selected documents</p>
                  </div>
                )}

                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-4">Preview</h3>
                  <div className="bg-gray-50 rounded-lg p-4 min-h-[200px]">
                    <div className="text-center text-gray-600 text-base mt-12">
                      <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      Start a conversation to test your AI agent
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}


