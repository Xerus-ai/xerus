'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { getAssistants, type Assistant } from "@/utils/api"
import { useAuth, isGuestUser } from "@/utils/auth"
import { Page, PageHeader } from '@/components/Page'
import { 
  Search, 
  Plus, 
  Sparkles,
  Loader2,
  AlertCircle,
  FileText,
  Globe,
  X,
  Wrench,
  BookOpen
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

// Function to get avatar for an agent based on their ID or name
const getAgentAvatar = (agent: Assistant): string => {
  // Use a hash of the agent ID to consistently assign the same avatar
  const hash = agent.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const avatarIndex = hash % AGENT_AVATARS.length
  return `/avatars/${AGENT_AVATARS[avatarIndex]}.svg`
}

// Unified permissions - all agents are available to all users
const getAgentAvailability = (agent: Assistant, isGuest: boolean) => {
  // All users have access to all agents in the unified system
  return { available: true, status: agent.status }
}

// Function to get status dot color - only active/inactive states for agents
const getStatusDotColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-green-500'
    case 'inactive': return 'bg-red-500'
    default: return 'bg-gray-400'
  }
}

// Function to count agent tools and knowledge items separately
const getAgentResourceCounts = (agent: Assistant) => {
  const toolsCount = agent.tools?.length || 0
  const knowledgeCount = agent.knowledgeBase?.length || 0
  return { toolsCount, knowledgeCount }
}

// Model Icons Component using real SVG files
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
    if (modelLower?.includes('llama') || modelLower?.includes('ollama')) {
      return '/icons/ollama.svg';
    }
    if (modelLower?.includes('perplexity')) {
      return '/icons/perplexity-color.svg';
    }
    
    return '/icons/openai.svg'; // Default fallback
  };
  
  const iconPath = getIconPath(model);
  
  return (
    <div className={`${iconSize} flex items-center justify-center rounded-sm overflow-hidden`}>
      <img 
        src={iconPath} 
        alt={`${model} icon`}
        className={`${iconSize} object-contain`}
        onError={(e) => {
          // Fallback to a gray circle if SVG fails to load
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            parent.innerHTML = `<div class="${iconSize} rounded-full bg-gray-400"></div>`;
          }
        }}
      />
    </div>
  );
}

export default function AIAgentsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAuthReady } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)
  
  // Check if user is guest
  const isUserGuest = isGuestUser(user)

  // Load assistants data - single, clean effect
  useEffect(() => {
    const loadAssistants = async () => {
      if (hasLoadedRef.current) return; // Prevent duplicate loads
      
      try {
        hasLoadedRef.current = true;
        setIsLoading(true)
        setError(null)
        
        const data = await getAssistants();
        setAssistants(data);
      } catch (err) {
        console.error('Failed to load assistants:', err)
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(`Failed to load AI agents: ${errorMessage}`);
        hasLoadedRef.current = false; // Reset on error to allow retry
      } finally {
        setIsLoading(false)
      }
    }

    // Only load once when auth is ready
    if (isAuthReady) {
      loadAssistants()
    }
  }, [isAuthReady]) // Only depend on isAuthReady

  // Filter assistants based on search
  const filteredAssistants = assistants.filter(assistant => {
    if (!searchQuery.trim()) return true
    
    const query = searchQuery.toLowerCase().trim()
    const searchableFields = [
      assistant.name?.toLowerCase() || '',
      assistant.description?.toLowerCase() || '',
      assistant.category?.toLowerCase() || '',
      assistant.model?.toLowerCase() || '',
      ...(assistant.tools || []).map(tool => tool.toLowerCase())
    ]
    
    // Check if query matches any searchable field
    return searchableFields.some(field => field.includes(query))
  })

  const handleAssistantClick = (assistant: Assistant) => {
    const availability = getAgentAvailability(assistant, isUserGuest)
    
    // In unified permission system, all agents are available
    if (!availability.available) {
      // This should never happen in the current system
      return
    }
    
    setIsLoading(true)
    // Add micro delay for better UX
    setTimeout(() => {
      router.push(`/ai-agents/${assistant.id}`)
    }, 150)
  }


  return (
    <Page>
      <PageHeader
        title="Browse assistants"
        description="Discover and create custom assistants"
        actions={
          <Button 
            onClick={() => router.push('/ai-agents/create')}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create AI Agent
          </Button>
        }
      />

        {/* Search Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by name, description, category, model, or tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-12 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            </div>
          </div>
          
          {searchQuery && (
            <div className="mt-2 text-sm text-gray-600">
              {filteredAssistants.length === 0 ? (
                <span className="text-amber-600">No assistants found for "{searchQuery}"</span>
              ) : (
                <span>Found {filteredAssistants.length} assistant{filteredAssistants.length !== 1 ? 's' : ''} matching "{searchQuery}"</span>
              )}
            </div>
          )}
        </div>

        {/* AI Agents Grid */}
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="text-gray-600">
                Loading AI agents...
              </span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center space-y-3">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <span className="text-red-600">{error}</span>
              <div className="flex space-x-2">
                <Button 
                  onClick={() => {
                    setError(null);
                    // Load assistants
                    const loadAssistants = async () => {
                      try {
                        setIsLoading(true)
                        const data = await getAssistants();
                        setAssistants(data)
                      } catch (err) {
                        console.error('Failed to load assistants:', err);
                        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
                        setError(`Failed to load AI agents: ${errorMessage}`);
                      } finally {
                        setIsLoading(false)
                      }
                    };
                    loadAssistants();
                  }}
                  className="bg-secondary/20 hover:bg-secondary/30 text-primary"
                  size="sm"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    'Retry'
                  )}
                </Button>
                <Button 
                  onClick={() => window.location.reload()}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700"
                  size="sm"
                >
                  Reload Page
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* AI Agents Grid */}
        {!isLoading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAssistants.map((assistant, index) => {
              const availability = getAgentAvailability(assistant, isUserGuest)
              const isDisabled = !availability.available
              
              return (
                <Card
                  key={assistant.id}
                  className={`card-hover bg-white/80 backdrop-blur-sm border border-white/20 shadow-md rounded-lg transition-all duration-200 hover:bg-white/90 h-full flex flex-col ${
                    isDisabled 
                      ? 'opacity-60 cursor-not-allowed' 
                      : 'cursor-pointer hover:border-primary/20'
                  }`}
                  onClick={() => handleAssistantClick(assistant)}
                >
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="flex items-start space-x-3 mb-4">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                      <img 
                        src={getAgentAvatar(assistant)} 
                        alt={`${assistant.name} avatar`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback to a gradient with initial if SVG fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.className = 'w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0';
                            parent.innerHTML = assistant.avatar;
                          }
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-heading text-lg font-semibold text-gray-900 group-hover:text-primary transition-colors line-clamp-1">
                          {assistant.name}
                        </h3>
                        {assistant.model && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-full flex-shrink-0">
                            <ModelIcon model={assistant.model} size="sm" />
                            <span className="text-xs font-medium text-gray-600">{assistant.model}</span>
                          </div>
                        )}
                      </div>
                      <div className="h-10 flex items-start">
                        <p className="font-body text-description line-clamp-2">
                          {assistant.description || 'No description available'}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Spacer to push footer to bottom */}
                  <div className="flex-grow"></div>
                  
                  {/* Card footer with gray background separator */}
                  <div className="mt-4 pt-3 pb-3 px-4 -mx-6 -mb-6 bg-gray-100 border-t border-gray-200 rounded-b-lg">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="font-medium">@{assistant.category}</span>
                      <div className="flex items-center gap-2">
                        {/* Web search indicator */}
                        {assistant.tools?.includes('web_search') && (
                          <div title="Web search enabled">
                            <Globe className="w-3 h-3 text-blue-500" />
                          </div>
                        )}
                        
                        {/* Tools count */}
                        {getAgentResourceCounts(assistant).toolsCount > 0 && (
                          <span className="inline-flex items-center gap-1" title={`${getAgentResourceCounts(assistant).toolsCount} tools available`}>
                            <Wrench className="w-3 h-3 text-gray-500" />
                            <span className="text-xs">{getAgentResourceCounts(assistant).toolsCount}</span>
                          </span>
                        )}
                        
                        {/* Knowledge base count */}
                        {getAgentResourceCounts(assistant).knowledgeCount > 0 && (
                          <span className="inline-flex items-center gap-1" title={`${getAgentResourceCounts(assistant).knowledgeCount} knowledge base items`}>
                            <BookOpen className="w-3 h-3 text-gray-500" />
                            <span className="text-xs">{getAgentResourceCounts(assistant).knowledgeCount}</span>
                          </span>
                        )}
                        
                        {/* Status dot with functional colors - moved to end */}
                        <div className={`w-2 h-2 rounded-full ${getStatusDotColor(getAgentAvailability(assistant, isUserGuest).status)}`} title={`Agent status: ${getAgentAvailability(assistant, isUserGuest).status}`}></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              )
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredAssistants.length === 0 && (
          <div className="text-center py-12">
            <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="font-heading text-lg font-medium text-gray-900 mb-2">No AI agents found</h3>
            <p className="font-body text-description mb-4">
              Try adjusting your search criteria or create a new AI agent.
            </p>
            <Button 
              onClick={() => router.push('/ai-agents/create')}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New AI Agent
            </Button>
          </div>
        )}
      
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </Page>
  )
} 