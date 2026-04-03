// Git Memory Repository Service
// Manages the .memory/ Git repository on the Daytona workspace volume
// Reference: docs/planning/execution/git-memory-system.md (Phase 1)

import {
    GIT_MEMORY_ROOT,
    GIT_MEMORY_CONFIG,
    COMMIT_LOCK_TIMEOUT_MS,
    COMMIT_LOCK_RETRY_INTERVAL_MS,
    GitCommitResult,
    SandboxCommandExecutor,
    GitMemoryFileSystem,
    buildAgentMemoryPath,
    shellEscape,
} from './git-memory.types';
import { stripMemoryPrefix } from './memory-file-writer.helpers';
import { GitMemoryError, CommitLockError, GitCommandError } from './errors';
import { logger } from '../../../utils/logger';

const log = logger('GitMemoryRepository');

// -----------------------------------------------------------------------------
// Git Memory Repository
// -----------------------------------------------------------------------------

export class GitMemoryRepository {
    private readonly executor: SandboxCommandExecutor;
    private readonly fs: GitMemoryFileSystem;
    private readonly workspacePath: string;
    private initPromise: Promise<void> | null = null;

    constructor(
        executor: SandboxCommandExecutor,
        fs: GitMemoryFileSystem,
        workspacePath: string
    ) {
        this.executor = executor;
        this.fs = fs;
        this.workspacePath = workspacePath;
    }

    // -------------------------------------------------------------------------
    // Repository Initialization
    // -------------------------------------------------------------------------

    /**
     * Initialize the .memory/ Git repository if it does not already exist.
     * Configures git user.name and user.email for commits.
     * Uses an in-process Promise guard to prevent concurrent initialization.
     */
    async initializeRepository(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise;
        }
        this.initPromise = this.performInitialization();
        try {
            await this.initPromise;
        } catch (error) {
            this.initPromise = null;
            throw error;
        }
    }

    private async performInitialization(): Promise<void> {
        const memoryPath = this.getMemoryAbsolutePath();
        const gitDir = `${memoryPath}/.git`;
        const initLockPath = `${memoryPath}/.init.lock`;

        const gitExists = await this.fs.exists(gitDir);
        if (gitExists) {
            return;
        }

        // Create .memory/ directory first so lock file has a home
        await this.fs.mkdir(memoryPath);

        // Acquire init lock to prevent cross-process races
        await this.acquireInitLock(initLockPath);
        try {
            // Re-check after acquiring lock (another process may have initialized)
            const gitExistsAfterLock = await this.fs.exists(gitDir);
            if (gitExistsAfterLock) {
                return;
            }

            // Initialize git repo
            await this.execGit('init');

            // Configure user identity for commits
            await this.execGit(`config user.name ${shellEscape(GIT_MEMORY_CONFIG.userName)}`);
            await this.execGit(`config user.email ${shellEscape(GIT_MEMORY_CONFIG.userEmail)}`);

            // Create initial commit with a .gitkeep so the repo has a HEAD
            const gitkeepPath = `${memoryPath}/.gitkeep`;
            await this.fs.writeFile(gitkeepPath, '');
            await this.execGit('add .gitkeep');
            await this.execGit('commit -m "init: initialize memory repository"');
        } finally {
            await this.releaseInitLock(initLockPath);
        }
    }

    /**
     * Ensure the agent memory directory exists within .memory/.
     */
    async ensureAgentDirectory(agentSlug: string): Promise<void> {
        const agentPath = `${this.getMemoryAbsolutePath()}/${stripMemoryPrefix(buildAgentMemoryPath(agentSlug))}`;
        const agentDirExists = await this.fs.exists(agentPath);
        if (!agentDirExists) {
            await this.fs.mkdir(agentPath);
        }
    }

    // -------------------------------------------------------------------------
    // Commit Operations
    // -------------------------------------------------------------------------

    /**
     * Stage all changes in .memory/ and commit with the given message.
     * Acquires a file lock to prevent concurrent commits.
     *
     * Returns null if there are no changes to commit.
     */
    async commitChanges(message: string): Promise<GitCommitResult | null> {
        await this.acquireLock();

        try {
            // Stage all changes in .memory/
            await this.execGit('add -A');

            // Check if there are staged changes
            const statusResult = await this.execGit('status --porcelain');
            if (statusResult.stdout.trim() === '') {
                return null;
            }

            // Count files being committed
            const diffResult = await this.execGit('diff --cached --name-only');
            const changedFiles = diffResult.stdout.trim().split('\n').filter(Boolean);

            // Commit
            await this.execGit(`commit -m ${shellEscape(message)}`);

            // Get the commit SHA
            const shaResult = await this.execGit('rev-parse HEAD');
            const sha = shaResult.stdout.trim();

            return {
                sha,
                message,
                filesChanged: changedFiles.length,
            };
        } finally {
            await this.releaseLock();
        }
    }

    // -------------------------------------------------------------------------
    // Diff Operations
    // -------------------------------------------------------------------------

    /**
     * Get the list of files changed since a reference point.
     * If `since` is provided, uses it as a commit ref. Otherwise diffs HEAD~1.
     */
    async getChangedFiles(since?: string): Promise<string[]> {
        const ref = since || 'HEAD~1';

        // Validate ref to prevent command injection (only allow safe git ref characters)
        if (!/^[a-zA-Z0-9_.~^/ -]+$/.test(ref)) {
            throw new GitCommandError(`diff ${ref}`, 1, `Invalid git ref: ${ref}`);
        }

        try {
            const result = await this.execGit(`diff ${shellEscape(ref)} --name-only`);
            return result.stdout.trim().split('\n').filter(Boolean);
        } catch (error) {
            // If there's only one commit, HEAD~1 fails. Return empty.
            if (error instanceof GitCommandError && error.stderr.includes('unknown revision')) {
                return [];
            }
            throw error;
        }
    }

    /**
     * Get the list of files changed in a specific commit (not against working tree).
     * Uses `git show --name-only` to get exactly the files in that commit.
     */
    async getFilesInCommit(sha: string): Promise<string[]> {
        if (!/^[a-f0-9]{7,40}$/.test(sha)) {
            throw new GitCommandError(`show ${sha}`, 1, `Invalid commit SHA: ${sha}`);
        }
        const result = await this.execGit(`show --name-only --format= ${shellEscape(sha)}`);
        return result.stdout.trim().split('\n').filter(Boolean);
    }

    // -------------------------------------------------------------------------
    // File Operations within .memory/
    // -------------------------------------------------------------------------

    /**
     * Read a file from the .memory/ directory.
     * Path is relative to .memory/ (e.g., "agents/seo-agent/working.md").
     */
    async readFile(relativePath: string): Promise<string> {
        const absolutePath = this.resolveMemoryPath(relativePath);
        return this.fs.readFile(absolutePath);
    }

    /**
     * Write content to a file in the .memory/ directory.
     * Path is relative to .memory/ (e.g., "agents/seo-agent/working.md").
     * Parent directories are created automatically.
     */
    async writeFile(relativePath: string, content: string): Promise<void> {
        const absolutePath = this.resolveMemoryPath(relativePath);

        // Ensure parent directory exists
        const parentDir = absolutePath.substring(0, absolutePath.lastIndexOf('/'));
        const parentExists = await this.fs.exists(parentDir);
        if (!parentExists) {
            await this.fs.mkdir(parentDir);
        }

        await this.fs.writeFile(absolutePath, content);
    }

    /**
     * Ensure a directory exists within .memory/.
     * Path is relative to .memory/ (e.g., "agents/seo-agent").
     */
    async ensureDirectory(relativePath: string): Promise<void> {
        const absolutePath = this.resolveMemoryPath(relativePath);
        const exists = await this.fs.exists(absolutePath);
        if (!exists) {
            await this.fs.mkdir(absolutePath);
        }
    }

    /**
     * Check if a file exists in the .memory/ directory.
     * Path is relative to .memory/.
     */
    async fileExists(relativePath: string): Promise<boolean> {
        const absolutePath = this.resolveMemoryPath(relativePath);
        return this.fs.exists(absolutePath);
    }

    // -------------------------------------------------------------------------
    // Path Helpers
    // -------------------------------------------------------------------------

    /**
     * Get the absolute path of the .memory/ directory on the workspace volume.
     */
    getMemoryAbsolutePath(): string {
        return `${this.workspacePath}/${GIT_MEMORY_ROOT}`;
    }

    /**
     * Resolve a relative path within .memory/ to an absolute path.
     * Validates that the resolved path stays within the .memory/ directory.
     */
    resolveMemoryPath(relativePath: string): string {
        if (relativePath.includes('..')) {
            throw new GitMemoryError(`Path traversal detected: ${relativePath}`);
        }
        const memoryBase = this.getMemoryAbsolutePath();
        const resolved = `${memoryBase}/${relativePath}`;
        // Normalize path separators and verify containment
        const normalizedBase = memoryBase.replace(/\\/g, '/');
        const normalizedResolved = resolved.replace(/\\/g, '/');
        if (!normalizedResolved.startsWith(normalizedBase + '/')) {
            throw new GitMemoryError(`Path escapes memory directory: ${relativePath}`);
        }
        return resolved;
    }

    // -------------------------------------------------------------------------
    // Init Lock (prevents cross-process init races)
    // -------------------------------------------------------------------------

    private async acquireInitLock(lockPath: string): Promise<void> {
        const startTime = Date.now();
        while (Date.now() - startTime < COMMIT_LOCK_TIMEOUT_MS) {
            // Atomic creation: only one process can create the file
            const created = await this.fs.tryExclusiveCreate(lockPath, `init:${Date.now()}`);
            if (created) return;
            await this.sleep(COMMIT_LOCK_RETRY_INTERVAL_MS);
        }
        throw new CommitLockError(COMMIT_LOCK_TIMEOUT_MS);
    }

    private async releaseInitLock(lockPath: string): Promise<void> {
        // Remove the lock file so the next tryExclusiveCreate can succeed
        try {
            await this.executor.exec(`rm -f ${shellEscape(lockPath)}`);
        } catch (err) {
            log.warn('Lock release failed', { lock_path: lockPath, error: (err as Error).message });
            await this.fs.writeFile(lockPath, '');
        }
    }

    // -------------------------------------------------------------------------
    // Commit Lock Management
    // -------------------------------------------------------------------------

    /**
     * Get the lock file path relative to .memory/.
     */
    private getLockPath(): string {
        return `${this.getMemoryAbsolutePath()}/.commit.lock`;
    }

    private async acquireLock(): Promise<void> {
        const lockPath = this.getLockPath();
        const startTime = Date.now();

        while (Date.now() - startTime < COMMIT_LOCK_TIMEOUT_MS) {
            const created = await this.fs.tryExclusiveCreate(lockPath, `locked:${Date.now()}`);
            if (created) return;
            await this.sleep(COMMIT_LOCK_RETRY_INTERVAL_MS);
        }

        throw new CommitLockError(COMMIT_LOCK_TIMEOUT_MS);
    }

    private async releaseLock(): Promise<void> {
        const lockPath = this.getLockPath();
        try {
            await this.executor.exec(`rm -f ${shellEscape(lockPath)}`);
        } catch (err) {
            log.warn('Commit lock release failed', { lock_path: lockPath, error: (err as Error).message });
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // -------------------------------------------------------------------------
    // Git Command Execution
    // -------------------------------------------------------------------------

    private async execGit(args: string): Promise<{ stdout: string; stderr: string }> {
        const memoryPath = this.getMemoryAbsolutePath();
        const command = `git -C ${shellEscape(memoryPath)} ${args}`;

        const result = await this.executor.exec(command);

        if (result.exitCode !== 0) {
            throw new GitCommandError(command, result.exitCode, result.stderr);
        }

        return { stdout: result.stdout, stderr: result.stderr };
    }
}
