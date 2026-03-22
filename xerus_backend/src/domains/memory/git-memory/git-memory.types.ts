// Git Memory Types
// Types specific to the Git-based memory system
// Reference: docs/planning/execution/git-memory-system.md

import { MemoryType, MemoryScope } from '../memory.types';
import { validateSlug, isValidSlug } from '../../../shared/slugify';
import { shellEscape } from '../../../utils/shell-safety';

// -----------------------------------------------------------------------------
// Git Memory Directory Layout
// -----------------------------------------------------------------------------

export const GIT_MEMORY_ROOT = '.memory' as const;

export const GIT_MEMORY_DIRECTORIES = {
    root: GIT_MEMORY_ROOT,
    agents: `${GIT_MEMORY_ROOT}/agents`,
    projects: `${GIT_MEMORY_ROOT}/projects`,
    shared: `${GIT_MEMORY_ROOT}/shared`,
} as const;

export const GIT_MEMORY_FILES = {
    workspace: `${GIT_MEMORY_ROOT}/workspace.md`,
    digest: `${GIT_MEMORY_ROOT}/digest.md`,
    commitLock: `${GIT_MEMORY_ROOT}/.commit.lock`,
} as const;

// Per-agent memory file names (v2 hierarchy: only working + expertise at agent level)
export const AGENT_MEMORY_FILES = {
    working: 'working.md',
    expertise: 'expertise.md',
    playbook: 'playbook.md',
} as const;

type AgentMemoryFileKey = keyof typeof AGENT_MEMORY_FILES;

// -----------------------------------------------------------------------------
// Commit Message Formats
// -----------------------------------------------------------------------------

export type CommitMessageType = 'compact' | 'session-end' | 'drm';

export interface CommitMessageParts {
    type: CommitMessageType;
    agentSlug: string;
    contextWindow?: number;
    summary: string;
}

// -----------------------------------------------------------------------------
// Git Operations
// -----------------------------------------------------------------------------

export interface GitCommitResult {
    sha: string;
    message: string;
    filesChanged: number;
}

export interface GitDiffResult {
    changedFiles: string[];
    addedFiles: string[];
    deletedFiles: string[];
}

// -----------------------------------------------------------------------------
// File Lock
// -----------------------------------------------------------------------------

export const COMMIT_LOCK_TIMEOUT_MS = 5000;
export const COMMIT_LOCK_RETRY_INTERVAL_MS = 50;

// -----------------------------------------------------------------------------
// Git Config
// -----------------------------------------------------------------------------

export const GIT_MEMORY_CONFIG = {
    userName: 'Xerus Memory',
    userEmail: 'memory@xerus.ai',
} as const;

export { validateSlug, isValidSlug };
export { shellEscape };

// -----------------------------------------------------------------------------
// Path Builders
// -----------------------------------------------------------------------------

export function buildAgentMemoryPath(agentSlug: string): string {
    validateSlug(agentSlug, 'agent slug');
    return `${GIT_MEMORY_DIRECTORIES.agents}/${agentSlug}`;
}

export function buildAgentFilePath(agentSlug: string, fileKey: AgentMemoryFileKey): string {
    validateSlug(agentSlug, 'agent slug');
    const fileName = AGENT_MEMORY_FILES[fileKey];
    return `${GIT_MEMORY_DIRECTORIES.agents}/${agentSlug}/${fileName}`;
}

export function buildProjectPath(projectSlug: string): string {
    validateSlug(projectSlug, 'project slug');
    return `${GIT_MEMORY_DIRECTORIES.projects}/${projectSlug}`;
}

export function buildChannelPath(projectSlug: string, channelSlug: string): string {
    validateSlug(projectSlug, 'project slug');
    validateSlug(channelSlug, 'channel slug');
    return `${GIT_MEMORY_DIRECTORIES.projects}/${projectSlug}/channels/${channelSlug}`;
}

export function buildCommitMessage(parts: CommitMessageParts): string {
    switch (parts.type) {
        case 'compact':
            return `compact:${parts.agentSlug}:ctx-${parts.contextWindow ?? 0}: ${parts.summary}`;
        case 'session-end':
            return `session-end:${parts.agentSlug}: ${parts.summary}`;
        case 'drm':
            return `drm:${parts.agentSlug}: ${parts.summary}`;
    }
}

// -----------------------------------------------------------------------------
// Sandbox Command Executor Interface
// -----------------------------------------------------------------------------

export interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export interface SandboxCommandExecutor {
    exec(command: string, cwd?: string): Promise<CommandResult>;
}

// -----------------------------------------------------------------------------
// Sandbox File System Interface (reuse from workspace)
// -----------------------------------------------------------------------------

export interface GitMemoryFileSystem {
    mkdir(path: string): Promise<void>;
    writeFile(path: string, content: string): Promise<void>;
    readFile(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    /**
     * Atomically create a file only if it does not already exist.
     * Returns true if the file was created, false if it already existed.
     * Used for file-based locking to avoid TOCTOU races.
     * Required: all implementations must provide atomic creation for lock safety.
     */
    tryExclusiveCreate(path: string, content: string): Promise<boolean>;
}

// -----------------------------------------------------------------------------
// Type re-exports for convenience
// -----------------------------------------------------------------------------

export { MemoryType, MemoryScope };
