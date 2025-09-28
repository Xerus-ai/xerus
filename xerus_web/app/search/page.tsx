'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Globe, TrendingUp, Clock } from 'lucide-react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import PerplexitySearch from '@/components/PerplexitySearch'

function SearchPageContent() {
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [initialQuery, setInitialQuery] = useState<string>('')
  const searchParams = useSearchParams()

  useEffect(() => {
    const query = searchParams.get('q')
    if (query) {
      setInitialQuery(query)
    }
  }, [searchParams])

  const popularSearches = [
    'What is artificial intelligence?',
    'Latest tech trends 2024',
    'How to use Xerus AI assistant',
    'Benefits of AI automation',
    'Machine learning vs deep learning'
  ]

  const handleQuickSearch = (query: string) => {
    // This will trigger the search in the PerplexitySearch component
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
    if (searchInput) {
      searchInput.value = query
      searchInput.focus()
      // Dispatch an event to trigger the search
      const event = new Event('submit', { bubbles: true })
      searchInput.closest('form')?.dispatchEvent(event)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-8">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center">
              <Globe className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">AI Web Search</h1>
          </div>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Search the web with AI-powered intelligence. Get comprehensive answers backed by real-time sources.
          </p>
        </header>

        {/* Main Search */}
        <div className="mb-12">
          <PerplexitySearch 
            placeholder="Ask me anything about the web..."
            showSources={true}
            initialQuery={initialQuery}
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Popular Searches */}
          <Card className="p-6">
            <div className="flex items-center space-x-2 mb-6">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Popular Searches</h2>
            </div>
            <div className="space-y-3">
              {popularSearches.map((search, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  className="w-full justify-start text-left p-3 h-auto"
                  onClick={() => handleQuickSearch(search)}
                >
                  <Search className="h-4 w-4 mr-3 text-gray-400" />
                  <span className="text-gray-700">{search}</span>
                </Button>
              ))}
            </div>
          </Card>

          {/* Recent Searches */}
          <Card className="p-6">
            <div className="flex items-center space-x-2 mb-6">
              <Clock className="h-5 w-5 text-green-600" />
              <h2 className="text-xl font-semibold text-gray-900">Recent Searches</h2>
            </div>
            {recentSearches.length > 0 ? (
              <div className="space-y-3">
                {recentSearches.slice(0, 5).map((search, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    className="w-full justify-start text-left p-3 h-auto"
                    onClick={() => handleQuickSearch(search)}
                  >
                    <Search className="h-4 w-4 mr-3 text-gray-400" />
                    <span className="text-gray-700">{search}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Search className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No recent searches</p>
                <p className="text-sm text-gray-400">Your search history will appear here</p>
              </div>
            )}
          </Card>
        </div>

        {/* Search Tips */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Tips</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-gray-800">Ask Questions</h4>
              <p className="text-sm text-gray-600">
                "What are the benefits of renewable energy?"
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-gray-800">Get Comparisons</h4>
              <p className="text-sm text-gray-600">
                "Compare Python vs JavaScript for web development"
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-gray-800">Find Latest Info</h4>
              <p className="text-sm text-gray-600">
                "Latest developments in AI technology 2024"
              </p>
            </div>
          </div>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="text-center">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Real-time Web Search</h3>
            <p className="text-sm text-gray-600">
              Access the latest information from across the web with AI-powered search
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Search className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Intelligent Answers</h3>
            <p className="text-sm text-gray-600">
              Get comprehensive answers that synthesize information from multiple sources
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Source Citations</h3>
            <p className="text-sm text-gray-600">
              Every answer includes credible sources so you can verify the information
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-lg">Loading search...</div></div>}>
      <SearchPageContent />
    </Suspense>
  )
}