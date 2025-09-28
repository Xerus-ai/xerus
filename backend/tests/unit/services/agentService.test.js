/**
 * Unit Tests for AgentService
 * TDD Implementation - Backend Separation Project
 * Test Agent 🧪
 */

const AgentService = require('../../../services/agentService');
const { neonDB } = require('../../../database/connections/neon');

// Mock database connection
jest.mock('../../../database/connections/neon', () => ({
  neonDB: {
    query: jest.fn(),
    transaction: jest.fn(),
    initialize: jest.fn(),
    healthCheck: jest.fn()
  }
}));

describe('AgentService', () => {
  let agentService;

  beforeEach(() => {
    agentService = new AgentService();
    jest.clearAllMocks();
  });

  describe('getAgents', () => {
    it('should return list of agents with default filters', async () => {
      // Arrange - TDD RED Phase
      const mockAgents = [
        testUtils.createMockAgent(),
        { 
          ...testUtils.createMockAgent(), 
          id: 2, 
          name: 'Technical Expert', 
          personality_type: 'technical' 
        }
      ];
      neonDB.query.mockResolvedValue({ rows: mockAgents });

      // Act - TDD GREEN Phase 
      const result = await agentService.getAgents({});

      // Assert - TDD REFACTOR Phase
      expect(result).toEqual(mockAgents);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM agents'),
        [50, 0] // Default limit and offset
      );
    });

    it('should filter agents by personality type', async () => {
      // Arrange
      const filters = { personality_type: 'assistant' };
      const mockAgents = [testUtils.createMockAgent()];
      neonDB.query.mockResolvedValue({ rows: mockAgents });

      // Act
      const result = await agentService.getAgents(filters);

      // Assert
      expect(result).toEqual(mockAgents);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        ['assistant', 50, 0] // personality_type, limit, offset
      );
    });

    it('should filter agents by active status', async () => {
      // Arrange
      const filters = { is_active: true };
      const mockAgents = [testUtils.createMockAgent()];
      neonDB.query.mockResolvedValue({ rows: mockAgents });

      // Act
      const result = await agentService.getAgents(filters);

      // Assert
      expect(result).toEqual(mockAgents);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        [true, 50, 0] // is_active, limit, offset
      );
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      neonDB.query.mockRejectedValue(dbError);

      // Act & Assert
      await expect(agentService.getAgents({})).rejects.toThrow('Database connection failed');
    });

    it('should return empty array when no agents found', async () => {
      // Arrange
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await agentService.getAgents({});

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getAgentById', () => {
    it('should return agent by id', async () => {
      // Arrange
      const agentId = 1;
      const mockAgent = testUtils.createMockAgent();
      neonDB.query.mockResolvedValue({ rows: [mockAgent] });

      // Act
      const result = await agentService.getAgentById(agentId);

      // Assert
      expect(result).toEqual(mockAgent);
      expect(neonDB.query).toHaveBeenCalledWith(
        'SELECT * FROM agents WHERE id = $1',
        [agentId]
      );
    });

    it('should return null when agent not found', async () => {
      // Arrange
      const agentId = 999;
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await agentService.getAgentById(agentId);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle invalid agent id', async () => {
      // Arrange
      const invalidId = 'invalid';

      // Act & Assert
      await expect(agentService.getAgentById(invalidId)).rejects.toThrow('Invalid agent ID');
    });
  });

  describe('createAgent', () => {
    it('should create new agent successfully', async () => {
      // Arrange
      const agentData = {
        name: 'New Test Agent',
        personality_type: 'assistant',
        description: 'Test agent for unit testing',
        system_prompt: 'You are a helpful test assistant.',
        ai_model: 'gpt-4o'
      };
      const mockCreatedAgent = { 
        ...testUtils.createMockAgent(), 
        ...agentData, 
        id: 3 
      };
      neonDB.query.mockResolvedValue({ rows: [mockCreatedAgent] });

      // Act
      const result = await agentService.createAgent(agentData);

      // Assert
      expect(result).toEqual(mockCreatedAgent);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agents'),
        expect.arrayContaining([
          agentData.name,
          agentData.personality_type,
          agentData.description,
          agentData.system_prompt,
          agentData.ai_model
        ])
      );
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidAgentData = {
        personality_type: 'assistant'
        // Missing required 'name' field
      };

      // Act & Assert
      await expect(agentService.createAgent(invalidAgentData)).rejects.toThrow('Name is required');
    });

    it('should validate personality type enum', async () => {
      // Arrange
      const invalidAgentData = {
        name: 'Test Agent',
        personality_type: 'invalid_type'
      };

      // Act & Assert
      await expect(agentService.createAgent(invalidAgentData)).rejects.toThrow('Invalid personality type');
    });

    it('should set default values for optional fields', async () => {
      // Arrange
      const minimalAgentData = {
        name: 'Minimal Agent',
        personality_type: 'assistant'
      };
      const expectedDefaults = {
        ...minimalAgentData,
        description: null,
        system_prompt: 'You are a helpful AI assistant.',
        is_active: true,
        ai_model: 'gpt-4o'
      };
      
      neonDB.query.mockResolvedValue({ rows: [{ ...testUtils.createMockAgent(), ...expectedDefaults }] });

      // Act
      const result = await agentService.createAgent(minimalAgentData);

      // Assert
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agents'),
        expect.arrayContaining([
          minimalAgentData.name,
          minimalAgentData.personality_type,
          null, // description
          'You are a helpful AI assistant.', // default system_prompt
          'gpt-4o' // default ai_model
        ])
      );
    });
  });

  describe('updateAgent', () => {
    it('should update agent successfully', async () => {
      // Arrange
      const agentId = 1;
      const updateData = {
        name: 'Updated Agent',
        description: 'Updated description'
      };
      const mockUpdatedAgent = { 
        ...testUtils.createMockAgent(), 
        ...updateData,
        updated_at: '2025-01-21T11:00:00Z'
      };
      neonDB.query.mockResolvedValue({ rows: [mockUpdatedAgent] });

      // Act
      const result = await agentService.updateAgent(agentId, updateData);

      // Assert
      expect(result).toEqual(mockUpdatedAgent);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE agents SET'),
        expect.arrayContaining([updateData.name, updateData.description, agentId])
      );
    });

    it('should return null when agent not found', async () => {
      // Arrange
      const agentId = 999;
      const updateData = { name: 'Updated Agent' };
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await agentService.updateAgent(agentId, updateData);

      // Assert
      expect(result).toBeNull();
    });

    it('should validate update data', async () => {
      // Arrange
      const agentId = 1;
      const invalidUpdateData = { personality_type: 'invalid_type' };

      // Act & Assert
      await expect(agentService.updateAgent(agentId, invalidUpdateData)).rejects.toThrow('Invalid personality type');
    });
  });

  describe('deleteAgent', () => {
    it('should delete agent successfully', async () => {
      // Arrange
      const agentId = 1;
      neonDB.transaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rowCount: 1 }) // Delete executions
            .mockResolvedValueOnce({ rowCount: 1 }) // Delete knowledge access
            .mockResolvedValueOnce({ rowCount: 1 }) // Delete tools
            .mockResolvedValueOnce({ rowCount: 1 }) // Delete agent
        };
        return await callback(mockClient);
      });

      // Act
      const result = await agentService.deleteAgent(agentId);

      // Assert
      expect(result).toBe(true);
      expect(neonDB.transaction).toHaveBeenCalled();
    });

    it('should return false when agent not found', async () => {
      // Arrange
      const agentId = 999;
      neonDB.transaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rowCount: 0 }) // Delete executions
            .mockResolvedValueOnce({ rowCount: 0 }) // Delete knowledge access
            .mockResolvedValueOnce({ rowCount: 0 }) // Delete tools
            .mockResolvedValueOnce({ rowCount: 0 }) // Delete agent - not found
        };
        return await callback(mockClient);
      });

      // Act
      const result = await agentService.deleteAgent(agentId);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle cascade delete for related records', async () => {
      // Arrange
      const agentId = 1;
      neonDB.transaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rowCount: 2 }) // Delete agent_executions
            .mockResolvedValueOnce({ rowCount: 3 }) // Delete agent_knowledge_access
            .mockResolvedValueOnce({ rowCount: 1 }) // Delete agent_tools
            .mockResolvedValueOnce({ rowCount: 1 }) // Delete agent
        };
        return await callback(mockClient);
      });

      // Act
      const result = await agentService.deleteAgent(agentId);

      // Assert
      expect(result).toBe(true);
      expect(neonDB.transaction).toHaveBeenCalled();
    });
  });

  describe('executeAgent', () => {
    it('should execute agent and return response', async () => {
      // Arrange
      const agentId = 1;
      const input = 'What is machine learning?';
      const mockAgent = testUtils.createMockAgent();
      const mockResponse = { 
        response: 'Machine learning is a subset of AI that enables systems to learn and improve from data without being explicitly programmed.',
        execution_time: 1500,
        tokens_used: 150
      };
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockAgent] }) // Get agent
        .mockResolvedValueOnce({ rows: [{ id: 123 }] }); // Log execution

      // Mock AI provider response
      const mockAIResponse = {
        content: mockResponse.response,
        usage: { total_tokens: mockResponse.tokens_used }
      };
      
      // Mock AI provider call (would be injected as dependency)
      agentService.aiProvider = {
        generateResponse: jest.fn().mockResolvedValue(mockAIResponse)
      };

      // Act
      const result = await agentService.executeAgent(agentId, input);

      // Assert
      expect(result).toHaveProperty('response');
      expect(result.response).toContain('Agent Test Agent processed your request');
      expect(result).toHaveProperty('execution_time');
      expect(result).toHaveProperty('tokens_used');
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_executions'),
        expect.arrayContaining([agentId, input])
      );
    });

    it('should handle agent not found error', async () => {
      // Arrange
      const agentId = 999;
      const input = 'Test input';
      neonDB.query.mockResolvedValue({ rows: [] });

      // Act & Assert
      await expect(agentService.executeAgent(agentId, input)).rejects.toThrow('Agent not found');
    });

    it('should handle AI provider errors', async () => {
      // Arrange
      const agentId = 1;
      const input = 'Test input';
      const mockAgent = testUtils.createMockAgent();
      
      neonDB.query
        .mockResolvedValueOnce({ rows: [mockAgent] }) // Get agent
        .mockRejectedValueOnce(new Error('Database connection failed')); // Log execution fails

      // Act & Assert
      await expect(agentService.executeAgent(agentId, input)).rejects.toThrow('Database connection failed');
    });

    it('should validate input parameters', async () => {
      // Arrange
      const agentId = 1;
      const emptyInput = '';

      // Act & Assert
      await expect(agentService.executeAgent(agentId, emptyInput)).rejects.toThrow('Input cannot be empty');
    });
  });

  describe('getAgentAnalytics', () => {
    it('should return agent execution analytics', async () => {
      // Arrange
      const agentId = 1;
      const mockAnalytics = {
        total_executions: 25,
        avg_execution_time: 1200,
        total_tokens_used: 3750,
        success_rate: 96.0,
        last_execution: '2025-01-21T10:30:00Z'
      };
      
      neonDB.query.mockResolvedValue({ rows: [mockAnalytics] });

      // Act
      const result = await agentService.getAgentAnalytics(agentId);

      // Assert
      expect(result).toEqual(mockAnalytics);
      expect(neonDB.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [agentId]
      );
    });

    it('should handle agent with no executions', async () => {
      // Arrange
      const agentId = 1;
      const mockAnalytics = {
        total_executions: 0,
        avg_execution_time: 0,
        total_tokens_used: 0,
        success_rate: 0,
        last_execution: null
      };
      
      neonDB.query.mockResolvedValue({ rows: [mockAnalytics] });

      // Act
      const result = await agentService.getAgentAnalytics(agentId);

      // Assert
      expect(result).toEqual(mockAnalytics);
    });
  });
});