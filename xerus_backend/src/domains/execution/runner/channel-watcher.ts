// Channel Output Watcher
// Watches projects/*/channels/*/output/posts.jsonl for explicit channel posts
// Scans for @mentions and writes to target agent's inbox
// Bridges posts to backend as agent_message events

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

export interface ChannelPost {
    agent_slug: string;
    project: string;
    channel: string;
    content: string;
    message_type: string;
    metadata: Record<string, unknown>;
    mentions: string[];
    posted_at: string;
}

const MENTION_REGEX = /@([\w-]+)/g;

export class ChannelWatcher extends EventEmitter {
    private workspacePath: string;
    private watchers = new Map<string, fs.FSWatcher>();
    private fileOffsets = new Map<string, number>();
    private pollInterval: NodeJS.Timeout | null = null;
    private stopped = false;

    constructor(workspacePath: string) {
        super();
        this.workspacePath = workspacePath;
    }

    start(): void {
        this.stopped = false;
        this.scanAndWatch();
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
        const projectsDir = path.join(this.workspacePath, 'projects');
        if (!fs.existsSync(projectsDir)) return;

        let projects: string[];
        try {
            projects = fs.readdirSync(projectsDir);
        } catch (err) {
            console.warn('[channel-watcher] failed to read projects directory:', err instanceof Error ? err.message : err);
            return;
        }

        for (const project of projects) {
            const channelsDir = path.join(projectsDir, project, 'channels');
            if (!fs.existsSync(channelsDir)) continue;

            let channels: string[];
            try {
                channels = fs.readdirSync(channelsDir);
            } catch (err) {
                console.warn('[channel-watcher] failed to read channels directory:', err instanceof Error ? err.message : err);
                continue;
            }

            for (const channel of channels) {
                const postsPath = path.join(channelsDir, channel, 'output', 'posts.jsonl');
                const watchKey = `${project}/${channel}`;
                if (this.watchers.has(watchKey)) continue;

                if (!fs.existsSync(postsPath)) continue;

                // Set offset to end of file to only watch new posts
                try {
                    const stat = fs.statSync(postsPath);
                    this.fileOffsets.set(postsPath, stat.size);
                } catch (err) {
                    console.warn('[channel-watcher] failed to stat posts file:', err instanceof Error ? err.message : err);
                    this.fileOffsets.set(postsPath, 0);
                }

                this.watchPostsFile(watchKey, postsPath, project, channel);
            }
        }
    }

    private watchPostsFile(watchKey: string, postsPath: string, project: string, channel: string): void {
        const outputDir = path.dirname(postsPath);
        try {
            const watcher = fs.watch(outputDir, (_eventType, filename) => {
                if (this.stopped) return;
                if (filename !== 'posts.jsonl') return;
                this.readNewPosts(postsPath, project, channel);
            });

            watcher.on('error', () => {
                this.watchers.delete(watchKey);
            });

            this.watchers.set(watchKey, watcher);
        } catch (err) {
            console.warn('[channel-watcher] failed to watch posts directory:', err instanceof Error ? err.message : err);
        }
    }

    private readNewPosts(postsPath: string, project: string, channel: string): void {
        const currentOffset = this.fileOffsets.get(postsPath) || 0;

        let stat: fs.Stats;
        try {
            stat = fs.statSync(postsPath);
        } catch (err) {
            console.warn('[channel-watcher] failed to stat posts file for reading:', err instanceof Error ? err.message : err);
            return;
        }

        if (stat.size <= currentOffset) return;

        try {
            const fd = fs.openSync(postsPath, 'r');
            const buffer = Buffer.alloc(stat.size - currentOffset);
            fs.readSync(fd, buffer, 0, buffer.length, currentOffset);
            fs.closeSync(fd);

            this.fileOffsets.set(postsPath, stat.size);

            const newContent = buffer.toString('utf-8');
            const lines = newContent.split('\n').filter(line => line.trim().length > 0);

            for (const line of lines) {
                this.processPost(line, project, channel);
            }
        } catch (err) {
            console.warn('[channel-watcher] failed to read new posts from file:', err instanceof Error ? err.message : err);
        }
    }

    private processPost(line: string, project: string, channel: string): void {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(line);
        } catch (err) {
            console.warn('[channel-watcher] failed to parse channel post JSON:', err instanceof Error ? err.message : err);
            return;
        }

        const content = String(parsed.content || '');
        const agentSlug = String(parsed.agent_slug || 'unknown');
        const messageType = String(parsed.message_type || 'post');
        const metadata = (parsed.metadata as Record<string, unknown>) || {};
        const mentions = this.extractMentions(content);

        // Extract target_agent(s) from metadata for coordination messages
        if (metadata.target_agent && typeof metadata.target_agent === 'string') {
            mentions.push(metadata.target_agent);
        }
        if (Array.isArray(metadata.target_agents)) {
            for (const t of metadata.target_agents) {
                if (typeof t === 'string') mentions.push(t);
            }
        }

        // Deduplicate after adding target agents
        const uniqueMentions = [...new Set(mentions)];

        const post: ChannelPost = {
            agent_slug: agentSlug,
            project,
            channel,
            content,
            message_type: messageType,
            metadata,
            mentions: uniqueMentions,
            posted_at: String(parsed.posted_at || new Date().toISOString()),
        };

        this.emit('post', post);

        // Write to mentioned agents' inboxes
        for (const mention of uniqueMentions) {
            this.deliverToInbox(mention, post);
        }
    }

    private extractMentions(content: string): string[] {
        const matches = content.matchAll(MENTION_REGEX);
        const mentions: string[] = [];
        for (const match of matches) {
            mentions.push(match[1]);
        }
        return [...new Set(mentions)];
    }

    private deliverToInbox(targetSlug: string, post: ChannelPost): void {
        const inboxDir = path.join(this.workspacePath, 'agents', targetSlug, 'inbox');
        try {
            if (!fs.existsSync(inboxDir)) {
                fs.mkdirSync(inboxDir, { recursive: true });
            }
            const timestamp = Date.now();
            const filename = `channel-${post.project}-${post.channel}-${timestamp}.md`;
            const content = [
                `# Channel Message from @${post.agent_slug}`,
                `**Channel**: ${post.project}/${post.channel}`,
                `**Time**: ${post.posted_at}`,
                '',
                post.content,
            ].join('\n');
            fs.writeFileSync(path.join(inboxDir, filename), content, 'utf-8');
        } catch (err) {
            console.warn('[channel-watcher] failed to deliver post to agent inbox:', err instanceof Error ? err.message : err);
        }
    }
}
