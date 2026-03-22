// Git Memory Repository Tests
// Tests the Git-based memory repository service
// Uses real in-memory implementations (no mocks)

import {
    GitMemoryRepository,
    GitMemoryError,
    CommitLockError,
    GitCommandError,
} from '../git-memory.repository';
import {
    GIT_MEMORY_ROOT,
    GIT_MEMORY_CONFIG,
    CommandResult,
    SandboxCommandExecutor,
    GitMemoryFileSystem,
} from '../git-memory.types';

// -----------------------------------------------------------------------------
// In-Memory File System (real implementation, not a mock)
// -----------------------------------------------------------------------------

class InMemoryFileSystem implements GitMemoryFileSystem {
    private files: Map<string, string> = new Map();
    private directories: Set<string> = new Set();

    async mkdir(path: string): Promise<void> {
        this.directories.add(path);
        // Also add parent directories
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
            this.directories.add(parts.slice(0, i).join('/'));
        }
    }

    async writeFile(path: string, content: string): Promise<void> {
        this.files.set(path, content);
    }

    async readFile(path: string): Promise<string> {
        const content = this.files.get(path);
        if (content === undefined) {
            throw new Error(`File not found: ${path}`);
        }
        return content;
    }

    async exists(path: string): Promise<boolean> {
        return this.files.has(path) || this.directories.has(path);
    }

    // Test helpers
    getContent(path: string): string | undefined {
        return this.files.get(path);
    }

    getAllFiles(): string[] {
        return Array.from(this.files.keys());
    }

    clear(): void {
        this.files.clear();
        this.directories.clear();
    }
}

// -----------------------------------------------------------------------------
// Git Command Recorder (real tracking, no mocking)
// Records git commands and returns plausible results
// -----------------------------------------------------------------------------

class GitCommandRecorder implements SandboxCommandExecutor {
    public commands: string[] = [];
    private commitCount = 0;
    private stagedFiles: string[] = [];
    private hasChanges = true;
    private failNextCommand = false;
    private failStderr = '';

    async exec(command: string): Promise<CommandResult> {
        this.commands.push(command);

        if (this.failNextCommand) {
            this.failNextCommand = false;
            return { stdout: '', stderr: this.failStderr, exitCode: 1 };
        }

        // Simulate git init
        if (command.includes('git') && command.includes('init')) {
            return { stdout: 'Initialized empty Git repository', stderr: '', exitCode: 0 };
        }

        // Simulate git config
        if (command.includes('config')) {
            return { stdout: '', stderr: '', exitCode: 0 };
        }

        // Simulate git add
        if (command.includes('add')) {
            this.stagedFiles = ['working.md', 'expertise.md'];
            return { stdout: '', stderr: '', exitCode: 0 };
        }

        // Simulate git status --porcelain
        if (command.includes('status --porcelain')) {
            if (this.hasChanges) {
                return { stdout: 'M  agents/test/working.md\nA  agents/test/expertise.md', stderr: '', exitCode: 0 };
            }
            return { stdout: '', stderr: '', exitCode: 0 };
        }

        // Simulate git diff --cached --name-only
        if (command.includes('diff --cached --name-only')) {
            return { stdout: this.stagedFiles.join('\n'), stderr: '', exitCode: 0 };
        }

        // Simulate git diff HEAD~1 --name-only
        if (command.includes('diff') && command.includes('--name-only')) {
            if (this.commitCount < 2) {
                return { stdout: '', stderr: 'unknown revision', exitCode: 128 };
            }
            return { stdout: 'agents/test/working.md\nagents/test/expertise.md', stderr: '', exitCode: 0 };
        }

        // Simulate git commit
        if (command.includes('commit')) {
            this.commitCount++;
            return { stdout: `[main abc${this.commitCount}] commit message`, stderr: '', exitCode: 0 };
        }

        // Simulate git rev-parse HEAD
        if (command.includes('rev-parse HEAD')) {
            return { stdout: `abc${this.commitCount}def1234567890`, stderr: '', exitCode: 0 };
        }

        return { stdout: '', stderr: '', exitCode: 0 };
    }

    setNoChanges(): void {
        this.hasChanges = false;
    }

    setHasChanges(): void {
        this.hasChanges = true;
    }

    setMultipleCommits(): void {
        this.commitCount = 5;
    }

    setFailNextCommand(stderr: string): void {
        this.failNextCommand = true;
        this.failStderr = stderr;
    }

    getLastCommand(): string {
        return this.commands[this.commands.length - 1];
    }

    reset(): void {
        this.commands = [];
        this.commitCount = 0;
        this.stagedFiles = [];
        this.hasChanges = true;
        this.failNextCommand = false;
        this.failStderr = '';
    }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('GitMemoryRepository', () => {
    let fs: InMemoryFileSystem;
    let executor: GitCommandRecorder;
    let repo: GitMemoryRepository;
    const workspacePath = '/workspace';

    beforeEach(() => {
        fs = new InMemoryFileSystem();
        executor = new GitCommandRecorder();
        repo = new GitMemoryRepository(executor, fs, workspacePath);
    });

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    describe('initializeRepository', () => {
        it('should initialize git repo when .git does not exist', async () => {
            await repo.initializeRepository();

            // Should have run git init (shellEscape wraps paths in single quotes)
            expect(executor.commands).toEqual(
                expect.arrayContaining([
                    expect.stringContaining("git -C '/workspace/.memory' init"),
                ])
            );

            // Should have configured user.name and user.email
            expect(executor.commands).toEqual(
                expect.arrayContaining([
                    expect.stringContaining(`config user.name '${GIT_MEMORY_CONFIG.userName}'`),
                    expect.stringContaining(`config user.email '${GIT_MEMORY_CONFIG.userEmail}'`),
                ])
            );

            // Should have created .gitkeep and initial commit
            expect(executor.commands).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('add .gitkeep'),
                    expect.stringContaining('commit -m "init: initialize memory repository"'),
                ])
            );
        });

        it('should skip initialization when .git already exists', async () => {
            // Pre-create the .git directory
            await fs.mkdir(`${workspacePath}/${GIT_MEMORY_ROOT}/.git`);

            await repo.initializeRepository();

            // Should not have run any git commands
            expect(executor.commands).toHaveLength(0);
        });

        it('should create .memory directory during initialization', async () => {
            await repo.initializeRepository();

            const memoryDirExists = await fs.exists(`${workspacePath}/${GIT_MEMORY_ROOT}`);
            expect(memoryDirExists).toBe(true);
        });

        it('should create .gitkeep file', async () => {
            await repo.initializeRepository();

            const gitkeepContent = fs.getContent(`${workspacePath}/${GIT_MEMORY_ROOT}/.gitkeep`);
            expect(gitkeepContent).toBe('');
        });

        it('should handle concurrent initialization without double-init', async () => {
            await Promise.all([
                repo.initializeRepository(),
                repo.initializeRepository(),
            ]);

            // git init should be called exactly once despite two concurrent calls
            const initCommands = executor.commands.filter((c) => c.endsWith('init'));
            expect(initCommands).toHaveLength(1);
        });
    });

    describe('ensureAgentDirectory', () => {
        it('should create agent directory when it does not exist', async () => {
            await repo.ensureAgentDirectory('seo-agent');

            const dirExists = await fs.exists(`${workspacePath}/${GIT_MEMORY_ROOT}/agents/seo-agent`);
            expect(dirExists).toBe(true);
        });

        it('should not create directory when it already exists', async () => {
            await fs.mkdir(`${workspacePath}/${GIT_MEMORY_ROOT}/agents/seo-agent`);

            // Should not throw
            await repo.ensureAgentDirectory('seo-agent');
        });
    });

    // -------------------------------------------------------------------------
    // Commit Operations
    // -------------------------------------------------------------------------

    describe('commitChanges', () => {
        beforeEach(async () => {
            // Initialize repo so lock path directory exists
            await fs.mkdir(`${workspacePath}/${GIT_MEMORY_ROOT}`);
        });

        it('should stage, commit, and return result', async () => {
            const result = await repo.commitChanges('compact:seo-agent:ctx-1: keyword research');

            expect(result).not.toBeNull();
            expect(result!.message).toBe('compact:seo-agent:ctx-1: keyword research');
            expect(result!.sha).toMatch(/^abc/);
            expect(result!.filesChanged).toBeGreaterThan(0);
        });

        it('should run git add -A before commit', async () => {
            await repo.commitChanges('test commit');

            const addCommand = executor.commands.find((c) => c.includes('add -A'));
            expect(addCommand).toBeDefined();
        });

        it('should return null when there are no changes', async () => {
            executor.setNoChanges();

            const result = await repo.commitChanges('no changes');

            expect(result).toBeNull();
        });

        it('should acquire and release lock during commit', async () => {
            await repo.commitChanges('test commit');

            // Lock file should be empty (released)
            const lockContent = fs.getContent(`${workspacePath}/${GIT_MEMORY_ROOT}/.commit.lock`);
            expect(lockContent).toBe('');
        });

        it('should release lock even when commit fails', async () => {
            executor.setFailNextCommand('simulated failure');

            // First command after lock acquisition (git add) will fail
            // But we need to be more careful about which command fails
            // Let's just verify the lock is released after an error
            try {
                await repo.commitChanges('will fail');
            } catch {
                // Expected
            }

            // Lock should still be released
            const lockContent = fs.getContent(`${workspacePath}/${GIT_MEMORY_ROOT}/.commit.lock`);
            expect(lockContent).toBe('');
        });

        it('should wrap commit messages in single quotes via shellEscape', async () => {
            await repo.commitChanges('message with "quotes"');

            const commitCommand = executor.commands.find((c) => c.includes('commit -m'));
            expect(commitCommand).toContain("'message with \"quotes\"'");
        });
    });

    // -------------------------------------------------------------------------
    // Diff Operations
    // -------------------------------------------------------------------------

    describe('getChangedFiles', () => {
        it('should return changed files from diff', async () => {
            executor.setMultipleCommits();

            const files = await repo.getChangedFiles();

            expect(files).toEqual(['agents/test/working.md', 'agents/test/expertise.md']);
        });

        it('should return empty array when there is only one commit', async () => {
            const files = await repo.getChangedFiles();

            expect(files).toEqual([]);
        });

        it('should accept a custom since reference', async () => {
            executor.setMultipleCommits();

            await repo.getChangedFiles('abc123');

            const diffCommand = executor.commands.find((c) => c.includes("diff 'abc123'"));
            expect(diffCommand).toBeDefined();
        });
    });

    // -------------------------------------------------------------------------
    // File Operations
    // -------------------------------------------------------------------------

    describe('readFile', () => {
        it('should read a file relative to .memory/', async () => {
            await fs.writeFile(`${workspacePath}/${GIT_MEMORY_ROOT}/agents/test/working.md`, 'current state');

            const content = await repo.readFile('agents/test/working.md');

            expect(content).toBe('current state');
        });

        it('should throw when file does not exist', async () => {
            await expect(repo.readFile('nonexistent.md')).rejects.toThrow('File not found');
        });
    });

    describe('writeFile', () => {
        it('should write a file relative to .memory/', async () => {
            await fs.mkdir(`${workspacePath}/${GIT_MEMORY_ROOT}/agents/test`);

            await repo.writeFile('agents/test/working.md', 'new state');

            const content = fs.getContent(`${workspacePath}/${GIT_MEMORY_ROOT}/agents/test/working.md`);
            expect(content).toBe('new state');
        });

        it('should create parent directories if they do not exist', async () => {
            await repo.writeFile('agents/new-agent/working.md', 'initial');

            const content = fs.getContent(`${workspacePath}/${GIT_MEMORY_ROOT}/agents/new-agent/working.md`);
            expect(content).toBe('initial');
        });
    });

    describe('ensureDirectory', () => {
        it('should create directory if it does not exist', async () => {
            await repo.ensureDirectory('projects/marketing');

            const exists = await fs.exists(`${workspacePath}/${GIT_MEMORY_ROOT}/projects/marketing`);
            expect(exists).toBe(true);
        });

        it('should not throw if directory already exists', async () => {
            await fs.mkdir(`${workspacePath}/${GIT_MEMORY_ROOT}/projects/marketing`);

            await expect(repo.ensureDirectory('projects/marketing')).resolves.not.toThrow();
        });
    });

    describe('fileExists', () => {
        it('should return true for existing files', async () => {
            await fs.writeFile(`${workspacePath}/${GIT_MEMORY_ROOT}/workspace.md`, 'content');

            const exists = await repo.fileExists('workspace.md');
            expect(exists).toBe(true);
        });

        it('should return false for non-existing files', async () => {
            const exists = await repo.fileExists('nonexistent.md');
            expect(exists).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // Path Helpers
    // -------------------------------------------------------------------------

    describe('getMemoryAbsolutePath', () => {
        it('should return workspace path + .memory', () => {
            expect(repo.getMemoryAbsolutePath()).toBe('/workspace/.memory');
        });
    });

    describe('resolveMemoryPath', () => {
        it('should resolve relative paths to absolute paths', () => {
            expect(repo.resolveMemoryPath('agents/test/working.md')).toBe(
                '/workspace/.memory/agents/test/working.md'
            );
        });
    });

    // -------------------------------------------------------------------------
    // Error Classes
    // -------------------------------------------------------------------------

    describe('Error classes', () => {
        it('GitMemoryError should have correct name', () => {
            const error = new GitMemoryError('test');
            expect(error.name).toBe('GitMemoryError');
            expect(error.message).toBe('test');
        });

        it('CommitLockError should have correct name and message', () => {
            const error = new CommitLockError(5000);
            expect(error.name).toBe('CommitLockError');
            expect(error.message).toContain('5000ms');
        });

        it('GitCommandError should have correct properties', () => {
            const error = new GitCommandError('git commit', 1, 'nothing to commit');
            expect(error.name).toBe('GitCommandError');
            expect(error.command).toBe('git commit');
            expect(error.exitCode).toBe(1);
            expect(error.stderr).toBe('nothing to commit');
        });
    });
});
