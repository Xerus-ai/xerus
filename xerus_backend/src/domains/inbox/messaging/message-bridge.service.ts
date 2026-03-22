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
} from './message-bridge.types';
import {
    MessageBridgeRepository,
} from './message-bridge.repository';

// -----------------------------------------------------------------------------
// Dependencies
// -----------------------------------------------------------------------------

export interface MessageBridgeDeps {
    repository: MessageBridgeRepository;
}

// -----------------------------------------------------------------------------
// Message Bridge Service
// -----------------------------------------------------------------------------

export class MessageBridgeService {
    private readonly repository: MessageBridgeRepository;

    constructor(deps: MessageBridgeDeps) {
        this.repository = deps.repository;
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
    // Query Messages (for frontend rendering)
    // -------------------------------------------------------------------------

    async queryMessages(options: QueryMessagesOptions): Promise<ChannelMessageRow[]> {
        return this.repository.queryMessages(options);
    }
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
