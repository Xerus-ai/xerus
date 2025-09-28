/**
 * Knowledge API Routes - RESTful Endpoints
 * Backend Dev Agent 💻 - Extracted and cleaned up
 * Standalone Backend Service
 */

const express = require('express');
const router = express.Router();

// Import services and middleware
const KnowledgeService = require('../../services/knowledgeService');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { requirePermission, requireAuth } = require('../middleware/auth');

// Initialize service
const knowledgeService = new KnowledgeService();

/**
 * GET /api/v1/knowledge
 * List knowledge documents with filtering and pagination
 * Requires authentication - not available to guests
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const {
    content_type,
    is_indexed,
    tags,
    search,
    limit = 50,
    offset = 0,
    page,
    per_page,
    folder_id
  } = req.query;

  // Handle pagination parameters
  const actualLimit = per_page ? parseInt(per_page) : parseInt(limit);
  const actualOffset = page ? (parseInt(page) - 1) * actualLimit : parseInt(offset);

  // Validate limits
  if (actualLimit > 100) {
    throw new ValidationError('Limit cannot exceed 100 items');
  }

  const filters = {
    content_type,
    is_indexed: is_indexed !== undefined ? is_indexed === 'true' : undefined,
    tags: tags ? tags.split(',') : undefined,
    search,
    limit: actualLimit,
    offset: actualOffset,
    user_id: req.user?.id, // Filter by authenticated user
    folder_id
  };

  const documents = await knowledgeService.getKnowledgeDocuments(filters);

  // Set pagination headers
  res.set({
    'X-Total-Count': documents.length.toString(),
    'X-Page': page || Math.floor(actualOffset / actualLimit) + 1,
    'X-Per-Page': actualLimit.toString()
  });

  res.json(documents);
}));

/**
 * FOLDER MANAGEMENT ENDPOINTS
 * These routes must come BEFORE /:id to prevent route conflicts
 */

/**
 * GET /api/v1/knowledge/folders
 * List folders for authenticated user
 */
router.get('/folders', requireAuth, asyncHandler(async (req, res) => {
  const { parent_id, search, limit = 100, offset = 0 } = req.query;
  
  const filters = {
    parent_id,
    search,
    limit: parseInt(limit),
    offset: parseInt(offset)
  };

  const folders = await knowledgeService.getFolders(req.user.id, filters);
  res.json(folders);
}));

/**
 * POST /api/v1/knowledge/folders
 * Create new folder
 */
router.post('/folders', requireAuth, asyncHandler(async (req, res) => {
  const folderData = req.body;
  
  console.log('[SEARCH] DEBUG /folders POST - Raw body:', JSON.stringify(req.body));
  console.log('[SEARCH] DEBUG /folders POST - User ID:', req.user.id);
  
  if (!folderData.name) {
    throw new ValidationError('Folder name is required', { field: 'name' });
  }

  const folder = await knowledgeService.createFolder(folderData, req.user.id);
  res.status(201).json(folder);
}));

/**
 * GET /api/v1/knowledge/folders/hierarchy
 * Get folder hierarchy for user
 */
router.get('/folders/hierarchy', requireAuth, asyncHandler(async (req, res) => {
  const hierarchy = await knowledgeService.getFolderHierarchy(req.user.id);
  res.json(hierarchy);
}));

/**
 * GET /api/v1/knowledge/folders/:id
 * Get specific folder by ID
 */
router.get('/folders/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const folder = await knowledgeService.getFolderById(id, req.user.id);
  if (!folder) {
    throw new NotFoundError('Folder not found');
  }

  res.json(folder);
}));

/**
 * PUT /api/v1/knowledge/folders/:id
 * Update folder
 */
router.put('/folders/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const folder = await knowledgeService.updateFolder(id, updateData, req.user.id);
  res.json(folder);
}));

/**
 * DELETE /api/v1/knowledge/folders/:id
 * Delete folder (and optionally its contents)
 */
router.delete('/folders/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cascade = false } = req.query;

  await knowledgeService.deleteFolder(id, req.user.id, cascade === 'true');
  res.status(204).send();
}));

/**
 * GET /api/v1/knowledge/pending-embeddings
 * Get documents that need embedding generation
 */
router.get('/pending-embeddings', requirePermission('knowledge:read'), asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;

  const documents = await knowledgeService.getDocumentsNeedingEmbeddings(parseInt(limit));
  
  res.json({
    documents,
    count: documents.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/knowledge/:id
 * Get specific knowledge document by ID
 * Requires authentication - not available to guests
 */
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const document = await knowledgeService.getKnowledgeDocumentById(id);
  if (!document) {
    throw new NotFoundError('Knowledge document not found');
  }

  res.json(document);
}));

/**
 * POST /api/v1/knowledge
 * Create new knowledge document
 */
router.post('/', requirePermission('knowledge:create'), asyncHandler(async (req, res) => {
  const docData = req.body;

  // Debug logging to understand what we're receiving
  console.log('[SEARCH] DEBUG - Knowledge upload request received:');
  console.log('[DATA] Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('[DATA] Request body type:', typeof req.body);
  console.log('[DATA] Request body:', JSON.stringify(req.body, null, 2));
  console.log('[DATA] docData.title:', JSON.stringify(docData.title));
  console.log('[DATA] docData keys:', Object.keys(docData || {}));
  console.log('[DATA] User info:', JSON.stringify(req.user, null, 2));

  // Validate required fields
  if (!docData.title) {
    console.log('[ERROR] DEBUG - Title validation failed');
    console.log('[DATA] docData.title value:', JSON.stringify(docData.title));
    console.log('[DATA] docData.title type:', typeof docData.title);
    throw new ValidationError('Document title is required', { field: 'title' });
  }

  if (!docData.content) {
    throw new ValidationError('Document content is required', { field: 'content' });
  }

  const document = await knowledgeService.createKnowledgeDocument(docData, req.user?.id);
  
  res.status(201).json(document);
}));

/**
 * PUT /api/v1/knowledge/:id
 * Update knowledge document
 */
router.put('/:id', requirePermission('knowledge:update'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  // Validate that we're not updating read-only fields
  const readOnlyFields = ['id', 'created_at', 'word_count', 'character_count'];
  const hasReadOnlyFields = readOnlyFields.some(field => field in updateData);
  
  if (hasReadOnlyFields) {
    throw new ValidationError('Cannot update read-only fields', { 
      readOnlyFields,
      providedFields: Object.keys(updateData)
    });
  }

  const document = await knowledgeService.updateKnowledgeDocument(id, updateData);
  if (!document) {
    throw new NotFoundError('Knowledge document not found');
  }

  res.json(document);
}));

/**
 * DELETE /api/v1/knowledge/:id
 * Delete knowledge document
 */
router.delete('/:id', requirePermission('knowledge:delete'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deleted = await knowledgeService.deleteKnowledgeDocument(id);
  if (!deleted) {
    throw new NotFoundError('Knowledge document not found');
  }

  res.status(204).send();
}));

/**
 * POST /api/v1/knowledge/search
 * Search knowledge base
 * Requires authentication - not available to guests
 */
router.post('/search', requireAuth, asyncHandler(async (req, res) => {
  const { query, options = {} } = req.body;

  if (!query || query.trim() === '') {
    throw new ValidationError('Search query is required', { field: 'query' });
  }

  const results = await knowledgeService.searchKnowledge(query, options);
  
  res.json({
    query,
    results,
    total: results.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/v1/knowledge/:id/reindex
 * Reindex specific knowledge document
 */
router.post('/:id/reindex', requirePermission('knowledge:manage'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const success = await knowledgeService.reindexDocument(id);
  if (!success) {
    throw new NotFoundError('Knowledge document not found');
  }

  res.json({
    message: 'Document reindexed successfully',
    document_id: parseInt(id),
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/v1/knowledge/bulk-index
 * Bulk index multiple documents
 */
router.post('/bulk-index', requirePermission('knowledge:manage'), asyncHandler(async (req, res) => {
  const { document_ids } = req.body;

  if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
    throw new ValidationError('Document IDs array is required', { field: 'document_ids' });
  }

  // Validate all IDs are numbers
  const validIds = document_ids.every(id => !isNaN(parseInt(id)));
  if (!validIds) {
    throw new ValidationError('All document IDs must be valid numbers');
  }

  const result = await knowledgeService.bulkIndexDocuments(document_ids.map(id => parseInt(id)));
  
  res.json({
    message: 'Bulk indexing completed',
    indexed_count: result.indexed_count,
    total_requested: result.total_requested,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/knowledge/analytics
 * Get knowledge base analytics
 */
router.get('/analytics', requirePermission('knowledge:analytics'), asyncHandler(async (req, res) => {
  const analytics = await knowledgeService.getKnowledgeAnalytics();
  
  res.json(analytics);
}));

/**
 * POST /api/v1/knowledge/:id/move
 * Move document to folder
 */
router.post('/:id/move', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { folder_id } = req.body;

  const document = await knowledgeService.moveDocumentToFolder(id, folder_id, req.user.id);
  if (!document) {
    throw new NotFoundError('Document not found');
  }

  res.json(document);
}));

/**
 * POST /api/v1/knowledge/:id/generate-embedding
 * Generate embedding for specific document
 */
router.post('/:id/generate-embedding', requirePermission('knowledge:manage'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  console.log(`[AI] API: Generating embedding for document ${id}`);

  const document = await knowledgeService.generateDocumentEmbedding(id);
  
  res.json({
    message: 'Embedding generated successfully',
    document_id: parseInt(id),
    is_indexed: document.is_indexed,
    index_status: document.index_status,
    has_embedding: document.embedding_vector !== null,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/v1/knowledge/bulk-generate-embeddings
 * Bulk generate embeddings for multiple documents
 */
router.post('/bulk-generate-embeddings', requirePermission('knowledge:manage'), asyncHandler(async (req, res) => {
  const { document_ids, batch_size } = req.body;

  if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
    throw new ValidationError('Document IDs array is required', { field: 'document_ids' });
  }

  // Validate all IDs are numbers
  const validIds = document_ids.every(id => !isNaN(parseInt(id)));
  if (!validIds) {
    throw new ValidationError('All document IDs must be valid numbers');
  }

  console.log(`[AI] API: Bulk generating embeddings for ${document_ids.length} documents`);

  const result = await knowledgeService.bulkGenerateEmbeddings(
    document_ids.map(id => parseInt(id)),
    { batchSize: batch_size || 5 }
  );
  
  res.json({
    message: 'Bulk embedding generation completed',
    successful_count: result.successful.length,
    failed_count: result.failed.length,
    total_requested: result.total,
    successful: result.successful,
    failed: result.failed,
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;