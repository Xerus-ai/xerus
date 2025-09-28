/**
 * Comprehensive Environment Variable Validator
 * Validates required environment variables and provides meaningful error messages
 */

const { logger } = require('./production-logger');

/**
 * Environment variable validation utility
 */
class EnvironmentValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.validated = false;
  }

  /**
   * Validate that required environment variables are present
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
   * Validate optional environment variables and warn if missing
   */
  validateOptional(variables) {
    const missing = variables.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      const warning = `Optional environment variables not set: ${missing.join(', ')}`;
      this.warnings.push(warning);
      logger.warn(warning);
    }

    return missing;
  }

  /**
   * Validate URL format
   */
  validateUrl(varName, expectedProtocol = null) {
    const value = process.env[varName];
    if (!value) return false;

    try {
      const url = new URL(value);
      if (expectedProtocol && url.protocol !== expectedProtocol) {
        const error = `${varName} must use ${expectedProtocol} protocol, got ${url.protocol}`;
        this.errors.push(error);
        logger.error(error);
        return false;
      }
      return true;
    } catch (error) {
      const errorMsg = `${varName} must be a valid URL: ${error.message}`;
      this.errors.push(errorMsg);
      logger.error(errorMsg);
      return false;
    }
  }

  /**
   * Validate API key format
   */
  validateApiKey(varName, expectedPrefix = null, minLength = 20) {
    const value = process.env[varName];
    if (!value) return false;

    if (value.length < minLength) {
      const error = `${varName} must be at least ${minLength} characters long`;
      this.errors.push(error);
      logger.error(error);
      return false;
    }

    if (expectedPrefix && !value.startsWith(expectedPrefix)) {
      const error = `${varName} must start with ${expectedPrefix}`;
      this.errors.push(error);
      logger.error(error);
      return false;
    }

    return true;
  }

  /**
   * Validate enum values
   */
  validateEnum(varName, allowedValues) {
    const value = process.env[varName];
    if (!value) return false;

    if (!allowedValues.includes(value)) {
      const error = `${varName} must be one of: ${allowedValues.join(', ')}`;
      this.errors.push(error);
      logger.error(error);
      return false;
    }

    return true;
  }

  /**
   * Validate boolean values
   */
  validateBoolean(varName) {
    const value = process.env[varName];
    if (!value) return true; // Optional boolean defaults to false

    const validValues = ['true', 'false', '1', '0', 'yes', 'no'];
    if (!validValues.includes(value.toLowerCase())) {
      const error = `${varName} must be a boolean value: ${validValues.join(', ')}`;
      this.errors.push(error);
      logger.error(error);
      return false;
    }

    return true;
  }

  /**
   * Validate numeric values
   */
  validateNumber(varName, min = null, max = null) {
    const value = process.env[varName];
    if (!value) return false;

    const num = Number(value);
    if (isNaN(num)) {
      const error = `${varName} must be a valid number`;
      this.errors.push(error);
      logger.error(error);
      return false;
    }

    if (min !== null && num < min) {
      const error = `${varName} must be >= ${min}`;
      this.errors.push(error);
      logger.error(error);
      return false;
    }

    if (max !== null && num > max) {
      const error = `${varName} must be <= ${max}`;
      this.errors.push(error);
      logger.error(error);
      return false;
    }

    return true;
  }

  /**
   * Validate all environment variables for the application
   */
  validateXerusEnvironment() {
    logger.info('Starting environment validation...');

    // Required variables
    this.validateRequired([
      'DATABASE_URL',
      'NEON_PROJECT_ID'
    ]);

    // API Keys (required for full functionality)
    const apiKeys = [
      { name: 'OPENAI_API_KEY', prefix: 'sk-' },
      { name: 'DEEPGRAM_API_KEY', prefix: null },
      { name: 'PERPLEXITY_API_KEY', prefix: 'pplx-' },
    ];

    apiKeys.forEach(({ name, prefix }) => {
      if (process.env[name]) {
        this.validateApiKey(name, prefix);
      } else {
        this.warnings.push(`${name} not set - some features may be disabled`);
      }
    });

    // Optional API Keys
    this.validateOptional([
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'FIRECRAWL_API_KEY',
      'TRAVILY_API_KEY',
      'ELEVENLABS_API_KEY',
      'HUME_API_KEY'
    ]);

    // URLs
    if (process.env.DATABASE_URL) {
      this.validateUrl('DATABASE_URL', 'postgresql:');
    }

    // Environment settings
    if (process.env.NODE_ENV) {
      this.validateEnum('NODE_ENV', ['development', 'production', 'test']);
    }

    // Boolean settings
    this.validateBoolean('DEBUG_MODE');
    this.validateBoolean('ELECTRON_ENABLE_LOGGING');
    this.validateBoolean('OPEN_DEV_TOOLS');
    this.validateBoolean('TELEMETRY_ENABLED');
    this.validateBoolean('ANALYTICS_ENABLED');

    // Numeric settings
    if (process.env.CONTEXT_WINDOW_SIZE) {
      this.validateNumber('CONTEXT_WINDOW_SIZE', 1000, 32000);
    }
    if (process.env.MEMORY_LIMIT) {
      this.validateNumber('MEMORY_LIMIT', 50, 1000);
    }
    if (process.env.CPU_LIMIT) {
      this.validateNumber('CPU_LIMIT', 1, 100);
    }

    this.validated = true;

    // Log results
    if (this.errors.length > 0) {
      logger.error(`Environment validation failed with ${this.errors.length} errors`);
      return false;
    }

    if (this.warnings.length > 0) {
      logger.warn(`Environment validation completed with ${this.warnings.length} warnings`);
    } else {
      logger.success('Environment validation passed');
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
      throw new Error(`Environment validation failed:\n${this.errors.join('\n')}`);
    }
  }

  /**
   * Reset validation state
   */
  reset() {
    this.errors = [];
    this.warnings = [];
    this.validated = false;
  }
}

// Create singleton instance
const validator = new EnvironmentValidator();

// Auto-validate on import in non-test environments
if (process.env.NODE_ENV !== 'test') {
  try {
    validator.validateXerusEnvironment();
  } catch (error) {
    logger.error('Critical environment validation error:', error.message);
    // Don't exit in development to allow graceful degradation
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

module.exports = {
  EnvironmentValidator,
  validator
};