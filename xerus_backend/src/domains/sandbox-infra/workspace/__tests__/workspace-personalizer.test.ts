// Workspace Personalizer Tests
// Tests for personalizeWorkspace — the post-clone dynamic content writes.
// Static files (CLAUDE.md, settings.json base, soul files, skills, shared office)
// come from the xerus-workspace template clone and are NOT tested here.

import { personalizeWorkspace } from '../workspace-personalizer.service';
import { SandboxFileSystem } from '../workspace.manager';
import { WORKSPACE_DIRECTORIES } from '../workspace.types';

// In-memory filesystem for testing (no mocks - real data structure)
function createInMemoryFs(): SandboxFileSystem & { files: Map<string, string>; dirs: Set<string> } {
    const files = new Map<string, string>();
    const dirs = new Set<string>();

    return {
        files,
        dirs,
        async mkdir(path: string): Promise<void> {
            dirs.add(path);
        },
        async writeFile(path: string, content: string): Promise<void> {
            files.set(path, content);
        },
        async readFile(path: string): Promise<string> {
            const content = files.get(path);
            if (content === undefined) {
                throw new Error(`File not found: ${path}`);
            }
            return content;
        },
        async exists(path: string): Promise<boolean> {
            return files.has(path) || dirs.has(path);
        },
        async rm(path: string): Promise<void> {
            files.delete(path);
            dirs.delete(path);
        },
        async list(path: string): Promise<string[]> {
            const results: string[] = [];
            for (const key of files.keys()) {
                if (key.startsWith(path + '/')) {
                    results.push(key.slice(path.length + 1).split('/')[0]);
                }
            }
            for (const key of dirs) {
                if (key.startsWith(path + '/')) {
                    results.push(key.slice(path.length + 1).split('/')[0]);
                }
            }
            return [...new Set(results)];
        },
    };
}

const BASE_PATH = '/workspace';

describe('personalizeWorkspace', () => {
    let fs: ReturnType<typeof createInMemoryFs>;

    beforeEach(() => {
        fs = createInMemoryFs();
    });

    describe('settings.json env injection', () => {
        it('injects XERUS_USER_ID and XERUS_WORKSPACE_ROOT into settings.json', async () => {
            const settingsPath = `${BASE_PATH}/${WORKSPACE_DIRECTORIES.claudeSettings}`;
            const baseSettings = {
                env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
                permissions: { allow: ['Read'] },
            };
            fs.files.set(settingsPath, JSON.stringify(baseSettings));

            await personalizeWorkspace(fs, { userId: 'user-42' }, BASE_PATH);

            const written = JSON.parse(fs.files.get(settingsPath)!);
            expect(written.env.XERUS_USER_ID).toBe('user-42');
            // Personalizer injects workspace root from basePath
            expect(written.env.XERUS_WORKSPACE_ROOT).toBe(BASE_PATH);
            // Derived browser paths
            expect(written.env.BROWSER_DATA_DIR).toBe(`${BASE_PATH}/.browser/chromium-data`);
            expect(written.env.BROWSER_STATE_DIR).toBe(`${BASE_PATH}/.browser/state`);
            // Preserves existing env vars
            expect(written.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe('1');
            // Preserves non-env keys
            expect(written.permissions.allow).toContain('Read');
        });

        it('does not fail when settings.json does not exist', async () => {
            await expect(
                personalizeWorkspace(fs, { userId: 'user-42' }, BASE_PATH)
            ).resolves.not.toThrow();
        });

        it('overwrites XERUS_USER_ID on re-run (always sets current user)', async () => {
            const settingsPath = `${BASE_PATH}/${WORKSPACE_DIRECTORIES.claudeSettings}`;
            fs.files.set(settingsPath, JSON.stringify({ env: { XERUS_USER_ID: 'old-user' } }));

            await personalizeWorkspace(fs, { userId: 'new-user' }, BASE_PATH);

            const written = JSON.parse(fs.files.get(settingsPath)!);
            expect(written.env.XERUS_USER_ID).toBe('new-user');
        });
    });

    describe('master memory seeds', () => {
        it('creates working.md for xerus-master', async () => {
            await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);

            const path = `${BASE_PATH}/${WORKSPACE_DIRECTORIES.memoryAgents}/xerus-master/working.md`;
            expect(fs.files.get(path)).toContain('Working Context');
        });

        it('creates expertise.md for xerus-master', async () => {
            await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);

            const path = `${BASE_PATH}/${WORKSPACE_DIRECTORIES.memoryAgents}/xerus-master/expertise.md`;
            expect(fs.files.get(path)).toContain('Expertise');
        });

        it('does not overwrite existing working.md', async () => {
            const path = `${BASE_PATH}/${WORKSPACE_DIRECTORIES.memoryAgents}/xerus-master/working.md`;
            const custom = '# Custom Working State';
            fs.files.set(path, custom);

            await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);

            expect(fs.files.get(path)).toBe(custom);
        });

        it('does not overwrite existing expertise.md', async () => {
            const path = `${BASE_PATH}/${WORKSPACE_DIRECTORIES.memoryAgents}/xerus-master/expertise.md`;
            const custom = '# Custom Expertise';
            fs.files.set(path, custom);

            await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);

            expect(fs.files.get(path)).toBe(custom);
        });
    });

    describe('company.db placeholder', () => {
        it('creates empty data/company.db placeholder', async () => {
            await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);

            const dbPath = `${BASE_PATH}/data/company.db`;
            expect(fs.files.has(dbPath)).toBe(true);
            expect(fs.files.get(dbPath)).toBe('');
        });

        it('does not overwrite existing company.db', async () => {
            const dbPath = `${BASE_PATH}/data/company.db`;
            fs.files.set(dbPath, 'existing-db-content');

            await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);

            expect(fs.files.get(dbPath)).toBe('existing-db-content');
        });
    });

    describe('drive seed files', () => {
        it('creates company.md and welcome.md in drive/', async () => {
            await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);

            const companyPath = `${BASE_PATH}/drive/company.md`;
            const welcomePath = `${BASE_PATH}/drive/welcome.md`;
            expect(fs.files.has(companyPath)).toBe(true);
            expect(fs.files.get(companyPath)).toContain('# Company');
            expect(fs.files.has(welcomePath)).toBe(true);
            expect(fs.files.get(welcomePath)).toContain('# Welcome to Xerus');
        });

        it('does not overwrite existing drive files', async () => {
            const companyPath = `${BASE_PATH}/drive/company.md`;
            fs.files.set(companyPath, '# My Real Company Info');

            await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);

            expect(fs.files.get(companyPath)).toBe('# My Real Company Info');
        });
    });

    describe('result shape', () => {
        it('reports success true', async () => {
            const result = await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);
            expect(result.success).toBe(true);
        });

        it('reports alreadyInitialized false on empty workspace', async () => {
            const result = await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);
            expect(result.alreadyInitialized).toBe(false);
        });

        it('reports alreadyInitialized true when agents dir exists', async () => {
            fs.dirs.add(`${BASE_PATH}/agents`);
            const result = await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);
            expect(result.alreadyInitialized).toBe(true);
        });

        it('lists only dynamically created files', async () => {
            const result = await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);
            // 2 agents (xerus-master, xerus-cto) x 2 files (working.md, expertise.md) + company.db + 2 drive seeds = 7
            expect(result.createdFiles.length).toBe(7);
        });
    });

    describe('idempotency', () => {
        it('is safe to run twice without duplicating files', async () => {
            const result1 = await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);
            expect(result1.success).toBe(true);
            expect(result1.createdFiles.length).toBe(7);

            const result2 = await personalizeWorkspace(fs, { userId: 'user-1' }, BASE_PATH);
            expect(result2.success).toBe(true);
            // No new files created on re-run (all exist already)
            expect(result2.createdFiles.length).toBe(0);
        });
    });
});
