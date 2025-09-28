/**
 * Production-safe logging utility
 * Automatically silences console.log in production while preserving errors and warnings
 */

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Production-safe logger that respects environment settings
 */
class ProductionLogger {
  constructor() {
    this.isDev = isDevelopment;
    this.isProd = isProduction;
  }

  /**
   * Debug logs - only shown in development
   */
  debug(...args) {
    if (this.isDev) {
      console.log('[DEBUG]', ...args);
    }
  }

  /**
   * Info logs - shown in development, suppressed in production unless DEBUG=true
   */
  info(...args) {
    if (this.isDev || process.env.DEBUG === 'true') {
      console.log('[INFO]', ...args);
    }
  }

  /**
   * Warning logs - always shown but formatted consistently
   */
  warn(...args) {
    console.warn('[WARNING]', ...args);
  }

  /**
   * Error logs - always shown
   */
  error(...args) {
    console.error('[ERROR]', ...args);
  }

  /**
   * Success logs - shown in development, suppressed in production unless DEBUG=true
   */
  success(...args) {
    if (this.isDev || process.env.DEBUG === 'true') {
      console.log('[SUCCESS]', ...args);
    }
  }

  /**
   * Performance logs - only shown when PERF_LOGS=true
   */
  perf(label, ...args) {
    if (process.env.PERF_LOGS === 'true') {
      console.log('[DATA] [PERF]', label, ...args);
    }
  }

  /**
   * Conditional logging - only runs callback in development
   */
  dev(callback) {
    if (this.isDev && typeof callback === 'function') {
      callback();
    }
  }

  /**
   * Production-safe console.log replacement
   * Use this to replace console.log calls that should be development-only
   */
  log(...args) {
    this.info(...args);
  }
}

// Create singleton instance
const logger = new ProductionLogger();

// Export both the class and instance
module.exports = {
  ProductionLogger,
  logger,
  
  // Convenience exports
  debug: logger.debug.bind(logger),
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
  success: logger.success.bind(logger),
  perf: logger.perf.bind(logger),
  dev: logger.dev.bind(logger),
  log: logger.log.bind(logger)
};