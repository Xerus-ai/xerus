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

// Message Bridge (v2 bidirectional routing — workspace-DB backed)
export {
    MessageBridgeService,
    ChannelNotFoundError,
    ChannelNotFoundBySlugError,
    NoChannelLeadError,
    createMessageBridgeService,
} from './message-bridge.service';
export type { RunnerSessionHandle } from './message-bridge.service';
export {
    insertChannelMessage,
    queryChannelMessages,
    findChannelByProjectAndSlug,
    findChannelBySlug,
    findChannelLead,
} from './message-bridge.repository';
export type {
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
    SessionDispatcher,
} from './message-bridge.types';
export {
    SENDER_TYPES,
    MESSAGE_TYPES,
    DEFAULT_MESSAGE_LIMIT,
    MAX_MESSAGE_LIMIT,
} from './message-bridge.types';
