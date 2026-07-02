// Memory Path Inference
// Pure functions that map a .memory/-relative file path to its memory_type and
// scope. Shared by the in-sandbox runner adapter (sandbox-adapters.ts) and the
// backend post-session memory indexer so both emit identical metadata.
//
// Paths are relative to the .memory/ root, e.g.:
//   agents/{slug}/working.md   -> type 'working',  scope 'agent'
//   company/decisions.md       -> type 'decisions' (via map miss -> 'working'), scope 'company'
//   projects/{domain}/context.md -> type 'context', scope 'project'

import path from 'path';

// Maps a file basename (without .md) to a memory_type. Basenames not present
// here fall back to 'working'. Values must be accepted by the
// memory_search_index.msi_memory_type_check constraint (migration 096).
const MEMORY_TYPE_MAP: Record<string, string> = {
    'working': 'working',
    'expertise': 'expertise',
    'episodic': 'episodic',
    'semantic': 'semantic',
    'procedural': 'procedural',
    'learnings': 'semantic',
    'patterns': 'procedural',
    'digest': 'context',
    'context': 'context',
};

/** Infer memory_type from a .memory/-relative file path (by basename). */
export function inferMemoryType(filePath: string): string {
    const basename = path.basename(filePath, '.md');
    return MEMORY_TYPE_MAP[basename] || 'working';
}

/** Infer scope from a .memory/-relative file path (by top-level directory). */
export function inferMemoryScope(filePath: string): string {
    if (filePath.startsWith('agents/')) return 'agent';
    if (filePath.startsWith('shared/')) return 'company';
    if (filePath.startsWith('company/')) return 'company';
    if (filePath.startsWith('user/')) return 'user';
    if (filePath.startsWith('entities/')) return 'entity';
    if (filePath.startsWith('topics/')) return 'topic';
    if (filePath.startsWith('projects/')) return 'project';
    return 'agent';
}
