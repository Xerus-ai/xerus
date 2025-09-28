/**
 * Global Error Handler Middleware
 * Backend Dev Agent 💻 - Standalone Backend Service
 */

const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] [ErrorHandler]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'error.log' })
  ]
});

/**
 * Global error handling middleware
 * Catches all unhandled errors and returns consistent error responses
 */
const errorHandler = (err, req, res, next) => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Log the error with context
  const errorContext = {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  logger.error('Unhandled error caught by global handler', errorContext);

  // Determine error type and set appropriate response
  let statusCode = 500;
  let errorResponse = {
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    requestId: req.id || generateRequestId()
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorResponse.error = 'Validation Error';
    errorResponse.message = err.message;
    errorResponse.details = err.details || null;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorResponse.error = 'Unauthorized';
    errorResponse.message = err.message || 'Authentication required';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorResponse.error = 'Forbidden';
    errorResponse.message = err.message || 'Insufficient permissions';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    errorResponse.error = 'Not Found';
    errorResponse.message = err.message || 'Resource not found';
  } else if (err.name === 'ConflictError') {
    statusCode = 409;
    errorResponse.error = 'Conflict';
    errorResponse.message = err.message || 'Resource conflict';
  } else if (err.name === 'DatabaseError') {
    statusCode = 503;
    errorResponse.error = 'Service Unavailable';
    errorResponse.message = 'Database service temporarily unavailable';
    // Don't expose database errors in production
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.details = err.message;
    }
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    errorResponse.error = 'Payload Too Large';
    errorResponse.message = 'File size exceeds maximum allowed limit';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    errorResponse.error = 'Bad Request';
    errorResponse.message = 'Invalid JSON payload';
  } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    statusCode = 503;
    errorResponse.error = 'Service Unavailable';
    errorResponse.message = 'External service unavailable';
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.raw = err;
  }

  // Handle async errors
  if (err.name === 'AsyncError') {
    statusCode = 500;
    errorResponse.error = 'Async Operation Failed';
    errorResponse.message = err.message || 'Asynchronous operation encountered an error';
  }

  // Handle rate limiting errors
  if (err.type === 'RateLimitError') {
    statusCode = 429;
    errorResponse.error = 'Too Many Requests';
    errorResponse.message = 'Rate limit exceeded. Please try again later.';
    errorResponse.retryAfter = err.retryAfter || 60;
  }

  // Set security headers for error responses
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async error handler wrapper
 * Wraps async route handlers to catch rejected promises
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Create custom error classes for better error handling
 */
class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends Error {
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

class ConflictError extends Error {
  constructor(message = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

class DatabaseError extends Error {
  constructor(message = 'Database operation failed') {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * Generate unique request ID for error tracking
 */
const generateRequestId = () => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

/**
 * 404 handler for unknown routes
 */
const notFoundHandler = (req, res) => {
  const error = {
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /health',
      'GET /api/v1',
      'GET /api/v1/agents',
      'POST /api/v1/agents',
      'GET /api/v1/knowledge',
      'POST /api/v1/knowledge',
      'GET /api/v1/tools',
      'POST /api/v1/tools/:toolName/execute'
    ]
  };

  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  res.status(404).json(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DatabaseError
};