/**
 * Integration Tests for Tools API Endpoints
 * TDD Implementation - Comprehensive API Route Testing
 * Test Agent 🧪
 */

const request = require('supertest');
const app = require('../../../server');
const { neonDB } = require('../../../database/connections/neon');

// Mock database for integration tests
jest.mock('../../../database/connections/neon');

describe('Tools API Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    neonDB.query.mockClear();
    neonDB.initialize = jest.fn().mockResolvedValue();
  });

  describe('GET /api/v1/tools', () => {
    it('should return list of tools', async () => {
      // Arrange
      const mockTools = [
        testUtils.createMockTool(),
        { 
          ...testUtils.createMockTool(), 
          id: 2, 
          tool_name: 'web_search',
          category: 'search',
          provider: 'perplexity'
        }
      ];
      neonDB.query.mockResolvedValue({ rows: mockTools });

      // Act
      const response = await request(app)
        .get('/api/v1/tools')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('tool_name');
      expect(response.body[0]).toHaveProperty('category');
    });

    it('should filter tools by category', async () => {
      // Arrange
      const mockTools = [testUtils.createMockTool()];
      neonDB.query.mockResolvedValue({ rows: mockTools });

      // Act
      const response = await request(app)
        .get('/api/v1/tools?category=utility')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      response.body.forEach(tool => {
        expect(tool.category).toBe('utility');
      });
    });

    it('should filter tools by enabled status', async () => {
      // Arrange
      const mockTools = [{ ...testUtils.createMockTool(), is_enabled: true }];
      neonDB.query.mockResolvedValue({ rows: mockTools });

      // Act
      const response = await request(app)
        .get('/api/v1/tools?is_enabled=true')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      response.body.forEach(tool => {
        expect(tool.is_enabled).toBe(true);
      });
    });

    it('should filter tools by provider', async () => {
      // Arrange
      const mockTools = [{ ...testUtils.createMockTool(), provider: 'perplexity' }];
      neonDB.query.mockResolvedValue({ rows: mockTools });

      // Act
      const response = await request(app)
        .get('/api/v1/tools?provider=perplexity')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      response.body.forEach(tool => {
        expect(tool.provider).toBe('perplexity');
      });
    });

    it('should require authentication', async () => {
      // Act & Assert
      await request(app)
        .get('/api/v1/tools')
        .expect(401);
    });
  });

  describe('GET /api/v1/tools/:toolName', () => {
    it('should return specific tool by name', async () => {
      // Arrange
      const toolName = 'calculator';
      const mockTool = { ...testUtils.createMockTool(), tool_name: toolName };
      neonDB.query.mockResolvedValue({ rows: [mockTool] });

      // Act
      const response = await request(app)
        .get(`/api/v1/tools/${toolName}`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toEqual(mockTool);
      expect(response.body.tool_name).toBe(toolName);
    });

    it('should return 404 when tool not found', async () => {
      // Arrange
      const toolName = 'non_existent_tool';
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await request(app)
        .get(`/api/v1/tools/${toolName}`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(404);
    });
  });

  describe('POST /api/v1/tools/:toolName/execute', () => {
    it('should execute internal tool successfully', async () => {
      // Arrange
      const toolName = 'calculator';
      const parameters = { expression: '2 + 3 * 4' };
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: toolName,
        tool_type: 'function',
        is_enabled: true
      };
      const mockResponse = {
        result: 14,
        expression: '2 + 3 * 4',
        execution_time: 50,
        success: true
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockTool] }) // Get tool
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Log execution
        .mockResolvedValueOnce({ rowCount: 1 }); // Update tool stats

      // Act
      const response = await request(app)
        .post(`/api/v1/tools/${toolName}/execute`)
        .set('Authorization', testUtils.createAuthToken())
        .send({ parameters })
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('result');
      expect(response.body).toHaveProperty('execution_time');
      expect(response.body.success).toBe(true);
    });

    it('should execute external API tool successfully', async () => {
      // Arrange
      const toolName = 'web_search';
      const parameters = { query: 'latest AI developments' };
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: toolName,
        tool_type: 'api',
        provider: 'perplexity',
        is_enabled: true
      };
      const mockResponse = {
        results: [
          { title: 'AI Development 1', url: 'https://example.com/1' },
          { title: 'AI Development 2', url: 'https://example.com/2' }
        ],
        execution_time: 1200,
        success: true
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockTool] }) // Get tool
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Log execution
        .mockResolvedValueOnce({ rowCount: 1 }); // Update tool stats

      // Act
      const response = await request(app)
        .post(`/api/v1/tools/${toolName}/execute`)
        .set('Authorization', testUtils.createAuthToken())
        .send({ parameters })
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('execution_time');
      expect(response.body.success).toBe(true);
    });

    it('should handle tool not found error', async () => {
      // Arrange
      const toolName = 'non_existent_tool';
      const parameters = { test: 'parameter' };
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const response = await request(app)
        .post(`/api/v1/tools/${toolName}/execute`)
        .set('Authorization', testUtils.createAuthToken())
        .send({ parameters })
        .expect(404);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Tool not found');
    });

    it('should handle disabled tool error', async () => {
      // Arrange
      const toolName = 'disabled_tool';
      const parameters = { test: 'parameter' };
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: toolName,
        is_enabled: false
      };
      neonDB.query.mockResolvedValue({ rows: [mockTool] });

      // Act
      const response = await request(app)
        .post(`/api/v1/tools/${toolName}/execute`)
        .set('Authorization', testUtils.createAuthToken())
        .send({ parameters })
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('disabled');
    });

    it('should validate required parameters', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/tools/calculator/execute')
        .set('Authorization', testUtils.createAuthToken())
        .send({}) // Missing parameters
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('parameters');
    });
  });

  describe('PUT /api/v1/tools/:toolName/config', () => {
    it('should update tool configuration successfully', async () => {
      // Arrange
      const toolName = 'web_search';
      const configData = {
        is_enabled: false,
        configuration: {
          api_key: 'new_api_key',
          timeout: 5000
        }
      };
      
      const mockUpdatedTool = { 
        ...testUtils.createMockTool(), 
        tool_name: toolName,
        ...configData,
        updated_at: '2025-01-21T11:00:00Z'
      };
      neonDB.query.mockResolvedValue({ rows: [mockUpdatedTool] });

      // Act
      const response = await request(app)
        .put(`/api/v1/tools/${toolName}/config`)
        .set('Authorization', testUtils.createAuthToken())
        .send(configData)
        .expect(200);

      // Assert
      expect(response.body.is_enabled).toBe(configData.is_enabled);
      expect(response.body.updated_at).toBeTruthy();
    });

    it('should return 404 when updating non-existent tool', async () => {
      // Arrange
      const toolName = 'non_existent_tool';
      const configData = { is_enabled: false };
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await request(app)
        .put(`/api/v1/tools/${toolName}/config`)
        .set('Authorization', testUtils.createAuthToken())
        .send(configData)
        .expect(404);
    });

    it('should validate configuration schema', async () => {
      // Arrange
      const toolName = 'web_search';
      const invalidConfigData = {
        configuration: 'invalid_string' // Should be object
      };

      // Act
      const response = await request(app)
        .put(`/api/v1/tools/${toolName}/config`)
        .set('Authorization', testUtils.createAuthToken())
        .send(invalidConfigData)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('configuration');
    });
  });

  describe('POST /api/v1/tools/:toolName/toggle', () => {
    it('should enable disabled tool', async () => {
      // Arrange
      const toolName = 'calculator';
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: toolName,
        is_enabled: false
      };
      const mockUpdatedTool = { 
        ...mockTool, 
        is_enabled: true,
        updated_at: '2025-01-21T11:00:00Z'
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockTool] }) // Get current tool
        .mockResolvedValueOnce({ rows: [mockUpdatedTool] }); // Update tool

      // Act
      const response = await request(app)
        .post(`/api/v1/tools/${toolName}/toggle`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body.is_enabled).toBe(true);
    });

    it('should disable enabled tool', async () => {
      // Arrange
      const toolName = 'calculator';
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: toolName,
        is_enabled: true
      };
      const mockUpdatedTool = { 
        ...mockTool, 
        is_enabled: false,
        updated_at: '2025-01-21T11:00:00Z'
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockTool] }) // Get current tool
        .mockResolvedValueOnce({ rows: [mockUpdatedTool] }); // Update tool

      // Act
      const response = await request(app)
        .post(`/api/v1/tools/${toolName}/toggle`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body.is_enabled).toBe(false);
    });

    it('should return 404 when tool not found', async () => {
      // Arrange
      const toolName = 'non_existent_tool';
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await request(app)
        .post(`/api/v1/tools/${toolName}/toggle`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(404);
    });
  });

  describe('GET /api/v1/tools/categories', () => {
    it('should return list of tool categories with counts', async () => {
      // Arrange
      const mockCategories = [
        { category: 'utility', tool_count: 5 },
        { category: 'search', tool_count: 3 },
        { category: 'ai', tool_count: 2 },
        { category: 'system', tool_count: 1 }
      ];
      neonDB.query.mockResolvedValue({ rows: mockCategories });

      // Act
      const response = await request(app)
        .get('/api/v1/tools/categories')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(4);
      response.body.forEach(category => {
        expect(category).toHaveProperty('category');
        expect(category).toHaveProperty('tool_count');
        expect(typeof category.tool_count).toBe('number');
      });
    });

    it('should return empty array when no tools exist', async () => {
      // Arrange
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const response = await request(app)
        .get('/api/v1/tools/categories')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/v1/tools/:toolName/analytics', () => {
    it('should return tool usage analytics', async () => {
      // Arrange
      const toolName = 'web_search';
      const mockAnalytics = {
        total_executions: 125,
        successful_executions: 118,
        failed_executions: 7,
        success_rate: 94.4,
        avg_execution_time: 850,
        last_execution: '2025-01-21T10:45:00Z',
        most_common_parameters: [
          { parameter: 'query', usage_count: 125 },
          { parameter: 'max_results', usage_count: 98 }
        ]
      };
      
      // Mock multiple queries for analytics
      neonDB.query
        .mockResolvedValueOnce({ rows: [{ 
          total_executions: 125,
          successful_executions: 118,
          failed_executions: 7,
          success_rate: 94.4,
          avg_execution_time: 850,
          last_execution: '2025-01-21T10:45:00Z'
        }] })
        .mockResolvedValueOnce({ rows: [
          { parameter: 'query', usage_count: '125' },
          { parameter: 'max_results', usage_count: '98' }
        ] });

      // Act
      const response = await request(app)
        .get(`/api/v1/tools/${toolName}/analytics`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('total_executions');
      expect(response.body).toHaveProperty('success_rate');
      expect(response.body).toHaveProperty('most_common_parameters');
      expect(response.body.total_executions).toBe(125);
      expect(response.body.success_rate).toBe(94.4);
    });

    it('should handle tool with no executions', async () => {
      // Arrange
      const toolName = 'unused_tool';
      const mockEmptyAnalytics = {
        total_executions: 0,
        successful_executions: 0,
        failed_executions: 0,
        success_rate: 0,
        avg_execution_time: 0,
        last_execution: null,
        most_common_parameters: []
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockEmptyAnalytics] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      const response = await request(app)
        .get(`/api/v1/tools/${toolName}/analytics`)
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body.total_executions).toBe(0);
      expect(response.body.last_execution).toBeNull();
      expect(response.body.most_common_parameters).toEqual([]);
    });
  });

  describe('GET /api/v1/tools/analytics', () => {
    it('should return comprehensive analytics for all tools', async () => {
      // Arrange
      const mockGlobalAnalytics = {
        total_tools: 11,
        enabled_tools: 9,
        disabled_tools: 2,
        total_executions: 2150,
        successful_executions: 2018,
        failed_executions: 132,
        global_success_rate: 93.9,
        most_used_tools: [
          { tool_name: 'web_search', execution_count: 745 },
          { tool_name: 'calculator', execution_count: 512 },
          { tool_name: 'system_info', execution_count: 298 }
        ],
        category_distribution: {
          utility: 5,
          search: 3,
          ai: 2,
          system: 1
        }
      };
      
      // Mock multiple queries for global analytics
      neonDB.query
        .mockResolvedValueOnce({ rows: [{ 
          total_tools: 11,
          enabled_tools: 9,
          disabled_tools: 2,
          total_executions: 2150,
          successful_executions: 2018,
          failed_executions: 132,
          global_success_rate: 93.9
        }] })
        .mockResolvedValueOnce({ rows: [
          { tool_name: 'web_search', execution_count: '745' },
          { tool_name: 'calculator', execution_count: '512' },
          { tool_name: 'system_info', execution_count: '298' }
        ] })
        .mockResolvedValueOnce({ rows: [
          { category: 'utility', count: '5' },
          { category: 'search', count: '3' },
          { category: 'ai', count: '2' },
          { category: 'system', count: '1' }
        ] });

      // Act
      const response = await request(app)
        .get('/api/v1/tools/analytics')
        .set('Authorization', testUtils.createAuthToken())
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('total_tools');
      expect(response.body).toHaveProperty('enabled_tools');
      expect(response.body).toHaveProperty('global_success_rate');
      expect(response.body).toHaveProperty('most_used_tools');
      expect(response.body).toHaveProperty('category_distribution');
      expect(response.body.total_tools).toBe(11);
      expect(response.body.most_used_tools).toHaveLength(3);
    });
  });
});