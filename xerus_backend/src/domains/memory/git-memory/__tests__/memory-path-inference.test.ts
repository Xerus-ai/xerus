// Memory Path Inference Tests
// Pure unit tests for the .memory/-relative path -> memory_type/scope mapping
// shared by the runner adapter and the backend post-session indexer.

import { inferMemoryType, inferMemoryScope } from '../memory-path-inference';

describe('inferMemoryType', () => {
    it('maps agent working/expertise files to their own types', () => {
        expect(inferMemoryType('agents/seo-agent/working.md')).toBe('working');
        expect(inferMemoryType('agents/seo-agent/expertise.md')).toBe('expertise');
    });

    it('maps learnings -> semantic and patterns -> procedural', () => {
        expect(inferMemoryType('projects/growth/learnings.md')).toBe('semantic');
        expect(inferMemoryType('projects/growth/patterns.md')).toBe('procedural');
    });

    it('maps digest and context to context', () => {
        expect(inferMemoryType('agents/seo-agent/digest.md')).toBe('context');
        expect(inferMemoryType('projects/growth/context.md')).toBe('context');
    });

    it('preserves episodic/semantic/procedural basenames', () => {
        expect(inferMemoryType('agents/x/episodic.md')).toBe('episodic');
        expect(inferMemoryType('agents/x/semantic.md')).toBe('semantic');
        expect(inferMemoryType('agents/x/procedural.md')).toBe('procedural');
    });

    it('falls back to working for unknown basenames', () => {
        expect(inferMemoryType('agents/x/random-notes.md')).toBe('working');
        expect(inferMemoryType('company/vision.md')).toBe('working');
    });
});

describe('inferMemoryScope', () => {
    it('maps top-level directories to scopes', () => {
        expect(inferMemoryScope('agents/seo-agent/working.md')).toBe('agent');
        expect(inferMemoryScope('shared/notes.md')).toBe('company');
        expect(inferMemoryScope('company/vision.md')).toBe('company');
        expect(inferMemoryScope('user/preferences.md')).toBe('user');
        expect(inferMemoryScope('entities/people/jane.md')).toBe('entity');
        expect(inferMemoryScope('topics/pricing.md')).toBe('topic');
        expect(inferMemoryScope('projects/growth/context.md')).toBe('project');
    });

    it('defaults to agent for unrecognized paths', () => {
        expect(inferMemoryScope('unknown/file.md')).toBe('agent');
        expect(inferMemoryScope('index.md')).toBe('agent');
    });
});
