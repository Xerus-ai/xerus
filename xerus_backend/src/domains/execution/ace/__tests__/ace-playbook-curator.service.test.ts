// ACE Playbook Curator Service Tests
// Uses real filesystem via GitMemoryRepository (no mocks)

import fs from 'fs';
import path from 'path';
import os from 'os';
import { AcePlaybookCuratorService } from '../ace-playbook-curator.service';
import { GitMemoryRepository } from '../../../memory/git-memory/git-memory.repository';
import type { ReflectorAnalysis } from '../ace-reflection.trigger';
import type { SandboxCommandExecutor, GitMemoryFileSystem } from '../../../memory/git-memory/git-memory.types';
import { execSync } from 'child_process';

// -----------------------------------------------------------------------------
// Real filesystem helpers
// -----------------------------------------------------------------------------

function createRealExecutor(): SandboxCommandExecutor {
    return {
        exec: async (command: string) => {
            try {
                const stdout = execSync(command, { encoding: 'utf-8', timeout: 10000, shell: process.platform === 'win32' ? 'bash' : undefined });
                return { stdout, stderr: '', exitCode: 0 };
            } catch (err: unknown) {
                const error = err as { stdout?: string; stderr?: string; status?: number };
                return {
                    stdout: error.stdout ?? '',
                    stderr: error.stderr ?? '',
                    exitCode: error.status ?? 1,
                };
            }
        },
    };
}

function createRealFileSystem(): GitMemoryFileSystem {
    return {
        mkdir: async (dirPath: string) => {
            fs.mkdirSync(dirPath, { recursive: true });
        },
        writeFile: async (filePath: string, content: string) => {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, content, 'utf-8');
        },
        readFile: async (filePath: string) => {
            return fs.readFileSync(filePath, 'utf-8');
        },
        exists: async (filePath: string) => {
            return fs.existsSync(filePath);
        },
        tryExclusiveCreate: async (filePath: string, content: string) => {
            if (fs.existsSync(filePath)) return false;
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, content, 'utf-8');
            return true;
        },
    };
}

function createAnalysis(insights: ReflectorAnalysis['insights']): ReflectorAnalysis {
    return {
        qualityScores: { overall: 0.8 },
        insights,
        errors: [],
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('AcePlaybookCuratorService', () => {
    let tmpDir: string;
    let gitRepo: GitMemoryRepository;
    let curator: AcePlaybookCuratorService;
    const agentSlug = 'test-agent';

    beforeEach(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-curator-'));
        const executor = createRealExecutor();
        const fileSystem = createRealFileSystem();
        gitRepo = new GitMemoryRepository(executor, fileSystem, tmpDir);
        await gitRepo.initializeRepository();
        await gitRepo.ensureAgentDirectory(agentSlug);
        curator = new AcePlaybookCuratorService(gitRepo, agentSlug);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates playbook from empty state', async () => {
        const analysis = createAnalysis([
            {
                type: 'success_pattern',
                content: 'Always validate input before processing',
                confidence: 0.9,
                domain: 'technical',
                keywords: ['validation', 'input'],
            },
        ]);

        const changes = await curator.curate(1, analysis);

        expect(changes.added).toHaveLength(1);
        expect(changes.added[0].content).toBe('Always validate input before processing');
        expect(changes.updated).toHaveLength(0);
        expect(changes.deprecated).toHaveLength(0);

        // Verify file was written
        const content = await gitRepo.readFile(`agents/${agentSlug}/playbook.md`);
        expect(content).toContain('Always validate input before processing');
        expect(content).toContain('technical');
    });

    it('merges with existing playbook entries', async () => {
        // Seed existing playbook
        const existingMarkdown = [
            '# ACE Playbook',
            '',
            'Behavioral guidance entries curated from session reflections.',
            '',
            '---',
            '',
            '## Technical: success pattern',
            '',
            'Use parameterized queries for SQL',
            '',
            '- **ID**: pb_existing_001',
            '- **Domain**: technical',
            '- **Type**: success_pattern',
            '- **Helpfulness**: 0.70',
            '- **Keywords**: sql, security',
            '- **Updated**: 2025-01-01T00:00:00.000Z',
            '',
            '---',
            '',
        ].join('\n');
        await gitRepo.writeFile(`agents/${agentSlug}/playbook.md`, existingMarkdown);

        const analysis = createAnalysis([
            {
                type: 'error_prevention',
                content: 'Handle timeout errors gracefully',
                confidence: 0.85,
                domain: 'general',
                keywords: ['timeout', 'error-handling'],
            },
        ]);

        const changes = await curator.curate(1, analysis);

        expect(changes.added).toHaveLength(1);
        expect(changes.updated).toHaveLength(0);

        // Verify both entries exist
        const content = await gitRepo.readFile(`agents/${agentSlug}/playbook.md`);
        expect(content).toContain('Use parameterized queries for SQL');
        expect(content).toContain('Handle timeout errors gracefully');
    });

    it('skips insights with confidence below threshold', async () => {
        const analysis = createAnalysis([
            {
                type: 'success_pattern',
                content: 'Low confidence insight',
                confidence: 0.3,
                domain: 'general',
            },
            {
                type: 'success_pattern',
                content: 'High confidence insight',
                confidence: 0.8,
                domain: 'general',
            },
        ]);

        const changes = await curator.curate(1, analysis);

        expect(changes.added).toHaveLength(1);
        expect(changes.added[0].content).toBe('High confidence insight');
    });

    it('caps entries at 50 and drops lowest helpfulness', async () => {
        // Seed 50 existing entries
        const entries: string[] = [
            '# ACE Playbook',
            '',
            'Behavioral guidance entries curated from session reflections.',
            '',
            '---',
            '',
        ];
        for (let i = 0; i < 50; i++) {
            const helpfulness = (0.5 + i * 0.01).toFixed(2);
            entries.push(`## General: success pattern`);
            entries.push('');
            entries.push(`Entry number ${i}`);
            entries.push('');
            entries.push(`- **ID**: pb_seed_${String(i).padStart(3, '0')}`);
            entries.push('- **Domain**: general');
            entries.push('- **Type**: success_pattern');
            entries.push(`- **Helpfulness**: ${helpfulness}`);
            entries.push('- **Keywords**: test');
            entries.push('- **Updated**: 2025-01-01T00:00:00.000Z');
            entries.push('');
            entries.push('---');
            entries.push('');
        }
        await gitRepo.writeFile(`agents/${agentSlug}/playbook.md`, entries.join('\n'));

        // Add one more insight
        const analysis = createAnalysis([
            {
                type: 'success_pattern',
                content: 'Brand new insight that pushes over cap',
                confidence: 0.95,
                domain: 'technical',
                keywords: ['new'],
            },
        ]);

        const changes = await curator.curate(1, analysis);

        expect(changes.added).toHaveLength(1);
        expect(changes.deprecated).toHaveLength(1);
        expect(changes.deprecated[0].reason).toBe('cap_exceeded');

        // Verify file has exactly 50 entries
        const content = await gitRepo.readFile(`agents/${agentSlug}/playbook.md`);
        const sectionCount = (content.match(/^## /gm) || []).length;
        expect(sectionCount).toBe(50);
    });

    it('bumps helpfulness on matching entries', async () => {
        const existingMarkdown = [
            '# ACE Playbook',
            '',
            'Behavioral guidance entries curated from session reflections.',
            '',
            '---',
            '',
            '## Technical: success pattern',
            '',
            'Always validate input',
            '',
            '- **ID**: pb_match_001',
            '- **Domain**: technical',
            '- **Type**: success_pattern',
            '- **Helpfulness**: 0.60',
            '- **Keywords**: validation',
            '- **Updated**: 2025-01-01T00:00:00.000Z',
            '',
            '---',
            '',
        ].join('\n');
        await gitRepo.writeFile(`agents/${agentSlug}/playbook.md`, existingMarkdown);

        const analysis = createAnalysis([
            {
                type: 'success_pattern',
                content: 'Always validate input',
                confidence: 0.9,
                domain: 'technical',
                keywords: ['validation', 'security'],
            },
        ]);

        const changes = await curator.curate(1, analysis);

        expect(changes.updated).toHaveLength(1);
        expect(changes.updated[0].id).toBe('pb_match_001');
        expect(changes.updated[0].newHelpfulness).toBeCloseTo(0.7);
        expect(changes.added).toHaveLength(0);

        // Verify keywords were merged
        const content = await gitRepo.readFile(`agents/${agentSlug}/playbook.md`);
        expect(content).toContain('security');
    });

    it('handles insights with no content gracefully', async () => {
        const analysis = createAnalysis([
            {
                type: 'success_pattern',
                confidence: 0.9,
                domain: 'general',
            },
        ]);

        const changes = await curator.curate(1, analysis);

        // No content means nothing to add
        expect(changes.added).toHaveLength(0);
        expect(changes.updated).toHaveLength(0);
    });
});
