// SDK Message Types
// Discriminated union types for messages yielded by the Claude Agent SDK query() iterator.
// These model the actual shapes the SDK emits — used by stream-parser.ts and stdout-emitter.ts for type-safe extraction.

export interface SDKSystemInitMessage {
    type: 'system';
    subtype: 'init';
    session_id: string;
    cwd: string;
    tools: string[];
    model: string;
    permissionMode: string;
}

export interface SDKResultMessage {
    type: 'result';
    subtype?: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd';
    session_id?: string;
    is_error: boolean;
    duration_ms: number;
    num_turns?: number;
    /** The final response text from the agent (canonical output) */
    result?: string;
    total_cost_usd?: number;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
}

export interface SDKContentBlock {
    type: string;
    id?: string;
    name?: string;
    input?: unknown;
    text?: string;
    thinking?: string;
    tool_use_id?: string;
    content?: string | unknown[];
    is_error?: boolean;
}

export interface SDKAssistantMessage {
    type: 'assistant';
    message?: {
        content?: SDKContentBlock[];
    };
}

export interface SDKUserMessage {
    type: 'user';
    message?: {
        content?: SDKContentBlock[];
    };
}

export type SDKStreamDelta =
    | { type: 'text_delta'; text: string }
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'input_json_delta'; partial_json: string }
    | { type: string };

export interface SDKStreamBlockStart { type: 'content_block_start'; content_block?: SDKContentBlock; index?: number }
export interface SDKStreamBlockDelta { type: 'content_block_delta'; delta?: SDKStreamDelta; index?: number }
export interface SDKStreamBlockStop { type: 'content_block_stop'; index?: number }
export interface SDKStreamMessageStart { type: 'message_start'; message?: unknown }
export interface SDKStreamMessageDelta { type: 'message_delta'; delta?: unknown }
export interface SDKStreamMessageStop { type: 'message_stop' }
export interface SDKStreamOther { type: string; [key: string]: unknown }

export type SDKStreamEventPayload =
    | SDKStreamBlockStart
    | SDKStreamBlockDelta
    | SDKStreamBlockStop
    | SDKStreamMessageStart
    | SDKStreamMessageDelta
    | SDKStreamMessageStop;

export interface SDKStreamEventMessage {
    type: 'stream_event';
    event?: SDKStreamEventPayload;
    session_id?: string;
}

export type SDKMessage =
    | SDKSystemInitMessage
    | SDKResultMessage
    | SDKAssistantMessage
    | SDKUserMessage
    | SDKStreamEventMessage;

export function isSDKMessage(value: unknown): value is SDKMessage {
    return typeof value === 'object' && value !== null
        && 'type' in value && typeof (value as Record<string, unknown>).type === 'string';
}
