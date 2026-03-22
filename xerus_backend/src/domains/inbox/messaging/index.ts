// Messaging Module - Public API

export {
    MentionParser,
    MessageRouter,
    MessageRouterDeps,
    ParsedMention,
    InboxMessage,
    RouteResult,
    AgentInfo,
    MessagingWorkspaceWriter,
    AgentResolver,
    UnknownAgentError,
    createMentionParser,
    createMessageRouter,
} from './messaging.service';

// Message Bridge (v2 bidirectional routing)
export {
    MessageBridgeService,
    MessageBridgeDeps,
    ChannelNotFoundError,
    ChannelNotFoundByIdError,
    NoChannelLeadError,
    createMessageBridgeService,
} from './message-bridge.service';
export {
    MessageBridgeRepository,
    MessageBridgeDatabase,
    MessageBridgeQueryResult,
    InsertMessageInput,
    ChannelLookupRow,
} from './message-bridge.repository';
export type {
    ChannelMessageRow,
    SenderType,
    MessageType,
    OutboundMessage,
    StoreMessageResult,
    InboundMessage,
    RunnerCommand,
    QueryMessagesOptions,
} from './message-bridge.types';
export {
    SENDER_TYPES,
    MESSAGE_TYPES,
    DEFAULT_MESSAGE_LIMIT,
    MAX_MESSAGE_LIMIT,
} from './message-bridge.types';
