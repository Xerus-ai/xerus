'use client'

import { useState, useEffect } from 'react'
import { Search, Globe, Loader2, ExternalLink, AlertCircle } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { getApiHeaders } from '@/utils/api'

interface PerplexityResult {
  title: string
  url: string
  snippet: string
  relevance_score?: number
}

interface PerplexityResponse {
  query: string
  answer: string
  sources: PerplexityResult[]
  execution_time: number
  timestamp: string
}

/**
 * Props for the PerplexitySearch component
 */
interface PerplexitySearchProps {
  /** Additional CSS classes to apply to the component */
  className?: string
  /** Placeholder text for the search input */
  placeholder?: string
  /** Whether to display search result sources */
  showSources?: boolean
  /** Initial search query to execute on component mount */
  initialQuery?: string
}

/**
 * Helper function to get API base URL using runtime config
 * @returns Promise that resolves to the API base URL
 */
const getApiUrl = async () => {
  try {
    const response = await fetch('/runtime-config.json')
    if (response.ok) {
      const config = await response.json()
      return config.API_URL
    }
  } catch (error) {
    console.warn('Failed to fetch runtime config, using fallback')
  }
  return 'http://localhost:5001/api/v1' // Fallback
}

/**
 * PerplexitySearch component for AI-powered web search
 * Integrates with the Xerus AI backend to provide real-time web search with sources
 * 
 * @param props - Component props
 * @returns React component
 */
export default function PerplexitySearch({ 
  className = '', 
  placeholder = 'Search the web with AI...',
  showSources = true,
  initialQuery = ''
}: PerplexitySearchProps) {
  const [query, setQuery] = useState(initialQuery)
  const [isSearching, setIsSearching] = useState(false)
  const [result, setResult] = useState<PerplexityResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Handle initial query
  useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery)
      if (initialQuery.trim()) {
        handleSearch(initialQuery)
      }
    }
  }, [initialQuery])

  const handleSearch = async (searchQuery?: string) => {
    const searchText = searchQuery || query
    if (!searchText.trim()) return

    setIsSearching(true)
    setError(null)
    setResult(null)

    try {
      const apiUrl = await getApiUrl()
      const response = await fetch(`${apiUrl}/tools/perplexity/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getApiHeaders())
        },
        body: JSON.stringify({
          parameters: {
            query: searchText.trim(),
            max_results: 5
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Search failed' }))
        
        // Guest permission restrictions removed - unified error handling
        
        throw new Error(errorData.error || errorData.message || 'Search failed')
      }

      const data = await response.json()
      
      // Handle different response formats from backend
      if (data.result) {
        setResult({
          query: searchText,
          answer: data.result.answer || data.result.content || '',
          sources: data.result.sources || data.result.citations || [],
          execution_time: data.result.execution_time || 0,
          timestamp: data.timestamp || new Date().toISOString()
        })
      } else if (data.answer || data.content) {
        setResult({
          query: searchText,
          answer: data.answer || data.content,
          sources: data.sources || data.citations || [],
          execution_time: data.execution_time || 0,
          timestamp: data.timestamp || new Date().toISOString()
        })
      } else {
        throw new Error('Invalid response format from search service')
      }

    } catch (err) {
      console.error('Perplexity search error:', err)
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    }
  }

  return (
    <div className={`w-full max-w-4xl mx-auto ${className}`}>
      {/* Search Input */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={isSearching}
            className="pl-10 pr-4 py-3 text-base"
          />
          <Button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="absolute right-2 top-1/2 transform -translate-y-1/2"
            size="sm"
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Globe className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>

      {/* Error Display */}
      {error && (
        <Card className="p-4 mb-6 border-red-200 bg-red-50">
          <div className="flex items-center space-x-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Search Error</span>
          </div>
          <p className="text-red-600 mt-2">{error}</p>
        </Card>
      )}

      {/* Search Results */}
      {result && (
        <div className="space-y-6">
          {/* AI Answer */}
          <Card className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Globe className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">AI Answer</h3>
              <span className="text-sm text-gray-500">
                ({result.execution_time}ms)
              </span>
            </div>
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {result.answer}
              </p>
            </div>
          </Card>

          {/* Sources */}
          {showSources && result.sources && result.sources.length > 0 && (
            <Card className="p-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">
                Sources ({result.sources.length})
              </h4>
              <div className="space-y-4">
                {result.sources.map((source, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-900 mb-2">
                          {source.title}
                        </h5>
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {source.snippet}
                        </p>
                        <div className="flex items-center space-x-3">
                          <span className="text-xs text-gray-500 truncate">
                            {source.url}
                          </span>
                          {source.relevance_score && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {Math.round(source.relevance_score * 100)}% relevant
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="ml-4"
                      >
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1"
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span>Visit</span>
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Search Metadata */}
          <div className="text-center text-sm text-gray-500">
            Search completed at {new Date(result.timestamp).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}