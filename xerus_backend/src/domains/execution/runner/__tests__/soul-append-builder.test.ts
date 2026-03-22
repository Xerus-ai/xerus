// Soul Append Builder Tests
// Tests buildSoulAppend() with full, partial, missing, and oversized soul files

import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildSoulAppend } from '../soul-append-builder';

describe('buildSoulAppend', () => {
    let agentDir: string;

    beforeEach(() => {
        agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-test-'));
    });

    afterEach(() => {
        fs.rmSync(agentDir, { recursive: true, force: true });
    });

    function writeFile(name: string, content: string): void {
        fs.writeFileSync(path.join(agentDir, name), content);
    }

    it('returns empty string when no soul files exist', () => {
        const result = buildSoulAppend(agentDir);
        expect(result).toBe('');
    });

    it('builds full append with all soul files', () => {
        writeFile('SOUL.md', '# Soul\n\n## Identity\nName: Atlas\nRole: Engineer\n\n## Personality\nDirect and focused');
        writeFile('STATUS.md', '# Status\n\n## Current State\n- Mood: focused\n- Energy: high');
        writeFile('USER.md', '# User Knowledge\n\n## Communication Preferences\nPrefers concise responses');
        writeFile('RELATIONSHIPS.md', '# Relationships\n\n## Peers\n- Nova: designer');
        writeFile('BOOTSTRAP.md', '# Bootstrap\n\n## Status\ncompleted_at: null\n\n## First Run Checklist\n- [ ] Introduce yourself');

        const result = buildSoulAppend(agentDir);

        expect(result).toContain('You are Atlas.');
        expect(result).toContain('== Your Identity ==');
        expect(result).toContain('Role: Engineer');
        expect(result).toContain('== Current State ==');
        expect(result).toContain('Mood: focused');
        expect(result).toContain('== Your User ==');
        expect(result).toContain('Prefers concise responses');
        expect(result).toContain('== Your Colleagues ==');
        expect(result).toContain('Nova: designer');
        expect(result).toContain('== First Run ==');
        expect(result).toContain('Introduce yourself');
    });

    it('skips BOOTSTRAP.md when completed_at is set', () => {
        writeFile('SOUL.md', '# Soul\n\n## Identity\nName: Atlas\nRole: Engineer');
        writeFile('BOOTSTRAP.md', '# Bootstrap\n\n## Status\ncompleted_at: 2026-02-18T00:00:00Z\n\n## Done');

        const result = buildSoulAppend(agentDir);

        expect(result).toContain('You are Atlas.');
        expect(result).not.toContain('== First Run ==');
    });

    it('includes BOOTSTRAP.md when completed_at is null', () => {
        writeFile('BOOTSTRAP.md', '# Bootstrap\n\n## Status\ncompleted_at: null\n\n## First Run Checklist\n- [ ] Say hello');

        const result = buildSoulAppend(agentDir);

        expect(result).toContain('== First Run ==');
        expect(result).toContain('Say hello');
    });

    it('handles partial files (only SOUL.md exists)', () => {
        writeFile('SOUL.md', '# Soul\n\n## Identity\nName: Nova\nRole: Designer');

        const result = buildSoulAppend(agentDir);

        expect(result).toContain('You are Nova.');
        expect(result).toContain('== Your Identity ==');
        expect(result).not.toContain('== Current State ==');
        expect(result).not.toContain('== Your User ==');
        expect(result).not.toContain('== Your Colleagues ==');
    });

    it('appends agent.md content after separator', () => {
        writeFile('SOUL.md', '# Soul\n\n## Identity\nName: Atlas\nRole: Engineer');
        writeFile('agent.md', 'You are an expert TypeScript engineer.');

        const result = buildSoulAppend(agentDir);

        expect(result).toContain('---');
        expect(result).toContain('You are an expert TypeScript engineer.');
    });

    it('preserves full content for large appends', () => {
        const largePrompt = 'x'.repeat(30000);
        writeFile('SOUL.md', '# Soul\n\n## Identity\nName: Atlas\nRole: Engineer');
        writeFile('agent.md', largePrompt);

        const result = buildSoulAppend(agentDir);

        expect(result).toContain(largePrompt);
        expect(result.length).toBeGreaterThan(30000);
    });

    it('extracts name from SOUL.md correctly', () => {
        writeFile('SOUL.md', '# Soul\n\n## Identity\nName: Orion\nRole: Researcher');

        const result = buildSoulAppend(agentDir);

        expect(result).toMatch(/^You are Orion\./);
    });

    it('skips name line when Name field is missing', () => {
        writeFile('SOUL.md', '# Soul\n\nJust some content without a Name field');

        const result = buildSoulAppend(agentDir);

        expect(result).not.toContain('You are ');
        expect(result).toContain('== Your Identity ==');
    });

    it('strips header from each soul file', () => {
        writeFile('STATUS.md', '# Status\n\nMood: happy');

        const result = buildSoulAppend(agentDir);

        expect(result).toContain('== Current State ==');
        expect(result).toContain('Mood: happy');
        expect(result).not.toMatch(/# Status/);
    });

    it('handles empty soul files gracefully', () => {
        writeFile('SOUL.md', '');
        writeFile('STATUS.md', '');

        const result = buildSoulAppend(agentDir);

        expect(result).toBe('');
    });
});
