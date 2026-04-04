// Inter-Agent Messaging Service Tests
// Tests for @mention parsing and message routing
// Uses real local filesystem for workspace writes, real DB for agent resolution

import path from 'path';


import * as fs from 'fs/promises';
import * as os from 'os';

import { query } from '../../../../database/connection';
import {
    MentionParser,
    MessageRouter,
    MessageRouterDeps,
    InboxMessage,
    UnknownAgentError,
} from '../messaging.service';

// -----------------------------------------------------------------------------
// Real Filesystem WorkspaceWriter
// -----------------------------------------------------------------------------

class FilesystemWorkspaceWriter {
    public writtenFiles: Map<string, string> = new Map();

    constructor(private readonly rootDir: string) {}

    async writeFile(filePath: string, content: string): Promise<void> {
        const fullPath = this.resolve(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        this.writtenFiles.set(filePath, content);
    }

    async appendFile(filePath: string, content: string): Promise<void> {
        const fullPath = this.resolve(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        let existing = '';
        try {
            existing = await fs.readFile(fullPath, 'utf-8');
        } catch {
            // File does not exist yet
        }
        const combined = existing + content;
        await fs.writeFile(fullPath, combined, 'utf-8');
        this.writtenFiles.set(filePath, combined);
    }

    async mkdir(dirPath: string): Promise<void> {
        const fullPath = this.resolve(dirPath);
        await fs.mkdir(fullPath, { recursive: true });
    }

    getContent(filePath: string): string | undefined {
        return this.writtenFiles.get(filePath);
    }

    clear(): void {
        this.writtenFiles.clear();
    }

    private resolve(filePath: string): string {
        // Map /workspace/... to rootDir/workspace/...
        return path.join(this.rootDir, filePath);
    }
}

// -----------------------------------------------------------------------------
// Real DB AgentResolver
// -----------------------------------------------------------------------------

const TEST_PREFIX = 'xmessaging_' + Date.now();

class DatabaseAgentResolver {
    async resolveAgent(slug: string): Promise<{ id: number; slug: string; model: string } | null> {
        const result = await query<{ id: number; slug: string }>(
            `SELECT id, slug FROM agent_registry WHERE slug = $1 LIMIT 1`,
            [slug]
        );
        if (result.rows.length === 0) return null;
        return { id: result.rows[0].id, slug: result.rows[0].slug, model: 'claude-3-5-sonnet' };
    }

    clear(): void {
        // No-op for DB-backed resolver
    }
}

// -----------------------------------------------------------------------------
// Test Data Setup / Teardown
// -----------------------------------------------------------------------------

const TEST_USER_ID = TEST_PREFIX + '_user';

async function seedTestData(): Promise<void> {
    const email = `${TEST_USER_ID}_${Math.random().toString(36).substring(7)}@test.com`;
    await query(
        `INSERT INTO users (user_id, email, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
        [TEST_USER_ID, email, 'Test User']
    );

    // Create test agents
    await query(
        `INSERT INTO agent_registry (slug, user_id, agent_type)
         VALUES ($1, $2, $3) ON CONFLICT (slug, user_id) DO NOTHING`,
        [TEST_PREFIX + '_researcher', TEST_USER_ID, 'private']
    );
    await query(
        `INSERT INTO agent_registry (slug, user_id, agent_type)
         VALUES ($1, $2, $3) ON CONFLICT (slug, user_id) DO NOTHING`,
        [TEST_PREFIX + '_analyst', TEST_USER_ID, 'private']
    );
    await query(
        `INSERT INTO agent_registry (slug, user_id, agent_type)
         VALUES ($1, $2, $3) ON CONFLICT (slug, user_id) DO NOTHING`,
        [TEST_PREFIX + '_coder', TEST_USER_ID, 'private']
    );
    await query(
        `INSERT INTO agent_registry (slug, user_id, agent_type)
         VALUES ($1, $2, $3) ON CONFLICT (slug, user_id) DO NOTHING`,
        [TEST_PREFIX + '_helper', TEST_USER_ID, 'private']
    );
}

async function cleanupTestData(): Promise<void> {
    await query(`DELETE FROM agent_registry WHERE slug LIKE $1`, [TEST_PREFIX + '%']);
    await query(`DELETE FROM users WHERE user_id LIKE $1`, [TEST_PREFIX + '%']);
}

// Use prefixed slugs so DB resolver finds them
const RESEARCHER = TEST_PREFIX + '_researcher';
const ANALYST = TEST_PREFIX + '_analyst';
const CODER = TEST_PREFIX + '_coder';
const HELPER = TEST_PREFIX + '_helper';

// -----------------------------------------------------------------------------
// MentionParser Tests (pure logic, no infrastructure needed)
// -----------------------------------------------------------------------------

describe('MentionParser', () => {
    let parser: MentionParser;

    beforeEach(() => {
        parser = new MentionParser();
    });

    describe('parseMentions', () => {
        it('should parse single @mention', () => {
            const text = 'Hey @researcher please analyze this data';
            const mentions = parser.parseMentions(text);

            expect(mentions).toHaveLength(1);
            expect(mentions[0].target).toBe('researcher');
            expect(mentions[0].message).toContain('analyze this data');
        });

        it('should parse multiple @mentions', () => {
            const text = '@analyst check numbers @reviewer verify results';
            const mentions = parser.parseMentions(text);

            expect(mentions).toHaveLength(2);
            expect(mentions[0].target).toBe('analyst');
            expect(mentions[1].target).toBe('reviewer');
        });

        it('should extract message after mention until next mention or end', () => {
            const text = '@coder implement feature @tester write tests for it';
            const mentions = parser.parseMentions(text);

            expect(mentions[0].message).toBe('implement feature');
            expect(mentions[1].message).toBe('write tests for it');
        });

        it('should handle mentions with hyphens and underscores', () => {
            const text = '@data-analyst and @code_reviewer please help';
            const mentions = parser.parseMentions(text);

            expect(mentions).toHaveLength(2);
            expect(mentions[0].target).toBe('data-analyst');
            expect(mentions[1].target).toBe('code_reviewer');
        });

        it('should return empty array for no mentions', () => {
            const text = 'This is a regular message with no mentions';
            const mentions = parser.parseMentions(text);

            expect(mentions).toHaveLength(0);
        });

        it('should ignore email addresses', () => {
            const text = 'Send to user@example.com and @researcher for review';
            const mentions = parser.parseMentions(text);

            expect(mentions).toHaveLength(1);
            expect(mentions[0].target).toBe('researcher');
        });

        it('should handle mentions at start of text', () => {
            const text = '@lead please coordinate this task';
            const mentions = parser.parseMentions(text);

            expect(mentions).toHaveLength(1);
            expect(mentions[0].target).toBe('lead');
            expect(mentions[0].message).toBe('please coordinate this task');
        });

        it('should trim whitespace from messages', () => {
            const text = '@helper    please help with this    ';
            const mentions = parser.parseMentions(text);

            expect(mentions[0].message).toBe('please help with this');
        });
    });

    describe('extractFullContext', () => {
        it('should include surrounding context for ambiguous mentions', () => {
            const text = 'Based on the analysis, @analyst the numbers look off. Check column B.';
            const mentions = parser.parseMentions(text);

            // Message should capture the directed content
            expect(mentions[0].message).toContain('numbers look off');
        });
    });
});

// -----------------------------------------------------------------------------
// MessageRouter Tests
// -----------------------------------------------------------------------------

describe('MessageRouter', () => {
    let tmpDir: string;
    let router: MessageRouter;
    let workspaceWriter: FilesystemWorkspaceWriter;
    let agentResolver: DatabaseAgentResolver;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xerus-msg-test-'));
        await cleanupTestData();
        await seedTestData();
    });

    afterAll(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
        await cleanupTestData();
    });

    beforeEach(async () => {
        // Clean temp dir between tests
        const entries = await fs.readdir(tmpDir);
        for (const entry of entries) {
            await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
        }

        workspaceWriter = new FilesystemWorkspaceWriter(tmpDir);
        agentResolver = new DatabaseAgentResolver();

        const deps: MessageRouterDeps = {
            workspaceWriter,
            agentResolver,
        };

        router = new MessageRouter(deps);
    });

    afterEach(() => {
        workspaceWriter.clear();
    });

    describe('routeMessage', () => {
        it('should route message to target agent inbox file', async () => {
            const message: InboxMessage = {
                from_agent_slug: CODER,
                to_agent_slug: RESEARCHER,
                content: 'Please review this code',
                workspace_path: '/workspace',
            };

            const result = await router.routeMessage(message);

            expect(result.inbox_path).toContain(RESEARCHER);

            const content = workspaceWriter.getContent(result.inbox_path);
            expect(content).toContain(CODER);
            expect(content).toContain('review this code');
        });

        it('should throw UnknownAgentError for unknown target agent', async () => {
            const message: InboxMessage = {
                from_agent_slug: CODER,
                to_agent_slug: 'unknown-agent',
                content: 'Hello',
                workspace_path: '/workspace',
            };

            await expect(router.routeMessage(message)).rejects.toThrow(UnknownAgentError);
            await expect(router.routeMessage(message)).rejects.toThrow('unknown-agent');
        });

        it('should format inbox message with timestamp', async () => {
            const message: InboxMessage = {
                from_agent_slug: ANALYST,
                to_agent_slug: RESEARCHER,
                content: 'Analysis complete',
                workspace_path: '/workspace',
            };

            await router.routeMessage(message);

            const inboxPath = `/workspace/shared/inbox/${RESEARCHER}/inbox.md`;
            const content = workspaceWriter.getContent(inboxPath);

            expect(content).toContain(`**From**: ${ANALYST}`);
            expect(content).toContain('Analysis complete');
            // Should have timestamp
            expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
        });

        it('should append to existing inbox file', async () => {
            const message1: InboxMessage = {
                from_agent_slug: CODER,
                to_agent_slug: RESEARCHER,
                content: 'First message',
                workspace_path: '/workspace',
            };

            const message2: InboxMessage = {
                from_agent_slug: ANALYST,
                to_agent_slug: RESEARCHER,
                content: 'Second message',
                workspace_path: '/workspace',
            };

            await router.routeMessage(message1);
            await router.routeMessage(message2);

            const inboxPath = `/workspace/shared/inbox/${RESEARCHER}/inbox.md`;
            const content = workspaceWriter.getContent(inboxPath);

            expect(content).toContain('First message');
            expect(content).toContain('Second message');
        });
    });

    describe('routeMentions', () => {
        it('should route all parsed mentions', async () => {
            const text = `@${RESEARCHER} analyze this @${ANALYST} verify numbers`;
            const fromAgent = CODER;
            const workspacePath = '/workspace';

            const results = await router.routeMentions(text, fromAgent, workspacePath);

            expect(results).toHaveLength(2);
            expect(results[0].inbox_path).toContain(RESEARCHER);
            expect(results[1].inbox_path).toContain(ANALYST);
        });

        it('should return empty array for no mentions', async () => {
            const text = 'Regular message with no mentions';
            const results = await router.routeMentions(text, CODER, '/workspace');

            expect(results).toHaveLength(0);
        });

        it('should throw on unknown agent in mentions (fail-fast)', async () => {
            const text = `@${RESEARCHER} valid @unknown-agent invalid`;

            await expect(
                router.routeMentions(text, CODER, '/workspace')
            ).rejects.toThrow(UnknownAgentError);
        });
    });

    describe('inbox path generation', () => {
        it('should generate correct inbox path structure', async () => {
            const message: InboxMessage = {
                from_agent_slug: CODER,
                to_agent_slug: RESEARCHER,
                content: 'Test',
                workspace_path: '/my/workspace',
            };

            const result = await router.routeMessage(message);

            expect(result.inbox_path).toBe(`/my/workspace/shared/inbox/${RESEARCHER}/inbox.md`);
        });
    });
});

// -----------------------------------------------------------------------------
// Integration Tests
// -----------------------------------------------------------------------------

describe('Messaging Integration', () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xerus-msg-integ-'));
        await seedTestData();
    });

    afterAll(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
        await cleanupTestData();
    });

    it('should parse and route mentions in single flow', async () => {
        const parser = new MentionParser();

        const writer = new FilesystemWorkspaceWriter(tmpDir);
        const resolver = new DatabaseAgentResolver();
        const router = new MessageRouter({
            workspaceWriter: writer,
            agentResolver: resolver,
        });

        const agentOutput = `I need @${HELPER} to assist with this task`;
        const mentions = parser.parseMentions(agentOutput);

        expect(mentions).toHaveLength(1);

        const results = await router.routeMentions(agentOutput, 'lead', '/workspace');

        expect(results).toHaveLength(1);
        expect(results[0].inbox_path).toContain(HELPER);
    });
});
