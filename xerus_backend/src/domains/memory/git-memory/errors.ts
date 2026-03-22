// Git Memory Errors
// Domain-specific error classes for the git-memory module.
// Extends AppError so the error handler returns proper HTTP status codes.

import { AppError } from '../../../utils/errors';

// -----------------------------------------------------------------------------
// Base Error
// -----------------------------------------------------------------------------

export class GitMemoryError extends AppError {
    constructor(message: string, statusCode = 500, code = 'GIT_MEMORY_ERROR') {
        super(message, statusCode, code);
    }
}

// -----------------------------------------------------------------------------
// Specific Errors
// -----------------------------------------------------------------------------

export class CommitLockError extends GitMemoryError {
    public readonly timeoutMs: number;

    constructor(timeoutMs: number) {
        super(`Failed to acquire commit lock within ${timeoutMs}ms`, 409, 'COMMIT_LOCK_TIMEOUT');
        this.timeoutMs = timeoutMs;
    }
}

export class GitCommandError extends GitMemoryError {
    public readonly command: string;
    public readonly exitCode: number;
    public readonly stderr: string;

    constructor(command: string, exitCode: number, stderr: string) {
        super(`Git command failed (exit ${exitCode}): ${command}\n${stderr}`, 500, 'GIT_COMMAND_FAILED');
        this.command = command;
        this.exitCode = exitCode;
        this.stderr = stderr;
    }
}

export class DirectoryListError extends GitMemoryError {
    public readonly path: string;
    public readonly stderr: string;

    constructor(path: string, stderr: string) {
        super(`Failed to list directory: ${path}\n${stderr}`, 500, 'DIRECTORY_LIST_FAILED');
        this.path = path;
        this.stderr = stderr;
    }
}
