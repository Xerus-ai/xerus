'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle, X } from 'lucide-react'
import { 
  Search,
  Calculator,
  Clock,
  Monitor,
  FileText,
  Globe,
  Network,
  Settings,
  PlayCircle,
  BarChart3,
  RefreshCw,
  Filter,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Square,
  Info
} from 'lucide-react'
import { getApiHeaders } from '@/utils/api'
import { Page, PageHeader } from '@/components/Page'

interface Tool {
  id: string
  name: string
  tool_name?: string  // Backend field name
  description: string
  icon: string  // Can be emoji or HTTP URL to image
  category: string
  status: 'active' | 'inactive'
  is_enabled: boolean
  usage_count: number
  execution_count?: number  // Backend field name
  last_used: string | null
  last_executed_at?: string  // Backend field name
  execution_time_avg: number
  avg_execution_time?: number  // Backend field name
  success_rate: number
  parameters: any
  configuration?: any  // Backend field name
  provider: string
  version: string
  // Authentication fields
  requires_auth?: boolean
  auth_type?: 'oauth' | 'api_key' | null | string
  is_configured?: boolean
  // Enhanced authentication status fields
  token_info?: {
    expires_at?: string | null
    has_refresh_token?: boolean
  } | null
  auth_status_checked?: boolean
  // MCP Server specific fields
  mcp_server?: boolean
  mcp_server_id?: string
  server_status?: 'running' | 'stopped'
  capabilities?: string[]
  tool_count?: number
  docker_image?: string
  api_endpoint?: string
  // OAuth status fields for MCP servers
  oauth_configured?: boolean
  oauth_token_expires?: string
  oauth_token_valid?: boolean
  authentication_status?: 'authenticated' | 'not_configured'
}

// Helper function to get API base URL using runtime config
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
  return 'http://localhost:5001/api/v1' // Fallback - corrected port and path
}

export default function ToolsPage() {
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = useState('')
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [operatingTools, setOperatingTools] = useState<Set<string>>(new Set())
  const [configTool, setConfigTool] = useState<Tool | null>(null)
  const [configuringAuth, setConfiguringAuth] = useState<string | null>(null)
  const [mcpCredentialModal, setMcpCredentialModal] = useState<{serverId: string, serverName: string, requirements: any} | null>(null)
  const [customOAuthConfig, setCustomOAuthConfig] = useState<{
    toolName: string
    clientId: string
    clientSecret: string
    additionalField?: string
    scopes: string
    callbackUrl: string
    toolType: string
  } | null>(null)
  const [showCustomOAuthForm, setShowCustomOAuthForm] = useState(false)
  const [credentialForm, setCredentialForm] = useState<{[key: string]: string}>({})

  // Provider-based OAuth configurations (scalable approach)
  const getProviderType = (toolId: string): string => {
    // Extract provider from tool ID patterns
    if (toolId.includes('atlassian') || toolId.includes('jira') || toolId.includes('confluence')) return 'atlassian'
    if (toolId.includes('github')) return 'github'
    if (toolId.includes('slack')) return 'slack'
    if (toolId.includes('gmail') || toolId.includes('google')) return 'google'
    // Add more patterns as needed
    return 'generic'
  }

  const providerConfigs: { [key: string]: {
    displayName: string
    description: string
    fields: {
      clientId: { label: string; placeholder: string }
      clientSecret: { label: string; placeholder: string }
      additionalField?: { label: string; placeholder: string; description: string }
    }
    scopes: string
    helpText: string
    docsUrl: string
  }} = {
    atlassian: {
      displayName: 'Atlassian',
      description: 'This gives you maximum privacy and control over your Atlassian data.',
      fields: {
        clientId: { 
          label: 'Client ID', 
          placeholder: 'Your Atlassian OAuth Client ID' 
        },
        clientSecret: { 
          label: 'Client Secret', 
          placeholder: 'Your Atlassian OAuth Client Secret' 
        },
        additionalField: { 
          label: 'Cloud ID (Optional)', 
          placeholder: 'Your Atlassian Cloud ID (if specific site)',
          description: 'Optional - leave blank for multi-tenant access'
        }
      },
      scopes: 'read:jira-user read:jira-work write:jira-work read:confluence-space.summary read:confluence-props write:confluence-props read:confluence-content.all write:confluence-content offline_access',
      helpText: 'Visit the Atlassian Developer Console to create your OAuth app.',
      docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/'
    },
    github: {
      displayName: 'GitHub',
      description: 'This gives you maximum privacy and control over your GitHub data.',
      fields: {
        clientId: { 
          label: 'Client ID', 
          placeholder: 'Your GitHub OAuth App Client ID' 
        },
        clientSecret: { 
          label: 'Client Secret', 
          placeholder: 'Your GitHub OAuth App Client Secret' 
        }
      },
      scopes: 'repo read:user read:org',
      helpText: 'Visit GitHub Developer Settings to create your OAuth app.',
      docsUrl: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app'
    },
    slack: {
      displayName: 'Slack',
      description: 'This gives you maximum privacy and control over your Slack workspace data.',
      fields: {
        clientId: { 
          label: 'Client ID', 
          placeholder: 'Your Slack App Client ID' 
        },
        clientSecret: { 
          label: 'Client Secret', 
          placeholder: 'Your Slack App Client Secret' 
        }
      },
      scopes: 'channels:read chat:write files:read',
      helpText: 'Visit the Slack API portal to create your app.',
      docsUrl: 'https://api.slack.com/authentication/oauth-v2'
    },
    google: {
      displayName: 'Google',
      description: 'This gives you maximum privacy and control over your Google services data.',
      fields: {
        clientId: { 
          label: 'Client ID', 
          placeholder: 'Your Google OAuth 2.0 Client ID' 
        },
        clientSecret: { 
          label: 'Client Secret', 
          placeholder: 'Your Google OAuth 2.0 Client Secret' 
        }
      },
      scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/drive.readonly',
      helpText: 'Visit the Google Cloud Console to create your OAuth credentials.',
      docsUrl: 'https://developers.google.com/identity/protocols/oauth2'
    },
    generic: {
      displayName: 'OAuth Provider',
      description: 'Configure your custom OAuth application.',
      fields: {
        clientId: { 
          label: 'Client ID', 
          placeholder: 'Your OAuth Client ID' 
        },
        clientSecret: { 
          label: 'Client Secret', 
          placeholder: 'Your OAuth Client Secret' 
        }
      },
      scopes: 'read write',
      helpText: 'Visit your OAuth provider\'s developer portal to create your app.',
      docsUrl: '#'
    }
  }

  useEffect(() => {
    fetchTools()
  }, [])

  // Simplified visibility handling - avoid excessive refreshes
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Only refresh if we've been away for more than 30 seconds and have no data
      if (document.visibilityState === 'visible' && tools.length === 0 && !loading && !error) {
        const lastFetch = sessionStorage.getItem('last_tools_fetch');
        const now = Date.now();
        if (!lastFetch || (now - parseInt(lastFetch)) > 30000) {
          console.log('Page visible after long absence, refreshing tools...');
          fetchTools()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [tools.length, loading, error])

  // Disabled pathname watcher - causing excessive refreshes
  // useEffect(() => {
  //   if (pathname === '/tools' && tools.length === 0 && !loading && !error) {
  //     console.log('Navigated back to tools page with empty data, refreshing...');
  //     fetchTools()
  //   }
  // }, [pathname, tools.length, loading, error])

  const fetchTools = async () => {
    try {
      // Rate limiting protection - prevent excessive API calls
      const lastFetch = sessionStorage.getItem('last_tools_fetch');
      const now = Date.now();
      if (lastFetch && (now - parseInt(lastFetch)) < 2000) {
        console.log('Rate limiting: Skipping fetch, too recent');
        return;
      }
      
      sessionStorage.setItem('last_tools_fetch', now.toString());
      setLoading(true)
      
      const apiUrl = await getApiUrl()
      const response = await fetch(`${apiUrl}/tools`, {
        headers: await getApiHeaders()
      })
      if (!response.ok) throw new Error('Failed to fetch tools')
      
      const toolsData = await response.json()
      
      // Map backend tool_configurations data to frontend Tool format
      const mappedTools = await Promise.all(toolsData.map(async (tool: any) => {
        const baseToolData = {
          id: tool.id?.toString() || tool.tool_name,
          name: tool.display_name || tool.tool_name || tool.name || 'Unnamed Tool',
          tool_name: tool.tool_name,
          description: tool.description || '',
          icon: tool.icon || '🔧',  // Backend now provides HTTP URLs or emoji fallback
          category: tool.category || 'utility',
          status: tool.is_enabled ? 'active' : 'inactive',
          is_enabled: tool.is_enabled || false,
          usage_count: tool.execution_count || 0,
          execution_count: tool.execution_count,
          last_used: tool.last_executed_at || null,
          last_executed_at: tool.last_executed_at,
          execution_time_avg: tool.avg_execution_time || 0,
          avg_execution_time: tool.avg_execution_time,
          success_rate: tool.success_rate || 0,
          configuration: tool.configuration || {},
          parameters: tool.parameters || [],
          provider: tool.provider || 'unknown',
          version: tool.version || '1.0.0',
          // Authentication fields (default values)
          requires_auth: tool.requires_auth || false,
          auth_type: tool.auth_type || null,
          is_configured: tool.is_configured || false,
          api_endpoint: tool.api_endpoint || null,
          // MCP Server fields
          mcp_server: tool.mcp_server || false,
          mcp_server_id: tool.mcp_server_id || null,
          server_status: tool.server_status || null,
          capabilities: tool.capabilities || [],
          tool_count: tool.tool_count || 0,
          // OAuth status fields for MCP servers
          oauth_configured: tool.oauth_configured || false,
          oauth_token_expires: tool.oauth_token_expires || null,
          oauth_token_valid: tool.oauth_token_valid || false,
          authentication_status: tool.authentication_status || 'not_configured',
          // Enhanced authentication status fields
          token_info: null,
          auth_status_checked: false
        }

        // Fetch detailed per-user authentication status for tools that require auth
        if (baseToolData.requires_auth) {
          try {
            const authToolName = baseToolData.mcp_server ? baseToolData.mcp_server_id : (baseToolData.tool_name || baseToolData.name)
            const authResponse = await fetch(`${apiUrl}/tools/${authToolName}/auth/status`, {
              headers: await getApiHeaders()
            })
            
            if (authResponse.ok) {
              const authStatus = await authResponse.json()
              baseToolData.is_configured = authStatus.is_authenticated || false
              baseToolData.token_info = authStatus.token_info || null
              baseToolData.auth_status_checked = true
            }
          } catch (authErr) {
            console.warn(`Failed to fetch auth status for ${baseToolData.name}:`, authErr)
            // Keep default values if auth status fetch fails
          }
        }

        return baseToolData
      }))
      
      setTools(mappedTools)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tools')
      setLoading(false)
    }
  }

  const handleToolToggle = async (toolId: string, enabled: boolean) => {
    // Add tool to operating state
    setOperatingTools(prev => new Set(Array.from(prev).concat([toolId])))
    
    try {
      const apiUrl = await getApiUrl()
      // Use tool name for API call since backend expects tool name
      const response = await fetch(`${apiUrl}/tools/${toolId}/toggle`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await getApiHeaders())
        },
        body: JSON.stringify({ enabled })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to toggle tool' }))
        throw new Error(errorData.message || 'Failed to toggle tool')
      }
      
      // Update local state using either id or name
      setTools(prevTools => 
        prevTools.map(tool => 
          (tool.id === toolId || tool.name === toolId) ? { ...tool, is_enabled: enabled, status: enabled ? 'active' : 'inactive' } : tool
        )
      )
    } catch (err) {
      console.error('Failed to toggle tool:', err)
      // Show user-friendly error
      alert(`Failed to toggle tool: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      // Remove tool from operating state
      setOperatingTools(prev => {
        const newSet = new Set(prev)
        newSet.delete(toolId)
        return newSet
      })
    }
  }

  const executeToolTest = async (toolName: string, testParams: any) => {
    // Add tool to operating state
    setOperatingTools(prev => new Set(Array.from(prev).concat([`${toolName}_test`])))
    
    try {
      const apiUrl = await getApiUrl()
      const response = await fetch(`${apiUrl}/tools/${toolName}/execute`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await getApiHeaders())
        },
        body: JSON.stringify({ parameters: testParams })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Tool execution failed' }))
        throw new Error(errorData.error || errorData.message || 'Tool execution failed')
      }
      
      const result = await response.json()
      
      // Update tool usage stats after successful execution
      setTools(prevTools => 
        prevTools.map(tool => 
          tool.name === toolName ? { 
            ...tool, 
            usage_count: tool.usage_count + 1,
            last_used: new Date().toISOString()
          } : tool
        )
      )
      
      // Show success message with more details
      const executionTime = result.result?.execution_time || result.execution_time || 'N/A'
      alert(`Tool executed successfully!\n\nTool: ${toolName}\nExecution time: ${executionTime}ms\nResult: ${JSON.stringify(result.result || result, null, 2).slice(0, 200)}...`)
    } catch (err) {
      console.error('Tool execution error:', err)
      alert(`Tool execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      // Remove tool from operating state
      setOperatingTools(prev => {
        const newSet = new Set(prev)
        newSet.delete(`${toolName}_test`)
        return newSet
      })
    }
  }

  const handleAuthConfigure = async (toolName: string, authType: 'oauth' | 'api_key') => {
    if (authType === 'oauth') {
      try {
        setConfiguringAuth(toolName)
        const apiUrl = await getApiUrl()
        const response = await fetch(`${apiUrl}/tools/${toolName}/auth/url`, {
          headers: await getApiHeaders()
        })
        
        if (!response.ok) {
          throw new Error('Failed to get OAuth URL')
        }
        
        const { auth_url, oauth_callback_url } = await response.json()
        
        // Open OAuth URL in new window
        const authWindow = window.open(
          auth_url,
          'oauth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        )
        
        // Enhanced OAuth callback monitoring
        const monitorOAuthFlow = () => {
          const checkInterval = setInterval(async () => {
            try {
              if (authWindow?.closed) {
                clearInterval(checkInterval)
                setConfiguringAuth(null)
                // Single refresh when window closes
                setTimeout(fetchTools, 1000);
                return
              }

              // Check if window has navigated to callback URL
              let currentUrl = ''
              try {
                // Use any type to bypass TypeScript limitations for OAuth flow
                currentUrl = (authWindow as any)?.location?.href || ''
              } catch (e) {
                // Cross-origin security prevents reading URL, but this is expected during OAuth flow
                return
              }

              // If we can read the URL and it contains callback parameters, process it
              if (currentUrl.includes('code=') || currentUrl.includes('error=')) {
                clearInterval(checkInterval)
                
                try {
                  // Extract callback URL
                  const callbackUrl = currentUrl
                  
                  // Process the callback through our backend
                  const callbackResponse = await fetch(`${apiUrl}/tools/${toolName}/auth/process-callback`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(await getApiHeaders())
                    },
                    body: JSON.stringify({
                      callback_url: callbackUrl
                    })
                  })
                  
                  const callbackResult = await callbackResponse.json()
                  
                  if (callbackResponse.ok && callbackResult.success) {
                    // Close the OAuth window immediately
                    authWindow?.close()
                    
                    // Single refresh without polling to avoid rate limits
                    setTimeout(() => {
                      fetchTools();
                    }, 1000);
                  } else {
                    throw new Error(callbackResult.message || callbackResult.error || 'Authentication processing failed')
                  }
                  
                } catch (processError) {
                  console.error('OAuth callback processing error:', processError)
                  alert(`❌ OAuth processing failed: ${processError instanceof Error ? processError.message : 'Unknown error'}`)
                  authWindow?.close()
                }
                
                setConfiguringAuth(null)
              }
              
            } catch (monitorError) {
              console.error('OAuth monitoring error:', monitorError)
            }
          }, 1000)
          
          // Backup: If window closes without callback processing, clean up
          setTimeout(() => {
            if (!authWindow?.closed) {
              clearInterval(checkInterval)
            }
          }, 300000) // 5 minute timeout
        }
        
        // Start monitoring the OAuth flow
        monitorOAuthFlow()
        
      } catch (err) {
        console.error('OAuth configuration error:', err)
        alert(`OAuth configuration failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
        setConfiguringAuth(null)
      }
    } else {
      // Handle API key configuration (placeholder)
      alert('API key configuration not implemented yet')
    }
  }

  // Note: MCP OAuth configuration now uses the same handleAuthConfigure function
  // since backend endpoints have been unified

  // MCP Server credential configuration
  const handleMCPCredentialConfigure = async (serverId: string, serverName: string) => {
    try {
      setConfiguringAuth(serverId)
      const apiUrl = await getApiUrl()
      
      // Get credential requirements for this MCP server
      const response = await fetch(`${apiUrl}/tools/mcp/${serverId}/credentials/requirements`, {
        headers: await getApiHeaders()
      })
      
      if (!response.ok) {
        throw new Error('Failed to get credential requirements')
      }
      
      const { credentials: requirements } = await response.json()
      
      // Open credential configuration modal
      setMcpCredentialModal({ serverId, serverName, requirements })
      setCredentialForm({})
      
    } catch (err) {
      console.error('MCP credential configuration error:', err)
      alert(`Failed to configure credentials: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setConfiguringAuth(null)
    }
  }

  const handleMCPCredentialSave = async () => {
    if (!mcpCredentialModal) return

    try {
      const { serverId } = mcpCredentialModal
      const apiUrl = await getApiUrl()
      
      // Validate required fields
      const requirements = mcpCredentialModal.requirements
      if (requirements.required && requirements.fields) {
        for (const field of requirements.fields) {
          if (!credentialForm[field] || credentialForm[field].trim() === '') {
            throw new Error(`${field} is required`)
          }
        }
      }

      // Prepare credentials based on auth type
      const credentials = {
        type: requirements.type,
        ...credentialForm
      }

      // Store credentials
      const response = await fetch(`${apiUrl}/tools/mcp/${serverId}/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getApiHeaders())
        },
        body: JSON.stringify(credentials)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to store credentials')
      }
      
      // Close modal and refresh tools
      setMcpCredentialModal(null)
      setCredentialForm({})
      
      // Refresh tools to get updated configuration status
      await fetchTools()
      
      alert('Credentials saved successfully!')
      
    } catch (err) {
      console.error('MCP credential save error:', err)
      alert(`Failed to save credentials: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const checkAuthStatus = async (toolName: string) => {
    try {
      const apiUrl = await getApiUrl()
      const response = await fetch(`${apiUrl}/tools/${toolName}/auth/status`, {
        headers: await getApiHeaders()
      })
      
      if (response.ok) {
        const status = await response.json()
        return status.isConfigured || false
      }
    } catch (err) {
      console.error('Failed to check auth status:', err)
    }
    return false
  }

  const handleMCPServerStart = async (serverId: string) => {
    if (!serverId) return
    
    setOperatingTools(prev => new Set(Array.from(prev).concat([`mcp:${serverId}_start`])))
    
    try {
      const apiUrl = await getApiUrl()
      // Use the enhanced start endpoint that handles user credentials
      const response = await fetch(`${apiUrl}/tools/mcp/${serverId}/start-with-user`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await getApiHeaders())
        },
        body: JSON.stringify({})
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Server start failed' }))
        throw new Error(errorData.error || errorData.message || 'Failed to start MCP server')
      }
      
      const result = await response.json()
      
      // Refresh tools list to show updated server status
      setTimeout(fetchTools, 1000)
      
      // ✅ FIX: Better messaging for already running servers
      const message = result.alreadyRunning 
        ? `ℹ️ ${serverId} server is already running!\n\nCapabilities: ${result.capabilities?.tools?.length || 0} tools available`
        : `✅ ${serverId} server started successfully!\n\nCapabilities: ${result.capabilities?.tools?.length || 0} tools available`
      
      alert(message)
    } catch (err) {
      console.error('MCP server start error:', err)
      alert(`❌ Failed to start ${serverId} server: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setOperatingTools(prev => {
        const newSet = new Set(prev)
        newSet.delete(`mcp:${serverId}_start`)
        return newSet
      })
    }
  }

  const handleMCPServerStop = async (serverId: string) => {
    if (!serverId) return
    
    setOperatingTools(prev => new Set(Array.from(prev).concat([`mcp:${serverId}_stop`])))
    
    try {
      const apiUrl = await getApiUrl()
      const response = await fetch(`${apiUrl}/tools/mcp/${serverId}/stop`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await getApiHeaders())
        },
        body: JSON.stringify({})
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Server stop failed' }))
        throw new Error(errorData.error || errorData.message || 'Failed to stop MCP server')
      }
      
      // Refresh tools list to show updated server status
      setTimeout(fetchTools, 1000)
      
      alert(`✅ ${serverId} server stopped successfully!`)
    } catch (err) {
      console.error('MCP server stop error:', err)
      alert(`❌ Failed to stop ${serverId} server: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setOperatingTools(prev => {
        const newSet = new Set(prev)
        newSet.delete(`mcp:${serverId}_stop`)
        return newSet
      })
    }
  }

  const getToolIcon = (iconName: string) => {
    const iconMap: { [key: string]: any } = {
      '🔍': Globe,
      '🕷️': Network,
      '⏰': Clock,
      '💻': Monitor,
      '🧮': Calculator,
      '📄': FileText
    }
    return iconMap[iconName] || Settings
  }

  const getAuthStatusDetails = (tool: Tool) => {
    if (!tool.requires_auth) {
      return { status: 'none', message: 'No authentication required', icon: null, color: 'text-gray-500' }
    }

    // Simple 2-state logic: authenticated or needs authentication
    const isAuthenticated = tool.is_configured && !isTokenExpired(tool)
    
    if (isAuthenticated) {
      return { 
        status: 'configured', 
        message: 'Authenticated', 
        icon: CheckCircle, 
        color: 'text-green-500' 
      }
    } else {
      return { 
        status: 'not_configured', 
        message: 'Authentication required', 
        icon: AlertTriangle, 
        color: 'text-orange-500' 
      }
    }
  }

  const isTokenExpired = (tool: Tool) => {
    if (!tool.token_info?.expires_at) return false
    const expiryTime = new Date(tool.token_info.expires_at)
    const now = new Date()
    
    // Check for obviously corrupted dates (e.g., year > 2050)
    if (expiryTime.getFullYear() > 2050) {
      console.warn(`[WARNING] Token expiry date seems corrupted for ${tool.name}: ${expiryTime.toISOString()}`)
      return true // Treat corrupted dates as expired to force re-authentication
    }
    
    return expiryTime.getTime() <= now.getTime()
  }

  const getTestParams = (toolName: string) => {
    // Default test parameters for common tools
    const defaultParams: { [key: string]: any } = {
      'web_search': { query: 'Xerus AI assistant features', max_results: 3 },
      'perplexity': { query: 'Latest AI technology trends', max_results: 5 },
      'calculate': { expression: '2 + 2 * 3' },
      'get_time': { timezone: 'UTC', format: 'readable' },
      'get_system_info': { details: ['platform', 'memory'] },
      'search_documents': { query: 'AI features', limit: 10 },
      'firecrawl_scrape': { url: 'https://example.com', include_links: false },
      'tavily': { query: 'AI assistant capabilities', include_answer: true },
      'google_calendar': { 
        operation: 'listEvents',
        parameters: {
          calendarId: 'primary',
          maxResults: 10,
          timeMin: new Date().toISOString(),
          singleEvents: true,
          orderBy: 'startTime'
        }
      }
    }
    
    // Handle MCP servers specifically
    if (toolName.startsWith('mcp:')) {
      const serverId = toolName.replace('mcp:', '');
      
      // Specific test parameters for known MCP servers
      const mcpParams: { [key: string]: any } = {
        'gmail-remote': { 
          functionName: 'get_profile'
        },
        'github-remote': { 
          functionName: 'get_user'
        },
        'playwright-remote': {
          functionName: 'navigate_to_page',
          url: 'https://example.com'
        },
        'weather-remote': {
          functionName: 'get_current_weather',
          location: 'San Francisco'
        }
      }
      
      return mcpParams[serverId] || { 
        functionName: 'get_info',
        test: true 
      }
    }
    
    // For any tool not in the defaults, provide a generic test parameter
    return defaultParams[toolName] || { 
      test: true, 
      message: `Test execution for ${toolName}` 
    }
  }

  const categories = ['all', 'web_search', 'calculation', 'utility', 'system', 'document_processing', 'mcp_tools']

  const filteredTools = tools.filter(tool => {
    const toolName = tool.name || tool.tool_name || ''
    const toolDescription = tool.description || ''
    
    // Exclude Playwright Remote server
    if (toolName.toLowerCase().includes('playwright') && tool.mcp_server) {
      return false
    }
    
    const matchesSearch = toolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         toolDescription.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading tools...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center space-x-2 text-red-600">
          <AlertCircle className="h-6 w-6" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <Page>
      <PageHeader title="Tools & Integrations" description="Manage and configure Xerus AI tools" />

        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input 
              placeholder="Search tools..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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

        <main>
          {/* Category Filter */}
          <div className="mb-8">
            <div className="flex space-x-4">
              {categories.map(category => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className="capitalize"
                >
                  {category.replace('_', ' ')}
                </Button>
              ))}
            </div>
          </div>


          {/* Tools Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTools.map((tool) => {
              const IconComponent = getToolIcon(tool.icon)
              return (
                <Card key={tool.id} className="bg-white border border-gray-200 rounded-xl p-4 h-[220px] flex flex-col">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center p-1">
                        {tool.icon && (tool.icon.startsWith('http') || tool.icon.startsWith('/api')) ? (
                          <img 
                            src={tool.icon} 
                            alt={`${tool.name} icon`}
                            className="w-full h-full object-contain rounded"
                            onError={(e) => {
                              // Fallback to emoji icon on error
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.parentElement!.innerHTML = '<div class="w-6 h-6 text-gray-600 flex items-center justify-center text-lg">🔧</div>';
                            }}
                          />
                        ) : (
                          <IconComponent className="w-6 h-6 text-gray-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <h3 className="text-lg font-semibold text-gray-800 truncate">{tool.name}</h3>
                        </div>
                        <div className="flex items-center space-x-2">
                          {tool.mcp_server && (
                            <Badge variant="secondary" className="text-xs">
                              MCP
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={tool.is_enabled}
                        onCheckedChange={(enabled) => handleToolToggle(tool.id || tool.tool_name || tool.name, enabled)}
                        disabled={operatingTools.has(tool.id || tool.tool_name || tool.name) || (tool.requires_auth && !tool.is_configured)}
                        className="data-[state=checked]:bg-primary"
                      />
                      {operatingTools.has(tool.id || tool.tool_name || tool.name) && (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3 flex-1 overflow-hidden" style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {tool.description}
                  </p>

                  <div className="grid grid-cols-2 gap-3 mb-3 text-xs flex-shrink-0">
                    {tool.mcp_server ? (
                      <>
                        <div>
                          <span className="text-gray-500">Functions:</span>
                          <span className="ml-1 font-medium">{tool.tool_count || 0} tools</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Auth Type:</span>
                          <span className="ml-1 font-medium capitalize">{tool.auth_type || 'none'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Status:</span>
                          <span className="ml-1 font-medium">{tool.server_status}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Provider:</span>
                          <span className="ml-1 font-medium">{tool.provider}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-gray-500">Success Rate:</span>
                          <span className="ml-1 font-medium">{tool.success_rate}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Usage:</span>
                          <span className="ml-1 font-medium">{tool.usage_count}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Avg Time:</span>
                          <span className="ml-1 font-medium">{tool.execution_time_avg}ms</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Provider:</span>
                          <span className="ml-1 font-medium">{tool.provider}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex space-x-2 mt-auto flex-shrink-0">
                    {tool.mcp_server ? (
                      // MCP Server specific buttons
                      tool.requires_auth && !tool.is_configured ? (
                        <Button 
                          size="sm" 
                          onClick={() => {
                            console.log('[SEARCH] MCP Button clicked for tool:', {
                              name: tool.name,
                              mcp_server: tool.mcp_server,
                              mcp_server_id: tool.mcp_server_id,
                              auth_type: tool.auth_type,
                              requires_auth: tool.requires_auth
                            });
                            if (tool.auth_type === 'oauth') {
                              console.log('[ARROW] Calling handleAuthConfigure for MCP OAuth');
                              handleAuthConfigure(tool.mcp_server_id!, 'oauth')
                            } else {
                              console.log('[ARROW] Calling handleMCPCredentialConfigure');
                              handleMCPCredentialConfigure(tool.mcp_server_id!, tool.name)
                            }
                          }}
                          disabled={configuringAuth === tool.mcp_server_id}
                          className="flex-1 text-white hover:opacity-90"
                          style={{ backgroundColor: '#ff7f24e6' }}
                        >
                          {configuringAuth === tool.mcp_server_id && (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          )}
                          Authenticate
                        </Button>
                      ) : tool.requires_auth && tool.is_configured ? (
                        <Button 
                          size="sm" 
                          onClick={() => {
                            if (tool.auth_type === 'oauth') {
                              handleAuthConfigure(tool.mcp_server_id!, 'oauth')
                            } else {
                              handleMCPCredentialConfigure(tool.mcp_server_id!, tool.name)
                            }
                          }}
                          className="flex-1 bg-black text-white hover:bg-gray-800"
                        >
                          Authenticated
                        </Button>
                      ) : tool.server_status === 'running' ? (
                        <Button 
                          size="sm" 
                          onClick={() => handleMCPServerStop(tool.mcp_server_id!)}
                          disabled={operatingTools.has(`${tool.id}_stop`)}
                          className="flex-1 bg-red-600 text-white hover:bg-red-700"
                        >
                          {operatingTools.has(`${tool.id}_stop`) ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Square className="w-4 h-4 mr-1" />
                          )}
                          Stop Server
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          onClick={() => handleMCPServerStart(tool.mcp_server_id!)}
                          disabled={operatingTools.has(`${tool.id}_start`) || (tool.requires_auth && !tool.is_configured)}
                          className="flex-1 bg-green-600 text-white hover:bg-green-700"
                        >
                          {operatingTools.has(`${tool.id}_start`) ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <PlayCircle className="w-4 h-4 mr-1" />
                          )}
                          Start Server
                        </Button>
                      )
                    ) : (
                      // Regular tool buttons
                      tool.requires_auth && !tool.is_configured ? (
                        <Button 
                          size="sm" 
                          onClick={() => handleAuthConfigure(tool.tool_name || tool.name, (tool.auth_type || 'oauth') as 'oauth' | 'api_key')}
                          disabled={configuringAuth === (tool.tool_name || tool.name)}
                          className="flex-1 text-white hover:opacity-90"
                          style={{ backgroundColor: '#ff7f24e6' }}
                        >
                          {configuringAuth === (tool.tool_name || tool.name) && (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          )}
                          Configure
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          onClick={() => executeToolTest(tool.id || tool.tool_name || tool.name, getTestParams(tool.id || tool.tool_name || tool.name))}
                          disabled={!tool.is_enabled || operatingTools.has(`${tool.id || tool.tool_name || tool.name}_test`) || (tool.requires_auth && !tool.is_configured)}
                          className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          {operatingTools.has(`${tool.id || tool.tool_name || tool.name}_test`) ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <PlayCircle className="w-4 h-4 mr-1" />
                          )}
                          Test
                        </Button>
                      )
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="px-3"
                      onClick={() => setConfigTool(tool)}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>

          {!loading && filteredTools.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No tools found</h3>
              <p className="text-gray-500">Try adjusting your search or category filter.</p>
            </div>
          )}
        </main>

        {/* Tool Configuration Modal */}
        {configTool && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Configure {configTool.name}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfigTool(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                {configTool.requires_auth && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Authentication
                    </label>
                    <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {(() => {
                            const authStatus = getAuthStatusDetails(configTool)
                            const IconComponent = authStatus.icon
                            return (
                              <>
                                {IconComponent && (
                                  <IconComponent className={`w-4 h-4 ${authStatus.color}`} />
                                )}
                                <span className="text-sm font-medium">
                                  {authStatus.message}
                                </span>
                              </>
                            )
                          })()}
                        </div>
                        <Badge variant={configTool.is_configured ? "default" : "secondary"} className="text-xs">
                          {configTool.auth_type?.toUpperCase() || 'OAUTH'}
                        </Badge>
                      </div>
                      {configTool.is_configured && configTool.token_info && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                            {configTool.token_info.expires_at && (
                              <div>
                                <span className="text-gray-500">Expires:</span>
                                <span className="ml-1 font-medium">
                                  {(() => {
                                    const expiryDate = new Date(configTool.token_info.expires_at);
                                    if (expiryDate.getFullYear() > 2050) {
                                      return <span className="text-red-500">Invalid date - re-authenticate required</span>;
                                    }
                                    return expiryDate.toLocaleString();
                                  })()}
                                </span>
                              </div>
                            )}
                            <div>
                              <span className="text-gray-500">Refresh Token:</span>
                              <span className={`ml-1 font-medium ${configTool.token_info.has_refresh_token ? 'text-green-600' : 'text-orange-600'}`}>
                                {configTool.token_info.has_refresh_token ? 'Available' : 'None'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {!configTool.is_configured && configTool.auth_type === 'oauth' && (
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            OAuth Mode
                          </label>
                          <div className="space-y-2">
                            <div className="flex items-start space-x-2">
                              <input
                                type="radio"
                                id="xerus-managed"
                                name="oauthMode"
                                value="xerus-managed"
                                defaultChecked={true}
                                className="mt-1"
                              />
                              <div>
                                <label htmlFor="xerus-managed" className="text-sm font-medium text-gray-900">
                                  Xerus Managed (Recommended)
                                </label>
                                <p className="text-xs text-gray-500">
                                  Use Xerus shared OAuth app - just click and authenticate. Fast and easy setup.
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start space-x-2">
                              <input
                                type="radio"
                                id="custom-oauth"
                                name="oauthMode"
                                value="custom-oauth"
                                className="mt-1"
                              />
                              <div>
                                <label htmlFor="custom-oauth" className="text-sm font-medium text-gray-900">
                                  Custom OAuth App
                                </label>
                                <p className="text-xs text-gray-500">
                                  Use your own OAuth app for maximum privacy and control.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {!configTool.is_configured && (
                        <Button
                          size="sm"
                          onClick={() => {
                            if (configTool.mcp_server && configTool.auth_type === 'oauth') {
                              const oauthMode = (document.querySelector('input[name="oauthMode"]:checked') as HTMLInputElement)?.value;
                              
                              if (oauthMode === 'custom-oauth') {
                                // Show custom OAuth configuration form
                                const serverId = configTool.mcp_server_id!;
                                
                                // Get provider type based on server ID pattern
                                const providerType = getProviderType(serverId);
                                const providerConfig = providerConfigs[providerType];
                                
                                setCustomOAuthConfig({
                                  toolName: serverId,
                                  toolType: providerType,
                                  clientId: '',
                                  clientSecret: '',
                                  additionalField: '',
                                  scopes: providerConfig.scopes,
                                  callbackUrl: `${window.location.origin.replace(':3000', ':5001')}/api/v1/tools/${serverId}/auth/callback`
                                });
                                setShowCustomOAuthForm(true);
                                return;
                              }
                              handleAuthConfigure(configTool.mcp_server_id!, 'oauth')
                            } else if (configTool.mcp_server) {
                              handleMCPCredentialConfigure(configTool.mcp_server_id!, configTool.name)  
                            } else {
                              handleAuthConfigure(configTool.tool_name || configTool.name, (configTool.auth_type || 'oauth') as 'oauth' | 'api_key')
                            }
                            setConfigTool(null)
                          }}
                          disabled={configuringAuth === (configTool.mcp_server_id || configTool.tool_name || configTool.name)}
                          className="w-full text-white hover:opacity-90"
                          style={{ backgroundColor: '#ff7f24e6' }}
                        >
                          {configuringAuth === (configTool.mcp_server_id || configTool.tool_name || configTool.name) ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <ExternalLink className="w-4 h-4 mr-2" />
                          )}
                          Configure Authentication
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {configTool.mcp_server && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      MCP Server Details
                    </label>
                    <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                        <div>
                          <span className="text-gray-500">Functions:</span>
                          <span className="ml-1 font-medium">{configTool.tool_count || 0} available</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Server ID:</span>
                          <span className="ml-1 font-mono text-xs bg-gray-200 px-1 rounded">{configTool.mcp_server_id}</span>
                        </div>
                      </div>
                      
                      {configTool.capabilities && configTool.capabilities.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-2">
                            Available Functions:
                          </label>
                          <div className="grid grid-cols-2 gap-1">
                            {configTool.capabilities.map((func, index) => (
                              <div key={index} className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded flex items-center">
                                <span className="w-1.5 h-1.5 bg-secondary-foreground rounded-full mr-2 opacity-60"></span>
                                {func.replace(/_/g, ' ')}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <div className="flex items-center space-x-2">
                    <Switch 
                      checked={configTool.is_enabled}
                      onCheckedChange={(enabled) => {
                        handleToolToggle(configTool.id || configTool.tool_name || configTool.name, enabled)
                        setConfigTool({ ...configTool, is_enabled: enabled })
                      }}
                       className="data-[state=checked]:bg-primary"
                    />
                    <span className="text-sm text-gray-600">
                      {configTool.is_enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Category:</span>
                    <span className="ml-1 font-medium">{configTool.category}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Provider:</span>
                    <span className="ml-1 font-medium">{configTool.provider}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Version:</span>
                    <span className="ml-1 font-medium">{configTool.version}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Usage:</span>
                    <span className="ml-1 font-medium">{configTool.usage_count}</span>
                  </div>
                  {configTool.requires_auth && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Auth Status:</span>
                      <span className={`ml-1 font-medium ${
                        configTool.is_configured ? 'text-green-600' : 'text-orange-600'
                      }`}>
                        {configTool.is_configured ? 'Configured' : 'Setup Required'}
                      </span>
                    </div>
                  )}
                </div>

                {configTool.parameters && Object.keys(configTool.parameters).length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Configuration
                    </label>
                    <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(configTool.parameters, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setConfigTool(null)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => executeToolTest(configTool.id || configTool.tool_name || configTool.name, getTestParams(configTool.id || configTool.tool_name || configTool.name))}
                  disabled={!configTool.is_enabled || (configTool.requires_auth && !configTool.is_configured)}
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Test Tool
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {/* MCP Credential Configuration Modal */}
        {mcpCredentialModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4">
                  Configure {mcpCredentialModal.serverName} Credentials
                </h3>
                
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 mb-4">
                    {mcpCredentialModal.requirements.message}
                  </div>

                  {mcpCredentialModal.requirements.type === 'oauth' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Client ID *
                        </label>
                        <Input
                          type="text"
                          value={credentialForm.client_id || ''}
                          onChange={(e) => setCredentialForm(prev => ({ ...prev, client_id: e.target.value }))}
                          placeholder="Enter your OAuth client ID"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Client Secret *
                        </label>
                        <Input
                          type="password"
                          value={credentialForm.client_secret || ''}
                          onChange={(e) => setCredentialForm(prev => ({ ...prev, client_secret: e.target.value }))}
                          placeholder="Enter your OAuth client secret"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Redirect URI
                        </label>
                        <Input
                          type="text"
                          value={credentialForm.redirect_uri || 'http://localhost:3000/auth/callback'}
                          onChange={(e) => setCredentialForm(prev => ({ ...prev, redirect_uri: e.target.value }))}
                          placeholder="OAuth redirect URI"
                        />
                      </div>
                    </>
                  )}

                  {mcpCredentialModal.requirements.type === 'bearer' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bearer Token *
                      </label>
                      <Input
                        type="password"
                        value={credentialForm.token || ''}
                        onChange={(e) => setCredentialForm(prev => ({ ...prev, token: e.target.value }))}
                        placeholder="Enter your bearer token"
                      />
                    </div>
                  )}

                  {mcpCredentialModal.requirements.type === 'api_key' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Key *
                      </label>
                      <Input
                        type="password"
                        value={credentialForm.api_key || ''}
                        onChange={(e) => setCredentialForm(prev => ({ ...prev, api_key: e.target.value }))}
                        placeholder="Enter your API key"
                      />
                    </div>
                  )}

                  {mcpCredentialModal.requirements.type === 'basic' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Username *
                        </label>
                        <Input
                          type="text"
                          value={credentialForm.username || ''}
                          onChange={(e) => setCredentialForm(prev => ({ ...prev, username: e.target.value }))}
                          placeholder="Enter your username"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Password *
                        </label>
                        <Input
                          type="password"
                          value={credentialForm.password || ''}
                          onChange={(e) => setCredentialForm(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="Enter your password"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex space-x-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMcpCredentialModal(null)
                      setCredentialForm({})
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleMCPCredentialSave}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Save Credentials
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Custom OAuth Configuration Form */}
        {showCustomOAuthForm && customOAuthConfig && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Custom OAuth App Configuration
                  </h2>
                  <button
                    onClick={() => {
                      setShowCustomOAuthForm(false)
                      setCustomOAuthConfig(null)
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {(() => {
                  const providerConfig = providerConfigs[customOAuthConfig.toolType] || providerConfigs['generic'];
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                      <div className="flex items-start space-x-3">
                        <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-medium text-blue-800">Setup Your Private {providerConfig.displayName} OAuth App</h3>
                          <p className="text-sm text-blue-700 mt-1">
                            {providerConfig.description} You'll need to create your own {providerConfig.displayName} OAuth application first.
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const providerConfig = providerConfigs[customOAuthConfig.toolType] || providerConfigs['generic'];
                  return (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {providerConfig.fields.clientId.label} *
                        </label>
                        <input
                          type="text"
                          value={customOAuthConfig.clientId}
                          onChange={(e) => setCustomOAuthConfig({
                            ...customOAuthConfig,
                            clientId: e.target.value
                          })}
                          placeholder={providerConfig.fields.clientId.placeholder}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {providerConfig.fields.clientSecret.label} *
                        </label>
                        <input
                          type="password"
                          value={customOAuthConfig.clientSecret}
                          onChange={(e) => setCustomOAuthConfig({
                            ...customOAuthConfig,
                            clientSecret: e.target.value
                          })}
                          placeholder={providerConfig.fields.clientSecret.placeholder}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      {providerConfig.fields.additionalField && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {providerConfig.fields.additionalField.label}
                          </label>
                          <input
                            type="text"
                            value={customOAuthConfig.additionalField || ''}
                            onChange={(e) => setCustomOAuthConfig({
                              ...customOAuthConfig,
                              additionalField: e.target.value
                            })}
                            placeholder={providerConfig.fields.additionalField.placeholder}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <p className="text-sm text-gray-500 mt-1">
                            {providerConfig.fields.additionalField.description}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Callback URL (Read Only)
                    </label>
                    <input
                      type="text"
                      value={customOAuthConfig.callbackUrl}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Add this URL to your {(() => {
                        const providerConfig = providerConfigs[customOAuthConfig.toolType] || providerConfigs['generic'];
                        return providerConfig.displayName;
                      })()} OAuth app settings
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Scopes (Advanced)
                    </label>
                    <textarea
                      value={customOAuthConfig.scopes}
                      onChange={(e) => setCustomOAuthConfig({
                        ...customOAuthConfig,
                        scopes: e.target.value
                      })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Space-separated OAuth scopes for {(() => {
                        const providerConfig = providerConfigs[customOAuthConfig.toolType] || providerConfigs['generic'];
                        return providerConfig.displayName;
                      })()} access
                    </p>
                  </div>
                </div>

                {(() => {
                  const providerConfig = providerConfigs[customOAuthConfig.toolType] || providerConfigs['generic'];
                  return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
                      <div className="flex items-start space-x-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-medium text-yellow-800">Need Help Creating an OAuth App?</h3>
                          <p className="text-sm text-yellow-700 mt-1">
                            {providerConfig.helpText} Make sure to add the callback URL above.
                          </p>
                          {providerConfig.docsUrl && (
                            <a 
                              href={providerConfig.docsUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-yellow-700 underline hover:text-yellow-800 mt-2 inline-block"
                            >
                              View {providerConfig.displayName} OAuth Documentation →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex space-x-3 mt-6">
                  <button
                    onClick={() => {
                      setShowCustomOAuthForm(false)
                      setCustomOAuthConfig(null)
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!customOAuthConfig.clientId || !customOAuthConfig.clientSecret) {
                        alert('Please fill in Client ID and Client Secret')
                        return
                      }

                      try {
                        setConfiguringAuth(customOAuthConfig.toolName)
                        
                        // Save custom OAuth configuration
                        const apiUrl = await getApiUrl()
                        const response = await fetch(`${apiUrl}/tools/${customOAuthConfig.toolName}/auth/custom-oauth`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(await getApiHeaders())
                          },
                          body: JSON.stringify({
                            client_id: customOAuthConfig.clientId,
                            client_secret: customOAuthConfig.clientSecret,
                            ...(customOAuthConfig.additionalField && customOAuthConfig.toolType === 'atlassian-remote' && { cloud_id: customOAuthConfig.additionalField }),
                            scopes: customOAuthConfig.scopes,
                            callback_url: customOAuthConfig.callbackUrl
                          })
                        })

                        if (!response.ok) {
                          const error = await response.json().catch(() => ({ message: 'Failed to save OAuth configuration' }))
                          throw new Error(error.message)
                        }

                        const result = await response.json()
                        console.log('✅ Custom OAuth app configured:', result)
                        
                        // Generate OAuth authorization URL using custom configuration
                        const oauthResponse = await fetch(`${apiUrl}/tools/${customOAuthConfig.toolName}/auth/custom-oauth/authorize`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(await getApiHeaders())
                          }
                        })
                        
                        if (oauthResponse.ok) {
                          const oauthData = await oauthResponse.json()
                          console.log('[LINK] Custom OAuth URL generated:', oauthData)
                          
                          // Open OAuth popup
                          const popup = window.open(
                            oauthData.authorization_url,
                            'oauth-popup',
                            'width=600,height=700,scrollbars=yes,resizable=yes'
                          )

                          if (popup) {
                            const checkClosed = setInterval(() => {
                              if (popup.closed) {
                                clearInterval(checkClosed)
                                setConfiguringAuth(null)
                                fetchTools() // Refresh tools to show updated status
                              }
                            }, 1000)
                          }
                        }

                        setShowCustomOAuthForm(false)
                        setCustomOAuthConfig(null)
                        
                      } catch (error) {
                        console.error('Custom OAuth configuration failed:', error)
                        alert(`Failed to configure custom OAuth: ${error instanceof Error ? error.message : 'Unknown error'}`)
                        setConfiguringAuth(null)
                      }
                    }}
                    disabled={!customOAuthConfig.clientId || !customOAuthConfig.clientSecret || !!configuringAuth}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {configuringAuth === customOAuthConfig.toolName ? 'Configuring...' : 'Save & Authenticate'}
                  </button>
                </div>
              </div>
            </div>
        )}
        
    </Page>
  )
} 