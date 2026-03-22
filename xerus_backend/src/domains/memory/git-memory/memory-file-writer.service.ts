// Memory File Writer Service
// Writes extracted memories to correct .memory/ files with appropriate strategies.
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 6
//
// v2 update strategies:
//   working.md      -> OVERWRITE (current state) + APPEND activity entries
//   expertise.md    -> UPSERT (replace if same topic, else append)
//   patterns.md     -> APPEND with dedup by pattern name (channel/project level)

import { GitMemoryRepository } from './git-memory.repository';
import {
    AGENT_MEMORY_FILES,
    buildAgentFilePath,
    buildProjectPath,
    buildChannelPath,
    GIT_MEMORY_FILES,
} from './git-memory.types';
import type { ExtractionResult, EpisodicEntry, SemanticEntry, ProceduralEntry } from './memory-extractor.service';
import {
    SEMANTIC_FACT_PATTERN,
    ACTION_HISTORY_LINE_PATTERN,
    ACTION_HISTORY_MAX_ENTRIES,
    stripMemoryPrefix,
    readFileOrEmpty,
    formatWorkingContent,
    formatDate,
    normalizeFactKey,
    formatProceduralPattern,
    parseProceduralSections,
    groupByScope,
} from './memory-file-writer.helpers';
import type { ScopedEntries } from './memory-file-writer.helpers';

// -----------------------------------------------------------------------------
// Public Types
// -----------------------------------------------------------------------------

export interface WriteMemoryOptions {
    agentSlug: string;
    projectSlug?: string;
    channelSlug?: string;
}

// -----------------------------------------------------------------------------
// Memory File Writer Service
// -----------------------------------------------------------------------------

export class MemoryFileWriterService {
    private readonly repo: GitMemoryRepository;

    constructor(repo: GitMemoryRepository) {
        this.repo = repo;
    }

    /**
     * Write extracted memories to the appropriate .memory/ files.
     * Respects scope hierarchy and update strategies per file type.
     * Returns list of relative paths (within .memory/) that were written.
     */
    async writeMemories(
        extraction: ExtractionResult,
        options: WriteMemoryOptions
    ): Promise<string[]> {
        const writtenFiles: string[] = [];

        await this.repo.ensureDirectory(`agents/${options.agentSlug}`);

        // 1. Working.md - OVERWRITE (agent scope only)
        if (extraction.working && extraction.working.trim().length > 0) {
            const path = this.agentFilePath(options.agentSlug, 'working');
            await this.repo.writeFile(path, formatWorkingContent(extraction.working));
            writtenFiles.push(path);
        }

        // 2. Episodic entries - APPEND to working.md with timestamp
        const episodicByScope = groupByScope(extraction.episodic);
        const episodicFiles = await this.writeEpisodicEntries(episodicByScope, options);
        writtenFiles.push(...episodicFiles);

        // 3. Semantic entries - UPSERT to expertise.md
        const semanticByScope = groupByScope(extraction.semantic);
        const semanticFiles = await this.writeSemanticEntries(semanticByScope, options);
        writtenFiles.push(...semanticFiles);

        // 4. Procedural entries - APPEND with dedup to patterns.md
        const proceduralByScope = groupByScope(extraction.procedural);
        const proceduralFiles = await this.writeProceduralEntries(proceduralByScope, options);
        writtenFiles.push(...proceduralFiles);

        return writtenFiles;
    }

    /**
     * Append activity entries to working.md with rolling window (keep last 50).
     * Called separately from writeMemories for tool call tracking.
     */
    async appendActivityLog(agentSlug: string, entries: string[]): Promise<string> {
        if (entries.length === 0) {
            return '';
        }

        await this.repo.ensureDirectory(`agents/${agentSlug}`);
        const path = this.agentFilePath(agentSlug, 'working');

        const existingContent = await readFileOrEmpty(this.repo,path);
        const existingLines = existingContent
            .split('\n')
            .filter((line) => ACTION_HISTORY_LINE_PATTERN.test(line));

        const timestamp = formatDate(new Date());
        const newLines = entries.map((entry) => `- [${timestamp}] ${entry}`);

        const allLines = [...existingLines, ...newLines];
        const trimmedLines = allLines.slice(Math.max(0, allLines.length - ACTION_HISTORY_MAX_ENTRIES));

        const content = `## Activity Log\n\n${trimmedLines.join('\n')}\n`;
        await this.repo.writeFile(path, content);

        return path;
    }

    // -------------------------------------------------------------------------
    // Episodic - APPEND with timestamp to working.md
    // -------------------------------------------------------------------------

    private async writeEpisodicEntries(
        grouped: ScopedEntries<EpisodicEntry>,
        options: WriteMemoryOptions
    ): Promise<string[]> {
        const writtenFiles: string[] = [];
        const timestamp = formatDate(new Date());

        if (grouped.agent.length > 0) {
            const path = this.agentFilePath(options.agentSlug, 'working');
            const newContent = grouped.agent
                .map((e) => `- [${timestamp}] ${e.event} -> ${e.outcome}`)
                .join('\n');
            await this.appendToFile(path, newContent, '## Session Log');
            writtenFiles.push(path);
        }

        if (grouped.project.length > 0 && options.projectSlug) {
            const path = `${stripMemoryPrefix(buildProjectPath(options.projectSlug))}/project.md`;
            const newContent = grouped.project
                .map((e) => `- [${timestamp}] [${options.agentSlug}] ${e.event} -> ${e.outcome}`)
                .join('\n');
            await this.ensureAndAppend(path, newContent, '## Project Log');
            writtenFiles.push(path);
        }

        if (grouped.channel.length > 0 && options.projectSlug && options.channelSlug) {
            const path = `${stripMemoryPrefix(buildChannelPath(options.projectSlug, options.channelSlug))}/channel.md`;
            const newContent = grouped.channel
                .map((e) => `- [${timestamp}] [${options.agentSlug}] ${e.event} -> ${e.outcome}`)
                .join('\n');
            await this.ensureAndAppend(path, newContent, '## Channel Log');
            writtenFiles.push(path);
        }

        return writtenFiles;
    }

    // -------------------------------------------------------------------------
    // Semantic - UPSERT to expertise.md (replace if same topic, else append)
    // -------------------------------------------------------------------------

    private async writeSemanticEntries(
        grouped: ScopedEntries<SemanticEntry>,
        options: WriteMemoryOptions
    ): Promise<string[]> {
        const writtenFiles: string[] = [];

        if (grouped.agent.length > 0) {
            const path = this.agentFilePath(options.agentSlug, 'expertise');
            await this.upsertSemanticFacts(path, grouped.agent);
            writtenFiles.push(path);
        }

        if (grouped.company.length > 0) {
            const path = stripMemoryPrefix(GIT_MEMORY_FILES.workspace);
            await this.upsertSemanticFacts(path, grouped.company);
            writtenFiles.push(path);
        }

        if (grouped.project.length > 0 && options.projectSlug) {
            const path = `${stripMemoryPrefix(buildProjectPath(options.projectSlug))}/project.md`;
            await this.ensureDirectoryForPath(path);
            await this.upsertSemanticFacts(path, grouped.project);
            writtenFiles.push(path);
        }

        if (grouped.channel.length > 0 && options.projectSlug && options.channelSlug) {
            const path = `${stripMemoryPrefix(buildChannelPath(options.projectSlug, options.channelSlug))}/channel.md`;
            await this.ensureDirectoryForPath(path);
            await this.upsertSemanticFacts(path, grouped.channel);
            writtenFiles.push(path);
        }

        return writtenFiles;
    }

    private async upsertSemanticFacts(relativePath: string, facts: SemanticEntry[]): Promise<void> {
        const existingContent = await readFileOrEmpty(this.repo,relativePath);
        const existingLines = existingContent.split('\n');

        const factMap = new Map<string, string>();
        const nonFactLines: string[] = [];

        for (const line of existingLines) {
            const match = line.match(SEMANTIC_FACT_PATTERN);
            if (match) {
                factMap.set(normalizeFactKey(match[1].trim()), line);
            } else {
                nonFactLines.push(line);
            }
        }

        for (const fact of facts) {
            factMap.set(normalizeFactKey(fact.fact), `- ${fact.fact} (confidence: ${fact.confidence})`);
        }

        const header = nonFactLines.filter((l) => l.trim().length > 0).join('\n') || '## Known Facts';
        const factLines = Array.from(factMap.values()).join('\n');
        await this.repo.writeFile(relativePath, `${header}\n\n${factLines}\n`);
    }

    // -------------------------------------------------------------------------
    // Procedural - APPEND with dedup by pattern name
    // -------------------------------------------------------------------------

    private async writeProceduralEntries(
        grouped: ScopedEntries<ProceduralEntry>,
        options: WriteMemoryOptions
    ): Promise<string[]> {
        const writtenFiles: string[] = [];

        if (grouped.agent.length > 0) {
            const path = this.agentFilePath(options.agentSlug, 'expertise');
            await this.upsertProceduralPatterns(path, grouped.agent);
            writtenFiles.push(path);
        }

        if (grouped.company.length > 0) {
            const path = stripMemoryPrefix(GIT_MEMORY_FILES.workspace);
            await this.upsertProceduralPatterns(path, grouped.company);
            writtenFiles.push(path);
        }

        if (grouped.project.length > 0 && options.projectSlug) {
            const path = `${stripMemoryPrefix(buildProjectPath(options.projectSlug))}/project.md`;
            await this.ensureDirectoryForPath(path);
            await this.upsertProceduralPatterns(path, grouped.project);
            writtenFiles.push(path);
        }

        return writtenFiles;
    }

    private async upsertProceduralPatterns(
        relativePath: string,
        patterns: ProceduralEntry[]
    ): Promise<void> {
        const existingContent = await readFileOrEmpty(this.repo,relativePath);
        const patternSections = parseProceduralSections(existingContent);

        for (const pattern of patterns) {
            patternSections.set(pattern.pattern, formatProceduralPattern(pattern));
        }

        const header = '## Learned Patterns';
        const patternContent = Array.from(patternSections.values()).join('\n\n');
        await this.repo.writeFile(relativePath, `${header}\n\n${patternContent}\n`);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private agentFilePath(agentSlug: string, fileKey: keyof typeof AGENT_MEMORY_FILES): string {
        return stripMemoryPrefix(buildAgentFilePath(agentSlug, fileKey));
    }

    private async appendToFile(
        relativePath: string,
        newContent: string,
        defaultHeader: string
    ): Promise<void> {
        const existing = await readFileOrEmpty(this.repo,relativePath);
        if (existing.trim().length === 0) {
            await this.repo.writeFile(relativePath, `${defaultHeader}\n\n${newContent}\n`);
        } else {
            await this.repo.writeFile(relativePath, `${existing.trimEnd()}\n${newContent}\n`);
        }
    }

    private async ensureAndAppend(
        relativePath: string,
        newContent: string,
        defaultHeader: string
    ): Promise<void> {
        await this.ensureDirectoryForPath(relativePath);
        await this.appendToFile(relativePath, newContent, defaultHeader);
    }

    private async ensureDirectoryForPath(relativePath: string): Promise<void> {
        const lastSlash = relativePath.lastIndexOf('/');
        if (lastSlash > 0) {
            await this.repo.ensureDirectory(relativePath.substring(0, lastSlash));
        }
    }
}
