// Memory File Writer Service Tests
// Tests for writing extracted memories to .memory/ files with correct strategies
// Reference: docs/planning/execution/git-memory-system.md (File Update Strategy)

import { MemoryFileWriterService } from '../memory-file-writer.service';
import type { WriteMemoryOptions } from '../memory-file-writer.service';
import type { ExtractionResult } from '../memory-extractor.service';
import { GitMemoryRepository } from '../git-memory.repository';
import type { SandboxCommandExecutor, GitMemoryFileSystem, CommandResult } from '../git-memory.types';

// -----------------------------------------------------------------------------
// In-Memory File System (real implementation, not a mock)
// -----------------------------------------------------------------------------

class InMemoryFileSystem implements GitMemoryFileSystem {
    private files: Map<string, string> = new Map();
    private directories: Set<string> = new Set();

    async mkdir(path: string): Promise<void> {
        this.directories.add(path);
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

    getContent(path: string): string | undefined {
        return this.files.get(path);
    }
}

// -----------------------------------------------------------------------------
// No-op Git Command Executor (file writer does not use git commands directly)
// -----------------------------------------------------------------------------

class NoOpExecutor implements SandboxCommandExecutor {
    async exec(_command: string): Promise<CommandResult> {
        return { stdout: '', stderr: '', exitCode: 0 };
    }
}

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

const WORKSPACE_PATH = '/workspace';

function createRepo(fs: InMemoryFileSystem): GitMemoryRepository {
    return new GitMemoryRepository(new NoOpExecutor(), fs, WORKSPACE_PATH);
}

function createService(repo: GitMemoryRepository): MemoryFileWriterService {
    return new MemoryFileWriterService(repo);
}

const FULL_EXTRACTION: ExtractionResult = {
    working: 'Analyzing keyword data for AI workforce campaign',
    episodic: [
        { event: 'Completed keyword gap analysis', outcome: 'Found 12 target phrases', scope: 'agent' },
        { event: 'Discovered competitor weakness', outcome: 'Competitor X has no coverage', scope: 'project' },
    ],
    semantic: [
        { fact: 'AI workforce CPC is $2.50', confidence: 0.95, scope: 'channel' },
        { fact: 'User prefers long-tail keywords', confidence: 0.8, scope: 'agent' },
    ],
    procedural: [
        {
            pattern: 'Keyword gap analysis workflow',
            steps: ['Export competitor keywords', 'Cross-reference with own rankings', 'Identify gaps'],
            scope: 'agent',
        },
    ],
    digest_line: 'Completed keyword gap analysis, found 12 target phrases',
};

const DEFAULT_OPTIONS: WriteMemoryOptions = {
    agentSlug: 'seo-agent',
};

const SCOPED_OPTIONS: WriteMemoryOptions = {
    agentSlug: 'seo-agent',
    projectSlug: 'marketing',
    channelSlug: 'seo-channel',
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('MemoryFileWriterService', () => {
    let fs: InMemoryFileSystem;
    let repo: GitMemoryRepository;
    let service: MemoryFileWriterService;

    beforeEach(async () => {
        fs = new InMemoryFileSystem();
        repo = createRepo(fs);
        service = createService(repo);
        // Ensure the agent directory exists
        await fs.mkdir(`${WORKSPACE_PATH}/.memory/agents/seo-agent`);
    });

    // -------------------------------------------------------------------------
    // writeMemories - Full Flow
    // -------------------------------------------------------------------------

    describe('writeMemories', () => {
        it('should return list of files written', async () => {
            const files = await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            expect(files.length).toBeGreaterThan(0);
            expect(files).toEqual(expect.arrayContaining([
                expect.stringContaining('working.md'),
            ]));
        });

        it('should write working.md for agent scope', async () => {
            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`);
            expect(content).toBeDefined();
            expect(content).toContain('Analyzing keyword data');
        });

        it('should write working.md with appended episodic entries', async () => {
            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`);
            expect(content).toBeDefined();
            expect(content).toContain('Completed keyword gap analysis');
        });

        it('should write expertise.md with agent-scoped facts', async () => {
            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`);
            expect(content).toBeDefined();
            expect(content).toContain('User prefers long-tail keywords');
        });

        it('should write expertise.md with agent-scoped patterns', async () => {
            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`);
            expect(content).toBeDefined();
            expect(content).toContain('Keyword gap analysis workflow');
        });

        it('should return empty array when extraction has no content', async () => {
            const emptyExtraction: ExtractionResult = {
                working: '',
                episodic: [],
                semantic: [],
                procedural: [],
                digest_line: '',
            };

            const files = await service.writeMemories(emptyExtraction, DEFAULT_OPTIONS);

            expect(files).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------
    // Working.md - OVERWRITE Strategy
    // -------------------------------------------------------------------------

    describe('working.md - OVERWRITE', () => {
        it('should overwrite existing content', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`,
                'Old working state'
            );

            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`);
            expect(content).not.toContain('Old working state');
            expect(content).toContain('Analyzing keyword data');
        });

        it('should not write working.md when working field is empty', async () => {
            const extraction: ExtractionResult = {
                ...FULL_EXTRACTION,
                working: '',
            };

            const files = await service.writeMemories(extraction, DEFAULT_OPTIONS);

            expect(files).not.toContain(expect.stringContaining('working.md'));
        });
    });

    // -------------------------------------------------------------------------
    // Episodic.md - APPEND Strategy
    // -------------------------------------------------------------------------

    describe('working.md - APPEND (episodic entries)', () => {
        it('should append to existing working content', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`,
                '## Session Log\n\n- [2025-01-01] Old event -> Old outcome\n'
            );

            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`)!;
            // Should keep old content
            expect(content).toContain('Old event');
            // Should add new entries
            expect(content).toContain('Completed keyword gap analysis');
        });

        it('should include timestamps in working entries', async () => {
            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`)!;
            // Should have ISO date format [YYYY-MM-DD]
            expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}/);
        });

        it('should only write agent-scoped working entries to agent file', async () => {
            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`)!;
            // Agent-scoped entry should be in agent file
            expect(content).toContain('Completed keyword gap analysis');
            // Project-scoped entry should NOT be in agent file
            expect(content).not.toContain('Discovered competitor weakness');
        });
    });

    // -------------------------------------------------------------------------
    // Semantic.md - UPSERT Strategy
    // -------------------------------------------------------------------------

    describe('expertise.md - UPSERT', () => {
        it('should add new expertise facts', async () => {
            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`)!;
            expect(content).toContain('User prefers long-tail keywords');
        });

        it('should replace existing fact with same topic', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`,
                '## Known Facts\n\n- User prefers long-tail keywords (confidence: 0.5)\n'
            );

            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`)!;
            // Should have the updated confidence value
            expect(content).toContain('0.8');
            // Should not have old confidence
            expect(content).not.toContain('confidence: 0.5');
            // Should appear only once
            const matches = content.match(/User prefers long-tail keywords/g);
            expect(matches).toHaveLength(1);
        });

        it('should keep non-matching existing facts', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`,
                '## Known Facts\n\n- Budget is $1000/month (confidence: 0.9)\n'
            );

            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`)!;
            // Old fact should remain
            expect(content).toContain('Budget is $1000/month');
            // New fact should be added
            expect(content).toContain('User prefers long-tail keywords');
        });
    });

    // -------------------------------------------------------------------------
    // Procedural.md - APPEND with Dedup
    // -------------------------------------------------------------------------

    describe('expertise.md - APPEND with dedup (procedural)', () => {
        it('should add new procedural patterns', async () => {
            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`)!;
            expect(content).toContain('Keyword gap analysis workflow');
            expect(content).toContain('Export competitor keywords');
        });

        it('should replace existing pattern with same name', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`,
                '## Learned Patterns\n\n### Keyword gap analysis workflow\n1. Old step 1\n2. Old step 2\n'
            );

            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`)!;
            // Should have new steps
            expect(content).toContain('Export competitor keywords');
            // Should not have old steps
            expect(content).not.toContain('Old step 1');
            // Pattern name should appear only once
            const matches = content.match(/Keyword gap analysis workflow/g);
            expect(matches).toHaveLength(1);
        });

        it('should keep non-matching existing patterns', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`,
                '## Learned Patterns\n\n### Content audit workflow\n1. Check pages\n2. Score quality\n'
            );

            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/expertise.md`)!;
            // Old pattern should remain
            expect(content).toContain('Content audit workflow');
            // New pattern should be added
            expect(content).toContain('Keyword gap analysis workflow');
        });
    });

    // -------------------------------------------------------------------------
    // Activity Log - ROLLING WINDOW Strategy
    // -------------------------------------------------------------------------

    describe('activity log - ROLLING WINDOW', () => {
        it('should not write activity_log section from extraction (not part of extraction)', async () => {
            // activity_log is written separately via appendActivityLog, not from writeMemories
            await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`)!;
            expect(content).not.toContain('## Activity Log');
        });
    });

    describe('appendActivityLog', () => {
        it('should append new action entries', async () => {
            const entries = [
                'Used search_google: searched for "AI workforce keywords"',
                'Used write_file: saved keyword analysis to output/keywords.csv',
            ];

            await service.appendActivityLog('seo-agent', entries);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`)!;
            expect(content).toContain('search_google');
            expect(content).toContain('write_file');
        });

        it('should keep only last 50 entries', async () => {
            // Write 55 existing entries with distinct prefixes
            const existingEntries: string[] = [];
            for (let i = 1; i <= 55; i++) {
                existingEntries.push(`- [2025-01-01] OldEntry_${String(i).padStart(3, '0')}`);
            }
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`,
                `## Activity Log\n\n${existingEntries.join('\n')}\n`
            );

            // Add 5 more entries
            const newEntries = ['New entry 1', 'New entry 2', 'New entry 3', 'New entry 4', 'New entry 5'];
            await service.appendActivityLog('seo-agent', newEntries);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`)!;
            const lines = content.split('\n').filter((line) => line.startsWith('- ['));
            expect(lines.length).toBeLessThanOrEqual(50);
            // Newest entries should be present
            expect(content).toContain('New entry 5');
            // First 10 oldest entries should be trimmed (55 + 5 = 60, keep last 50)
            expect(content).not.toContain('OldEntry_001');
            expect(content).not.toContain('OldEntry_010');
            // Entries after the trim point should remain
            expect(content).toContain('OldEntry_011');
        });

        it('should create file if it does not exist', async () => {
            await service.appendActivityLog('seo-agent', ['First action']);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/seo-agent/working.md`);
            expect(content).toBeDefined();
            expect(content).toContain('First action');
        });
    });

    // -------------------------------------------------------------------------
    // Scope Hierarchy
    // -------------------------------------------------------------------------

    describe('scope hierarchy', () => {
        it('should write project-scoped working entries to project.md', async () => {
            await service.writeMemories(FULL_EXTRACTION, SCOPED_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/projects/marketing/project.md`);
            expect(content).toBeDefined();
            expect(content).toContain('Discovered competitor weakness');
        });

        it('should write channel-scoped semantic entries to channel.md', async () => {
            await service.writeMemories(FULL_EXTRACTION, SCOPED_OPTIONS);

            const content = fs.getContent(
                `${WORKSPACE_PATH}/.memory/projects/marketing/channels/seo-channel/channel.md`
            );
            expect(content).toBeDefined();
            expect(content).toContain('AI workforce CPC is $2.50');
        });

        it('should create project directory if it does not exist', async () => {
            await service.writeMemories(FULL_EXTRACTION, SCOPED_OPTIONS);

            const exists = await fs.exists(`${WORKSPACE_PATH}/.memory/projects/marketing`);
            expect(exists).toBe(true);
        });

        it('should create channel directory if it does not exist', async () => {
            await service.writeMemories(FULL_EXTRACTION, SCOPED_OPTIONS);

            const exists = await fs.exists(
                `${WORKSPACE_PATH}/.memory/projects/marketing/channels/seo-channel`
            );
            expect(exists).toBe(true);
        });

        it('should skip project-scoped entries when projectSlug is not provided', async () => {
            const files = await service.writeMemories(FULL_EXTRACTION, DEFAULT_OPTIONS);

            // Project-scoped entries should not create project.md
            const projectFile = files.find((f) => f.includes('project.md'));
            expect(projectFile).toBeUndefined();
        });

        it('should skip channel-scoped entries when channelSlug is not provided', async () => {
            const optionsNoChannel: WriteMemoryOptions = {
                agentSlug: 'seo-agent',
                projectSlug: 'marketing',
            };

            const files = await service.writeMemories(FULL_EXTRACTION, optionsNoChannel);

            // Channel-scoped entries should not create channel.md
            const channelFile = files.find((f) => f.includes('channel.md'));
            expect(channelFile).toBeUndefined();
        });

        it('should write company-scoped semantic entries to workspace.md', async () => {
            const extraction: ExtractionResult = {
                ...FULL_EXTRACTION,
                semantic: [
                    { fact: 'Company prefers formal tone', confidence: 0.9, scope: 'company' },
                ],
            };

            await service.writeMemories(extraction, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`);
            expect(content).toBeDefined();
            expect(content).toContain('Company prefers formal tone');
        });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
        it('should handle extraction with only working state', async () => {
            const extraction: ExtractionResult = {
                working: 'Just a working state',
                episodic: [],
                semantic: [],
                procedural: [],
                digest_line: 'Summary',
            };

            const files = await service.writeMemories(extraction, DEFAULT_OPTIONS);

            expect(files).toHaveLength(1);
            expect(files[0]).toContain('working.md');
        });

        it('should create agent directory if it does not exist', async () => {
            // Use a new agent that has no directory
            const options: WriteMemoryOptions = { agentSlug: 'new-agent' };
            const extraction: ExtractionResult = {
                working: 'Starting fresh',
                episodic: [],
                semantic: [],
                procedural: [],
                digest_line: 'First session',
            };

            await service.writeMemories(extraction, options);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/new-agent/working.md`);
            expect(content).toBeDefined();
            expect(content).toContain('Starting fresh');
        });

        it('should handle concurrent writes to different agent files', async () => {
            const extraction1: ExtractionResult = {
                working: 'Agent 1 state',
                episodic: [],
                semantic: [],
                procedural: [],
                digest_line: 'Agent 1 summary',
            };
            const extraction2: ExtractionResult = {
                working: 'Agent 2 state',
                episodic: [],
                semantic: [],
                procedural: [],
                digest_line: 'Agent 2 summary',
            };

            await Promise.all([
                service.writeMemories(extraction1, { agentSlug: 'agent-1' }),
                service.writeMemories(extraction2, { agentSlug: 'agent-2' }),
            ]);

            const content1 = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/agent-1/working.md`);
            const content2 = fs.getContent(`${WORKSPACE_PATH}/.memory/agents/agent-2/working.md`);
            expect(content1).toContain('Agent 1 state');
            expect(content2).toContain('Agent 2 state');
        });

        it('should append to existing workspace.md', async () => {
            await fs.writeFile(
                `${WORKSPACE_PATH}/.memory/workspace.md`,
                '## Workspace Knowledge\n\n- Existing fact\n'
            );

            const extraction: ExtractionResult = {
                ...FULL_EXTRACTION,
                semantic: [
                    { fact: 'New workspace fact', confidence: 0.9, scope: 'company' },
                ],
            };

            await service.writeMemories(extraction, DEFAULT_OPTIONS);

            const content = fs.getContent(`${WORKSPACE_PATH}/.memory/workspace.md`)!;
            expect(content).toContain('Existing fact');
            expect(content).toContain('New workspace fact');
        });
    });
});
