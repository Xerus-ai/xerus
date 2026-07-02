-- Migration: 096_relax_memory_search_index_constraints.sql
-- Description: Relax memory_search_index scope/memory_type CHECK constraints so
--   they accept the v2 hierarchical memory model. Migration 028 created these
--   constraints for the v1 flat model only, so every v2 write emitted by the live
--   indexing path (inferMemoryScope / inferMemoryType) was silently rejected,
--   leaving memory_search_index empty. Widen both to cover all values any code
--   path can emit (v2 model + legacy values still produced by inference).
-- Depends: 028_git_memory_search_index.sql
-- Reference: src/domains/memory/memory.types.ts (MEMORY_SCOPES, MEMORY_TYPES)
--            src/domains/memory/git-memory/memory-path-inference.ts

-- ===== 1. RELAX scope CHECK =====
-- v2 scopes: company, project, channel, agent, user, entity, topic
-- Legacy value 'workspace' retained for backward compatibility (harmless — nothing
-- emits it now, but keeping it avoids rejecting any pre-existing rows).
ALTER TABLE memory_search_index DROP CONSTRAINT IF EXISTS msi_scope_check;
ALTER TABLE memory_search_index
    ADD CONSTRAINT msi_scope_check CHECK (
        scope IN (
            'workspace', 'company', 'project', 'channel', 'agent', 'user', 'entity', 'topic'
        )
    );

-- ===== 2. RELAX memory_type CHECK =====
-- v2 types (memory.types.ts MEMORY_TYPES): working, expertise, context, learnings,
-- patterns, decisions, standup, vision, preferences, entity, topic.
-- Legacy types still produced by inferMemoryType and the DRM path: episodic,
-- semantic, procedural, action_history.
ALTER TABLE memory_search_index DROP CONSTRAINT IF EXISTS msi_memory_type_check;
ALTER TABLE memory_search_index
    ADD CONSTRAINT msi_memory_type_check CHECK (
        memory_type IN (
            'working', 'expertise', 'context', 'learnings', 'patterns',
            'decisions', 'standup', 'vision', 'preferences', 'entity', 'topic',
            'episodic', 'semantic', 'procedural', 'action_history'
        )
    );

COMMENT ON COLUMN memory_search_index.memory_type IS 'v2 hierarchical memory type (working, expertise, context, learnings, patterns, decisions, standup, vision, preferences, entity, topic) plus legacy episodic/semantic/procedural/action_history';
COMMENT ON COLUMN memory_search_index.scope IS 'v2 scope: workspace, company, project, channel, agent, user, entity, topic';
