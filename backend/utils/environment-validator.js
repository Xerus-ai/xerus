/**
 * Backend Environment Variable Validator
 * Validates required environment variables for the backend service
 */

const { backendLogger: logger } = require('./production-logger');

/**
 * Backend-specific environment validation
 */
class BackendEnvironmentValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.validated = false;
  }

  /**
   * Validate required environment variables
   */
  validateRequired(variables) {
    const missing = variables.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      const error = `Missing required environment variables: ${missing.join(', ')}`;
      this.errors.push(error);
      logger.error(error);
    }

    return missing.length === 0;
  }

  /**
   * Validate database connection string
   */
  validateDatabaseUrl() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      this.errors.push('DATABASE_URL is required');
      return false;
    }

    if (!url.startsWith('postgresql://')) {
      this.errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
      return false;
    }

    // Validate it contains required components
    try {
      const parsed = new URL(url);
      if (!parsed.hostname || !parsed.pathname) {
        this.errors.push('DATABASE_URL must contain hostname and database name');
        return false;
      }
    } catch (error) {
      this.errors.push(`Invalid DATABASE_URL format: ${error.message}`);
      return false;
    }

    return true;
  }

  /**
   * Validate API keys
   */
  validateApiKeys() {
    const requiredKeys = [
      { name: 'OPENAI_API_KEY', prefix: 'sk-' },
      { name: 'DEEPGRAM_API_KEY', prefix: null }
    ];

    const optionalKeys = [
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'PERPLEXITY_API_KEY',
      'FIRECRAWL_API_KEY',
      'TRAVILY_API_KEY',
      'ELEVENLABS_API_KEY',
      'HUME_API_KEY'
    ];

    // Check required keys
    requiredKeys.forEach(({ name, prefix }) => {
      const value = process.env[name];
      if (!value) {
        this.errors.push(`${name} is required`);
        return;
      }

      if (prefix && !value.startsWith(prefix)) {
        this.errors.push(`${name} must start with ${prefix}`);
      }

      if (value.length < 20) {
        this.errors.push(`${name} appears to be too short`);
      }
    });

    // Warn about optional keys
    optionalKeys.forEach(name => {
      if (!process.env[name]) {
        this.warnings.push(`${name} not set - some features may be disabled`);
      }
    });
  }

  /**
   * Validate server configuration
   */
  validateServerConfig() {
    // Port validation
    const port = process.env.PORT || process.env.BACKEND_PORT;
    if (port && (isNaN(port) || port < 1 || port > 65535)) {
      this.errors.push('PORT/BACKEND_PORT must be a valid port number (1-65535)');
    }

    // JWT Secret validation
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      this.errors.push('JWT_SECRET is required for authentication');
    } else if (jwtSecret.length < 32) {
      this.warnings.push('JWT_SECRET should be at least 32 characters for security');
    }

    // Node environment validation
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv && !['development', 'production', 'test'].includes(nodeEnv)) {
      this.warnings.push('NODE_ENV should be one of: development, production, test');
    }
  }

  /**
   * Validate Firebase configuration (if used)
   */
  validateFirebaseConfig() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    
    if (projectId) {
      logger.info('Firebase configuration detected, validating...');
      
      // If project ID is set, we're using Firebase
      const serviceKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (!serviceKey && process.env.NODE_ENV === 'production') {
        this.errors.push('FIREBASE_SERVICE_ACCOUNT_KEY required when using Firebase in production');
      }
    }
  }

  /**
   * Validate all backend environment variables
   */
  validateBackendEnvironment() {
    logger.info('Starting backend environment validation...');

    // Core database requirements
    this.validateRequired(['DATABASE_URL', 'NEON_PROJECT_ID']);
    this.validateDatabaseUrl();

    // API keys
    this.validateApiKeys();

    // Server configuration
    this.validateServerConfig();

    // Firebase (optional)
    this.validateFirebaseConfig();

    this.validated = true;

    // Log results
    if (this.errors.length > 0) {
      logger.error(`Backend environment validation failed with ${this.errors.length} errors`);
      this.errors.forEach(error => logger.error(error));
      return false;
    }

    if (this.warnings.length > 0) {
      logger.warn(`Backend environment validation completed with ${this.warnings.length} warnings`);
      this.warnings.forEach(warning => logger.warn(warning));
    } else {
      logger.info('Backend environment validation passed');
    }

    return true;
  }

  /**
   * Get validation results
   */
  getResults() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      validated: this.validated
    };
  }

  /**
   * Throw error if validation failed
   */
  throwIfInvalid() {
    if (this.errors.length > 0) {
      throw new Error(`Backend environment validation failed:\n${this.errors.join('\n')}`);
    }
  }
}

// Create singleton instance
const backendValidator = new BackendEnvironmentValidator();

// Auto-validate on import in non-test environments
if (process.env.NODE_ENV !== 'test') {
  try {
    const isValid = backendValidator.validateBackendEnvironment();
    if (!isValid && process.env.NODE_ENV === 'production') {
      logger.error('Critical environment validation failed in production');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Critical environment validation error:', error.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

module.exports = {
  BackendEnvironmentValidator,
  backendValidator
};