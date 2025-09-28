/**
 * Jest Configuration for Glass Frontend
 * Test configuration for Electron/Node.js environment
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Root directory for tests
  rootDir: '.',
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js',
    '**/domains/**/__tests__/*.test.js',
    '**/shared/**/__tests__/*.test.js'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/setup/setup.js'
  ],
  
  // Module paths
  moduleDirectories: [
    'node_modules',
    '<rootDir>',
    '<rootDir>/..'
  ],
  
  // Module name mapping for easier imports
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@domains/(.*)$': '<rootDir>/domains/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@ui/(.*)$': '<rootDir>/ui/$1',
    '^@platform/(.*)$': '<rootDir>/platform/$1',
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@features/(.*)$': '<rootDir>/features/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@tests/(.*)$': '<rootDir>/__tests__/$1'
  },
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './domains/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Files to collect coverage from
  collectCoverageFrom: [
    'domains/**/*.js',
    'shared/**/*.js',
    'ui/**/*.js',
    'platform/**/*.js',
    '!**/__tests__/**',
    '!**/*.test.js',
    '!**/*.spec.js',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  
  // Transform files
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Files to ignore during transformation
  transformIgnorePatterns: [
    'node_modules/(?!(some-es6-module)/)'
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Test timeout
  testTimeout: 30000,
  
  // Global variables
  globals: {
    'process.env.NODE_ENV': 'test'
  },
  
  // Reporter configuration
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/test-results',
        outputName: 'junit.xml'
      }
    ]
  ]
};