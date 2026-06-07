// Soul File Template Tests
// Verifies template builder functions produce correct content
// Reference: docs/plans/2026-02-17-feat-alive-agent-architecture-plan.md Task 1

import { buildAllSoulFiles } from '../soul-file-templates';
import type { SoulFileContext, SoulFiles } from '../soul-file-templates';

describe('soul-file-templates', () => {
    const context: SoulFileContext = {
        name: 'SEO Agent',
        role: 'Search Engine Optimization Specialist',
    };

    describe('buildAllSoulFiles', () => {
        let files: SoulFiles;

        beforeEach(() => {
            files = buildAllSoulFiles(context);
        });

        it('should return all five soul file keys', () => {
            expect(Object.keys(files).sort()).toEqual([
                'bootstrap',
                'relationships',
                'soul',
                'status',
                'user',
            ]);
        });

        it('should produce non-empty content for every file', () => {
            for (const [, content] of Object.entries(files)) {
                expect(content.length).toBeGreaterThan(0);
                expect(content.trim().length).toBeGreaterThan(0);
            }
        });
    });

    describe('soul template', () => {
        it('should contain agent name and role', () => {
            const files = buildAllSoulFiles(context);

            expect(files.soul).toContain('SEO Agent');
            expect(files.soul).toContain('Search Engine Optimization Specialist');
        });

        it('should start with Soul heading', () => {
            const files = buildAllSoulFiles(context);

            expect(files.soul.startsWith('# Soul')).toBe(true);
        });

        it('should include Identity section', () => {
            const files = buildAllSoulFiles(context);

            expect(files.soul).toContain('## Identity');
            expect(files.soul).toContain('Name:');
            expect(files.soul).toContain('Role:');
        });
    });

    describe('status template', () => {
        it('should start with Status heading', () => {
            const files = buildAllSoulFiles(context);

            expect(files.status.startsWith('# Status')).toBe(true);
        });

        it('should include Current State section with defaults', () => {
            const files = buildAllSoulFiles(context);

            expect(files.status).toContain('## Current State');
            expect(files.status).toContain('Mood:');
            expect(files.status).toContain('Energy:');
            expect(files.status).toContain('Focus:');
        });
    });

    describe('user template', () => {
        it('should start with User Knowledge heading', () => {
            const files = buildAllSoulFiles(context);

            expect(files.user.startsWith('# User Knowledge')).toBe(true);
        });

        it('should include learning placeholders', () => {
            const files = buildAllSoulFiles(context);

            expect(files.user).toContain('Communication Preferences');
            expect(files.user).toContain('Work Patterns');
        });
    });

    describe('relationships template', () => {
        it('should start with Relationships heading', () => {
            const files = buildAllSoulFiles(context);

            expect(files.relationships.startsWith('# Relationships')).toBe(true);
        });

        it('should include Peers section', () => {
            const files = buildAllSoulFiles(context);

            expect(files.relationships).toContain('## Peers');
        });
    });

    describe('bootstrap template', () => {
        it('should start with Getting Started heading', () => {
            const files = buildAllSoulFiles(context);

            expect(files.bootstrap.startsWith('# Getting Started with')).toBe(true);
        });

        it('should have null completed_at', () => {
            const files = buildAllSoulFiles(context);

            expect(files.bootstrap).toContain('completed_at: null');
        });

        it('should include first run checklist items', () => {
            const files = buildAllSoulFiles(context);

            expect(files.bootstrap).toContain('Read workspace CLAUDE.md');
            expect(files.bootstrap).toContain('SOUL.md');
            expect(files.bootstrap).toContain('Introduce myself');
            expect(files.bootstrap).toContain('Mark bootstrap complete');
        });
    });

    describe('parameter substitution', () => {
        it('should substitute different agent contexts correctly', () => {
            const context2: SoulFileContext = {
                name: 'Content Writer',
                role: 'Blog & Newsletter Writer',
            };

            const files = buildAllSoulFiles(context2);

            expect(files.soul).toContain('Content Writer');
            expect(files.soul).toContain('Blog & Newsletter Writer');
            expect(files.soul).not.toContain('SEO Agent');
        });
    });
});
