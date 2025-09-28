/**
 * XERUS RENDERER LOGGER
 * Browser-safe logging for renderer processes
 * 
 * This is a lightweight version of the main logger that works in the browser context
 * without Node.js dependencies like 'fs' and 'path'
 */

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
 * Renderer Logger Configuration
 */
const DEFAULT_CONFIG = {
    level: process?.env?.NODE_ENV === 'production' ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG,
    enableConsole: true,
    format: 'detailed' // 'simple' | 'detailed' | 'json'
};

class RendererLogger {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
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

        // Console output (always enabled in renderer)
        if (this.config.enableConsole) {
            this.outputToConsole(logEntry);
        }

        // Send to main process if IPC is available
        if (window?.api?.logger) {
            try {
                window.api.logger.log(level, message, meta);
            } catch (error) {
                // Fallback to console if IPC fails
                console.warn('Failed to send log to main process:', error);
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
            process: 'renderer',
            component: meta.component || 'renderer'
        };
    }

    /**
     * Output log to console with formatting
     */
    outputToConsole(logEntry) {
        const { timestamp, level, message, meta, component } = logEntry;
        
        // Color codes for different levels
        const colors = {
            DEBUG: '#36bcd4', // Cyan
            INFO: '#52c41a',  // Green
            WARN: '#faad14',  // Yellow
            ERROR: '#f5222d'  // Red
        };
        
        // Format based on configuration
        if (this.config.format === 'simple') {
            console.log(`%c[${level}] ${message}`, `color: ${colors[level]}`);
        } else if (this.config.format === 'json') {
            console.log('Renderer Log:', logEntry);
        } else {
            // Detailed format
            const timeStr = timestamp.substring(11, 23); // HH:MM:SS.sss
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            console.log(
                `%c[${timeStr}] [${level}] [${component}]%c ${message}${metaStr}`,
                `color: ${colors[level]}; font-weight: bold`,
                'color: inherit; font-weight: normal'
            );
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
            this.info('Renderer log level changed', { newLevel: Object.keys(LOG_LEVELS)[level] });
        }
    }

    /**
     * Create child logger with component context
     */
    child(component) {
        return new RendererChildLogger(this, component);
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}

/**
 * Child logger with component context
 */
class RendererChildLogger {
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
        return new RendererChildLogger(this.parent, `${this.component}.${subComponent}`);
    }
}

// Create singleton instance
const rendererLogger = new RendererLogger();

// Export both the logger instance and classes
module.exports = {
    logger: rendererLogger,
    RendererLogger,
    LOG_LEVELS,
    
    // Convenience methods for quick access
    debug: (message, meta) => rendererLogger.debug(message, meta),
    info: (message, meta) => rendererLogger.info(message, meta),
    warn: (message, meta) => rendererLogger.warn(message, meta),
    error: (message, meta) => rendererLogger.error(message, meta),
    
    // Create component loggers
    createLogger: (component) => rendererLogger.child(component)
};