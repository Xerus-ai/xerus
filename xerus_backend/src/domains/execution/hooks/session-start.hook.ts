// SessionStart Hook
// Context manifest setup when SDK session initializes.
// Scans context directory, builds context/index.md, verifies workspace structure,
// ensures .memory/ Git repo exists, and logs session start for analytics.
//
// ARCHITECTURE (Feb 2025): File-based context. See docs/planning/execution/context-manager.md

import { SessionStartInput, HookResult } from './hooks.types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SessionStartContext {
    agent_id: number;
    agent_slug: string;
    user_id: string;
    workspace_id: string;
    workspace_path: string;
}

export interface ContextFileEntry {
    path: string;
    size: number;
}

export interface SessionStartRecord {
    agent_id: number;
    user_id: string;
    trigger_type: string;
    session_id: string;
    timestamp: Date;
}

export interface SessionStartHandlerResult extends HookResult {
    index_path?: string;
    context_file_count?: number;
    memory_initialized?: boolean;
    directories_verified?: string[];
}

// -----------------------------------------------------------------------------
// Dependency Interfaces
// -----------------------------------------------------------------------------

export interface WorkspaceScanner {
    listFiles(dirPath: string): Promise<ContextFileEntry[]>;
    directoryExists(dirPath: string): Promise<boolean>;
}

export interface WorkspaceWriter {
    writeFile(filePath: string, content: string): Promise<void>;
    ensureDirectory(dirPath: string): Promise<void>;
}

export interface MemoryRepoInitializer {
    ensureInitialized(workspaceId: string): Promise<boolean>;
    ensureAgentDirectory(agentSlug: string): Promise<void>;
}

export interface SessionAnalytics {
    recordSessionStart(record: SessionStartRecord): Promise<void>;
}

export interface SessionStartHandlerDeps {
    workspaceScanner: WorkspaceScanner;
    workspaceWriter: WorkspaceWriter;
    memoryRepoInitializer: MemoryRepoInitializer;
    sessionAnalytics: SessionAnalytics;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CONTEXT_DIR = 'context';
const CONTEXT_INDEX_PATH = 'context/index.md';
const REQUIRED_DIRS = [
    'context',
    'context/memory',
    'context/knowledge',
    'context/ace',
    'context/trigger',
    'output',
];

const CATEGORY_NAMES: Record<string, string> = {
    memory: 'Memory',
    knowledge: 'Knowledge Base',
    ace: 'ACE Playbook',
    trigger: 'Trigger Context',
    other: 'Other',
};

// -----------------------------------------------------------------------------
// SessionStartHandler Class
// -----------------------------------------------------------------------------

/**
 * Handler for SessionStart hook events.
 *
 * Responsibilities:
 * 1. Verify workspace directory structure
 * 2. Ensure .memory/ Git repo initialized (first time)
 * 3. Ensure agent directory .memory/agents/{slug}/
 * 4. Scan context directory for available files
 * 5. Build context/index.md manifest
 * 6. Log session start for analytics
 */
export class SessionStartHandler {
    private readonly deps: SessionStartHandlerDeps;
    private readonly context: SessionStartContext;

    constructor(deps: SessionStartHandlerDeps, context: SessionStartContext) {
        this.deps = deps;
        this.context = context;
    }

    async handle(input: SessionStartInput): Promise<SessionStartHandlerResult> {
        const directoriesVerified = await this.verifyDirectories();
        const memoryInitialized = await this.ensureMemoryRepo();
        await this.ensureAgentMemoryDirectory();
        const contextFiles = await this.scanContextDirectory();
        await this.buildContextManifest(contextFiles);
        await this.recordSessionStart(input);

        return {
            success: true,
            index_path: CONTEXT_INDEX_PATH,
            context_file_count: contextFiles.length,
            memory_initialized: memoryInitialized,
            directories_verified: directoriesVerified,
        };
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private async verifyDirectories(): Promise<string[]> {
        const verified: string[] = [];

        for (const dir of REQUIRED_DIRS) {
            const exists = await this.deps.workspaceScanner.directoryExists(dir);
            if (!exists) {
                await this.deps.workspaceWriter.ensureDirectory(dir);
            }
            verified.push(dir);
        }

        return verified;
    }

    private async ensureMemoryRepo(): Promise<boolean> {
        return this.deps.memoryRepoInitializer.ensureInitialized(
            this.context.workspace_id
        );
    }

    private async ensureAgentMemoryDirectory(): Promise<void> {
        await this.deps.memoryRepoInitializer.ensureAgentDirectory(
            this.context.agent_slug
        );
    }

    private async scanContextDirectory(): Promise<ContextFileEntry[]> {
        const exists = await this.deps.workspaceScanner.directoryExists(CONTEXT_DIR);
        if (!exists) {
            return [];
        }
        return this.deps.workspaceScanner.listFiles(CONTEXT_DIR);
    }

    private async buildContextManifest(files: ContextFileEntry[]): Promise<void> {
        const content = this.generateManifestContent(files);
        await this.deps.workspaceWriter.writeFile(CONTEXT_INDEX_PATH, content);
    }

    private generateManifestContent(files: ContextFileEntry[]): string {
        const lines: string[] = [
            '# Context Index',
            '',
            `Agent: ${this.context.agent_slug}`,
            `Generated: ${new Date().toISOString()}`,
            '',
            'Available context files for this session.',
            'Read specific files as needed using the Read tool.',
            '',
        ];

        const grouped = this.groupFilesByCategory(files);

        for (const [category, categoryFiles] of Object.entries(grouped)) {
            if (categoryFiles.length === 0) {
                continue;
            }

            const name = CATEGORY_NAMES[category] || category.charAt(0).toUpperCase() + category.slice(1);
            lines.push(`## ${name}`);
            lines.push('');

            for (const file of categoryFiles) {
                const sizeKb = (file.size / 1024).toFixed(1);
                lines.push(`- \`${file.path}\` (${sizeKb} KB)`);
            }

            lines.push('');
        }

        if (files.length === 0) {
            lines.push('No context files available yet.');
            lines.push('');
        }

        return lines.join('\n');
    }

    private groupFilesByCategory(files: ContextFileEntry[]): Record<string, ContextFileEntry[]> {
        const groups: Record<string, ContextFileEntry[]> = {
            memory: [],
            knowledge: [],
            ace: [],
            trigger: [],
            other: [],
        };

        for (const file of files) {
            const category = this.extractCategory(file.path);
            if (groups[category]) {
                groups[category].push(file);
            } else {
                groups.other.push(file);
            }
        }

        return groups;
    }

    private extractCategory(filePath: string): string {
        const normalized = filePath.replace(/\\/g, '/');
        const parts = normalized.split('/');

        if (parts.length >= 2 && parts[0] === 'context') {
            return parts[1];
        }

        return 'other';
    }

    private async recordSessionStart(input: SessionStartInput): Promise<void> {
        await this.deps.sessionAnalytics.recordSessionStart({
            agent_id: this.context.agent_id,
            user_id: this.context.user_id,
            trigger_type: input.trigger_type,
            session_id: input.session_id,
            timestamp: new Date(),
        });
    }
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

export function createSessionStartHandler(
    deps: SessionStartHandlerDeps,
    context: SessionStartContext
): (input: SessionStartInput) => Promise<SessionStartHandlerResult> {
    const handler = new SessionStartHandler(deps, context);
    return (input: SessionStartInput) => handler.handle(input);
}
