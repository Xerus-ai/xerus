// Pre-Query Workspace Initializer
// Runs BEFORE sdk.query() to handle initialization that SessionStart hook
// cannot perform (SDK fires SessionStart before programmatic hooks register).
//
// Responsibilities:
// 1. Initialize .memory/ git repository (idempotent, lock-based)
// 2. Create context directory tree (context/memory, knowledge, ace, trigger, output)
// 3. Initialize data/company.db with valid SQLite header
// 4. Ensure per-agent memory directory exists

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { GitMemoryRepository } from '../../memory/git-memory/git-memory.repository';

const CONTEXT_DIRS = [
    'context',
    'context/memory',
    'context/knowledge',
    'context/ace',
    'context/trigger',
    'output',
];

export class PreQueryInitializer {
    private readonly gitRepo: GitMemoryRepository;
    private readonly workspacePath: string;
    private workspaceReady = false;
    private initPromise: Promise<void> | null = null;

    constructor(gitRepo: GitMemoryRepository, workspacePath: string) {
        this.gitRepo = gitRepo;
        this.workspacePath = workspacePath;
    }

    async ensureWorkspaceReady(): Promise<void> {
        if (this.workspaceReady) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = this.performInit();
        try {
            await this.initPromise;
            this.workspaceReady = true;
        } catch (error) {
            this.initPromise = null;
            throw error;
        }
    }

    private async performInit(): Promise<void> {
        await this.gitRepo.initializeRepository();
        this.createContextDirs();
        this.initializeCompanyDb();
    }

    async ensureAgentReady(agentSlug: string): Promise<void> {
        await this.gitRepo.ensureAgentDirectory(agentSlug);
    }

    private createContextDirs(): void {
        for (const dir of CONTEXT_DIRS) {
            const fullPath = path.join(this.workspacePath, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }
        }
    }

    private initializeCompanyDb(): void {
        const companyDbPath = path.join(this.workspacePath, 'data', 'company.db');
        const needsInit = !fs.existsSync(companyDbPath) || fs.statSync(companyDbPath).size === 0;
        if (!needsInit) return;

        const dataDir = path.join(this.workspacePath, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        execFileSync('sqlite3', [companyDbPath, 'SELECT 1;'], { timeout: 5000 });
    }
}
