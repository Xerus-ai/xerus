/**
 * Complete RAG System Test Suite
 * Tests the entire chunking + LangChain RAG pipeline end-to-end
 * Verifies MultiQueryRetriever, chunking, and agent-based retrieval
 */

require('dotenv').config();
const KnowledgeServiceClass = require('../services/knowledgeService');
const LangChainRAGService = require('../services/langchainRAGService');
const ChunkingEngine = require('../services/chunkingService');
const { neonDB } = require('../database/connections/neon');

// Create service instances
const KnowledgeService = new KnowledgeServiceClass();

// Test configuration
const TEST_AGENT_ID = 1;
const TEST_USER_ID = 'test-user-123';

// Sample documents for testing
const TEST_DOCUMENTS = {
  react: {
    title: 'React Hooks Complete Guide',
    content: `
# React Hooks Complete Guide

## Introduction to Hooks
React Hooks are functions that let you use state and other React features in functional components. They were introduced in React 16.8 and have revolutionized how we write React components.

## useState Hook
The useState hook allows you to add state to functional components. It returns an array with two elements: the current state value and a function to update it.

### Basic Usage
\`\`\`javascript
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  );
}
\`\`\`

### Multiple State Variables
You can use useState multiple times in a single component:

\`\`\`javascript
function UserProfile() {
  const [name, setName] = useState('');
  const [age, setAge] = useState(0);
  const [email, setEmail] = useState('');
  
  // Component logic here
}
\`\`\`

## useEffect Hook
The useEffect hook lets you perform side effects in functional components. It serves the same purpose as componentDidMount, componentDidUpdate, and componentWillUnmount combined.

### Basic Example
\`\`\`javascript
useEffect(() => {
  // This runs after every render
  document.title = \`You clicked \${count} times\`;
});
\`\`\`

### Cleanup Function
Return a cleanup function to prevent memory leaks:

\`\`\`javascript
useEffect(() => {
  const timer = setTimeout(() => {
    console.log('Timer expired');
  }, 1000);
  
  return () => clearTimeout(timer);
}, []);
\`\`\`

## useContext Hook
The useContext hook allows you to consume context values without nesting Consumer components.

### Example
\`\`\`javascript
const ThemeContext = React.createContext('light');

function ThemedButton() {
  const theme = useContext(ThemeContext);
  return <button className={theme}>Themed Button</button>;
}
\`\`\`

## Custom Hooks
You can create your own hooks to share stateful logic between components.

### Example: useLocalStorage
\`\`\`javascript
function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });
  
  const setValue = (value) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(error);
    }
  };
  
  return [storedValue, setValue];
}
\`\`\`

## Best Practices
1. Only call hooks at the top level of your function
2. Only call hooks from React functions
3. Use the ESLint plugin for hooks
4. Keep effects focused and small
5. Use custom hooks to share logic
`,
    content_type: 'markdown',
    tags: ['react', 'hooks', 'tutorial', 'javascript']
  },
  nodejs: {
    title: 'Node.js Express API Development',
    content: `
# Building REST APIs with Node.js and Express

## Setting Up Express Server
Express is a minimal and flexible Node.js web application framework.

### Installation
\`\`\`bash
npm install express
npm install -D nodemon
\`\`\`

### Basic Server Setup
\`\`\`javascript
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API' });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
\`\`\`

## Creating RESTful Routes
Follow REST conventions for your API endpoints.

### CRUD Operations
\`\`\`javascript
// GET all items
app.get('/api/items', async (req, res) => {
  try {
    const items = await Item.findAll();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single item
app.get('/api/items/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST new item
app.post('/api/items', async (req, res) => {
  try {
    const newItem = await Item.create(req.body);
    res.status(201).json(newItem);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update item
app.put('/api/items/:id', async (req, res) => {
  try {
    const updated = await Item.update(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE item
app.delete('/api/items/:id', async (req, res) => {
  try {
    await Item.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
\`\`\`

## Middleware
Middleware functions execute during the request-response cycle.

### Authentication Middleware
\`\`\`javascript
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Protected route
app.get('/api/protected', authenticate, (req, res) => {
  res.json({ message: 'Access granted', user: req.user });
});
\`\`\`

## Error Handling
Implement proper error handling for production apps.

### Global Error Handler
\`\`\`javascript
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(status).json({
    error: {
      message,
      status,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});
\`\`\`
`,
    content_type: 'markdown',
    tags: ['nodejs', 'express', 'api', 'backend']
  }
};

// Test utilities
async function clearTestData() {
  console.log('[CLEAN] Clearing test data...');
  
  try {
    // Delete test documents and chunks
    await neonDB.query(`
      DELETE FROM document_chunks 
      WHERE knowledge_base_id IN (
        SELECT id FROM knowledge_base 
        WHERE title LIKE 'TEST:%'
      )
    `);
    
    await neonDB.query(`
      DELETE FROM knowledge_base 
      WHERE title LIKE 'TEST:%'
    `);
    
    console.log('[OK] Test data cleared');
  } catch (error) {
    console.error('[ERROR] Failed to clear test data:', error.message);
  }
}

async function createTestDocument(docKey, enableChunking = true) {
  const doc = TEST_DOCUMENTS[docKey];
  const testDoc = {
    ...doc,
    title: `TEST: ${doc.title}`,
    enable_chunking: enableChunking,
    auto_index: true // Enable embedding generation for better testing
  };
  
  console.log(`📝 Creating test document: ${testDoc.title} (chunking: ${enableChunking})`);
  
  const document = await KnowledgeService.createKnowledgeDocument(
    testDoc,
    TEST_USER_ID
  );
  
  return document;
}

// Test cases
async function testChunkingEngine() {
  console.log('\n========================================');
  console.log('[TEST] TEST 1: Chunking Engine Direct Test');
  console.log('========================================\n');
  
  try {
    // Initialize chunking engine
    await ChunkingEngine.initialize();
    
    // Test with React document
    const reactDoc = {
      title: TEST_DOCUMENTS.react.title,
      content: TEST_DOCUMENTS.react.content,
      content_type: 'markdown',
      word_count: TEST_DOCUMENTS.react.content.split(/\s+/).length
    };
    
    const chunks = await ChunkingEngine.chunkDocument(reactDoc);
    
    console.log('[OK] Chunking engine test results:');
    console.log(`  - Created ${chunks.length} chunks`);
    console.log(`  - Average chunk size: ${Math.round(chunks.reduce((sum, c) => sum + c.chunk_size, 0) / chunks.length)} chars`);
    console.log(`  - First chunk preview: "${chunks[0].chunk_text.substring(0, 100)}..."`);
    
    // Verify chunk metadata
    const hasMetadata = chunks.every(c => c.metadata && c.metadata.content_type);
    console.log(`  - Metadata preserved: ${hasMetadata ? '[OK]' : '[ERROR]'}`);
    
    // Get stats
    const stats = ChunkingEngine.getStats();
    console.log('[DATA] Chunking engine stats:', stats);
    
    return chunks.length > 0;
    
  } catch (error) {
    console.error('[ERROR] Chunking engine test failed:', error.message);
    return false;
  }
}

async function testKnowledgeServiceChunking() {
  console.log('\n========================================');
  console.log('[TEST] TEST 2: Knowledge Service with Chunking');
  console.log('========================================\n');
  
  try {
    // Create document with chunking enabled
    const document = await createTestDocument('react', true);
    
    if (!document || !document.id) {
      throw new Error(`Document creation failed: no document returned`);
    }
    
    console.log('[OK] Document created with ID:', document.id);
    
    // Verify chunks were created
    const chunks = await KnowledgeService.getDocumentChunks(document.id);
    
    console.log(`[PACKAGE] Found ${chunks.length} chunks in database`);
    
    if (chunks.length > 0) {
      console.log('  Sample chunks:');
      chunks.slice(0, 3).forEach(chunk => {
        console.log(`    - Chunk ${chunk.chunk_index}: ${chunk.chunk_tokens} tokens, "${chunk.chunk_text.substring(0, 50)}..."`);
      });
    }
    
    // Test chunk search
    const searchResults = await KnowledgeService.searchChunks('useState hook React', {
      limit: 3,
      similarity_threshold: 0.5
    });
    
    console.log(`\n[SEARCH] Chunk search results for "useState hook React":`);
    searchResults.forEach((result, idx) => {
      console.log(`  ${idx + 1}. Score: ${result.similarity_score.toFixed(3)} | Chunk ${result.chunk_index} | "${result.chunk_text.substring(0, 60)}..."`);
    });
    
    return chunks.length > 0 && searchResults.length > 0;
    
  } catch (error) {
    console.error('[ERROR] Knowledge service chunking test failed:', error.message);
    return false;
  }
}

async function testLangChainRAGWithChunks() {
  console.log('\n========================================');
  console.log('[TEST] TEST 3: LangChain RAG with Chunked Documents');
  console.log('========================================\n');
  
  try {
    // Initialize LangChain RAG service
    await LangChainRAGService.initialize();
    
    // Create both test documents
    const reactDoc = await createTestDocument('react', true);
    const nodeDoc = await createTestDocument('nodejs', true);
    
    console.log('📚 Created test documents:', {
      react: reactDoc.id,
      nodejs: nodeDoc.id
    });
    
    // Test different query types
    const queries = [
      {
        query: 'How do I use useState hook in React?',
        expectedTopic: 'react'
      },
      {
        query: 'What is the cleanup function in useEffect?',
        expectedTopic: 'react'
      },
      {
        query: 'How to create REST API endpoints with Express?',
        expectedTopic: 'nodejs'
      },
      {
        query: 'Explain authentication middleware in Node.js',
        expectedTopic: 'nodejs'
      }
    ];
    
    console.log('\n[SEARCH] Testing LangChain RAG retrieval with chunks:\n');
    
    for (const testCase of queries) {
      console.log(`\n📝 Query: "${testCase.query}"`);
      
      const result = await LangChainRAGService.enhancedRAGSearch(testCase.query, {
        topK: 3,
        useMultiQuery: true,
        useReranking: true,
        minScore: 0.5
      });
      
      if (!result.success) {
        console.error(`  [ERROR] Search failed: ${result.error}`);
        continue;
      }
      
      console.log(`  [OK] Classification: ${result.queryClassification.category} (${Math.round(result.queryClassification.confidence * 100)}%)`);
      console.log(`  [DATA] Found ${result.totalResults} results (${result.metadata.retrievalTime}ms)`);
      
      if (result.results.length > 0) {
        console.log('  Top results:');
        result.results.slice(0, 2).forEach((doc, idx) => {
          const isCorrectTopic = doc.title.toLowerCase().includes(testCase.expectedTopic);
          console.log(`    ${idx + 1}. ${isCorrectTopic ? '[OK]' : '[WARNING]'} ${doc.title}`);
          console.log(`       Score: ${doc.similarity.toFixed(3)} | Method: ${doc.metadata.retrieval_method}`);
          console.log(`       Content: "${doc.content.substring(0, 100)}..."`);
        });
      }
    }
    
    // Test MultiQueryRetriever specifically
    console.log('\n\n[SEARCH] Testing MultiQueryRetriever generation:');
    const multiQueryTest = 'How to handle errors in Express API?';
    console.log(`Query: "${multiQueryTest}"`);
    
    const multiQueryResult = await LangChainRAGService.enhancedRAGSearch(multiQueryTest, {
      topK: 5,
      useMultiQuery: true,
      useCompression: false,
      useReranking: false
    });
    
    console.log(`[OK] MultiQueryRetriever results: ${multiQueryResult.totalResults} documents found`);
    console.log(`  Retrieval strategy: ${multiQueryResult.retrievalStrategy}`);
    
    // Get service stats
    const stats = LangChainRAGService.getStats();
    console.log('\n[DATA] LangChain RAG Service Stats:', {
      queriesProcessed: stats.queriesProcessed,
      avgRetrievalTimeMs: stats.avgRetrievalTimeMs,
      initialized: stats.initialized
    });
    
    return multiQueryResult.success;
    
  } catch (error) {
    console.error('[ERROR] LangChain RAG test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function testAgentBasedRetrieval() {
  console.log('\n========================================');
  console.log('[TEST] TEST 4: Agent-Based Knowledge Retrieval');
  console.log('========================================\n');
  
  try {
    // Get agent's assigned documents
    const agentDocs = await LangChainRAGService.getAgentDocumentIds(TEST_AGENT_ID);
    console.log(`[AI] Agent ${TEST_AGENT_ID} has access to ${agentDocs.length} documents`);
    
    // Test agent-specific retrieval
    const agentQuery = 'Tell me about React hooks and Express APIs';
    console.log(`\n📝 Testing agent query: "${agentQuery}"`);
    
    const result = await LangChainRAGService.enhancedRAGSearch(agentQuery, {
      agentId: TEST_AGENT_ID,
      documentIds: agentDocs,
      topK: 5,
      useMultiQuery: true
    });
    
    if (result.success) {
      console.log(`[OK] Agent retrieval successful:`);
      console.log(`  - Total results: ${result.totalResults}`);
      console.log(`  - Classification: ${result.queryClassification.category}`);
      console.log(`  - Retrieval time: ${result.metadata.retrievalTime}ms`);
      
      // Verify results are from both documents
      const sources = new Set(result.results.map(r => r.title.split('(')[0].trim()));
      console.log(`  - Sources covered: ${Array.from(sources).join(', ')}`);
    }
    
    return result.success;
    
  } catch (error) {
    console.error('[ERROR] Agent-based retrieval test failed:', error.message);
    return false;
  }
}

async function testHealthChecks() {
  console.log('\n========================================');
  console.log('[TEST] TEST 5: Service Health Checks');
  console.log('========================================\n');
  
  try {
    // Test ChunkingEngine health
    const chunkingHealth = await ChunkingEngine.healthCheck();
    console.log('[PACKAGE] ChunkingEngine Health:', chunkingHealth.status);
    
    // Test LangChainRAG health
    const ragHealth = await LangChainRAGService.healthCheck();
    console.log('[SEARCH] LangChainRAG Health:', ragHealth.status);
    
    // Test database health
    const dbHealth = await neonDB.healthCheck();
    console.log('💾 Database Health:', dbHealth.status);
    
    const allHealthy = 
      chunkingHealth.status === 'healthy' &&
      ragHealth.status === 'healthy' &&
      dbHealth.status === 'healthy';
    
    console.log(`\n${allHealthy ? '[OK]' : '[ERROR]'} Overall system health: ${allHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    
    return allHealthy;
    
  } catch (error) {
    console.error('[ERROR] Health check failed:', error.message);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('[START] Starting Complete RAG System Test Suite');
  console.log('==========================================\n');
  
  const results = {
    chunkingEngine: false,
    knowledgeChunking: false,
    langchainRAG: false,
    agentRetrieval: false,
    healthChecks: false
  };
  
  try {
    // Initialize database connection
    if (!neonDB.isConnected) {
      await neonDB.initialize();
    }
    
    // Clear any existing test data
    await clearTestData();
    
    // Run all tests
    results.chunkingEngine = await testChunkingEngine();
    results.knowledgeChunking = await testKnowledgeServiceChunking();
    results.langchainRAG = await testLangChainRAGWithChunks();
    results.agentRetrieval = await testAgentBasedRetrieval();
    results.healthChecks = await testHealthChecks();
    
    // Summary
    console.log('\n==========================================');
    console.log('[DATA] TEST SUITE SUMMARY');
    console.log('==========================================\n');
    
    Object.entries(results).forEach(([test, passed]) => {
      console.log(`${passed ? '[OK]' : '[ERROR]'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
    });
    
    const totalPassed = Object.values(results).filter(r => r).length;
    const totalTests = Object.keys(results).length;
    const allPassed = totalPassed === totalTests;
    
    console.log(`\n[TARGET] Final Result: ${totalPassed}/${totalTests} tests passed`);
    console.log(allPassed ? '[OK] ALL TESTS PASSED!' : '[ERROR] SOME TESTS FAILED');
    
    // Clean up test data
    await clearTestData();
    
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n[ERROR] Test suite failed with error:', error.message);
    console.error('Stack:', error.stack);
    
    // Try to clean up
    try {
      await clearTestData();
    } catch (cleanupError) {
      console.error('Failed to clean up:', cleanupError.message);
    }
    
    process.exit(1);
  }
}

// Run tests
runAllTests();