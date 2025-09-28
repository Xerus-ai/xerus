'use client'

import { useState, useEffect } from 'react'
import { Check, X, Settings, ExternalLink, AlertCircle, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useAuth } from '@/utils/auth'
import { saveApiKey, checkApiKeyStatus, deleteApiKey, getAllApiKeys } from '@/utils/api';

declare global {
  interface Window {
    ipcRenderer?: any;
  }
}


export default function ModelsPage() {
  const { user, isLoading } = useAuth()
  const [apiKeyInputs, setApiKeyInputs] = useState<{ [provider: string]: string }>({})
  const [savingStates, setSavingStates] = useState<{ [provider: string]: boolean }>({})
  const [showPasswords, setShowPasswords] = useState<{ [provider: string]: boolean }>({})

  const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', description: 'GPT-4, GPT-3.5, and other OpenAI models', iconPath: '/icons/openai.svg', websiteUrl: 'https://platform.openai.com/account/api-keys' },
    { id: 'anthropic', name: 'Anthropic Claude', description: 'Claude 3.5 Sonnet, Haiku, and Opus models', iconPath: '/icons/claude-color.svg', websiteUrl: 'https://console.anthropic.com/settings/keys' },
    { id: 'gemini', name: 'Google Gemini', description: 'Gemini Pro and Flash models from Google', iconPath: '/icons/gemini-color.svg', websiteUrl: 'https://aistudio.google.com/app/apikey' },
    { id: 'deepgram', name: 'Deepgram', description: 'Advanced speech-to-text and audio intelligence', iconPath: '/icons/deepgram.svg', websiteUrl: 'https://console.deepgram.com/signup' },
    { id: 'ollama', name: 'Ollama', description: 'Local LLMs via Ollama (Llama, Mistral, etc.)', iconPath: '/icons/ollama.svg', websiteUrl: 'https://ollama.com/' },
    { id: 'perplexity', name: 'Perplexity', description: 'Perplexity AI models with web search', iconPath: '/icons/perplexity-color.svg', websiteUrl: 'https://www.perplexity.ai/settings/api' },
  ];

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
  });
  const [apiKeys, setApiKeys] = useState<{ [provider: string]: string | null }>({});

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

  useEffect(() => {
    if (!user) return;
    // Fetch real API key status and values
    checkApiKeyStatus().then(updateApiKeyStatus);
    getAllApiKeys().then(setApiKeys);
  }, [user]);




  const handleSaveApiKey = async (provider: string) => {
    const apiKeyInput = apiKeyInputs[provider];
    if (!apiKeyInput) return;
    
    setSavingStates(prev => ({ ...prev, [provider]: true }));
    try {
      await saveApiKey(apiKeyInput, provider);
      updateApiKeyStatus({ ...apiKeyStatus, [provider]: true });
      setApiKeys((prev) => ({ ...prev, [provider]: apiKeyInput }));
      setApiKeyInputs(prev => ({ ...prev, [provider]: '' }));
    } catch (error) {
      console.error('Failed to save API key:', error);
    } finally {
      setSavingStates(prev => ({ ...prev, [provider]: false }));
    }
  };

  const handleClearApiKey = async (provider: string) => {
    setSavingStates(prev => ({ ...prev, [provider]: true }));
    try {
      await deleteApiKey(provider);
      updateApiKeyStatus({ ...apiKeyStatus, [provider]: false });
      setApiKeys((prev) => ({ ...prev, [provider]: null }));
      setApiKeyInputs(prev => ({ ...prev, [provider]: '' }));
    } catch (error) {
      console.error('Failed to delete API key:', error);
    } finally {
      setSavingStates(prev => ({ ...prev, [provider]: false }));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
      case 'active':
        return <Check className="h-5 w-5 text-green-500" />
      case 'disconnected':
      case 'inactive':
        return <X className="h-5 w-5 text-gray-400" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      default:
        return <X className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'active':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'disconnected':
      case 'inactive':
        return 'text-gray-600 bg-gray-50 border-gray-200'
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }


  if (isLoading) {
    return (
      <div className="min-h-screen xerus-gradient-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading integrations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="px-8 py-8">
        <div className="mb-6">
          <p className="text-xs text-gray-500 mb-1">Settings</p>
          <h1 className="text-3xl font-bold text-gray-900">Personal settings</h1>
        </div>
        
        <div className="mb-8">
          <nav className="flex space-x-10">
            <a
              href="/settings"
              className="pb-4 px-2 border-b-2 font-medium text-sm transition-colors border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              Personal profile
            </a>
            <a
              href="/settings/privacy"
              className="pb-4 px-2 border-b-2 font-medium text-sm transition-colors border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              Data & privacy
            </a>
            <a
              href="/settings/billing"
              className="pb-4 px-2 border-b-2 font-medium text-sm transition-colors border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              Billing
            </a>
            <a
              href="/settings/models"
              className="pb-4 px-2 border-b-2 font-medium text-sm transition-colors border-gray-900 text-gray-900"
            >
              AI Models
            </a>
          </nav>
        </div>

        {/* AI Models Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Available AI Models</h2>
          <div className="grid grid-cols-1 gap-6">
            {PROVIDERS.map((provider) => {
              const isSet = !!apiKeyStatus[provider.id];
              const currentInput = apiKeyInputs[provider.id] || '';
              const isSaving = savingStates[provider.id] || false;
              const showPassword = showPasswords[provider.id] || false;
              
              return (
                <div key={provider.id} className="bg-white border rounded-lg p-6">
                  <div className="flex items-start gap-4">
                    {/* Provider Icon & Info */}
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center mt-0.5">
                        <img src={provider.iconPath} alt={provider.name} className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">{provider.name}</h3>
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${isSet ? 'text-green-600 bg-green-50' : 'text-gray-500 bg-gray-50'}`}>
                            {isSet ? '✓ Configured' : 'Not configured'}
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{provider.description}</p>
                        
                        {/* API Key Input */}
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <input
                                type={showPassword ? "text" : "password"}
                                value={currentInput}
                                onChange={(e) => setApiKeyInputs(prev => ({ ...prev, [provider.id]: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                placeholder={isSet ? "Enter new API key to update" : "Enter your API key"}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPasswords(prev => ({ ...prev, [provider.id]: !showPassword }))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              {currentInput && (
                                <button
                                  onClick={() => handleSaveApiKey(provider.id)}
                                  disabled={isSaving}
                                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-medium flex items-center gap-1"
                                >
                                  {isSaving ? (
                                    <>
                                      <RefreshCw className="h-3 w-3 animate-spin" />
                                      Saving
                                    </>
                                  ) : (
                                    'Save'
                                  )}
                                </button>
                              )}
                              
                              {isSet && (
                                <button
                                  onClick={() => handleClearApiKey(provider.id)}
                                  disabled={isSaving}
                                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50 text-sm font-medium"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {/* Website Link */}
                          {provider.websiteUrl && (
                            <a 
                              href={provider.websiteUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Get API key from {provider.name}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>


      </div>
    </div>
  )
}