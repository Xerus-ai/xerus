/**
 * Test Fixtures
 * Static test data for consistent testing across domains
 */

// Agent fixtures
const agents = {
  assistant: {
    id: 1,
    name: 'General Assistant',
    personality_type: 'assistant',
    description: 'A helpful general-purpose AI assistant',
    system_prompt: 'You are a helpful, harmless, and honest AI assistant.',
    capabilities: ['chat', 'search', 'analysis'],
    response_style: {
      tone: 'helpful',
      verbosity: 'medium',
      formality: 'casual'
    },
    is_active: true,
    ai_model: 'gpt-4o',
    model_preferences: {
      temperature: 0.7,
      max_tokens: 2000
    },
    web_search_enabled: true,
    search_all_knowledge: false,
    usage_count: 42,
    is_default: true,
    created_at: '2025-01-20T10:00:00Z',
    updated_at: '2025-01-21T15:30:00Z'
  },

  technical: {
    id: 2,
    name: 'Code Expert',
    personality_type: 'technical',
    description: 'Specialized in programming and technical documentation',
    system_prompt: 'You are a senior software engineer assistant specialized in code analysis and technical problem-solving.',
    capabilities: ['code_analysis', 'debugging', 'architecture'],
    response_style: {
      tone: 'professional',
      verbosity: 'detailed',
      formality: 'technical'
    },
    is_active: true,
    ai_model: 'claude-3-sonnet',
    model_preferences: {
      temperature: 0.3,
      max_tokens: 4000
    },
    web_search_enabled: true,
    search_all_knowledge: true,
    usage_count: 18,
    is_default: false,
    created_at: '2025-01-19T09:15:00Z',
    updated_at: '2025-01-21T14:45:00Z'
  },

  creative: {
    id: 3,
    name: 'Creative Writer',
    personality_type: 'creative',
    description: 'Focused on creative writing and brainstorming',
    system_prompt: 'You are a creative writing assistant with expertise in storytelling, poetry, and creative ideation.',
    capabilities: ['writing', 'brainstorming', 'editing'],
    response_style: {
      tone: 'inspiring',
      verbosity: 'rich',
      formality: 'creative'
    },
    is_active: false,
    ai_model: 'gpt-4o',
    model_preferences: {
      temperature: 0.9,
      max_tokens: 3000
    },
    web_search_enabled: false,
    search_all_knowledge: false,
    usage_count: 7,
    is_default: false,
    created_at: '2025-01-18T16:20:00Z',
    updated_at: '2025-01-20T11:10:00Z'
  }
};

// Knowledge document fixtures
const documents = {
  userGuide: {
    id: 'doc-1',
    title: 'Xerus User Guide',
    content: `# Xerus User Guide

## Getting Started
Welcome to Xerus, your intelligent AI assistant. This guide will help you get started with all the features.

## Features
- Natural conversation with AI agents
- Voice interaction capabilities  
- Knowledge base integration
- Tool ecosystem

## Basic Usage
1. Select an agent
2. Start a conversation
3. Use voice or text input
4. Access tools as needed`,
    metadata: {
      type: 'markdown',
      source: 'internal',
      category: 'documentation',
      author: 'Xerus Team',
      version: '1.0'
    },
    chunks: [
      'Welcome to Xerus, your intelligent AI assistant',
      'Features include natural conversation with AI agents',
      'Voice interaction capabilities available',
      'Knowledge base integration for enhanced responses'
    ],
    embeddings: [], // Would contain actual embeddings in real usage
    wordCount: 84,
    characterCount: 487,
    isIndexed: true,
    created_at: '2025-01-20T08:00:00Z',
    updated_at: '2025-01-20T08:00:00Z'
  },

  technicalDoc: {
    id: 'doc-2',
    title: 'API Documentation',
    content: `# Xerus API Documentation

## Authentication
All API requests require authentication using JWT tokens.

## Endpoints
### Agents
- GET /api/v1/agents - List all agents
- POST /api/v1/agents - Create new agent
- PUT /api/v1/agents/:id - Update agent
- DELETE /api/v1/agents/:id - Delete agent

### Knowledge
- POST /api/v1/knowledge/upload - Upload document
- GET /api/v1/knowledge/search - Search knowledge base`,
    metadata: {
      type: 'markdown',
      source: 'internal',
      category: 'technical',
      author: 'Development Team',
      version: '2.1'
    },
    chunks: [
      'All API requests require authentication using JWT tokens',
      'GET /api/v1/agents - List all agents',
      'POST /api/v1/agents - Create new agent',
      'Knowledge search endpoint available'
    ],
    embeddings: [],
    wordCount: 67,
    characterCount: 425,
    isIndexed: true,
    created_at: '2025-01-19T14:30:00Z',
    updated_at: '2025-01-21T09:15:00Z'
  }
};

// Tool fixtures
const tools = {
  webSearch: {
    id: 1,
    tool_name: 'web_search',
    display_name: 'Web Search',
    category: 'search',
    tool_type: 'api',
    description: 'Search the web for current information',
    is_enabled: true,
    provider: 'serpapi',
    parameters: {
      query: { type: 'string', required: true },
      num_results: { type: 'number', default: 5 },
      safe_search: { type: 'boolean', default: true }
    },
    configuration: {
      api_key: 'test_api_key',
      endpoint: 'https://serpapi.com/search'
    },
    usage_count: 156,
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-21T12:20:00Z'
  },

  calculator: {
    id: 2,
    tool_name: 'calculator',
    display_name: 'Calculator',
    category: 'utility',
    tool_type: 'function',
    description: 'Perform mathematical calculations',
    is_enabled: true,
    provider: 'internal',
    parameters: {
      expression: { type: 'string', required: true }
    },
    configuration: {},
    usage_count: 89,
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-20T16:45:00Z'
  },

  fileManager: {
    id: 3,
    tool_name: 'file_manager',
    display_name: 'File Manager',
    category: 'file_system',
    tool_type: 'native',
    description: 'Manage local files and directories',
    is_enabled: false,
    provider: 'electron',
    parameters: {
      action: { type: 'string', required: true, enum: ['read', 'write', 'list'] },
      path: { type: 'string', required: true }
    },
    configuration: {
      allowed_extensions: ['.txt', '.md', '.json'],
      max_file_size: 10485760 // 10MB
    },
    usage_count: 23,
    created_at: '2025-01-16T14:20:00Z',
    updated_at: '2025-01-21T08:30:00Z'
  }
};

// Conversation fixtures
const conversations = {
  basicChat: {
    id: 'conv-1',
    agentId: 1,
    title: 'General Questions',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello, can you help me understand how Xerus works?',
        timestamp: '2025-01-21T10:00:00Z'
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hello! I\'d be happy to help you understand Xerus. Xerus is an AI assistant platform that allows you to interact with different specialized AI agents, each with their own personalities and capabilities.',
        timestamp: '2025-01-21T10:00:05Z',
        metadata: {
          agentId: 1,
          tokens_used: 45,
          execution_time: 1200
        }
      },
      {
        id: 'msg-3',
        role: 'user',
        content: 'What makes it different from other AI assistants?',
        timestamp: '2025-01-21T10:01:00Z'
      }
    ],
    created_at: '2025-01-21T10:00:00Z',
    updated_at: '2025-01-21T10:01:00Z'
  },

  technicalSupport: {
    id: 'conv-2',
    agentId: 2,
    title: 'Code Review Session',
    messages: [
      {
        id: 'msg-4',
        role: 'user',
        content: 'Can you review this JavaScript function for potential issues?',
        timestamp: '2025-01-21T11:00:00Z'
      },
      {
        id: 'msg-5',
        role: 'assistant',
        content: 'I\'d be happy to review your JavaScript function. However, I don\'t see the code in your message. Could you please paste the function you\'d like me to review?',
        timestamp: '2025-01-21T11:00:03Z',
        metadata: {
          agentId: 2,
          tokens_used: 32,
          execution_time: 800
        }
      }
    ],
    created_at: '2025-01-21T11:00:00Z',
    updated_at: '2025-01-21T11:00:03Z'
  }
};

// Settings fixtures
const settings = {
  default: {
    ui: {
      theme: 'dark',
      windowSize: { width: 1200, height: 800 },
      fontSize: 14,
      language: 'en',
      notifications: true,
      soundEffects: true
    },
    audio: {
      inputDevice: 'default',
      outputDevice: 'default',
      sampleRate: 16000,
      channels: 1,
      noiseReduction: true,
      vadSensitivity: 0.5,
      autoGainControl: true
    },
    ai: {
      defaultModel: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 2000,
      streamingEnabled: true,
      contextLength: 8000
    },
    privacy: {
      dataStorage: 'local',
      shareAnalytics: false,
      enableLogging: true,
      autoSave: true
    },
    integrations: {
      webSearchEnabled: true,
      knowledgeBaseEnabled: true,
      toolsEnabled: true,
      cloudSyncEnabled: false
    }
  },

  minimal: {
    ui: {
      theme: 'light',
      windowSize: { width: 800, height: 600 },
      fontSize: 12,
      language: 'en',
      notifications: false,
      soundEffects: false
    },
    audio: {
      inputDevice: 'default',
      outputDevice: 'default',
      sampleRate: 16000,
      channels: 1,
      noiseReduction: false,
      vadSensitivity: 0.3,
      autoGainControl: false
    },
    ai: {
      defaultModel: 'gpt-4o-mini',
      temperature: 0.5,
      maxTokens: 1000,
      streamingEnabled: false,
      contextLength: 4000
    },
    privacy: {
      dataStorage: 'memory',
      shareAnalytics: false,
      enableLogging: false,
      autoSave: false
    },
    integrations: {
      webSearchEnabled: false,
      knowledgeBaseEnabled: false,
      toolsEnabled: false,
      cloudSyncEnabled: false
    }
  }
};

// Audio test data
const audio = {
  sampleConfig: {
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
    chunkSize: 1024,
    vadEnabled: true,
    vadSensitivity: 0.5
  },

  mockBuffer: Buffer.alloc(1024, 0),
  
  vadResult: {
    hasVoice: true,
    confidence: 0.8,
    timestamp: Date.now()
  }
};

module.exports = {
  agents,
  documents,
  tools,
  conversations,
  settings,
  audio,
};