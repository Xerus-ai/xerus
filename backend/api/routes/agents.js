/**
 * Agent API Routes - RESTful Endpoints
 * Backend Dev Agent 💻 - Extracted from xerus_web/backend_node/routes/agents.js
 * Standalone Backend Service
 */

const express = require('express');
const router = express.Router();

// Import services and middleware
const AgentService = require('../../services/agentService');
const { aiProviderService } = require('../../services/aiProviderService');
// Removed predictive context builder - using simplified approach
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { requirePermission, requireGuestPermission } = require('../middleware/auth');

// Initialize service
const agentService = new AgentService();

/**
 * GET /api/v1/agents
 * List agents with filtering and pagination
 * All users have unified permissions - no restrictions
 */
router.get('/', requireGuestPermission('agents:read'), asyncHandler(async (req, res) => {
  const {
    personality_type,
    is_active,
    ai_model,
    limit = 50,
    offset = 0,
    page,
    per_page,
    agent_type,
    include_system_agents = 'true'
  } = req.query;

  // Handle pagination parameters
  const actualLimit = per_page ? parseInt(per_page) : parseInt(limit);
  const actualOffset = page ? (parseInt(page) - 1) * actualLimit : parseInt(offset);

  // Validate limits
  if (actualLimit > 100) {
    throw new ValidationError('Limit cannot exceed 100 items');
  }

  // Extract user ID from request context
  const user_id = req.user?.uid || req.user?.id || null;

  const filters = {
    personality_type,
    is_active: is_active !== undefined ? is_active === 'true' : undefined,
    ai_model,
    agent_type,
    user_id,
    include_system_agents: include_system_agents === 'true',
    limit: actualLimit,
    offset: actualOffset
  };

  let agents = await agentService.getAgents(filters);

  // All users (guest and authenticated) now have unified permissions - no filtering needed

  // Set pagination headers
  res.set({
    'X-Total-Count': agents.length.toString(),
    'X-Page': page || Math.floor(actualOffset / actualLimit) + 1,
    'X-Per-Page': actualLimit.toString()
  });

  res.json(agents);
}));

/**
 * GET /api/v1/agents/:id
 * Get specific agent by ID
 * All users have unified permissions - no restrictions
 */
router.get('/:id', requireGuestPermission('agents:read'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user_id = req.user?.uid || req.user?.id || null;
  
  let agent = await agentService.getAgentById(id, user_id);
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }

  // All users (guest and authenticated) now have unified permissions - no filtering needed

  res.json(agent);
}));

/**
 * POST /api/v1/agents
 * Create new agent
 */
router.post('/', requirePermission('agents:create'), asyncHandler(async (req, res) => {
  const agentData = req.body;
  const user_id = req.user?.uid || req.user?.id || null;

  // Validate required fields
  if (!agentData.name) {
    throw new ValidationError('Agent name is required', { field: 'name' });
  }

  if (!agentData.personality_type) {
    throw new ValidationError('Personality type is required', { field: 'personality_type' });
  }

  // Validate user_id for user-created agents
  if (!user_id) {
    throw new ValidationError('User authentication required to create agents');
  }

  const agent = await agentService.createAgent(agentData, user_id);
  
  res.status(201).json(agent);
}));

/**
 * PUT /api/v1/agents/:id
 * Update agent
 */
router.put('/:id', requirePermission('agents:update'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  // Validate that we're not updating read-only fields
  const readOnlyFields = ['id', 'created_at', 'usage_count'];
  const hasReadOnlyFields = readOnlyFields.some(field => field in updateData);
  
  if (hasReadOnlyFields) {
    throw new ValidationError('Cannot update read-only fields', { 
      readOnlyFields,
      providedFields: Object.keys(updateData)
    });
  }

  const agent = await agentService.updateAgent(id, updateData);
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }

  res.json(agent);
}));

/**
 * DELETE /api/v1/agents/:id
 * Delete agent
 */
router.delete('/:id', requirePermission('agents:delete'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deleted = await agentService.deleteAgent(id);
  if (!deleted) {
    throw new NotFoundError('Agent not found');
  }

  res.status(204).send();
}));

/**
 * POST /api/v1/agents/:id/execute
 * Execute agent with input
 * Requires chat permission (available to all users)
 */
router.post('/:id/execute', requireGuestPermission('agents:chat'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { input, context } = req.body;

  if (!input || input.trim() === '') {
    throw new ValidationError('Input is required', { field: 'input' });
  }

  // All users (guest and authenticated) now have unified permissions - no validation needed

  // Ensure critical services are initialized before agent execution
  if (!aiProviderService.initialized) {
    await aiProviderService.initialize();
  }
  // RAG functionality now handled by enhanced KnowledgeService with chunking

  // SECURITY FIX: Extract userId from authenticated request, don't trust client
  const contextWithUserId = {
    ...context,
    userId: req.user?.id || req.user?.uid || null,
    sessionId: context.sessionId || req.user?.guestSession
  };

  const result = await agentService.executeAgent(id, input, contextWithUserId);
  
  res.json(result);
}));

/**
 * POST /api/v1/agents/:id/execute-stream
 * Execute agent with streaming response
 * Requires chat permission (available to all users)
 */
router.post('/:id/execute-stream', requireGuestPermission('agents:chat'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { input, context } = req.body;

  if (!input || input.trim() === '') {
    throw new ValidationError('Input is required', { field: 'input' });
  }

  // Additional validation for guest users
  // Guest permission restrictions removed - all users now have unified permissions

  // Ensure critical services are initialized before agent execution
  if (!aiProviderService.initialized) {
    await aiProviderService.initialize();
  }

  // SECURITY FIX: Extract userId from authenticated request, don't trust client
  const contextWithUserId = {
    ...context,
    userId: req.user?.id || req.user?.uid || null,
    sessionId: context.sessionId || req.user?.guestSession
  };

  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  console.log(`🌊 [STREAMING] Starting streaming response for agent ${id}...`);

  try {
    // Execute agent with streaming
    await agentService.executeAgentStream(id, input, contextWithUserId, (chunk) => {
      // Send streaming chunks via SSE
      const data = JSON.stringify(chunk);
      res.write(`data: ${data}\n\n`);
    });

    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
    res.end();
    
    console.log(`[OK] [STREAMING] Streaming response completed for agent ${id}`);
    
  } catch (error) {
    console.error(`[ERROR] [STREAMING] Error during streaming:`, error);
    
    // Send error event
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: error.message,
      code: error.code || 'STREAMING_ERROR'
    })}\n\n`);
    res.end();
  }
}));





/**
 * GET /api/v1/agents/:id/analytics
 * Get agent execution analytics
 */
router.get('/:id/analytics', requirePermission('agents:analytics'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verify agent exists
  const agent = await agentService.getAgentById(id);
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }

  const analytics = await agentService.getAgentAnalytics(id);
  
  res.json(analytics);
}));

/**
 * POST /api/v1/agents/:id/set-default
 * Set agent as default
 */
router.post('/:id/set-default', requirePermission('agents:manage'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verify agent exists
  const agent = await agentService.getAgentById(id);
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }

  // Update agent to be default (this would typically involve more complex logic)
  const updatedAgent = await agentService.updateAgent(id, { 
    is_default: true 
  });

  // In a full implementation, we'd also unset other defaults
  // This is simplified for TDD GREEN phase

  res.json(updatedAgent);
}));


/**
 * ==========================================
 * AGENT-DOCUMENT ASSIGNMENT ENDPOINTS
 * ==========================================
 * RESTful endpoints for managing many-to-many 
 * relationships between agents and documents
 */

/**
 * GET /api/v1/agents/:id/documents
 * Get all documents assigned to an agent
 */
router.get('/:id/documents', requirePermission('agents:read'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page, limit, accessLevel, isIndexed, search } = req.query;

  const options = {
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 100,
    accessLevel,
    isIndexed: isIndexed !== undefined ? isIndexed === 'true' : undefined,
    search
  };

  const documents = await agentService.getAgentDocuments(id, options);
  
  res.json({
    success: true,
    agent_id: parseInt(id),
    documents,
    count: documents.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * PUT /api/v1/agents/:id/documents
 * Assign documents to an agent (bulk operation)
 */
router.put('/:id/documents', requirePermission('agents:update'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { document_ids, access_level = 'read' } = req.body;

  // Validate input
  if (!Array.isArray(document_ids)) {
    throw new ValidationError('document_ids must be an array', { field: 'document_ids' });
  }

  if (document_ids.length === 0) {
    throw new ValidationError('document_ids cannot be empty', { field: 'document_ids' });
  }

  // Validate all IDs are numbers
  const validIds = document_ids.every(docId => !isNaN(parseInt(docId)));
  if (!validIds) {
    throw new ValidationError('All document IDs must be valid numbers');
  }

  const result = await agentService.assignDocumentsToAgent(
    parseInt(id),
    document_ids.map(docId => parseInt(docId)),
    { accessLevel: access_level }
  );

  res.json({
    success: result.success,
    agent_id: parseInt(id),
    assigned: result.assigned,
    skipped: result.skipped,
    message: result.message,
    assignments: result.assignments,
    timestamp: new Date().toISOString()
  });
}));

/**
 * DELETE /api/v1/agents/:id/documents
 * Remove document assignments from an agent
 */
router.delete('/:id/documents', requirePermission('agents:update'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { document_ids } = req.body;

  // If document_ids provided, validate them
  if (document_ids && !Array.isArray(document_ids)) {
    throw new ValidationError('document_ids must be an array', { field: 'document_ids' });
  }

  if (document_ids && document_ids.length > 0) {
    const validIds = document_ids.every(docId => !isNaN(parseInt(docId)));
    if (!validIds) {
      throw new ValidationError('All document IDs must be valid numbers');
    }
  }

  const documentIdsToRemove = document_ids ? document_ids.map(docId => parseInt(docId)) : [];
  const result = await agentService.removeDocumentsFromAgent(parseInt(id), documentIdsToRemove);

  res.json({
    success: result.success,
    agent_id: parseInt(id),
    removed: result.removed,
    message: result.message,
    assignments: result.assignments,
    timestamp: new Date().toISOString()
  });
}));

/**
 * PUT /api/v1/agents/:id/documents/:documentId
 * Update specific document assignment access level
 */
router.put('/:id/documents/:documentId', requirePermission('agents:update'), asyncHandler(async (req, res) => {
  const { id, documentId } = req.params;
  const { access_level } = req.body;

  if (!access_level) {
    throw new ValidationError('access_level is required', { field: 'access_level' });
  }

  if (!['read', 'write', 'admin'].includes(access_level)) {
    throw new ValidationError('access_level must be read, write, or admin', { field: 'access_level' });
  }

  const result = await agentService.updateDocumentAssignment(
    parseInt(id),
    parseInt(documentId),
    access_level
  );

  res.json({
    success: result.success,
    agent_id: parseInt(id),
    document_id: parseInt(documentId),
    assignment: result.assignment,
    message: result.message,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/agents/:id/documents/analytics
 * Get document assignment analytics for an agent
 */
router.get('/:id/documents/analytics', requirePermission('agents:analytics'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const analytics = await agentService.getAgentDocumentAnalytics(parseInt(id));
  
  res.json({
    success: true,
    agent_id: parseInt(id),
    analytics,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/agents/:id/documents/:documentId/access
 * Check if agent has access to specific document
 */
router.get('/:id/documents/:documentId/access', requirePermission('agents:read'), asyncHandler(async (req, res) => {
  const { id, documentId } = req.params;
  
  const access = await agentService.checkAgentDocumentAccess(parseInt(id), parseInt(documentId));
  
  res.json({
    success: true,
    agent_id: parseInt(id),
    document_id: parseInt(documentId),
    has_access: !!access,
    access_details: access,
    timestamp: new Date().toISOString()
  });
}));

/**
 * ==========================================
 * AGENT-TOOL ASSIGNMENT ENDPOINTS
 * ==========================================
 * RESTful endpoints for managing many-to-many 
 * relationships between agents and tools
 */

/**
 * GET /api/v1/agents/:id/tools
 * Get all tools assigned to an agent
 */
router.get('/:id/tools', requirePermission('agents:read'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const agent = await agentService.getAgentById(id);
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }
  
  // Get tools from agent_tools table
  const agentTools = await agentService.getAgentTools(id);
  
  res.json({
    success: true,
    agent_id: parseInt(id),
    tools: agentTools.map(tool => tool.name),
    count: agentTools.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * PUT /api/v1/agents/:id/tools
 * Assign tools to an agent (replace all tools)
 */
router.put('/:id/tools', requirePermission('agents:update'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tool_ids } = req.body;

  // Validate input
  if (!Array.isArray(tool_ids)) {
    throw new ValidationError('tool_ids must be an array', { field: 'tool_ids' });
  }

  // Validate agent exists
  const agent = await agentService.getAgentById(id);
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }

  // Update agent with new tools
  const updatedAgent = await agentService.updateAgent(id, { 
    tools: tool_ids 
  });

  res.json({
    success: true,
    agent_id: parseInt(id),
    tools: updatedAgent.tools || [],
    count: (updatedAgent.tools || []).length,
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;