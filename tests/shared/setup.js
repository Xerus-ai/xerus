/**
 * Jest Test Setup Configuration
 * Global test environment setup for Glass Frontend (Electron)
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.ELECTRON_IS_DEV = 'true';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock Electron APIs
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/app/path'),
    getName: jest.fn(() => 'Xerus'),
    getVersion: jest.fn(() => '1.0.0'),
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
  },
  clipboard: {
    writeText: jest.fn(),
    readText: jest.fn(() => ''),
  },
}));

// Mock Node.js built-ins for Electron context
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
  },
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => '{}'),
  writeFileSync: jest.fn(),
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/')),
  dirname: jest.fn(() => '/mock/dir'),
  basename: jest.fn(() => 'mock-file'),
}));

// Mock external audio dependencies
jest.mock('speaker', () => jest.fn());
jest.mock('@parcel/watcher', () => ({
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
}));

// Mock Winston logger for frontend
jest.mock('../../common/services/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock better-sqlite3 for frontend usage
jest.mock('better-sqlite3', () => {
  return jest.fn(() => ({
    close: jest.fn(),
    prepare: jest.fn(() => ({
      run: jest.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
      get: jest.fn(() => ({})),
      all: jest.fn(() => [])
    })),
    pragma: jest.fn(),
    exec: jest.fn()
  }));
});

// Global test timeout
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global test utilities for frontend
global.testUtils = {
  // Agent utilities
  createMockAgent: () => ({
    id: 1,
    name: 'Test Agent',
    personality_type: 'assistant',
    description: 'Test agent for unit testing',
    system_prompt: 'You are a helpful test assistant.',
    capabilities: ['chat', 'search'],
    response_style: { tone: 'helpful', verbosity: 'medium' },
    is_active: true,
    ai_model: 'gpt-4o',
    model_preferences: {},
    web_search_enabled: false,
    search_all_knowledge: false,
    usage_count: 0,
    is_default: false,
    created_at: '2025-01-21T10:00:00Z',
    updated_at: '2025-01-21T10:00:00Z',
  }),

  // RAG/Knowledge utilities
  createMockDocument: () => ({
    id: 'doc-1',
    title: 'Test Document',
    content: 'This is test content for the knowledge base.',
    metadata: { type: 'text', source: 'test' },
    chunks: ['chunk1', 'chunk2'],
    embeddings: [],
    created_at: new Date().toISOString(),
  }),

  createMockRAGResult: () => ({
    success: true,
    query: 'test question',
    retrievedChunks: [
      {
        content: 'relevant test content',
        similarity: 0.85,
        metadata: { source: 'test-doc' }
      }
    ],
    enhancedQuery: 'enhanced test question',
    totalRetrieved: 1,
    processingTime: 150
  }),

  // Tool utilities
  createMockTool: () => ({
    id: 1,
    tool_name: 'test_tool',
    category: 'utility',
    tool_type: 'function',
    is_enabled: true,
    provider: 'internal',
    parameters: {},
    created_at: '2025-01-21T10:00:00Z',
    updated_at: '2025-01-21T10:00:00Z',
  }),

  // Audio utilities
  createMockAudioConfig: () => ({
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
    chunkSize: 1024,
    vadEnabled: true,
  }),

  // Conversation utilities
  createMockConversation: () => ({
    id: 'conv-1',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ],
    agentId: 1,
    created_at: new Date().toISOString(),
  }),

  // Settings utilities
  createMockSettings: () => ({
    ui: {
      theme: 'dark',
      windowSize: { width: 1200, height: 800 },
    },
    audio: {
      inputDevice: 'default',
      outputDevice: 'default',
      noiseReduction: true,
    },
    ai: {
      defaultModel: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 2000,
    },
  }),

  // Mock IPC utilities
  mockIPC: {
    invoke: jest.fn(),
    send: jest.fn(),
    on: jest.fn(),
  },

  // Error utilities
  createValidationError: (field) => ({
    error: 'Validation failed',
    details: `${field} is required`,
  }),

  createNetworkError: () => ({
    error: 'Network error',
    details: 'Failed to connect to backend service',
  }),
};