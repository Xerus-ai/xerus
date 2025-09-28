/**
 * Tool Configuration Management API Tests
 * Backend Dev Agent 💻 - TDD Implementation
 * Test suite for enhanced tool configuration management
 */

const request = require('supertest');
const app = require('../../../server');
const { neonDB } = require('../../../database/connections/neon');

describe('Tool Configuration Management API', () => {
  let authToken;
  let testToolName;

  beforeEach(async () => {
    // Set up authentication for tests
    authToken = 'test-admin-token';
    testToolName = `test-tool-${Date.now()}`;

    // Create a test tool configuration
    await neonDB.query(`
      INSERT INTO tool_configurations (
        tool_name, description, category, tool_type, provider,
        version, is_enabled, configuration, rate_limit, permissions, 
        created_at, updated_at
      )
      VALUES ($1, 'Test tool', 'utility', 'function', 'internal', '1.0.0', 
              true, '{"test": "value"}'::jsonb, '{"requests_per_minute": 10}'::jsonb, 
              ARRAY['tools:execute'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [testToolName]);
  });

  afterEach(async () => {
    // Clean up test data
    await neonDB.query('DELETE FROM tool_configurations WHERE tool_name = $1', [testToolName]);
    await neonDB.query('DELETE FROM tool_executions WHERE tool_name = $1', [testToolName]);
  });

  describe('GET /api/v1/tools/:toolName/configuration', () => {
    it('should get tool configuration with schema', async () => {
      const response = await request(app)
        .get(`/api/v1/tools/${testToolName}/configuration`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('tool_name', testToolName);
      expect(response.body).toHaveProperty('configuration');
      expect(response.body).toHaveProperty('schema');
      expect(response.body).toHaveProperty('isValid');
      expect(response.body.configuration).not.toHaveProperty('apiKey'); // Should be masked
    });

    it('should get tool configuration with secrets when requested', async () => {
      // First update tool with secret
      await neonDB.query(
        'UPDATE tool_configurations SET configuration = $1 WHERE tool_name = $2',
        [JSON.stringify({ apiKey: 'secret123', test: 'value' }), testToolName]
      );

      const response = await request(app)
        .get(`/api/v1/tools/${testToolName}/configuration`)
        .query({ include_secrets: 'true' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.configuration).toHaveProperty('apiKey', 'secret123');
    });

    it('should return 404 for non-existent tool', async () => {
      const response = await request(app)
        .get('/api/v1/tools/non-existent-tool/configuration')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/tools/:toolName/configuration', () => {
    it('should update tool configuration with validation', async () => {
      const updateData = {
        description: 'Updated test tool',
        configuration: {
          test: 'updated',
          newField: 'added'
        }
      };

      const response = await request(app)
        .put(`/api/v1/tools/${testToolName}/configuration`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Tool configuration updated successfully');
      expect(response.body.tool).toHaveProperty('description', 'Updated test tool');
      expect(response.body.tool.configuration).toHaveProperty('test', 'updated');
      expect(response.body.tool.configuration).toHaveProperty('newField', 'added');
    });

    it('should validate configuration without saving when validate_only=true', async () => {
      const updateData = {
        configuration: {
          invalidField: 'should cause warning'
        }
      };

      const response = await request(app)
        .put(`/api/v1/tools/${testToolName}/configuration`)
        .query({ validate_only: 'true' })
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Configuration validation completed');
      expect(response.body.validation_result).toHaveProperty('isValid');
      expect(response.body.validation_result).toHaveProperty('configuration');
    });

    it('should return validation error for invalid configuration', async () => {
      // Mock a tool with required fields
      await neonDB.query(
        'UPDATE tool_configurations SET tool_name = $1 WHERE tool_name = $2',
        ['perplexity', testToolName]
      );

      const updateData = {
        configuration: {
          // Missing required apiKey for perplexity tool
          maxResults: 5
        }
      };

      const response = await request(app)
        .put('/api/v1/tools/perplexity/configuration')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/tools/:toolName/configuration/validate', () => {
    it('should validate configuration without saving', async () => {
      const configData = {
        configuration: {
          test: 'value',
          validField: true
        }
      };

      const response = await request(app)
        .post(`/api/v1/tools/${testToolName}/configuration/validate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(configData)
        .expect(200);

      expect(response.body).toHaveProperty('tool_name', testToolName);
      expect(response.body).toHaveProperty('validation');
      expect(response.body.validation).toHaveProperty('isValid');
      expect(response.body.validation).toHaveProperty('errors');
      expect(response.body.validation).toHaveProperty('warnings');
    });
  });

  describe('GET /api/v1/tools/:toolName/schema', () => {
    it('should get configuration schema for a tool', async () => {
      const response = await request(app)
        .get(`/api/v1/tools/perplexity/schema`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('tool_name', 'perplexity');
      expect(response.body).toHaveProperty('schema');
      expect(response.body.schema).toHaveProperty('required');
      expect(response.body.schema).toHaveProperty('optional');
      expect(response.body.schema).toHaveProperty('defaults');
    });
  });

  describe('GET /api/v1/tools/templates', () => {
    it('should get available configuration templates', async () => {
      const response = await request(app)
        .get('/api/v1/tools/templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(response.body).toHaveProperty('total_templates');
      expect(Array.isArray(response.body.templates)).toBe(true);
      expect(response.body.templates.length).toBeGreaterThan(0);

      const template = response.body.templates[0];
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('template');
      expect(template).toHaveProperty('schema');
    });
  });

  describe('POST /api/v1/tools/create-from-template', () => {
    it('should create new tool from template', async () => {
      const newToolName = `new-tool-${Date.now()}`;
      const createData = {
        tool_name: newToolName,
        template_type: 'utility-tool',
        custom_config: {
          description: 'Created from template',
          configuration: {
            customField: 'customValue'
          }
        }
      };

      const response = await request(app)
        .post('/api/v1/tools/create-from-template')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Tool configuration created successfully');
      expect(response.body.tool).toHaveProperty('tool_name', newToolName);
      expect(response.body.tool).toHaveProperty('category', 'utility');
      expect(response.body.tool.configuration).toHaveProperty('customField', 'customValue');

      // Clean up
      await neonDB.query('DELETE FROM tool_configurations WHERE tool_name = $1', [newToolName]);
    });

    it('should return validation error for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/tools/create-from-template')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tool_name: 'test' }) // Missing template_type
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/tools/bulk-update', () => {
    let secondToolName;

    beforeEach(async () => {
      secondToolName = `test-tool-2-${Date.now()}`;
      await neonDB.query(`
        INSERT INTO tool_configurations (
          tool_name, description, category, tool_type, provider,
          version, is_enabled, configuration, rate_limit, permissions,
          created_at, updated_at
        )
        VALUES ($1, 'Second test tool', 'utility', 'function', 'internal', '1.0.0',
                true, '{"test": "value2"}'::jsonb, '{"requests_per_minute": 10}'::jsonb,
                ARRAY['tools:execute'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [secondToolName]);
    });

    afterEach(async () => {
      await neonDB.query('DELETE FROM tool_configurations WHERE tool_name = $1', [secondToolName]);
    });

    it('should perform bulk update of tool configurations', async () => {
      const updates = [
        {
          toolName: testToolName,
          configuration: {
            description: 'Bulk updated 1',
            configuration: { bulkUpdate: true }
          }
        },
        {
          toolName: secondToolName,
          configuration: {
            description: 'Bulk updated 2',
            configuration: { bulkUpdate: true }
          }
        }
      ];

      const response = await request(app)
        .post('/api/v1/tools/bulk-update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ updates })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Bulk update completed');
      expect(response.body).toHaveProperty('successful', 2);
      expect(response.body).toHaveProperty('failed', 0);
      expect(response.body.results).toHaveLength(2);
    });

    it('should handle partial failures in bulk update', async () => {
      const updates = [
        {
          toolName: testToolName,
          configuration: { description: 'Valid update' }
        },
        {
          toolName: 'non-existent-tool',
          configuration: { description: 'This should fail' }
        }
      ];

      const response = await request(app)
        .post('/api/v1/tools/bulk-update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ updates })
        .expect(200);

      expect(response.body.successful).toBe(1);
      expect(response.body.failed).toBe(1);
      expect(response.body.errors).toHaveLength(1);
    });
  });

  describe('POST /api/v1/tools/export', () => {
    it('should export tool configurations in JSON format', async () => {
      const response = await request(app)
        .post('/api/v1/tools/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          tool_names: [testToolName],
          include_secrets: false,
          format: 'json'
        })
        .expect(200);

      expect(response.body).toHaveProperty('export_date');
      expect(response.body).toHaveProperty('total_tools', 1);
      expect(response.body).toHaveProperty('configurations');
      expect(response.body.configurations).toHaveLength(1);
      expect(response.body.configurations[0]).toHaveProperty('tool_name', testToolName);

      // Check that secrets are masked
      expect(response.body.configurations[0].configuration).not.toHaveProperty('apiKey');
    });

    it('should export with secrets when requested', async () => {
      // Add secret to test tool
      await neonDB.query(
        'UPDATE tool_configurations SET configuration = $1 WHERE tool_name = $2',
        [JSON.stringify({ apiKey: 'secret123', test: 'value' }), testToolName]
      );

      const response = await request(app)
        .post('/api/v1/tools/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          tool_names: [testToolName],
          include_secrets: true,
          format: 'json'
        })
        .expect(200);

      expect(response.body.configurations[0].configuration).toHaveProperty('apiKey', 'secret123');
    });

    it('should export in YAML format', async () => {
      const response = await request(app)
        .post('/api/v1/tools/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          tool_names: [testToolName],
          format: 'yaml'
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/yaml; charset=utf-8');
      expect(response.text).toContain(testToolName);
      expect(response.text).toContain('category: utility');
    });
  });

  describe('POST /api/v1/tools/import', () => {
    let importToolName;

    beforeEach(() => {
      importToolName = `import-tool-${Date.now()}`;
    });

    afterEach(async () => {
      await neonDB.query('DELETE FROM tool_configurations WHERE tool_name = $1', [importToolName]);
    });

    it('should validate configurations without importing', async () => {
      const configurations = [
        {
          tool_name: importToolName,
          description: 'Imported tool',
          category: 'utility',
          tool_type: 'function',
          provider: 'internal',
          version: '1.0.0',
          is_enabled: true,
          configuration: {
            test: 'import'
          }
        }
      ];

      const response = await request(app)
        .post('/api/v1/tools/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          configurations,
          validate_only: true
        })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Configuration validation completed');
      expect(response.body.successful).toBe(1);
      expect(response.body.failed).toBe(0);

      // Verify tool was not actually created
      const checkResult = await neonDB.query('SELECT * FROM tool_configurations WHERE tool_name = $1', [importToolName]);
      expect(checkResult.rows).toHaveLength(0);
    });

    it('should import new tool configurations', async () => {
      const configurations = [
        {
          tool_name: importToolName,
          description: 'Imported tool',
          category: 'utility',
          tool_type: 'function',
          provider: 'internal',
          version: '1.0.0',
          is_enabled: true,
          configuration: {
            test: 'import'
          }
        }
      ];

      const response = await request(app)
        .post('/api/v1/tools/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          configurations,
          validate_only: false
        })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Import completed');
      expect(response.body.successful).toBe(1);
      expect(response.body.failed).toBe(0);

      // Verify tool was created
      const checkResult = await neonDB.query('SELECT * FROM tool_configurations WHERE tool_name = $1', [importToolName]);
      expect(checkResult.rows).toHaveLength(1);
      expect(checkResult.rows[0]).toHaveProperty('description', 'Imported tool');
    });

    it('should handle import errors gracefully', async () => {
      const configurations = [
        {
          tool_name: importToolName,
          description: 'Valid tool',
          category: 'utility'
        },
        {
          // Missing required tool_name
          description: 'Invalid tool'
        }
      ];

      const response = await request(app)
        .post('/api/v1/tools/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configurations })
        .expect(200);

      expect(response.body.successful).toBe(1);
      expect(response.body.failed).toBe(1);
      expect(response.body.errors).toHaveLength(1);
    });

    it('should not overwrite existing tools by default', async () => {
      const configurations = [
        {
          tool_name: testToolName,
          description: 'Overwritten description',
          configuration: {
            overwritten: true
          }
        }
      ];

      const response = await request(app)
        .post('/api/v1/tools/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configurations })
        .expect(200);

      expect(response.body.successful).toBe(0);
      expect(response.body.failed).toBe(1);
      expect(response.body.errors[0].error).toContain('already exists');
    });

    it('should overwrite existing tools when requested', async () => {
      const configurations = [
        {
          tool_name: testToolName,
          description: 'Overwritten description',
          configuration: {
            overwritten: true
          }
        }
      ];

      const response = await request(app)
        .post('/api/v1/tools/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          configurations,
          overwrite_existing: true
        })
        .expect(200);

      expect(response.body.successful).toBe(1);
      expect(response.body.failed).toBe(0);

      // Verify tool was updated
      const checkResult = await neonDB.query('SELECT * FROM tool_configurations WHERE tool_name = $1', [testToolName]);
      expect(checkResult.rows[0]).toHaveProperty('description', 'Overwritten description');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for configuration endpoints', async () => {
      await request(app)
        .get(`/api/v1/tools/${testToolName}/configuration`)
        .expect(401);
    });

    it('should require proper permissions for admin endpoints', async () => {
      const userToken = 'test-user-token'; // Non-admin token

      await request(app)
        .post('/api/v1/tools/export')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ tool_names: [testToolName] })
        .expect(403);
    });
  });
});