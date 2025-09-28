/**
 * XERUS TOOL CONFIGURATION SERVICE
 * Enhanced tool configuration management system
 * Backend Dev Agent 💻 - Advanced Configuration Management
 */

const { neonDB } = require('../database/connections/neon');

class ToolConfigurationService {
  constructor() {
    this.configurationSchemas = {
      'web-search': {
        required: ['apiKey', 'maxResults'],
        optional: ['timeout', 'language', 'region'],
        defaults: { maxResults: 10, timeout: 5000, language: 'en' }
      },
      'perplexity': {
        required: ['apiKey'],
        optional: ['model', 'maxTokens', 'temperature'],
        defaults: { model: 'llama-3.1-sonar-small-128k-online', maxTokens: 1000, temperature: 0.2 }
      },
      'calculator': {
        required: [],
        optional: ['precision', 'allowedOperations'],
        defaults: { precision: 10, allowedOperations: ['add', 'subtract', 'multiply', 'divide'] }
      },
      'system-info': {
        required: [],
        optional: ['includeMetrics', 'refreshInterval'],
        defaults: { includeMetrics: true, refreshInterval: 30000 }
      }
    };

    this.configurationTemplates = {
      'search-tool': {
        category: 'search',
        tool_type: 'api',
        provider: 'external',
        configuration: {
          apiKey: '',
          maxResults: 10,
          timeout: 5000
        },
        rate_limit: {
          requests_per_minute: 30,
          requests_per_hour: 1000
        }
      },
      'utility-tool': {
        category: 'utility',
        tool_type: 'function',
        provider: 'internal',
        configuration: {},
        rate_limit: {
          requests_per_minute: 100,
          requests_per_hour: 5000
        }
      }
    };
  }

  /**
   * Get tool configuration with schema validation
   */
  async getToolConfiguration(toolName, includeSecrets = false) {
    try {
      const tool = await neonDB.query(
        'SELECT * FROM tool_configurations WHERE tool_name = $1',
        [toolName]
      );

      if (!tool.rows.length) {
        throw new Error('Tool configuration not found');
      }

      const config = tool.rows[0];
      const schema = this.configurationSchemas[toolName];

      if (!includeSecrets && config.configuration) {
        // Mask sensitive fields
        config.configuration = this.maskSensitiveFields(config.configuration);
      }

      // Add schema information
      config.schema = schema || { required: [], optional: [], defaults: {} };
      config.isValid = this.validateConfiguration(toolName, config.configuration);

      return config;
    } catch (error) {
      throw new Error(`Failed to get tool configuration: ${error.message}`);
    }
  }

  /**
   * Update tool configuration with validation
   */
  async updateToolConfiguration(toolName, configData, options = {}) {
    try {
      const { validateOnly = false, mergeWithExisting = true } = options;

      // Get existing configuration if merging
      let existingConfig = {};
      if (mergeWithExisting) {
        const existing = await this.getToolConfiguration(toolName, true);
        existingConfig = existing.configuration || {};
      }

      // Merge configurations
      const newConfiguration = {
        ...existingConfig,
        ...configData.configuration
      };

      // Validate configuration
      const validation = this.validateConfiguration(toolName, newConfiguration);
      if (!validation.isValid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      if (validateOnly) {
        return {
          isValid: true,
          configuration: newConfiguration,
          validation
        };
      }

      // Prepare update data
      const updateData = {
        ...configData,
        configuration: newConfiguration,
        updated_at: new Date()
      };

      // Build dynamic update query
      const setClause = [];
      const params = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updateData)) {
        if (key === 'configuration') {
          setClause.push(`${key} = $${paramIndex}::jsonb`);
          params.push(JSON.stringify(value));
        } else if (key !== 'updated_at') {
          setClause.push(`${key} = $${paramIndex}`);
          params.push(value);
        }
        paramIndex++;
      }

      setClause.push('updated_at = CURRENT_TIMESTAMP');
      params.push(toolName);

      const query = `
        UPDATE tool_configurations 
        SET ${setClause.join(', ')} 
        WHERE tool_name = $${paramIndex} 
        RETURNING *
      `;

      const result = await neonDB.query(query, params);
      
      if (!result.rows.length) {
        throw new Error('Tool not found');
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update tool configuration: ${error.message}`);
    }
  }

  /**
   * Create new tool configuration from template
   */
  async createToolConfiguration(toolName, templateType, customConfig = {}) {
    try {
      const template = this.configurationTemplates[templateType];
      if (!template) {
        throw new Error(`Template '${templateType}' not found`);
      }

      // Merge template with custom configuration
      const configuration = {
        ...template.configuration,
        ...customConfig.configuration
      };

      const toolConfig = {
        tool_name: toolName,
        description: customConfig.description || `${toolName} tool`,
        category: customConfig.category || template.category,
        tool_type: customConfig.tool_type || template.tool_type,
        provider: customConfig.provider || template.provider,
        version: customConfig.version || '1.0.0',
        is_enabled: customConfig.is_enabled !== undefined ? customConfig.is_enabled : true,
        configuration,
        rate_limit: customConfig.rate_limit || template.rate_limit,
        permissions: customConfig.permissions || ['tools:execute']
      };

      // Validate configuration
      const validation = this.validateConfiguration(toolName, configuration);
      if (!validation.isValid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      const query = `
        INSERT INTO tool_configurations (
          tool_name, description, category, tool_type, provider, version,
          is_enabled, configuration, rate_limit, permissions, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;

      const result = await neonDB.query(query, [
        toolConfig.tool_name,
        toolConfig.description,
        toolConfig.category,
        toolConfig.tool_type,
        toolConfig.provider,
        toolConfig.version,
        toolConfig.is_enabled,
        JSON.stringify(toolConfig.configuration),
        JSON.stringify(toolConfig.rate_limit),
        toolConfig.permissions
      ]);

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to create tool configuration: ${error.message}`);
    }
  }

  /**
   * Validate tool configuration against schema
   */
  validateConfiguration(toolName, configuration) {
    const schema = this.configurationSchemas[toolName];
    
    if (!schema) {
      return {
        isValid: true,
        warnings: ['No validation schema found for this tool'],
        errors: []
      };
    }

    const errors = [];
    const warnings = [];

    // Check required fields
    for (const required of schema.required) {
      if (!(required in configuration) || configuration[required] === null || configuration[required] === '') {
        errors.push(`Required field '${required}' is missing or empty`);
      }
    }

    // Check field types and constraints
    for (const [field, value] of Object.entries(configuration)) {
      if (this.isAllowedField(toolName, field)) {
        const fieldErrors = this.validateField(toolName, field, value);
        errors.push(...fieldErrors);
      } else {
        warnings.push(`Unknown configuration field '${field}'`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get configuration templates
   */
  getConfigurationTemplates() {
    return Object.keys(this.configurationTemplates).map(templateType => ({
      name: templateType,
      template: this.configurationTemplates[templateType],
      schema: this.getTemplateSchema(templateType)
    }));
  }

  /**
   * Get configuration schema for a tool
   */
  getConfigurationSchema(toolName) {
    const schema = this.configurationSchemas[toolName];
    return schema || { required: [], optional: [], defaults: {} };
  }

  /**
   * Bulk update tool configurations
   */
  async bulkUpdateConfigurations(updates) {
    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const result = await this.updateToolConfiguration(
          update.toolName,
          update.configuration,
          update.options || {}
        );
        results.push({ toolName: update.toolName, success: true, result });
      } catch (error) {
        errors.push({ toolName: update.toolName, success: false, error: error.message });
      }
    }

    return {
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Export tool configurations
   */
  async exportConfigurations(toolNames = null, options = {}) {
    try {
      const { includeSecrets = false, format = 'json' } = options;
      
      let query = 'SELECT * FROM tool_configurations';
      const params = [];

      if (toolNames && toolNames.length > 0) {
        query += ' WHERE tool_name = ANY($1)';
        params.push(toolNames);
      }

      query += ' ORDER BY category, tool_name';

      const result = await neonDB.query(query, params);
      let configurations = result.rows;

      if (!includeSecrets) {
        configurations = configurations.map(config => ({
          ...config,
          configuration: this.maskSensitiveFields(config.configuration)
        }));
      }

      if (format === 'yaml') {
        // Convert to YAML format (requires yaml library in production)
        return this.convertToYaml(configurations);
      }

      return configurations;
    } catch (error) {
      throw new Error(`Failed to export configurations: ${error.message}`);
    }
  }

  /**
   * Import tool configurations
   */
  async importConfigurations(configurationsData, options = {}) {
    try {
      const { validateOnly = false, overwriteExisting = false } = options;
      const results = [];
      const errors = [];

      for (const config of configurationsData) {
        try {
          // Check if tool exists
          const existing = await this.getToolConfiguration(config.tool_name, true).catch(() => null);
          
          if (existing && !overwriteExisting) {
            errors.push({
              toolName: config.tool_name,
              error: 'Tool already exists and overwrite is disabled'
            });
            continue;
          }

          if (validateOnly) {
            const validation = this.validateConfiguration(config.tool_name, config.configuration);
            results.push({
              toolName: config.tool_name,
              isValid: validation.isValid,
              validation
            });
          } else {
            if (existing) {
              // Update existing
              const result = await this.updateToolConfiguration(config.tool_name, config);
              results.push({ toolName: config.tool_name, action: 'updated', result });
            } else {
              // Create new (determine template from config)
              const templateType = this.determineTemplate(config);
              const result = await this.createToolConfiguration(config.tool_name, templateType, config);
              results.push({ toolName: config.tool_name, action: 'created', result });
            }
          }
        } catch (error) {
          errors.push({
            toolName: config.tool_name,
            error: error.message
          });
        }
      }

      return {
        successful: results.length,
        failed: errors.length,
        results,
        errors
      };
    } catch (error) {
      throw new Error(`Failed to import configurations: ${error.message}`);
    }
  }

  // Helper methods
  
  maskSensitiveFields(configuration) {
    const sensitiveFields = ['apiKey', 'secret', 'password', 'token'];
    const masked = { ...configuration };
    
    for (const field of sensitiveFields) {
      if (field in masked && masked[field]) {
        masked[field] = '***masked***';
      }
    }
    
    return masked;
  }

  isAllowedField(toolName, field) {
    const schema = this.configurationSchemas[toolName];
    if (!schema) return true; // Allow all fields if no schema
    
    return schema.required.includes(field) || schema.optional.includes(field);
  }

  validateField(toolName, field, value) {
    const errors = [];
    
    // Basic type validation
    if (field === 'apiKey' && typeof value !== 'string') {
      errors.push(`Field '${field}' must be a string`);
    }
    
    if (field === 'maxResults' && (!Number.isInteger(value) || value < 1 || value > 100)) {
      errors.push(`Field '${field}' must be an integer between 1 and 100`);
    }
    
    if (field === 'timeout' && (!Number.isInteger(value) || value < 1000 || value > 60000)) {
      errors.push(`Field '${field}' must be an integer between 1000 and 60000 milliseconds`);
    }
    
    return errors;
  }

  getTemplateSchema(templateType) {
    const template = this.configurationTemplates[templateType];
    if (!template) return null;
    
    return {
      properties: Object.keys(template.configuration),
      category: template.category,
      tool_type: template.tool_type,
      provider: template.provider
    };
  }

  determineTemplate(config) {
    if (config.tool_type === 'api') {
      return 'search-tool';
    }
    return 'utility-tool';
  }

  convertToYaml(configurations) {
    // Simplified YAML conversion - in production use proper YAML library
    return configurations.map(config => {
      return `${config.tool_name}:\n  category: ${config.category}\n  enabled: ${config.is_enabled}\n  configuration: ${JSON.stringify(config.configuration, null, 4).replace(/^/gm, '    ')}`;
    }).join('\n---\n');
  }
}

module.exports = ToolConfigurationService;