// SDK Types
// Types for Claude Agent SDK integration with OpenRouter

import { StreamEventType } from '../types';

// -----------------------------------------------------------------------------
// SDK Environment Configuration
// -----------------------------------------------------------------------------

export interface SDKEnvironment {
    ANTHROPIC_BASE_URL: string;
    ANTHROPIC_AUTH_TOKEN: string;
    ANTHROPIC_API_KEY: string;
}

// -----------------------------------------------------------------------------
// Execute Agent Options
// -----------------------------------------------------------------------------

export interface ExecuteAgentOptions {
    agentId: number;
    agentSlug: string;
    userId: string;
    sandboxId: string;
    task: string;
    systemPrompt: string;
    model: string;
    allowedTools: string[];
    workingDirectory: string;
    apiKey: string;
    maxTurns?: number;
    maxTokens?: number;
    envVars?: Record<string, string>;
    sessionId?: string;
}

// -----------------------------------------------------------------------------
// SDK Message Types (from SDK documentation)
// -----------------------------------------------------------------------------

const SDK_RESULT_SUBTYPES = ['success', 'error'] as const;

type SDKResultSubtype = (typeof SDK_RESULT_SUBTYPES)[number];

// -----------------------------------------------------------------------------
// SDK Message Structures
// -----------------------------------------------------------------------------

export interface SDKSystemMessage {
    type: 'system';
    subtype: 'init';
    session_id: string;
}

export interface SDKUserMessage {
    type: 'user';
    content: string;
}

export interface SDKAssistantContentBlock {
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
}

export interface SDKAssistantMessage {
    type: 'assistant';
    content: SDKAssistantContentBlock[];
    parent_tool_use_id?: string;
}

export interface SDKToolProgressMessage {
    type: 'tool_progress';
    tool_use_id: string;
    content: string;
}

export interface SDKUsage {
    input_tokens: number;
    output_tokens: number;
}

export interface SDKResultMessage {
    type: 'result';
    subtype: SDKResultSubtype;
    usage: SDKUsage;
    session_id: string;
    error?: string;
}

export interface SDKStreamEventMessage {
    type: 'stream_event';
    event_type: string;
    data: unknown;
}

export type SDKMessage =
    | SDKSystemMessage
    | SDKUserMessage
    | SDKAssistantMessage
    | SDKToolProgressMessage
    | SDKResultMessage
    | SDKStreamEventMessage;

// -----------------------------------------------------------------------------
// Internal Stream Event (mapped from SDK messages)
// -----------------------------------------------------------------------------

export interface SDKStreamEvent {
    type: StreamEventType;
    executionId: string;
    content?: unknown;
    meta?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Execution Result
// -----------------------------------------------------------------------------

export interface SDKExecutionResult {
    success: boolean;
    sessionId: string;
    inputTokens: number;
    outputTokens: number;
    error?: string;
    finalResponse?: string;
}

// -----------------------------------------------------------------------------
// Credit Estimation
// -----------------------------------------------------------------------------

export interface CreditEstimate {
    model: string;
    estimatedCredits: number;
    inputTokenRate: number;
    outputTokenRate: number;
}

// Model pricing loaded from model_registry table at runtime.
// pricing_input_cents / pricing_output_cents → credits per 1K tokens (cents / 100).

// -----------------------------------------------------------------------------
// Permission Mode Mapping
// -----------------------------------------------------------------------------

export const PERMISSION_MODE_MAP: Record<string, string> = {
    supervised: 'default',
    semi_autonomous: 'acceptEdits',
    autonomous: 'bypassPermissions',
};

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

export function isSDKSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
    return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init';
}

export function isSDKAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
    return msg.type === 'assistant';
}

export function isSDKToolProgressMessage(msg: SDKMessage): msg is SDKToolProgressMessage {
    return msg.type === 'tool_progress';
}

export function isSDKResultMessage(msg: SDKMessage): msg is SDKResultMessage {
    return msg.type === 'result';
}

export function isSDKStreamEventMessage(msg: SDKMessage): msg is SDKStreamEventMessage {
    return msg.type === 'stream_event';
}
