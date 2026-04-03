// Message Bridge Service
// Bidirectional message routing: runner <-> backend <-> frontend
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 4, Section 10
//
// Three flows:
// 1. OUTBOUND: agent posts in channel -> backend stores in DB -> push to frontend
// 2. INBOUND: human sends message -> backend stores in DB -> forward to runner
// 3. @MENTION ROUTING: handled by runner ChannelWatcher (file-based, not in this service)

import type {
    OutboundMessage,
    StoreMessageResult,
    InboundMessage,
    RunnerCommand,
    ChannelMessageRow,
    QueryMessagesOptions,
    SessionDispatcher,
} from './message-bridge.types';
import {
    MessageBridgeRepository,
} from './message-bridge.repository';

// -----------------------------------------------------------------------------
// Runner Session Handle (minimal interface to avoid circular import)
// -----------------------------------------------------------------------------

export interface RunnerSessionHandle {
    sendInput(data: string): Promise<void>;
}

// -----------------------------------------------------------------------------
// Dependencies
// -----------------------------------------------------------------------------

export interface MessageBridgeDeps {
    repository: MessageBridgeRepository;
    sessionDispatcher?: SessionDispatcher | null;
}

// -----------------------------------------------------------------------------
// Message Bridge Service
// -----------------------------------------------------------------------------

export class MessageBridgeService {
    private readonly repository: MessageBridgeRepository;
    private sessionDispatcher: SessionDispatcher | null;

    constructor(deps: MessageBridgeDeps) {
        this.repository = deps.repository;
        this.sessionDispatcher = deps.sessionDispatcher ?? null;
    }

    setSessionDispatcher(dispatcher: SessionDispatcher): void {
        this.sessionDispatcher = dispatcher;
    }

    // -------------------------------------------------------------------------
    // OUTBOUND: Runner -> Backend -> Frontend
    // Called when backend receives agent_message event from runner stdout
    // -------------------------------------------------------------------------

    async handleOutboundMessage(
        userId: string,
        message: OutboundMessage
    ): Promise<StoreMessageResult> {
        // Resolve channel from project + channel slug
        const channel = await this.repository.findChannelByProjectAndSlug(
            userId,
            message.project,
            message.channel
        );

        if (!channel) {
            throw new ChannelNotFoundError(message.project, message.channel);
        }

        // Store in DB
        const row = await this.repository.insertMessage({
            channel_id: channel.id,
            sender_type: 'agent',
            sender_slug: message.agent_slug,
            content: message.content,
            message_type: message.message_type || 'chat',
            metadata: message.metadata,
        });

        return {
            message_id: row.id,
            channel_id: channel.id,
        };
    }

    // -------------------------------------------------------------------------
    // INBOUND: Frontend -> Backend -> Runner
    // Called when human sends a message from the frontend
    // Returns the runner command to send via sendSessionCommandInput()
    // -------------------------------------------------------------------------

    async handleInboundMessage(
        message: InboundMessage
    ): Promise<{ stored: ChannelMessageRow; command: RunnerCommand }> {
        // Resolve channel
        const channel = await this.repository.findChannelById(message.channel_id);

        if (!channel) {
            throw new ChannelNotFoundByIdError(message.channel_id);
        }

        // Store human message in DB
        const stored = await this.repository.insertMessage({
            channel_id: message.channel_id,
            sender_type: 'human',
            sender_slug: 'user',
            content: message.content,
            message_type: 'chat',
        });

        // Determine target agent: explicit @mention or channel lead
        const targetAgent = message.target_agent
            || await this.repository.findChannelLead(message.channel_id);

        if (!targetAgent) {
            throw new NoChannelLeadError(message.channel_id);
        }

        // Build runner command
        const command: RunnerCommand = {
            cmd: 'message',
            agent: targetAgent,
            content: message.content,
            sender: 'user',
            channel: channel.slug,
            project: channel.domain_slug,
        };

        return { stored, command };
    }

    // -------------------------------------------------------------------------
    // Forward to Runner: send inbound message to agent's persistent CLI stdin
    // Two modes:
    //   1. forwardToRunner(command, handle) - caller provides the SessionHandle directly
    //   2. dispatchInbound(message) - uses injected SessionDispatcher to resolve handle
    // -------------------------------------------------------------------------

    async forwardToRunner(
        command: RunnerCommand,
        handle: RunnerSessionHandle,
    ): Promise<void> {
        const prompt = formatChannelPrompt(command.project, command.channel, command.sender, command.content);
        await handle.sendInput(prompt + '\n');
    }

    /**
     * Full inbound flow: store message in DB, resolve target agent, dispatch to Daytona session.
     * Returns the stored message and whether dispatch succeeded.
     * Dispatch failure is non-fatal (agent may not be running yet).
     */
    async dispatchInbound(
        message: InboundMessage,
    ): Promise<{ stored: ChannelMessageRow; command: RunnerCommand; dispatched: boolean }> {
        const { stored, command } = await this.handleInboundMessage(message);

        let dispatched = false;
        if (this.sessionDispatcher) {
            const prompt = formatChannelPrompt(command.project, command.channel, command.sender, command.content);
            dispatched = await this.sessionDispatcher.sendToAgent(message.user_id, command.agent, prompt);
        }

        return { stored, command, dispatched };
    }

    /**
     * Dispatch an @mention from one agent to another agent's Daytona session.
     * Used by runner-event-router when an agent_message contains @mentions.
     * Returns true if the message was dispatched to the target agent's session.
     */
    async dispatchMention(
        userId: string,
        fromAgent: string,
        toAgent: string,
        content: string,
        project: string,
        channel: string,
    ): Promise<boolean> {
        if (!this.sessionDispatcher) {
            return false;
        }

        const prompt = formatChannelPrompt(project, channel, fromAgent, content);
        return this.sessionDispatcher.sendToAgent(userId, toAgent, prompt);
    }

    // -------------------------------------------------------------------------
    // Query Messages (for frontend rendering)
    // -------------------------------------------------------------------------

    async queryMessages(options: QueryMessagesOptions): Promise<ChannelMessageRow[]> {
        return this.repository.queryMessages(options);
    }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatChannelPrompt(project: string, channel: string, sender: string, content: string): string {
    return `[Channel: ${project}/${channel}] [From: ${sender}]\n${content}`;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class ChannelNotFoundError extends Error {
    constructor(
        public readonly project: string,
        public readonly channel: string
    ) {
        super(`Channel not found: ${project}/${channel}`);
        this.name = 'ChannelNotFoundError';
    }
}

export class ChannelNotFoundByIdError extends Error {
    constructor(public readonly channelId: string) {
        super(`Channel not found by ID: ${channelId}`);
        this.name = 'ChannelNotFoundByIdError';
    }
}

export class NoChannelLeadError extends Error {
    constructor(public readonly channelId: string) {
        super(`No lead agent found for channel: ${channelId}`);
        this.name = 'NoChannelLeadError';
    }
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

export function createMessageBridgeService(deps: MessageBridgeDeps): MessageBridgeService {
    return new MessageBridgeService(deps);
}
