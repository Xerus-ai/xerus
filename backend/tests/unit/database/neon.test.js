/**
 * Unit Tests for Neon Database Connection
 * TDD Implementation - Backend Separation Project
 * Test Agent 🧪
 */

// Mock @neondatabase/serverless
const mockQuery = jest.fn();
const mockNeon = jest.fn(() => mockQuery);
const mockPool = jest.fn().mockImplementation(() => ({
  query: mockQuery,
  end: jest.fn(),
  on: jest.fn()
}));

jest.mock('@neondatabase/serverless', () => ({
  neon: mockNeon,
  Pool: mockPool
}));

const { neonDB, initializeDatabase, healthCheck } = require('../../../database/connections/neon');

describe('Neon Database Connection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_xerus';
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  describe('initializeDatabase', () => {
    it('should initialize database connection successfully', async () => {
      // Arrange - TDD RED Phase
      mockQuery.mockResolvedValue({ rows: [{ now: '2025-01-21T10:00:00Z' }] });

      // Act - TDD GREEN Phase
      const result = await initializeDatabase();

      // Assert - TDD REFACTOR Phase
      expect(result).toBe(true);
      expect(mockNeon).toHaveBeenCalledWith(process.env.DATABASE_URL);
      expect(mockQuery).toHaveBeenCalledWith('SELECT NOW() as now');
    });

    it('should handle missing DATABASE_URL environment variable', async () => {
      // Arrange
      delete process.env.DATABASE_URL;

      // Act & Assert
      await expect(initializeDatabase()).rejects.toThrow('DATABASE_URL environment variable is required');
    });

    it('should handle database connection failure', async () => {
      // Arrange
      const connectionError = new Error('Connection refused');
      mockQuery.mockRejectedValue(connectionError);

      // Act & Assert
      await expect(initializeDatabase()).rejects.toThrow('Connection refused');
    });

    it('should validate DATABASE_URL format', async () => {
      // Arrange
      process.env.DATABASE_URL = 'invalid_url_format';

      // Act & Assert
      await expect(initializeDatabase()).rejects.toThrow('Invalid DATABASE_URL format');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is accessible', async () => {
      // Arrange
      mockQuery.mockResolvedValue({ 
        rows: [{ 
          version: 'PostgreSQL 17.0',
          current_database: 'xerus',
          active_connections: 5
        }] 
      });

      // Act
      const result = await healthCheck();

      // Assert
      expect(result).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        database: {
          version: 'PostgreSQL 17.0',
          current_database: 'xerus',
          active_connections: 5
        },
        response_time: expect.any(Number)
      });
      expect(result.response_time).toBeLessThan(5000); // Should be under 5 seconds
    });

    it('should return unhealthy status when database is inaccessible', async () => {
      // Arrange
      const dbError = new Error('Connection timeout');
      mockQuery.mockRejectedValue(dbError);

      // Act
      const result = await healthCheck();

      // Assert
      expect(result).toEqual({
        status: 'unhealthy',
        timestamp: expect.any(String),
        error: 'Connection timeout',
        response_time: expect.any(Number)
      });
    });

    it('should measure response time accurately', async () => {
      // Arrange
      mockQuery.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({ rows: [{ version: 'PostgreSQL 17.0' }] }), 100)
        )
      );

      // Act
      const result = await healthCheck();

      // Assert
      expect(result.status).toBe('healthy');
      expect(result.response_time).toBeGreaterThan(90); // At least 90ms due to timeout
      expect(result.response_time).toBeLessThan(200); // But under 200ms
    });
  });

  describe('neonDB.query', () => {
    it('should execute simple SELECT query successfully', async () => {
      // Arrange
      const mockResults = { 
        rows: [
          { id: 1, name: 'Test Agent', personality_type: 'assistant' },
          { id: 2, name: 'Expert Agent', personality_type: 'technical' }
        ]
      };
      mockQuery.mockResolvedValue(mockResults);

      // Act
      const result = await neonDB.query('SELECT * FROM agents');

      // Assert
      expect(result).toEqual(mockResults);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM agents');
    });

    it('should execute parameterized query successfully', async () => {
      // Arrange
      const mockResults = { 
        rows: [{ id: 1, name: 'Test Agent', personality_type: 'assistant' }]
      };
      mockQuery.mockResolvedValue(mockResults);

      // Act
      const result = await neonDB.query('SELECT * FROM agents WHERE id = $1', [1]);

      // Assert
      expect(result).toEqual(mockResults);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM agents WHERE id = $1', [1]);
    });

    it('should execute INSERT query and return created record', async () => {
      // Arrange
      const mockResults = { 
        rows: [{ id: 3, name: 'New Agent', personality_type: 'assistant', created_at: '2025-01-21T10:00:00Z' }]
      };
      mockQuery.mockResolvedValue(mockResults);

      // Act
      const result = await neonDB.query(
        'INSERT INTO agents (name, personality_type) VALUES ($1, $2) RETURNING *',
        ['New Agent', 'assistant']
      );

      // Assert
      expect(result).toEqual(mockResults);
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO agents (name, personality_type) VALUES ($1, $2) RETURNING *',
        ['New Agent', 'assistant']
      );
    });

    it('should execute UPDATE query and return affected rows count', async () => {
      // Arrange
      const mockResults = { rowCount: 1 };
      mockQuery.mockResolvedValue(mockResults);

      // Act
      const result = await neonDB.query(
        'UPDATE agents SET name = $1 WHERE id = $2',
        ['Updated Agent', 1]
      );

      // Assert
      expect(result).toEqual(mockResults);
      expect(result.rowCount).toBe(1);
    });

    it('should execute DELETE query and return affected rows count', async () => {
      // Arrange
      const mockResults = { rowCount: 1 };
      mockQuery.mockResolvedValue(mockResults);

      // Act
      const result = await neonDB.query('DELETE FROM agents WHERE id = $1', [1]);

      // Assert
      expect(result).toEqual(mockResults);
      expect(result.rowCount).toBe(1);
    });

    it('should handle SQL syntax errors', async () => {
      // Arrange
      const sqlError = new Error('syntax error at or near "INVALID"');
      mockQuery.mockRejectedValue(sqlError);

      // Act & Assert
      await expect(neonDB.query('INVALID SQL QUERY')).rejects.toThrow('syntax error at or near "INVALID"');
    });

    it('should handle database constraint violations', async () => {
      // Arrange
      const constraintError = new Error('duplicate key value violates unique constraint "agents_name_key"');
      mockQuery.mockRejectedValue(constraintError);

      // Act & Assert
      await expect(neonDB.query(
        'INSERT INTO agents (name, personality_type) VALUES ($1, $2)',
        ['Duplicate Agent', 'assistant']
      )).rejects.toThrow('duplicate key value violates unique constraint');
    });

    it('should handle connection timeout errors', async () => {
      // Arrange
      const timeoutError = new Error('connection timeout');
      mockQuery.mockRejectedValue(timeoutError);

      // Act & Assert
      await expect(neonDB.query('SELECT * FROM agents')).rejects.toThrow('connection timeout');
    });

    it('should sanitize SQL parameters to prevent injection', async () => {
      // Arrange
      const mockResults = { rows: [] };
      mockQuery.mockResolvedValue(mockResults);
      const maliciousInput = "'; DROP TABLE agents; --";

      // Act
      await neonDB.query('SELECT * FROM agents WHERE name = $1', [maliciousInput]);

      // Assert - Verify parameterized query was used (no SQL injection)
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM agents WHERE name = $1',
        ["'; DROP TABLE agents; --"]
      );
      // The malicious input should be treated as a literal string parameter
    });
  });

  describe('neonDB transaction support', () => {
    it('should execute queries within transaction scope', async () => {
      // Arrange
      const mockTransactionResults = [
        { rows: [{ id: 1 }] }, // Insert agent
        { rows: [{ id: 1 }] }, // Insert agent_execution
        { rowCount: 1 }        // Update usage stats
      ];
      
      mockQuery
        .mockResolvedValueOnce({ rows: [{}] }) // BEGIN
        .mockResolvedValueOnce(mockTransactionResults[0])
        .mockResolvedValueOnce(mockTransactionResults[1])
        .mockResolvedValueOnce(mockTransactionResults[2])
        .mockResolvedValueOnce({ rows: [{}] }); // COMMIT

      // Act - Simulate transaction
      await neonDB.query('BEGIN');
      const agent = await neonDB.query('INSERT INTO agents (name) VALUES ($1) RETURNING id', ['Test Agent']);
      const execution = await neonDB.query('INSERT INTO agent_executions (agent_id, input) VALUES ($1, $2) RETURNING id', [1, 'test input']);
      const stats = await neonDB.query('UPDATE agents SET execution_count = execution_count + 1 WHERE id = $1', [1]);
      await neonDB.query('COMMIT');

      // Assert
      expect(mockQuery).toHaveBeenCalledTimes(5);
      expect(mockQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockQuery).toHaveBeenNthCalledWith(5, 'COMMIT');
      expect(agent.rows[0]).toHaveProperty('id');
      expect(execution.rows[0]).toHaveProperty('id');
      expect(stats.rowCount).toBe(1);
    });

    it('should rollback transaction on error', async () => {
      // Arrange
      const transactionError = new Error('Foreign key constraint violation');
      mockQuery
        .mockResolvedValueOnce({ rows: [{}] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert agent
        .mockRejectedValueOnce(transactionError) // Failed insert
        .mockResolvedValueOnce({ rows: [{}] }); // ROLLBACK

      // Act & Assert
      await neonDB.query('BEGIN');
      await neonDB.query('INSERT INTO agents (name) VALUES ($1) RETURNING id', ['Test Agent']);
      
      try {
        await neonDB.query('INSERT INTO invalid_table (id) VALUES ($1)', [1]);
      } catch (error) {
        await neonDB.query('ROLLBACK');
        expect(error.message).toBe('Foreign key constraint violation');
      }

      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('connection pooling and performance', () => {
    it('should handle multiple concurrent queries efficiently', async () => {
      // Arrange
      const mockResults = { rows: [{ id: 1, name: 'Test' }] };
      mockQuery.mockResolvedValue(mockResults);

      // Act - Execute multiple queries concurrently
      const queries = Array.from({ length: 10 }, (_, i) => 
        neonDB.query('SELECT * FROM agents WHERE id = $1', [i + 1])
      );
      
      const results = await Promise.all(queries);

      // Assert
      expect(results).toHaveLength(10);
      expect(mockQuery).toHaveBeenCalledTimes(10);
      results.forEach(result => {
        expect(result).toEqual(mockResults);
      });
    });

    it('should handle connection pool exhaustion gracefully', async () => {
      // Arrange - Simulate connection pool exhaustion
      const poolError = new Error('Connection pool exhausted');
      mockQuery.mockRejectedValue(poolError);

      // Act & Assert
      await expect(neonDB.query('SELECT * FROM agents')).rejects.toThrow('Connection pool exhausted');
    });
  });

  describe('database migrations and schema validation', () => {
    it('should validate table existence', async () => {
      // Arrange
      const mockTableCheck = { 
        rows: [
          { table_name: 'agents' },
          { table_name: 'knowledge_base' },
          { table_name: 'tool_configurations' }
        ]
      };
      mockQuery.mockResolvedValue(mockTableCheck);

      // Act
      const result = await neonDB.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `);

      // Assert
      expect(result.rows).toHaveLength(3);
      expect(result.rows.map(row => row.table_name)).toContain('agents');
      expect(result.rows.map(row => row.table_name)).toContain('knowledge_base');
      expect(result.rows.map(row => row.table_name)).toContain('tool_configurations');
    });

    it('should validate column existence and types', async () => {
      // Arrange
      const mockColumnCheck = { 
        rows: [
          { column_name: 'id', data_type: 'integer' },
          { column_name: 'name', data_type: 'character varying' },
          { column_name: 'personality_type', data_type: 'character varying' },
          { column_name: 'created_at', data_type: 'timestamp with time zone' }
        ]
      };
      mockQuery.mockResolvedValue(mockColumnCheck);

      // Act
      const result = await neonDB.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'agents'
      `);

      // Assert
      expect(result.rows).toHaveLength(4);
      expect(result.rows.find(col => col.column_name === 'id').data_type).toBe('integer');
      expect(result.rows.find(col => col.column_name === 'name').data_type).toBe('character varying');
    });
  });
});