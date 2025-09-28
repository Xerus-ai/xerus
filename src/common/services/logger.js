/**
 * XERUS PRODUCTION LOGGING SYSTEM
 * Centralized, configurable logging with levels, formatting, and output control
 * 
 * Features:
 * - Configurable log levels (DEBUG, INFO, WARN, ERROR)
 * - Structured logging with metadata
 * - Environment-aware output (dev vs production)
 * - File and console output options
 * - Performance-optimized for production
 */

const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

/**
 * Log Levels (ordered by severity)
 */
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

/**
 * Logger Configuration
 */
const DEFAULT_CONFIG = {
    level: process.env.NODE_ENV === 'production' ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG,
    enableConsole: process.env.NODE_ENV !== 'production',
    enableFile: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    logDir: null, // Will be set to app data directory
    format: 'detailed' // 'simple' | 'detailed' | 'json'
};

class Logger {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logQueue = [];
        this.isWriting = false;
        this.initialized = false;
        
        // Resource management for EPIPE prevention
        this.consoleQueue = [];
        this.isProcessingConsole = false;
        this.maxBufferSize = 1000;
        this.consoleThrottle = 50; // ms between console writes
        this.lastConsoleWrite = 0;
        this.consoleEnabled = true;
        
        this.init();
        this.startBackgroundProcessor();
    }

    /**
     * Initialize logger (async)
     */
    async init() {
        try {
            // Set log directory
            if (!this.config.logDir) {
                const userDataPath = app ? app.getPath('userData') : process.cwd();
                this.config.logDir = path.join(userDataPath, 'logs');
            }

            // Ensure log directory exists
            await fs.mkdir(this.config.logDir, { recursive: true });
            
            // Set up log rotation
            await this.rotateLogsIfNeeded();
            
            this.initialized = true;
            
            // Process any queued logs
            await this.processLogQueue();
            
        } catch (error) {
            console.error('Failed to initialize logger:', error);
            // Fallback to console-only logging
            this.config.enableFile = false;
            this.initialized = true;
        }
    }

    /**
     * Log a debug message
     */
    debug(message, meta = {}) {
        this.log(LOG_LEVELS.DEBUG, message, meta);
    }

    /**
     * Log an info message
     */
    info(message, meta = {}) {
        this.log(LOG_LEVELS.INFO, message, meta);
    }

    /**
     * Log a warning message
     */
    warn(message, meta = {}) {
        this.log(LOG_LEVELS.WARN, message, meta);
    }

    /**
     * Log an error message
     */
    error(message, meta = {}) {
        this.log(LOG_LEVELS.ERROR, message, meta);
    }

    /**
     * Core logging method
     */
    log(level, message, meta = {}) {
        // Check if log level is enabled
        if (level < this.config.level) {
            return;
        }

        const logEntry = this.createLogEntry(level, message, meta);

        // Console output (if enabled)
        if (this.config.enableConsole) {
            this.outputToConsole(logEntry);
        }

        // File output (if enabled)
        if (this.config.enableFile) {
            if (this.initialized) {
                this.writeToFile(logEntry);
            } else {
                // Queue logs until initialized
                this.logQueue.push(logEntry);
            }
        }
    }

    /**
     * Create structured log entry
     */
    createLogEntry(level, message, meta) {
        const timestamp = new Date().toISOString();
        const levelName = Object.keys(LOG_LEVELS)[level];
        
        return {
            timestamp,
            level: levelName,
            message,
            meta,
            pid: process.pid,
            component: meta.component || 'app'
        };
    }

    /**
     * Output log to console with resource-aware queuing
     */
    outputToConsole(logEntry) {
        if (!this.consoleEnabled || !this.config.enableConsole) {
            return;
        }

        // Non-blocking queue-based console writing
        if (this.consoleQueue.length >= this.maxBufferSize) {
            this.consoleQueue.shift(); // Drop oldest log to prevent memory leak
        }
        
        this.consoleQueue.push(logEntry);
        this.processConsoleQueue();
    }

    /**
     * Process console queue with throttling and EPIPE protection
     */
    async processConsoleQueue() {
        if (this.isProcessingConsole || this.consoleQueue.length === 0) {
            return;
        }

        this.isProcessingConsole = true;
        
        try {
            while (this.consoleQueue.length > 0 && this.consoleEnabled) {
                const now = Date.now();
                
                // Throttle console writes to prevent EPIPE
                if (now - this.lastConsoleWrite < this.consoleThrottle) {
                    await new Promise(resolve => setTimeout(resolve, this.consoleThrottle));
                }
                
                const logEntry = this.consoleQueue.shift();
                
                try {
                    // Attempt console write with EPIPE protection
                    await this.safeConsoleWrite(logEntry);
                    this.lastConsoleWrite = Date.now();
                } catch (error) {
                    if (error.code === 'EPIPE' || error.message.includes('broken pipe')) {
                        // Disable console logging temporarily to prevent cascade failures
                        console.error('[Logger] EPIPE detected - temporarily disabling console output');
                        this.consoleEnabled = false;
                        
                        // Re-enable after 5 seconds
                        setTimeout(() => {
                            this.consoleEnabled = true;
                            console.error('[Logger] Console output re-enabled');
                        }, 5000);
                        break;
                    }
                    // For other errors, continue processing
                }
            }
        } finally {
            this.isProcessingConsole = false;
        }
    }

    /**
     * Safe console write with timeout protection
     */
    async safeConsoleWrite(logEntry) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Console write timeout'));
            }, 1000);

            try {
                const formatted = this.formatLogEntry(logEntry);
                
                // Use setImmediate to yield control to event loop
                setImmediate(() => {
                    try {
                        console.log(formatted);
                        clearTimeout(timeout);
                        resolve();
                    } catch (error) {
                        clearTimeout(timeout);
                        reject(error);
                    }
                });
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    /**
     * Format log entry for console output
     */
    formatLogEntry(logEntry) {
        const { timestamp, level, message, meta, component } = logEntry;
        
        // Color codes for different levels
        const colors = {
            DEBUG: '\x1b[36m', // Cyan
            INFO: '\x1b[32m',  // Green
            WARN: '\x1b[33m',  // Yellow
            ERROR: '\x1b[31m'  // Red
        };
        const reset = '\x1b[0m';
        
        // Format based on configuration
        if (this.config.format === 'simple') {
            return `${colors[level]}[${level}]${reset} ${message}`;
        } else if (this.config.format === 'json') {
            return JSON.stringify(logEntry);
        } else {
            // Detailed format
            const timeStr = timestamp.substring(11, 23); // HH:MM:SS.sss
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `${colors[level]}[${timeStr}] [${level}] [${component}]${reset} ${message}${metaStr}`;
        }
    }

    /**
     * Write log to file
     */
    async writeToFile(logEntry) {
        if (this.isWriting) {
            this.logQueue.push(logEntry);
            return;
        }

        try {
            this.isWriting = true;
            
            const logLine = this.formatForFile(logEntry);
            const logFile = path.join(this.config.logDir, 'xerus.log');
            
            await fs.appendFile(logFile, logLine + '\n', 'utf8');
            
            // Check if rotation is needed
            await this.rotateLogsIfNeeded();
            
        } catch (error) {
            // Handle EPIPE errors gracefully for file operations
            if (error.code === 'EPIPE' || error.message.includes('broken pipe')) {
                // Silently ignore EPIPE errors to prevent crashes
                return;
            }
            console.error('Failed to write to file:', error);
        } finally {
            this.isWriting = false;
            
            // Process any queued logs
            if (this.logQueue.length > 0) {
                const nextEntry = this.logQueue.shift();
                await this.writeToFile(nextEntry);
            }
        }
    }

    /**
     * Format log entry for file output
     */
    formatForFile(logEntry) {
        if (this.config.format === 'json') {
            return JSON.stringify(logEntry);
        } else {
            const { timestamp, level, message, meta, component } = logEntry;
            const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level}] [${component}] ${message}${metaStr}`;
        }
    }

    /**
     * Process queued log entries
     */
    async processLogQueue() {
        while (this.logQueue.length > 0) {
            const logEntry = this.logQueue.shift();
            await this.writeToFile(logEntry);
        }
    }

    /**
     * Rotate logs if needed
     */
    async rotateLogsIfNeeded() {
        try {
            const logFile = path.join(this.config.logDir, 'xerus.log');
            
            // Check if file exists and its size
            try {
                const stats = await fs.stat(logFile);
                if (stats.size < this.config.maxFileSize) {
                    return; // No rotation needed
                }
            } catch (error) {
                // File doesn't exist, no rotation needed
                return;
            }

            // Rotate log files
            for (let i = this.config.maxFiles - 1; i > 0; i--) {
                const oldFile = path.join(this.config.logDir, `xerus.log.${i}`);
                const newFile = path.join(this.config.logDir, `xerus.log.${i + 1}`);
                
                try {
                    await fs.rename(oldFile, newFile);
                } catch (error) {
                    // File doesn't exist, skip
                }
            }

            // Move current log to .1
            const rotatedFile = path.join(this.config.logDir, 'xerus.log.1');
            await fs.rename(logFile, rotatedFile);
            
        } catch (error) {
            console.error('Log rotation failed:', error);
        }
    }

    /**
     * Set log level dynamically
     */
    setLevel(level) {
        if (typeof level === 'string') {
            level = LOG_LEVELS[level.toUpperCase()];
        }
        
        if (level !== undefined && level >= 0 && level <= LOG_LEVELS.NONE) {
            this.config.level = level;
            this.info('Log level changed', { newLevel: Object.keys(LOG_LEVELS)[level] });
        }
    }

    /**
     * Create child logger with component context
     */
    child(component) {
        return new ChildLogger(this, component);
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Shutdown logger gracefully
     */
    async shutdown() {
        this.info('Logger shutting down');
        
        // Process remaining queued logs
        await this.processLogQueue();
        
        // Wait a bit for any pending writes
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    /**
     * Start background processor for console queue
     */
    startBackgroundProcessor() {
        // Process console queue periodically to ensure logs don't get stuck
        setInterval(() => {
            if (this.consoleQueue.length > 0 && !this.isProcessingConsole) {
                this.processConsoleQueue().catch(error => {
                    // Silently handle background processor errors
                    if (error.code !== 'EPIPE') {
                        console.error('[Logger] Background processor error:', error.message);
                    }
                });
            }
        }, 100); // Check every 100ms
    }
}

/**
 * Child logger with component context
 */
class ChildLogger {
    constructor(parent, component) {
        this.parent = parent;
        this.component = component;
    }

    debug(message, meta = {}) {
        this.parent.debug(message, { ...meta, component: this.component });
    }

    info(message, meta = {}) {
        this.parent.info(message, { ...meta, component: this.component });
    }

    warn(message, meta = {}) {
        this.parent.warn(message, { ...meta, component: this.component });
    }

    error(message, meta = {}) {
        this.parent.error(message, { ...meta, component: this.component });
    }

    child(subComponent) {
        return new ChildLogger(this.parent, `${this.component}.${subComponent}`);
    }
}

// Create singleton instance
const logger = new Logger();

// Export both the logger instance and classes
module.exports = {
    logger,
    Logger,
    LOG_LEVELS,
    
    // Convenience methods for quick access
    debug: (message, meta) => logger.debug(message, meta),
    info: (message, meta) => logger.info(message, meta),
    warn: (message, meta) => logger.warn(message, meta),
    error: (message, meta) => logger.error(message, meta),
    
    // Create component loggers
    createLogger: (component) => logger.child(component)
};