// Agent Registry Tests
// Tests database-backed agent queries and SDK config building

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import {
    SDK_TOOLS,
    ALL_SDK_TOOLS,
    getAgentById,
    getAgentBySlug,
    getUserPipedreamConnections,
    buildSDKAgentConfig,
    buildSDKAgentConfigFromRecord,
    type SDKTool,
    type AgentRecord,
    type SDKAgentConfig,
} from '../agent.registry';
import { InvalidAutonomyLevelError } from '../../errors';
import { AgentNotFoundError } from '../../../agents/errors';
import { query } from '../../../../database/connection';

// -----------------------------------------------------------------------------
// Test Data Setup/Teardown
// -----------------------------------------------------------------------------

const TEST_USER_ID = `test-user-${Date.now()}`;
let TEST_AGENT_ID: number;

async function createTestUser(userId: string): Promise<void> {
    await query(
        `INSERT INTO users (user_id, email, display_name, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, `${userId}@test.com`, 'Test User']
    );
}

async function createTestAgent(userId: string | null): Promise<number> {
    const slug = `test-agent-${Date.now()}`;
    const result = await query<{ id: number }>(
        `INSERT INTO agent_registry (slug, user_id, agent_type)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [
            slug,
            userId,
            userId ? 'private' : 'public',
        ]
    );
    return result.rows[0].id;
}

async function cleanupTestData(): Promise<void> {
    await query('DELETE FROM agent_registry WHERE slug LIKE $1', ['test-agent-%']);
    await query('DELETE FROM users WHERE user_id = $1', [TEST_USER_ID]);
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('Agent Registry', () => {
    describe('SDK_TOOLS constant', () => {
        it('defines all expected SDK tools', () => {
            expect(SDK_TOOLS.READ).toBe('Read');
            expect(SDK_TOOLS.WRITE).toBe('Write');
            expect(SDK_TOOLS.EDIT).toBe('Edit');
            expect(SDK_TOOLS.GLOB).toBe('Glob');
            expect(SDK_TOOLS.GREP).toBe('Grep');
            expect(SDK_TOOLS.BASH).toBe('Bash');
            expect(SDK_TOOLS.WEB_SEARCH).toBe('WebSearch');
            expect(SDK_TOOLS.WEB_FETCH).toBe('WebFetch');
            expect(SDK_TOOLS.TASK).toBe('Task');
            expect(SDK_TOOLS.TASK_CREATE).toBe('TaskCreate');
            expect(SDK_TOOLS.TASK_UPDATE).toBe('TaskUpdate');
            expect(SDK_TOOLS.TASK_LIST).toBe('TaskList');
            expect(SDK_TOOLS.TASK_GET).toBe('TaskGet');
            expect(SDK_TOOLS.ASK_USER).toBe('AskUserQuestion');
        });

        it('SDK_TOOLS values are frozen', () => {
            expect(Object.isFrozen(SDK_TOOLS)).toBe(true);
        });
    });

    describe('ALL_SDK_TOOLS array', () => {
        it('contains all SDK tool values', () => {
            const toolValues = Object.values(SDK_TOOLS);
            expect(ALL_SDK_TOOLS).toHaveLength(toolValues.length);

            for (const tool of toolValues) {
                expect(ALL_SDK_TOOLS).toContain(tool);
            }
        });

        it('contains expected tools', () => {
            expect(ALL_SDK_TOOLS).toContain('Read');
            expect(ALL_SDK_TOOLS).toContain('Write');
            expect(ALL_SDK_TOOLS).toContain('Bash');
            expect(ALL_SDK_TOOLS).toContain('WebSearch');
        });
    });

    describe('Database Queries', () => {
        beforeAll(async () => {
            await cleanupTestData();
            await createTestUser(TEST_USER_ID);
            TEST_AGENT_ID = await createTestAgent(null); // Public agent
        });

        afterAll(async () => {
            await cleanupTestData();
        });

        describe('getAgentById', () => {
            it('returns agent for valid ID', async () => {
                const agent = await getAgentById(TEST_AGENT_ID);

                expect(agent).not.toBeNull();
                expect(agent!.id).toBe(TEST_AGENT_ID);
                expect(agent!.name).toContain('test-agent');
            });

            it('returns null for non-existent ID', async () => {
                const agent = await getAgentById(999999);
                expect(agent).toBeNull();
            });
        });

        describe('getAgentBySlug', () => {
            it('returns agent for valid name-based lookup', async () => {
                const testAgent = await getAgentById(TEST_AGENT_ID);
                expect(testAgent).not.toBeNull();

                // Can look up by name (case-insensitive)
                const agent = await getAgentBySlug(testAgent!.name);
                expect(agent).not.toBeNull();
                expect(agent!.id).toBe(TEST_AGENT_ID);
            });

            it('returns null for non-existent name', async () => {
                const agent = await getAgentBySlug('nonexistent-agent-name-12345');
                expect(agent).toBeNull();
            });
        });

        describe('getUserPipedreamConnections', () => {
            it('returns array for user', async () => {
                const connections = await getUserPipedreamConnections(TEST_USER_ID);

                expect(Array.isArray(connections)).toBe(true);
                // Test user has no connections, so array should be empty
            });

            it('returns empty array for non-existent user', async () => {
                const connections = await getUserPipedreamConnections('nonexistent-user');
                expect(connections).toEqual([]);
            });
        });
    });

    describe('buildSDKAgentConfig', () => {
        beforeAll(async () => {
            await cleanupTestData();
            await createTestUser(TEST_USER_ID);
            TEST_AGENT_ID = await createTestAgent(null);
        });

        afterAll(async () => {
            await cleanupTestData();
        });

        it('builds config for valid agent', async () => {
            const config = await buildSDKAgentConfig(TEST_AGENT_ID, TEST_USER_ID);

            expect(config).toHaveProperty('name');
            expect(config).toHaveProperty('description');
            expect(config).toHaveProperty('allowedTools');
            expect(config).toHaveProperty('mcpServers');
            expect(config).toHaveProperty('permissionMode');
            expect(config).toHaveProperty('thinkingLevel');
        });

        it('throws AgentNotFoundError for non-existent agent', async () => {
            await expect(buildSDKAgentConfig(999999, TEST_USER_ID))
                .rejects.toThrow(AgentNotFoundError);
        });

        it('includes all SDK tools in allowedTools', async () => {
            const config = await buildSDKAgentConfig(TEST_AGENT_ID, TEST_USER_ID);

            expect(config.allowedTools).toEqual(ALL_SDK_TOOLS);
        });

        it('maps supervised autonomy to default permission mode', async () => {
            const config = await buildSDKAgentConfig(TEST_AGENT_ID, TEST_USER_ID);

            // Test agent has supervised autonomy
            expect(config.permissionMode).toBe('default');
        });
    });

    describe('buildSDKAgentConfigFromRecord', () => {
        it('builds config from agent record', () => {
            const mockAgent: AgentRecord = {
                id: 1,
                slug: 'test-agent',
                name: 'Test Agent',
                description: 'Test description',
                capabilities: { skills: [] },
                tools: [],
                thinking_level: 'high',
                autonomy_level: 'semi_autonomous',
                tags: ['test'],
                agent_type: 'public',
            };

            const config = buildSDKAgentConfigFromRecord(mockAgent, [], 'user-123');

            expect(config.name).toBe('Test Agent');
            expect(config.description).toBe('Test description');
            expect(config.thinkingLevel).toBe('high');
            expect(config.permissionMode).toBe('acceptEdits'); // semi_autonomous -> acceptEdits
        });

        it('maps autonomy levels correctly', () => {
            const baseAgent: Omit<AgentRecord, 'autonomy_level'> = {
                id: 1,
                slug: 'test',
                name: 'Test',
                description: 'Test',
                capabilities: { skills: [] },
                tools: [],
                thinking_level: 'medium',
                tags: [],
                agent_type: 'public',
            };

            // supervised -> default
            const supervised = buildSDKAgentConfigFromRecord(
                { ...baseAgent, autonomy_level: 'supervised' },
                [],
                'user-123'
            );
            expect(supervised.permissionMode).toBe('default');

            // semi_autonomous -> acceptEdits
            const semiAuto = buildSDKAgentConfigFromRecord(
                { ...baseAgent, autonomy_level: 'semi_autonomous' },
                [],
                'user-123'
            );
            expect(semiAuto.permissionMode).toBe('acceptEdits');

            // autonomous -> bypassPermissions
            const auto = buildSDKAgentConfigFromRecord(
                { ...baseAgent, autonomy_level: 'autonomous' },
                [],
                'user-123'
            );
            expect(auto.permissionMode).toBe('bypassPermissions');
        });

        it('throws InvalidAutonomyLevelError for invalid autonomy level', () => {
            const badAgent: AgentRecord = {
                id: 1,
                slug: 'test',
                name: 'Test',
                description: 'Test',
                capabilities: { skills: [] },
                tools: [],
                thinking_level: 'medium',
                autonomy_level: 'invalid' as any,
                tags: [],
                agent_type: 'public',
            };

            expect(() => buildSDKAgentConfigFromRecord(badAgent, [], 'user-123'))
                .toThrow(InvalidAutonomyLevelError);
        });
    });

    describe('Type Exports', () => {
        it('SDKTool type is usable', () => {
            const tool: SDKTool = 'Read';
            expect(tool).toBe('Read');
        });

        it('AgentRecord type has expected shape', () => {
            const agent: AgentRecord = {
                id: 1,
                slug: 'test',
                name: 'Test',
                description: 'Desc',
                capabilities: {},
                tools: [],
                thinking_level: 'medium',
                autonomy_level: 'supervised',
                tags: [],
                agent_type: 'public',
            };
            expect(agent.id).toBe(1);
        });

        it('SDKAgentConfig type has expected shape', () => {
            const config: SDKAgentConfig = {
                name: 'Test',
                description: 'Desc',
                allowedTools: ['Read'],
                mcpServers: {},
                permissionMode: 'default',
                thinkingLevel: 'medium',
            };
            expect(config.name).toBe('Test');
        });
    });
});
