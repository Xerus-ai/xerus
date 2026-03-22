import fs from 'fs';
import path from 'path';
import os from 'os';
import { InboxWatcher, InboxMessage } from '../inbox-watcher';

describe('InboxWatcher', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xerus-inbox-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function setupAgent(slug: string): string {
        const inboxPath = path.join(tmpDir, 'agents', slug, 'inbox');
        fs.mkdirSync(inboxPath, { recursive: true });
        return inboxPath;
    }

    it('detects existing messages in inbox on start', (done) => {
        const inboxPath = setupAgent('seo-writer');
        fs.writeFileSync(path.join(inboxPath, 'msg-001.md'), 'Hello from marketing');

        const watcher = new InboxWatcher(tmpDir);
        watcher.on('message', (msg: InboxMessage) => {
            expect(msg.agent_slug).toBe('seo-writer');
            expect(msg.content).toBe('Hello from marketing');
            expect(msg.filename).toBe('msg-001.md');
            watcher.stop();
            done();
        });

        watcher.start();
    });

    it('moves processed messages to inbox/processed/', (done) => {
        const inboxPath = setupAgent('seo-writer');
        fs.writeFileSync(path.join(inboxPath, 'msg-001.md'), 'Process me');

        const watcher = new InboxWatcher(tmpDir);
        watcher.on('message', () => {
            setTimeout(() => {
                const processedPath = path.join(inboxPath, 'processed', 'msg-001.md');
                expect(fs.existsSync(processedPath)).toBe(true);
                expect(fs.existsSync(path.join(inboxPath, 'msg-001.md'))).toBe(false);
                watcher.stop();
                done();
            }, 100);
        });

        watcher.start();
    });

    it('ignores the processed/ subdirectory', (done) => {
        const inboxPath = setupAgent('seo-writer');
        const processedDir = path.join(inboxPath, 'processed');
        fs.mkdirSync(processedDir, { recursive: true });
        fs.writeFileSync(path.join(processedDir, 'old.md'), 'Already processed');

        const messages: InboxMessage[] = [];
        const watcher = new InboxWatcher(tmpDir);
        watcher.on('message', (msg: InboxMessage) => {
            messages.push(msg);
        });

        watcher.start();

        setTimeout(() => {
            expect(messages).toHaveLength(0);
            watcher.stop();
            done();
        }, 200);
    });

    it('handles missing agents directory gracefully', () => {
        const watcher = new InboxWatcher(tmpDir);
        // Should not throw even though agents/ dir doesn't exist
        watcher.start();
        watcher.stop();
    });

    it('processes messages from multiple agents', (done) => {
        setupAgent('seo-writer');
        setupAgent('ad-optimizer');

        fs.writeFileSync(path.join(tmpDir, 'agents', 'seo-writer', 'inbox', 'msg1.md'), 'For SEO');
        fs.writeFileSync(path.join(tmpDir, 'agents', 'ad-optimizer', 'inbox', 'msg2.md'), 'For Ads');

        const messages: InboxMessage[] = [];
        const watcher = new InboxWatcher(tmpDir);
        watcher.on('message', (msg: InboxMessage) => {
            messages.push(msg);
            if (messages.length === 2) {
                const slugs = messages.map(m => m.agent_slug).sort();
                expect(slugs).toEqual(['ad-optimizer', 'seo-writer']);
                watcher.stop();
                done();
            }
        });

        watcher.start();
    });

    it('stops cleanly and emits no further events', (done) => {
        setupAgent('seo-writer');

        const messages: InboxMessage[] = [];
        const watcher = new InboxWatcher(tmpDir);
        watcher.on('message', (msg: InboxMessage) => {
            messages.push(msg);
        });

        watcher.start();
        watcher.stop();

        // Write message after stop
        fs.writeFileSync(
            path.join(tmpDir, 'agents', 'seo-writer', 'inbox', 'late.md'),
            'Should not be processed',
        );

        setTimeout(() => {
            expect(messages).toHaveLength(0);
            done();
        }, 200);
    });
});
