import fs from 'fs';
import path from 'path';
import os from 'os';
import { SessionManager } from '../session-manager';

describe('SessionManager', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xerus-session-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('starts a new session and tracks it', () => {
        const manager = new SessionManager(tmpDir);

        const state = manager.startSession('seo-writer', 'sess-123');

        expect(state.agent_slug).toBe('seo-writer');
        expect(state.session_id).toBe('sess-123');
        expect(state.status).toBe('active');
        expect(manager.isActive('seo-writer')).toBe(true);
    });

    it('ends a session and marks it idle', () => {
        const manager = new SessionManager(tmpDir);
        manager.startSession('seo-writer', 'sess-123');

        manager.endSession('seo-writer');

        expect(manager.isActive('seo-writer')).toBe(false);
        const session = manager.getSession('seo-writer');
        expect(session?.status).toBe('idle');
    });

    it('returns undefined for unknown agent', () => {
        const manager = new SessionManager(tmpDir);
        expect(manager.getSession('nonexistent')).toBeUndefined();
        expect(manager.getSessionId('nonexistent')).toBeUndefined();
    });

    it('lists all sessions', () => {
        const manager = new SessionManager(tmpDir);
        manager.startSession('seo-writer', 's1');
        manager.startSession('ad-optimizer', 's2');

        const sessions = manager.listSessions();
        expect(sessions).toHaveLength(2);

        const slugs = sessions.map(s => s.agent_slug).sort();
        expect(slugs).toEqual(['ad-optimizer', 'seo-writer']);
    });

    it('counts active sessions', () => {
        const manager = new SessionManager(tmpDir);
        manager.startSession('seo-writer', 's1');
        manager.startSession('ad-optimizer', 's2');
        manager.endSession('seo-writer');

        expect(manager.activeCount()).toBe(1);
    });

    it('persists sessions to disk and reloads them as idle', () => {
        const manager1 = new SessionManager(tmpDir);
        manager1.startSession('seo-writer', 'sess-abc');
        manager1.startSession('ad-optimizer', 'sess-def');

        // Create a new manager from same path (simulates restart)
        const manager2 = new SessionManager(tmpDir);
        const sessions = manager2.listSessions();
        expect(sessions).toHaveLength(2);

        // All sessions should be idle after restart
        for (const s of sessions) {
            expect(s.status).toBe('idle');
        }

        // Session IDs should be preserved for resume
        expect(manager2.getSessionId('seo-writer')).toBe('sess-abc');
    });

    it('removes a session', () => {
        const manager = new SessionManager(tmpDir);
        manager.startSession('seo-writer', 's1');
        manager.removeSession('seo-writer');

        expect(manager.getSession('seo-writer')).toBeUndefined();
        expect(manager.listSessions()).toHaveLength(0);
    });

    it('updates activity timestamp', () => {
        const manager = new SessionManager(tmpDir);
        manager.startSession('seo-writer', 's1');
        manager.updateActivity('seo-writer');
        const updated = manager.getSession('seo-writer');
        expect(updated).toBeDefined();
        expect(updated!.last_activity).toBeDefined();
    });

    it('handles corrupt state file gracefully', () => {
        const statePath = path.join(tmpDir, '.xerus-sessions.json');
        fs.writeFileSync(statePath, 'not valid json', 'utf-8');

        const manager = new SessionManager(tmpDir);
        expect(manager.listSessions()).toHaveLength(0);
    });

    it('replaces session for same agent slug', () => {
        const manager = new SessionManager(tmpDir);
        manager.startSession('seo-writer', 'old-session');
        manager.startSession('seo-writer', 'new-session');

        expect(manager.getSessionId('seo-writer')).toBe('new-session');
        expect(manager.listSessions()).toHaveLength(1);
    });
});
