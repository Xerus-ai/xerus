// Scaffold Sync Hook Integration Tests
// Tests the scaffold-sync-hook.sh bash script with a real temporary workspace.
// Validates: agent scaffolding, channel scaffolding, idempotency, DB registration.
//
// These tests execute the actual hook script against a temp directory structure
// that mirrors a real Daytona workspace. No mocks — real filesystem, real sqlite3.

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const HOOK_SCRIPT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', 'xerus-workspace', '.claude', 'hooks', 'scripts', 'scaffold-sync-hook.sh');
const TEMPLATE_SOURCE = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', 'xerus-workspace', '.xerus', 'templates', 'agent');
const LIB_SCRIPT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', 'xerus-workspace', '.claude', 'hooks', 'scripts', '_lib.sh');
const SCHEMA_FILE = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', 'xerus-workspace', 'data', 'workspace-schema.sql');

let tmpDir: string;

function hasBash(): boolean {
    try {
        execSync('bash --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

function hasSqlite(): boolean {
    try {
        execSync('sqlite3 --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

function hasJq(): boolean {
    try {
        execSync('jq --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

const describeIfBash = hasBash() ? describe : describe.skip;

async function createWorkspaceStructure(root: string): Promise<void> {
    // Minimal workspace structure the hook expects
    await fs.mkdir(path.join(root, 'agents'), { recursive: true });
    await fs.mkdir(path.join(root, '.memory', 'agents'), { recursive: true });
    await fs.mkdir(path.join(root, '.xerus'), { recursive: true });
    await fs.mkdir(path.join(root, 'data'), { recursive: true });
    await fs.mkdir(path.join(root, 'projects'), { recursive: true });

    // Copy template files
    const templateDir = path.join(root, '.xerus', 'templates', 'agent');
    await fs.mkdir(templateDir, { recursive: true });
    const templates = await fs.readdir(TEMPLATE_SOURCE);
    for (const tmpl of templates) {
        await fs.copyFile(path.join(TEMPLATE_SOURCE, tmpl), path.join(templateDir, tmpl));
    }

    // Copy _lib.sh
    const hooksDir = path.join(root, '.claude', 'hooks', 'scripts');
    await fs.mkdir(hooksDir, { recursive: true });
    await fs.copyFile(LIB_SCRIPT, path.join(hooksDir, '_lib.sh'));
    await fs.copyFile(HOOK_SCRIPT, path.join(hooksDir, 'scaffold-sync-hook.sh'));

    // Initialize workspace.db with schema if sqlite3 available
    if (hasSqlite()) {
        const dbPath = path.join(root, 'data', 'workspace.db');
        await fs.writeFile(dbPath, '');
        execSync(`sqlite3 "${dbPath}" < "${SCHEMA_FILE}"`, { stdio: 'pipe' });
    }

    // Initialize data/activity.jsonl
    await fs.writeFile(path.join(root, 'data', 'activity.jsonl'), '');
}

function runHook(root: string, toolName: string, filePath: string): { stdout: string; stderr: string; exitCode: number } {
    const hookPath = path.join(root, '.claude', 'hooks', 'scripts', 'scaffold-sync-hook.sh');
    const hookInput = JSON.stringify({ tool_input: { file_path: filePath } });
    const env = {
        ...process.env,
        XERUS_WORKSPACE_ROOT: root,
        XERUS_AGENT_SLUG: 'xerus-master',
        CLAUDE_TOOL_NAME: toolName,
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || os.homedir(),
    };

    try {
        const stdout = execSync(`echo '${hookInput.replace(/'/g, "'\\''")}' | bash "${hookPath}"`, {
            env,
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 10000,
        }).toString();
        return { stdout, stderr: '', exitCode: 0 };
    } catch (err: unknown) {
        const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
        return {
            stdout: e.stdout?.toString() || '',
            stderr: e.stderr?.toString() || '',
            exitCode: e.status || 1,
        };
    }
}

describeIfBash('scaffold-sync-hook.sh', () => {
    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xerus-hook-test-'));
        await createWorkspaceStructure(tmpDir);
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    // ─────────────────────────────────────────────────────────
    // Agent Creation Scaffold
    // ─────────────────────────────────────────────────────────

    describe('agent creation (agents/{slug}/config.json)', () => {
        it('scaffolds all soul files from templates when config.json is written', async () => {
            // Arrange: write a config.json (simulates what the agent writes)
            const agentDir = path.join(tmpDir, 'agents', 'test-researcher');
            await fs.mkdir(agentDir, { recursive: true });
            await fs.writeFile(path.join(agentDir, 'config.json'), JSON.stringify({
                slug: 'test-researcher',
                name: 'Test Researcher',
                role: 'researcher',
                model: 'sonnet',
                autonomy_level: 'supervised',
                adapter_type: 'claudecode',
                domain: 'marketing',
                primary_channel: 'research',
            }));

            // Act: run the hook
            const result = runHook(tmpDir, 'Write', path.join(tmpDir, 'agents', 'test-researcher', 'config.json'));

            // Assert: all soul files created
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('scaffolded');

            const expectedFiles = ['SOUL.md', 'BOOTSTRAP.md', 'STATUS.md', 'USER.md', 'RELATIONSHIPS.md', 'HEARTBEAT.md', 'CLAUDE.md'];
            for (const file of expectedFiles) {
                const exists = await fs.access(path.join(agentDir, file)).then(() => true).catch(() => false);
                expect(exists).toBe(true);
            }

            // Assert: SOUL.md contains agent name from template substitution
            const soulContent = await fs.readFile(path.join(agentDir, 'SOUL.md'), 'utf-8');
            expect(soulContent).toContain('Test Researcher');

            // Assert: BOOTSTRAP.md contains agent name
            const bootstrapContent = await fs.readFile(path.join(agentDir, 'BOOTSTRAP.md'), 'utf-8');
            expect(bootstrapContent).toContain('Test Researcher');
            expect(bootstrapContent).toContain('completed_at: null');

            // Assert: CLAUDE.md has channel path
            const claudeContent = await fs.readFile(path.join(agentDir, 'CLAUDE.md'), 'utf-8');
            expect(claudeContent).toContain('projects/marketing/channels/research');
        });

        it('creates memory directories with initial files', async () => {
            const agentDir = path.join(tmpDir, 'agents', 'mem-agent');
            await fs.mkdir(agentDir, { recursive: true });
            await fs.writeFile(path.join(agentDir, 'config.json'), JSON.stringify({
                slug: 'mem-agent',
                name: 'Memory Agent',
                role: 'specialist',
            }));

            runHook(tmpDir, 'Write', path.join(tmpDir, 'agents', 'mem-agent', 'config.json'));

            const memDir = path.join(tmpDir, '.memory', 'agents', 'mem-agent');
            const working = await fs.readFile(path.join(memDir, 'working.md'), 'utf-8');
            expect(working).toContain('Memory Agent Working Context');

            const expertise = await fs.readFile(path.join(memDir, 'expertise.md'), 'utf-8');
            expect(expertise).toContain('Memory Agent Expertise');
        });

        it('creates inbox and knowledge directories', async () => {
            const agentDir = path.join(tmpDir, 'agents', 'inbox-agent');
            await fs.mkdir(agentDir, { recursive: true });
            await fs.writeFile(path.join(agentDir, 'config.json'), '{"slug":"inbox-agent","name":"Inbox Agent"}');

            runHook(tmpDir, 'Write', path.join(tmpDir, 'agents', 'inbox-agent', 'config.json'));

            const inboxExists = await fs.access(path.join(agentDir, 'inbox', 'processed')).then(() => true).catch(() => false);
            expect(inboxExists).toBe(true);

            const knowledgeExists = await fs.access(path.join(agentDir, 'knowledge')).then(() => true).catch(() => false);
            expect(knowledgeExists).toBe(true);
        });

        (hasJq() ? it : it.skip)('updates agents/index.json with new agent entry', async () => {
            const agentDir = path.join(tmpDir, 'agents', 'indexed-agent');
            await fs.mkdir(agentDir, { recursive: true });
            await fs.writeFile(path.join(agentDir, 'config.json'), JSON.stringify({
                slug: 'indexed-agent',
                name: 'Indexed Agent',
                role: 'writer',
                model: 'opus',
                domain: 'content',
                primary_channel: 'blog',
            }));

            runHook(tmpDir, 'Write', path.join(tmpDir, 'agents', 'indexed-agent', 'config.json'));

            const indexPath = path.join(tmpDir, 'agents', 'index.json');
            const index = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
            expect(index.agents['indexed-agent']).toBeDefined();
            expect(index.agents['indexed-agent'].name).toBe('Indexed Agent');
            expect(index.agents['indexed-agent'].role).toBe('writer');
            expect(index.agents['indexed-agent'].model).toBe('opus');
        });

        (hasSqlite() ? it : it.skip)('registers agent in workspace.db', async () => {
            const agentDir = path.join(tmpDir, 'agents', 'db-agent');
            await fs.mkdir(agentDir, { recursive: true });
            await fs.writeFile(path.join(agentDir, 'config.json'), JSON.stringify({
                slug: 'db-agent',
                name: 'DB Agent',
                role: 'analyst',
                autonomy_level: 'autonomous',
            }));

            runHook(tmpDir, 'Write', path.join(tmpDir, 'agents', 'db-agent', 'config.json'));

            const dbPath = path.join(tmpDir, 'data', 'workspace.db');
            const result = execSync(`sqlite3 "${dbPath}" "SELECT slug, name, role, autonomy_level FROM agents WHERE slug = 'db-agent'"`, { stdio: 'pipe' }).toString().trim();
            expect(result).toContain('db-agent');
            expect(result).toContain('DB Agent');
            expect(result).toContain('analyst');
            expect(result).toContain('autonomous');
        });

        it('is idempotent — does not overwrite existing soul files', async () => {
            const agentDir = path.join(tmpDir, 'agents', 'existing-agent');
            await fs.mkdir(agentDir, { recursive: true });
            await fs.writeFile(path.join(agentDir, 'config.json'), '{"slug":"existing-agent","name":"Existing"}');

            // Pre-create SOUL.md with custom content
            await fs.writeFile(path.join(agentDir, 'SOUL.md'), '# Custom Soul\nThis was customized.');

            runHook(tmpDir, 'Write', path.join(tmpDir, 'agents', 'existing-agent', 'config.json'));

            // SOUL.md should NOT be overwritten
            const soulContent = await fs.readFile(path.join(agentDir, 'SOUL.md'), 'utf-8');
            expect(soulContent).toBe('# Custom Soul\nThis was customized.');

            // But other missing files should still be created
            const bootstrapExists = await fs.access(path.join(agentDir, 'BOOTSTRAP.md')).then(() => true).catch(() => false);
            expect(bootstrapExists).toBe(true);
        });

        it('ignores non-Write/Edit tool events', async () => {
            const agentDir = path.join(tmpDir, 'agents', 'ignored-agent');
            await fs.mkdir(agentDir, { recursive: true });
            await fs.writeFile(path.join(agentDir, 'config.json'), '{"slug":"ignored-agent","name":"Ignored"}');

            runHook(tmpDir, 'Read', path.join(tmpDir, 'agents', 'ignored-agent', 'config.json'));

            // Should not scaffold anything for Read tool
            const soulExists = await fs.access(path.join(agentDir, 'SOUL.md')).then(() => true).catch(() => false);
            expect(soulExists).toBe(false);
        });

        it('rejects agent slugs with path traversal', async () => {
            runHook(tmpDir, 'Write', path.join(tmpDir, 'agents', '..', 'etc', 'config.json'));
            // Pattern regex only matches safe slugs, so this should not trigger scaffold
            const etcExists = await fs.access(path.join(tmpDir, 'etc', 'SOUL.md')).then(() => true).catch(() => false);
            expect(etcExists).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────
    // Channel Creation Scaffold
    // ─────────────────────────────────────────────────────────

    describe('channel creation (projects/{domain}/channels/{channel}/CLAUDE.md)', () => {
        it('creates all channel subdirectories when CLAUDE.md is written', async () => {
            const channelDir = path.join(tmpDir, 'projects', 'marketing', 'channels', 'content');
            await fs.mkdir(channelDir, { recursive: true });
            await fs.writeFile(path.join(channelDir, 'CLAUDE.md'), '# Channel: Content Lab\n\n## Mission\nCreate content.');

            const result = runHook(tmpDir, 'Write', path.join(channelDir, 'CLAUDE.md'));

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('initialized');

            // Assert all subdirs created
            for (const subdir of ['output', 'output/deliverables', 'scratch', 'data', '.beads']) {
                const exists = await fs.access(path.join(channelDir, subdir)).then(() => true).catch(() => false);
                expect(exists).toBe(true);
            }

            // Assert posts.jsonl initialized
            const postsExists = await fs.access(path.join(channelDir, 'output', 'posts.jsonl')).then(() => true).catch(() => false);
            expect(postsExists).toBe(true);

            // Assert beads issues initialized
            const beadsExists = await fs.access(path.join(channelDir, '.beads', 'issues.jsonl')).then(() => true).catch(() => false);
            expect(beadsExists).toBe(true);
        });

        (hasSqlite() ? it : it.skip)('registers domain and channel in workspace.db', async () => {
            const channelDir = path.join(tmpDir, 'projects', 'engineering', 'channels', 'backend');
            await fs.mkdir(channelDir, { recursive: true });
            await fs.writeFile(path.join(channelDir, 'CLAUDE.md'), '# Backend Channel');

            runHook(tmpDir, 'Write', path.join(channelDir, 'CLAUDE.md'));

            const dbPath = path.join(tmpDir, 'data', 'workspace.db');
            const domainResult = execSync(`sqlite3 "${dbPath}" "SELECT slug FROM domains WHERE slug = 'engineering'"`, { stdio: 'pipe' }).toString().trim();
            expect(domainResult).toBe('engineering');

            const channelResult = execSync(`sqlite3 "${dbPath}" "SELECT slug, domain_slug FROM channels WHERE slug = 'engineering--backend'"`, { stdio: 'pipe' }).toString().trim();
            expect(channelResult).toContain('engineering--backend');
            expect(channelResult).toContain('engineering');
        });

        it('is idempotent — safe to run multiple times', async () => {
            const channelDir = path.join(tmpDir, 'projects', 'sales', 'channels', 'outreach');
            await fs.mkdir(channelDir, { recursive: true });
            await fs.writeFile(path.join(channelDir, 'CLAUDE.md'), '# Outreach');

            // Write a file to output/ before hook runs
            await fs.mkdir(path.join(channelDir, 'output'), { recursive: true });
            await fs.writeFile(path.join(channelDir, 'output', 'posts.jsonl'), '{"test":"existing"}\n');

            runHook(tmpDir, 'Write', path.join(channelDir, 'CLAUDE.md'));

            // Existing posts.jsonl should not be truncated (touch is append-safe)
            const posts = await fs.readFile(path.join(channelDir, 'output', 'posts.jsonl'), 'utf-8');
            expect(posts).toContain('{"test":"existing"}');
        });
    });

    // ─────────────────────────────────────────────────────────
    // Non-matching paths
    // ─────────────────────────────────────────────────────────

    describe('non-matching paths', () => {
        it('does nothing for unrelated file writes', async () => {
            const result = runHook(tmpDir, 'Write', path.join(tmpDir, 'drive', 'company.md'));
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('');
        });

        it('does nothing for missing file path', async () => {
            const result = runHook(tmpDir, 'Write', '');
            expect(result.exitCode).toBe(0);
        });
    });
});
