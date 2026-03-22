// Memory File Writer Helpers
// Pure formatting and parsing functions for memory file operations.

import { GIT_MEMORY_ROOT, shellEscape } from './git-memory.types';
import type { SandboxCommandExecutor } from './git-memory.types';
import type { GitMemoryRepository } from './git-memory.repository';
import type { ProceduralEntry } from './memory-extractor.service';
import type { MemoryScope } from '../memory.types';
import { DirectoryListError } from './errors';

// Pattern to match a semantic fact line: "- FACT_TEXT (confidence: N.N)"
export const SEMANTIC_FACT_PATTERN = /^- (.+?) \(confidence: [\d.]+\)$/;

// Pattern to match a procedural section header: "### PATTERN_NAME"
const PROCEDURAL_HEADER_PATTERN = /^### (.+)$/;

// Pattern to match an action history line: "- [DATE] ..."
export const ACTION_HISTORY_LINE_PATTERN = /^- \[/;

export const ACTION_HISTORY_MAX_ENTRIES = 50;

/**
 * Strip the '.memory/' prefix from paths returned by path builder functions.
 * The GitMemoryRepository methods expect paths relative to .memory/.
 */
export function stripMemoryPrefix(path: string): string {
    const prefix = `${GIT_MEMORY_ROOT}/`;
    if (path.startsWith(prefix)) {
        return path.substring(prefix.length);
    }
    return path;
}

/**
 * Read a file from the repo, returning empty string if it does not exist.
 */
export async function readFileOrEmpty(
    repo: Pick<GitMemoryRepository, 'fileExists' | 'readFile'>,
    relativePath: string
): Promise<string> {
    const exists = await repo.fileExists(relativePath);
    return exists ? repo.readFile(relativePath) : '';
}

/**
 * List immediate subdirectory names within a .memory/ relative path.
 * Uses the sandbox executor to run `ls` on the resolved absolute path.
 * Returns empty array if the directory does not exist.
 * Throws DirectoryListError if the command fails for other reasons.
 */
export async function listSubdirectories(
    repo: Pick<GitMemoryRepository, 'fileExists' | 'resolveMemoryPath'>,
    executor: SandboxCommandExecutor,
    relativePath: string
): Promise<string[]> {
    const exists = await repo.fileExists(relativePath);
    if (!exists) {
        return [];
    }

    const absolutePath = repo.resolveMemoryPath(relativePath);
    const result = await executor.exec(`ls ${shellEscape(absolutePath, 'path')}`);
    if (result.exitCode !== 0) {
        // Fail-fast: throw error on command failure (permission denied, etc.)
        throw new DirectoryListError(absolutePath, result.stderr);
    }
    return result.stdout.trim().split('\n').filter((name) => name.length > 0 && !name.startsWith('.'));
}

export function formatWorkingContent(working: string): string {
    return `## Current State\n\n${working}\n`;
}

export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

export function normalizeFactKey(fact: string): string {
    return fact.toLowerCase().replace(/[.,;!?]+$/, '').trim();
}

export function formatProceduralPattern(pattern: ProceduralEntry): string {
    const steps = pattern.steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
    return `### ${pattern.pattern}\n${steps}`;
}

/**
 * Parse a procedural.md file into a Map of pattern name -> full section text.
 * Preserves ordering.
 */
export function parseProceduralSections(content: string): Map<string, string> {
    const sections = new Map<string, string>();
    if (!content || content.trim().length === 0) {
        return sections;
    }

    const lines = content.split('\n');
    let currentName: string | null = null;
    let currentLines: string[] = [];

    for (const line of lines) {
        const headerMatch = line.match(PROCEDURAL_HEADER_PATTERN);
        if (headerMatch) {
            if (currentName !== null) {
                sections.set(currentName, currentLines.join('\n').trim());
            }
            currentName = headerMatch[1];
            currentLines = [line];
        } else if (currentName !== null) {
            currentLines.push(line);
        }
    }

    if (currentName !== null) {
        sections.set(currentName, currentLines.join('\n').trim());
    }

    return sections;
}

// -----------------------------------------------------------------------------
// Scope Grouping
// -----------------------------------------------------------------------------

export interface ScopedEntries<T> {
    company: T[];
    project: T[];
    channel: T[];
    agent: T[];
    user: T[];
    entity: T[];
    topic: T[];
}

export function groupByScope<T extends { scope: MemoryScope }>(entries: T[]): ScopedEntries<T> {
    const result: ScopedEntries<T> = {
        company: [],
        project: [],
        channel: [],
        agent: [],
        user: [],
        entity: [],
        topic: [],
    };

    for (const entry of entries) {
        result[entry.scope].push(entry);
    }

    return result;
}
