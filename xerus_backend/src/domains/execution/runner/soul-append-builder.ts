// Soul Append Builder
// Reads agent soul files and compiles them into a system prompt append string
// Used by loadAgentConfig() to build structured system_prompt for SDK query()

import fs from 'fs';
import path from 'path';

interface SoulSection {
    filename: string;
    header: string;
}

const SOUL_SECTIONS: SoulSection[] = [
    { filename: 'SOUL.md', header: '== Your Identity ==' },
    { filename: 'STATUS.md', header: '== Current State ==' },
    { filename: 'USER.md', header: '== Your User ==' },
    { filename: 'RELATIONSHIPS.md', header: '== Your Colleagues ==' },
    { filename: 'OPERATING.md', header: '== Operating Protocol ==' },
    { filename: 'HEARTBEAT.md', header: '== Scheduled Tasks ==' },
];

function readFileContent(filePath: string): string {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
}

function stripFirstHeader(content: string): string {
    const lines = content.split('\n');
    const firstNonEmpty = lines.findIndex(line => line.trim().length > 0);
    if (firstNonEmpty === -1) return '';
    if (lines[firstNonEmpty].trim().startsWith('#')) {
        return lines.slice(firstNonEmpty + 1).join('\n').trim();
    }
    return content.trim();
}

function extractNameFromSoul(content: string): string {
    const lines = content.split('\n');
    for (const line of lines) {
        const nameMatch = line.match(/^Name:\s*(.+)/);
        if (nameMatch) return nameMatch[1].trim();
    }
    return '';
}

function isBootstrapCompleted(content: string): boolean {
    const match = content.match(/completed_at:\s*(.+)/);
    if (!match) return false;
    const value = match[1].trim();
    return value !== 'null' && value !== '';
}

export function buildSoulAppend(agentDir: string): string {
    const parts: string[] = [];

    const soulContent = readFileContent(path.join(agentDir, 'SOUL.md'));
    const agentName = extractNameFromSoul(soulContent);
    if (agentName) {
        parts.push(`You are ${agentName}.`);
    }

    for (const section of SOUL_SECTIONS) {
        const content = readFileContent(path.join(agentDir, section.filename));
        const stripped = stripFirstHeader(content);
        if (stripped) {
            parts.push(`${section.header}\n${stripped}`);
        }
    }

    const bootstrapContent = readFileContent(path.join(agentDir, 'BOOTSTRAP.md'));
    if (bootstrapContent && !isBootstrapCompleted(bootstrapContent)) {
        const stripped = stripFirstHeader(bootstrapContent);
        if (stripped) {
            parts.push(`== First Run ==\n${stripped}`);
        }
    }

    const agentMdContent = readFileContent(path.join(agentDir, 'agent.md'));
    if (agentMdContent.trim()) {
        parts.push(`---\n${agentMdContent.trim()}`);
    }

    return parts.join('\n\n');
}

/**
 * Inject agent memory (working state + expertise) directly into the system prompt.
 * This ensures the agent has access to its prior knowledge without relying on
 * it proactively reading context/index.md files.
 */
export function buildMemoryAppend(workspacePath: string, agentSlug: string): string {
    const memoryDir = path.join(workspacePath, '.memory', 'agents', agentSlug);
    const parts: string[] = [];

    const working = readFileContent(path.join(memoryDir, 'working.md'));
    const workingContent = working.trim();
    if (workingContent.length > 80 && !workingContent.includes('No previous session state')) {
        const lastNewline = workingContent.lastIndexOf('\n', 4000);
        const trimmed = lastNewline > 0 ? workingContent.slice(0, lastNewline) : workingContent.slice(0, 4000);
        parts.push(`== Working Memory (from previous session) ==\n${trimmed}`);
    }

    const expertise = readFileContent(path.join(memoryDir, 'expertise.md'));
    const expertiseContent = expertise.trim();
    if (expertiseContent.length > 40) {
        const lastNl = expertiseContent.lastIndexOf('\n', 2000);
        const trimmed = lastNl > 0 ? expertiseContent.slice(0, lastNl) : expertiseContent.slice(0, 2000);
        parts.push(`== Expertise ==\n${trimmed}`);
    }

    const userPrefs = readFileContent(path.join(workspacePath, '.memory', 'user', 'preferences.md'));
    const prefsContent = userPrefs.trim();
    if (prefsContent.length > 20) {
        const lastNl = prefsContent.lastIndexOf('\n', 1000);
        const trimmed = lastNl > 0 ? prefsContent.slice(0, lastNl) : prefsContent.slice(0, 1000);
        parts.push(`== User Preferences ==\n${trimmed}`);
    }

    return parts.join('\n\n');
}
