// ACE Playbook Curator Service
// Curates playbook entries in .memory/agents/{slug}/playbook.md
// Implements CuratorService from ace-reflection.trigger.ts
// Replaces DB-based ace_playbook table with file-based git memory

import type { CuratorService, CuratorChanges, CuratorPlaybookChange, ReflectorAnalysis } from './ace-reflection.trigger';
import type { GitMemoryRepository } from '../../memory/git-memory/git-memory.repository';

// -----------------------------------------------------------------------------
// Playbook Entry (file-based)
// -----------------------------------------------------------------------------

interface PlaybookFileEntry {
    id: string;
    content: string;
    domain: string;
    type: string;
    helpfulness: number;
    keywords: string[];
    updated: string;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const MAX_ENTRIES = 50;
const MIN_CONFIDENCE = 0.5;

// -----------------------------------------------------------------------------
// Parse / Serialize Helpers
// -----------------------------------------------------------------------------

function generateEntryId(): string {
    return `pb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parsePlaybookMarkdown(markdown: string): PlaybookFileEntry[] {
    const entries: PlaybookFileEntry[] = [];
    const sections = markdown.split(/^## /m).filter(Boolean);

    for (const section of sections) {
        const lines = section.trim().split('\n');
        const firstLine = lines[0]?.trim() ?? '';

        // Skip header section (title line without entry format)
        if (firstLine.startsWith('# ') || firstLine.startsWith('ACE Playbook') || firstLine.startsWith('---')) {
            continue;
        }

        let id = '';
        let content = '';
        let domain = 'general';
        let type = 'success_pattern';
        let helpfulness = 0.5;
        let keywords: string[] = [];
        let updated = '';

        const contentLines: string[] = [];
        let parsingMetadata = false;

        for (const line of lines) {
            if (line.startsWith('- **ID**:')) {
                id = line.replace('- **ID**:', '').trim();
                parsingMetadata = true;
            } else if (line.startsWith('- **Domain**:')) {
                domain = line.replace('- **Domain**:', '').trim();
                parsingMetadata = true;
            } else if (line.startsWith('- **Type**:')) {
                type = line.replace('- **Type**:', '').trim();
                parsingMetadata = true;
            } else if (line.startsWith('- **Helpfulness**:')) {
                helpfulness = parseFloat(line.replace('- **Helpfulness**:', '').trim()) || 0.5;
                parsingMetadata = true;
            } else if (line.startsWith('- **Keywords**:')) {
                const kwStr = line.replace('- **Keywords**:', '').trim();
                keywords = kwStr ? kwStr.split(',').map(k => k.trim()).filter(Boolean) : [];
                parsingMetadata = true;
            } else if (line.startsWith('- **Updated**:')) {
                updated = line.replace('- **Updated**:', '').trim();
                parsingMetadata = true;
            } else if (!parsingMetadata && line !== lines[0] && line.trim() !== '---') {
                contentLines.push(line);
            }
        }

        content = contentLines.join('\n').trim();

        if (content || id) {
            entries.push({
                id: id || generateEntryId(),
                content,
                domain,
                type,
                helpfulness,
                keywords,
                updated: updated || new Date().toISOString(),
            });
        }
    }

    return entries;
}

function serializePlaybookMarkdown(entries: PlaybookFileEntry[]): string {
    const lines: string[] = [
        '# ACE Playbook',
        '',
        'Behavioral guidance entries curated from session reflections.',
        '',
        '---',
        '',
    ];

    const sorted = [...entries].sort((a, b) => b.helpfulness - a.helpfulness);

    for (const entry of sorted) {
        const title = entry.domain.charAt(0).toUpperCase() + entry.domain.slice(1);
        lines.push(`## ${title}: ${entry.type.replace(/_/g, ' ')}`);
        lines.push('');
        lines.push(entry.content);
        lines.push('');
        lines.push(`- **ID**: ${entry.id}`);
        lines.push(`- **Domain**: ${entry.domain}`);
        lines.push(`- **Type**: ${entry.type}`);
        lines.push(`- **Helpfulness**: ${entry.helpfulness.toFixed(2)}`);
        lines.push(`- **Keywords**: ${entry.keywords.join(', ')}`);
        lines.push(`- **Updated**: ${entry.updated}`);
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    return lines.join('\n');
}

// -----------------------------------------------------------------------------
// AcePlaybookCuratorService
// -----------------------------------------------------------------------------

export class AcePlaybookCuratorService implements CuratorService {
    private readonly gitRepo: GitMemoryRepository;
    private readonly agentSlug: string;

    constructor(gitRepo: GitMemoryRepository, agentSlug: string) {
        this.gitRepo = gitRepo;
        this.agentSlug = agentSlug;
    }

    async curate(agentId: number, analysis: ReflectorAnalysis): Promise<CuratorChanges> {
        // agentId is part of the CuratorService interface but we use slug for file paths
        void agentId;

        const playbookPath = `agents/${this.agentSlug}/playbook.md`;

        // 1. Read existing playbook
        let existingEntries: PlaybookFileEntry[] = [];
        const exists = await this.gitRepo.fileExists(playbookPath);
        if (exists) {
            const content = await this.gitRepo.readFile(playbookPath);
            existingEntries = parsePlaybookMarkdown(content);
        }

        const added: CuratorPlaybookChange[] = [];
        const updated: CuratorPlaybookChange[] = [];
        const deprecated: CuratorPlaybookChange[] = [];

        // 2. Process insights from analysis
        for (const insight of analysis.insights) {
            const confidence = insight.confidence ?? 0;

            // Skip low-confidence insights
            if (confidence < MIN_CONFIDENCE) {
                continue;
            }

            // Check for matching existing entry (by content similarity)
            const match = existingEntries.find(e =>
                e.content === insight.content ||
                (e.domain === (insight.domain ?? 'general') && e.type === insight.type && e.content && insight.content && e.content.includes(insight.content))
            );

            if (match) {
                // Bump helpfulness on matching entry
                match.helpfulness = Math.min(1.0, match.helpfulness + 0.1);
                match.updated = new Date().toISOString();
                if (insight.keywords?.length) {
                    const combined = new Set([...match.keywords, ...insight.keywords]);
                    match.keywords = [...combined];
                }
                updated.push({
                    id: match.id,
                    content: match.content,
                    newHelpfulness: match.helpfulness,
                    reason: 'matched_insight',
                });
            } else if (insight.content) {
                // Add new entry
                const newEntry: PlaybookFileEntry = {
                    id: generateEntryId(),
                    content: insight.content,
                    domain: insight.domain ?? 'general',
                    type: insight.type,
                    helpfulness: confidence,
                    keywords: insight.keywords ?? [],
                    updated: new Date().toISOString(),
                };
                existingEntries.push(newEntry);
                added.push({
                    id: newEntry.id,
                    content: newEntry.content,
                    newHelpfulness: confidence,
                    reason: 'new_insight',
                });
            }
        }

        // 3. Cap at MAX_ENTRIES (drop lowest helpfulness)
        if (existingEntries.length > MAX_ENTRIES) {
            existingEntries.sort((a, b) => b.helpfulness - a.helpfulness);
            const dropped = existingEntries.splice(MAX_ENTRIES);
            for (const entry of dropped) {
                deprecated.push({
                    id: entry.id,
                    content: entry.content,
                    reason: 'cap_exceeded',
                });
            }
        }

        // 4. Write back
        const markdown = serializePlaybookMarkdown(existingEntries);
        await this.gitRepo.writeFile(playbookPath, markdown);

        return { added, updated, deprecated };
    }
}
