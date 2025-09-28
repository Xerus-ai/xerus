/**
 * Neon Database Connection - Standalone Backend Service
 * Extracted from xerus_web/backend_node/utils/neon-db.js
 * Backend Dev Agent 💻 - Clean Architecture Implementation
 */

const { neon } = require('@neondatabase/serverless');
const { createLogger, format, transports } = require('winston');

// Load environment variables
require('dotenv').config();

// Configure logger for backend service
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] [NeonDB]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'backend.log' })
  ]
});

class NeonDBConnection {
  constructor() {
    this.sql = null;
    this.pool = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 3;
    // Validate required environment variables
    this.validateEnvironment();
    
    this.config = {
      projectId: process.env.NEON_PROJECT_ID,
      databaseUrl: process.env.DATABASE_URL,
      poolConfig: {
        max: 10,                   // Increased from 5 to 10 for better concurrency
        min: 2,                    // Increased from 1 to 2 for faster initial responses
        idleTimeoutMillis: 30000,  // Close idle connections after 30s
        connectionTimeoutMillis: 2000, // Reduced from 5000 to 2000 for faster failures
        maxUses: 7500,             // Reuse connections up to 7500 times
        keepAlive: true,           // Keep connections alive
        keepAliveInitialDelayMs: 0 // Start keep-alive immediately
      }
    };
  }

  /**
   * Validate required environment variables
   */
  validateEnvironment() {
    const requiredVars = [
      'DATABASE_URL',
      'NEON_PROJECT_ID'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      const error = `Missing required environment variables: ${missing.join(', ')}. Please check your .env file.`;
      logger.error(error);
      throw new Error(error);
    }

    // Validate DATABASE_URL format
    if (!process.env.DATABASE_URL.startsWith('postgresql://')) {
      const error = 'DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql://';
      logger.error(error);
      throw new Error(error);
    }

    logger.info('Environment validation passed');
  }

  /**
   * Initialize database connection with persistent pool
   */
  async initialize() {
    try {

      // Initialize Neon serverless client for simple queries
      this.sql = neon(this.config.databaseUrl);
      logger.info('Neon serverless client initialized');

      // Initialize persistent connection pool
      const { Pool } = require('@neondatabase/serverless');
      this.pool = new Pool({
        connectionString: this.config.databaseUrl,
        ...this.config.poolConfig
      });

      // Add error handlers for the pool
      this.pool.on('error', (err) => {
        logger.error('Database pool error', { error: err.message });
        this.isConnected = false;
        // Auto-reconnect on connection errors
        if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND') {
          this.reconnect();
        }
      });

      this.pool.on('connect', () => {
        logger.debug('New client connected to database pool');
        this.isConnected = true;
        this.connectionRetries = 0;
      });

      // Test connection
      const result = await this.sql`SELECT NOW() as current_time`;
      logger.info('Database connection test successful', { 
        current_time: result[0].current_time 
      });
      
      this.isConnected = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize database connection', { error: error.message });
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Health check for database connection
   */
  async healthCheck() {
    const start = Date.now();
    try {
      // Ensure SQL client is initialized
      if (!this.sql) {
        await this.initialize();
      }
      
      const result = await this.sql`
        SELECT 
          version() as version,
          current_database() as current_database,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections
      `;
      
      const response_time = Date.now() - start;
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: result[0],
        response_time
      };
    } catch (error) {
      const response_time = Date.now() - start;
      logger.error('Database health check failed', { error: error.message });
      
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        response_time
      };
    }
  }

  /**
   * Reconnect to database with exponential backoff
   */
  async reconnect() {
    if (this.connectionRetries >= this.maxRetries) {
      logger.error('Max connection retries reached, giving up');
      return false;
    }

    this.connectionRetries++;
    const delay = Math.pow(2, this.connectionRetries) * 1000; // Exponential backoff
    
    logger.info(`Attempting to reconnect to database (attempt ${this.connectionRetries}/${this.maxRetries}) in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.initialize();
        logger.info('Database reconnection successful');
      } catch (error) {
        logger.error('Database reconnection failed', { error: error.message });
        this.reconnect(); // Retry
      }
    }, delay);
  }

  /**
   * Execute a query with parameters using serverless client
   */
  async query(text, params = []) {
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        // Ensure serverless client is initialized
        if (!this.sql || !this.isConnected) {
          await this.initialize();
        }

        const start = Date.now();
        
        // Use correct Neon serverless client API - they changed the syntax
        let result;
        
        try {
          if (params && params.length > 0) {
            // Use the new sql.query() method for parameterized queries
            result = await this.sql.query(text, params);
          } else {
            // For queries without parameters, use the unsafe method for literal SQL
            // This handles cases where the query contains $ signs that aren't parameters
            result = await this.sql.unsafe(text);
          }
          
          // Neon serverless client should return an array directly
          if (!Array.isArray(result)) {
            logger.warn('Expected array but got', { 
              type: typeof result, 
              constructor: result.constructor?.name 
            });
            result = [];
          }
        } catch (queryError) {
          logger.error('Query execution failed', { 
            error: queryError.message, 
            query: text.substring(0, 100),
            hasParams: !!(params && params.length > 0)
          });
          result = [];
        }
        
        const duration = Date.now() - start;
        
        if (duration > 1000) {
          logger.warn('Slow query executed', { 
            duration: `${duration}ms`, 
            query: text.substring(0, 100) 
          });
        }
        
        logger.debug('Query executed successfully', { 
          rowCount: result.length, 
          hasRows: result && result.length > 0 
        });
        
        // Return in consistent format with proper rowCount
        return { 
          rows: result || [], 
          rowCount: result ? result.length : 0
        };

      } catch (error) {
        retryCount++;
        
        // Handle connection reset errors with retry
        if ((error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.message.includes('WebSocket')) && retryCount <= maxRetries) {
          logger.warn(`Database connection error, retrying (${retryCount}/${maxRetries})`, { error: error.message });
          this.isConnected = false;
          
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 500));
          continue;
        }

        // If not a connection error or max retries reached, throw the error
        logger.error('Query execution failed', { 
          error: error.message, 
          query: text.substring(0, 100),
          retryCount
        });
        throw error;
      }
    }
  }

  /**
   * Execute a transaction
   */
  async transaction(callback) {
    try {
      await this.sql`BEGIN`;
      logger.debug('Transaction started');
      
      const result = await callback(this);
      
      await this.sql`COMMIT`;
      logger.debug('Transaction committed');
      
      return result;
    } catch (error) {
      logger.warn('Transaction rolled back', { error: error.message });
      await this.sql`ROLLBACK`;
      throw error;
    }
  }

  /**
   * Close database connection and cleanup pool
   */
  async close() {
    try {
      if (this.pool) {
        await this.pool.end();
        logger.info('Database connection pool closed');
      }
      this.isConnected = false;
      this.pool = null;
      logger.info('Database connection marked as closed');
    } catch (error) {
      logger.error('Error closing database connection', { error: error.message });
    }
  }
}

// Initialize and export singleton instance
const initializeDatabase = async () => {
  const db = new NeonDBConnection();
  await db.initialize();
  return db;
};

// Health check function using singleton instance
const healthCheck = async () => {
  try {
    // Use the singleton instance that should already be initialized
    if (!neonDB.isConnected) {
      await neonDB.initialize();
    }
    return await neonDB.healthCheck();
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      response_time: 0
    };
  }
};

// Auto-initialize and export main database connection
const neonDB = new NeonDBConnection();

// Auto-initialize the connection when module is loaded
(async () => {
  try {
    await neonDB.initialize();
    logger.info('Neon database auto-initialized successfully');
  } catch (error) {
    logger.error('Neon database auto-initialization failed', { error: error.message });
    // Don't throw here to allow graceful degradation
  }
})();

module.exports = {
  neonDB,
  NeonDBConnection,
  initializeDatabase,
  healthCheck
};