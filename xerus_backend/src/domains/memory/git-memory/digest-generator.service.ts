// Digest Generator Service
// Generates channel, project, and workspace digests for cross-team visibility.
// Background job entry point: regenerateAllDigests() runs periodically.
// Propagation is bottom-up: channel -> project -> workspace.
// Reference: docs/planning/execution/git-memory-system.md (Digest System section)

import { GitMemoryRepository } from './git-memory.repository';
import type { SandboxCommandExecutor } from './git-memory.types';
import {
    GIT_MEMORY_DIRECTORIES,
    GIT_MEMORY_FILES,
    buildProjectPath,
    buildChannelPath,
} from './git-memory.types';
import { stripMemoryPrefix, listSubdirectories } from './memory-file-writer.helpers';

// -----------------------------------------------------------------------------
// Public Types
// -----------------------------------------------------------------------------

export interface DigestGeneratorOptions {
    maxEntriesPerSection?: number;
    includeTimestamps?: boolean;
}

export interface DigestEntry {
    summary: string;
    timestamp: string;
    source: string;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_MAX_ENTRIES_PER_SECTION = 10;
const DEFAULT_INCLUDE_TIMESTAMPS = true;

// Pattern to match a log entry: "- [DATE] [AGENT] EVENT -> OUTCOME"
const LOG_ENTRY_PATTERN = /^- \[(\d{4}-\d{2}-\d{2})\]\s*\[([^\]]+)\]\s*(.+)$/;

// Pattern to match a simpler entry: "- [DATE] EVENT -> OUTCOME"
const SIMPLE_ENTRY_PATTERN = /^- \[(\d{4}-\d{2}-\d{2})\]\s*(.+)$/;

// Pattern to match a digest section entry: "- CONTENT"
const DIGEST_LINE_PATTERN = /^- (.+)$/;

// -----------------------------------------------------------------------------
// Digest Generator Service
// -----------------------------------------------------------------------------

export class DigestGeneratorService {
    private readonly repo: GitMemoryRepository;
    private readonly executor: SandboxCommandExecutor;

    constructor(repo: GitMemoryRepository, executor: SandboxCommandExecutor) {
        this.repo = repo;
        this.executor = executor;
    }

    // -------------------------------------------------------------------------
    // Channel Digest
    // -------------------------------------------------------------------------

    async generateChannelDigest(
        _workspaceId: string,
        projectSlug: string,
        channelSlug: string,
        options?: DigestGeneratorOptions
    ): Promise<string> {
        const maxEntries = options?.maxEntriesPerSection ?? DEFAULT_MAX_ENTRIES_PER_SECTION;
        const includeTimestamps = options?.includeTimestamps ?? DEFAULT_INCLUDE_TIMESTAMPS;

        const channelDir = stripMemoryPrefix(buildChannelPath(projectSlug, channelSlug));
        const channelFilePath = `${channelDir}/channel.md`;

        const entries = await this.parseLogEntries(channelFilePath);

        if (entries.length === 0) {
            const digest = '## Channel Digest\n\nNo recent activity.\n';
            await this.writeDigest(`${channelDir}/digest.md`, digest);
            return digest;
        }

        const truncated = entries.slice(-maxEntries);
        const lines = truncated.map((e) => formatDigestEntry(e, includeTimestamps));

        const digest = `## Recent Activity\n\n${lines.join('\n')}\n`;
        await this.writeDigest(`${channelDir}/digest.md`, digest);
        return digest;
    }

    // -------------------------------------------------------------------------
    // Project Digest
    // -------------------------------------------------------------------------

    async generateProjectDigest(
        _workspaceId: string,
        projectSlug: string,
        options?: DigestGeneratorOptions
    ): Promise<string> {
        const maxEntries = options?.maxEntriesPerSection ?? DEFAULT_MAX_ENTRIES_PER_SECTION;
        const includeTimestamps = options?.includeTimestamps ?? DEFAULT_INCLUDE_TIMESTAMPS;

        const projectDir = stripMemoryPrefix(buildProjectPath(projectSlug));
        const sections: string[] = [];

        // Collect from channel digests
        const channelSlugs = await listSubdirectories(this.repo, this.executor,`${projectDir}/channels`);
        for (const channelSlug of channelSlugs) {
            const digestPath = `${projectDir}/channels/${channelSlug}/digest.md`;
            const digestEntries = await this.parseDigestEntries(digestPath);

            if (digestEntries.length > 0) {
                const truncated = digestEntries.slice(-maxEntries);
                const lines = truncated.map((e) => formatDigestEntry(e, includeTimestamps));
                sections.push(`## ${channelSlug}\n\n${lines.join('\n')}`);
            }
        }

        // Collect from project.md (project-level log)
        const projectFilePath = `${projectDir}/project.md`;
        const projectEntries = await this.parseLogEntries(projectFilePath);
        if (projectEntries.length > 0) {
            const truncated = projectEntries.slice(-maxEntries);
            const lines = truncated.map((e) => formatDigestEntry(e, includeTimestamps));
            sections.push(`## Project Activity\n\n${lines.join('\n')}`);
        }

        if (sections.length === 0) {
            const digest = '## Project Digest\n\nNo recent activity.\n';
            await this.writeDigest(`${projectDir}/digest.md`, digest);
            return digest;
        }

        const digest = sections.join('\n\n') + '\n';
        await this.writeDigest(`${projectDir}/digest.md`, digest);
        return digest;
    }

    // -------------------------------------------------------------------------
    // Workspace Digest
    // -------------------------------------------------------------------------

    async generateWorkspaceDigest(
        _workspaceId: string,
        options?: DigestGeneratorOptions
    ): Promise<string> {
        const maxEntries = options?.maxEntriesPerSection ?? DEFAULT_MAX_ENTRIES_PER_SECTION;
        const includeTimestamps = options?.includeTimestamps ?? DEFAULT_INCLUDE_TIMESTAMPS;

        const projectsDir = stripMemoryPrefix(GIT_MEMORY_DIRECTORIES.projects);
        const projectSlugs = await listSubdirectories(this.repo, this.executor,projectsDir);

        const sections: string[] = [];

        for (const projectSlug of projectSlugs) {
            const digestPath = `${projectsDir}/${projectSlug}/digest.md`;
            const digestEntries = await this.parseDigestEntries(digestPath);

            if (digestEntries.length > 0) {
                const truncated = digestEntries.slice(-maxEntries);
                const lines = truncated.map((e) => formatDigestEntry(e, includeTimestamps));
                sections.push(`## ${projectSlug}\n\n${lines.join('\n')}`);
            }
        }

        if (sections.length === 0) {
            const digest = '## Workspace Digest\n\nNo recent activity.\n';
            await this.writeDigest(stripMemoryPrefix(GIT_MEMORY_FILES.digest), digest);
            return digest;
        }

        const digest = sections.join('\n\n') + '\n';
        await this.writeDigest(stripMemoryPrefix(GIT_MEMORY_FILES.digest), digest);
        return digest;
    }

    // -------------------------------------------------------------------------
    // Full Regeneration (background job entry point)
    // -------------------------------------------------------------------------

    async regenerateAllDigests(
        workspaceId: string,
        options?: DigestGeneratorOptions
    ): Promise<void> {
        const projectsDir = stripMemoryPrefix(GIT_MEMORY_DIRECTORIES.projects);
        const projectSlugs = await listSubdirectories(this.repo, this.executor,projectsDir);

        // Phase 1: Generate all channel digests
        for (const projectSlug of projectSlugs) {
            const channelsDir = `${projectsDir}/${projectSlug}/channels`;
            const channelSlugs = await listSubdirectories(this.repo, this.executor,channelsDir);

            for (const channelSlug of channelSlugs) {
                await this.generateChannelDigest(workspaceId, projectSlug, channelSlug, options);
            }
        }

        // Phase 2: Generate all project digests (reads channel digests)
        for (const projectSlug of projectSlugs) {
            await this.generateProjectDigest(workspaceId, projectSlug, options);
        }

        // Phase 3: Generate workspace digest (reads project digests)
        await this.generateWorkspaceDigest(workspaceId, options);
    }

    // -------------------------------------------------------------------------
    // Parsing Helpers
    // -------------------------------------------------------------------------

    private async parseLogEntries(relativePath: string): Promise<DigestEntry[]> {
        const exists = await this.repo.fileExists(relativePath);
        if (!exists) {
            return [];
        }

        const content = await this.repo.readFile(relativePath);
        return parseLogContent(content);
    }

    private async parseDigestEntries(relativePath: string): Promise<DigestEntry[]> {
        const exists = await this.repo.fileExists(relativePath);
        if (!exists) {
            return [];
        }

        const content = await this.repo.readFile(relativePath);
        return parseLogContent(content);
    }

    // -------------------------------------------------------------------------
    // File Writing
    // -------------------------------------------------------------------------

    private async writeDigest(relativePath: string, content: string): Promise<void> {
        const lastSlash = relativePath.lastIndexOf('/');
        if (lastSlash > 0) {
            await this.repo.ensureDirectory(relativePath.substring(0, lastSlash));
        }
        await this.repo.writeFile(relativePath, content);
    }
}

// -----------------------------------------------------------------------------
// Pure Helpers
// -----------------------------------------------------------------------------

function parseLogContent(content: string): DigestEntry[] {
    const entries: DigestEntry[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
        const fullMatch = line.match(LOG_ENTRY_PATTERN);
        if (fullMatch) {
            entries.push({
                timestamp: fullMatch[1],
                source: fullMatch[2],
                summary: fullMatch[3],
            });
            continue;
        }

        const simpleMatch = line.match(SIMPLE_ENTRY_PATTERN);
        if (simpleMatch) {
            entries.push({
                timestamp: simpleMatch[1],
                source: '',
                summary: simpleMatch[2],
            });
            continue;
        }

        // Also parse digest-style entries (from aggregated digests)
        const digestMatch = line.match(DIGEST_LINE_PATTERN);
        if (digestMatch && !line.startsWith('## ')) {
            // Try to extract timestamp if present: "- (DATE) CONTENT"
            const timestampMatch = digestMatch[1].match(/^\((\d{4}-\d{2}-\d{2})\)\s*/);
            if (timestampMatch) {
                entries.push({
                    timestamp: timestampMatch[1],
                    source: '',
                    summary: digestMatch[1].substring(timestampMatch[0].length),
                });
            } else {
                // Try to extract source tag: "- [SOURCE] CONTENT"
                const sourceMatch = digestMatch[1].match(/^\[([^\]]+)\]\s*(.+)$/);
                if (sourceMatch) {
                    entries.push({
                        timestamp: '',
                        source: sourceMatch[1],
                        summary: sourceMatch[2],
                    });
                }
            }
        }
    }

    return entries;
}

function formatDigestEntry(entry: DigestEntry, includeTimestamps: boolean): string {
    const parts: string[] = ['- '];

    if (includeTimestamps && entry.timestamp) {
        parts.push(`(${entry.timestamp}) `);
    }

    if (entry.source) {
        parts.push(`[${entry.source}] `);
    }

    parts.push(entry.summary);

    return parts.join('');
}
