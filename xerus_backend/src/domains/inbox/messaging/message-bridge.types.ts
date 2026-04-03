// Message Bridge Types
// Types for bidirectional message routing between frontend, backend, and runner
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 4, Section 10

// -----------------------------------------------------------------------------
// Channel Message (Neon DB row)
// -----------------------------------------------------------------------------

export interface ChannelMessageRow {
    id: string;
    channel_id: string;
    sender_type: SenderType;
    sender_slug: string;
    content: string;
    message_type: MessageType;
    metadata: Record<string, unknown>;
    created_at: string;
}

export type SenderType = 'agent' | 'human' | 'system';
export type MessageType = 'chat' | 'task_update' | 'status' | 'system';

export const SENDER_TYPES: readonly SenderType[] = ['agent', 'human', 'system'] as const;
export const MESSAGE_TYPES: readonly MessageType[] = ['chat', 'task_update', 'status', 'system'] as const;

// -----------------------------------------------------------------------------
// Outbound: Runner -> Backend -> Frontend
// Agent posts in channel -> backend stores + pushes to frontend
// -----------------------------------------------------------------------------

export interface OutboundMessage {
    agent_slug: string;
    project: string;
    channel: string;
    content: string;
    message_type?: MessageType;
    metadata?: Record<string, unknown>;
}

export interface StoreMessageResult {
    message_id: string;
    channel_id: string;
}

// -----------------------------------------------------------------------------
// Inbound: Frontend -> Backend -> Runner
// Human sends message in channel -> backend forwards to runner
// -----------------------------------------------------------------------------

export interface InboundMessage {
    user_id: string;
    channel_id: string;
    content: string;
    target_agent?: string;
}

export interface RunnerCommand {
    cmd: 'message';
    agent: string;
    content: string;
    sender: 'user';
    channel: string;
    project: string;
}

// -----------------------------------------------------------------------------
// Query Options
// -----------------------------------------------------------------------------

export interface QueryMessagesOptions {
    channel_id: string;
    limit?: number;
    before?: string;
    after?: string;
    sender_type?: SenderType;
}

export const DEFAULT_MESSAGE_LIMIT = 50;
export const MAX_MESSAGE_LIMIT = 200;

// -----------------------------------------------------------------------------
// Session Dispatcher (injected from execution domain to avoid circular deps)
// Used to route inbound/mention messages to Daytona agent sessions.
// -----------------------------------------------------------------------------

export interface SessionDispatcher {
    /**
     * Send a plain text message to a specific agent's Daytona session stdin.
     * Returns true if the agent had an active session and the message was sent.
     */
    sendToAgent(userId: string, agentSlug: string, message: string): Promise<boolean>;
}
