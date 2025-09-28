/**
 * Test Helper Utilities
 * Shared testing utilities for Glass Frontend domains
 */

/**
 * Wait for a specified amount of time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise}
 */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create a mock EventEmitter for testing
 */
class MockEventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(...args));
    }
  }

  removeAllListeners(event) {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }
}

/**
 * Create a mock database connection
 */
const createMockDB = () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(() => ({ status: 'healthy' })),
  initialize: jest.fn(),
  close: jest.fn(),
});

/**
 * Create mock AI provider response
 */
const createMockAIResponse = (content = 'Test AI response') => ({
  choices: [{
    message: {
      content,
      role: 'assistant'
    }
  }],
  usage: {
    prompt_tokens: 50,
    completion_tokens: 20,
    total_tokens: 70
  }
});

/**
 * Create mock audio buffer for testing
 */
const createMockAudioBuffer = (size = 1024) => {
  return Buffer.alloc(size, 0);
};

/**
 * Test domain service factory
 */
const createMockService = (methods = {}) => {
  const defaultMethods = {
    initialize: jest.fn(),
    shutdown: jest.fn(),
    getStatus: jest.fn(() => ({ initialized: true })),
  };

  return {
    ...defaultMethods,
    ...methods,
  };
};

/**
 * Create mock personality for agent testing
 */
const createMockPersonality = () => ({
  id: 'test-personality',
  name: 'Test Personality',
  traits: {
    helpfulness: 0.8,
    creativity: 0.6,
    formality: 0.5,
  },
  systemPrompt: 'You are a helpful test assistant.',
  responsePatterns: [],
});

/**
 * Create mock knowledge chunk for RAG testing
 */
const createMockKnowledgeChunk = () => ({
  id: 'chunk-1',
  content: 'This is a test knowledge chunk with relevant information.',
  embedding: new Array(1536).fill(0.1), // Mock embedding vector
  metadata: {
    documentId: 'doc-1',
    title: 'Test Document',
    source: 'test',
    chunkIndex: 0,
  },
  similarity: 0.85,
});

/**
 * Create mock tool execution result
 */
const createMockToolResult = (success = true) => ({
  success,
  result: success ? 'Tool executed successfully' : null,
  error: success ? null : 'Tool execution failed',
  executionTime: 150,
  toolName: 'test_tool',
});

/**
 * Assert that a function is called with specific arguments
 */
const expectToBeCalledWith = (mockFn, ...expectedArgs) => {
  expect(mockFn).toHaveBeenCalledWith(...expectedArgs);
};

/**
 * Assert that an async function resolves successfully
 */
const expectToResolve = async (promise) => {
  await expect(promise).resolves.not.toThrow();
};

/**
 * Assert that an async function rejects with specific error
 */
const expectToRejectWith = async (promise, errorMessage) => {
  await expect(promise).rejects.toThrow(errorMessage);
};

/**
 * Create a test suite wrapper with common setup/teardown
 */
const createTestSuite = (name, tests) => {
  describe(name, () => {
    let mockService;
    let mockDB;

    beforeEach(() => {
      mockService = createMockService();
      mockDB = createMockDB();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    tests({ mockService, mockDB });
  });
};

/**
 * Test data generators
 */
const testData = {
  agent: () => global.testUtils.createMockAgent(),
  document: () => global.testUtils.createMockDocument(),
  tool: () => global.testUtils.createMockTool(),
  conversation: () => global.testUtils.createMockConversation(),
  settings: () => global.testUtils.createMockSettings(),
};

module.exports = {
  wait,
  MockEventEmitter,
  createMockDB,
  createMockAIResponse,
  createMockAudioBuffer,
  createMockService,
  createMockPersonality,
  createMockKnowledgeChunk,
  createMockToolResult,
  expectToBeCalledWith,
  expectToResolve,
  expectToRejectWith,
  createTestSuite,
  testData,
};