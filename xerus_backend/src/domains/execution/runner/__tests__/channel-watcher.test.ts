import fs from 'fs';
import path from 'path';
import os from 'os';
import { ChannelWatcher, ChannelPost } from '../channel-watcher';

describe('ChannelWatcher', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xerus-channel-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function setupChannel(project: string, channel: string): string {
        const outputPath = path.join(tmpDir, 'projects', project, 'channels', channel, 'output');
        fs.mkdirSync(outputPath, { recursive: true });
        return outputPath;
    }

    function setupAgentInbox(slug: string): string {
        const inboxPath = path.join(tmpDir, 'agents', slug, 'inbox');
        fs.mkdirSync(inboxPath, { recursive: true });
        return inboxPath;
    }

    it('detects new posts appended to posts.jsonl', (done) => {
        const outputPath = setupChannel('marketing', 'seo');
        const postsPath = path.join(outputPath, 'posts.jsonl');

        // Create empty file first (watcher sets offset to end)
        fs.writeFileSync(postsPath, '');

        const watcher = new ChannelWatcher(tmpDir);
        watcher.on('post', (post: ChannelPost) => {
            expect(post.project).toBe('marketing');
            expect(post.channel).toBe('seo');
            expect(post.content).toBe('New blog post published');
            expect(post.agent_slug).toBe('seo-writer');
            watcher.stop();
            done();
        });

        watcher.start();

        // Append a post after watcher starts
        setTimeout(() => {
            const post = JSON.stringify({
                agent_slug: 'seo-writer',
                content: 'New blog post published',
                posted_at: new Date().toISOString(),
            });
            fs.appendFileSync(postsPath, post + '\n');
        }, 200);
    });

    it('extracts @mentions from post content', (done) => {
        const outputPath = setupChannel('marketing', 'seo');
        const postsPath = path.join(outputPath, 'posts.jsonl');
        fs.writeFileSync(postsPath, '');

        const watcher = new ChannelWatcher(tmpDir);
        watcher.on('post', (post: ChannelPost) => {
            expect(post.mentions).toContain('ad-optimizer');
            expect(post.mentions).toContain('content-writer');
            expect(post.mentions).toHaveLength(2);
            watcher.stop();
            done();
        });

        watcher.start();

        setTimeout(() => {
            const post = JSON.stringify({
                agent_slug: 'seo-writer',
                content: 'Hey @ad-optimizer and @content-writer, check this out',
            });
            fs.appendFileSync(postsPath, post + '\n');
        }, 200);
    });

    it('delivers mentions to target agent inbox', (done) => {
        const outputPath = setupChannel('marketing', 'seo');
        const postsPath = path.join(outputPath, 'posts.jsonl');
        fs.writeFileSync(postsPath, '');

        setupAgentInbox('ad-optimizer');

        const watcher = new ChannelWatcher(tmpDir);
        watcher.on('post', () => {
            setTimeout(() => {
                const inboxDir = path.join(tmpDir, 'agents', 'ad-optimizer', 'inbox');
                const files = fs.readdirSync(inboxDir).filter(f => f !== 'processed');
                expect(files.length).toBeGreaterThan(0);

                const content = fs.readFileSync(path.join(inboxDir, files[0]), 'utf-8');
                expect(content).toContain('seo-writer');
                expect(content).toContain('Please review');
                watcher.stop();
                done();
            }, 100);
        });

        watcher.start();

        setTimeout(() => {
            const post = JSON.stringify({
                agent_slug: 'seo-writer',
                content: '@ad-optimizer Please review',
            });
            fs.appendFileSync(postsPath, post + '\n');
        }, 200);
    });

    it('deduplicates mentions', (done) => {
        const outputPath = setupChannel('marketing', 'seo');
        const postsPath = path.join(outputPath, 'posts.jsonl');
        fs.writeFileSync(postsPath, '');

        const watcher = new ChannelWatcher(tmpDir);
        watcher.on('post', (post: ChannelPost) => {
            expect(post.mentions).toEqual(['seo-writer']);
            watcher.stop();
            done();
        });

        watcher.start();

        setTimeout(() => {
            const post = JSON.stringify({
                agent_slug: 'test',
                content: '@seo-writer hey @seo-writer duplicate mention',
            });
            fs.appendFileSync(postsPath, post + '\n');
        }, 200);
    });

    it('delivers coordination messages to target_agent inbox', (done) => {
        const outputPath = setupChannel('xerus-launch', 'content-lab');
        const postsPath = path.join(outputPath, 'posts.jsonl');
        fs.writeFileSync(postsPath, '');

        setupAgentInbox('viral-vince');

        const watcher = new ChannelWatcher(tmpDir);
        watcher.on('post', (post: ChannelPost) => {
            expect(post.message_type).toBe('coordination');
            expect(post.metadata).toEqual({ target_agent: 'viral-vince' });
            expect(post.mentions).toContain('viral-vince');

            setTimeout(() => {
                const inboxDir = path.join(tmpDir, 'agents', 'viral-vince', 'inbox');
                const files = fs.readdirSync(inboxDir).filter(f => f !== 'processed');
                expect(files.length).toBeGreaterThan(0);

                const content = fs.readFileSync(path.join(inboxDir, files[0]), 'utf-8');
                expect(content).toContain('curator-carla');
                expect(content).toContain('Generate 3 ideas');
                watcher.stop();
                done();
            }, 100);
        });

        watcher.start();

        setTimeout(() => {
            const post = JSON.stringify({
                agent_slug: 'curator-carla',
                content: 'Generate 3 ideas from the AI coding trend',
                message_type: 'coordination',
                metadata: { target_agent: 'viral-vince' },
                posted_at: new Date().toISOString(),
            });
            fs.appendFileSync(postsPath, post + '\n');
        }, 200);
    });

    it('delivers coordination messages to multiple target_agents', (done) => {
        const outputPath = setupChannel('xerus-launch', 'growth');
        const postsPath = path.join(outputPath, 'posts.jsonl');
        fs.writeFileSync(postsPath, '');

        setupAgentInbox('thread-theo');
        setupAgentInbox('post-paula');

        const watcher = new ChannelWatcher(tmpDir);
        watcher.on('post', (post: ChannelPost) => {
            expect(post.mentions).toContain('thread-theo');
            expect(post.mentions).toContain('post-paula');
            expect(post.mentions).toHaveLength(2);

            setTimeout(() => {
                const theoInbox = path.join(tmpDir, 'agents', 'thread-theo', 'inbox');
                const paulaInbox = path.join(tmpDir, 'agents', 'post-paula', 'inbox');
                const theoFiles = fs.readdirSync(theoInbox).filter(f => f !== 'processed');
                const paulaFiles = fs.readdirSync(paulaInbox).filter(f => f !== 'processed');
                expect(theoFiles.length).toBeGreaterThan(0);
                expect(paulaFiles.length).toBeGreaterThan(0);
                watcher.stop();
                done();
            }, 100);
        });

        watcher.start();

        setTimeout(() => {
            const post = JSON.stringify({
                agent_slug: 'growth-guru',
                content: 'Engagement is up 20% this week, keep pushing',
                message_type: 'coordination',
                metadata: { target_agents: ['thread-theo', 'post-paula'] },
                posted_at: new Date().toISOString(),
            });
            fs.appendFileSync(postsPath, post + '\n');
        }, 200);
    });

    it('deduplicates target_agent with @mention of same agent', (done) => {
        const outputPath = setupChannel('xerus-launch', 'twitter');
        const postsPath = path.join(outputPath, 'posts.jsonl');
        fs.writeFileSync(postsPath, '');

        setupAgentInbox('reply-rex');

        let postCount = 0;
        const watcher = new ChannelWatcher(tmpDir);
        watcher.on('post', (post: ChannelPost) => {
            postCount++;
            // reply-rex appears in both @mention and target_agent, should be deduped
            expect(post.mentions).toEqual(['reply-rex']);

            setTimeout(() => {
                const inboxDir = path.join(tmpDir, 'agents', 'reply-rex', 'inbox');
                const files = fs.readdirSync(inboxDir).filter(f => f !== 'processed');
                // Should only have 1 inbox file, not 2
                expect(files.length).toBe(1);
                watcher.stop();
                done();
            }, 100);
        });

        watcher.start();

        setTimeout(() => {
            const post = JSON.stringify({
                agent_slug: 'thread-theo',
                content: 'Hey @reply-rex check this thread',
                message_type: 'coordination',
                metadata: { target_agent: 'reply-rex' },
                posted_at: new Date().toISOString(),
            });
            fs.appendFileSync(postsPath, post + '\n');
        }, 200);
    });

    it('includes message_type and metadata in emitted post', (done) => {
        const outputPath = setupChannel('xerus-launch', 'ads');
        const postsPath = path.join(outputPath, 'posts.jsonl');
        fs.writeFileSync(postsPath, '');

        const watcher = new ChannelWatcher(tmpDir);
        watcher.on('post', (post: ChannelPost) => {
            expect(post.message_type).toBe('system');
            expect(post.metadata).toEqual({ status: 'campaign_paused' });
            watcher.stop();
            done();
        });

        watcher.start();

        setTimeout(() => {
            const post = JSON.stringify({
                agent_slug: 'ad-alex',
                content: 'Campaign paused due to budget cap',
                message_type: 'system',
                metadata: { status: 'campaign_paused' },
                posted_at: new Date().toISOString(),
            });
            fs.appendFileSync(postsPath, post + '\n');
        }, 200);
    });

    it('defaults message_type to post and metadata to empty object', (done) => {
        const outputPath = setupChannel('test', 'chan');
        const postsPath = path.join(outputPath, 'posts.jsonl');
        fs.writeFileSync(postsPath, '');

        const watcher = new ChannelWatcher(tmpDir);
        watcher.on('post', (post: ChannelPost) => {
            expect(post.message_type).toBe('post');
            expect(post.metadata).toEqual({});
            watcher.stop();
            done();
        });

        watcher.start();

        setTimeout(() => {
            const post = JSON.stringify({
                agent_slug: 'test-agent',
                content: 'Simple post without message_type or metadata',
            });
            fs.appendFileSync(postsPath, post + '\n');
        }, 200);
    });

    it('handles missing projects directory gracefully', () => {
        const watcher = new ChannelWatcher(tmpDir);
        watcher.start();
        watcher.stop();
    });

    it('stops cleanly', () => {
        const watcher = new ChannelWatcher(tmpDir);
        watcher.start();
        watcher.stop();
        // Should not throw
    });
});
