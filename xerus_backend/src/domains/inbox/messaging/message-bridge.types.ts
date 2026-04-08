// Message Bridge Types
// Types for bidirectional message routing between frontend, backend, and runner
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 4, Section 10
// Migrated from Neon to workspace-DB: uses slug-based channel identification.

// -----------------------------------------------------------------------------
// Channel Message (workspace-DB row)
// -----------------------------------------------------------------------------

export interface ChannelMessageRow {
    id: string;
    channel_slug: string;
    sender_type: SenderType;
    sender_slug: string;
    content: string;
    message_type: MessageType;
    metadata: Record<string, unknown>;
    created_at: string;
}

export type SenderType = 'agent' | 'human' | 'system';
// Workspace DB schema: CHECK(message_type IN ('post', 'coordination', 'system'))
export type MessageType = 'post' | 'coordination' | 'system';

// Runner events may use these legacy types — map to workspace DB types via toDbMessageType()
export type RunnerMessageType = 'chat' | 'task_update' | 'status' | 'system' | 'post' | 'coordination';

export const SENDER_TYPES: readonly SenderType[] = ['agent', 'human', 'system'] as const;
export const MESSAGE_TYPES: readonly MessageType[] = ['post', 'coordination', 'system'] as const;

/** Map runner/API message types to workspace DB CHECK-constraint-safe values */
export function toDbMessageType(type: string | undefined): MessageType {
    switch (type) {
        case 'system': return 'system';
        case 'coordination': return 'coordination';
        case 'post':
        case 'chat':
        case 'task_update':
        case 'status':
        default: return 'post';
    }
}

// -----------------------------------------------------------------------------
// Outbound: Runner -> Backend -> Frontend
// Agent posts in channel -> backend stores + pushes to frontend
// -----------------------------------------------------------------------------

export interface OutboundMessage {
    agent_slug: string;
    project: string;
    channel: string;
    content: string;
    message_type?: RunnerMessageType | MessageType | string;
    metadata?: Record<string, unknown>;
}

export interface StoreMessageResult {
    message_id: string;
    channel_slug: string;
}

// -----------------------------------------------------------------------------
// Inbound: Frontend -> Backend -> Runner
// Human sends message in channel -> backend forwards to runner
// -----------------------------------------------------------------------------

export interface InboundMessage {
    user_id: string;
    channel_slug: string;
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
    channel_slug: string;
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
