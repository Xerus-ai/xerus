// Sandbox Context Builder
// Runs inside Daytona sandbox. Populates context/ directory with memory,
// trigger, and knowledge file references before the agent's first turn.
//
// Architecture: File-based context (Feb 2025 pivot).
// - Memory lives in .memory/agents/{slug}/ (git-backed)
// - KB docs live in workspace root (mounted via Daytona volumes)
// - ACE playbook at context/ace/playbook.md (pre-populated by backend or stub)
// - This builder COPIES memory summaries to context/memory/ so the agent
//   can discover them via context/index.md without knowing .memory/ layout.

import fs from 'fs';
import path from 'path';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ContextBuildParams {
    agentSlug: string;
    userId: string;
    triggerType: string;
    triggerPayload: Record<string, unknown>;
}

export interface ContextBuildResult {
    success: boolean;
    indexPath: string;
    filesWritten: string[];
}

// -----------------------------------------------------------------------------
// SandboxContextBuilder
// -----------------------------------------------------------------------------

/**
 * Builds context files for agent consumption inside the sandbox.
 *
 * Called by UserPromptSubmit hook before the agent's first turn.
 * Does NOT require database access — works purely with the filesystem.
 *
 * Steps:
 * 1. Copy memory files from .memory/agents/{slug}/ to context/memory/
 * 2. Write trigger context to context/trigger/current.md
 * 3. Scan context/ tree and rebuild context/index.md
 */
export class SandboxContextBuilder {
    private readonly workspacePath: string;

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
    }

    async buildContextFiles(params: ContextBuildParams): Promise<ContextBuildResult> {
        const filesWritten: string[] = [];

        // 1. Sync memory files
        const memoryFiles = this.syncMemoryFiles(params.agentSlug);
        filesWritten.push(...memoryFiles);

        // 2. Write trigger context
        const triggerFile = this.writeTriggerContext(params.triggerType, params.triggerPayload);
        if (triggerFile) filesWritten.push(triggerFile);

        // 3. Build skills context
        const skillsFile = this.buildSkillsContext();
        if (skillsFile) filesWritten.push(skillsFile);

        // 4. Rebuild context/index.md
        const indexPath = this.rebuildIndex(params.agentSlug);
        filesWritten.push(indexPath);

        return { success: true, indexPath, filesWritten };
    }

    // -------------------------------------------------------------------------
    // Memory Sync
    // -------------------------------------------------------------------------

    /**
     * Copy memory files from .memory/agents/{slug}/ to context/memory/.
     * The agent's prompt tells it to read context/index.md — having memory
     * files listed there makes them discoverable without hardcoded paths.
     *
     * Also copies company-level and user-level memory for broader context.
     */
    private syncMemoryFiles(agentSlug: string): string[] {
        const memoryDest = path.join(this.workspacePath, 'context', 'memory');
        const written: string[] = [];

        this.ensureDir(memoryDest);

        // Agent-scoped memory — copied to context/memory/ (flat, preserving existing path contract)
        const agentMemory = path.join(this.workspacePath, '.memory', 'agents', agentSlug);
        if (fs.existsSync(agentMemory)) {
            const agentFiles = ['working.md', 'expertise.md', 'episodic.md', 'semantic.md', 'procedural.md'];
            for (const file of agentFiles) {
                written.push(...this.copyIfExists(path.join(agentMemory, file), path.join(memoryDest, file)));
            }
        }

        // Company-level memory — copied to context/memory/company/
        const companyMemory = path.join(this.workspacePath, '.memory', 'company');
        if (fs.existsSync(companyMemory)) {
            const companyDest = path.join(memoryDest, 'company');
            this.ensureDir(companyDest);
            for (const file of ['vision.md', 'decisions.md', 'standup.md']) {
                written.push(...this.copyIfExists(path.join(companyMemory, file), path.join(companyDest, file)));
            }
        }

        // User-level memory — copied to context/memory/user/
        const userMemory = path.join(this.workspacePath, '.memory', 'user');
        if (fs.existsSync(userMemory)) {
            const userDest = path.join(memoryDest, 'user');
            this.ensureDir(userDest);
            for (const file of ['preferences.md', 'context.md']) {
                written.push(...this.copyIfExists(path.join(userMemory, file), path.join(userDest, file)));
            }
        }

        return written;
    }

    private copyIfExists(src: string, dest: string): string[] {
        if (!fs.existsSync(src)) return [];
        const content = fs.readFileSync(src, 'utf-8');
        if (content.trim().length === 0) return [];
        fs.writeFileSync(dest, content, 'utf-8');
        return [path.relative(this.workspacePath, dest)];
    }

    // -------------------------------------------------------------------------
    // Trigger Context
    // -------------------------------------------------------------------------

    /**
     * Write trigger-specific context so the agent knows WHY it was invoked.
     * File: context/trigger/current.md
     */
    private writeTriggerContext(
        triggerType: string,
        triggerPayload: Record<string, unknown>,
    ): string | null {
        if (!triggerType || triggerType === 'execute') {
            // Regular user message — no special trigger context needed
            return null;
        }

        const triggerDir = path.join(this.workspacePath, 'context', 'trigger');
        this.ensureDir(triggerDir);

        const lines = [
            '# Trigger Context',
            '',
            `**Type**: ${triggerType}`,
            `**Time**: ${new Date().toISOString()}`,
            '',
        ];

        if (triggerType === 'heartbeat') {
            lines.push('This is a scheduled heartbeat execution.');
            lines.push('Check HEARTBEAT.md for scheduled tasks and event data.');
        } else if (triggerType === 'webhook') {
            lines.push('This execution was triggered by an external webhook.');
            if (triggerPayload.source) lines.push(`**Source**: ${triggerPayload.source}`);
            if (triggerPayload.event) lines.push(`**Event**: ${triggerPayload.event}`);
        } else if (triggerType === 'schedule') {
            lines.push('This is a scheduled execution.');
            if (triggerPayload.schedule) lines.push(`**Schedule**: ${triggerPayload.schedule}`);
        }

        if (Object.keys(triggerPayload).length > 0) {
            lines.push('');
            lines.push('## Payload');
            lines.push('');
            lines.push('```json');
            lines.push(JSON.stringify(triggerPayload, null, 2));
            lines.push('```');
        }

        const content = lines.join('\n');
        const filePath = path.join(triggerDir, 'current.md');
        fs.writeFileSync(filePath, content, 'utf-8');
        return path.relative(this.workspacePath, filePath);
    }

    // -------------------------------------------------------------------------
    // Skills Context
    // -------------------------------------------------------------------------

    private buildSkillsContext(): string | null {
        const skillsDirs = [
            path.join(this.workspacePath, '.claude', 'skills'),
        ];
        const skills: Array<{ name: string; description: string; path: string }> = [];

        for (const dir of skillsDirs) {
            if (!fs.existsSync(dir)) continue;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const skillMd = path.join(dir, entry.name, 'SKILL.md');
                if (!fs.existsSync(skillMd)) continue;
                const content = fs.readFileSync(skillMd, 'utf-8');
                const firstLine = content.split('\n').find(l => l.trim().length > 0) || '';
                const description = firstLine.replace(/^#+\s*/, '').trim() || entry.name;
                skills.push({
                    name: entry.name,
                    description,
                    path: `.claude/skills/${entry.name}/SKILL.md`,
                });
            }
        }

        if (skills.length === 0) return null;

        const lines = [
            '# Installed Skills',
            '',
            ...skills.map(s => `- **${s.name}**: ${s.description}\n  path: ${s.path}`),
            '',
        ];

        const contextDir = path.join(this.workspacePath, 'context');
        this.ensureDir(contextDir);
        const filePath = path.join(contextDir, 'skills.md');
        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
        return 'context/skills.md';
    }

    // -------------------------------------------------------------------------
    // Index Builder
    // -------------------------------------------------------------------------

    /**
     * Scan context/ tree and write context/index.md.
     * This is the single entry point the agent reads to discover available files.
     */
    private rebuildIndex(agentSlug: string): string {
        const contextDir = path.join(this.workspacePath, 'context');
        this.ensureDir(contextDir);

        const files = this.scanDir(contextDir);
        const lines = [
            '# Context Index',
            '',
            `Agent: ${agentSlug}`,
            `Generated: ${new Date().toISOString()}`,
            '',
            'Available context files for this session.',
            'Read specific files as needed using the Read tool.',
            '',
        ];

        const categories: Record<string, { path: string; sizeKb: string }[]> = {
            memory: [],
            knowledge: [],
            ace: [],
            trigger: [],
            other: [],
        };

        const categoryNames: Record<string, string> = {
            memory: 'Memory',
            knowledge: 'Knowledge Base',
            ace: 'ACE Playbook',
            trigger: 'Trigger Context',
            other: 'Other',
        };

        for (const file of files) {
            const relPath = path.relative(contextDir, file);
            if (relPath === 'index.md') continue;

            const parts = relPath.replace(/\\/g, '/').split('/');
            const category = parts.length >= 1 && categories[parts[0]] ? parts[0] : 'other';
            const stat = fs.statSync(file);
            categories[category].push({
                path: `context/${relPath.replace(/\\/g, '/')}`,
                sizeKb: (stat.size / 1024).toFixed(1),
            });
        }

        // Also include .memory/ files for direct reference
        const memoryDir = path.join(this.workspacePath, '.memory', 'agents', agentSlug);
        if (fs.existsSync(memoryDir)) {
            const memoryFiles = this.scanDir(memoryDir);
            if (memoryFiles.length > 0) {
                lines.push('## Memory (Git-backed)');
                lines.push('');
                lines.push('Primary memory files (also copied to context/memory/):');
                lines.push('');
                for (const file of memoryFiles) {
                    const relPath = path.relative(this.workspacePath, file);
                    const stat = fs.statSync(file);
                    const sizeKb = (stat.size / 1024).toFixed(1);
                    lines.push(`- \`${relPath.replace(/\\/g, '/')}\` (${sizeKb} KB)`);
                }
                lines.push('');
            }
        }

        for (const [category, catFiles] of Object.entries(categories)) {
            if (catFiles.length === 0) continue;
            lines.push(`## ${categoryNames[category] || category}`);
            lines.push('');
            for (const f of catFiles) {
                lines.push(`- \`${f.path}\` (${f.sizeKb} KB)`);
            }
            lines.push('');
        }

        const hasAnyFiles = Object.values(categories).some(c => c.length > 0);
        if (!hasAnyFiles) {
            lines.push('No context files available yet.');
            lines.push('');
        }

        const indexPath = path.join(contextDir, 'index.md');
        fs.writeFileSync(indexPath, lines.join('\n'), 'utf-8');
        return 'context/index.md';
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private ensureDir(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    private scanDir(dirPath: string): string[] {
        if (!fs.existsSync(dirPath)) return [];
        const results: string[] = [];
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                results.push(...this.scanDir(fullPath));
            } else {
                results.push(fullPath);
            }
        }
        return results;
    }
}
