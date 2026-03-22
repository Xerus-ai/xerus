// Workspace Setup Tests
// Verifies that sandbox setup correctly:
// 1. Initializes .git at workspace root (SDK project root detection)
// 2. Installs sqlite3 CLI (required by init-db.sh shell hook)
// 3. workspace-clone includes git init after deleting template .git
//
// Bug: workspace-clone.ts deleted .git after cloning template.
// SDK uses .git as project root marker to discover .claude/settings.json.
// Without it, shell hooks (activity log, SQLite init, skill activation) never fire.

import { SANDBOX_CONFIG } from '../sandbox.config';
import { GIT_MEMORY_CONFIG } from '../../../memory/git-memory/git-memory.types';

// In-memory provider that captures executed commands
class FakeProvider {
    public executedCommands: string[] = [];
    // Ordered list of (pattern, result) — first match wins
    public commandResults: Array<{ pattern: string; result: { result: string; exitCode: number } }> = [];

    setResult(pattern: string, result: { result: string; exitCode: number }): void {
        this.commandResults.push({ pattern, result });
    }

    async executeCommand(_sandboxId: string, command: string): Promise<{ result: string; exitCode: number }> {
        this.executedCommands.push(command);

        // Check for specific test overrides (first match wins)
        for (const entry of this.commandResults) {
            if (command.includes(entry.pattern)) {
                return entry.result;
            }
        }

        // Default: command succeeds
        return { result: '', exitCode: 0 };
    }

    async createFileSystem(_sandboxId: string) {
        return {
            mkdir: async () => {},
            writeFile: async () => {},
            exists: async () => false,
        };
    }
}

class FakeDatabase {
    async query<T>(): Promise<{ rows: T[] }> {
        return { rows: [] };
    }
}

function createSetupDeps(provider: FakeProvider) {
    return {
        getDaytonaProvider: () => provider as any,
        getSandboxFs: async () => ({
            exists: async () => false,
            writeFile: async () => {},
            mkdir: async () => {},
            readFile: async () => '',
            rm: async () => {},
            list: async () => [],
        }),
        db: new FakeDatabase() as any,
    };
}

describe('workspace-clone git init', () => {
    it('clone command should include git init after deleting template .git', async () => {
        // Import dynamically to get fresh module
        const { cloneWorkspaceTemplate } = await import('../workspace-clone');
        const provider = new FakeProvider();

        // The clone command is a single string with && chaining
        await cloneWorkspaceTemplate(provider as any, 'sbx-test');

        expect(provider.executedCommands.length).toBe(1);
        const cmd = provider.executedCommands[0];

        // Should delete .git first (remove template history)
        expect(cmd).toContain("rm -rf /tmp/xerus-workspace-clone");
        expect(cmd).toContain(".git'");

        // Should re-init .git for SDK project root detection
        // Command format: git -C '/home/daytona' init (not bare 'git init')
        const gitInitPattern = `git -C '${SANDBOX_CONFIG.workspacePath}' init`;
        expect(cmd).toContain(gitInitPattern);

        // Should configure git user (required for commits)
        expect(cmd).toContain(GIT_MEMORY_CONFIG.userName);
        expect(cmd).toContain(GIT_MEMORY_CONFIG.userEmail);

        // Order matters: rm .git THEN git -C init
        const rmIndex = cmd.indexOf('rm -rf');
        const initIndex = cmd.indexOf(gitInitPattern, rmIndex);
        expect(initIndex).toBeGreaterThan(rmIndex);
    });
});

describe('runFullWorkspaceSetup', () => {
    it('should initialize .git at workspace root when missing', async () => {
        const { runFullWorkspaceSetup } = await import('../sandbox-setup');
        const provider = new FakeProvider();

        // Both .git dirs missing — match on unique substrings
        provider.setResult("/.git' &&", { result: 'MISSING', exitCode: 0 });
        provider.setResult("/.memory/.git' &&", { result: 'MISSING', exitCode: 0 });
        provider.setResult("which sqlite3", { result: '/usr/bin/sqlite3\nFOUND', exitCode: 0 });

        const deps = createSetupDeps(provider);
        const report = await runFullWorkspaceSetup('sbx-test', 'user-1', deps);

        // Find the git init command for workspace root (not .memory)
        const initPattern = `git -C '${SANDBOX_CONFIG.workspacePath}' init`;
        const gitInitCmd = provider.executedCommands.find(
            cmd => cmd.includes(initPattern) && !cmd.includes('.memory')
        );
        expect(gitInitCmd).toBeDefined();
        expect(gitInitCmd).toContain(initPattern);

        // SetupReport should reflect what was done
        expect(report.git_initialized).toBe(true);
        expect(report.memory_git_initialized).toBe(true);
        expect(report.sqlite_installed).toBe(false);
        expect(report.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should skip .git init when already exists', async () => {
        const { runFullWorkspaceSetup } = await import('../sandbox-setup');
        const provider = new FakeProvider();

        // Root .git exists, memory .git exists
        provider.setResult("test -d '" + SANDBOX_CONFIG.workspacePath + "/.git'", { result: 'EXISTS', exitCode: 0 });
        provider.setResult("test -d '" + SANDBOX_CONFIG.workspacePath + "/.memory/.git'", { result: 'EXISTS', exitCode: 0 });
        provider.setResult("which sqlite3", { result: '/usr/bin/sqlite3\nFOUND', exitCode: 0 });

        const deps = createSetupDeps(provider);
        const report = await runFullWorkspaceSetup('sbx-test', 'user-1', deps);

        // Report should reflect nothing was initialized
        expect(report.git_initialized).toBe(false);
        expect(report.memory_git_initialized).toBe(false);
        expect(report.sqlite_installed).toBe(false);

        // Should NOT run git init for root (idempotent)
        const rootInitPattern = `git -C '${SANDBOX_CONFIG.workspacePath}' init`;
        const gitInitCmds = provider.executedCommands.filter(
            cmd => cmd.includes(rootInitPattern) && !cmd.includes('.memory')
        );
        expect(gitInitCmds.length).toBe(0);
    });

    it('should install sqlite3 when missing', async () => {
        const { runFullWorkspaceSetup } = await import('../sandbox-setup');
        const provider = new FakeProvider();

        provider.setResult("test -d '" + SANDBOX_CONFIG.workspacePath + "/.git'", { result: 'EXISTS', exitCode: 0 });
        provider.setResult("test -d '" + SANDBOX_CONFIG.workspacePath + "/.memory/.git'", { result: 'EXISTS', exitCode: 0 });
        provider.setResult("which sqlite3", { result: 'MISSING', exitCode: 0 });

        const deps = createSetupDeps(provider);
        await runFullWorkspaceSetup('sbx-test', 'user-1', deps);

        const sqliteCmd = provider.executedCommands.find(
            cmd => cmd.includes('apt-get') && cmd.includes('sqlite3')
        );
        expect(sqliteCmd).toBeDefined();
    });

    it('should skip sqlite3 install when already present', async () => {
        const { runFullWorkspaceSetup } = await import('../sandbox-setup');
        const provider = new FakeProvider();

        provider.setResult("test -d '" + SANDBOX_CONFIG.workspacePath + "/.git'", { result: 'EXISTS', exitCode: 0 });
        provider.setResult("test -d '" + SANDBOX_CONFIG.workspacePath + "/.memory/.git'", { result: 'EXISTS', exitCode: 0 });
        provider.setResult("which sqlite3", { result: '/usr/bin/sqlite3\nFOUND', exitCode: 0 });

        const deps = createSetupDeps(provider);
        await runFullWorkspaceSetup('sbx-test', 'user-1', deps);

        const sqliteCmd = provider.executedCommands.find(
            cmd => cmd.includes('apt-get') && cmd.includes('sqlite3')
        );
        expect(sqliteCmd).toBeUndefined();
    });

    it('should run steps in correct order: git init -> context dirs -> sqlite -> agent sync', async () => {
        const { runFullWorkspaceSetup } = await import('../sandbox-setup');
        const provider = new FakeProvider();

        provider.setResult("test -d '" + SANDBOX_CONFIG.workspacePath + "/.git'", { result: 'MISSING', exitCode: 0 });
        provider.setResult("test -d '" + SANDBOX_CONFIG.workspacePath + "/.memory/.git'", { result: 'MISSING', exitCode: 0 });
        provider.setResult("which sqlite3", { result: 'MISSING', exitCode: 0 });

        const deps = createSetupDeps(provider);
        await runFullWorkspaceSetup('sbx-test', 'user-1', deps);

        // Find indices of key commands
        const rootInitPattern = `git -C '${SANDBOX_CONFIG.workspacePath}' init`;
        const gitInitIdx = provider.executedCommands.findIndex(
            cmd => cmd.includes(rootInitPattern) && !cmd.includes('.memory')
        );
        const mkdirIdx = provider.executedCommands.findIndex(
            cmd => cmd.includes('mkdir -p') && cmd.includes('context')
        );
        const sqliteIdx = provider.executedCommands.findIndex(
            cmd => cmd.includes('sqlite3') && cmd.includes('apt-get')
        );

        // git init should come before mkdir, mkdir before sqlite
        expect(gitInitIdx).toBeGreaterThanOrEqual(0);
        expect(mkdirIdx).toBeGreaterThan(gitInitIdx);
        expect(sqliteIdx).toBeGreaterThan(mkdirIdx);
    });
});
