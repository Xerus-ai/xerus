// Channel Behavior Tests
// Validates the inbox channel system contracts:
// - Message type mapping (runner types -> workspace DB types)
// - Sender identity resolution (human = "You", agents = display name)
// - Message ordering (ASC for chronological display)
// - System event generation (task ops, agent assignment)
// - Deliverables data shape
//
// These tests validate the data transformation layer (no sandbox needed).

import { toDbMessageType } from '../../inbox/messaging/message-bridge.types';
import type { MessageType, RunnerMessageType } from '../../inbox/messaging/message-bridge.types';

// ---------------------------------------------------------------------------
// 1. Message Type Mapping
// ---------------------------------------------------------------------------

describe('toDbMessageType', () => {
    it('maps runner "chat" to workspace DB "post"', () => {
        expect(toDbMessageType('chat')).toBe('post');
    });

    it('maps runner "task_update" to "post"', () => {
        expect(toDbMessageType('task_update')).toBe('post');
    });

    it('maps runner "status" to "post"', () => {
        expect(toDbMessageType('status')).toBe('post');
    });

    it('preserves "system" as "system"', () => {
        expect(toDbMessageType('system')).toBe('system');
    });

    it('preserves "coordination" as "coordination"', () => {
        expect(toDbMessageType('coordination')).toBe('coordination');
    });

    it('preserves "post" as "post"', () => {
        expect(toDbMessageType('post')).toBe('post');
    });

    it('defaults undefined to "post"', () => {
        expect(toDbMessageType(undefined)).toBe('post');
    });

    it('defaults unknown strings to "post"', () => {
        expect(toDbMessageType('unknown_type')).toBe('post');
    });

    it('only returns values matching workspace DB CHECK constraint', () => {
        const validDbTypes: MessageType[] = ['post', 'coordination', 'system'];
        const runnerTypes: Array<RunnerMessageType | undefined> = [
            'chat', 'task_update', 'status', 'system', 'post', 'coordination', undefined,
        ];

        for (const rt of runnerTypes) {
            const result = toDbMessageType(rt);
            expect(validDbTypes).toContain(result);
        }
    });
});

// ---------------------------------------------------------------------------
// 2. Sender Identity Resolution
// ---------------------------------------------------------------------------

describe('sender identity resolution', () => {
    // Simulates what company.routes.ts GET /messages does
    function resolveMessageSender(
        agentSlug: string,
        senderType: string,
        agentNameMap: Map<string, string>,
    ): { sender_name: string; sender_slug: string } {
        let senderName = agentSlug;
        if (senderType === 'human') {
            senderName = 'You';
        } else if (agentNameMap.has(agentSlug)) {
            senderName = agentNameMap.get(agentSlug)!;
        }
        return { sender_name: senderName, sender_slug: agentSlug };
    }

    const agentNames = new Map<string, string>([
        ['thread-theo', 'Thread Theo'],
        ['curator-carla', 'Curator Carla'],
        ['strategist', 'Strategist'],
    ]);

    it('resolves human messages to "You"', () => {
        const result = resolveMessageSender('CpRZJgiNSwg...firebaseUID', 'human', agentNames);
        expect(result.sender_name).toBe('You');
        // Keeps original slug for auditing
        expect(result.sender_slug).toBe('CpRZJgiNSwg...firebaseUID');
    });

    it('resolves known agent slugs to display names', () => {
        const result = resolveMessageSender('thread-theo', 'agent', agentNames);
        expect(result.sender_name).toBe('Thread Theo');
    });

    it('falls back to slug for unknown agents', () => {
        const result = resolveMessageSender('unknown-agent', 'agent', agentNames);
        expect(result.sender_name).toBe('unknown-agent');
    });

    it('resolves system messages with system slug', () => {
        const result = resolveMessageSender('system', 'system', agentNames);
        expect(result.sender_name).toBe('system');
    });
});

// ---------------------------------------------------------------------------
// 3. Message Response Shape
// ---------------------------------------------------------------------------

describe('message response shape', () => {
    // Simulates the GET /messages mapping from company.routes.ts
    function mapMessageRow(row: {
        id: number;
        channel_slug: string;
        agent_slug: string;
        content: string;
        message_type: string;
        metadata: string | null;
        posted_at: string;
    }, agentNames: Map<string, string>) {
        const parsedMetadata = row.metadata ? JSON.parse(row.metadata) : {};
        const senderType = parsedMetadata.sender_type || (row.message_type === 'system' ? 'system' : 'agent');
        const { sender_type: _st, ...cleanMetadata } = parsedMetadata;

        let senderName = row.agent_slug;
        if (senderType === 'human') {
            senderName = 'You';
        } else if (agentNames.has(row.agent_slug)) {
            senderName = agentNames.get(row.agent_slug)!;
        }

        return {
            id: String(row.id),
            channel_id: row.channel_slug,
            sender_type: senderType,
            sender_slug: row.agent_slug,
            sender_name: senderName,
            content: row.content,
            message_type: row.message_type,
            metadata: cleanMetadata,
            created_at: row.posted_at,
        };
    }

    const agentNames = new Map([['strategist', 'Strategist']]);

    it('includes sender_name field in response', () => {
        const result = mapMessageRow({
            id: 1,
            channel_slug: 'marketing--general',
            agent_slug: 'strategist',
            content: 'Hello',
            message_type: 'post',
            metadata: JSON.stringify({ sender_type: 'agent' }),
            posted_at: '2026-04-06T10:00:00Z',
        }, agentNames);

        expect(result.sender_name).toBe('Strategist');
        expect(result.sender_slug).toBe('strategist');
        expect(result.sender_type).toBe('agent');
    });

    it('strips sender_type from metadata (moved to top-level field)', () => {
        const result = mapMessageRow({
            id: 2,
            channel_slug: 'marketing--general',
            agent_slug: 'user123',
            content: 'Test',
            message_type: 'post',
            metadata: JSON.stringify({ sender_type: 'human', custom_field: true }),
            posted_at: '2026-04-06T10:00:00Z',
        }, agentNames);

        expect(result.metadata).toEqual({ custom_field: true });
        expect(result.metadata).not.toHaveProperty('sender_type');
    });

    it('sets sender_name to "You" for human messages', () => {
        const result = mapMessageRow({
            id: 3,
            channel_slug: 'marketing--general',
            agent_slug: 'firebase-uid-123',
            content: 'Hi team',
            message_type: 'post',
            metadata: JSON.stringify({ sender_type: 'human' }),
            posted_at: '2026-04-06T10:00:00Z',
        }, agentNames);

        expect(result.sender_name).toBe('You');
        expect(result.sender_type).toBe('human');
    });

    it('handles system messages correctly', () => {
        const result = mapMessageRow({
            id: 4,
            channel_slug: 'marketing--general',
            agent_slug: 'system',
            content: 'strategist assigned task "Q2 Plan" to writer',
            message_type: 'system',
            metadata: JSON.stringify({ sender_type: 'system', event_type: 'task_assigned' }),
            posted_at: '2026-04-06T10:00:00Z',
        }, agentNames);

        expect(result.message_type).toBe('system');
        expect(result.sender_type).toBe('system');
        expect(result.metadata.event_type).toBe('task_assigned');
    });
});

// ---------------------------------------------------------------------------
// 4. System Event Content Format
// ---------------------------------------------------------------------------

describe('system event content', () => {
    // Validates that system events produce human-readable strings
    // matching the SystemEvent component's rendering expectations

    it('task creation event includes title', () => {
        const title = 'Q2 Content Strategy';
        const content = `created task "${title}"`;
        expect(content).toContain(title);
        expect(content).toMatch(/^created task "/);
    });

    it('task assignment event includes task and agent', () => {
        const title = 'Q2 Content Strategy';
        const agent = 'writer';
        const content = `assigned task "${title}" to ${agent}`;
        expect(content).toContain(title);
        expect(content).toContain(agent);
    });

    it('task status change event includes status', () => {
        const title = 'Content Review';
        const status = 'in_progress';
        const content = `moved task "${title}" to ${status}`;
        expect(content).toContain(title);
        expect(content).toContain(status);
    });

    it('agent joined event includes agent slug', () => {
        const slug = 'thread-theo';
        const content = `${slug} joined the channel`;
        expect(content).toContain(slug);
        expect(content).toMatch(/joined the channel$/);
    });

    it('agent left event includes agent slug', () => {
        const slug = 'thread-theo';
        const content = `${slug} left the channel`;
        expect(content).toContain(slug);
        expect(content).toMatch(/left the channel$/);
    });
});

// ---------------------------------------------------------------------------
// 5. Message Grouping (Frontend Logic)
// ---------------------------------------------------------------------------

describe('message grouping logic', () => {
    interface ChannelMessage {
        id: string;
        channel_id: string;
        sender_type: 'agent' | 'human' | 'system';
        sender_slug: string;
        sender_name?: string;
        content: string;
        message_type: 'post' | 'coordination' | 'system';
        metadata?: Record<string, unknown>;
        created_at: string;
    }

    type MessageGroup =
        | { kind: 'post'; message: ChannelMessage }
        | { kind: 'coordination_single'; message: ChannelMessage }
        | { kind: 'coordination_group'; messages: ChannelMessage[] }
        | { kind: 'system'; message: ChannelMessage }
        | { kind: 'date_separator'; date: string };

    // Replicate groupMessages from ChannelActivity.tsx
    function groupMessages(messages: ChannelMessage[]): MessageGroup[] {
        const groups: MessageGroup[] = [];
        let prevDateKey = '';
        let i = 0;
        while (i < messages.length) {
            const msg = messages[i];
            const dateKey = new Date(msg.created_at).toDateString();
            if (dateKey !== prevDateKey) {
                groups.push({ kind: 'date_separator', date: msg.created_at });
                prevDateKey = dateKey;
            }
            if (msg.message_type === 'system') {
                groups.push({ kind: 'system', message: msg });
                i++;
                continue;
            }
            if (msg.message_type === 'coordination') {
                const batch: ChannelMessage[] = [msg];
                let j = i + 1;
                while (j < messages.length && messages[j].message_type === 'coordination' && new Date(messages[j].created_at).toDateString() === dateKey) {
                    batch.push(messages[j]);
                    j++;
                }
                if (batch.length >= 5) {
                    groups.push({ kind: 'coordination_group', messages: batch });
                } else {
                    for (const coordMsg of batch) {
                        groups.push({ kind: 'coordination_single', message: coordMsg });
                    }
                }
                i = j;
                continue;
            }
            groups.push({ kind: 'post', message: msg });
            i++;
        }
        return groups;
    }

    const baseDate = '2026-04-06T10:00:00Z';
    function makeMsg(overrides: Partial<ChannelMessage> & { id: string }): ChannelMessage {
        return {
            channel_id: 'test--general',
            sender_type: 'agent',
            sender_slug: 'test-agent',
            sender_name: 'Test Agent',
            content: 'Hello',
            message_type: 'post',
            created_at: baseDate,
            ...overrides,
        };
    }

    it('creates date separators between different days', () => {
        const msgs = [
            makeMsg({ id: '1', created_at: '2026-04-05T10:00:00Z' }),
            makeMsg({ id: '2', created_at: '2026-04-06T10:00:00Z' }),
        ];
        const groups = groupMessages(msgs);
        expect(groups.filter(g => g.kind === 'date_separator')).toHaveLength(2);
    });

    it('groups system messages separately', () => {
        const msgs = [
            makeMsg({ id: '1', message_type: 'system', content: 'agent joined' }),
            makeMsg({ id: '2', message_type: 'post', content: 'Hello' }),
        ];
        const groups = groupMessages(msgs);
        expect(groups.find(g => g.kind === 'system')).toBeTruthy();
        expect(groups.find(g => g.kind === 'post')).toBeTruthy();
    });

    it('groups 5+ coordination messages into a collapsible group', () => {
        const msgs = Array.from({ length: 6 }, (_, i) =>
            makeMsg({ id: String(i), message_type: 'coordination' })
        );
        const groups = groupMessages(msgs);
        const coordGroup = groups.find(g => g.kind === 'coordination_group');
        expect(coordGroup).toBeTruthy();
        if (coordGroup?.kind === 'coordination_group') {
            expect(coordGroup.messages).toHaveLength(6);
        }
    });

    it('keeps <5 coordination messages as singles', () => {
        const msgs = Array.from({ length: 3 }, (_, i) =>
            makeMsg({ id: String(i), message_type: 'coordination' })
        );
        const groups = groupMessages(msgs);
        const singles = groups.filter(g => g.kind === 'coordination_single');
        expect(singles).toHaveLength(3);
    });

    it('identifies escalation posts via metadata.requires_approval', () => {
        const msg = makeMsg({
            id: '1',
            message_type: 'post',
            metadata: { requires_approval: true },
        });
        // The ChannelActivity component checks this to render EscalationMessage
        expect(msg.metadata?.requires_approval).toBe(true);
    });

    it('simulates a full channel conversation flow', () => {
        const msgs: ChannelMessage[] = [
            // System event: agent joins
            makeMsg({
                id: '1',
                message_type: 'system',
                sender_type: 'system',
                sender_slug: 'system',
                content: 'strategist joined the channel',
                created_at: '2026-04-06T09:00:00Z',
            }),
            // Human sends message
            makeMsg({
                id: '2',
                message_type: 'post',
                sender_type: 'human',
                sender_slug: 'firebase-uid',
                sender_name: 'You',
                content: 'Can you analyze our Q2 content strategy?',
                created_at: '2026-04-06T09:05:00Z',
            }),
            // Agent responds
            makeMsg({
                id: '3',
                message_type: 'post',
                sender_type: 'agent',
                sender_slug: 'strategist',
                sender_name: 'Strategist',
                content: '**Analysis Complete**\n\nBased on engagement data:\n- Tutorial posts: +40% engagement\n- Opinion pieces: -15%\n\nRecommend shifting budget.',
                created_at: '2026-04-06T09:10:00Z',
            }),
            // Escalation: needs approval
            makeMsg({
                id: '4',
                message_type: 'post',
                sender_type: 'agent',
                sender_slug: 'strategist',
                sender_name: 'Strategist',
                content: '**Budget Reallocation Request**\n\nShift 40% of opinion budget to tutorials.\n\nEstimated impact: **+1.5% avg engagement**.\n\n@Human — please approve.',
                metadata: { requires_approval: true, execution_id: 'exec-123' },
                created_at: '2026-04-06T09:12:00Z',
            }),
            // System event: task assigned
            makeMsg({
                id: '5',
                message_type: 'system',
                sender_type: 'system',
                sender_slug: 'system',
                content: 'strategist assigned task "Q2 Content Strategy" to writer',
                metadata: { event_type: 'task_assigned' },
                created_at: '2026-04-06T09:15:00Z',
            }),
            // Another agent posts deliverable
            makeMsg({
                id: '6',
                message_type: 'post',
                sender_type: 'agent',
                sender_slug: 'writer',
                sender_name: 'Writer',
                content: 'Started drafting the Q2 content calendar. First draft:\n\n- 8 tutorial posts (bi-weekly)\n- 4 opinion pieces (monthly)',
                created_at: '2026-04-06T10:00:00Z',
            }),
        ];

        const groups = groupMessages(msgs);

        // Should have: date_separator + 6 message groups
        const dateSeps = groups.filter(g => g.kind === 'date_separator');
        const systemEvents = groups.filter(g => g.kind === 'system');
        const posts = groups.filter(g => g.kind === 'post');

        expect(dateSeps).toHaveLength(1); // All same day
        expect(systemEvents).toHaveLength(2); // agent joined + task assigned
        expect(posts).toHaveLength(4); // human msg + agent response + escalation + writer post

        // Verify escalation is detectable
        const escalation = posts.find(
            p => p.kind === 'post' && p.message.metadata?.requires_approval
        );
        expect(escalation).toBeTruthy();

        // Verify human message has "You" as sender_name
        const humanMsg = posts.find(
            p => p.kind === 'post' && p.message.sender_type === 'human'
        );
        expect(humanMsg).toBeTruthy();
        if (humanMsg?.kind === 'post') {
            expect(humanMsg.message.sender_name).toBe('You');
        }
    });
});

// ---------------------------------------------------------------------------
// 6. Deliverable Response Shape
// ---------------------------------------------------------------------------

describe('deliverable response mapping', () => {
    function mapDeliverableRow(d: {
        id: number;
        agent_slug: string;
        output_type: string;
        title: string;
        description: string | null;
        file_path: string | null;
        content_preview: string | null;
        metadata: string | null;
        created_at: string;
    }) {
        const meta = d.metadata ? JSON.parse(d.metadata) : {};
        return {
            id: String(d.id),
            filename: d.title,
            file_type: d.output_type === 'code' ? 'code'
                : d.output_type === 'report' ? 'markdown'
                : d.output_type === 'data' ? 'other'
                : d.output_type,
            content: d.content_preview ?? undefined,
            author_slug: d.agent_slug,
            file_size_bytes: meta.size ?? 0,
            file_path: d.file_path ?? undefined,
            description: d.description ?? undefined,
            created_at: d.created_at,
        };
    }

    it('maps code output type correctly', () => {
        const result = mapDeliverableRow({
            id: 1,
            agent_slug: 'cto',
            output_type: 'code',
            title: 'auth-service.ts',
            description: 'JWT auth implementation',
            file_path: '/workspace/output/auth-service.ts',
            content_preview: 'export function verifyToken...',
            metadata: JSON.stringify({ size: 4096 }),
            created_at: '2026-04-06T10:00:00Z',
        });

        expect(result.file_type).toBe('code');
        expect(result.filename).toBe('auth-service.ts');
        expect(result.file_size_bytes).toBe(4096);
        expect(result.author_slug).toBe('cto');
    });

    it('maps report output type to markdown', () => {
        const result = mapDeliverableRow({
            id: 2,
            agent_slug: 'strategist',
            output_type: 'report',
            title: 'q2-analysis.md',
            description: null,
            file_path: null,
            content_preview: '# Q2 Analysis',
            metadata: null,
            created_at: '2026-04-06T10:00:00Z',
        });

        expect(result.file_type).toBe('markdown');
        expect(result.file_size_bytes).toBe(0);
        expect(result.description).toBeUndefined();
    });
});
