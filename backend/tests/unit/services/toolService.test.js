/**
 * Unit Tests for ToolService
 * TDD Implementation - Backend Separation Project
 * Test Agent 🧪
 */

const ToolService = require('../../../services/toolService');
const { neonDB } = require('../../../database/connections/neon');

// Mock database connection
jest.mock('../../../database/connections/neon');

describe('ToolService', () => {
  let toolService;

  beforeEach(() => {
    toolService = new ToolService();
    jest.clearAllMocks();
  });

  describe('getTools', () => {
    it('should return list of tools with default filters', async () => {
      // Arrange - TDD RED Phase
      const mockTools = [
        testUtils.createMockTool(),
        { 
          ...testUtils.createMockTool(), 
          id: 2, 
          tool_name: 'web_search', 
          category: 'search',
          tool_type: 'api'
        }
      ];
      neonDB.query.mockResolvedValue({ rows: mockTools });

      // Act - TDD GREEN Phase
      const result = await toolService.getTools({});

      // Assert - TDD REFACTOR Phase
      expect(result).toEqual(mockTools);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tool_configurations WHERE 1=1 ORDER BY category, tool_name LIMIT $1 OFFSET $2'),
        [50, 0]
      );
    });

    it('should filter tools by category', async () => {
      // Arrange
      const filters = { category: 'utility' };
      const mockTools = [testUtils.createMockTool()];
      neonDB.query.mockResolvedValue({ rows: mockTools });

      // Act
      const result = await toolService.getTools(filters);

      // Assert
      expect(result).toEqual(mockTools);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tool_configurations WHERE 1=1 AND category = $1 ORDER BY category, tool_name LIMIT $2 OFFSET $3'),
        ['utility', 50, 0]
      );
    });

    it('should filter tools by enabled status', async () => {
      // Arrange
      const filters = { is_enabled: true };
      const mockTools = [testUtils.createMockTool()];
      neonDB.query.mockResolvedValue({ rows: mockTools });

      // Act
      const result = await toolService.getTools(filters);

      // Assert
      expect(result).toEqual(mockTools);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tool_configurations WHERE 1=1 AND is_enabled = $1 ORDER BY category, tool_name LIMIT $2 OFFSET $3'),
        [true, 50, 0]
      );
    });

    it('should filter tools by provider', async () => {
      // Arrange
      const filters = { provider: 'perplexity' };
      const mockTools = [{ ...testUtils.createMockTool(), provider: 'perplexity' }];
      neonDB.query.mockResolvedValue({ rows: mockTools });

      // Act
      const result = await toolService.getTools(filters);

      // Assert
      expect(result).toEqual(mockTools);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tool_configurations WHERE 1=1 AND provider = $1 ORDER BY category, tool_name LIMIT $2 OFFSET $3'),
        ['perplexity', 50, 0]
      );
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      neonDB.query.mockRejectedValue(dbError);

      // Act & Assert
      await expect(toolService.getTools({})).rejects.toThrow('Database connection failed');
    });

    it('should return empty array when no tools found', async () => {
      // Arrange
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await toolService.getTools({});

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getToolByName', () => {
    it('should return tool by name', async () => {
      // Arrange
      const toolName = 'test_tool';
      const mockTool = testUtils.createMockTool();
      neonDB.query.mockResolvedValue({ rows: [mockTool] });

      // Act
      const result = await toolService.getToolByName(toolName);

      // Assert
      expect(result).toEqual(mockTool);
      expect(neonDB.query).toHaveBeenCalledWith(
        'SELECT * FROM tool_configurations WHERE tool_name = $1',
        [toolName]
      );
    });

    it('should return null when tool not found', async () => {
      // Arrange
      const toolName = 'nonexistent_tool';
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await toolService.getToolByName(toolName);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('executeTool', () => {
    it('should execute internal tool successfully', async () => {
      // Arrange
      const toolName = 'calculator';
      const parameters = { expression: '2 + 3 * 4' };
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: 'calculator',
        tool_type: 'function'
      };
      const mockResponse = { 
        result: 14,
        execution_time: 50,
        success: true
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockTool] }) // Get tool config
        .mockResolvedValueOnce({ rows: [{ id: 789 }] }); // Log execution

      // Mock internal tool execution
      toolService.internalTools = {
        calculator: jest.fn().mockResolvedValue(mockResponse)
      };

      // Act
      const result = await toolService.executeTool(toolName, parameters);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(toolService.internalTools.calculator).toHaveBeenCalledWith(parameters);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tool_executions'),
        expect.arrayContaining([toolName, parameters, true])
      );
    });

    it('should execute external API tool successfully', async () => {
      // Arrange
      const toolName = 'web_search';
      const parameters = { query: 'latest AI developments' };
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: 'web_search',
        tool_type: 'api',
        provider: 'perplexity',
        configuration: { api_key: 'test_key' }
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
        .mockResolvedValueOnce({ rows: [mockTool] }) // Get tool config
        .mockResolvedValueOnce({ rows: [{ id: 789 }] }); // Log execution

      // Mock external API call
      toolService.externalProviders = {
        perplexity: {
          search: jest.fn().mockResolvedValue(mockResponse)
        }
      };

      // Act
      const result = await toolService.executeTool(toolName, parameters);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(toolService.externalProviders.perplexity.search).toHaveBeenCalledWith(parameters);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tool_executions'),
        expect.arrayContaining([toolName, parameters, true])
      );
    });

    it('should handle tool not found error', async () => {
      // Arrange
      const toolName = 'nonexistent_tool';
      const parameters = {};
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await expect(toolService.executeTool(toolName, parameters)).rejects.toThrow('Tool not found');
    });

    it('should handle disabled tool error', async () => {
      // Arrange
      const toolName = 'disabled_tool';
      const parameters = {};
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: 'disabled_tool',
        is_enabled: false
      };
      neonDB.query.mockResolvedValue({ rows: [mockTool] });

      // Act & Assert
      await expect(toolService.executeTool(toolName, parameters)).rejects.toThrow('Tool is disabled');
    });

    it('should handle tool execution failure', async () => {
      // Arrange
      const toolName = 'failing_tool';
      const parameters = { test: 'parameter' };
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: 'failing_tool',
        tool_type: 'function'
      };
      const executionError = new Error('Tool execution failed');
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockTool] }) // Get tool config
        .mockResolvedValueOnce({ rows: [{ id: 789 }] }); // Log execution

      toolService.internalTools = {
        failing_tool: jest.fn().mockRejectedValue(executionError)
      };

      // Act & Assert
      await expect(toolService.executeTool(toolName, parameters)).rejects.toThrow('Tool execution failed');
      
      // Verify error is logged
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tool_executions'),
        expect.arrayContaining([toolName, parameters, false])
      );
    });

    it('should validate required parameters', async () => {
      // Arrange
      const toolName = 'calculator';
      const emptyParameters = {};

      // Act & Assert
      await expect(toolService.executeTool(toolName, emptyParameters)).rejects.toThrow('Parameters cannot be empty');
    });
  });

  describe('updateToolConfiguration', () => {
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
        tool_name: 'web_search',
        ...configData,
        updated_at: '2025-01-21T11:00:00Z'
      };
      neonDB.query.mockResolvedValue({ rows: [mockUpdatedTool] });

      // Act
      const result = await toolService.updateToolConfiguration(toolName, configData);

      // Assert
      expect(result).toEqual(mockUpdatedTool);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tool_configurations SET'),
        expect.arrayContaining([configData.is_enabled, configData.configuration, toolName])
      );
    });

    it('should return null when tool not found', async () => {
      // Arrange
      const toolName = 'nonexistent_tool';
      const configData = { is_enabled: false };
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await toolService.updateToolConfiguration(toolName, configData);

      // Assert
      expect(result).toBeNull();
    });

    it('should validate configuration schema', async () => {
      // Arrange
      const toolName = 'web_search';
      const invalidConfigData = {
        configuration: 'invalid_config_should_be_object'
      };

      // Act & Assert
      await expect(toolService.updateToolConfiguration(toolName, invalidConfigData)).rejects.toThrow('Configuration must be an object');
    });
  });

  describe('toggleTool', () => {
    it('should enable disabled tool', async () => {
      // Arrange
      const toolName = 'disabled_tool';
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: 'disabled_tool',
        is_enabled: false
      };
      const mockToggleResult = { 
        ...mockTool, 
        is_enabled: true,
        updated_at: '2025-01-21T11:00:00Z'
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockTool] }) // Get current tool
        .mockResolvedValueOnce({ rows: [mockToggleResult] }); // Update tool

      // Act
      const result = await toolService.toggleTool(toolName);

      // Assert
      expect(result).toEqual(mockToggleResult);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tool_configurations SET is_enabled = $1'),
        [true, toolName]
      );
    });

    it('should disable enabled tool', async () => {
      // Arrange
      const toolName = 'enabled_tool';
      const mockTool = { 
        ...testUtils.createMockTool(), 
        tool_name: 'enabled_tool',
        is_enabled: true
      };
      const mockToggleResult = { 
        ...mockTool, 
        is_enabled: false,
        updated_at: '2025-01-21T11:00:00Z'
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockTool] }) // Get current tool
        .mockResolvedValueOnce({ rows: [mockToggleResult] }); // Update tool

      // Act
      const result = await toolService.toggleTool(toolName);

      // Assert
      expect(result).toEqual(mockToggleResult);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tool_configurations SET is_enabled = $1'),
        [false, toolName]
      );
    });

    it('should return null when tool not found', async () => {
      // Arrange
      const toolName = 'nonexistent_tool';
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await toolService.toggleTool(toolName);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getToolCategories', () => {
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
      const result = await toolService.getToolCategories();

      // Assert
      expect(result).toEqual(mockCategories);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT category, COUNT(*) as tool_count FROM tool_configurations GROUP BY category')
      );
    });

    it('should return empty array when no tools exist', async () => {
      // Arrange
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await toolService.getToolCategories();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getToolAnalytics', () => {
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
      
      neonDB.query.mockResolvedValue({ rows: [mockAnalytics] });

      // Act
      const result = await toolService.getToolAnalytics(toolName);

      // Assert
      expect(result).toEqual(mockAnalytics);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as total_executions'),
        [toolName]
      );
    });

    it('should handle tool with no executions', async () => {
      // Arrange
      const toolName = 'unused_tool';
      const mockAnalytics = {
        total_executions: 0,
        successful_executions: 0,
        failed_executions: 0,
        success_rate: 0,
        avg_execution_time: 0,
        last_execution: null,
        most_common_parameters: []
      };
      
      neonDB.query.mockResolvedValue({ rows: [mockAnalytics] });

      // Act
      const result = await toolService.getToolAnalytics(toolName);

      // Assert
      expect(result).toEqual(mockAnalytics);
    });
  });

  describe('getAllToolsAnalytics', () => {
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
      
      neonDB.query.mockResolvedValue({ rows: [mockGlobalAnalytics] });

      // Act
      const result = await toolService.getAllToolsAnalytics();

      // Assert
      expect(result).toEqual(mockGlobalAnalytics);
    });
  });
});