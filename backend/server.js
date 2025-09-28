/**
 * Xerus Backend API Service - Standalone Express Server
 * Backend Dev Agent - Microservices Architecture
 * Extracted from xerus_web/backend_node/
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createLogger, format, transports } = require('winston');

// Import database connection
const { neonDB, healthCheck } = require('./database/connections/neon');

// Import route modules (to be created)
const agentRoutes = require('./api/routes/agents');
const knowledgeRoutes = require('./api/routes/knowledge');
const toolRoutes = require('./api/routes/tools');
const mcpRoutes = require('./api/routes/mcp');
const authRoutes = require('./api/routes/auth');
const userRoutes = require('./api/routes/user');
const conversationRoutes = require('./api/routes/conversations');
const migrationRoutes = require('./api/routes/migration');
// Guest config routes removed - unified permissions system
// const contextRoutes = require('./api/routes/context'); // Removed - functionality handled by SimplifiedAgentOrchestrator
const memoryRoutes = require('./api/routes/memory');
const ttsRoutes = require('./api/routes/tts');

// Import middleware
const { authMiddleware } = require('./api/middleware/auth');
const { errorHandler } = require('./api/middleware/errorHandler');

// Import services
// Guest permission service removed - unified permissions system
const { aiProviderService } = require('./services/aiProviderService');
const TokenRefreshService = require('./services/tokenRefreshService');

// Import WebSocket servers
const TTSWebSocketServer = require('./websocket/ttsWebSocketServer');

// Configure logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] [Backend]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    new transports.File({ 
      filename: 'backend.log',
      format: format.json()
    }),
    new transports.File({ 
      filename: 'error.log', 
      level: 'error',
      format: format.json()
    })
  ]
});

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow embedding for development
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Development - allow all localhost origins
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || 
          origin.startsWith('http://127.0.0.1:') ||
          origin.startsWith('https://localhost:')) {
        return callback(null, true);
      }
    }
    
    // Production - check allowed origins
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map(origin => origin.trim());
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Log rejected origin for debugging
    logger.warn('CORS rejected origin', { origin });
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-User-ID', 
    'x-user-id',
    'X-Guest-Session',
    'x-guest-session',
    'X-Requested-With',
    'Accept'
  ]
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window
  message: {
    error: 'Too many requests from this IP',
    retryAfter: 'Please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ 
  limit: '50mb',
  strict: true
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb' 
}));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    });
  });
  
  next();
});

// Health check endpoint (no auth required)
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await healthCheck();
    
    // Enhanced health check with connection pool status
    const connectionPoolStatus = {
      isConnected: neonDB.isConnected,
      hasPool: !!neonDB.pool,
      connectionRetries: neonDB.connectionRetries,
      poolSize: neonDB.pool ? {
        totalCount: neonDB.pool.totalCount || 0,
        idleCount: neonDB.pool.idleCount || 0,
        waitingCount: neonDB.pool.waitingCount || 0
      } : null
    };
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      database: dbHealth,
      connectionPool: connectionPoolStatus
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      connectionPool: {
        isConnected: neonDB?.isConnected || false,
        hasPool: !!neonDB?.pool
      }
    });
  }
});

// API version endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    service: 'Xerus Backend API',
    version: 'v1.0.0',
    description: 'Standalone backend service for Xerus AI Assistant',
    endpoints: {
      agents: '/api/v1/agents',
      knowledge: '/api/v1/knowledge',
      tools: '/api/v1/tools',
      auth: '/api/v1/auth',
      user: '/api/v1/user',
      conversations: '/api/v1/conversations',
      migration: '/api/v1/migration',
      // guestConfig: removed - unified permissions system
      // context: '/api/v1/context' // Removed - functionality handled by SimplifiedAgentOrchestrator
    },
    documentation: '/api/v1/docs'
  });
});

// Apply authentication middleware to all API routes
app.use('/api/v1', authMiddleware);

// API routes
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/knowledge', knowledgeRoutes);
app.use('/api/v1/tools', toolRoutes);
app.use('/api/v1/mcp', mcpRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/migration', migrationRoutes);
// app.use('/api/v1/guest-config', guestConfigRoutes); // Removed - unified permissions system
// app.use('/api/v1/context', contextRoutes); // Removed - functionality handled by SimplifiedAgentOrchestrator
app.use('/api/v1/memory', memoryRoutes);
app.use('/api/v1/tts', ttsRoutes);

// Development sync status endpoint (legacy compatibility)
app.get('/api/sync/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '2.0.0-standalone',
    message: 'Backend extracted to standalone service'
  });
});

// 404 handler for unknown routes
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  res.status(404).json({
    error: 'Route not found',
    message: `${req.method} ${req.url} is not a valid API endpoint`,
    availableEndpoints: [
      'GET /health',
      'GET /api/v1',
      'GET /api/v1/agents',
      'POST /api/v1/agents',
      'GET /api/v1/knowledge',
      'POST /api/v1/knowledge',
      'GET /api/v1/tools',
      'POST /api/v1/tools/:toolName/execute',
      'GET /api/v1/user/profile',
      'GET /api/v1/user/:userId',
      'POST /api/v1/user/find-or-create',
      'GET /api/v1/user/list'
    ]
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown handling
const shutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections
    neonDB.close().then(() => {
      logger.info('Database connections closed');
      process.exit(0);
    }).catch(err => {
      logger.error('Error closing database connections', { error: err.message });
      process.exit(1);
    });
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL, process.env.WEB_DASHBOARD_URL].filter(Boolean)
      : ["http://localhost:3000", "http://localhost:3001", "http://localhost:8080"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Create memory sync namespace for optimized real-time communication
const memoryNamespace = io.of('/memory');

// Memory sync socket handlers
memoryNamespace.on('connection', (socket) => {
  logger.info('Memory client connected', { 
    socketId: socket.id,
    transport: socket.conn.transport.name 
  });

  // Real-time sliding window sync from FastContextManager
  socket.on('sync_sliding_window', async (data) => {
    try {
      const { agentId, userId, slidingWindowData } = data;
      
      if (!slidingWindowData || !Array.isArray(slidingWindowData)) {
        socket.emit('sync_error', { error: 'Invalid sliding window data format' });
        return;
      }

      // Import memory service dynamically to avoid circular deps
      const memoryService = require('./services/memoryService');
      
      // Get memory instance and working memory
      const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
      const workingMemory = memoryInstance.working;
      
      // Perform bulk sync
      const syncResult = await workingMemory.syncWithSlidingWindow(slidingWindowData);
      
      // Send success response
      socket.emit('sync_complete', {
        success: true,
        synced: syncResult.synced,
        errors: syncResult.errors,
        totalItems: slidingWindowData.length,
        timestamp: new Date().toISOString()
      });
      
      logger.info('Sliding window sync completed', {
        agentId, userId, 
        synced: syncResult.synced, 
        errors: syncResult.errors,
        socketId: socket.id
      });
      
    } catch (error) {
      logger.error('Sliding window sync failed', { 
        error: error.message, 
        socketId: socket.id 
      });
      
      socket.emit('sync_error', { 
        error: 'Sync failed', 
        details: error.message 
      });
    }
  });

  // Handle real-time context updates (single items)
  socket.on('add_context_item', async (data) => {
    try {
      const { agentId, userId, contextItem } = data;
      
      // Import memory service
      const memoryService = require('./services/memoryService');
      
      // Get working memory
      const memoryInstance = await memoryService.getMemoryInstance(agentId, userId);
      const workingMemory = memoryInstance.working;
      
      // Add single item
      const result = await workingMemory.addItem({
        type: contextItem.type || 'context',
        content: contextItem.content,
        metadata: contextItem.metadata || {},
        timestamp: contextItem.timestamp || new Date()
      });
      
      socket.emit('context_added', {
        success: true,
        contextId: result.id,
        relevanceScore: result.relevanceScore
      });
      
    } catch (error) {
      logger.error('Add context item failed', { 
        error: error.message, 
        socketId: socket.id 
      });
      
      socket.emit('context_error', { 
        error: 'Failed to add context item', 
        details: error.message 
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    logger.info('Memory client disconnected', { 
      socketId: socket.id, 
      reason 
    });
  });
});

// Global socket error handling
io.engine.on('connection_error', (err) => {
  logger.error('Socket connection error', { 
    code: err.code,
    message: err.message,
    context: err.context
  });
});

// Start server
server.listen(PORT, HOST, async () => {
  try {
    // Initialize database connection
    await neonDB.initialize();
    
    // Guest permission service removed - unified permissions system
    
    // Initialize AI Provider Service
    await aiProviderService.initialize();
    logger.info('AI Provider Service initialized');
    
    // Initialize Token Refresh Service
    global.tokenRefreshService = new TokenRefreshService();
    global.tokenRefreshService.start();
    logger.info('Token Refresh Service initialized and started');
    
    // Initialize TTS WebSocket Server
    const ttsWebSocketServer = new TTSWebSocketServer(server);
    logger.info('TTS WebSocket Server initialized on /tts-stream');

    // Advanced Multi-Modal Intelligence System is already initialized
    logger.info('Advanced Multi-Modal Intelligence System operational');
    logger.info('Prompt Orchestration Engine ready');
    
    logger.info('Xerus Backend API Service Started', {
      port: PORT,
      host: HOST,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      database: 'Neon PostgreSQL',
      realtime: 'Socket.IO enabled',
      memoryNamespace: '/memory',
      cors: process.env.NODE_ENV === 'production' ? 'restricted' : 'development'
    });
    
    // Log service endpoints
    logger.info('Available API Endpoints', {
      health: `http://${HOST}:${PORT}/health`,
      api: `http://${HOST}:${PORT}/api/v1`,
      agents: `http://${HOST}:${PORT}/api/v1/agents`,
      knowledge: `http://${HOST}:${PORT}/api/v1/knowledge`,
      tools: `http://${HOST}:${PORT}/api/v1/tools`,
      memorySocket: `ws://${HOST}:${PORT}/memory`,
      realtime: 'Socket.IO /memory namespace active'
    });
    
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown...');
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Stop Token Refresh Service
      if (global.tokenRefreshService) {
        global.tokenRefreshService.stop();
        logger.info('Token Refresh Service stopped');
      }
      
      // Close database connections
      await neonDB.close();
      logger.info('Database connections closed');
      
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', { error: error.message });
      process.exit(1);
    }
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown...');
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Stop Token Refresh Service
      if (global.tokenRefreshService) {
        global.tokenRefreshService.stop();
        logger.info('Token Refresh Service stopped');
      }
      
      // Close database connections
      await neonDB.close();
      logger.info('Database connections closed');
      
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', { error: error.message });
      process.exit(1);
    }
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise });
  process.exit(1);
});

// Export app for testing
module.exports = app;