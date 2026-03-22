// DRM Compression Service for Git Memory
// Compresses old episodic.md entries using DRM tier thresholds (lossless->daily->weekly->monthly).
// Reference: docs/planning/execution/git-memory-system.md (DRM Compression Integration)

import { GitMemoryRepository } from './git-memory.repository';
import { buildAgentFilePath, buildCommitMessage, shellEscape } from './git-memory.types';
import type { SandboxCommandExecutor } from './git-memory.types';
import { stripMemoryPrefix } from './memory-file-writer.helpers';
import type { LLMClient } from './memory-extractor.service';
import type { MemoryIndexer } from './memory-search-index.service';
import { DRM_RETENTION_DAYS } from '../memory.types';
import type { DRMTier } from '../memory.types';
import { LEGACY_LIGHT_MODEL } from '../../agents/types';

// -- Types --------------------------------------------------------------------

export interface DRMCompressionOptions {
    workspaceId: string;
    agentSlug: string;
    dryRun?: boolean;
}

export interface CompressionResult {
    tier: DRMTier;
    entriesCompressed: number;
    originalTokens: number;
    compressedTokens: number;
    commitSha?: string;
}

export interface ParsedEpisodicEntry {
    date: string;
    text: string;
    rawLine: string;
    tier: DRMTier;
    dateRange?: { start: string; end: string };
}

interface CompressionGroup {
    sourceTier: DRMTier;
    targetTier: DRMTier;
    entries: ParsedEpisodicEntry[];
}

// -- Constants ----------------------------------------------------------------

const HAIKU_MODEL = LEGACY_LIGHT_MODEL;
const COMPRESSION_MAX_TOKENS = 1024;
const COMPRESSION_TEMPERATURE = 0.1;
const CHARS_PER_TOKEN = 4;

const LOSSLESS_ENTRY_PATTERN = /^- \[(\d{4}-\d{2}-\d{2})\] (.+)$/;
const COMPRESSED_ENTRY_PATTERN = /^- \[(daily|weekly|monthly)\] \[(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\] (.+)$/;

const COMPRESSION_SYSTEM_PROMPT = `You are a memory compression system. Given a list of episodic memory entries, compress them into a single concise summary that preserves the most important events, outcomes, and decisions. Remove redundant details but keep key facts. Respond with JSON: {"compressed": "summary text"}`;

const TIER_TRANSITIONS: Array<{ from: DRMTier; to: DRMTier }> = [
    { from: 'lossless', to: 'daily' },
    { from: 'daily', to: 'weekly' },
    { from: 'weekly', to: 'monthly' },
];

// -- Service ------------------------------------------------------------------

export class DRMCompressionService {
    private readonly repo: GitMemoryRepository;
    private readonly executor: SandboxCommandExecutor;
    private readonly llmClient: LLMClient;
    private readonly searchIndex: MemoryIndexer;

    constructor(
        repo: GitMemoryRepository,
        executor: SandboxCommandExecutor,
        llmClient: LLMClient,
        searchIndex: MemoryIndexer,
    ) {
        this.repo = repo;
        this.executor = executor;
        this.llmClient = llmClient;
        this.searchIndex = searchIndex;
    }

    /**
     * Compress old entries in working.md for a specific agent.
     * Applies DRM tier thresholds: lossless->daily (7d), daily->weekly (30d),
     * weekly->monthly (90d), monthly deletion (365d).
     */
    async compressWorkingMemory(options: DRMCompressionOptions): Promise<CompressionResult[]> {
        const workingPath = stripMemoryPrefix(buildAgentFilePath(options.agentSlug, 'working'));
        const fileExists = await this.repo.fileExists(workingPath);
        if (!fileExists) {
            return [];
        }

        const content = await this.repo.readFile(workingPath);
        const entries = DRMCompressionService.parseEpisodicEntries(content);
        if (entries.length === 0) {
            return [];
        }

        const now = new Date();
        const groups = this.groupEntriesForCompression(entries, now);
        const expiredEntries = this.findExpiredEntries(entries, now);

        if (groups.length === 0 && expiredEntries.length === 0) {
            return [];
        }

        const results: CompressionResult[] = [];
        const entriesToRemove = new Set<string>();
        const compressedLines: string[] = [];

        for (const entry of expiredEntries) {
            entriesToRemove.add(entry.rawLine);
        }

        if (options.dryRun) {
            for (const group of groups) {
                const originalText = group.entries.map((e) => e.rawLine).join('\n');
                results.push({
                    tier: group.targetTier,
                    entriesCompressed: group.entries.length,
                    originalTokens: estimateTokens(originalText),
                    compressedTokens: estimateTokens(originalText),
                });
            }
        } else {
            // Parallel LLM calls for all compression groups
            const compressionResults = await Promise.all(
                groups.map(async (group) => {
                    const originalText = group.entries.map((e) => e.rawLine).join('\n');
                    const compressed = await this.compressEntries(group.entries, group.targetTier);
                    return { group, originalText, compressed };
                })
            );

            for (const { group, originalText, compressed } of compressionResults) {
                const originalTokens = estimateTokens(originalText);
                const compressedTokens = estimateTokens(compressed);

                for (const entry of group.entries) {
                    entriesToRemove.add(entry.rawLine);
                }

                const dates = group.entries.map((e) => e.date).sort();
                const compressedLine = `- [${group.targetTier}] [${dates[0]} to ${dates[dates.length - 1]}] ${compressed}`;
                compressedLines.push(compressedLine);

                results.push({
                    tier: group.targetTier,
                    entriesCompressed: group.entries.length,
                    originalTokens,
                    compressedTokens,
                });
            }
        }

        if (options.dryRun) {
            return results;
        }

        const updatedContent = this.rebuildEpisodicContent(content, entriesToRemove, compressedLines);
        await this.repo.writeFile(workingPath, updatedContent);

        const tierNames = results.map((r) => r.tier).join(', ');
        const commitMessage = buildCommitMessage({
            type: 'drm',
            agentSlug: options.agentSlug,
            summary: `compress episodic ${tierNames}`,
        });
        const commitResult = await this.repo.commitChanges(commitMessage);
        if (commitResult) {
            for (const result of results) {
                result.commitSha = commitResult.sha;
            }
        }

        const updatedFileContent = await this.repo.readFile(workingPath);
        await this.searchIndex.indexFile({
            workspaceId: options.workspaceId,
            filePath: `agents/${options.agentSlug}/working.md`,
            content: updatedFileContent,
            memoryType: 'working',
            scope: 'agent',
        });

        return results;
    }

    /**
     * Background job entry point - compress all agents in workspace.
     * Lists agent directories under .memory/agents/, runs compression on each.
     */
    async runDRMCompression(workspaceId: string): Promise<Map<string, CompressionResult[]>> {
        const results = new Map<string, CompressionResult[]>();
        const agentSlugs = await this.discoverAgents();

        for (const agentSlug of agentSlugs) {
            const agentResults = await this.compressWorkingMemory({ workspaceId, agentSlug });
            if (agentResults.length > 0) {
                results.set(agentSlug, agentResults);
            }
        }

        return results;
    }

    // -- Parsing --------------------------------------------------------------

    /**
     * Parse episodic.md content into structured entries.
     * Handles lossless format `- [YYYY-MM-DD] text`
     * and compressed format `- [tier] [YYYY-MM-DD to YYYY-MM-DD] text`.
     */
    static parseEpisodicEntries(content: string): ParsedEpisodicEntry[] {
        if (!content || content.trim().length === 0) {
            return [];
        }

        const entries: ParsedEpisodicEntry[] = [];

        for (const line of content.split('\n')) {
            const trimmed = line.trim();

            const compressedMatch = trimmed.match(COMPRESSED_ENTRY_PATTERN);
            if (compressedMatch) {
                entries.push({
                    date: compressedMatch[3],
                    text: compressedMatch[4],
                    rawLine: trimmed,
                    tier: compressedMatch[1] as DRMTier,
                    dateRange: { start: compressedMatch[2], end: compressedMatch[3] },
                });
                continue;
            }

            const losslessMatch = trimmed.match(LOSSLESS_ENTRY_PATTERN);
            if (losslessMatch) {
                entries.push({
                    date: losslessMatch[1],
                    text: losslessMatch[2],
                    rawLine: trimmed,
                    tier: 'lossless',
                });
            }
        }

        return entries;
    }

    // -- Compression Logic ----------------------------------------------------

    private groupEntriesForCompression(
        entries: ParsedEpisodicEntry[],
        now: Date,
    ): CompressionGroup[] {
        const groups: CompressionGroup[] = [];

        for (const transition of TIER_TRANSITIONS) {
            const thresholdDays = DRM_RETENTION_DAYS[transition.from];
            const matchingEntries = entries.filter((entry) =>
                entry.tier === transition.from && this.getEntryAgeDays(entry, now) > thresholdDays
            );

            if (matchingEntries.length > 0) {
                groups.push({
                    sourceTier: transition.from,
                    targetTier: transition.to,
                    entries: matchingEntries,
                });
            }
        }

        return groups;
    }

    private findExpiredEntries(entries: ParsedEpisodicEntry[], now: Date): ParsedEpisodicEntry[] {
        return entries.filter((entry) => this.getEntryAgeDays(entry, now) > DRM_RETENTION_DAYS.monthly);
    }

    private getEntryAgeDays(entry: ParsedEpisodicEntry, now: Date): number {
        // Both dates must use UTC to avoid timezone-related off-by-one errors.
        // entry.date is YYYY-MM-DD, we parse as UTC midnight.
        const entryDate = new Date(entry.date + 'T00:00:00Z');
        // Get now in UTC by creating a UTC date from its components
        const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        return Math.floor((nowUtc - entryDate.getTime()) / (24 * 60 * 60 * 1000));
    }

    private async compressEntries(entries: ParsedEpisodicEntry[], targetTier: DRMTier): Promise<string> {
        const entriesText = entries.map((e) => `- ${e.date}: ${e.text}`).join('\n');
        const userPrompt = `Compress these ${entries.length} episodic memory entries into a single ${targetTier} summary:\n\n${entriesText}`;

        const response = await this.llmClient.generateJSON<{ compressed: string }>(
            COMPRESSION_SYSTEM_PROMPT,
            userPrompt,
            { model: HAIKU_MODEL, maxTokens: COMPRESSION_MAX_TOKENS, temperature: COMPRESSION_TEMPERATURE },
        );

        return response.compressed;
    }

    // -- File Rebuild ---------------------------------------------------------

    private rebuildEpisodicContent(
        originalContent: string,
        entriesToRemove: Set<string>,
        compressedLines: string[],
    ): string {
        const lines = originalContent.split('\n');
        const preservedLines: string[] = [];
        let foundHeader = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('##') || trimmed.length === 0) {
                preservedLines.push(line);
                if (trimmed.startsWith('##')) foundHeader = true;
                continue;
            }
            if (entriesToRemove.has(trimmed)) continue;
            preservedLines.push(line);
        }

        if (!foundHeader) {
            preservedLines.unshift('## Session Log');
        }

        // Insert compressed entries after the header and blank lines
        let insertIdx = 0;
        for (let i = 0; i < preservedLines.length; i++) {
            if (preservedLines[i].trim().startsWith('##')) {
                insertIdx = i + 1;
                while (insertIdx < preservedLines.length && preservedLines[insertIdx].trim() === '') {
                    insertIdx++;
                }
                break;
            }
        }

        if (compressedLines.length > 0) {
            preservedLines.splice(insertIdx, 0, ...compressedLines);
        }

        let result = preservedLines.join('\n');
        if (!result.endsWith('\n')) result += '\n';
        return result;
    }

    // -- Agent Discovery ------------------------------------------------------

    private async discoverAgents(): Promise<string[]> {
        const agentsDirExists = await this.repo.fileExists('agents');
        if (!agentsDirExists) {
            return [];
        }

        const agentsPath = `${this.repo.getMemoryAbsolutePath()}/agents`;
        const cmdResult = await this.executor.exec(`ls -1 ${shellEscape(agentsPath, 'path')} 2>/dev/null`);
        if (cmdResult.exitCode !== 0 || cmdResult.stdout.trim().length === 0) {
            return [];
        }

        return cmdResult.stdout.trim().split('\n').filter((name) => name.trim().length > 0);
    }
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
