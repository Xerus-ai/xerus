/**
 * Backend Production-safe logging utility
 * Uses Winston for structured logging with environment-aware levels
 */

const { createLogger, format, transports } = require('winston');

// Load environment variables
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Configure logger for backend service
const logger = createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'warn' : 'info'),
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'xerus-backend' },
  transports: [
    // Console transport with different formatting for development
    new transports.Console({
      format: isDevelopment ? 
        format.combine(
          format.colorize(),
          format.simple()
        ) : 
        format.json()
    }),
    
    // File transport for errors (always enabled)
    new transports.File({ 
      filename: 'error.log', 
      level: 'error' 
    }),
    
    // File transport for all logs (only in production or when explicitly enabled)
    ...(isProduction || process.env.LOG_TO_FILE === 'true' ? [
      new transports.File({ 
        filename: 'backend.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    ] : [])
  ]
});

/**
 * Production-safe console replacement for backend services
 */
class BackendLogger {
  constructor() {
    this.logger = logger;
    this.isDev = isDevelopment;
    this.isProd = isProduction;
  }

  /**
   * Replace console.log with environment-aware logging
   */
  log(...args) {
    if (this.isDev) {
      this.logger.info(args.join(' '));
    }
  }

  debug(...args) {
    this.logger.debug(args.join(' '));
  }

  info(...args) {
    this.logger.info(args.join(' '));
  }

  warn(...args) {
    this.logger.warn(args.join(' '));
  }

  error(...args) {
    this.logger.error(args.join(' '));
  }

  /**
   * Structured logging with metadata
   */
  logWithMeta(level, message, meta = {}) {
    this.logger.log(level, message, meta);
  }

  /**
   * Performance logging
   */
  perf(label, startTime) {
    if (process.env.PERF_LOGS === 'true' || this.isDev) {
      const duration = Date.now() - startTime;
      this.logger.info(`Performance: ${label} took ${duration}ms`);
    }
  }

  /**
   * Development-only callback execution
   */
  dev(callback) {
    if (this.isDev && typeof callback === 'function') {
      callback();
    }
  }
}

// Create singleton instance
const backendLogger = new BackendLogger();

module.exports = {
  BackendLogger,
  backendLogger,
  winstonLogger: logger,
  
  // Convenience exports
  debug: backendLogger.debug.bind(backendLogger),
  info: backendLogger.info.bind(backendLogger),
  warn: backendLogger.warn.bind(backendLogger),
  error: backendLogger.error.bind(backendLogger),
  log: backendLogger.log.bind(backendLogger),
  perf: backendLogger.perf.bind(backendLogger),
  dev: backendLogger.dev.bind(backendLogger),
  logWithMeta: backendLogger.logWithMeta.bind(backendLogger)
};