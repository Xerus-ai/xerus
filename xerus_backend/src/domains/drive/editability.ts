// Editability Rules
// Determines whether a workspace file path is editable, read-only, or hidden
// Based on the File Editability Matrix from workspace-drive.md

import { EditabilityStatus } from './types';

// Hidden paths - never exposed to the user
const HIDDEN_PATTERNS: RegExp[] = [
    /^\.xerus\//,
    /^data\/company\.db$/,
];

// Read-only paths - visible but not writable
const READ_ONLY_PATTERNS: RegExp[] = [
    /^agents\/[^/]+\/CLAUDE\.md$/,
    /^projects\/[^/]+\/channels\/[^/]+\/output\//,
    /^\.memory\//,
    /^\.claude\//,
    /^marketplace\//,
    /^CLAUDE\.md$/,
    /^\.beads\//,
    /^context\//,
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
