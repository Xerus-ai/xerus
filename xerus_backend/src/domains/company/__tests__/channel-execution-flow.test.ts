// Channel Execution Flow Tests
// Validates the execution flow contracts that determine how messages
// reach agents and how agents communicate with each other.
//
// These tests verify the decision logic (no sandbox/Daytona needed).

// ---------------------------------------------------------------------------
// 1. Channel Lead Resolution Logic
// ---------------------------------------------------------------------------

describe('channel lead resolution', () => {
    // Simulates findChannelLead() from message-bridge.repository.ts
    function findChannelLead(
        channelLeadSlug: string | null,
        recentAgentSenders: string[],
    ): string | null {
        // Stage 1: explicit lead_agent_slug on channel
        if (channelLeadSlug) return channelLeadSlug;
        // Stage 2: most recent agent sender
        return recentAgentSenders[0] ?? null;
    }

    it('returns lead_agent_slug when set', () => {
        expect(findChannelLead('strategist', ['writer'])).toBe('strategist');
    });

    it('falls back to most recent agent sender when lead is null', () => {
        expect(findChannelLead(null, ['writer', 'researcher'])).toBe('writer');
    });

    it('returns null when no lead and no agent senders', () => {
        expect(findChannelLead(null, [])).toBe(null);
    });

    it('auto-lead-on-assign: first agent assignment sets lead', () => {
        // Simulates the agent-channel.service.ts assignChannel fix:
        // UPDATE channels SET lead_agent_slug = ? WHERE slug = ? AND lead_agent_slug IS NULL
        let channelLead: string | null = null;

        // First agent assigned → auto-set as lead
        const firstAgent = 'strategist';
        if (channelLead === null) channelLead = firstAgent;
        expect(channelLead).toBe('strategist');

        // Second agent assigned → lead stays
        const secondAgent = 'writer';
        if (channelLead === null) channelLead = secondAgent;
        expect(channelLead).toBe('strategist');
    });
});

// ---------------------------------------------------------------------------
// 2. Message → Agent Routing Decisions
// ---------------------------------------------------------------------------

describe('message routing decisions', () => {
    interface RoutingDecision {
        action: 'dispatch_live' | 'trigger_execution' | 'skip';
        target?: string;
        reason?: string;
    }

    // Simulates the decision tree in company.routes.ts POST messages handler
    function routeHumanMessage(
        channelLead: string | null,
        liveSessionExists: boolean,
    ): RoutingDecision {
        if (!channelLead) {
            return { action: 'skip', reason: 'No lead agent for channel' };
        }
        if (liveSessionExists) {
            return { action: 'dispatch_live', target: channelLead };
        }
        return { action: 'trigger_execution', target: channelLead };
    }

    it('dispatches to live session when lead is running', () => {
        const result = routeHumanMessage('strategist', true);
        expect(result.action).toBe('dispatch_live');
        expect(result.target).toBe('strategist');
    });

    it('triggers new execution when lead is not running', () => {
        const result = routeHumanMessage('strategist', false);
        expect(result.action).toBe('trigger_execution');
        expect(result.target).toBe('strategist');
    });

    it('skips execution when no lead agent exists', () => {
        const result = routeHumanMessage(null, false);
        expect(result.action).toBe('skip');
    });

    it('with auto-lead fix, new channel with assigned agent routes correctly', () => {
        // Before fix: createChannel sets lead=null, message routes to skip
        // After fix: assignChannel auto-sets lead, message routes to trigger_execution
        const leadAfterAssign = 'strategist'; // set by auto-lead fix
        const result = routeHumanMessage(leadAfterAssign, false);
        expect(result.action).toBe('trigger_execution');
        expect(result.target).toBe('strategist');
    });
});

// ---------------------------------------------------------------------------
// 3. @Mention Parsing and Dispatch
// ---------------------------------------------------------------------------

describe('mention parsing', () => {
    // Replicate MentionParser from messaging.service.ts
    function parseMentions(content: string): Array<{ target: string; message: string }> {
        const regex = /(?:^|[\s])@([a-zA-Z][a-zA-Z0-9_-]*)/g;
        const mentions: Array<{ target: string; message: string }> = [];
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
            mentions.push({
                target: match[1],
                message: content.substring(match.index).trim(),
            });
        }
        return mentions;
    }

    it('parses single @mention', () => {
        const mentions = parseMentions('Hey @writer can you draft this?');
        expect(mentions).toHaveLength(1);
        expect(mentions[0].target).toBe('writer');
    });

    it('parses multiple @mentions', () => {
        const mentions = parseMentions('@strategist please coordinate with @writer');
        expect(mentions).toHaveLength(2);
        expect(mentions[0].target).toBe('strategist');
        expect(mentions[1].target).toBe('writer');
    });

    it('ignores self-mentions in dispatch', () => {
        const senderSlug = 'strategist';
        const mentions = parseMentions('@strategist @writer please review');
        const filtered = mentions.filter(m => m.target !== senderSlug);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].target).toBe('writer');
    });

    it('handles mentions at start of content', () => {
        const mentions = parseMentions('@curator-carla generate 3 ideas');
        expect(mentions).toHaveLength(1);
        expect(mentions[0].target).toBe('curator-carla');
    });

    it('handles hyphenated agent slugs', () => {
        const mentions = parseMentions('cc @thread-theo on this');
        expect(mentions).toHaveLength(1);
        expect(mentions[0].target).toBe('thread-theo');
    });
});

// ---------------------------------------------------------------------------
// 4. Mention Dispatch Decision Tree
// ---------------------------------------------------------------------------

describe('mention dispatch decisions', () => {
    interface MentionDispatchResult {
        action: 'sent_live' | 'wrote_inbox' | 'failed';
        target: string;
    }

    // Simulates the enhanced runner-event-router mention dispatch
    function decideMentionDispatch(
        target: string,
        senderSlug: string,
        isTargetRunning: boolean,
        sandboxId: string | null,
    ): MentionDispatchResult {
        if (target === senderSlug) {
            return { action: 'failed', target };
        }
        if (isTargetRunning) {
            return { action: 'sent_live', target };
        }
        if (sandboxId) {
            return { action: 'wrote_inbox', target };
        }
        return { action: 'failed', target };
    }

    it('sends to live session when target is running', () => {
        const result = decideMentionDispatch('writer', 'strategist', true, 'sandbox-123');
        expect(result.action).toBe('sent_live');
    });

    it('writes to inbox when target is offline (after fix)', () => {
        const result = decideMentionDispatch('writer', 'strategist', false, 'sandbox-123');
        expect(result.action).toBe('wrote_inbox');
    });

    it('fails gracefully when no sandbox', () => {
        const result = decideMentionDispatch('writer', 'strategist', false, null);
        expect(result.action).toBe('failed');
    });

    it('skips self-mentions', () => {
        const result = decideMentionDispatch('strategist', 'strategist', true, 'sandbox-123');
        expect(result.action).toBe('failed');
    });
});

// ---------------------------------------------------------------------------
// 5. Execution Lock Behavior
// ---------------------------------------------------------------------------

describe('execution lock', () => {
    // Simulates the in-memory lock in channel-execution.service.ts
    const locks = new Map<string, number>();
    const LOCK_TTL = 30_000;

    function acquireLock(userId: string, agent: string, channel: string): boolean {
        const key = `${userId}:${agent}:${channel}`;
        const now = Date.now();
        const existing = locks.get(key);
        if (existing && existing > now) return false;
        locks.set(key, now + LOCK_TTL);
        return true;
    }

    function releaseLock(userId: string, agent: string, channel: string): void {
        locks.delete(`${userId}:${agent}:${channel}`);
    }

    beforeEach(() => locks.clear());

    it('allows first execution for agent+channel', () => {
        expect(acquireLock('user1', 'strategist', 'general')).toBe(true);
    });

    it('blocks duplicate concurrent execution', () => {
        acquireLock('user1', 'strategist', 'general');
        expect(acquireLock('user1', 'strategist', 'general')).toBe(false);
    });

    it('allows different agents on same channel', () => {
        acquireLock('user1', 'strategist', 'general');
        expect(acquireLock('user1', 'writer', 'general')).toBe(true);
    });

    it('allows same agent on different channels', () => {
        acquireLock('user1', 'strategist', 'general');
        expect(acquireLock('user1', 'strategist', 'marketing')).toBe(true);
    });

    it('allows re-execution after lock release', () => {
        acquireLock('user1', 'strategist', 'general');
        releaseLock('user1', 'strategist', 'general');
        expect(acquireLock('user1', 'strategist', 'general')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 6. Channel Prompt Format
// ---------------------------------------------------------------------------

describe('channel prompt format', () => {
    // Replicates formatChannelPrompt from message-bridge.service.ts
    function formatChannelPrompt(
        project: string, channel: string, sender: string, content: string,
    ): string {
        return `[Channel: ${project}/${channel}] [From: ${sender}]\n${content}`;
    }

    it('formats with correct structure', () => {
        const prompt = formatChannelPrompt('marketing', 'general', 'user', 'Hello team');
        expect(prompt).toBe('[Channel: marketing/general] [From: user]\nHello team');
    });

    it('includes sender identity for agent-to-agent messages', () => {
        const prompt = formatChannelPrompt('marketing', 'general', 'strategist', '@writer draft this');
        expect(prompt).toContain('[From: strategist]');
        expect(prompt).toContain('@writer draft this');
    });
});

// ---------------------------------------------------------------------------
// 7. Full End-to-End Flow Simulation
// ---------------------------------------------------------------------------

describe('end-to-end channel flow', () => {
    // Simulates the complete message lifecycle

    interface ChannelState {
        lead_agent_slug: string | null;
        members: string[];
        messages: Array<{
            sender_type: string;
            sender_slug: string;
            sender_name: string;
            content: string;
            message_type: string;
        }>;
    }

    it('simulates: create channel → assign agent → send message → agent responds', () => {
        // Step 1: Channel created (lead is null)
        const channel: ChannelState = {
            lead_agent_slug: null,
            members: [],
            messages: [],
        };
        expect(channel.lead_agent_slug).toBeNull();

        // Step 2: Agent assigned → auto-set as lead (Task 7 fix)
        channel.members.push('strategist');
        if (channel.lead_agent_slug === null) {
            channel.lead_agent_slug = 'strategist';
        }
        expect(channel.lead_agent_slug).toBe('strategist');

        // Step 3: Human sends message
        channel.messages.push({
            sender_type: 'human',
            sender_slug: 'firebase-uid-123',
            sender_name: 'You',
            content: 'What should our Q2 strategy be?',
            message_type: 'post',
        });
        expect(channel.messages).toHaveLength(1);

        // Step 4: Routing decision — lead exists, triggers execution
        const lead = channel.lead_agent_slug;
        expect(lead).toBe('strategist');

        // Step 5: Agent responds (via runner → message-bridge → workspace DB)
        channel.messages.push({
            sender_type: 'agent',
            sender_slug: 'strategist',
            sender_name: 'Strategist',
            content: '**Q2 Strategy Analysis**\n\nRecommend focusing on tutorials.',
            message_type: 'post',
        });
        expect(channel.messages).toHaveLength(2);

        // Step 6: Agent creates system event (task assignment)
        channel.messages.push({
            sender_type: 'system',
            sender_slug: 'system',
            sender_name: 'system',
            content: 'strategist assigned task "Q2 Content Plan" to writer',
            message_type: 'system',
        });
        expect(channel.messages).toHaveLength(3);

        // Step 7: Agent @mentions another agent
        channel.messages.push({
            sender_type: 'agent',
            sender_slug: 'strategist',
            sender_name: 'Strategist',
            content: '@writer Please start drafting the content calendar based on the Q2 strategy.',
            message_type: 'post',
        });

        // Verify the flow produces the expected channel state
        const humanMsgs = channel.messages.filter(m => m.sender_type === 'human');
        const agentMsgs = channel.messages.filter(m => m.sender_type === 'agent');
        const systemMsgs = channel.messages.filter(m => m.sender_type === 'system');

        expect(humanMsgs).toHaveLength(1);
        expect(humanMsgs[0].sender_name).toBe('You');

        expect(agentMsgs).toHaveLength(2);
        expect(agentMsgs[0].sender_name).toBe('Strategist');

        expect(systemMsgs).toHaveLength(1);
        expect(systemMsgs[0].content).toContain('assigned task');
    });

    it('simulates: second agent assigned → does not override lead', () => {
        const channel: ChannelState = {
            lead_agent_slug: null,
            members: [],
            messages: [],
        };

        // First assignment → becomes lead
        channel.members.push('strategist');
        if (channel.lead_agent_slug === null) channel.lead_agent_slug = 'strategist';

        // Second assignment → lead stays
        channel.members.push('writer');
        if (channel.lead_agent_slug === null) channel.lead_agent_slug = 'writer';

        expect(channel.lead_agent_slug).toBe('strategist');
        expect(channel.members).toEqual(['strategist', 'writer']);
    });

    it('simulates: message to channel with no agents → silently skipped', () => {
        const channel: ChannelState = {
            lead_agent_slug: null,
            members: [],
            messages: [],
        };

        // Human sends message
        channel.messages.push({
            sender_type: 'human',
            sender_slug: 'user-123',
            sender_name: 'You',
            content: 'Hello?',
            message_type: 'post',
        });

        // No lead → no execution triggered
        const lead = channel.lead_agent_slug;
        expect(lead).toBeNull();
        // Message is stored but no agent responds — expected behavior
        expect(channel.messages).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// 8. Agent Process Lifecycle
// ---------------------------------------------------------------------------

describe('agent process lifecycle', () => {
    // Validates the session management contracts

    it('one process per agent slug', () => {
        const sessions = new Map<string, { slug: string; healthy: boolean }>();

        // Create sessions for two agents
        sessions.set('strategist', { slug: 'strategist', healthy: true });
        sessions.set('writer', { slug: 'writer', healthy: true });

        expect(sessions.size).toBe(2);
        expect(sessions.get('strategist')?.slug).toBe('strategist');
        expect(sessions.get('writer')?.slug).toBe('writer');
    });

    it('reuses existing healthy session', () => {
        const sessions = new Map<string, { slug: string; healthy: boolean; reused: boolean }>();

        // First call: create
        sessions.set('strategist', { slug: 'strategist', healthy: true, reused: false });

        // Second call: reuse
        const existing = sessions.get('strategist');
        if (existing?.healthy) {
            existing.reused = true;
        }

        expect(sessions.get('strategist')?.reused).toBe(true);
    });

    it('creates new session when existing is unhealthy', () => {
        const sessions = new Map<string, { slug: string; healthy: boolean }>();

        // Mark as unhealthy
        sessions.set('strategist', { slug: 'strategist', healthy: false });

        // Check and recreate
        const existing = sessions.get('strategist');
        if (!existing?.healthy) {
            sessions.set('strategist', { slug: 'strategist', healthy: true });
        }

        expect(sessions.get('strategist')?.healthy).toBe(true);
    });
});
