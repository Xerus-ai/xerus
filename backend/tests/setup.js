/**
 * Jest Test Setup Configuration
 * Global test environment setup for Xerus Backend Service
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '5002'; // Different port for testing
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_xerus';
process.env.JWT_SECRET = 'test_jwt_secret_key';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock external dependencies
jest.mock('@neondatabase/serverless', () => ({
  neon: jest.fn(() => jest.fn()),
}));

// Mock better-sqlite3 to prevent platform-specific issues
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

// Mock winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  format: {
    combine: jest.fn(() => jest.fn()),
    timestamp: jest.fn(() => jest.fn()),
    printf: jest.fn(() => jest.fn()),
    json: jest.fn(() => jest.fn()),
    colorize: jest.fn(() => jest.fn()),
    simple: jest.fn(() => jest.fn()),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

// Global test timeout
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
global.testUtils = {
  createMockAgent: () => ({
    id: 1,
    name: 'Test Agent',
    personality_type: 'assistant',
    description: 'Test agent for unit testing',
    system_prompt: 'You are a helpful test assistant.',
    is_active: true,
    ai_model: 'gpt-4o',
    created_at: '2025-01-21T10:00:00Z',
    updated_at: '2025-01-21T10:00:00Z',
  }),

  createMockKnowledgeDocument: () => ({
    id: 1,
    title: 'Test Document',
    content: 'This is test content for the knowledge base.',
    content_type: 'text',
    is_indexed: true,
    word_count: 10,
    character_count: 50,
    created_at: '2025-01-21T10:00:00Z',
    updated_at: '2025-01-21T10:00:00Z',
  }),

  createMockTool: () => ({
    id: 1,
    tool_name: 'test_tool',
    category: 'utility',
    tool_type: 'function',
    is_enabled: true,
    provider: 'internal',
    created_at: '2025-01-21T10:00:00Z',
    updated_at: '2025-01-21T10:00:00Z',
  }),

  createAuthToken: () => 'Bearer test_jwt_token',
  
  createValidationError: (field) => ({
    error: 'Validation failed',
    details: `${field} is required`,
  }),
};