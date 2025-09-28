/**
 * Integration Tests for Agent Data Manager
 * Tests SQLite + Neon PostgreSQL integration
 */

const { describe, it, beforeEach, afterEach, expect } = require('@jest/globals');
const { AgentDataManager, ConnectionRouter, SyncEngine } = require('../../src/services/agent-data-manager.js');

// Mock database connections
const mockNeonDB = {
    query: jest.fn(),
    healthCheck: jest.fn(),
    transaction: jest.fn()
};

const mockSQLiteConnection = {
    get: jest.fn(),
    all: jest.fn(),
    run: jest.fn()
};

// Mock logger
jest.mock('../../src/common/services/logger.js', () => ({
    createLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    })
}));

// Mock personality manager
jest.mock('../../src/services/agent-personality-manager.js', () => ({
    agentPersonalityManager: {
        initialized: false,
        initialize: jest.fn(),
        on: jest.fn()
    }
}));

describe('AgentDataManager Integration Tests', () => {
    let agentDataManager;
    let mockAgentData;

    beforeEach(() => {
        agentDataManager = new AgentDataManager();
        
        // Reset mocks
        jest.clearAllMocks();
        
        // Mock successful health checks
        mockNeonDB.healthCheck.mockResolvedValue({ status: 'healthy' });
        mockSQLiteConnection.get.mockResolvedValue({ test: 1 });
        
        // Sample agent data
        mockAgentData = {
            name: 'Test Agent',
            personality_type: 'assistant',
            description: 'Test agent for integration testing',
            system_prompt: 'You are a test AI assistant.',
            capabilities: ['text_generation', 'analysis'],
            response_style: { tone: 'professional' },
            is_active: true,
            ai_model: 'gpt-4o',
            model_preferences: { temperature: 0.7 },
            web_search_enabled: true,
            search_all_knowledge: false
        };
    });

    afterEach(async () => {
        if (agentDataManager.state.isInitialized) {
            await agentDataManager.shutdown();
        }
    });

    describe('Initialization', () => {
        it('should initialize successfully with both databases available', async () => {
            // Mock successful initialization
            mockNeonDB.query.mockResolvedValue({ rows: [] });
            mockSQLiteConnection.all.mockResolvedValue([]);

            await agentDataManager.initialize();

            expect(agentDataManager.state.isInitialized).toBe(true);
            expect(agentDataManager.state.connectionMode).toBe('hybrid');
            expect(agentDataManager.state.connectionHealth.postgresql).toBe(true);
            expect(agentDataManager.state.connectionHealth.sqlite).toBe(true);
        });

        it('should initialize with PostgreSQL only when SQLite unavailable', async () => {
            // Mock SQLite failure
            mockSQLiteConnection.get.mockRejectedValue(new Error('SQLite unavailable'));
            mockNeonDB.query.mockResolvedValue({ rows: [] });

            await agentDataManager.initialize();

            expect(agentDataManager.state.connectionMode).toBe('postgresql');
            expect(agentDataManager.state.connectionHealth.postgresql).toBe(true);
            expect(agentDataManager.state.connectionHealth.sqlite).toBe(false);
        });

        it('should initialize with SQLite only when PostgreSQL unavailable', async () => {
            // Mock PostgreSQL failure
            mockNeonDB.healthCheck.mockResolvedValue({ status: 'unhealthy' });
            mockSQLiteConnection.all.mockResolvedValue([]);

            await agentDataManager.initialize();

            expect(agentDataManager.state.connectionMode).toBe('sqlite');
            expect(agentDataManager.state.connectionHealth.postgresql).toBe(false);
            expect(agentDataManager.state.connectionHealth.sqlite).toBe(true);
        });
    });

    describe('Agent Operations', () => {
        beforeEach(async () => {
            // Initialize with hybrid mode
            mockNeonDB.query.mockResolvedValue({ rows: [] });
            mockSQLiteConnection.all.mockResolvedValue([]);
            await agentDataManager.initialize();
        });

        describe('Create Agent', () => {
            it('should create agent in PostgreSQL in hybrid mode', async () => {
                const mockCreatedAgent = { id: 1, ...mockAgentData, created_at: new Date() };
                mockNeonDB.query.mockResolvedValue({ rows: [mockCreatedAgent] });

                const result = await agentDataManager.createAgent(mockAgentData);

                expect(mockNeonDB.query).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT INTO agents'),
                    expect.arrayContaining([
                        mockAgentData.name,
                        mockAgentData.personality_type,
                        mockAgentData.description,
                        mockAgentData.system_prompt
                    ])
                );
                expect(result).toEqual(mockCreatedAgent);
                expect(agentDataManager.agentCache.has(1)).toBe(true);
            });

            it('should create agent in SQLite when PostgreSQL unavailable', async () => {
                // Simulate PostgreSQL failure
                agentDataManager.state.connectionHealth.postgresql = false;
                agentDataManager.state.connectionMode = 'sqlite';

                const mockCreatedAgent = { id: 1, ...mockAgentData };
                mockSQLiteConnection.run.mockResolvedValue({ lastID: 1, changes: 1 });
                mockSQLiteConnection.get.mockResolvedValue(mockCreatedAgent);

                const result = await agentDataManager.createAgent(mockAgentData);

                expect(mockSQLiteConnection.run).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT INTO agents'),
                    expect.arrayContaining([
                        mockAgentData.name,
                        mockAgentData.personality_type
                    ])
                );
                expect(result).toEqual(mockCreatedAgent);
            });
        });

        describe('Get Agents', () => {
            it('should retrieve agents from PostgreSQL by default', async () => {
                const mockAgents = [
                    { id: 1, name: 'Agent 1', personality_type: 'assistant' },
                    { id: 2, name: 'Agent 2', personality_type: 'technical' }
                ];
                mockNeonDB.query.mockResolvedValue({ rows: mockAgents });

                const result = await agentDataManager.getAllAgents();

                expect(mockNeonDB.query).toHaveBeenCalledWith(
                    expect.stringContaining('SELECT * FROM agents'),
                    expect.arrayContaining([50, 0]) // limit, offset
                );
                expect(result).toEqual(mockAgents);
            });

            it('should apply filters correctly', async () => {
                const filters = {
                    personality_type: 'technical',
                    is_active: true,
                    limit: 10,
                    offset: 5
                };

                mockNeonDB.query.mockResolvedValue({ rows: [] });

                await agentDataManager.getAllAgents(filters);

                expect(mockNeonDB.query).toHaveBeenCalledWith(
                    expect.stringMatching(/AND personality_type = \$1.*AND is_active = \$2/),
                    expect.arrayContaining(['technical', true, 10, 5])
                );
            });

            it('should fallback to cache when databases unavailable', async () => {
                // Add agent to cache
                const cachedAgent = { id: 1, name: 'Cached Agent', personality_type: 'assistant' };
                agentDataManager.agentCache.set(1, cachedAgent);

                // Simulate database failures
                agentDataManager.state.connectionHealth.postgresql = false;
                agentDataManager.state.connectionHealth.sqlite = false;
                agentDataManager.state.connectionMode = 'memory';

                const result = await agentDataManager.getAllAgents();

                expect(result).toEqual([cachedAgent]);
            });
        });

        describe('Get Agent By ID', () => {
            it('should return agent from cache if available', async () => {
                const cachedAgent = { id: 1, name: 'Cached Agent' };
                agentDataManager.agentCache.set(1, cachedAgent);

                const result = await agentDataManager.getAgentById(1);

                expect(result).toEqual(cachedAgent);
                // Should not query database if agent is cached
                expect(mockNeonDB.query).not.toHaveBeenCalled();
                expect(mockSQLiteConnection.get).not.toHaveBeenCalled();
            });

            it('should query database and cache result when not in cache', async () => {
                const dbAgent = { id: 1, name: 'DB Agent' };
                mockNeonDB.query.mockResolvedValue({ rows: [dbAgent] });

                const result = await agentDataManager.getAgentById(1);

                expect(mockNeonDB.query).toHaveBeenCalledWith(
                    'SELECT * FROM agents WHERE id = $1',
                    [1]
                );
                expect(result).toEqual(dbAgent);
                expect(agentDataManager.agentCache.has(1)).toBe(true);
            });
        });

        describe('Update Agent', () => {
            it('should update agent in PostgreSQL and update cache', async () => {
                const updateData = { name: 'Updated Agent', is_active: false };
                const updatedAgent = { id: 1, ...mockAgentData, ...updateData };
                mockNeonDB.query.mockResolvedValue({ rows: [updatedAgent] });

                const result = await agentDataManager.updateAgent(1, updateData);

                expect(mockNeonDB.query).toHaveBeenCalledWith(
                    expect.stringContaining('UPDATE agents SET'),
                    expect.arrayContaining(['Updated Agent', false, 1])
                );
                expect(result).toEqual(updatedAgent);
                expect(agentDataManager.agentCache.get(1)).toEqual(updatedAgent);
            });

            it('should handle JSON fields correctly', async () => {
                const updateData = {
                    capabilities: ['new_capability'],
                    response_style: { tone: 'casual' }
                };
                mockNeonDB.query.mockResolvedValue({ rows: [{ id: 1, ...updateData }] });

                await agentDataManager.updateAgent(1, updateData);

                expect(mockNeonDB.query).toHaveBeenCalledWith(
                    expect.stringContaining('UPDATE agents SET'),
                    expect.arrayContaining([
                        JSON.stringify(['new_capability']),
                        JSON.stringify({ tone: 'casual' }),
                        1
                    ])
                );
            });
        });

        describe('Delete Agent', () => {
            it('should delete agent from PostgreSQL with cascade cleanup', async () => {
                mockNeonDB.transaction.mockImplementation(async (callback) => {
                    const mockClient = {
                        query: jest.fn().mockResolvedValue({ rowCount: 1 })
                    };
                    return await callback(mockClient);
                });

                // Add agent to cache first
                agentDataManager.agentCache.set(1, { id: 1, name: 'Test Agent' });

                const result = await agentDataManager.deleteAgent(1);

                expect(mockNeonDB.transaction).toHaveBeenCalled();
                expect(result).toBe(true);
                expect(agentDataManager.agentCache.has(1)).toBe(false);
            });

            it('should delete agent from SQLite when PostgreSQL unavailable', async () => {
                agentDataManager.state.connectionHealth.postgresql = false;
                agentDataManager.state.connectionMode = 'sqlite';
                mockSQLiteConnection.run.mockResolvedValue({ changes: 1 });

                const result = await agentDataManager.deleteAgent(1);

                expect(mockSQLiteConnection.run).toHaveBeenCalledWith(
                    'DELETE FROM agents WHERE id = ?',
                    [1]
                );
                expect(result).toBe(true);
            });
        });
    });

    describe('Sync Operations', () => {
        beforeEach(async () => {
            mockNeonDB.query.mockResolvedValue({ rows: [] });
            mockSQLiteConnection.all.mockResolvedValue([]);
            await agentDataManager.initialize();
        });

        it('should queue sync operations in hybrid mode', async () => {
            const mockAgent = { id: 1, ...mockAgentData };
            mockNeonDB.query.mockResolvedValue({ rows: [mockAgent] });

            await agentDataManager.createAgent(mockAgentData);

            expect(agentDataManager.state.syncQueue.length).toBeGreaterThan(0);
            
            const syncItem = agentDataManager.state.syncQueue[0];
            expect(syncItem.operation).toBe('create');
            expect(syncItem.table).toBe('agents');
            expect(syncItem.data).toEqual(mockAgent);
        });

        it('should not queue sync operations when sync disabled', async () => {
            agentDataManager.state.syncEnabled = false;
            
            const mockAgent = { id: 1, ...mockAgentData };
            mockNeonDB.query.mockResolvedValue({ rows: [mockAgent] });

            await agentDataManager.createAgent(mockAgentData);

            expect(agentDataManager.state.syncQueue.length).toBe(0);
        });
    });

    describe('Connection Health and Failover', () => {
        it('should handle PostgreSQL failure gracefully', async () => {
            await agentDataManager.initialize();

            // Simulate PostgreSQL failure
            mockNeonDB.healthCheck.mockRejectedValue(new Error('Connection failed'));
            
            await agentDataManager.checkConnectionHealth();

            expect(agentDataManager.state.connectionHealth.postgresql).toBe(false);
            expect(agentDataManager.determineConnectionMode()).toBe('sqlite');
        });

        it('should handle SQLite failure gracefully', async () => {
            await agentDataManager.initialize();

            // Simulate SQLite failure
            mockSQLiteConnection.get.mockRejectedValue(new Error('Database locked'));
            
            await agentDataManager.checkConnectionHealth();

            expect(agentDataManager.state.connectionHealth.sqlite).toBe(false);
            expect(agentDataManager.determineConnectionMode()).toBe('postgresql');
        });

        it('should use memory mode when both databases fail', async () => {
            await agentDataManager.initialize();

            // Simulate both database failures
            mockNeonDB.healthCheck.mockRejectedValue(new Error('Connection failed'));
            mockSQLiteConnection.get.mockRejectedValue(new Error('Database locked'));
            
            await agentDataManager.checkConnectionHealth();

            expect(agentDataManager.determineConnectionMode()).toBe('memory');
        });
    });

    describe('Status and Monitoring', () => {
        beforeEach(async () => {
            mockNeonDB.query.mockResolvedValue({ rows: [] });
            mockSQLiteConnection.all.mockResolvedValue([]);
            await agentDataManager.initialize();
        });

        it('should provide comprehensive status information', () => {
            // Add some mock data
            agentDataManager.agentCache.set(1, { id: 1, name: 'Test Agent' });
            agentDataManager.state.syncQueue.push({ operation: 'create' });

            const status = agentDataManager.getStatus();

            expect(status).toMatchObject({
                isInitialized: true,
                connectionMode: 'hybrid',
                offlineMode: false,
                syncEnabled: true,
                connectionHealth: {
                    postgresql: true,
                    sqlite: true
                },
                syncQueueSize: 1,
                cacheSize: 1
            });
            expect(status.lastSyncTime).toBeNull(); // No sync processed yet
        });
    });

    describe('Error Handling', () => {
        it('should handle initialization failure gracefully', async () => {
            mockNeonDB.healthCheck.mockRejectedValue(new Error('Initialization failed'));
            mockSQLiteConnection.get.mockRejectedValue(new Error('SQLite failed'));

            await expect(agentDataManager.initialize()).rejects.toThrow();
            expect(agentDataManager.state.isInitialized).toBe(false);
        });

        it('should handle agent creation failure and not update cache', async () => {
            await agentDataManager.initialize();
            
            mockNeonDB.query.mockRejectedValue(new Error('Database error'));

            await expect(agentDataManager.createAgent(mockAgentData)).rejects.toThrow('Database error');
            expect(agentDataManager.agentCache.size).toBe(0);
        });

        it('should return cached data when database operations fail', async () => {
            await agentDataManager.initialize();
            
            // Add agent to cache
            const cachedAgent = { id: 1, name: 'Cached Agent' };
            agentDataManager.agentCache.set(1, cachedAgent);

            // Simulate database failure
            mockNeonDB.query.mockRejectedValue(new Error('Database error'));
            mockSQLiteConnection.get.mockRejectedValue(new Error('SQLite error'));

            const result = await agentDataManager.getAgentById(1);
            expect(result).toEqual(cachedAgent);
        });
    });

    describe('Shutdown', () => {
        it('should shutdown gracefully and clean up resources', async () => {
            await agentDataManager.initialize();
            
            // Add some test data
            agentDataManager.agentCache.set(1, { id: 1, name: 'Test Agent' });
            agentDataManager.state.syncQueue.push({ operation: 'create' });

            await agentDataManager.shutdown();

            expect(agentDataManager.state.isInitialized).toBe(false);
            expect(agentDataManager.agentCache.size).toBe(0);
        });
    });
});

describe('ConnectionRouter', () => {
    let connectionRouter;

    beforeEach(() => {
        connectionRouter = new ConnectionRouter(mockNeonDB, mockSQLiteConnection);
    });

    it('should prefer SQLite for read operations (fastest)', async () => {
        await connectionRouter.initialize();
        
        const connection = await connectionRouter.getOptimalConnection('read');
        
        expect(connection.type).toBe('sqlite');
        expect(connection.connection).toBe(mockSQLiteConnection);
    });

    it('should prefer PostgreSQL for write operations (reliable)', async () => {
        await connectionRouter.initialize();
        
        const connection = await connectionRouter.getOptimalConnection('write');
        
        expect(connection.type).toBe('postgresql');
        expect(connection.connection).toBe(mockNeonDB);
    });

    it('should fallback to available connection when preferred unavailable', async () => {
        connectionRouter = new ConnectionRouter(mockNeonDB, null); // No SQLite
        await connectionRouter.initialize();
        
        const connection = await connectionRouter.getOptimalConnection('read');
        
        expect(connection.type).toBe('postgresql');
        expect(connection.connection).toBe(mockNeonDB);
    });

    it('should throw error when no connections available', async () => {
        connectionRouter = new ConnectionRouter(null, null);
        await connectionRouter.initialize();
        
        await expect(connectionRouter.getOptimalConnection('read'))
            .rejects.toThrow('No suitable database connection available');
    });
});

describe('SyncEngine', () => {
    let syncEngine;

    beforeEach(() => {
        syncEngine = new SyncEngine(mockNeonDB, mockSQLiteConnection);
    });

    it('should initialize successfully', async () => {
        await expect(syncEngine.initialize()).resolves.toBeUndefined();
    });

    it('should process sync queue items', async () => {
        const syncQueue = [
            {
                id: 1,
                operation: 'create',
                table: 'agents',
                data: { id: 1, name: 'Test Agent' },
                retries: 0
            }
        ];

        // Mock processSyncItem to avoid actual implementation
        jest.spyOn(syncEngine, 'processSyncItem').mockResolvedValue();

        await syncEngine.processSyncQueue(syncQueue);

        expect(syncEngine.processSyncItem).toHaveBeenCalledWith(syncQueue[0]);
    });

    it('should retry failed sync items up to 3 times', async () => {
        const syncQueue = [
            {
                id: 1,
                operation: 'create',
                table: 'agents',
                data: { id: 1, name: 'Test Agent' },
                retries: 0
            }
        ];

        // Mock processSyncItem to fail
        jest.spyOn(syncEngine, 'processSyncItem').mockRejectedValue(new Error('Sync failed'));

        await syncEngine.processSyncQueue(syncQueue);

        // Item should be re-queued with incremented retry count
        expect(syncQueue[0].retries).toBe(1);
        expect(syncQueue.length).toBe(2); // Original + re-queued
    });
});