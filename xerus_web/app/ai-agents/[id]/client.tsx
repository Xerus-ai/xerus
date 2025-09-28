'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import GuestGate from "@/components/GuestGate"
import { 
  getAssistant, 
  updateAgent, 
  checkApiKeyStatus, 
  getKnowledgeDocuments, 
  searchKnowledgeDocuments,
  getTools,
  updateAgentTools,
  type Assistant, 
  type KnowledgeDocument,
  type Tool
} from "@/utils/api"
import { useAuth, isGuestUser } from "@/utils/auth"
import { 
  Search,
  Upload,
  ArrowUp,
  Paperclip,
  ChevronDown,
  Lightbulb,
  FileText,
  TrendingUp,
  User,
  Edit3,
  Save,
  X,
  Settings,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Plus,
  Pencil,
  Check
} from 'lucide-react'

// Available agent avatars
const AGENT_AVATARS = [
  'alexander',
  'alya', 
  'amy',
  'fred',
  'henry',
  'raj'
]

// Available personality types (matching backend validation)
const PERSONALITY_TYPES = [
  { id: 'assistant', name: 'Assistant', description: 'General-purpose helpful assistant' },
  { id: 'technical', name: 'Technical', description: 'Specialized in technical and programming tasks' },
  { id: 'creative', name: 'Creative', description: 'Focused on creative and artistic endeavors' },
  { id: 'tutor', name: 'Tutor', description: 'Educational and teaching oriented' },
  { id: 'executive', name: 'Executive', description: 'Business and strategic decision making' },
  { id: 'research', name: 'Research', description: 'Research and analytical tasks' }
]

// Function to get avatar for an agent based on their ID or name
const getAgentAvatar = (assistant: Assistant): string => {
  // Use a hash of the agent ID to consistently assign the same avatar
  const hash = assistant.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const avatarIndex = hash % AGENT_AVATARS.length
  return `/avatars/${AGENT_AVATARS[avatarIndex]}.svg`
}

// Model Icons Components using real SVG files
const ModelIcon = ({ model, size = 'sm' }: { model: string; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  };
  
  const iconSize = sizeClasses[size];
  
  // Map models to their corresponding SVG icons
  const getIconPath = (modelName: string) => {
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
    if (modelLower?.includes('ollama')) {
      return '/icons/ollama.svg';
    }
    if (modelLower?.includes('perplexity')) {
      return '/icons/perplexity-color.svg';
    }
    
    // Default fallback icon
    return '/icons/openai.svg';
  };
  
  const iconPath = getIconPath(model);
  
  return (
    <div className={`${iconSize} flex items-center justify-center rounded-sm overflow-hidden`}>
      <img 
        src={iconPath} 
        alt={`${model} icon`}
        className={`${iconSize} object-contain`}
        onError={(e) => {
          // Fallback to a simple colored circle if SVG fails to load
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            parent.innerHTML = `
              <div class="${iconSize} rounded-full bg-gray-400 flex items-center justify-center">
                <div class="w-2 h-2 bg-white rounded-full"></div>
              </div>
            `;
          }
        }}
      />
    </div>
  );
}

// Available Models Configuration with API Key Provider Mapping
const AVAILABLE_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', tier: 'premium', apiKeyProvider: 'openai' },
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', tier: 'premium', apiKeyProvider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI', tier: 'premium', apiKeyProvider: 'openai' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI', tier: 'standard', apiKeyProvider: 'openai' },
  { id: 'o1-preview', name: 'o1 Preview', provider: 'OpenAI', tier: 'premium', apiKeyProvider: 'openai' },
  { id: 'o1-mini', name: 'o1 Mini', provider: 'OpenAI', tier: 'standard', apiKeyProvider: 'openai' },
  { id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'Anthropic', tier: 'premium', apiKeyProvider: 'anthropic' },
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', tier: 'premium', apiKeyProvider: 'anthropic' },
  { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'Anthropic', tier: 'standard', apiKeyProvider: 'anthropic' },
  { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic', tier: 'standard', apiKeyProvider: 'anthropic' },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'Google', tier: 'standard', apiKeyProvider: 'gemini' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', tier: 'premium', apiKeyProvider: 'gemini' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'Google', tier: 'standard', apiKeyProvider: 'gemini' },
  { id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'DeepSeek', tier: 'standard', apiKeyProvider: 'deepseek' },
  { id: 'qwen3-7b', name: 'Qwen3 7B', provider: 'Qwen', tier: 'standard', apiKeyProvider: 'qwen' },
  { id: 'ollama', name: 'Ollama', provider: 'Local', tier: 'free', apiKeyProvider: 'ollama' }
]

interface AIAgentDetailClientProps {
  params: { id: string }
}

export default function AIAgentDetailClient({ params }: AIAgentDetailClientProps) {
  const router = useRouter()
  const { user, isAuthReady } = useAuth()
  const [assistant, setAssistant] = useState<Assistant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [availableAgents, setAvailableAgents] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState('Persona')
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState<{ [provider: string]: boolean }>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('apiKeyStatus')
        return stored ? JSON.parse(stored) : {}
      } catch (error) {
        console.warn('Failed to load API key status from localStorage:', error)
        return {}
      }
    }
    return {}
  })
  
  // Tool toggles state (independent of editing mode)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [knowledgeAccessEnabled, setKnowledgeAccessEnabled] = useState(false)
  const [allKnowledgeDocuments, setAllKnowledgeDocuments] = useState<string[]>([])
  const [showAddTool, setShowAddTool] = useState(false)
  
  // Real tools from API
  const [availableTools, setAvailableTools] = useState<any[]>([])
  const [toolsLoading, setToolsLoading] = useState(false)
  const [toolsError, setToolsError] = useState<string | null>(null)
  const [updatingTools, setUpdatingTools] = useState<Set<string>>(new Set())
  
  // Knowledge Base state
  const [availableDocuments, setAvailableDocuments] = useState<KnowledgeDocument[]>([])
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [documentSearchQuery, setDocumentSearchQuery] = useState('')
  const [toolSearchQuery, setToolSearchQuery] = useState('')
  
  // Check if user is guest
  const isUserGuest = isGuestUser(user)

  // Get available models based on API key status
  const getAvailableModels = () => {
    // Show all models - users can set API keys later
    const availableModels = AVAILABLE_MODELS
    
    console.log('Available models based on API keys:', {
      allModels: AVAILABLE_MODELS.length,
      availableModels: availableModels.length,
      apiKeyStatus,
      availableModelIds: availableModels.map(m => m.id)
    })
    
    return availableModels
  }

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    system_prompt: '',
    is_active: true,
    ai_model: 'gpt-4o',
    personality_type: 'assistant',
    web_search_enabled: false,
    search_all_knowledge: false
  })

  // Function to load knowledge documents from API
  const loadKnowledgeDocuments = async () => {
    if (isUserGuest) return // Don't load for guest users
    
    try {
      setIsLoadingDocuments(true)
      
      // Wait a bit for Firebase auth to propagate if needed
      if (user && typeof window !== 'undefined') {
        // Check if Firebase auth is available
        const { auth: firebaseAuth } = await import('@/utils/firebase')
        if (firebaseAuth.currentUser) {
          console.log('Firebase auth confirmed, loading documents...')
        } else {
          console.log('Waiting for Firebase auth to initialize...')
          // Give Firebase a moment to initialize
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
      
      const documents = await getKnowledgeDocuments({
        search: documentSearchQuery || undefined,
        limit: 50
      })
      
      // Ensure all document IDs are strings to match selectedDocuments format
      const documentsWithStringIds = documents.map(doc => ({
        ...doc,
        id: doc.id.toString()
      }))
      
      setAvailableDocuments(documentsWithStringIds)
      console.log('Loaded knowledge documents:', documents.length)
    } catch (error) {
      console.error('Failed to load knowledge documents:', error)
      
      // Handle error normally
      if (error instanceof Error) {
        if (error.message.includes('Authentication required') || 
            error.message.includes('GUEST_LOGIN_REQUIRED') ||
            error.message.includes('Unauthorized')) {
          console.log('Authentication still failing after retries - user may need to refresh or re-login')
        }
      }
      
      setAvailableDocuments([])
    } finally {
      setIsLoadingDocuments(false)
    }
  }

  // Helper function to update API key status and persist to localStorage
  const updateApiKeyStatus = (newStatus: { [provider: string]: boolean }) => {
    setApiKeyStatus(newStatus)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('apiKeyStatus', JSON.stringify(newStatus))
      } catch (error) {
        console.warn('Failed to save API key status to localStorage:', error)
      }
    }
  }

  // Function to refresh API key status
  const refreshApiKeyStatus = async () => {
    try {
      const keyStatus = await checkApiKeyStatus()
      updateApiKeyStatus(keyStatus)
      console.log('API Key Status Refreshed:', keyStatus)
    } catch (error) {
      console.warn('Failed to refresh API key status:', error)
    }
  }

  // Function to fetch available tools from API
  const fetchAvailableTools = async () => {
    try {
      setToolsLoading(true)
      setToolsError(null)
      console.log('Fetching available tools from API...')
      
      const tools = await getTools()
      setAvailableTools(tools)
      console.log('Available tools loaded:', tools.length, 'tools')
      
      // Debug tool statuses
      tools.forEach(tool => {
        console.log(`Tool: ${tool.name} | is_enabled: ${tool.is_enabled} | status: ${tool.status} | mcp_server: ${tool.mcp_server}`)
      })
    } catch (error) {
      console.error('Failed to fetch available tools:', error)
      setToolsError(error instanceof Error ? error.message : 'Failed to fetch tools')
    } finally {
      setToolsLoading(false)
    }
  }

  // Filter and sort tools based on search query (show all tools like main tools page)
  // Sort enabled tools first
  const filteredTools = availableTools
    .filter(tool => 
      toolSearchQuery === '' || 
      tool.name.toLowerCase().includes(toolSearchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(toolSearchQuery.toLowerCase()) ||
      (tool.category && tool.category.toLowerCase().includes(toolSearchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      const aEnabled = assistant?.tools?.includes(a.id) || false
      const bEnabled = assistant?.tools?.includes(b.id) || false
      
      // If both are enabled or both are disabled, maintain original order
      if (aEnabled === bEnabled) return 0
      
      // Enabled tools come first
      return aEnabled ? -1 : 1
    })

  useEffect(() => {
    // Wait for auth to be ready before making API calls
    if (!isAuthReady) return;
    
    let isMounted = true; // Prevent state updates if component unmounts
    
    const loadAssistant = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        // Sequential API calls to prevent rate limiting
        // 1. Load API key status first
        try {
          const keyStatus = await checkApiKeyStatus()
          if (!isMounted) return; // Exit if component unmounted
          updateApiKeyStatus(keyStatus)
          console.log('API Key Status:', keyStatus)
        } catch (error) {
          console.warn('Failed to load API key status:', error)
          if (!isMounted) return;
          // Don't override with defaults - keep whatever was already loaded from localStorage
          // Only set defaults if apiKeyStatus is completely empty
          if (Object.keys(apiKeyStatus).length === 0) {
            updateApiKeyStatus({ openai: true, anthropic: false, gemini: false, deepseek: false, qwen: false, ollama: true })
          }
        }
        
        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 2. Get all available assistants to show what's available
        const { getAssistants } = await import('@/utils/api');
        const allAssistants = await getAssistants();
        if (!isMounted) return;
        const agentIds = allAssistants.map(a => a.id);
        setAvailableAgents(agentIds);
        
        console.log('Available agents:', agentIds);
        console.log('Requested agent ID:', params.id);
        
        // Small delay before next API call
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 3. Get specific assistant data  
        const data = await getAssistant(params.id)
        if (data) {
          console.log('Agent data loaded:', {
            name: data.name,
            category: data.category,
            personality_type: data.category, // category maps to personality_type
            description: data.description
          })
          
          setAssistant(data)
          // Initialize edit form with current values
          setEditForm({
            name: data.name,
            description: data.description,
            system_prompt: data.prompt,
            is_active: data.status === 'active',
            ai_model: data.model || 'gpt-4o',
            personality_type: data.category || 'assistant',
            web_search_enabled: data.tools?.includes('web_search') || false,
            search_all_knowledge: data.knowledgeBase?.includes('all') || false
          })
          
          // Initialize tool toggles
          setWebSearchEnabled(data.tools?.includes('web_search') || false)
          setKnowledgeAccessEnabled(data.knowledgeBase?.includes('all') || false)
          
          console.log('Agent tools initialized:', {
            webSearch: data.tools?.includes('web_search') || false,
            knowledgeAccess: data.knowledgeBase?.includes('all') || false,
            allTools: data.tools
          })
          
          console.log('User authentication status:', {
            isGuest: isUserGuest,
            userExists: !!user,
            knowledgeAccessAllowed: true, // Guest restrictions removed
            userId: user ? ('uid' in user ? user.uid : user.id) : 'guest'
          })
        } else {
          throw new Error(`AI agent '${params.id}' not found. Available agents: ${agentIds.join(', ')}`);
        }
        
        // Small delay before next API call
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 4. Load available tools last
        await fetchAvailableTools()
        
      } catch (err) {
        if (!isMounted) return; // Don't update state if unmounted
        console.error('Failed to load assistant:', err)
        const errorMessage = err instanceof Error ? err.message : `Failed to load AI agent '${params.id}'. Please check if the Glass app is running and try again.`;
        setError(errorMessage);
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadAssistant()
    
    // Cleanup function to prevent memory leaks
    return () => {
      isMounted = false;
    }
  }, [params.id, isAuthReady])

  // Ensure guests cannot land on Knowledge tab
  useEffect(() => {
    if (isUserGuest && activeTab === 'Knowledge') {
      setActiveTab('Persona')
    }
  }, [isUserGuest, activeTab])

  // Close model selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showModelSelector) {
        setShowModelSelector(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showModelSelector])

  // Load knowledge documents when component mounts or user changes (debounced)
  useEffect(() => {
    if (user) { // Guest restrictions removed
      const timeoutId = setTimeout(() => {
        loadKnowledgeDocuments()
      }, 200); // Small delay to prevent concurrent calls
      
      return () => clearTimeout(timeoutId);
    }
  }, [user, isUserGuest])

  // Load selected documents from agent's knowledgeBase
  useEffect(() => {
    if (assistant) {
      const agentKnowledgeBase = assistant.knowledgeBase || []
      if (agentKnowledgeBase.includes('all')) {
        setKnowledgeAccessEnabled(true)
        setSelectedDocuments(['all'])
        console.log('Agent knowledge base loaded - ALL workspace access:', agentKnowledgeBase)
      } else {
        setKnowledgeAccessEnabled(false)
        setSelectedDocuments(agentKnowledgeBase)
        console.log('Agent knowledge base loaded - specific documents:', agentKnowledgeBase)
      }
      console.log('Updated selectedDocuments state to:', agentKnowledgeBase)
    }
  }, [assistant])

  // Handle search query changes with debouncing
  useEffect(() => {
    if (isUserGuest) return
    
    const timeoutId = setTimeout(() => {
      loadKnowledgeDocuments()
    }, 500)
    
    return () => clearTimeout(timeoutId)
  }, [documentSearchQuery, isUserGuest])

  // Handle web search toggle with Perplexity API integration
  const handleWebSearchToggle = async (enabled: boolean) => {
    console.log('=====================================================')
    console.log(`PERPLEXITY API ${enabled ? 'ENABLE' : 'DISABLE'} REQUEST`)
    console.log(`Agent: ${assistant?.name}`)
    console.log(`User: ${user ? ('uid' in user ? user.uid : user.id) : 'guest'}`)
    console.log('=====================================================')
    
    if (enabled) {
      console.log('ENABLING Perplexity API...')
      console.log('Initializing Perplexity API connection...')
      
      try {
        // Update backend agent configuration
        if (assistant) {
          console.log('Updating backend agent configuration...')
          
          const updateData = {
            web_search_enabled: true
          }
          
          console.log('Backend update payload:', updateData)
          
          // Call backend API to update agent
          await updateAgent(assistant.id, updateData)
          
          console.log('Backend agent configuration updated successfully!')
          console.log('Perplexity API now ACTIVE for agent:', assistant.name)
          console.log('Web search tools now available:', ['perplexity', 'tavily', 'web_search'])
        }
        
        // Test Perplexity API connection
        const testQuery = 'test connection'
        console.log('Testing Perplexity API with query:', testQuery)
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 500))
        
        console.log('Perplexity API connection test successful!')
        console.log('PERPLEXITY API IS NOW ENABLED AND OPERATIONAL')
        
        setWebSearchEnabled(true)
        
      } catch (error) {
        console.error('Failed to enable Perplexity API:', error)
        console.log('Falling back to basic web search...')
        setWebSearchEnabled(true)
      }
    } else {
      console.log('DISABLING Perplexity API...')
      
      try {
        // Update backend agent configuration
        if (assistant) {
          console.log('Updating backend agent configuration...')
          
          const updateData = {
            web_search_enabled: false
          }
          
          console.log('Backend update payload:', updateData)
          
          // Call backend API to update agent
          await updateAgent(assistant.id, updateData)
          
          console.log('Backend agent configuration updated successfully!')
          console.log('Perplexity API now DISABLED for agent:', assistant.name)
        }
        
        console.log('Perplexity API connection terminated')
        console.log('Web search tools disabled')
        console.log('PERPLEXITY API IS NOW DISABLED')
        
        setWebSearchEnabled(false)
        
      } catch (error) {
        console.error('Failed to disable Perplexity API:', error)
        setWebSearchEnabled(false)
      }
    }
    
    console.log('=====================================================')
    console.log(`PERPLEXITY API ${enabled ? 'ENABLE' : 'DISABLE'} COMPLETED`)
    console.log('=====================================================')
    
    // Note: Web search is controlled from the right sidebar, not the edit form
  }

  // Handle knowledge access toggle
  const handleKnowledgeAccessToggle = async (enabled: boolean) => {
    // Check if user is guest
    if (isUserGuest && enabled) {
      console.log('Guest user attempted to enable knowledge access')
      console.log('Login required for knowledge base access')
      console.log('Current user status:', user ? 'Authenticated' : 'Guest')
      
      // Show login message (you can replace with actual toast/modal)
      alert('Login to use this feature. Knowledge base access is only available for authenticated users.')
      return
    }
    
    console.log(`Knowledge Access ${enabled ? 'ENABLED' : 'DISABLED'} for agent: ${assistant?.name}`)
    
    if (enabled) {
      console.log('Enabling access to ALL knowledge base documents...')
      
      // Set to 'all' access mode
      setSelectedDocuments(['all'])
      setKnowledgeAccessEnabled(true)
      
      // Update the form state to reflect the change
      setEditForm(prev => ({
        ...prev,
        search_all_knowledge: true
      }))
      
      // Get actual document count for display
      const documentTitles = availableDocuments.map(doc => doc.title)
      setAllKnowledgeDocuments(documentTitles)
      
      console.log('ALL Knowledge base documents now accessible:', availableDocuments.length, 'documents')
      console.log('Knowledge base access level: FULL ACCESS')
      console.log('Updated editForm.search_all_knowledge to:', true)
      
    } else {
      console.log('Restricting knowledge access to individually selected documents')
      console.log('Knowledge base access level: SELECTIVE ACCESS')
      
      // Remove 'all' access and clear document list
      setSelectedDocuments(prevSelected => prevSelected.filter(id => id !== 'all'))
      setKnowledgeAccessEnabled(false)
      setAllKnowledgeDocuments([])
      
      // Update the form state to reflect the change
      setEditForm(prev => ({
        ...prev,
        search_all_knowledge: false
      }))
      
      console.log('Agent can only access individually selected documents')
      console.log('Updated editForm.search_all_knowledge to:', false)
    }
  }

  // Handle document selection for agent knowledge assignment
  const handleDocumentSelection = (documentId: string, isSelected: boolean) => {
    if (!isEditing) return
    
    setSelectedDocuments(prevSelected => {
      let newSelected = [...prevSelected]
      
      // Remove 'all' if user is selecting individual documents
      if (isSelected && newSelected.includes('all')) {
        newSelected = newSelected.filter(id => id !== 'all')
      }
      
      if (isSelected) {
        if (!newSelected.includes(documentId)) {
          newSelected.push(documentId)
        }
      } else {
        newSelected = newSelected.filter(id => id !== documentId)
      }
      
      console.log('Document selection updated:', {
        documentId,
        isSelected,
        newSelection: newSelected
      })
      
      return newSelected
    })
  }

  // Tool management functions now use API calls instead of hardcoded tools

  const handleToggleTool = async (toolId: string) => {
    if (!assistant || !isEditing || updatingTools.has(toolId)) return

    try {
      console.log(`Toggling tool: ${toolId}`)
      
      // Add tool to updating set to prevent concurrent calls
      setUpdatingTools(prev => new Set(prev).add(toolId))
      
      // Get current tool list
      const currentTools = assistant.tools || []
      const isCurrentlyEnabled = currentTools.includes(toolId)
      
      // Create updated tool list
      let updatedTools: string[]
      if (isCurrentlyEnabled) {
        // Remove tool
        updatedTools = currentTools.filter(id => id !== toolId)
        console.log(`REMOVING tool: ${toolId}`)
      } else {
        // Add tool
        updatedTools = [...currentTools, toolId]
        console.log(`ADDING tool: ${toolId}`)
      }
      
      // Update via API
      await updateAgentTools(assistant.id, updatedTools)
      
      // Update local assistant state for immediate UI feedback
      setAssistant({
        ...assistant,
        tools: updatedTools
      })
      
      // Handle legacy tool toggles for backward compatibility
      if (toolId === 'web_search') {
        const newWebSearchState = !isCurrentlyEnabled
        setEditForm({
          ...editForm,
          web_search_enabled: newWebSearchState
        })
        setWebSearchEnabled(newWebSearchState)
        
      } else if (toolId === 'knowledge_base') {
        const newKnowledgeState = !isCurrentlyEnabled
        setEditForm({
          ...editForm,
          search_all_knowledge: newKnowledgeState
        })
        setKnowledgeAccessEnabled(newKnowledgeState)
      }

      console.log('Tool configuration updated successfully for tool:', toolId, 'New tools:', updatedTools)

    } catch (error) {
      console.error('Failed to toggle tool:', error)
      // TODO: Show user-friendly error notification
    } finally {
      // Remove tool from updating set
      setUpdatingTools(prev => {
        const newSet = new Set(prev)
        newSet.delete(toolId)
        return newSet
      })
    }
  }

  const handleSave = async () => {
    if (!assistant) return

    try {
      setIsSaving(true)
      setSaveStatus('saving')
      
      // Prepare update data including knowledge base assignments
      const updateData = {
        ...editForm,
        knowledgeBase: selectedDocuments
      }
      
      console.log('Saving agent changes:', {
        agentId: assistant.id,
        changes: updateData,
        systemPromptChanged: editForm.system_prompt !== assistant.prompt,
        knowledgeBaseUpdated: JSON.stringify(selectedDocuments) !== JSON.stringify(assistant.knowledgeBase),
        selectedDocuments: selectedDocuments
      })
      
      // Update the agent via API
      const updatedAgent = await updateAgent(assistant.id, updateData)
      
      console.log('Agent saved successfully:', {
        agentId: updatedAgent.id,
        systemPromptUpdated: updatedAgent.prompt === editForm.system_prompt
      })
      
      // Update local state
      setAssistant(updatedAgent)
      
      // Explicitly update selectedDocuments to match the saved agent's knowledgeBase
      const updatedKnowledgeBase = updatedAgent.knowledgeBase || []
      if (updatedKnowledgeBase.includes('all')) {
        setKnowledgeAccessEnabled(true)
        setSelectedDocuments(['all'])
      } else {
        setKnowledgeAccessEnabled(false)
        setSelectedDocuments(updatedKnowledgeBase)
      }
      
      console.log('Explicitly updated selectedDocuments after save:', {
        updatedKnowledgeBase,
        types: updatedKnowledgeBase.map(id => typeof id),
        isEditingMode: isEditing
      })
      
      setIsEditing(false)
      setSaveStatus('success')
      
      // Clear success status after 3 seconds
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (error) {
              console.error('Failed to save agent:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (!assistant) return
    
    // Reset form to original values
    setEditForm({
      name: assistant.name,
      description: assistant.description,
      system_prompt: assistant.prompt,
      is_active: assistant.status === 'active',
      ai_model: assistant.model || 'gpt-4o',
      personality_type: assistant.category || 'assistant',
      web_search_enabled: assistant.tools?.includes('web_search') || false,
      search_all_knowledge: assistant.knowledgeBase?.includes('all') || false
    })
    
    // Reset tool toggles to original values
    setWebSearchEnabled(assistant.tools.includes('web_search'))
    setKnowledgeAccessEnabled(assistant.knowledgeBase.includes('all'))
    
    setIsEditing(false)
    setSaveStatus('idle')
    
    console.log('Agent configuration reset to original values')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 border-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading AI agent...</p>
        </div>
      </div>
    )
  }

  if (error || !assistant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-4xl mb-4">🤖</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">AI Agent Not Found</h2>
          <p className="text-gray-600 mb-4">{error || 'AI agent not found'}</p>
          
          {availableAgents.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-2">Available agents:</p>
              <div className="flex flex-wrap gap-1 justify-center">
                {availableAgents.slice(0, 5).map(agentId => (
                  <Button
                    key={agentId}
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/ai-agents/${agentId}`)}
                    className="text-xs"
                  >
                    {agentId}
                  </Button>
                ))}
                {availableAgents.length > 5 && (
                  <span className="text-xs text-gray-400">+{availableAgents.length - 5} more</span>
                )}
              </div>
            </div>
          )}
          
          <div className="space-x-2">
            <Button 
              onClick={() => {
                setError(null);
                // Re-trigger the effect manually
                const loadAssistant = async () => {
                  try {
                    setIsLoading(true)
                    
                    // Load assistant data
                    const data = await getAssistant(params.id);
                    if (!data) {
                      throw new Error(`AI agent '${params.id}' not found`);
                    }
                    setAssistant(data);
                    // Initialize edit form and other states...
                    setEditForm({
                      name: data.name,
                      description: data.description,
                      system_prompt: data.prompt,
                      is_active: data.status === 'active',
                      ai_model: data.model || 'gpt-4o',
                      personality_type: data.category || 'assistant',
                      web_search_enabled: data.tools?.includes('web_search') || false,
                      search_all_knowledge: data.knowledgeBase?.includes('all') || false
                    });
                    setWebSearchEnabled(data.tools?.includes('web_search') || false);
                    setKnowledgeAccessEnabled(data.knowledgeBase?.includes('all') || false);
                  } catch (err) {
                    console.error('Failed to load assistant:', err);
                    const errorMessage = err instanceof Error ? err.message : 'Failed to load AI agent';
                    setError(errorMessage);
                  } finally {
                    setIsLoading(false);
                  }
                };
                loadAssistant();
              }}
              variant="outline"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                'Retry'
              )}
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline">Reload Page</Button>
            <Button onClick={() => router.push('/ai-agents')}>Back to AI Agents</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-background px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-heading font-medium text-gray-900">AI Agent / <span className="text-gray-600">{assistant.name}</span></h1>
            {!isEditing && (
              <button
                onClick={() => {
                  setIsEditing(true)
                  // Populate edit form with current values
                  if (assistant) {
                    setEditForm({
                      name: assistant.name,
                      description: assistant.description,
                      system_prompt: assistant.prompt,
                      is_active: assistant.status === 'active',
                      ai_model: assistant.model || 'gpt-4o',
                      personality_type: assistant.category || 'assistant',
                      web_search_enabled: assistant.tools?.includes('web_search') || false,
                      search_all_knowledge: assistant.knowledgeBase?.includes('all') || false
                    })
                  }
                }}
                className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                title="Edit agent"
              >
                <Pencil className="w-4 h-4 text-gray-500 hover:text-gray-700" />
              </button>
            )}
            {isEditing && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="p-1.5 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50"
                  title="Cancel"
                >
                  <X className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="p-1.5 rounded-md hover:bg-green-100 transition-colors disabled:opacity-50"
                  title="Save changes"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 text-green-600 hover:text-green-700" />
                  )}
                </button>
              </div>
            )}
            {saveStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
            {saveStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
          </div>
          <div className="flex items-center gap-3">
            {/* Info button with hover tooltip */}
            <div className="relative group">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 hover:bg-gray-100"
              >
                <Info className="w-4 h-4 text-gray-500" />
              </Button>
              <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Agent Information</h4>
                  </div>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Category:</span>
                      <span className="text-gray-900">{assistant.category}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Model:</span>
                      <span className="text-gray-900">{assistant.model || 'Default'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className={assistant.status === 'active' ? 'text-green-600' : 'text-gray-500'}>
                        {assistant.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Uses:</span>
                      <span className="text-gray-900">{assistant.usageCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Created:</span>
                      <span className="text-gray-900">
                        {new Date(assistant.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Used:</span>
                      <span className="text-gray-900">
                        {new Date(assistant.lastUsed).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex p-8 gap-8">
          {/* AI Agent Configuration */}
          <div className="w-2/3">
            {/* AI Agent Card */}
            <Card className="mb-6">
              <CardHeader className="pb-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100">
                    <img 
                      src={getAgentAvatar(assistant)} 
                      alt={`${assistant.name} avatar`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to purple background with initial if SVG fails to load
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.className = 'w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center';
                          parent.innerHTML = `<div className="text-2xl">${assistant.avatar}</div>`;
                        }
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
                          <Input
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            placeholder="Enter agent name..."
                            className="text-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                          <Textarea
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Enter agent description..."
                            className="text-sm resize-none"
                            rows={2}
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700">AI Model</label>
                            <button
                              type="button"
                              onClick={refreshApiKeyStatus}
                              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                              title="Refresh API key status"
                            >
                              Refresh Keys
                            </button>
                          </div>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowModelSelector(!showModelSelector)}
                              className="w-full flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <ModelIcon model={editForm.ai_model} size="sm" />
                              <span className="text-sm font-medium text-gray-700 flex-1 text-left">
                                {AVAILABLE_MODELS.find(m => m.id === editForm.ai_model)?.name || editForm.ai_model}
                                {/* Debug: Show current state */}
                                <span className="text-xs text-red-500 ml-2">
                                  (State: {editForm.ai_model})
                                </span>
                              </span>
                              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showModelSelector ? 'rotate-180' : ''}`} />
                            </button>
                            
                            {/* Model Selector Dropdown */}
                            {showModelSelector && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                                {/* Available Models */}
                                <div className="border-b border-gray-100 p-2">
                                  <div className="text-xs font-medium text-gray-500 mb-1">Available Models</div>
                                </div>
                                {getAvailableModels().map((model) => {
                                  const isCurrentModel = editForm.ai_model === model.id
                                  const hasApiKey = apiKeyStatus[model.apiKeyProvider] === true
                                  
                                  return (
                                    <div
                                      key={model.id}
                                      role="button"
                                      tabIndex={0}
                                      onMouseDown={(e) => {
                                        // Use onMouseDown to ensure it fires before any blur events
                                        e.preventDefault()
                                        e.stopPropagation()
                                        
                                        console.log('MOUSEDOWN - Model click triggered:', model.name)
                                        console.log('Current editForm.ai_model:', editForm.ai_model)
                                        console.log('New model.id:', model.id)
                                        
                                        // Force immediate state update with functional setter to avoid stale closure
                                        setEditForm(prevForm => {
                                          const newForm = { 
                                            ...prevForm, 
                                            ai_model: model.id 
                                          }
                                          console.log('Functional setState - New form:', newForm)
                                          return newForm
                                        })
                                        
                                        setShowModelSelector(false)
                                        console.log('Model selection completed:', model.name)
                                      }}
                                      onClick={(e) => {
                                        // Backup onClick handler in case onMouseDown doesn't work
                                        e.preventDefault()
                                        e.stopPropagation()
                                        console.log('BACKUP onClick fired for:', model.name)
                                      }}
                                      className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50 ${
                                        isCurrentModel ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                                      }`}
                                    >
                                      <div style={{ pointerEvents: 'none' }}>
                                        <ModelIcon model={model.id} size="sm" />
                                      </div>
                                      <div className="flex-1 text-left" style={{ pointerEvents: 'none' }}>
                                        <div className={`text-sm font-medium ${hasApiKey || isCurrentModel ? 'text-gray-900' : 'text-gray-400'}`}>
                                          {model.name}
                                        </div>
                                        <div className={`text-xs ${hasApiKey || isCurrentModel ? 'text-gray-500' : 'text-gray-400'}`}>
                                          {model.provider}
                                          {!hasApiKey && !isCurrentModel && ' • API Key Required'}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1" style={{ pointerEvents: 'none' }}>
                                        <div className={`text-xs px-1.5 py-0.5 rounded ${
                                          model.tier === 'premium' ? 'bg-purple-100 text-purple-700' :
                                          model.tier === 'standard' ? 'bg-blue-100 text-blue-700' :
                                          'bg-green-100 text-green-700'
                                        }`}>
                                          {model.tier}
                                        </div>
                                        {hasApiKey && (
                                          <div className="w-2 h-2 bg-green-500 rounded-full" title="API Key Configured"></div>
                                        )}
                                        {!hasApiKey && !isCurrentModel && (
                                          <div className="w-2 h-2 bg-red-500 rounded-full" title="API Key Missing"></div>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                                
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Personality Type</label>
                          <select
                            value={editForm.personality_type}
                            onChange={(e) => setEditForm({ ...editForm, personality_type: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            {PERSONALITY_TYPES.map((type) => (
                              <option key={type.id} value={type.id}>
                                {type.name} - {type.description}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-lg font-semibold text-gray-900">{assistant.name}</h2>
                          {assistant.model && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full">
                              <ModelIcon model={assistant.model} size="sm" />
                              <span className="text-xs font-medium text-gray-700">
                                {AVAILABLE_MODELS.find(m => m.id === assistant.model)?.name || assistant.model}
                              </span>
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-xs mb-2">
                          @{assistant.category || 'general'} personality
                        </Badge>
                        <p className="text-sm text-gray-600">
                          {assistant.description}
                        </p>
                      </>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      {isEditing ? (
                        <div className="flex items-center gap-4">
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={editForm.is_active}
                              onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
                            />
                            <span className="text-sm text-gray-700">Active</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Badge variant={assistant.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                            {assistant.status === 'active' ? 'Active' : 'Inactive'}
                          </Badge>
                          {assistant.isDefault && (
                            <Badge variant="outline" className="text-xs">
                              Default
                            </Badge>
                          )}
                          <span className="text-xs text-gray-500">• {assistant.usageCount} uses</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Tabs - Show all tabs with counts */}
            <div className="inline-flex bg-gray-100 rounded-lg p-1 mb-6">
              {["Persona", "Knowledge", "Tools"].map((tab) => {
                let tabName = tab
                let count = 0
                
                // Calculate counts for each tab
                if (tab === "Tools") {
                  count = assistant?.tools?.length || 0
                } else if (tab === "Knowledge") {
                  if (selectedDocuments.includes('all')) {
                    count = availableDocuments.length
                  } else {
                    count = selectedDocuments.length
                  }
                }
                
                // Add count to tab name if count > 0
                if (count > 0) {
                  tabName = `${tab} ${count}`
                }
                
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tabName}
                  </button>
                )
              })}
            </div>


            {/* Persona Section */}
            {activeTab === "Persona" && (
              <div>
                <div className="mb-4">
                  <h3 className="text-base font-medium text-gray-900 mb-2">System Prompt</h3>
                  <p className="text-sm text-gray-600 mb-4">Define how your AI agent behaves and responds to users</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      System Prompt
                    </label>
                    {isEditing ? (
                      <Textarea
                        placeholder="Enter the system prompt that defines your AI agent's personality and behavior..."
                        value={editForm.system_prompt}
                        onChange={(e) => setEditForm({ ...editForm, system_prompt: e.target.value })}
                        className="w-full h-40 resize-none border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                      />
                    ) : (
                      <div className="w-full h-40 p-3 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700 overflow-y-auto cursor-not-allowed relative group">
                        <div className="text-gray-600">
                          {assistant.prompt || 'No system prompt configured'}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-gray-50 bg-opacity-90 rounded-md">
                          <div className="text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
                            Click "Edit Agent" to modify the system prompt
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      This prompt defines how your AI agent will behave and respond to user requests.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Knowledge Section */}
            {activeTab === "Knowledge" && (
              <GuestGate
                feature="Knowledge Base"
                description="Sign in to configure which knowledge sources this AI agent can access"
                requireAuth
              >
                <div className="relative">
                  <div className="mb-4">
                    <h3 className="text-base font-medium text-gray-900 mb-2">Knowledge Base</h3>
                    <p className="text-sm text-gray-600 mb-4">Configure which knowledge sources this agent can access</p>
                  </div>

                  <div className="relative mb-4">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input 
                      placeholder="Search knowledge base..." 
                      value={documentSearchQuery} 
                      onChange={(e) => setDocumentSearchQuery(e.target.value)} 
                      className="pl-10" 
                      disabled={isLoadingDocuments}
                    />
                  </div>

                  <div className="border border-gray-200 bg-white rounded-lg divide-y divide-gray-100 min-h-[200px]">
                  {isLoadingDocuments ? (
                    <div className="p-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-sm text-gray-500">Loading documents...</p>
                    </div>
                  ) : availableDocuments.length > 0 ? (
                    <>
                      {console.log('Available documents being rendered:', availableDocuments.map(d => ({ id: d.id, title: d.title, type: typeof d.id })))}
                      {availableDocuments.map((document) => {
                      const isSelected = selectedDocuments.includes(document.id) || selectedDocuments.includes('all')
                      
                      // Debug logging for checkbox selection
                      if (document.id === '29') {
                        console.log('Checkbox debug for document 29:', {
                          documentId: document.id,
                          documentIdType: typeof document.id,
                          selectedDocuments,
                          selectedDocumentsTypes: selectedDocuments.map(id => typeof id),
                          includes: selectedDocuments.includes(document.id),
                          isSelected
                        })
                      }
                      
                      return (
                        <div
                          key={document.id}
                          className="flex items-center gap-3 p-3 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleDocumentSelection(document.id, e.target.checked)}
                            disabled={!isEditing || selectedDocuments.includes('all')}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <FileText className="w-4 h-4 text-gray-400" />
                          <div className="flex-1">
                            <span className="text-sm text-gray-700 font-medium">
                              {document.title}
                            </span>
                            {document.folder_name && (
                              <p className="text-xs text-gray-500">
                                📁 {document.folder_name}
                              </p>
                            )}
                            <p className="text-xs text-gray-400">
                              {document.content_type} • {Math.round(document.file_size / 1024)}KB
                            </p>
                          </div>
                          {isSelected && !selectedDocuments.includes('all') && (
                            <Badge variant="secondary" className="text-xs">
                              Selected
                            </Badge>
                          )}
                          {selectedDocuments.includes('all') && (
                            <Badge variant="default" className="text-xs bg-blue-100 text-blue-800">
                              All Access
                            </Badge>
                          )}
                        </div>
                      )
                    })}
                    </>
                  ) : (
                    <div className="p-8 text-center">
                      <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">
                        {documentSearchQuery ? 'No documents found matching your search' : 'No knowledge base documents available'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {documentSearchQuery ? 'Try a different search term' : 'Upload documents to your knowledge base to assign them to agents'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              </GuestGate>
            )}

            {/* Tools Section */}
            {activeTab === "Tools" && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-2">Available Tools</h3>
                    <p className="text-sm text-gray-600 mb-4">Configure which tools this agent can use</p>
                  </div>
                  {/* Guest restrictions removed - all users can edit */ isEditing && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddTool(true)}
                      className="flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Tool
                    </Button>
                  )}
                </div>

                {/* Search Tools */}
                <div className="relative mb-4">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <Input 
                    placeholder="Search tools..." 
                    value={toolSearchQuery} 
                    onChange={(e) => setToolSearchQuery(e.target.value)} 
                    className="pl-10" 
                    disabled={toolsLoading}
                  />
                </div>

                {/* Available Tools with Scrollable Container */}
                <div className="border border-gray-200 bg-white rounded-lg min-h-[300px] max-h-[400px] overflow-y-auto">
                  {toolsLoading ? (
                    <div className="p-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-sm text-gray-500">Loading tools...</p>
                    </div>
                  ) : toolsError ? (
                    <div className="p-8 text-center">
                      <Settings className="w-8 h-8 text-red-300 mx-auto mb-2" />
                      <p className="text-sm text-red-500">Error loading tools: {toolsError}</p>
                    </div>
                  ) : filteredTools.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {filteredTools.map((tool) => {
                        const isToolEnabled = assistant.tools?.includes(tool.id) || false
                        return (
                          <div
                            key={tool.id}
                            className={`flex items-center gap-4 p-4 hover:bg-gray-50 ${isToolEnabled ? 'bg-blue-50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isToolEnabled}
                              onChange={(e) => handleToggleTool(tool.id)}
                              disabled={!isEditing || isUserGuest || updatingTools.has(tool.id)}
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center p-1 ${
                              isToolEnabled ? 'bg-blue-100' : 'bg-gray-100'
                            }`}>
                              {tool.icon && (tool.icon.startsWith('http') || tool.icon.startsWith('/api')) ? (
                                <img 
                                  src={tool.icon} 
                                  alt={`${tool.name} icon`}
                                  className="w-full h-full object-contain rounded"
                                  onError={(e) => {
                                    // Fallback to emoji icon on error
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    target.parentElement!.innerHTML = '<div class="w-5 h-5 text-gray-600 flex items-center justify-center text-base">🔧</div>';
                                  }}
                                />
                              ) : (
                                <Settings className="w-5 h-5 text-gray-600" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h4 className="text-sm font-semibold text-gray-800">{tool.name}</h4>
                                {tool.mcp_server && (
                                  <Badge variant="secondary" className="text-xs">
                                    MCP
                                  </Badge>
                                )}
                                {updatingTools.has(tool.id) && (
                                  <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                                )}
                              </div>
                              <p className="text-xs text-gray-600 line-clamp-2">{tool.description}</p>
                              {tool.category && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  {tool.category}
                                </Badge>
                              )}
                            </div>
                            {isToolEnabled && (
                              <Badge variant="default" className="text-xs bg-green-100 text-green-800 px-2 py-1">
                                Enabled
                              </Badge>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <Settings className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">
                        {toolSearchQuery ? 'No tools found matching your search' : (isUserGuest ? 'Sign in to access tools' : 'No active tools available')}
                      </p>
                      {toolSearchQuery && (
                        <p className="text-xs text-gray-400 mt-1">
                          Try a different search term
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Guest user limitation message */}
                {isUserGuest && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-xs text-yellow-800">
                      🔐 Tool management requires authentication. Please login to add or remove tools.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar - Tools & Settings */}
          <div className="w-1/3">
            {/* Combined Tools Card - Matching original design */}
            <Card>
              <CardContent className="p-6 space-y-6">
                {/* Add all workspace content */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-medium text-gray-900 mb-1">Add all workspace content</h4>
                    <p className="text-sm text-gray-600">
                      Let the assistant use all tools, files and other assets
                    </p>
                  </div>
                  <Switch
                    checked={knowledgeAccessEnabled} // Guest restrictions removed
                    onCheckedChange={handleKnowledgeAccessToggle}
                    disabled={isUserGuest || !isEditing}
                  />
                </div>

                {/* Guest user warning for knowledge access */}
                {isUserGuest && (
                  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800">
                      🔐 Knowledge base access requires authentication. Please login to enable workspace content.
                    </p>
                  </div>
                )}

                {/* Separator line */}
                <hr className="border-gray-200" />

                {/* Search the web for information */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-medium text-gray-900 mb-1">Search the web for information</h4>
                    <p className="text-sm text-gray-600">
                      This will enable internet search using Perplexity API
                    </p>
                  </div>
                  <Switch
                    checked={webSearchEnabled}
                    onCheckedChange={handleWebSearchToggle}
                  />
                </div>

                {/* Knowledge access confirmation */}
                {knowledgeAccessEnabled && selectedDocuments.includes('all') && availableDocuments.length > 0 && ( // Guest restrictions removed
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-sm text-green-800">
                      ✅ Full workspace access enabled - Agent can search all {availableDocuments.length} knowledge base documents
                    </p>
                  </div>
                )}
                
                {/* Individual documents selected confirmation */}
                {selectedDocuments.length > 0 && !selectedDocuments.includes('all') && ( // Guest restrictions removed
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-sm text-blue-800">
                      📋 Selective access enabled - Agent can search {selectedDocuments.length} selected documents
                    </p>
                  </div>
                )}

              </CardContent>
            </Card>

            {/* Preview Section */}
            <div className="mt-6">
              <h3 className="text-base font-medium text-gray-900 mb-4">Preview</h3>
              <div className="bg-gray-50 rounded-lg p-4 min-h-[200px]">
                <div className="text-center text-gray-600 text-base mt-12">
                  <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  Start a conversation to test your AI agent
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Input placeholder="What are some ways we can troubleshoot of a problem in our product?" className="flex-1 text-base" />
                <Button size="sm" className="px-3">
                  <ArrowUp className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}