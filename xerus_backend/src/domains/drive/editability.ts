// Editability Rules
// Determines whether a workspace file path is editable, read-only, or hidden
// Based on the File Editability Matrix from workspace-drive.md

import { EditabilityStatus } from './types';

// Hidden paths - never exposed to the user.
// These are platform plumbing (memory, beads, context), version control
// artifacts (.git, .gitignore), SQLite state (data/), or build output that
// has no reason to appear in the user's drive browser. Anything the user
// interacts with has its own dedicated UI — memory via the agent Memory tab,
// tasks via the Kanban board, context via agent execution history.
const HIDDEN_PATTERNS: RegExp[] = [
    /^\.xerus\//,
    /(^|\/)\.git(\/|$)/,
    /(^|\/)\.gitignore$/,
    /(^|\/)\.gitattributes$/,
    /(^|\/)\.gitmodules$/,
    /(^|\/)\.beads(\/|$)/,
    /^\.memory\//,
    /^context\//,
    /^\.mcp\.json$/,
    /^\.env(\..+)?$/,
    /^data\//,
    /^node_modules\//,
    /^\.next\//,
    /^drive\/mood-board\.md$/,
    /^drive\/\..+/,
];

// Read-only paths - visible but not writable.
// These are platform-owned surfaces the user should see but not edit:
// catalog content, generated CLAUDE.md files, and channel output.
const READ_ONLY_PATTERNS: RegExp[] = [
    /^agents\/[^/]+\/CLAUDE\.md$/,
    /^projects\/[^/]+\/channels\/[^/]+\/output\//,
    /^\.claude\//,
    /^marketplace\//,
    /^CLAUDE\.md$/,
];

// Editable paths - writable by users via Drive
const EDITABLE_PATTERNS: RegExp[] = [
    /^agents\/[^/]+\/SOUL\.md$/,
    /^agents\/[^/]+\/STATUS\.md$/,
    /^agents\/[^/]+\/config\.json$/,
    /^agents\/[^/]+\/HEARTBEAT\.md$/,
    /^agents\/[^/]+\/knowledge\/.+/,
    /^drive\/.+/,
    /^projects\/[^/]+\/knowledge\/.+/,
];

export function getEditability(filePath: string): EditabilityStatus {
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');

    for (const pattern of HIDDEN_PATTERNS) {
        if (pattern.test(normalized)) {
            return 'hidden';
        }
    }

    for (const READ_ONLY_PATTERN of READ_ONLY_PATTERNS) {
        if (READ_ONLY_PATTERN.test(normalized)) {
            return 'read_only';
        }
    }

    for (const pattern of EDITABLE_PATTERNS) {
        if (pattern.test(normalized)) {
            return 'editable';
        }
    }

    // Default: read-only for safety (unknown paths are viewable but not writable)
    return 'read_only';
}

export function isHidden(filePath: string): boolean {
    return getEditability(filePath) === 'hidden';
}

export function isEditable(filePath: string): boolean {
    return getEditability(filePath) === 'editable';
}
