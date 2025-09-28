/**
 * MEMORY API ROUTES
 * RESTful endpoints for the 4-type agent memory system
 * 
 * Features:
 * - Working memory context management
 * - Episodic memory episode retrieval
 * - Semantic knowledge search and management
 * - Procedural behavior tracking
 * - Memory statistics and health monitoring
 * - Pattern discovery insights
 * - Memory evolution tracking
 * - Isolation context management
 */

const express = require('express');
const router = express.Router();
const memoryService = require('../../services/memoryService');

// Initialize memory service
let memoryServiceInitialized = false;
const initializeMemoryService = async () => {
  if (!memoryServiceInitialized) {
    try {
      await memoryService.initialize();
      memoryServiceInitialized = true;
      console.log('[OK] [MemoryAPI] Memory service initialized');
    } catch (error) {
      console.error('[ERROR] [MemoryAPI] Failed to initialize memory service:', error);
      throw error;
    }
  }
};

// Middleware to ensure memory service is initialized
const ensureInitialized = async (req, res, next) => {
  try {
    await initializeMemoryService();
    next();
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Memory service initialization failed',
      details: error.message 
    });
  }
};

// =============================================================================
// MEMORY INSTANCE MANAGEMENT
// =============================================================================

/**
 * GET /api/memory/instance/:agentId/:userId
 * Get memory instance statistics for agent-user combination
 */
router.get('/instance/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    
    const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
    
    const stats = {
      agentId: parseInt(agentId),
      userId: userId,
      working: memoryInstance.working.getStats(),
      episodic: memoryInstance.episodic.getStats(),
      semantic: memoryInstance.semantic.getStats(),
      procedural: memoryInstance.procedural.getStats(),
      timestamp: new Date()
    };
    
    res.json({ success: true, data: stats });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Get instance stats failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get memory instance statistics',
      details: error.message 
    });
  }
});

// =============================================================================
// WORKING MEMORY ENDPOINTS
// =============================================================================

/**
 * GET /api/memory/working/:agentId/:userId
 * Get current working memory context
 */
router.get('/working/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
    const workingMemory = memoryInstance.working;
    
    const context = await workingMemory.getContext();
    const recentContext = context.slice(-limit);
    
    res.json({ 
      success: true, 
      data: {
        context: recentContext,
        totalItems: context.length,
        stats: workingMemory.getStats()
      }
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Get working memory failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get working memory',
      details: error.message 
    });
  }
});

/**
 * POST /api/memory/working/:agentId/:userId
 * Add item to working memory
 */
router.post('/working/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const { type, content, metadata } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false, 
        error: 'Content is required' 
      });
    }
    
    const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
    const workingMemory = memoryInstance.working;
    
    await workingMemory.addItem({
      type: type || 'user_input',
      content,
      metadata: metadata || {},
      timestamp: new Date()
    });
    
    res.json({ 
      success: true, 
      message: 'Item added to working memory',
      stats: workingMemory.getStats()
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Add working memory item failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add working memory item',
      details: error.message 
    });
  }
});

// Note: Real-time sync now handled via Socket.IO /memory namespace
// See server.js for Socket.IO implementation with 'sync_sliding_window' event

// =============================================================================
// EPISODIC MEMORY ENDPOINTS
// =============================================================================

/**
 * GET /api/memory/episodic/:agentId/:userId
 * Search episodic memories
 */
router.get('/episodic/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const { query, limit = 10, offset = 0 } = req.query;
    
    const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
    const episodicMemory = memoryInstance.episodic;
    
    let episodes;
    if (query) {
      episodes = await episodicMemory.searchEpisodes(query, { 
        limit: parseInt(limit), 
        offset: parseInt(offset) 
      });
    } else {
      episodes = await episodicMemory.getRecentEpisodes(parseInt(limit));
    }
    
    res.json({ 
      success: true, 
      data: {
        episodes,
        stats: episodicMemory.getStats()
      }
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Get episodic memory failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get episodic memory',
      details: error.message 
    });
  }
});

/**
 * POST /api/memory/episodic/:agentId/:userId
 * Store new episode in episodic memory
 */
router.post('/episodic/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const { content, response, context, importance = 0.5 } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false, 
        error: 'Content is required' 
      });
    }
    
    const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
    const episodicMemory = memoryInstance.episodic;
    
    const episodeId = await episodicMemory.storeEpisode({
      content,
      response,
      context: context || {},
      importance: parseFloat(importance),
      timestamp: new Date()
    });
    
    res.json({ 
      success: true, 
      message: 'Episode stored in episodic memory',
      episodeId,
      stats: episodicMemory.getStats()
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Store episode failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to store episode',
      details: error.message 
    });
  }
});

// =============================================================================
// SEMANTIC MEMORY ENDPOINTS
// =============================================================================

/**
 * GET /api/memory/semantic/:agentId/:userId
 * Search semantic knowledge
 */
router.get('/semantic/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const { query, limit = 10 } = req.query;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query parameter is required for semantic search' 
      });
    }
    
    const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
    const semanticMemory = memoryInstance.semantic;
    
    const knowledge = await semanticMemory.searchKnowledge(query, { 
      limit: parseInt(limit)
    });
    
    res.json({ 
      success: true, 
      data: {
        knowledge,
        query,
        stats: semanticMemory.getStats()
      }
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Search semantic memory failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search semantic memory',
      details: error.message 
    });
  }
});

/**
 * POST /api/memory/semantic/:agentId/:userId
 * Store knowledge in semantic memory
 */
router.post('/semantic/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const { content, title, category = 'general', importance = 0.7 } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false, 
        error: 'Content is required' 
      });
    }
    
    const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
    const semanticMemory = memoryInstance.semantic;
    
    const knowledgeId = await semanticMemory.storeKnowledge({
      content,
      title: title || 'Untitled Knowledge',
      category,
      importance: parseFloat(importance),
      timestamp: new Date()
    });
    
    res.json({ 
      success: true, 
      message: 'Knowledge stored in semantic memory',
      knowledgeId,
      stats: semanticMemory.getStats()
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Store knowledge failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to store knowledge',
      details: error.message 
    });
  }
});

// =============================================================================
// PROCEDURAL MEMORY ENDPOINTS
// =============================================================================

/**
 * GET /api/memory/procedural/:agentId/:userId
 * Get procedural behaviors
 */
router.get('/procedural/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const { query, limit = 10 } = req.query;
    
    const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
    const proceduralMemory = memoryInstance.procedural;
    
    let behaviors;
    if (query) {
      behaviors = await proceduralMemory.findRelevantBehaviors(query, { 
        limit: parseInt(limit)
      });
    } else {
      behaviors = await proceduralMemory.getTopBehaviors(parseInt(limit));
    }
    
    res.json({ 
      success: true, 
      data: {
        behaviors,
        stats: proceduralMemory.getStats()
      }
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Get procedural memory failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get procedural memory',
      details: error.message 
    });
  }
});

/**
 * POST /api/memory/procedural/:agentId/:userId/behavior
 * Record behavior pattern in procedural memory
 */
router.post('/procedural/:agentId/:userId/behavior', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const { pattern, context, success = true } = req.body;
    
    if (!pattern) {
      return res.status(400).json({ 
        success: false, 
        error: 'Pattern is required' 
      });
    }
    
    const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
    const proceduralMemory = memoryInstance.procedural;
    
    await proceduralMemory.recordBehavior({
      pattern,
      context: context || {},
      success: success === true || success === 'true',
      timestamp: new Date()
    });
    
    res.json({ 
      success: true, 
      message: 'Behavior recorded in procedural memory',
      stats: proceduralMemory.getStats()
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Record behavior failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to record behavior',
      details: error.message 
    });
  }
});

// =============================================================================
// PATTERN DISCOVERY ENDPOINTS
// =============================================================================

/**
 * GET /api/memory/patterns/:agentId/:userId
 * Get discovered patterns
 */
router.get('/patterns/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const { type, limit = 20 } = req.query;
    
    const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
    
    // Access pattern discovery through memory service
    const patterns = await memoryService.getDiscoveredPatterns(agentId, userId, {
      type,
      limit: parseInt(limit)
    });
    
    res.json({ 
      success: true, 
      data: {
        patterns,
        totalPatterns: patterns.length
      }
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Get patterns failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get discovered patterns',
      details: error.message 
    });
  }
});

// =============================================================================
// MEMORY EVOLUTION ENDPOINTS
// =============================================================================

/**
 * GET /api/memory/evolution/stats
 * Get memory evolution statistics
 */
router.get('/evolution/stats', ensureInitialized, async (req, res) => {
  try {
    const evolutionStats = await memoryService.getEvolutionStats();
    
    res.json({ 
      success: true, 
      data: evolutionStats
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Get evolution stats failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get evolution statistics',
      details: error.message 
    });
  }
});

/**
 * GET /api/memory/evolution/history/:agentId/:userId
 * Get evolution history for specific agent-user
 */
router.get('/evolution/history/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const { limit = 10 } = req.query;
    
    const evolutionHistory = await memoryService.getEvolutionHistory(agentId, userId, {
      limit: parseInt(limit)
    });
    
    res.json({ 
      success: true, 
      data: {
        history: evolutionHistory,
        agentId: parseInt(agentId),
        userId
      }
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Get evolution history failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get evolution history',
      details: error.message 
    });
  }
});

// =============================================================================
// MEMORY HEALTH AND MONITORING
// =============================================================================

/**
 * GET /api/memory/health
 * Get overall memory system health
 */
router.get('/health', ensureInitialized, async (req, res) => {
  try {
    const healthCheck = await memoryService.healthCheck();
    
    res.json({ 
      success: true, 
      data: healthCheck
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Health check failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Memory system health check failed',
      details: error.message 
    });
  }
});

/**
 * GET /api/memory/stats
 * Get comprehensive memory system statistics
 */
router.get('/stats', ensureInitialized, async (req, res) => {
  try {
    const stats = await memoryService.getSystemStats();
    
    res.json({ 
      success: true, 
      data: stats
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Get system stats failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get memory system statistics',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/memory/instance/:agentId/:userId
 * Clear all memories for specific agent-user combination
 */
router.delete('/instance/:agentId/:userId', ensureInitialized, async (req, res) => {
  try {
    const { agentId, userId } = req.params;
    const { confirm } = req.body;
    
    if (!confirm || confirm !== 'DELETE') {
      return res.status(400).json({ 
        success: false, 
        error: 'Confirmation required - send { "confirm": "DELETE" } in request body' 
      });
    }
    
    await memoryService.clearMemories(agentId, userId);
    
    res.json({ 
      success: true, 
      message: `All memories cleared for agent ${agentId}, user ${userId}`
    });
    
  } catch (error) {
    console.error('[ERROR] [MemoryAPI] Clear memories failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear memories',
      details: error.message 
    });
  }
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// Global error handler for memory routes
router.use((error, req, res, next) => {
  console.error('[ERROR] [MemoryAPI] Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal memory system error',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Contact support'
  });
});

module.exports = router;