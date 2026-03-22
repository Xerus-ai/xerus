// Session Manager
// Tracks active SDK query() sessions by agent slug
// Persists session state to disk for resume across restarts

import fs from 'fs';
import path from 'path';

export interface SessionState {
    agent_slug: string;
    session_id: string;
    started_at: string;
    status: 'active' | 'idle';
    last_activity: string;
}

const SESSION_STATE_FILE = '.xerus-sessions.json';

export class SessionManager {
    private sessions = new Map<string, SessionState>();
    private workspacePath: string;

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        this.loadFromDisk();
    }

    startSession(agentSlug: string, sessionId: string): SessionState {
        const now = new Date().toISOString();
        const state: SessionState = {
            agent_slug: agentSlug,
            session_id: sessionId,
            started_at: now,
            status: 'active',
            last_activity: now,
        };
        this.sessions.set(agentSlug, state);
        this.persistToDisk();
        return state;
    }

    endSession(agentSlug: string): void {
        const session = this.sessions.get(agentSlug);
        if (session) {
            session.status = 'idle';
            session.last_activity = new Date().toISOString();
            this.persistToDisk();
        }
    }

    getSession(agentSlug: string): SessionState | undefined {
        return this.sessions.get(agentSlug);
    }

    getSessionId(agentSlug: string): string | undefined {
        return this.sessions.get(agentSlug)?.session_id;
    }

    isActive(agentSlug: string): boolean {
        const session = this.sessions.get(agentSlug);
        return session?.status === 'active';
    }

    updateActivity(agentSlug: string): void {
        const session = this.sessions.get(agentSlug);
        if (session) {
            session.last_activity = new Date().toISOString();
        }
    }

    listSessions(): SessionState[] {
        return Array.from(this.sessions.values());
    }

    activeCount(): number {
        let count = 0;
        for (const session of this.sessions.values()) {
            if (session.status === 'active') count++;
        }
        return count;
    }

    removeSession(agentSlug: string): void {
        this.sessions.delete(agentSlug);
        this.persistToDisk();
    }

    private getStatePath(): string {
        return path.join(this.workspacePath, SESSION_STATE_FILE);
    }

    private loadFromDisk(): void {
        const statePath = this.getStatePath();
        try {
            if (fs.existsSync(statePath)) {
                const raw = fs.readFileSync(statePath, 'utf-8');
                const parsed = JSON.parse(raw) as SessionState[];
                for (const state of parsed) {
                    // Mark all sessions as idle on reload (runner restarted)
                    state.status = 'idle';
                    this.sessions.set(state.agent_slug, state);
                }
            }
        } catch {
            // Corrupt state file; start fresh
            this.sessions.clear();
        }
    }

    private persistToDisk(): void {
        const statePath = this.getStatePath();
        try {
            const data = Array.from(this.sessions.values());
            fs.writeFileSync(statePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[SessionManager] Failed to persist session state: ${msg}`);
        }
    }
}
