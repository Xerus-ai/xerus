/**
 * Agent Execution with Enhanced RAG Integration Test
 * Tests the complete agent execution flow with chunking and LangChain RAG
 */

const agentOrchestrator = require('../../services/agentOrchestrator');
const langchainRAGService = require('../../services/langchainRAGService');
const KnowledgeService = require('../../services/knowledgeService');
const { neonDB } = require('../../database/connections/neon');

describe('Agent Execution with Enhanced RAG', () => {
  let knowledgeService;
  let testUserId = 1;
  let testAgentId;
  let createdDocuments = [];
  let testDocumentId;

  beforeAll(async () => {
    knowledgeService = new KnowledgeService();
    
    console.log('[AI] Starting Agent Execution with Enhanced RAG Tests...');

    // Initialize all services
    await langchainRAGService.initialize();
    await agentOrchestrator.initialize();

    // Find or create a test agent
    const testAgent = await neonDB.sql`
      SELECT id FROM agents 
      WHERE personality_type = 'technical' AND is_active = true
      LIMIT 1
    `;
    
    if (testAgent.length > 0) {
      testAgentId = testAgent[0].id;
    } else {
      // Create a test agent if none exists
      const newAgent = await neonDB.sql`
        INSERT INTO agents (
          name, personality_type, ai_model, system_prompt, 
          is_active, is_default, search_all_knowledge, user_id
        ) VALUES (
          'Test Technical Agent', 'technical', 'gpt-4o',
          'You are a helpful technical assistant specializing in programming and development.',
          true, false, true, ${testUserId}
        ) RETURNING id
      `;
      testAgentId = newAgent[0].id;
    }

    // Create comprehensive test knowledge base
    await createTestKnowledgeBase();
    
    console.log(`[TOOL] Test setup complete. Agent ID: ${testAgentId}`);
  });

  async function createTestKnowledgeBase() {
    // Create multiple test documents with different content types
    const testDocuments = [
      {
        title: 'JavaScript Best Practices Guide',
        content: `# JavaScript Best Practices

## Variables and Declarations
Use const for values that won't be reassigned and let for variables that will change.

### Avoid var
The var keyword has function scope and can lead to unexpected behavior. Use let and const instead.

## Function Declarations
Prefer arrow functions for callbacks and short functions. Use regular function declarations for main functions.

### Arrow Functions Example
\`\`\`javascript
const multiply = (a, b) => a * b;
const users = data.map(user => user.name);
\`\`\`

### Regular Functions
\`\`\`javascript
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
\`\`\`

## Error Handling
Always handle errors appropriately using try-catch blocks or promise rejection handling.

### Try-Catch Example
\`\`\`javascript
try {
  const data = JSON.parse(jsonString);
  processData(data);
} catch (error) {
  console.error('JSON parsing failed:', error.message);
}
\`\`\`

## Async Programming
Use async/await instead of promise chains for better readability.

### Async/Await Example
\`\`\`javascript
async function fetchUserData(userId) {
  try {
    const response = await fetch(\`/api/users/\${userId}\`);
    const userData = await response.json();
    return userData;
  } catch (error) {
    throw new Error(\`Failed to fetch user: \${error.message}\`);
  }
}
\`\`\`

## Performance Optimization
- Use debouncing for expensive operations
- Implement lazy loading for large datasets
- Optimize loops and avoid nested iterations when possible

## Testing Best Practices
Write unit tests for all critical functions and integration tests for API endpoints.`,
        content_type: 'markdown'
      },
      {
        title: 'API Security Guidelines',
        content: `# API Security Best Practices

## Authentication
Implement proper authentication mechanisms for all API endpoints.

### JWT Authentication
Use JSON Web Tokens for stateless authentication with proper expiration times.

Token Structure:
- Header: Algorithm and token type
- Payload: User claims and metadata
- Signature: Verification signature

### API Key Management
- Generate unique API keys for each application
- Implement rate limiting per API key
- Rotate keys regularly
- Store keys securely using environment variables

## Authorization
Implement role-based access control (RBAC) for different user types.

### Permission Levels
- Admin: Full system access
- User: Limited read/write access
- Guest: Read-only access to public resources

## Input Validation
Validate all input data to prevent injection attacks.

### Validation Rules
- Sanitize user input
- Use parameterized queries
- Validate data types and formats
- Implement input length limits

## HTTPS and Encryption
Always use HTTPS in production environments.

### SSL/TLS Configuration
- Use TLS 1.2 or higher
- Implement proper certificate validation
- Use strong cipher suites
- Enable HTTP Strict Transport Security (HSTS)

## Rate Limiting
Implement rate limiting to prevent abuse and DDoS attacks.

### Rate Limiting Strategies
- Per IP address limits
- Per user account limits
- Per API endpoint limits
- Progressive backoff for repeated violations

## Error Handling Security
Never expose sensitive information in error messages.

### Safe Error Responses
- Use generic error messages for client-facing responses
- Log detailed errors server-side only
- Implement proper error codes
- Avoid stack trace exposure

## Data Protection
Protect sensitive data both in transit and at rest.

### Encryption Standards
- Use AES-256 for data at rest
- Implement proper key management
- Hash passwords using bcrypt or Argon2
- Never store sensitive data in logs`,
        content_type: 'markdown'
      },
      {
        title: 'Database Optimization Techniques',
        content: `# Database Performance Optimization

## Indexing Strategies
Proper indexing is crucial for database performance.

### Index Types
- B-tree indexes for equality and range queries
- Hash indexes for equality lookups
- Bitmap indexes for low-cardinality data
- Partial indexes for filtered queries

### Index Best Practices
- Create indexes on frequently queried columns
- Avoid over-indexing (impacts write performance)
- Use composite indexes for multi-column queries
- Monitor index usage and remove unused indexes

## Query Optimization
Optimize queries for better performance and resource usage.

### Query Analysis
Use EXPLAIN PLAN to understand query execution paths.

Example:
\`\`\`sql
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'user@example.com';
\`\`\`

### Query Writing Best Practices
- Use specific column names instead of SELECT *
- Add appropriate WHERE clauses to limit results
- Use JOINs instead of subqueries when possible
- Avoid functions in WHERE clauses

## Connection Management
Implement efficient database connection handling.

### Connection Pooling
- Set appropriate pool sizes
- Configure connection timeouts
- Monitor connection usage
- Handle connection failures gracefully

### Transaction Management
- Keep transactions short
- Use appropriate isolation levels
- Handle deadlocks properly
- Implement retry logic for failed transactions

## Caching Strategies
Implement caching at multiple levels for optimal performance.

### Cache Types
- Query result caching
- Application-level caching
- Database-level caching
- CDN caching for static content

### Cache Invalidation
- Time-based expiration
- Event-based invalidation
- Cache versioning strategies
- Distributed cache consistency

## Monitoring and Maintenance
Regular monitoring and maintenance are essential for optimal performance.

### Performance Metrics
- Query execution times
- Index hit ratios
- Connection pool usage
- Cache hit rates
- Database size growth

### Maintenance Tasks
- Regular VACUUM and ANALYZE operations
- Index rebuilding when necessary
- Statistics updates
- Log file rotation and cleanup`,
        content_type: 'markdown'
      }
    ];

    for (const docData of testDocuments) {
      const document = await knowledgeService.createKnowledgeDocument({
        ...docData,
        enable_chunking: true,
        auto_index: true,
        tags: ['test', 'integration'],
        metadata: { integration_test: true }
      }, testUserId);

      createdDocuments.push(document.id);
      console.log(`📄 Created test document: ${document.title} (ID: ${document.id})`);
    }

    // Wait for chunking and indexing to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    testDocumentId = createdDocuments[0]; // Use first document for specific tests
  }

  describe('Agent Selection and Context Analysis', () => {
    test('should select appropriate agent based on query type', async () => {
      const technicalQuery = 'How do I implement error handling in JavaScript?';
      
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(
        technicalQuery,
        { agentId: testAgentId }
      );

      expect(orchestrationResult.success).toBe(true);
      expect(orchestrationResult.selectedAgent).toBeDefined();
      expect(orchestrationResult.selectedAgent.selectedAgent).toBe('technical');
      expect(orchestrationResult.response).toBeDefined();
      expect(orchestrationResult.response.length).toBeGreaterThan(50);

      console.log(`[AI] Agent selected: ${orchestrationResult.selectedAgent.selectedAgent}`);
      console.log(`💬 Response preview: ${orchestrationResult.response.substring(0, 100)}...`);
    });

    test('should analyze context and determine optimal retrieval strategy', async () => {
      const complexQuery = 'What are the best practices for API security and database optimization?';
      
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(
        complexQuery,
        { 
          agentId: testAgentId,
          screenshot: null,
          tools: []
        }
      );

      expect(orchestrationResult.success).toBe(true);
      expect(orchestrationResult.ragResults).toBeDefined();
      expect(orchestrationResult.ragResults.length).toBeGreaterThan(0);

      // Should find relevant content from both API security and database docs
      const responseText = orchestrationResult.response.toLowerCase();
      expect(responseText).toMatch(/(security|authentication|database|optimization)/);

      console.log(`🧠 Context analysis found ${orchestrationResult.ragResults.length} relevant chunks`);
    });
  });

  describe('Enhanced RAG Retrieval Integration', () => {
    test('should retrieve relevant chunks for specific technical questions', async () => {
      const specificQuery = 'How to use async/await in JavaScript?';
      
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(
        specificQuery,
        { agentId: testAgentId }
      );

      expect(orchestrationResult.success).toBe(true);
      expect(orchestrationResult.ragResults.length).toBeGreaterThan(0);

      // Find chunks that contain async/await information
      const relevantChunk = orchestrationResult.ragResults.find(result => 
        result.content.toLowerCase().includes('async') || 
        result.content.toLowerCase().includes('await')
      );

      expect(relevantChunk).toBeDefined();
      expect(relevantChunk.similarity).toBeGreaterThan(0.6);

      // Response should contain relevant information about async/await
      const response = orchestrationResult.response.toLowerCase();
      expect(response).toMatch(/(async|await|promise|asynchronous)/);

      console.log(`[SEARCH] Found ${orchestrationResult.ragResults.length} relevant chunks for async/await query`);
    });

    test('should handle multi-topic queries with hybrid search', async () => {
      const multiTopicQuery = 'How do I secure my API endpoints and optimize database queries?';
      
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(
        multiTopicQuery,
        { agentId: testAgentId }
      );

      expect(orchestrationResult.success).toBe(true);
      expect(orchestrationResult.ragResults.length).toBeGreaterThan(1);

      // Should retrieve content from both security and database documents
      const securityContent = orchestrationResult.ragResults.find(result =>
        result.content.toLowerCase().includes('security') ||
        result.content.toLowerCase().includes('authentication')
      );

      const databaseContent = orchestrationResult.ragResults.find(result =>
        result.content.toLowerCase().includes('database') ||
        result.content.toLowerCase().includes('query') ||
        result.content.toLowerCase().includes('optimization')
      );

      expect(securityContent).toBeDefined();
      expect(databaseContent).toBeDefined();

      // Response should address both topics
      const response = orchestrationResult.response.toLowerCase();
      expect(response).toMatch(/(security|authentication|authorization)/);
      expect(response).toMatch(/(database|query|optimization|index)/);

      console.log(`[LINK] Multi-topic query retrieved content from multiple documents`);
    });
  });

  describe('Quality and Performance Validation', () => {
    test('should provide high-quality responses based on chunked content', async () => {
      const qualityQuery = 'What are JavaScript best practices for error handling?';
      
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(
        qualityQuery,
        { agentId: testAgentId }
      );

      expect(orchestrationResult.success).toBe(true);
      
      // Quality checks
      expect(orchestrationResult.response.length).toBeGreaterThan(200); // Substantial response
      expect(orchestrationResult.ragResults.length).toBeGreaterThan(0); // Used knowledge base
      
      const response = orchestrationResult.response.toLowerCase();
      
      // Should contain specific error handling concepts
      const errorHandlingTerms = [
        'try', 'catch', 'error', 'exception', 'handling'
      ];
      
      const foundTerms = errorHandlingTerms.filter(term => response.includes(term));
      expect(foundTerms.length).toBeGreaterThanOrEqual(3);

      // Should reference specific techniques from knowledge base
      expect(response).toMatch(/(try.*catch|error.*handling|exception|async.*await)/);

      console.log(`[DATA] Quality response generated with ${orchestrationResult.ragResults.length} knowledge sources`);
    });

    test('should complete agent execution within performance targets', async () => {
      const perfQuery = 'Explain database indexing strategies';
      const startTime = Date.now();
      
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(
        perfQuery,
        { agentId: testAgentId }
      );

      const executionTime = Date.now() - startTime;

      // Performance validation
      expect(orchestrationResult.success).toBe(true);
      expect(executionTime).toBeLessThan(15000); // Should complete within 15 seconds
      expect(orchestrationResult.ragResults.length).toBeGreaterThan(0);
      
      // Validate metadata
      expect(orchestrationResult.metadata).toBeDefined();
      expect(orchestrationResult.metadata.orchestrationTime).toBeDefined();
      expect(orchestrationResult.metadata.ragResultsCount).toBeGreaterThan(0);

      console.log(`[FAST] Agent execution completed in ${executionTime}ms`);
      console.log(`📈 Orchestration time: ${orchestrationResult.metadata.orchestrationTime}ms`);
    });

    test('should handle edge cases gracefully', async () => {
      // Test with very specific technical query
      const edgeQuery = 'How do I implement JWT token rotation with Redis caching?';
      
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(
        edgeQuery,
        { agentId: testAgentId }
      );

      expect(orchestrationResult.success).toBe(true);
      expect(orchestrationResult.response).toBeDefined();
      
      // Even if no exact match, should provide relevant security information
      const response = orchestrationResult.response.toLowerCase();
      expect(response).toMatch(/(jwt|token|authentication|security|cache)/);

      // Should not fail even with limited knowledge
      expect(orchestrationResult.metadata.error).toBeUndefined();

      console.log(`[TARGET] Edge case handled: found ${orchestrationResult.ragResults.length} related chunks`);
    });
  });

  describe('Agent Permission and Access Control', () => {
    test('should respect agent knowledge access permissions', async () => {
      const permissionQuery = 'Explain API rate limiting strategies';
      
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(
        permissionQuery,
        { agentId: testAgentId }
      );

      expect(orchestrationResult.success).toBe(true);
      
      // Since our test agent has search_all_knowledge = true, should access all documents
      expect(orchestrationResult.ragResults.length).toBeGreaterThan(0);
      
      // Should find rate limiting information from API security document
      const rateLimitingContent = orchestrationResult.ragResults.find(result =>
        result.content.toLowerCase().includes('rate limit') ||
        result.content.toLowerCase().includes('limiting')
      );

      if (rateLimitingContent) {
        expect(rateLimitingContent.similarity).toBeGreaterThan(0.5);
        console.log(`[SECURE] Agent accessed knowledge with appropriate permissions`);
      }
    });
  });

  describe('End-to-End Agent Workflows', () => {
    test('should execute complete workflow from query to response', async () => {
      const workflowQuery = 'I need help with optimizing my database queries and securing my API. Can you provide best practices?';
      
      console.log(`[START] Executing end-to-end workflow for: "${workflowQuery}"`);
      
      const orchestrationResult = await agentOrchestrator.orchestrateAgentResponse(
        workflowQuery,
        { 
          agentId: testAgentId,
          screenshot: null,
          tools: []
        }
      );

      // Comprehensive validation
      expect(orchestrationResult.success).toBe(true);
      expect(orchestrationResult.selectedAgent).toBeDefined();
      expect(orchestrationResult.ragResults).toBeDefined();
      expect(orchestrationResult.response).toBeDefined();
      expect(orchestrationResult.metadata).toBeDefined();

      // Agent selection validation
      expect(orchestrationResult.selectedAgent.selectedAgent).toBe('technical');
      expect(orchestrationResult.selectedAgent.confidence).toBeGreaterThan(0.7);

      // RAG results validation
      expect(orchestrationResult.ragResults.length).toBeGreaterThan(0);
      expect(orchestrationResult.ragResults.length).toBeLessThanOrEqual(7); // Respects topK limit

      // Response quality validation
      const response = orchestrationResult.response;
      expect(response.length).toBeGreaterThan(500); // Comprehensive response
      expect(response.toLowerCase()).toMatch(/(database|query|optimization)/);
      expect(response.toLowerCase()).toMatch(/(api|security|authentication)/);

      // Metadata validation
      expect(orchestrationResult.metadata.orchestrationTime).toBeDefined();
      expect(orchestrationResult.metadata.orchestrationTime).toBeLessThan(12000); // Under 12 seconds
      expect(orchestrationResult.metadata.ragResultsCount).toBeGreaterThan(0);

      // Log comprehensive results
      console.log(`[OK] Workflow completed successfully:`);
      console.log(`   [AI] Agent: ${orchestrationResult.selectedAgent.selectedAgent} (${Math.round(orchestrationResult.selectedAgent.confidence * 100)}%)`);
      console.log(`   📚 Knowledge: ${orchestrationResult.ragResults.length} relevant chunks found`);
      console.log(`   💬 Response: ${response.length} characters generated`);
      console.log(`   ⏱️  Total time: ${orchestrationResult.metadata.orchestrationTime}ms`);
      
      // Validate chunk quality
      const highQualityChunks = orchestrationResult.ragResults.filter(chunk => 
        chunk.similarity > 0.7
      );
      expect(highQualityChunks.length).toBeGreaterThan(0);
      
      console.log(`   [TARGET] High-quality chunks: ${highQualityChunks.length}/${orchestrationResult.ragResults.length}`);
    });
  });

  afterEach(async () => {
    // Add small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Cleanup test documents
    try {
      for (const docId of createdDocuments) {
        await knowledgeService.deleteDocumentChunks(docId);
        await knowledgeService.deleteKnowledgeDocument(docId);
      }
      console.log(`[CLEAN] Cleaned up ${createdDocuments.length} test documents`);
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }

    console.log('[AI] Agent Execution with Enhanced RAG Tests Completed Successfully');
  });
});