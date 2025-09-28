'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Settings, 
  Database, 
  Brain, 
  Shield, 
  CheckCircle,
  AlertCircle,
  Info,
  Zap,
  Cloud,
  HardDrive
} from 'lucide-react'

interface SetupConfig {
  database: {
    mode: 'local' | 'cloud'
    neon_connection?: string
    neon_project_id?: string
  }
  ai: {
    provider: 'openai' | 'gemini' | 'anthropic' | 'local'
    api_key?: string
  }
  features: {
    rag_enabled: boolean
    cloud_sync: boolean
    tool_integration: boolean
  }
  privacy: {
    data_retention_days: number
    encrypted_storage: boolean
    telemetry_enabled: boolean
  }
}

export default function SetupPage() {
  const [currentStep, setCurrentStep] = useState(0)
  const [config, setConfig] = useState<SetupConfig>({
    database: { mode: 'local' },
    ai: { provider: 'local' },
    features: {
      rag_enabled: true,
      cloud_sync: false,
      tool_integration: false
    },
    privacy: {
      data_retention_days: 30,
      encrypted_storage: true,
      telemetry_enabled: false
    }
  })
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<any>(null)

  const steps = [
    { id: 'database', title: 'Database Setup', icon: Database },
    { id: 'ai', title: 'AI Configuration', icon: Brain },
    { id: 'features', title: 'Features', icon: Settings },
    { id: 'privacy', title: 'Privacy & Security', icon: Shield },
    { id: 'complete', title: 'Complete', icon: CheckCircle }
  ]

  const testConfiguration = async () => {
    setTesting(true)
    try {
      const response = await fetch('/api/setup/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      const results = await response.json()
      setTestResults(results)
    } catch (error) {
      setTestResults({ success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' })
    }
    setTesting(false)
  }

  const saveConfiguration = async () => {
    try {
      const response = await fetch('/api/setup/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      
      if (response.ok) {
        // Redirect to main app
        window.location.href = '/'
      }
    } catch (error) {
      console.error('Failed to save configuration:', error instanceof Error ? error.message : error)
    }
  }

  const DatabaseSetup = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3">Choose Database Mode</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card 
            className={`p-6 cursor-pointer border-2 transition-all ${
              config.database.mode === 'local' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setConfig(prev => ({ ...prev, database: { mode: 'local' } }))}
          >
            <div className="flex items-center space-x-3">
              <HardDrive className="w-8 h-8 text-gray-600" />
              <div>
                <h4 className="font-semibold">Local Database</h4>
                <p className="text-sm text-gray-600">Data stored locally on your device</p>
              </div>
            </div>
            <div className="mt-4">
              <Badge variant="outline" className="text-green-600 border-green-200">
                ✅ Privacy-focused
              </Badge>
              <Badge variant="outline" className="text-green-600 border-green-200 ml-2">
                ✅ No internet required
              </Badge>
            </div>
          </Card>

          <Card 
            className={`p-6 cursor-pointer border-2 transition-all ${
              config.database.mode === 'cloud' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setConfig(prev => ({ ...prev, database: { mode: 'cloud' } }))}
          >
            <div className="flex items-center space-x-3">
              <Cloud className="w-8 h-8 text-gray-600" />
              <div>
                <h4 className="font-semibold">Cloud Database</h4>
                <p className="text-sm text-gray-600">Sync across devices (requires Neon account)</p>
              </div>
            </div>
            <div className="mt-4">
              <Badge variant="outline" className="text-blue-600 border-blue-200">
                ✅ Cross-device sync
              </Badge>
              <Badge variant="outline" className="text-blue-600 border-blue-200 ml-2">
                ✅ Scalable
              </Badge>
            </div>
          </Card>
        </div>
      </div>

      {config.database.mode === 'cloud' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Neon Connection String</label>
            <Input
              type="password"
              placeholder="postgresql://username:password@host/database"
              value={config.database.neon_connection || ''}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                database: { ...prev.database, neon_connection: e.target.value }
              }))}
            />
            <p className="text-xs text-gray-500 mt-1">
              Get this from your Neon project dashboard
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Project ID</label>
            <Input
              placeholder="your-project-id-here"
              value={config.database.neon_project_id || ''}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                database: { ...prev.database, neon_project_id: e.target.value }
              }))}
            />
          </div>
        </div>
      )}
    </div>
  )

  const AISetup = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3">AI Provider</h3>
        <div className="space-y-3">
          {[
            { id: 'local', name: 'Local AI', desc: 'No API key required, basic features only' },
            { id: 'openai', name: 'OpenAI', desc: 'GPT-4, requires API key' },
            { id: 'gemini', name: 'Google Gemini', desc: 'Gemini Pro, requires API key' },
            { id: 'anthropic', name: 'Anthropic Claude', desc: 'Claude 3, requires API key' }
          ].map(provider => (
            <Card 
              key={provider.id}
              className={`p-4 cursor-pointer border-2 transition-all ${
                config.ai.provider === provider.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setConfig(prev => ({ 
                ...prev, 
                ai: { provider: provider.id as any, api_key: undefined } 
              }))}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-medium">{provider.name}</h4>
                  <p className="text-sm text-gray-600">{provider.desc}</p>
                </div>
                {provider.id === 'local' && (
                  <Badge variant="outline" className="text-green-600 border-green-200">
                    Free
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {config.ai.provider !== 'local' && (
        <div>
          <label className="block text-sm font-medium mb-2">API Key</label>
          <Input
            type="password"
            placeholder="Enter your API key"
            value={config.ai.api_key || ''}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              ai: { ...prev.ai, api_key: e.target.value }
            }))}
          />
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl bg-white shadow-lg">
        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Glass</h1>
            <p className="text-gray-600">Let's set up your AI assistant for the first time</p>
          </div>

          {/* Progress Steps */}
          <div className="flex justify-center mb-8">
            <div className="flex space-x-4">
              {steps.map((step, index) => {
                const IconComponent = step.icon
                const isCompleted = index < currentStep
                const isCurrent = index === currentStep
                
                return (
                  <div key={step.id} className="flex flex-col items-center">
                    <div className={`
                      w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all
                      ${isCompleted ? 'bg-green-500 border-green-500 text-white' : 
                        isCurrent ? 'bg-blue-500 border-blue-500 text-white' : 
                        'bg-white border-gray-300 text-gray-400'}
                    `}>
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <span className={`text-xs mt-2 ${isCurrent ? 'font-medium' : 'text-gray-500'}`}>
                      {step.title}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="mb-8">
            {currentStep === 0 && <DatabaseSetup />}
            {currentStep === 1 && <AISetup />}
            {currentStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Features</h3>
                {/* Feature toggles */}
              </div>
            )}
            {currentStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Privacy & Security</h3>
                {/* Privacy settings */}
              </div>
            )}
            {currentStep === 4 && (
              <div className="text-center space-y-6">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                <h3 className="text-2xl font-semibold">Setup Complete!</h3>
                <p className="text-gray-600">
                  Xerus is configured and ready to use. You can change these settings anytime from the preferences.
                </p>
                
                {testResults && (
                  <Card className="p-4 text-left">
                    <h4 className="font-medium mb-2">Configuration Test Results:</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center space-x-2">
                        {testResults.database ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span>Database Connection</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {testResults.ai ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span>AI Provider</span>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
            >
              Previous
            </Button>

            <div className="space-x-2">
              {currentStep === steps.length - 1 ? (
                <>
                  <Button variant="outline" onClick={testConfiguration} disabled={testing}>
                    {testing ? 'Testing...' : 'Test Configuration'}
                  </Button>
                  <Button onClick={saveConfiguration}>
                    Complete Setup
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setCurrentStep(prev => Math.min(steps.length - 1, prev + 1))}
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}