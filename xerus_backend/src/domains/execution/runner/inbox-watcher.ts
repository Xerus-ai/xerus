// Inbox Watcher
// Watches agents/*/inbox/ for direct messages between agents
// Delivers unprocessed messages to agent sessions via ProcessManager
// Moves processed messages to inbox/processed/

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

export interface InboxMessage {
    agent_slug: string;
    filename: string;
    content: string;
    received_at: string;
}

export class InboxWatcher extends EventEmitter {
    private workspacePath: string;
    private watchers = new Map<string, fs.FSWatcher>();
    private pollInterval: NodeJS.Timeout | null = null;
    private stopped = false;

    constructor(workspacePath: string) {
        super();
        this.workspacePath = workspacePath;
    }

    start(): void {
        this.stopped = false;
        this.scanAndWatch();
        // Re-scan for new agents every 30 seconds
        this.pollInterval = setInterval(() => this.scanAndWatch(), 30_000);
    }

    stop(): void {
        this.stopped = true;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        for (const [, watcher] of this.watchers) {
            watcher.close();
        }
        this.watchers.clear();
    }

    private scanAndWatch(): void {
        const agentsDir = path.join(this.workspacePath, 'agents');
        if (!fs.existsSync(agentsDir)) return;

        let entries: string[];
        try {
            entries = fs.readdirSync(agentsDir);
        } catch {
            return;
        }

        for (const entry of entries) {
            if (entry === 'index.json') continue;
            const inboxPath = path.join(agentsDir, entry, 'inbox');
            if (this.watchers.has(entry)) continue;

            if (!fs.existsSync(inboxPath)) continue;

            this.processExistingMessages(entry, inboxPath);
            this.watchInbox(entry, inboxPath);
        }
    }

    private watchInbox(agentSlug: string, inboxPath: string): void {
        try {
            const watcher = fs.watch(inboxPath, (eventType, filename) => {
                if (this.stopped) return;
                if (eventType !== 'rename' || !filename) return;
                if (filename === 'processed') return;

                const filePath = path.join(inboxPath, filename);
                if (!fs.existsSync(filePath)) return;

                this.processMessage(agentSlug, inboxPath, filename);
            });

            watcher.on('error', () => {
                this.watchers.delete(agentSlug);
            });

            this.watchers.set(agentSlug, watcher);
        } catch {
            // Directory may have been removed
        }
    }

    private processExistingMessages(agentSlug: string, inboxPath: string): void {
        let files: string[];
        try {
            files = fs.readdirSync(inboxPath);
        } catch {
            return;
        }

        for (const file of files) {
            if (file === 'processed') continue;
            this.processMessage(agentSlug, inboxPath, file);
        }
    }

    private processMessage(agentSlug: string, inboxPath: string, filename: string): void {
        const filePath = path.join(inboxPath, filename);
        try {
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) return;

            const content = fs.readFileSync(filePath, 'utf-8');
            const message: InboxMessage = {
                agent_slug: agentSlug,
                filename,
                content,
                received_at: new Date().toISOString(),
            };

            this.emit('message', message);
            this.moveToProcessed(inboxPath, filename);
        } catch {
            // File may have been removed between detection and read
        }
    }

    private moveToProcessed(inboxPath: string, filename: string): void {
        const processedDir = path.join(inboxPath, 'processed');
        try {
            if (!fs.existsSync(processedDir)) {
                fs.mkdirSync(processedDir, { recursive: true });
            }
            const src = path.join(inboxPath, filename);
            const dest = path.join(processedDir, filename);
            if (fs.existsSync(src)) {
                fs.renameSync(src, dest);
            }
        } catch {
            // Non-fatal: message stays in inbox, will be re-processed
        }
    }
}
