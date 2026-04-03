// Structured Logger
// Lightweight, zero-dependency structured logging with consistent format.
// Replaces raw console.* calls with level-aware, context-tagged output.
//
// Usage:
//   import { logger } from '../utils/logger';
//   const log = logger('SandboxService');
//   log.info('Sandbox created', { sandbox_id, user_id });
//   log.error('Failed to create sandbox', error);

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    module: string;
    message: string;
    timestamp: string;
    data?: Record<string, unknown>;
    error?: { message: string; stack?: string };
}

interface Logger {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, errorOrData?: Error | Record<string, unknown>): void;
    child(subModule: string): Logger;
}

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

function getMinLevel(): LogLevel {
    const env = process.env.LOG_LEVEL?.toLowerCase();
    if (env && env in LOG_LEVELS) return env as LogLevel;
    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function isJsonOutput(): boolean {
    return process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';
}

// -----------------------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------------------

function formatEntry(entry: LogEntry): string {
    if (isJsonOutput()) {
        return JSON.stringify(entry);
    }

    const tag = `[${entry.module}]`;
    const level = entry.level.toUpperCase().padEnd(5);
    const base = `${entry.timestamp} ${level} ${tag} ${entry.message}`;

    if (entry.error) {
        const stack = entry.error.stack ? `\n${entry.error.stack}` : '';
        return `${base} | error=${entry.error.message}${stack}`;
    }

    if (entry.data && Object.keys(entry.data).length > 0) {
        const pairs = Object.entries(entry.data)
            .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(' ');
        return `${base} | ${pairs}`;
    }

    return base;
}

// -----------------------------------------------------------------------------
// Logger Factory
// -----------------------------------------------------------------------------

function createLogger(module: string): Logger {
    function emit(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
        if (LOG_LEVELS[level] < LOG_LEVELS[getMinLevel()]) return;

        const entry: LogEntry = {
            level,
            module,
            message,
            timestamp: new Date().toISOString(),
        };

        if (data) entry.data = data;
        if (error) entry.error = { message: error.message, stack: error.stack };

        const formatted = formatEntry(entry);

        switch (level) {
            case 'debug':
            case 'info':
                console.log(formatted);
                break;
            case 'warn':
                console.warn(formatted);
                break;
            case 'error':
                console.error(formatted);
                break;
        }
    }

    return {
        debug: (message, data) => emit('debug', message, data),
        info: (message, data) => emit('info', message, data),
        warn: (message, data) => emit('warn', message, data),
        error: (message, errorOrData) => {
            if (errorOrData instanceof Error) {
                emit('error', message, undefined, errorOrData);
            } else {
                emit('error', message, errorOrData);
            }
        },
        child: (subModule) => createLogger(`${module}:${subModule}`),
    };
}

export { createLogger as logger, Logger, LogLevel };
